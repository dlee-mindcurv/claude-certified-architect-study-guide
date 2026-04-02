/**
 * Scenario 6 (Data Extraction) -- Full Extraction Retry Loop
 *
 * Exam relevance:
 * - Task 4.4: Validation-retry with error classification
 * - Retryable (format mismatch) vs non-retryable (info absent) errors
 * - Self-correction: stated_total vs calculated_total conflict detection
 * - Pattern tracking for systematic prompt improvement
 *
 * Uses @anthropic-ai/sdk directly for the retry loop -- this is an API-level
 * concept requiring multi-turn conversation management.
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.4-validation-retry/scenario-6-extraction/retry-loop.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { documentExtractionTool } from '../../../../shared/schemas/extraction-output.js';
import { getDocumentIds, getDocument } from '../../../../shared/tools/extraction-tools.js';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Extraction {
  document_id?: string;
  document_type?: string;
  date?: string | null;
  field_confidence?: Record<string, number>;
  entities?: Array<{ name: string; role: string; [key: string]: unknown }>;
  monetary_values?: Array<{
    label: string;
    stated_value?: number | null;
    calculated_value?: number | null;
    conflict_detected?: boolean;
  }>;
  key_dates?: Array<{ label: string; date: string }>;
  [key: string]: unknown;
}

interface ValidationError {
  rule: string;
  message: string;
  errorType: string;
  pattern: string;
}

interface ValidationRule {
  name: string;
  check: (e: Extraction) => boolean;
  errorMessage: string | ((e: Extraction) => string);
  errorType: string;
  pattern: string;
}

interface ExtractionResult {
  extraction: Extraction | null;
  status: string;
  attempts?: number;
  errorLog?: Array<ValidationError & { attempt: number }>;
  error?: string;
  nonRetryableErrors?: ValidationError[];
}

interface ErrorLogEntry {
  documentId: string;
  errorLog: Array<ValidationError & { attempt: number }>;
  attempts: number;
  status: string;
}

interface PatternAnalysisStats {
  total: number;
  resolved_by_retry: number;
  unresolvable: number;
  documents: Set<string>;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = 2;

// ─── Validation Rules ───────────────────────────────────────────────────────

const VALIDATION_RULES: ValidationRule[] = [
  {
    name: 'required-document-id',
    check: (e: Extraction) => !!e.document_id,
    errorMessage: 'document_id is required',
    errorType: 'retryable',
    pattern: 'missing-required-field',
  },
  {
    name: 'required-document-type',
    check: (e: Extraction) => !!e.document_type,
    errorMessage: 'document_type is required',
    errorType: 'retryable',
    pattern: 'missing-required-field',
  },
  {
    name: 'required-field-confidence',
    check: (e: Extraction) => !!e.field_confidence && typeof e.field_confidence === 'object',
    errorMessage: 'field_confidence object is required',
    errorType: 'retryable',
    pattern: 'missing-required-field',
  },
  {
    name: 'valid-date-format',
    check: (e: Extraction) => {
      if (e.date === null || e.date === undefined) return true;
      return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(e.date);
    },
    errorMessage: (e: Extraction) => `date "${e.date}" is not ISO 8601 (YYYY, YYYY-MM, or YYYY-MM-DD)`,
    errorType: 'retryable',
    pattern: 'date-format-mismatch',
  },
  {
    name: 'valid-document-type-enum',
    check: (e: Extraction) => {
      const valid = ['invoice', 'contract', 'research_paper', 'receipt', 'letter', 'report', 'other'];
      return valid.includes(e.document_type!);
    },
    errorMessage: (e: Extraction) => `document_type "${e.document_type}" not in enum`,
    errorType: 'retryable',
    pattern: 'enum-violation',
  },
  {
    name: 'valid-confidence-range',
    check: (e: Extraction) => {
      if (!e.field_confidence) return true;
      return Object.values(e.field_confidence).every((v: number) => typeof v === 'number' && v >= 0 && v <= 1);
    },
    errorMessage: 'All confidence scores must be numbers between 0 and 1',
    errorType: 'retryable',
    pattern: 'confidence-out-of-range',
  },
  {
    name: 'valid-entity-roles',
    check: (e: Extraction) => {
      if (!e.entities || e.entities.length === 0) return true;
      const validRoles = ['vendor', 'client', 'author', 'recipient', 'party', 'other'];
      return e.entities.every((ent) => validRoles.includes(ent.role));
    },
    errorMessage: (e: Extraction) => {
      const invalidRoles = (e.entities || [])
        .filter((ent) => !['vendor', 'client', 'author', 'recipient', 'party', 'other'].includes(ent.role))
        .map((ent) => `"${ent.role}"`);
      return `Invalid entity roles: ${invalidRoles.join(', ')}`;
    },
    errorType: 'retryable',
    pattern: 'enum-violation',
  },
  {
    name: 'conflict-detection-consistency',
    check: (e: Extraction) => {
      if (!e.monetary_values) return true;
      for (const mv of e.monetary_values) {
        if (mv.stated_value != null && mv.calculated_value != null) {
          const diff = Math.abs(mv.stated_value - mv.calculated_value);
          const hasConflict = diff > 0.01;
          if (hasConflict !== mv.conflict_detected) return false;
        }
      }
      return true;
    },
    errorMessage: 'conflict_detected flag does not match stated vs calculated comparison',
    errorType: 'retryable',
    pattern: 'conflict-detection-error',
  },
  {
    name: 'valid-key-dates-format',
    check: (e: Extraction) => {
      if (!e.key_dates) return true;
      return e.key_dates.every((kd) => kd.label && kd.date);
    },
    errorMessage: 'Each key_date must have a label and date',
    errorType: 'retryable',
    pattern: 'incomplete-nested-object',
  },
];

// ─── Validation Engine ──────────────────────────────────────────────────────

function validate(extraction: Extraction) {
  const errors: ValidationError[] = [];
  for (const rule of VALIDATION_RULES) {
    try {
      if (!rule.check(extraction)) {
        const message = typeof rule.errorMessage === 'function'
          ? rule.errorMessage(extraction)
          : rule.errorMessage;
        errors.push({
          rule: rule.name,
          message,
          errorType: rule.errorType,
          pattern: rule.pattern,
        });
      }
    } catch (err) {
      errors.push({
        rule: rule.name,
        message: `Validation error: ${(err as Error).message}`,
        errorType: 'retryable',
        pattern: 'validation-exception',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    retryable: errors.filter(e => e.errorType === 'retryable'),
    nonRetryable: errors.filter(e => e.errorType === 'non_retryable'),
  };
}

// ─── Extraction with Retry ──────────────────────────────────────────────────

async function extractWithRetry(documentId: string): Promise<ExtractionResult> {
  const doc = getDocument(documentId);
  if (!doc) {
    return { extraction: null, status: 'error', error: `Document not found: ${documentId}` };
  }

  console.log(`\n${'━'.repeat(50)}`);
  console.log(`Extracting: ${documentId} (type hint: ${doc.type})`);
  console.log('━'.repeat(50));

  const errorLog: Array<ValidationError & { attempt: number }> = [];
  let attempt = 0;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Extract structured information from this document. The document_id is "${documentId}".

Rules:
- Return null for fields not present in the source -- do NOT fabricate values
- For monetary values, independently calculate totals from line items
- Compare calculated totals to stated totals and set conflict_detected accordingly
- Include confidence scores (0-1) for each extracted field
- Use ISO 8601 dates (YYYY-MM-DD)

Document:
${doc.raw}`,
    },
  ];

  while (attempt <= MAX_RETRIES) {
    attempt++;
    console.log(`\n  Attempt ${attempt}/${MAX_RETRIES + 1}`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      tools: [documentExtractionTool as Anthropic.Tool],
      tool_choice: { type: 'tool' as const, name: 'extract_document_info' },
      messages,
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) {
      console.log('  ERROR: No tool_use block');
      return { extraction: null, status: 'error', attempts: attempt, errorLog };
    }

    const extraction = toolUse.input as Extraction;
    console.log(`  type: ${extraction.document_type}, date: ${extraction.date}`);

    const result = validate(extraction);

    if (result.isValid) {
      console.log('  VALID');
      return { extraction, status: 'success', attempts: attempt, errorLog };
    }

    for (const err of result.errors) {
      console.log(`  [${err.errorType}] ${err.message}`);
      errorLog.push({ attempt, ...err });
    }

    if (result.retryable.length === 0) {
      console.log('  Accepting partial result (no retryable errors)');
      return {
        extraction,
        status: 'partial',
        attempts: attempt,
        errorLog,
        nonRetryableErrors: result.nonRetryable,
      };
    }

    if (attempt > MAX_RETRIES) {
      console.log('  Max retries exhausted');
      return { extraction, status: 'max_retries', attempts: attempt, errorLog };
    }

    // ── Build retry with error feedback ─────────────────────────────
    const errorFeedback = result.retryable
      .map(e => `- ${e.message}`)
      .join('\n');

    messages.push({ role: 'assistant' as const, content: response.content as Anthropic.ContentBlockParam[] });
    messages.push({
      role: 'user' as const,
      content: `Your extraction has validation errors. Fix these specific issues:

${errorFeedback}

Re-extract using the extract_document_info tool with corrections.`,
    });

    console.log('  Retrying with error feedback...');
  }
  return { extraction: null, status: 'error', attempts: attempt, errorLog };
}

// ─── Error Pattern Analyzer ─────────────────────────────────────────────────

function analyzePatterns(allErrorLogs: ErrorLogEntry[]) {
  const stats: Record<string, PatternAnalysisStats> = {};

  for (const { documentId, errorLog, attempts, status } of allErrorLogs) {
    for (const err of errorLog) {
      if (!stats[err.pattern]) {
        stats[err.pattern] = {
          total: 0,
          resolved_by_retry: 0,
          unresolvable: 0,
          documents: new Set(),
        };
      }
      stats[err.pattern].total++;
      stats[err.pattern].documents.add(documentId);

      if (err.attempt === attempts && status !== 'success') {
        stats[err.pattern].unresolvable++;
      } else {
        stats[err.pattern].resolved_by_retry++;
      }
    }
  }

  const result: Record<string, Record<string, unknown>> = {};
  for (const [pattern, data] of Object.entries(stats)) {
    result[pattern] = {
      total_occurrences: data.total,
      resolved_by_retry: data.resolved_by_retry,
      unresolvable: data.unresolvable,
      affected_documents: data.documents.size,
      recommendation:
        data.unresolvable > data.total * 0.5
          ? 'PROMPT_IMPROVEMENT_NEEDED'
          : data.resolved_by_retry === data.total
            ? 'RETRY_EFFECTIVE'
            : 'MONITOR',
    };
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.4 / Scenario 6 -- Full Extraction Retry Pipeline\n');

  const documentIds = getDocumentIds();
  const allResults: Array<ExtractionResult & { documentId: string }> = [];

  for (const docId of documentIds) {
    const result = await extractWithRetry(docId);
    allResults.push({
      documentId: docId,
      ...result,
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('EXTRACTION RESULTS SUMMARY');
  console.log('='.repeat(60));

  for (const r of allResults) {
    const conflictsFound = r.extraction?.monetary_values?.filter(mv => mv.conflict_detected) || [];
    console.log(
      `  ${r.documentId}: ${r.status} (${r.attempts} attempt(s))` +
      (conflictsFound.length > 0 ? ` -- ${conflictsFound.length} conflict(s) detected` : '')
    );
  }

  // ── Pattern Analysis ──────────────────────────────────────────────
  const allErrorLogs: ErrorLogEntry[] = allResults
    .filter(r => r.errorLog && r.errorLog.length > 0)
    .map(r => ({
      documentId: r.documentId,
      errorLog: r.errorLog!,
      attempts: r.attempts!,
      status: r.status,
    }));

  if (allErrorLogs.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('ERROR PATTERN ANALYSIS');
    console.log('='.repeat(60));
    const patterns = analyzePatterns(allErrorLogs);
    console.log(JSON.stringify(patterns, null, 2));
  } else {
    console.log('\nNo errors encountered -- all documents extracted cleanly.');
  }

  console.log(`
PIPELINE DESIGN SUMMARY:
1. FORCED TOOL_USE guarantees valid JSON structure (Task 4.3)
2. VALIDATION catches semantic issues (wrong format, missing fields)
3. ERROR CLASSIFICATION determines retry vs. accept-partial
4. RETRY WITH FEEDBACK gives Claude context to self-correct
5. PATTERN TRACKING identifies systematic prompt improvement needs
6. SELF-CORRECTION (conflict_detected) provides built-in quality signals
`);
}

main().catch(console.error);
