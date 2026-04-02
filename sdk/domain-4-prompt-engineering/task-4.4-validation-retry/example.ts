/**
 * Task 4.4 -- Validation-Retry Loop with Error Classification
 *
 * Exam relevance:
 * - Retry-with-error-feedback: send original + failed output + specific error
 * - Retryable errors (format mismatch) vs non-retryable (info absent from source)
 * - Self-correction: calculated_total vs stated_total, flag conflicts
 * - detected_pattern tracking for systematic error analysis
 * - Scenario 6 (Data Extraction) depends on this pattern
 *
 * This is an API-level concept -- uses @anthropic-ai/sdk directly for the
 * retry loop with multi-turn conversation history.
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.4-validation-retry/example.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { documentExtractionTool } from '../../../shared/schemas/extraction-output.js';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Extraction {
  document_type?: string;
  field_confidence?: Record<string, number>;
  date?: string | null;
  monetary_values?: Array<{
    label: string;
    stated_value?: number | null;
    calculated_value?: number | null;
    conflict_detected?: boolean;
  }>;
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
  check: (extraction: Extraction) => boolean;
  errorMessage: string | ((extraction: Extraction) => string);
  errorType: string;
  pattern: string;
}

interface ExtractionResult {
  extraction: Extraction;
  attempts: number;
  errorLog: Array<ValidationError & { attempt: number }>;
  status: string;
  nonRetryableErrors?: ValidationError[];
}

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = 2;

// ─── Validation Rules ───────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Each validation rule includes:
// - check: function that returns true if valid
// - errorType: 'retryable' or 'non_retryable'
// - pattern: detected_pattern for systematic tracking

const validationRules: ValidationRule[] = [
  {
    name: 'required-document-type',
    check: (extraction: Extraction) => !!extraction.document_type,
    errorMessage: 'document_type is required but missing',
    errorType: 'retryable',
    pattern: 'missing-required-field',
  },
  {
    name: 'required-field-confidence',
    check: (extraction: Extraction) => !!extraction.field_confidence,
    errorMessage: 'field_confidence is required but missing',
    errorType: 'retryable',
    pattern: 'missing-required-field',
  },
  {
    name: 'valid-date-format',
    check: (extraction: Extraction) => {
      if (extraction.date === null) return true;
      return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(extraction.date!);
    },
    errorMessage: (extraction: Extraction) =>
      `date "${extraction.date}" is not in ISO 8601 format (expected YYYY, YYYY-MM, or YYYY-MM-DD)`,
    errorType: 'retryable',
    pattern: 'date-format-mismatch',
  },
  {
    name: 'valid-document-type-enum',
    check: (extraction: Extraction) => {
      const validTypes = ['invoice', 'contract', 'research_paper', 'receipt', 'letter', 'report', 'other'];
      return validTypes.includes(extraction.document_type!);
    },
    errorMessage: (extraction: Extraction) =>
      `document_type "${extraction.document_type}" is not a valid enum value`,
    errorType: 'retryable',
    pattern: 'enum-violation',
  },
  {
    name: 'confidence-range',
    check: (extraction: Extraction) => {
      if (!extraction.field_confidence) return true;
      return Object.values(extraction.field_confidence).every((v: number) => v >= 0 && v <= 1);
    },
    errorMessage: 'confidence scores must be between 0 and 1',
    errorType: 'retryable',
    pattern: 'confidence-out-of-range',
  },
  {
    name: 'monetary-conflict-detection',
    check: (extraction: Extraction) => {
      if (!extraction.monetary_values) return true;
      for (const mv of extraction.monetary_values) {
        if (mv.stated_value != null && mv.calculated_value != null) {
          const hasConflict = Math.abs(mv.stated_value - mv.calculated_value) > 0.01;
          if (hasConflict && !mv.conflict_detected) return false;
          if (!hasConflict && mv.conflict_detected) return false;
        }
      }
      return true;
    },
    errorMessage: 'conflict_detected does not match stated/calculated value comparison',
    errorType: 'retryable',
    pattern: 'conflict-detection-error',
  },
];

// ─── Validation Engine ──────────────────────────────────────────────────────

function validateExtraction(extraction: Extraction) {
  const errors: ValidationError[] = [];

  for (const rule of validationRules) {
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
  }

  return {
    isValid: errors.length === 0,
    errors,
    retryableErrors: errors.filter(e => e.errorType === 'retryable'),
    nonRetryableErrors: errors.filter(e => e.errorType === 'non_retryable'),
  };
}

// ─── Retry Loop ─────────────────────────────────────────────────────────────

/**
 * Extract with validation-retry loop.
 *
 * EXAM KEY CONCEPT: The retry sends the ORIGINAL document + the FAILED extraction
 * + the SPECIFIC validation error. This gives Claude full context to self-correct.
 *
 * Non-retryable errors are accepted immediately (retrying would waste tokens
 * or cause hallucination).
 */
async function extractWithRetry(documentText: string, documentId: string): Promise<ExtractionResult | undefined> {
  console.log(`\nExtracting: ${documentId}`);
  console.log('─'.repeat(50));

  const errorLog: Array<ValidationError & { attempt: number }> = [];
  let attempt = 0;
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Extract structured information from this document. Return null for fields not present in the source -- do not fabricate values. Compare calculated and stated totals and set conflict_detected appropriately.

Document:
${documentText}`,
    },
  ];

  while (attempt <= MAX_RETRIES) {
    attempt++;
    console.log(`\n  Attempt ${attempt}/${MAX_RETRIES + 1}`);

    // ── Call Claude with forced tool selection ──────────────────────
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      tools: [documentExtractionTool as Anthropic.Tool],
      tool_choice: { type: 'tool' as const, name: 'extract_document_info' },
      messages,
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) {
      console.log('  ERROR: No tool_use in response (unexpected)');
      break;
    }

    const extraction = toolUse.input as Extraction;
    console.log(`  document_type: ${extraction.document_type}`);

    // ── Validate ───────────────────────────────────────────────────
    const validation = validateExtraction(extraction);

    if (validation.isValid) {
      console.log('  VALID: All checks passed');
      return {
        extraction,
        attempts: attempt,
        errorLog,
        status: 'success',
      };
    }

    // ── Log errors ─────────────────────────────────────────────────
    for (const error of validation.errors) {
      console.log(`  ${error.errorType.toUpperCase()}: ${error.message} [${error.pattern}]`);
      errorLog.push({ attempt, ...error });
    }

    // ── Check if retry is worthwhile ───────────────────────────────
    if (validation.retryableErrors.length === 0) {
      console.log('  No retryable errors -- accepting partial result');
      return {
        extraction,
        attempts: attempt,
        errorLog,
        status: 'partial',
        nonRetryableErrors: validation.nonRetryableErrors,
      };
    }

    if (attempt > MAX_RETRIES) {
      console.log('  Max retries reached -- accepting last result');
      return {
        extraction,
        attempts: attempt,
        errorLog,
        status: 'max_retries_reached',
      };
    }

    // ── Build retry message with error feedback ────────────────────
    // EXAM KEY CONCEPT: The retry includes the failed extraction (in
    // conversation history) and specific validation errors (what to fix).
    const retryableErrorMessages = validation.retryableErrors
      .map(e => `- ${e.message}`)
      .join('\n');

    messages.push({ role: 'assistant' as const, content: response.content as Anthropic.ContentBlockParam[] });
    messages.push({
      role: 'user' as const,
      content: `The extraction has validation errors. Please fix these specific issues and re-extract:

${retryableErrorMessages}

Re-extract the document with these corrections. The original document is in the conversation above.`,
    });

    console.log('  Retrying with error feedback...');
  }
  return undefined;
}

// ─── Self-Correction Demonstration ──────────────────────────────────────────

async function demonstrateSelfCorrection() {
  console.log('\n' + '='.repeat(60));
  console.log('SELF-CORRECTION: Stated vs. Calculated Totals');
  console.log('='.repeat(60));

  const docWithError = `INVOICE #INV-ERROR-001
Date: 2025-04-01

Widget A    10 x $25.00  = $250.00
Widget B     5 x $40.00  = $200.00
Subtotal: $450.00
Tax (10%): $45.00
TOTAL: $500.00

Note: The correct total should be $495.00 (450 + 45), but the document states $500.00.`;

  const result = await extractWithRetry(docWithError, 'invoice-with-error');

  if (result) {
    const extraction = result.extraction;
    console.log('\n--- Self-Correction Analysis ---');

    if (extraction.monetary_values) {
      for (const mv of extraction.monetary_values) {
        if (mv.calculated_value != null) {
          console.log(
            `  ${mv.label}: stated=$${mv.stated_value}, calculated=$${mv.calculated_value}, conflict=${mv.conflict_detected}`
          );
        }
      }
    }

    console.log(`
  EXAM NOTE: The document has an internal inconsistency (stated total $500
  vs. calculated $495). The extraction should:
  - Report BOTH values (stated_total and calculated_total)
  - Set conflict_detected: true
  - NOT silently correct the stated value
  - Include extraction_notes explaining the discrepancy
`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.4 -- Validation-Retry with Error Classification\n');

  // ── Test 1: Clean document (should pass on first attempt) ─────────
  const cleanDoc = `SERVICE AGREEMENT
Effective Date: January 1, 2025
Parties: TechStart Inc. ("Client") and CloudServ LLC ("Provider")
Term: 12 months
Monthly Fee: $5,000
Total Contract Value: $60,000`;

  const cleanResult = await extractWithRetry(cleanDoc, 'clean-contract');
  console.log(`\nResult: ${cleanResult?.status} in ${cleanResult?.attempts} attempt(s)`);

  // ── Test 2: Sparse document (non-retryable missing fields) ────────
  const sparseDoc = `Quick Mart
Total: $23.47
Cash`;

  const sparseResult = await extractWithRetry(sparseDoc, 'sparse-receipt');
  console.log(`\nResult: ${sparseResult?.status} in ${sparseResult?.attempts} attempt(s)`);

  // ── Test 3: Self-correction demonstration ─────────────────────────
  await demonstrateSelfCorrection();

  // ── Error Pattern Summary ─────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('ERROR PATTERN TRACKING');
  console.log('='.repeat(60));

  const allErrors = [
    ...(cleanResult?.errorLog || []),
    ...(sparseResult?.errorLog || []),
  ];

  if (allErrors.length > 0) {
    const patternStats: Record<string, Record<string, number>> = {};
    for (const err of allErrors) {
      if (!patternStats[err.pattern]) {
        patternStats[err.pattern] = { total: 0, retryable: 0, non_retryable: 0 };
      }
      patternStats[err.pattern].total++;
      patternStats[err.pattern][err.errorType]++;
    }
    console.log('Pattern statistics:', JSON.stringify(patternStats, null, 2));
  } else {
    console.log('No errors encountered across all extractions.');
  }

  console.log(`
KEY TAKEAWAYS:
1. RETRYABLE: Format mismatches, missing required fields, enum violations.
   Claude can fix these with error feedback.

2. NON-RETRYABLE: Information absent from source document.
   Retrying wastes tokens or causes hallucination. Accept as partial.

3. SELF-CORRECTION: stated vs calculated values with conflict_detected.
   Built-in validation without separate API calls.

4. PATTERN TRACKING: detected_pattern enables systematic analysis.
   High-frequency retryable errors suggest prompt improvements.
`);
}

main().catch(console.error);
