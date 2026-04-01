# Task 2.2: Design Structured Error Responses

## Exam Relevance
Tested in Scenarios 1 (CSR Agent) and 3 (Research Coordinator). Maps to Skills S1, S3.

## Why Generic Errors Prevent Recovery

When a tool returns `"Operation failed"`, the agent has no basis for deciding
what to do next. Should it retry? Fix the input? Explain to the user? Escalate?
A generic error message gives Claude no actionable signal.

Structured errors solve this by providing machine-readable metadata alongside
the human-readable message.

## MCP Error Response Structure

The Model Context Protocol defines a standard error pattern:

```js
{
  isError: true,          // Signals tool failure to the agent
  content: JSON.stringify({
    errorCategory: 'transient',   // Why it failed
    isRetryable: true,            // Can the agent try again?
    message: 'Database temporarily unavailable. Please retry.'
  })
}
```

### The isError Flag

Setting `isError: true` on the tool result tells Claude that the tool call
failed. Without this flag, Claude may interpret error messages in the content
as successful results and present error details to the user as if they were
the requested information.

```js
// WITHOUT isError — Claude may treat this as a successful result
{ content: '{"error": "Customer not found"}' }
// Claude might say: "Your customer information is: error - Customer not found"

// WITH isError — Claude knows to attempt recovery
{ isError: true, content: '{"errorCategory": "validation", ...}' }
// Claude knows to try a different identifier or ask the user
```

## Error Categories

Four categories cover the full range of tool failures. Each maps to a
different recovery strategy:

### transient (Retry with Backoff)
Temporary failures that will resolve on their own: timeouts, rate limits,
service unavailability, network errors.

```js
{
  errorCategory: 'transient',
  isRetryable: true,
  message: 'Customer database temporarily unavailable. Please retry.',
}
```

**Agent behavior:** Retry the same call (up to a reasonable limit). No need
to modify input. Consider exponential backoff in production.

### validation (Fix Input and Retry)
The input was malformed or missing required fields: wrong ID format, invalid
email, missing parameters.

```js
{
  errorCategory: 'validation',
  isRetryable: false,
  message: 'Customer ID must be in format C-XXXX. Received: "12345"',
}
```

**Agent behavior:** Parse the error message, fix the input format, and retry
with corrected parameters. If the fix is unclear, ask the user for
clarification.

### business (Explain to User, Do Not Retry)
A business rule prevented the operation: the order is not eligible for refund,
the amount exceeds a limit, a policy restriction applies.

```js
{
  errorCategory: 'business',
  isRetryable: false,
  message: 'Order ORD-5002 is in "shipped" status. Only delivered orders can be refunded.',
}
```

**Agent behavior:** Do NOT retry with the same or modified input. Explain the
business rule to the user in clear language. Offer alternatives if possible
(e.g., "Once your order is delivered, you can request a refund").

### permission (Verify Identity or Escalate)
The operation was not authorized: wrong customer, insufficient access level,
account locked.

```js
{
  errorCategory: 'permission',
  isRetryable: false,
  message: 'Order ORD-5003 does not belong to customer C-1001',
}
```

**Agent behavior:** Do NOT retry. Verify that the customer identity is correct.
If the customer insists the order is theirs, escalate to a human agent.

## The isRetryable Boolean

This field prevents the agent from wasting tokens on futile retries:

| errorCategory | isRetryable | Agent Action |
|---------------|-------------|--------------|
| transient     | true        | Retry same call with backoff |
| validation    | false       | Fix input, then retry |
| business      | false       | Explain to user, do not retry |
| permission    | false       | Verify identity or escalate |

Note: `validation` errors are marked `isRetryable: false` because the SAME
input should not be retried. The agent must FIX the input first -- that is a
new call, not a retry.

## Structured Metadata for Recovery

Beyond the core fields, errors can include additional context that helps the
agent recover:

```js
{
  errorCategory: 'transient',
  isRetryable: true,
  message: 'Search service timed out after 30s',
  // Additional recovery context:
  attempted_query: 'AI creative industries',
  partial_results: [],
  alternative_approaches: [
    'Retry with a more specific query',
    'Try breaking the query into sub-queries',
  ],
}
```

This metadata lets the agent make informed recovery decisions rather than
blindly retrying.

## Error Propagation in Multi-Agent Systems

In coordinator-subagent architectures (Scenario 3), errors from subagent tool
calls must propagate up to the coordinator with enough context for routing
decisions:

```js
{
  errorCategory: 'transient',
  isRetryable: true,
  message: 'Web search subagent timed out',
  subagent: 'search-agent',
  failedTask: 'Search for AI in visual arts',
  partialResults: [...],     // What was found before failure
  alternatives: [...]         // Suggested recovery approaches
}
```

The coordinator can then decide to retry the subagent, reassign the task, or
proceed with partial results.

## Anti-Patterns

**1. Generic error strings**
```js
{ isError: true, content: 'Something went wrong' }
```
Gives Claude no recovery path.

**2. Missing isError flag**
```js
{ content: '{"error": "Not found"}' }
```
Claude may treat this as a successful response.

**3. All errors marked as retryable**
```js
{ isRetryable: true }  // Even for business rule violations
```
Causes infinite retry loops for non-transient failures.

**4. Error messages without context**
```js
{ message: 'Invalid input' }
```
Claude cannot fix the input without knowing what was wrong.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Agent loop with structured error handling for all categories |
| `exercise.md` | Implement error responses for 3 failure types |
| `scenario-1-csr/error-responses.js` | CSR error handling for all 4 tools |
| `scenario-3-research/error-propagation.js` | Research system error propagation |
