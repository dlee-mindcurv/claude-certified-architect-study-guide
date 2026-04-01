# Task 4.4: Implement Validation-Retry Loops

## Exam Relevance
Tested in Scenario 6 (Data Extraction).

## The Retry-with-Error-Feedback Pattern

The validation-retry pattern sends Claude's output through a validation step,
and if validation fails, sends a follow-up message containing:
1. The original document
2. The failed extraction
3. The specific validation error

This gives Claude the context to understand what went wrong and correct it.

### Basic Pattern

```
1. Send document to Claude for extraction
2. Validate the extraction result
3. If valid: accept
4. If invalid:
   a. Classify the error as retryable or not
   b. If retryable: send follow-up with error details, go to step 2
   c. If not retryable: accept partial result with error flag
5. Safety: limit retries (typically 2-3 max)
```

## When Retries Are Effective vs. Ineffective

### Retryable Errors (worth retrying)

- **Format mismatches:** Date in "March 15" instead of "2025-03-15"
- **Missing required fields:** Claude forgot to include document_type
- **Confidence too low:** Claude marked confidence 0.5 but the info is clearly present
- **Calculation errors:** calculated_total does not match line items sum
- **Enum violations:** Used "invoice_document" instead of "invoice"

These errors are fixable because the information EXISTS in the source and
Claude has the ability to correct its output.

### Non-Retryable Errors (wasting tokens to retry)

- **Information absent from source:** No date in the document, Claude returned null
- **Source is ambiguous:** Two conflicting dates in the document
- **Structural impossibility:** Document is an image description, not parseable text

Retrying these errors produces one of two outcomes:
1. Claude returns null again (correct but unchanged)
2. Claude fabricates a value to satisfy the retry request (hallucination)

Neither outcome is useful. The correct approach is to accept the partial
result with an error flag and route to human review.

## detected_pattern for False Positive Analysis

The `detected_pattern` field serves double duty in validation:

1. **In code review (Scenario 5):** Tracks which review categories produce
   false positives, enabling per-category suppression.

2. **In extraction validation (Scenario 6):** Tracks which validation errors
   are systematic. If a specific error pattern recurs across documents, it
   suggests a prompt improvement rather than individual retries.

Example tracking:
```js
{
  "date-format-mismatch": { total: 45, resolved_by_retry: 42, unresolvable: 3 },
  "missing-total": { total: 12, resolved_by_retry: 0, unresolvable: 12 }
}
```

This data reveals that date format mismatches are a prompt issue (add a few-shot
example) while missing totals are a source data issue (accept as partial).

## Self-Correction Validation

The most powerful validation pattern is self-correction, where Claude extracts
BOTH a stated value and an independently calculated value:

```
stated_total: 499.50    (read directly from the document)
calculated_total: 499.50  (sum of line items + tax)
conflict_detected: false  (they match)
```

When these values conflict:
```
stated_total: 100000     (from the document)
calculated_total: 108000  (24 months x $4,500)
conflict_detected: true   (mismatch -- flag for review)
```

This pattern:
- Catches transcription errors without a separate validation pass
- Identifies documents with internal inconsistencies
- Provides a built-in quality signal for human review routing

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Validation-retry loop with retryable vs. non-retryable classification |
| `exercise.md` | Implement a retry loop with error tracking |
| `scenario-6-extraction/retry-loop.js` | Full extraction retry pipeline |
