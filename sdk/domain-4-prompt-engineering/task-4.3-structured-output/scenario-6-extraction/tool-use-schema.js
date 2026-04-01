/**
 * Scenario 6 (Data Extraction) -- Full Tool Definitions with JSON Schemas
 *
 * Exam relevance:
 * - Task 4.3: tool_use with JSON schemas for guaranteed structured output
 * - Schema design: required vs optional, nullable, enum + "other" + detail
 * - Self-correction: stated_value vs calculated_value with conflict_detected
 * - Confidence scores for human review routing (Task 5.5)
 *
 * This module defines the complete tool set for the data extraction pipeline.
 * It demonstrates all the schema design patterns tested on the exam:
 * 1. Forced tool selection for guaranteed output
 * 2. Nullable fields for absent information
 * 3. Enum with "other" escape hatch
 * 4. Self-correction validation fields
 * 5. Confidence scores per field
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.3-structured-output/scenario-6-extraction/tool-use-schema.js
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  documentExtractionTool,
  batchResultSchema,
} from '../../../../shared/schemas/extraction-output.js';
import {
  extractionToolDefinitions,
  executeExtractionTool,
  getDocumentIds,
  getDocument,
} from '../../../../shared/tools/extraction-tools.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Schema Design Walkthrough ──────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The documentExtractionTool schema (from shared/schemas)
// demonstrates all schema design patterns:
//
// 1. REQUIRED FIELDS (must always be present):
//    - document_id: correlation key
//    - document_type: routing key for downstream processing
//    - field_confidence: quality signal for human review
//
// 2. NULLABLE FIELDS (may be absent from source):
//    - title: type ["string", "null"] -- null if no title in source
//    - author: type ["string", "null"] -- null for unsigned documents
//    - date: type ["string", "null"] -- null if undated
//    - document_type_detail: type ["string", "null"] -- only for "other" type
//    - extraction_notes: type ["string", "null"] -- null if no issues
//
// 3. ENUM WITH "OTHER" ESCAPE HATCH:
//    document_type: enum ["invoice", "contract", ..., "other"]
//    + document_type_detail for "other" subcategorization
//
// 4. SELF-CORRECTION VALIDATION:
//    monetary_values[].stated_value vs calculated_value + conflict_detected
//    Claude computes both independently and flags mismatches
//
// 5. CONFIDENCE SCORES:
//    field_confidence: { [field]: number 0-1 }
//    Enables routing: high confidence -> auto-process, low -> human review

// ─── Two-Phase Extraction Pipeline ──────────────────────────────────────────
//
// Phase 1: Metadata extraction (document type classification)
// Phase 2: Detailed extraction using the document-type-specific approach
//
// This two-phase approach is more reliable than single-pass because:
// - Phase 1 uses a simpler schema (fewer fields to get wrong)
// - Phase 2 receives the document type as context (better extraction)

/**
 * Phase 1: Extract document metadata (type, title, date).
 * Uses forced tool selection to guarantee structured output.
 */
async function extractMetadata(documentId) {
  const doc = getDocument(documentId);
  if (!doc) {
    return { error: `Document not found: ${documentId}` };
  }

  // ── Simplified metadata tool ──────────────────────────────────────
  const metadataTool = {
    name: 'classify_document',
    description:
      'Classify the document type and extract basic metadata. Return null for ' +
      'fields not present in the source document.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: { type: 'string' },
        document_type: {
          type: 'string',
          enum: ['invoice', 'contract', 'research_paper', 'receipt', 'letter', 'report', 'other'],
        },
        document_type_detail: {
          type: ['string', 'null'],
          description: 'Additional detail when type is "other"',
        },
        title: { type: ['string', 'null'] },
        date: { type: ['string', 'null'], description: 'ISO 8601 date if present' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['document_id', 'document_type', 'confidence'],
    },
  };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // ── FORCED TOOL SELECTION ─────────────────────────────────────────
    // Guarantees structured output -- Claude MUST call this tool
    tools: [metadataTool],
    tool_choice: { type: 'tool', name: 'classify_document' },
    messages: [
      {
        role: 'user',
        content: `Classify this document and extract metadata. Return null for absent fields.\n\n${doc.raw}`,
      },
    ],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  return toolUse ? toolUse.input : { error: 'No tool_use in response' };
}

/**
 * Phase 2: Detailed extraction using the full schema.
 * Uses the document type from Phase 1 to guide extraction.
 */
async function extractDetails(documentId, metadata) {
  const doc = getDocument(documentId);
  if (!doc) {
    return { error: `Document not found: ${documentId}` };
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [documentExtractionTool],
    tool_choice: { type: 'tool', name: 'extract_document_info' },
    messages: [
      {
        role: 'user',
        content: `Extract structured information from this ${metadata.document_type} document.

Previously classified as: ${metadata.document_type} (confidence: ${metadata.confidence})
${metadata.title ? `Title: ${metadata.title}` : 'No title identified'}

Document content:
${doc.raw}

Rules:
- Return null for fields not present in the source document
- For monetary values, independently calculate totals and compare to stated values
- Set conflict_detected: true if stated and calculated values differ
- Include confidence scores for each extracted field`,
      },
    ],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  return toolUse ? toolUse.input : { error: 'No tool_use in response' };
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate an extraction result against the schema and business rules.
 *
 * EXAM KEY CONCEPT: tool_use guarantees schema compliance (syntax), but we
 * still need to validate semantic correctness. This function checks for:
 * - Required fields present
 * - Confidence scores in valid range
 * - Conflict detection flagged correctly
 */
function validateExtraction(extraction) {
  const errors = [];

  // Required fields
  if (!extraction.document_id) errors.push('Missing document_id');
  if (!extraction.document_type) errors.push('Missing document_type');
  if (!extraction.field_confidence) errors.push('Missing field_confidence');

  // Confidence range
  if (extraction.field_confidence) {
    for (const [field, score] of Object.entries(extraction.field_confidence)) {
      if (score < 0 || score > 1) {
        errors.push(`Invalid confidence for ${field}: ${score} (must be 0-1)`);
      }
    }
  }

  // Conflict detection consistency
  if (extraction.monetary_values) {
    for (const mv of extraction.monetary_values) {
      if (mv.stated_value !== undefined && mv.calculated_value !== undefined) {
        const shouldHaveConflict = mv.stated_value !== mv.calculated_value;
        if (shouldHaveConflict && !mv.conflict_detected) {
          errors.push(
            `Undetected conflict for ${mv.label}: stated=${mv.stated_value}, calculated=${mv.calculated_value}`
          );
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ─── Demo Execution ─────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.3 / Scenario 6 -- Tool-Use Schema Extraction Pipeline\n');
  console.log('Two-phase extraction: metadata classification -> detailed extraction\n');

  const documentIds = getDocumentIds();

  for (const docId of documentIds) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${docId}`);
    console.log('='.repeat(60));

    // Phase 1: Metadata
    console.log('\n--- Phase 1: Metadata Classification ---');
    const metadata = await extractMetadata(docId);
    console.log(JSON.stringify(metadata, null, 2));

    if (metadata.error) {
      console.log(`Skipping Phase 2 due to error: ${metadata.error}`);
      continue;
    }

    // Phase 2: Detailed extraction
    console.log('\n--- Phase 2: Detailed Extraction ---');
    const details = await extractDetails(docId, metadata);
    console.log(JSON.stringify(details, null, 2));

    // Validate
    console.log('\n--- Validation ---');
    const validation = validateExtraction(details);
    console.log(
      validation.isValid
        ? 'VALID: All checks passed'
        : `INVALID: ${validation.errors.join('; ')}`
    );
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SCHEMA DESIGN PATTERNS DEMONSTRATED');
  console.log('='.repeat(60));
  console.log(`
1. FORCED TOOL SELECTION: tool_choice: { type: "tool", name: "..." }
   Guarantees structured output -- no free-text responses possible.

2. NULLABLE FIELDS: type: ["string", "null"]
   Enables null for absent info. Without this, Claude may fabricate values.

3. ENUM + "OTHER": document_type enum with "other" + document_type_detail
   Known categories for routing, escape hatch for unexpected types.

4. SELF-CORRECTION: stated_value vs calculated_value + conflict_detected
   Built-in validation without a separate API call.

5. TWO-PHASE PIPELINE: Metadata first, then detailed extraction.
   Phase 1 classification guides Phase 2, improving accuracy.
`);
}

main().catch(console.error);
