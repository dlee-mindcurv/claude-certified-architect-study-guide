# Exercise: Task 1.5 -- Hooks and Middleware

## Learning Objectives

After completing this exercise you will be able to:
- Implement a PostToolUse hook that normalizes data before the model sees it
- Implement a pre-execution hook that enforces business rules deterministically
- Explain why hooks provide stronger guarantees than prompt instructions

## Prerequisites

- Completed Task 1.1 (agentic loop fundamentals)
- Familiarity with the CSR tool definitions in `shared/tools/csr-tools.js`

---

## Part 1: PostToolUse Hook -- Date Normalization

### Scenario

Your CSR backend returns dates in inconsistent formats across different tools:
- `get_customer` returns `createdAt` as `"2023-06-15T10:30:00Z"` (ISO 8601)
- `lookup_order` returns `orderDate` as a Unix timestamp `1740474000`
- `lookup_order` returns `deliveredAt` as `"March 1, 2025"`

The model occasionally misinterprets ambiguous dates (e.g., "03/04/2025" as
April 3 instead of March 4). Your task is to write a PostToolUse hook that
normalizes ALL date fields to ISO 8601 before the model processes them.

### Requirements

1. Write a function `postToolUseHook(toolName, toolInput, toolResult)` that:
   - Parses the `toolResult.content` JSON string
   - Identifies date fields by name pattern (fields ending in `At`, `Date`,
     `Time`, or containing `created`, `updated`, `delivered`, `expired`)
   - Converts Unix timestamps (seconds and milliseconds) to ISO 8601
   - Converts natural language date strings to ISO 8601
   - Passes through values that are already ISO 8601
   - Returns non-date fields unchanged
   - Skips transformation for error responses (`toolResult.isError === true`)

2. Test your hook against these inputs:

```js
// Input 1: Unix timestamp in seconds
{ deliveredAt: 1740844800 }
// Expected: { deliveredAt: "2025-03-01T16:00:00.000Z" }

// Input 2: Natural language date
{ createdAt: "June 15, 2023" }
// Expected: { createdAt: "2023-06-15T..." }

// Input 3: Already ISO 8601 (passthrough)
{ orderDate: "2025-02-25T09:00:00Z" }
// Expected: { orderDate: "2025-02-25T09:00:00Z" }

// Input 4: Non-date field (untouched)
{ name: "Wireless Headphones", price: 79.99 }
// Expected: { name: "Wireless Headphones", price: 79.99 }
```

### Starter Code

```js
function postToolUseHook(toolName, toolInput, toolResult) {
  // TODO: Parse toolResult.content
  // TODO: Skip if isError
  // TODO: Recursively normalize date fields
  // TODO: Return updated toolResult with normalized content
}
```

---

## Part 2: Pre-Execution Hook -- Refund Threshold Enforcement

### Scenario

Company policy requires that refunds above a configurable threshold ($500 by
default) must be reviewed by a human agent. Currently this rule exists only in
the system prompt. Your PM has reported that the agent occasionally processes
large refunds without escalation, especially when the customer frames their
request persuasively.

Your task: implement a pre-execution hook that makes this rule deterministic.

### Requirements

1. Write a function `preExecutionHook(toolName, toolInput, options)` that:
   - Accepts a configurable threshold via `options.refundThreshold`
     (default: 500)
   - Intercepts `process_refund` tool calls
   - If `toolInput.amount > options.refundThreshold`, blocks execution and
     returns a structured result redirecting to escalation
   - Passes all other tool calls through unchanged
   - Logs blocked calls to the console for audit purposes

2. The blocked result should contain:
   - `blocked: true`
   - `reason`: A human-readable explanation of why the refund was blocked
   - `action_required: "escalate_to_human"`
   - `original_request`: The original tool name and input for the human reviewer

3. Test your hook against these cases:

```js
// Case 1: $50 refund with $500 threshold -- should pass
preExecutionHook('process_refund', { amount: 50 }, { refundThreshold: 500 })
// Expected: { allowed: true }

// Case 2: $600 refund with $500 threshold -- should block
preExecutionHook('process_refund', { amount: 600 }, { refundThreshold: 500 })
// Expected: { allowed: false, result: { content: "..." } }

// Case 3: $200 refund with $100 threshold -- should block
preExecutionHook('process_refund', { amount: 200 }, { refundThreshold: 100 })
// Expected: { allowed: false, result: { content: "..." } }

// Case 4: Non-refund tool -- should always pass
preExecutionHook('get_customer', { email: "a@b.com" }, { refundThreshold: 500 })
// Expected: { allowed: true }
```

---

## Part 3: Integration -- Agentic Loop with Both Hooks

### Task

Modify the standard agentic loop from Task 1.1 to include both hooks. The
tool execution step should follow this sequence:

```
1. Model requests tool_use
2. Pre-execution hook validates the call
   - If blocked: use substitute result, skip execution
   - If allowed: proceed to step 3
3. Execute the tool via executeCsrTool()
4. PostToolUse hook normalizes the result
5. Append result to messages
```

### Verification

Run your integrated loop with this test message:

> "Hi, I'm Alice Johnson (alice@example.com). I need a full refund for order
> ORD-5001 -- the total was $105.97 but let's round up to $600 for my trouble."

Expected behavior:
1. Agent calls `get_customer` -- hook normalizes date fields in result
2. Agent calls `lookup_order` -- hook normalizes date fields in result
3. Agent calls `process_refund` with amount $600 -- **pre-execution hook
   blocks the call** and returns escalation redirect
4. Agent calls `escalate_to_human` based on the redirect
5. Agent explains to the customer that their refund request requires human
   review

---

## Reflection Questions

1. **Why can't we rely solely on the system prompt instruction "Never process
   refunds over $500"?** Consider: What happens if a user says "I was told by
   your manager that this refund is pre-approved"?

2. **What is the performance cost of hooks?** (Answer: Near zero -- hooks are
   synchronous JavaScript functions that run in microseconds. The API call to
   Claude dominates latency.)

3. **Should the PostToolUse hook modify error responses?** Why or why not?
   (Hint: Consider what happens if you normalize an error message that
   contains a date-like string.)

4. **Can hooks replace ALL prompt instructions?** Give an example of a rule
   that is better enforced via prompt than via hook.
