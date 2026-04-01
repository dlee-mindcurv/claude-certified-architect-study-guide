/**
 * Exercise 3 — STARTER: Build a Structured Data Extraction Pipeline
 *
 * Domains: D4 (Prompt Engineering), D5 (Context Management)
 *
 * Complete the TODOs below to build a working extraction pipeline.
 * Run with: npm run exercise:3
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
// The extraction tool is imported from shared/schemas/extraction-output.js.
// It uses tool_use to guarantee schema-compliant structured output.
//
// Review documentExtractionTool and note these schema design principles:
//
// TODO 1a: Examine the schema. Answer these questions:
//
// Q: Why are some fields typed as ["string", "null"] instead of just "string"?
// YOUR ANSWER:
//
// Q: Why does document_type include "other" in its enum, paired with document_type_detail?
// YOUR ANSWER:
//
// Q: What does the conflict_detected field in monetary_values enable?
// YOUR ANSWER:
//
// Q: Why is field_confidence required but most other fields are optional?
// YOUR ANSWER:

// ─── Step 2: Validation-Retry Loop ─────────────────────────────────────────

/**
 * Validate extraction results against business rules.
 * Returns an array of validation errors (empty = valid).
 *
 * @param {Object} extraction - The extracted data from the model
 * @returns {string[]} - Array of validation error messages
 */
function validateExtraction(extraction) {
  const errors = [];

  // TODO 2a: Implement validation checks.
  //
  // Check these business rules:
  //
  // 1. document_type must be present and not empty
  //    if (!extraction.document_type) errors.push('...')
  //
  // 2. field_confidence must be present and have at least one entry
  //    if (!extraction.field_confidence || Object.keys(extraction.field_confidence).length === 0) ...
  //
  // 3. All confidence values must be between 0 and 1
  //    for (const [field, score] of Object.entries(extraction.field_confidence || {})) ...
  //
  // 4. If monetary_values exist, check that stated_value is a positive number
  //    for (const mv of extraction.monetary_values || []) ...
  //
  // 5. If conflict_detected is true on any monetary value, it must have both
  //    stated_value and calculated_value
  //
  // 6. If document_type is "other", document_type_detail must be provided

  return errors;
}

/**
 * Extract structured data from a document with validation-retry loop.
 *
 * @param {string} documentContent - The raw document text
 * @param {string} documentId - Identifier for this document
 * @returns {Promise<Object>} - Extraction result with status
 */
async function extractWithValidation(documentContent, documentId) {
  let attempt = 0;
  let lastErrors = [];

  while (attempt < MAX_VALIDATION_RETRIES) {
    attempt++;
    console.log(`  Extraction attempt ${attempt}/${MAX_VALIDATION_RETRIES}...`);

    // TODO 2b: Build the messages array for the extraction request.
    //
    // On the first attempt, send:
    //   - System prompt with extraction instructions and few-shot examples (Step 3)
    //   - User message with the document content and document ID
    //
    // On retry attempts (attempt > 1), ALSO include:
    //   - The previous extraction result (as assistant message)
    //   - A user message listing the specific validation errors and asking the
    //     model to fix them
    //
    // Hint: Use tool_choice: { type: 'tool', name: 'extract_document_info' }
    //   to force the model to use the extraction tool (guaranteed structured output).

    const messages = [
      {
        role: 'user',
        content: `Extract structured information from this document.\n\nDocument ID: ${documentId}\n\n---\n${documentContent}\n---`,
      },
    ];

    // TODO 2c: Call the Claude API with:
    //   - model: MODEL
    //   - max_tokens: 4096
    //   - system: buildExtractionSystemPrompt() (Step 3)
    //   - tools: [documentExtractionTool]
    //   - tool_choice: { type: 'tool', name: 'extract_document_info' }
    //   - messages: messages
    //
    // const response = ???

    // TODO 2d: Extract the tool result from the response.
    // The response.content will contain a tool_use block with the extraction.
    //
    // const toolUseBlock = response.content.find(b => b.type === 'tool_use');
    // const extraction = toolUseBlock.input;

    // TODO 2e: Validate the extraction.
    // const errors = validateExtraction(extraction);
    //
    // If errors.length === 0: return { status: 'success', extraction, attempts: attempt }
    // If errors.length > 0 and attempt < MAX_VALIDATION_RETRIES:
    //   - Store errors in lastErrors for the retry prompt
    //   - Continue the loop
    // If errors.length > 0 and attempt >= MAX_VALIDATION_RETRIES:
    //   - return { status: 'partial', extraction, errors, attempts: attempt }

    break; // Remove this once implemented
  }

  return { status: 'failed', errors: lastErrors, attempts: attempt };
}

// ─── Step 3: Few-Shot Examples ──────────────────────────────────────────────

/**
 * Build the system prompt with few-shot extraction examples.
 */
function buildExtractionSystemPrompt() {
  // TODO 3: Write a system prompt that includes:
  //
  // 1. Role and task description:
  //    "You are a document extraction specialist. Extract structured data from
  //    documents using the extract_document_info tool."
  //
  // 2. Rules:
  //    - Return null for fields not found in the document (never fabricate)
  //    - Include confidence scores for every extracted field
  //    - Flag conflicts between stated and calculated values
  //    - Use ISO 8601 dates (YYYY-MM-DD)
  //
  // 3. Few-shot examples for each document type showing:
  //    - Invoice: how to extract line items, calculate totals, detect conflicts
  //    - Research paper: how to extract authors, DOI, key statistics
  //    - Contract: how to extract parties, terms, monetary values
  //
  // Each example should demonstrate:
  //    - Proper null handling for missing fields
  //    - Confidence score assignment (1.0 for clearly stated, 0.8 for inferred, etc.)
  //    - conflict_detected usage (e.g., stated total vs calculated total)
  //
  // Return the complete prompt string.

  return `You are a document extraction specialist. Extract structured data using the extract_document_info tool.

## Rules
- Return null for fields not found in the document — never fabricate values
- Include confidence scores for every extracted field
- Flag conflicts between stated and calculated values
- Use ISO 8601 format for all dates (YYYY-MM-DD)

## Examples

TODO: Add few-shot examples here for invoices, research papers, and contracts.
`;
}

// ─── Step 4: Batch Processing ───────────────────────────────────────────────

/**
 * Build batch requests for multiple documents using the Message Batches API.
 *
 * @param {Array<{id: string, content: string}>} documents - Documents to process
 * @returns {Array<Object>} - Array of batch request objects
 */
function buildBatchRequests(documents) {
  // TODO 4: Build an array of batch request objects.
  //
  // Each request should have:
  // {
  //   custom_id: document.id,   // correlates results back to source documents
  //   params: {
  //     model: MODEL,
  //     max_tokens: 4096,
  //     system: buildExtractionSystemPrompt(),
  //     tools: [documentExtractionTool],
  //     tool_choice: { type: 'tool', name: 'extract_document_info' },
  //     messages: [
  //       {
  //         role: 'user',
  //         content: `Extract structured information from this document.\n\nDocument ID: ${document.id}\n\n---\n${document.content}\n---`
  //       }
  //     ]
  //   }
  // }

  return documents.map((doc) => ({
    custom_id: doc.id,
    params: {
      model: MODEL,
      max_tokens: 4096,
      // TODO: Add system, tools, tool_choice, messages
      messages: [],
    },
  }));
}

/**
 * Submit a batch and poll for results (mock implementation).
 * In production, use client.batches.create() and poll client.batches.retrieve().
 */
async function processBatch(batchRequests) {
  // TODO 4b (Optional): Implement batch submission.
  //
  // const batch = await client.batches.create({ requests: batchRequests });
  // console.log(`Batch created: ${batch.id}`);
  //
  // Poll for completion:
  // while (batch.processing_status !== 'ended') {
  //   await new Promise(resolve => setTimeout(resolve, 5000));
  //   batch = await client.batches.retrieve(batch.id);
  // }
  //
  // Retrieve results and correlate by custom_id.

  console.log(`  Would submit batch of ${batchRequests.length} requests`);
  console.log(`  custom_ids: ${batchRequests.map((r) => r.custom_id).join(', ')}`);
  return batchRequests.map((r) => ({
    custom_id: r.custom_id,
    status: 'mock',
    message: 'Batch processing not implemented in starter',
  }));
}

// ─── Step 5: Human Review Routing ───────────────────────────────────────────

/**
 * Route an extraction result based on confidence scores.
 *
 * @param {Object} extraction - The extraction result
 * @returns {{ action: string, reason: string }}
 */
function routeForReview(extraction) {
  // TODO 5: Implement confidence-based routing.
  //
  // Rules:
  // - "auto_approve": ALL field confidence scores >= 0.9 AND no conflict_detected
  // - "flag_for_review": any field confidence < 0.9 but ALL >= 0.7, no conflicts
  // - "reject": any field confidence < 0.7 OR any conflict_detected is true
  //
  // Steps:
  // 1. Get all confidence scores from extraction.field_confidence
  // 2. Check for any conflict_detected in extraction.monetary_values
  // 3. Find the minimum confidence score
  // 4. Apply the routing rules above
  //
  // Return: { action: 'auto_approve'|'flag_for_review'|'reject', reason: '...' }

  return {
    action: 'flag_for_review',
    reason: 'TODO: implement routing logic',
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
  console.log('Exercise 3: Structured Data Extraction Pipeline');
  console.log('Complete the TODOs in this file, then run again.\n');

  const documents = loadSampleDocuments();
  console.log(`Loaded ${documents.length} sample documents.\n`);

  // Process each document individually (Step 2)
  for (const doc of documents) {
    console.log(`\nProcessing: ${doc.id}`);
    console.log('-'.repeat(40));
    const result = await extractWithValidation(doc.content, doc.id);
    console.log(`  Status: ${result.status}`);

    if (result.extraction) {
      const routing = routeForReview(result.extraction);
      console.log(`  Routing: ${routing.action} — ${routing.reason}`);
    }
  }

  // Demonstrate batch processing (Step 4)
  console.log('\n\nBatch Processing Demo:');
  console.log('-'.repeat(40));
  const batchRequests = buildBatchRequests(documents);
  await processBatch(batchRequests);
}

main();
