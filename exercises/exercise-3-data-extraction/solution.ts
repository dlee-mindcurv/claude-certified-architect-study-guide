/**
 * Exercise 3 — SOLUTION: Structured Data Extraction Pipeline
 *
 * Domains: D4 (Prompt Engineering), D5 (Context Management)
 *
 * Uses @anthropic-ai/sdk for tool_use structured output, validation-retry,
 * and confidence-based human review routing.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getDocumentIds, getDocument } from '../../shared/tools/extraction-tools.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = 3;
const CONFIDENCE_THRESHOLD = 0.8;

// ─── Extraction Tool Schema (forces structured output via tool_use) ────────

const extractionTool = {
  name: 'extract_document',
  description: 'Extract structured data from a document. Return null for missing fields, never fabricate.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string' },
      document_type: { type: 'string', enum: ['invoice', 'contract', 'research_paper', 'receipt', 'other'] },
      title: { type: ['string', 'null'] },
      author: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'ISO 8601 date' },
      confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Overall extraction confidence' },
      key_data_points: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            value: { type: ['string', 'number', 'null'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['field', 'value', 'confidence'],
        },
      },
    },
    required: ['document_id', 'document_type', 'confidence', 'key_data_points'],
  },
};

// ─── Extract with forced tool_use ──────────────────────────────────────────

async function extractDocument(documentId: string, errorFeedback: string | null = null) {
  const doc = getDocument(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  let prompt = `Extract structured data from this document:\n\n${doc.raw}`;
  if (errorFeedback) {
    prompt += `\n\nPrevious extraction had errors: ${errorFeedback}. Please fix them.`;
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [extractionTool] as Anthropic.Messages.Tool[],
    tool_choice: { type: 'tool' as const, name: 'extract_document' },
    messages: [{ role: 'user' as const, content: prompt }],
  });

  const toolUse = response.content.find((b: Anthropic.Messages.ContentBlock) => b.type === 'tool_use');
  return toolUse && 'input' in toolUse ? toolUse.input as Record<string, unknown> : {};
}

// ─── Validation ────────────────────────────────────────────────────────────

function validateExtraction(extraction: Record<string, unknown>) {
  const errors: string[] = [];

  if (typeof extraction.confidence !== 'number' || extraction.confidence < 0 || extraction.confidence > 1) {
    errors.push('confidence must be between 0 and 1');
  }
  if (extraction.document_type === 'other' && !extraction.document_type_detail) {
    errors.push('document_type "other" requires document_type_detail');
  }
  if (extraction.date && typeof extraction.date === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(extraction.date)) {
    errors.push('date should be ISO 8601 format');
  }
  if (!extraction.key_data_points || (extraction.key_data_points as unknown[]).length === 0) {
    errors.push('key_data_points must have at least 1 item');
  }

  return errors;
}

// ─── Validation-Retry Loop (Task 4.4) ──────────────────────────────────────

async function extractWithRetry(documentId: string) {
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`  Attempt ${attempt}/${MAX_RETRIES}...`);

    const feedback = lastErrors.length > 0 ? lastErrors.join('; ') : null;
    const extraction = await extractDocument(documentId, feedback);
    const errors = validateExtraction(extraction);

    if (errors.length === 0) {
      console.log('  Valid!');
      return { extraction, attempts: attempt };
    }

    console.log(`  Errors: ${errors.join(', ')}`);
    lastErrors = errors;
  }

  return { extraction: null, attempts: MAX_RETRIES, failed: true };
}

// ─── Confidence Routing (Task 5.5) ─────────────────────────────────────────

function routeByConfidence(extraction: Record<string, unknown>) {
  const confidence = extraction.confidence as number;
  if (confidence >= CONFIDENCE_THRESHOLD) {
    return { route: 'auto', reason: `confidence ${confidence} >= ${CONFIDENCE_THRESHOLD}` };
  }
  return { route: 'human_review', reason: `confidence ${confidence} < ${CONFIDENCE_THRESHOLD}` };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Exercise 3 — SOLUTION: Structured Data Extraction Pipeline\n');

  const results: Record<string, Array<string | { id: string; extraction: Record<string, unknown> }>> = { auto: [], human_review: [], failed: [] };

  for (const id of getDocumentIds()) {
    console.log(`\nProcessing: ${id}`);
    const { extraction, attempts, failed } = await extractWithRetry(id);

    if (failed || !extraction) {
      console.log(`  FAILED after ${attempts} attempts`);
      results.failed.push(id);
    } else {
      const routing = routeByConfidence(extraction);
      console.log(`  Route: ${routing.route} (${routing.reason})`);
      console.log(`  Type: ${extraction.document_type}, Points: ${(extraction.key_data_points as unknown[])?.length ?? 0}`);
      results[routing.route]!.push({ id, extraction });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Auto-processed: ${results.auto.length}`);
  console.log(`Human review: ${results.human_review.length}`);
  console.log(`Failed: ${results.failed.length}`);
}

main().catch(console.error);
