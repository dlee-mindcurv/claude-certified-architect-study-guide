/**
 * Exercise 3 — STARTER: Structured Data Extraction Pipeline
 *
 * Domains: D4 (Prompt Engineering), D5 (Context Management)
 *
 * Demonstrates: tool_use for structured output (4.3), validation-retry (4.4),
 * confidence-based routing (5.5).
 *
 * This exercise uses @anthropic-ai/sdk directly because it teaches
 * API-level concepts (tool_use schemas, validation loops).
 *
 * Run with: npm run exercise:3
 */

import Anthropic from '@anthropic-ai/sdk';
import { getDocumentIds, getDocument } from '../../shared/tools/extraction-tools.js';
import { metadataOutputSchema, invoiceOutputSchema } from '../../shared/tools/extraction-tools.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = 3;
const CONFIDENCE_THRESHOLD = 0.8; // below this → human review

// ─── Step 1: Define the extraction tool for tool_use ───────────────────────
//
// EXAM KEY CONCEPT (Task 4.3): Using tool_use with tool_choice forces Claude
// to return structured JSON matching your schema. This eliminates JSON
// parsing errors compared to asking for JSON in a text prompt.
//
// TODO 1: Define a tool that forces structured output:
const extractionTool = {
  name: 'extract_document',
  description: 'Extract structured data from a document. Return null for missing fields.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string' },
      document_type: { type: 'string', enum: ['invoice', 'contract', 'research_paper', 'receipt', 'other'] },
      title: { type: ['string', 'null'] },
      author: { type: ['string', 'null'] },
      date: { type: ['string', 'null'] },
      // TODO: Add fields for confidence score and key_data_points array
      // confidence: { type: 'number', minimum: 0, maximum: 1 },
      // key_data_points: { type: 'array', items: { ... } },
    },
    required: ['document_id', 'document_type'],
  },
};

// ─── Step 2: Extract with forced tool_use ──────────────────────────────────

async function extractDocument(documentId: string) {
  const doc = getDocument(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  // TODO 2: Call client.messages.create() with:
  //   model: MODEL
  //   max_tokens: 4096
  //   tools: [extractionTool]
  //   tool_choice: { type: 'tool', name: 'extract_document' }  // <-- forces tool use
  //   messages: [{ role: 'user', content: `Extract data from:\n${doc.raw}` }]
  //
  // Then extract the tool_use block from response.content:
  //   const toolUse = response.content.find(b => b.type === 'tool_use');
  //   return toolUse.input;  // the structured extraction

  return { document_id: documentId, document_type: 'other' }; // placeholder
}

// ─── Step 3: Validation-Retry Loop ─────────────────────────────────────────
//
// EXAM KEY CONCEPT (Task 4.4): Validate output, feed errors back, retry.
// But only retry if the error is fixable — missing source data is NOT retryable.

function validateExtraction(extraction: Record<string, unknown>) {
  const errors: string[] = [];

  // TODO 3: Add validation rules:
  // - confidence must be between 0 and 1
  // - document_type must not be 'other' without document_type_detail
  // - date should be ISO 8601 format if present
  // - key_data_points should have at least 1 item

  return errors; // empty = valid
}

async function extractWithRetry(documentId: string) {
  let lastErrors = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`  Attempt ${attempt}/${MAX_RETRIES}...`);

    // TODO 4: On retry, include previous errors in the prompt:
    //   "Previous extraction had errors: ${lastErrors.join(', ')}. Fix them."
    const extraction = await extractDocument(documentId);
    const errors = validateExtraction(extraction);

    if (errors.length === 0) {
      console.log('  Valid extraction!');
      return { extraction, attempts: attempt };
    }

    console.log(`  Errors: ${errors.join(', ')}`);
    lastErrors = errors;
  }

  return { extraction: null, attempts: MAX_RETRIES, failed: true };
}

// ─── Step 4: Confidence Routing ────────────────────────────────────────────
//
// EXAM KEY CONCEPT (Task 5.5): Route low-confidence extractions to humans.

function routeByConfidence(extraction: Record<string, unknown>) {
  // TODO 5: Check extraction.confidence against CONFIDENCE_THRESHOLD
  // Return { route: 'auto' | 'human_review', reason: '...' }

  return { route: 'auto', reason: 'TODO: implement routing' };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Exercise 3: Structured Data Extraction Pipeline');
  console.log('Complete the TODOs, then run again.\n');

  const docIds = getDocumentIds();
  for (const id of docIds) {
    console.log(`\nProcessing: ${id}`);
    const { extraction, attempts, failed } = await extractWithRetry(id);
    if (failed || !extraction) {
      console.log(`  FAILED after ${attempts} attempts`);
    } else {
      const routing = routeByConfidence(extraction);
      console.log(`  Route: ${routing.route} (${routing.reason})`);
    }
  }
}

main().catch(console.error);
