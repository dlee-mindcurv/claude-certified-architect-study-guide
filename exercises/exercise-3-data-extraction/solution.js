/**
 * Exercise 3 — SOLUTION: Build a Structured Data Extraction Pipeline
 *
 * Domains: D4 (Prompt Engineering), D5 (Context Management)
 *
 * Complete working implementation of the extraction pipeline.
 * Run with: node exercises/exercise-3-data-extraction/solution.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { documentExtractionTool, batchResultSchema } from '../../shared/schemas/extraction-output.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_VALIDATION_RETRIES = 3;

// ─── Step 1: Extraction Tool with JSON Schema ──────────────────────────────
//
// Schema design principles demonstrated in documentExtractionTool:
//
// - ["string", "null"] types: Documents may not contain every field. Using nullable
//   types lets the model explicitly indicate "not found" rather than fabricating.
//
// - Enum with "other" + detail field: Covers known categories while allowing
//   extensibility. The detail field captures specifics when "other" is selected.
//
// - conflict_detected: Enables self-validation. The model calculates totals
//   independently and flags discrepancies with stated values.
//
// - field_confidence required: Every extraction must declare certainty levels,
//   enabling downstream routing (auto-approve, review, reject).

// ─── Step 2: Validation-Retry Loop ─────────────────────────────────────────

/**
 * Validate extraction results against business rules.
 */
function validateExtraction(extraction) {
  const errors = [];

  // 1. document_type must be present
  if (!extraction.document_type) {
    errors.push('document_type is required and must not be empty');
  }

  // 2. field_confidence must be present with at least one entry
  if (!extraction.field_confidence || Object.keys(extraction.field_confidence).length === 0) {
    errors.push('field_confidence is required and must contain at least one field score');
  }

  // 3. All confidence values must be between 0 and 1
  for (const [field, score] of Object.entries(extraction.field_confidence || {})) {
    if (typeof score !== 'number' || score < 0 || score > 1) {
      errors.push(`field_confidence.${field} must be a number between 0 and 1, got: ${score}`);
    }
  }

  // 4. Monetary values: stated_value must be positive
  for (const mv of extraction.monetary_values || []) {
    if (typeof mv.stated_value !== 'number' || mv.stated_value < 0) {
      errors.push(`monetary_value "${mv.label}": stated_value must be a non-negative number`);
    }
  }

  // 5. If conflict_detected, both stated and calculated values must be present
  for (const mv of extraction.monetary_values || []) {
    if (mv.conflict_detected && (mv.calculated_value === null || mv.calculated_value === undefined)) {
      errors.push(
        `monetary_value "${mv.label}": conflict_detected is true but calculated_value is missing`
      );
    }
  }

  // 6. If document_type is "other", document_type_detail must be provided
  if (extraction.document_type === 'other' && !extraction.document_type_detail) {
    errors.push('document_type_detail is required when document_type is "other"');
  }

  return errors;
}

/**
 * Extract structured data from a document with validation-retry loop.
 */
async function extractWithValidation(documentContent, documentId) {
  let attempt = 0;
  let lastErrors = [];
  let previousExtraction = null;

  while (attempt < MAX_VALIDATION_RETRIES) {
    attempt++;
    console.log(`  Extraction attempt ${attempt}/${MAX_VALIDATION_RETRIES}...`);

    // Build the messages array
    const messages = [];

    if (attempt === 1) {
      // First attempt: just the document
      messages.push({
        role: 'user',
        content:
          `Extract structured information from this document.\n\n` +
          `Document ID: ${documentId}\n\n---\n${documentContent}\n---`,
      });
    } else {
      // Retry: include original request, previous result, and error feedback
      messages.push({
        role: 'user',
        content:
          `Extract structured information from this document.\n\n` +
          `Document ID: ${documentId}\n\n---\n${documentContent}\n---`,
      });
      messages.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: `retry_${attempt}`,
            name: 'extract_document_info',
            input: previousExtraction,
          },
        ],
      });
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: `retry_${attempt}`,
            content:
              `Validation failed with these errors. Please fix and re-extract:\n` +
              lastErrors.map((e, i) => `${i + 1}. ${e}`).join('\n'),
            is_error: true,
          },
        ],
      });
    }

    // Call the Claude API with forced tool use
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildExtractionSystemPrompt(),
      tools: [documentExtractionTool],
      tool_choice: { type: 'tool', name: 'extract_document_info' },
      messages,
    });

    // Extract the tool result
    const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolUseBlock) {
      lastErrors = ['Model did not return a tool_use block'];
      continue;
    }

    const extraction = toolUseBlock.input;
    previousExtraction = extraction;

    // Validate
    const errors = validateExtraction(extraction);

    if (errors.length === 0) {
      console.log(`  Validation passed on attempt ${attempt}`);
      return { status: 'success', extraction, attempts: attempt };
    }

    console.log(`  Validation failed (${errors.length} errors): ${errors[0]}...`);
    lastErrors = errors;

    if (attempt >= MAX_VALIDATION_RETRIES) {
      console.log(`  Max retries reached — returning partial result`);
      return { status: 'partial', extraction, errors, attempts: attempt };
    }
  }

  return { status: 'failed', errors: lastErrors, attempts: attempt };
}

// ─── Step 3: Few-Shot Examples ──────────────────────────────────────────────

function buildExtractionSystemPrompt() {
  return `You are a document extraction specialist. Extract structured data from documents using the extract_document_info tool.

## Rules
- Return null for fields not found in the document — never fabricate values
- Include confidence scores for every extracted field
- Flag conflicts between stated and calculated values using conflict_detected
- Use ISO 8601 format for all dates (YYYY-MM-DD)
- When a value is clearly stated in the document, confidence should be 0.95-1.0
- When a value is inferred or partially visible, confidence should be 0.7-0.9
- When a value is ambiguous, confidence should be below 0.7

## Example 1: Invoice Extraction

Given an invoice with line items, extract:
- document_type: "invoice"
- entities: vendor (role: "vendor"), bill-to party (role: "client")
- monetary_values: each line item, subtotal, tax, total
  - Calculate the total independently from line items
  - If your calculated total differs from the stated total, set conflict_detected: true
- key_dates: invoice date, due date
- field_confidence: { "invoice_number": 1.0, "vendor": 0.95, "total": 1.0, ... }

Example output for a simple invoice:
{
  "document_id": "inv-001",
  "document_type": "invoice",
  "title": "Invoice #1234",
  "entities": [
    { "name": "Acme Corp", "role": "vendor", "role_detail": null },
    { "name": "Widget Inc", "role": "client", "role_detail": null }
  ],
  "monetary_values": [
    { "label": "Subtotal", "stated_value": 500.00, "calculated_value": 500.00, "currency": "USD", "conflict_detected": false },
    { "label": "Tax", "stated_value": 40.00, "calculated_value": 40.00, "currency": "USD", "conflict_detected": false },
    { "label": "Total", "stated_value": 540.00, "calculated_value": 540.00, "currency": "USD", "conflict_detected": false }
  ],
  "key_dates": [
    { "label": "Invoice Date", "date": "2025-01-15" },
    { "label": "Due Date", "date": "2025-02-14" }
  ],
  "field_confidence": {
    "invoice_number": 1.0, "vendor": 0.95, "client": 0.95,
    "subtotal": 1.0, "tax": 1.0, "total": 1.0,
    "invoice_date": 1.0, "due_date": 1.0
  },
  "extraction_notes": null
}

## Example 2: Research Paper Extraction

Given a research paper abstract, extract:
- document_type: "research_paper"
- title, author (first author), date (publication date)
- entities: all authors (role: "author"), journal (role: "other", role_detail: "publisher")
- key_dates: published date, received date, accepted date
- extraction_notes: note key statistics from abstract (these are informational, not monetary)

## Example 3: Contract Extraction

Given a contract, extract:
- document_type: "contract"
- entities: all parties with their roles (role: "party")
- monetary_values: fees, penalties, commitments
  - Include both recurring (monthly) and total (annual) amounts
- key_dates: effective date, term end date, notice deadlines
- extraction_notes: note any auto-renewal clauses or termination conditions`;
}

// ─── Step 4: Batch Processing ───────────────────────────────────────────────

function buildBatchRequests(documents) {
  const systemPrompt = buildExtractionSystemPrompt();

  return documents.map((doc) => ({
    custom_id: doc.id,
    params: {
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [documentExtractionTool],
      tool_choice: { type: 'tool', name: 'extract_document_info' },
      messages: [
        {
          role: 'user',
          content:
            `Extract structured information from this document.\n\n` +
            `Document ID: ${doc.id}\n\n---\n${doc.content}\n---`,
        },
      ],
    },
  }));
}

async function processBatch(batchRequests) {
  console.log(`  Batch contains ${batchRequests.length} requests:`);
  for (const req of batchRequests) {
    console.log(`    - ${req.custom_id}`);
  }

  // In production, you would use:
  // const batch = await client.batches.create({ requests: batchRequests });
  // Then poll: batch = await client.batches.retrieve(batch.id);
  // Results come back correlated by custom_id.

  console.log('\n  Note: Batch API submission requires the Batches API endpoint.');
  console.log('  In production, use client.batches.create() to submit and');
  console.log('  client.batches.retrieve() to poll for results.');
  console.log('  Each result includes the custom_id for correlation.\n');

  // Simulate batch results
  return batchRequests.map((r) => ({
    custom_id: r.custom_id,
    document_id: r.custom_id,
    status: 'simulated',
  }));
}

// ─── Step 5: Human Review Routing ───────────────────────────────────────────

function routeForReview(extraction) {
  const confidenceScores = Object.values(extraction.field_confidence || {});

  if (confidenceScores.length === 0) {
    return { action: 'reject', reason: 'No confidence scores provided' };
  }

  // Check for conflicts in monetary values
  const hasConflict = (extraction.monetary_values || []).some((mv) => mv.conflict_detected);

  if (hasConflict) {
    return {
      action: 'reject',
      reason: 'Conflict detected between stated and calculated monetary values',
    };
  }

  // Find minimum confidence score
  const minConfidence = Math.min(...confidenceScores);

  if (minConfidence < 0.7) {
    const lowFields = Object.entries(extraction.field_confidence)
      .filter(([, score]) => score < 0.7)
      .map(([field, score]) => `${field} (${score})`);
    return {
      action: 'reject',
      reason: `Low confidence fields: ${lowFields.join(', ')}`,
    };
  }

  if (minConfidence < 0.9) {
    const reviewFields = Object.entries(extraction.field_confidence)
      .filter(([, score]) => score < 0.9)
      .map(([field, score]) => `${field} (${score})`);
    return {
      action: 'flag_for_review',
      reason: `Fields below auto-approve threshold: ${reviewFields.join(', ')}`,
    };
  }

  return {
    action: 'auto_approve',
    reason: `All ${confidenceScores.length} fields have confidence >= 0.9`,
  };
}

// ─── Load Sample Documents ──────────────────────────────────────────────────

function loadSampleDocuments() {
  const sampleDir = join(__dirname, 'sample-documents');
  return [
    {
      id: 'invoice-sample',
      content: readFileSync(join(sampleDir, 'invoice.txt'), 'utf-8'),
    },
    {
      id: 'research-paper-sample',
      content: readFileSync(join(sampleDir, 'research-paper.txt'), 'utf-8'),
    },
    {
      id: 'contract-sample',
      content: readFileSync(join(sampleDir, 'contract.txt'), 'utf-8'),
    },
  ];
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Exercise 3 — SOLUTION: Structured Data Extraction Pipeline\n');

  const documents = loadSampleDocuments();
  console.log(`Loaded ${documents.length} sample documents.\n`);

  // Select which document to process (or all)
  const docIndex = parseInt(process.argv[2] ?? '-1', 10);
  const docsToProcess = docIndex >= 0 ? [documents[docIndex]] : documents;

  // Process each document individually with validation-retry
  for (const doc of docsToProcess) {
    console.log(`\nProcessing: ${doc.id}`);
    console.log('='.repeat(50));

    try {
      const result = await extractWithValidation(doc.content, doc.id);
      console.log(`  Status: ${result.status} (${result.attempts} attempt(s))`);

      if (result.extraction) {
        console.log(`  Document type: ${result.extraction.document_type}`);
        console.log(`  Entities: ${(result.extraction.entities || []).map((e) => e.name).join(', ')}`);
        console.log(
          `  Monetary values: ${(result.extraction.monetary_values || []).length} found`
        );
        console.log(`  Key dates: ${(result.extraction.key_dates || []).length} found`);

        const routing = routeForReview(result.extraction);
        console.log(`  Routing: ${routing.action} — ${routing.reason}`);
      }

      if (result.errors && result.errors.length > 0) {
        console.log(`  Remaining errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`  Error processing ${doc.id}: ${error.message}`);
    }
  }

  // Demonstrate batch processing
  console.log('\n\nBatch Processing Demo:');
  console.log('='.repeat(50));
  const batchRequests = buildBatchRequests(documents);
  await processBatch(batchRequests);
}

main();
