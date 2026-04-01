# Task 5.3: Propagate Errors with Structured Context

## Exam Relevance
Tested in Scenario 3 (Research Coordinator). Assessed skill: S3.

## The Problem: Errors Without Context Are Useless

In multi-agent systems, subagents fail. Searches time out, APIs return errors,
documents are unavailable. How these failures are communicated to the coordinator
determines whether the system recovers intelligently or fails blindly.

### Generic Error Statuses Hide Valuable Context

Consider a subagent that returns:
```json
{ "error": true, "message": "Search failed" }
```

The coordinator cannot determine:
- **What** was being searched (to retry or rephrase)
- **Why** it failed (timeout vs. rate limit vs. invalid query)
- **Whether** partial results were obtained before the failure
- **What** alternative approaches might work

### Empty Results vs. Errors: A Critical Distinction

These two outcomes look similar but require completely different responses:

**Empty results (valid outcome):**
```json
{
  "query": "quantum computing in agriculture",
  "results": [],
  "totalResults": 0,
  "message": "No results found for this query"
}
```
This is NOT an error. The search worked correctly; the topic simply has no
coverage. The coordinator should note this as a coverage gap in the final report.

**Error (service failure):**
```json
{
  "isError": true,
  "failureType": "timeout",
  "attemptedQuery": "quantum computing in agriculture",
  "partialResults": [],
  "alternatives": ["Try broader query: 'quantum computing applications'"]
}
```
This IS an error. The search did not complete. The coordinator should retry
with alternatives or note that this area could not be investigated.

## The Solution: Structured Error Context

Every subagent failure should return a structured error object with four fields:

### 1. failureType
What kind of failure occurred:
- `timeout` -- Service did not respond in time
- `rate_limit` -- Too many requests
- `access_denied` -- Insufficient permissions
- `invalid_query` -- Query was malformed
- `service_unavailable` -- Backend is down
- `partial_failure` -- Some results obtained before failure

### 2. attemptedQuery
The exact query or operation that failed. This enables:
- Retry with the same query (for transient errors)
- Rephrasing (for invalid queries)
- Logging (for debugging)

### 3. partialResults
Any results obtained before the failure. In a search that times out after
returning 2 of 5 pages, those 2 pages of results are still valuable.

### 4. alternatives
Suggested recovery actions:
- "Retry with a more specific query"
- "Try a different data source"
- "Break the query into sub-queries"

## Coordinator Recovery Strategies

When the coordinator receives a structured error:

```
┌──────────────────────────────────────────────────┐
│ failureType = timeout                             │
│ attemptedQuery = "AI creative industries"         │
│ partialResults = [2 results]                      │
│ alternatives = ["Retry", "Narrower query"]        │
└──────────────────┬───────────────────────────────┘
                   │
    ┌──────────────┴──────────────┐
    │   Coordinator Decision       │
    │                              │
    │   1. Use partial results     │
    │   2. Retry (if transient)    │
    │   3. Try alternative query   │
    │   4. Mark as coverage gap    │
    └──────────────────────────────┘
```

### Decision Logic

| failureType | Has Partial Results? | Action |
|-------------|---------------------|--------|
| timeout | Yes | Use partials, retry for remaining |
| timeout | No | Retry once, then mark gap |
| rate_limit | Any | Wait and retry |
| access_denied | Any | Try alternative source, mark gap |
| invalid_query | Any | Rephrase and retry |
| service_unavailable | Any | Mark gap, proceed with other sources |

### Don't Suppress Errors OR Terminate on Single Failure

Two anti-patterns to avoid:

**Suppressing errors** (pretending they did not happen):
```js
// ANTI-PATTERN: Silently ignoring subagent failure
const results = await Promise.allSettled(subagentTasks);
const successful = results.filter(r => r.status === 'fulfilled');
// The failed subagents are invisible in the final output
```

**Terminating on single failure** (giving up entirely):
```js
// ANTI-PATTERN: Failing the whole report because one source timed out
const results = await Promise.all(subagentTasks); // Throws on any failure
```

The correct approach: capture errors, attempt recovery, and annotate the final
output with coverage gaps where recovery was not possible.

## Coverage Annotations in Final Output

The final report should explicitly note what was and was not covered:

```markdown
## Coverage

### Well-Supported Topics
- AI in visual arts (3 sources, high confidence)
- AI in music production (2 sources, medium confidence)

### Coverage Gaps
- AI in gaming industry: Search subagent timed out. 2 partial results
  available but topic is underrepresented.
- AI in publishing: No sources found (valid empty result, not an error).
```

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Working error propagation with coordinator recovery |
| `exercise.md` | Simulate subagent timeout, verify recovery and annotations |
| `scenario-3-research/error-context.js` | Research system error propagation |
