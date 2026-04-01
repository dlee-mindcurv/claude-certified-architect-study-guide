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
 * This example demonstrates:
 * 1. Schema validation after extraction
 * 2. Error classification (retryable vs non-retryable)
 * 3. Retry with error feedback
 * 4. Self-correction validation (stated vs calculated totals)
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.4-validation-retry/example.js
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { documentExtractionTool } from '../../../shared/schemas/extraction-output.js';

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

const validationRules = [
  {
    name: 'required-document-type',
    check: (extraction) => !!extraction.document_type,
    errorMessage: 'document_type is required but missing',
    errorType: 'retryable',
    pattern: 'missing-required-field',
  },
  {
    name: 'required-field-confidence',
    check: (extraction) => !!extraction.field_confidence,
    errorMessage: 'field_confidence is required but missing',
    errorType: 'retryable',
    pattern: 'missing-required-field',
  },
  {
    name: 'valid-date-format',
    check: (extraction) => {
      if (extraction.date === null) return true; // null is valid
      return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(extraction.date);
    },
    errorMessage: (extraction) =>
      `date "${extraction.date}" is not in ISO 8601 format (expected YYYY, YYYY-MM, or YYYY-MM-DD)`,
    errorType: 'retryable',
    pattern: 'date-format-mismatch',
  },
  {
    name: 'valid-document-type-enum',
    check: (extraction) => {
      const validTypes = ['invoice', 'contract', 'research_paper', 'receipt', 'letter', 'report', 'other'];
      return validTypes.includes(extraction.document_type);
    },
    errorMessage: (extraction) =>
      `document_type "${extraction.document_type}" is not a valid enum value`,
    errorType: 'retryable',
    pattern: 'enum-violation',
  },
  {
    name: 'confidence-range',
    check: (extraction) => {
      if (!extraction.field_confidence) return true;
      return Object.values(extraction.field_confidence).every(v => v >= 0 && v <= 1);
    },
    errorMessage: 'confidence scores must be between 0 and 1',
    errorType: 'retryable',
    pattern: 'confidence-out-of-range',
  },
  {
    name: 'monetary-conflict-detection',
    check: (extraction) => {
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

/**
 * Validate an extraction result against all rules.
 * Returns { isValid, errors[] } where each error has a retryable classification.
 */
function validateExtraction(extraction) {
  const errors = [];

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
 * + the SPECIFIC validation error. This gives Claude full context to understand
 * what went wrong and correct it.
 *
 * Non-retryable errors are accepted immediately (retrying would waste tokens
 * or cause hallucination).
 */
async function extractWithRetry(documentText, documentId) {
  console.log(`\nExtracting: ${documentId}`);
  console.log('─'.repeat(50));

  // Error tracking for systematic analysis
  const errorLog = [];
  let attempt = 0;
  let messages = [
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
      tools: [documentExtractionTool],
      tool_choice: { type: 'tool', name: 'extract_document_info' },
      messages,
    });

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse) {
      console.log('  ERROR: No tool_use in response (unexpected)');
      break;
    }

    const extraction = toolUse.input;
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
    //
    // EXAM KEY CONCEPT: The retry includes:
    // 1. The original document (already in conversation history)
    // 2. The failed extraction (Claude's previous tool_use)
    // 3. Specific validation errors (what to fix)
    const retryableErrorMessages = validation.retryableErrors
      .map(e => `- ${e.message}`)
      .join('\n');

    // Append Claude's response and our feedback as conversation turns
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: `The extraction has validation errors. Please fix these specific issues and re-extract:

${retryableErrorMessages}

Re-extract the document with these corrections. The original document is in the conversation above.`,
    });

    console.log('  Retrying with error feedback...');
  }
}

// ─── Self-Correction Demonstration ──────────────────────────────────────────

/**
 * Demonstrate self-correction with stated vs. calculated totals.
 *
 * EXAM KEY CONCEPT: Claude independently calculates totals from line items
 * and compares to stated totals. Conflicts are flagged -- not auto-corrected.
 */
async function demonstrateSelfCorrection() {
  console.log('\n' + '='.repeat(60));
  console.log('SELF-CORRECTION: Stated vs. Calculated Totals');
  console.log('='.repeat(60));

  // Document with a deliberate total error
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
  console.log(`\nResult: ${cleanResult.status} in ${cleanResult.attempts} attempt(s)`);

  // ── Test 2: Sparse document (non-retryable missing fields) ────────
  const sparseDoc = `Quick Mart
Total: $23.47
Cash`;

  const sparseResult = await extractWithRetry(sparseDoc, 'sparse-receipt');
  console.log(`\nResult: ${sparseResult.status} in ${sparseResult.attempts} attempt(s)`);

  // ── Test 3: Self-correction demonstration ─────────────────────────
  await demonstrateSelfCorrection();

  // ── Error Pattern Summary ─────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('ERROR PATTERN TRACKING');
  console.log('='.repeat(60));

  const allErrors = [
    ...(cleanResult.errorLog || []),
    ...(sparseResult.errorLog || []),
  ];

  if (allErrors.length > 0) {
    const patternStats = {};
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
