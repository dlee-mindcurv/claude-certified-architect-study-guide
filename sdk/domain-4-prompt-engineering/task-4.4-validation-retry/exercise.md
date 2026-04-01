# Exercise: Implement a Validation-Retry Loop

## Objective

Build a complete validation-retry loop that classifies errors as retryable
or non-retryable, tracks error patterns, and makes intelligent decisions
about when to retry vs. accept partial results.

## Part 1: Define Validation Rules (15 minutes)

Create at least 6 validation rules for a document extraction pipeline.
For each rule, define:

1. **Name:** Human-readable rule identifier
2. **Check function:** Returns true if the extraction passes this rule
3. **Error type:** `retryable` or `non_retryable`
4. **Pattern:** Machine-readable pattern for tracking

Classify these scenarios:

| Scenario | Retryable? | Why? |
|----------|-----------|------|
| Date in "March 15" instead of "2025-03-15" | ? | |
| No date in the source document | ? | |
| document_type is "invoice_doc" (not in enum) | ? | |
| calculated_total differs from stated_total | ? | |
| confidence score is 1.5 (out of range) | ? | |
| Author field is null for a document with no author | ? | |

## Part 2: Implement the Retry Loop (25 minutes)

Build a function `extractWithRetry(documentText)` that:

1. Sends the document to Claude with forced tool selection
2. Validates the extraction result
3. If valid: returns `{ status: "success", extraction, attempts }`
4. If only non-retryable errors: returns `{ status: "partial", extraction, errors }`
5. If retryable errors exist and attempts remain:
   - Builds a retry message with:
     - Reference to the original document (already in history)
     - The specific validation errors that need fixing
   - Sends the retry message and validates again
6. After MAX_RETRIES: returns `{ status: "max_retries", extraction, errors }`

Requirements:
- Maximum 2 retries (3 total attempts)
- Track all errors in an `errorLog` array
- Each error log entry includes: `{ attempt, rule, message, errorType, pattern }`

## Part 3: Test with Edge Cases (15 minutes)

Test your retry loop against these documents:

1. **Clean invoice** -- all fields present, totals correct
   Expected: success on attempt 1

2. **Receipt with no date** -- valid extraction but date is null
   Expected: success on attempt 1 (null is valid for absent fields)

3. **Contract with conflicting total** -- stated $100K, calculated $108K
   Expected: success if conflict_detected is true; retry if it is false

4. **Ambiguous document** -- unclear type, minimal fields
   Expected: partial result with non-retryable errors for absent fields

## Part 4: Error Pattern Analysis (10 minutes)

After running all test documents:

1. Aggregate error patterns across all documents
2. Calculate per-pattern statistics:
   ```
   {
     "date-format-mismatch": { total: 3, resolved_by_retry: 3 },
     "missing-required-field": { total: 1, resolved_by_retry: 1 },
     "info-absent-from-source": { total: 4, resolved_by_retry: 0 }
   }
   ```
3. Identify which patterns suggest prompt improvements vs. source data issues

## Success Criteria

- [ ] At least 6 validation rules with correct retryable/non-retryable classification
- [ ] Retry loop sends original document + failed extraction + specific errors
- [ ] Non-retryable errors are accepted immediately (no wasted retries)
- [ ] Maximum retry count is enforced
- [ ] Error log tracks all errors across all attempts
- [ ] Self-correction validation (stated vs. calculated) is included
- [ ] Pattern analysis identifies systematic issues

## Exam Tip

The exam tests the distinction between retryable and non-retryable errors:

- **Retryable:** The information EXISTS in the source but Claude's output has
  a format or structural issue. Sending error feedback helps Claude fix it.

- **Non-retryable:** The information does NOT EXIST in the source. Retrying
  either produces the same null (correct but unchanged) or fabricates a value
  (hallucination). The correct approach is to accept the partial result.

A common distractor is a retry loop that retries ALL errors, including ones
where the information is absent from the source. This wastes tokens and may
increase hallucination if Claude "tries harder" to fill in missing fields.
