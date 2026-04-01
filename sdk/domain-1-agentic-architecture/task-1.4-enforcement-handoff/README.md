# Task 1.4: Implement Enforcement and Handoff

## Exam Relevance
Tested primarily in Scenario 1 (CSR Agent).

## Core Principle: Programmatic Enforcement vs. Prompt-Based Guidance

The exam distinguishes between two approaches to workflow constraints:

### Prompt-Based Guidance (Necessary but Insufficient)

The system prompt tells Claude what it SHOULD do:

```
"ALWAYS verify customer identity via get_customer BEFORE any order lookups"
```

This works most of the time, but:
- Claude can deviate under ambiguous conditions
- There is no guarantee the constraint will be followed every time
- A prompt injection could potentially override it
- There is no audit trail of enforcement

### Programmatic Enforcement (Required for Critical Constraints)

Code that PREVENTS incorrect behavior regardless of what the model decides:

```js
if (toolName === 'process_refund' && !toolCallHistory.includes('get_customer')) {
  return { blocked: true, reason: 'Must verify customer before processing refund' };
}
```

This is deterministic, auditable, and cannot be bypassed by the model.

**Exam rule of thumb:** If a constraint involves safety, compliance, or data
integrity, it MUST be enforced programmatically, not just in the prompt.

## Prerequisite Gates

A prerequisite gate is a programmatic check that blocks a tool call unless
required prior steps have been completed.

### CSR Example: Refund Prerequisites

```
get_customer → lookup_order → process_refund
    (1)            (2)             (3)

Gate: process_refund is BLOCKED unless:
  - get_customer has been called successfully (customer verified)
  - lookup_order has been called with that customer's ID
```

### Implementation Pattern

```js
const prerequisites = {
  'process_refund': {
    requires: ['get_customer', 'lookup_order'],
    message: 'Cannot process refund without verifying customer and order first.',
  },
  'lookup_order': {
    requires: ['get_customer'],
    message: 'Cannot look up order without verifying customer first.',
  },
  'escalate_to_human': {
    requires: [],  // No prerequisites — can always escalate
    message: null,
  },
};
```

### Where Gates Are Enforced

Gates can be enforced at two points in the agentic loop:

1. **PreToolUse hook** (Agent SDK) — fires before the tool executes
2. **In-loop check** (Raw API) — custom code before calling `executeTool()`

When a gate blocks a tool call, the enforcement code returns a
`tool_result` with `is_error: true` and an explanation. Claude then
adjusts its behavior (usually by calling the missing prerequisite first).

## Structured Handoff Summaries

When an agent escalates to a human (or another agent), it must produce a
**structured handoff summary** that preserves context. An unstructured
"I'm passing this to a human" is insufficient.

### Required Fields

```json
{
  "customer": {
    "id": "C-1001",
    "name": "Alice Johnson",
    "tier": "gold"
  },
  "issue": "Customer requests competitor price match (Amazon)",
  "actions_taken": [
    "Verified customer identity",
    "Looked up order ORD-5001",
    "Determined request is outside policy (competitor price matching)"
  ],
  "recommended_action": "Review for policy exception — competitor price match",
  "priority": "medium",
  "context": {
    "orders_discussed": ["ORD-5001"],
    "refund_processed": false,
    "customer_sentiment": "neutral"
  }
}
```

### Why Structure Matters

- The receiving agent (human or automated) can immediately understand the state
- No information is lost in the handoff
- The handoff is auditable and machine-parsable
- Priority routing is possible based on structured fields

## Files in This Directory

| File | Description |
|------|-------------|
| `example-agent-sdk.js` | Hook-based prerequisite enforcement |
| `example-raw-api.js` | Manual prerequisite checking in the loop |
| `exercise.md` | Implement gates and test bypass attempts |
| `scenario-1-csr/workflow-gates.js` | Full CSR workflow with gates |
