# Task 1.5: Implement Hooks and Middleware

## Exam Relevance
Tested in Scenario 1 (CSR Agent). Hooks are the mechanism for enforcing
business rules with deterministic guarantees rather than relying on prompt
compliance alone.

## Core Concept: Deterministic vs. Probabilistic Enforcement

The central exam distinction for Task 1.5 is between two approaches to
enforcing business rules in agentic systems:

| Approach | Mechanism | Guarantee Level | Example |
|----------|-----------|-----------------|---------|
| **Hooks (deterministic)** | Code that runs before or after every tool call | 100% -- cannot be bypassed | Block refunds > $500 in code |
| **Prompts (probabilistic)** | Instructions in the system prompt | ~95-99% -- model may ignore | "Never process refunds over $500" |

**When to use hooks over prompts:** Any business rule that requires guaranteed
compliance. Financial thresholds, PII redaction, audit logging, data format
normalization -- these must never be skipped, regardless of how the model
interprets a request. Hooks execute as code in your orchestration layer, so
they cannot be circumvented by prompt injection or model hallucination.

**When prompts are sufficient:** Soft guidelines, tone preferences, response
formatting suggestions -- areas where occasional deviation is acceptable and
the consequence of non-compliance is low.

## Hook Types in the Agent SDK

### PostToolUse Hooks

A PostToolUse hook intercepts the result returned by a tool **before** the
model sees it. This is the place to transform, normalize, or enrich tool
output.

```
Tool executes  -->  PostToolUse hook  -->  Model receives transformed result
```

Use cases:
- **Date normalization:** Convert Unix timestamps, locale-specific date strings,
  and mixed formats into a single canonical format (ISO 8601) so the model
  always sees consistent data.
- **Currency normalization:** Convert "$79.99" strings to numeric 79.99 so the
  model can perform reliable arithmetic.
- **Status code mapping:** Convert internal codes (1, 2, 3) to human-readable
  strings ("pending", "shipped", "delivered") so the model can reason about
  them naturally.
- **PII redaction:** Strip sensitive fields before the model processes the
  result.

### Pre-Execution Hooks

A pre-execution hook intercepts an outgoing tool call **before** it reaches
the tool. This is where you enforce compliance gates.

```
Model requests tool_use  -->  Pre-execution hook  -->  Tool executes (or blocked)
```

Use cases:
- **Refund threshold enforcement:** Block `process_refund` calls where the
  amount exceeds a policy limit and redirect to escalation.
- **Prerequisite verification:** Ensure `get_customer` was called before
  `process_refund` (complementing prompt-based instructions with a hard gate).
- **Rate limiting:** Prevent the model from calling the same tool repeatedly
  in a tight loop.
- **Audit logging:** Record every tool invocation for compliance review.

### Why Hooks Provide Deterministic Guarantees

Hooks are ordinary functions in your orchestration code. They run on every
tool call unconditionally -- the model has no ability to skip, disable, or
argue against them. Compare this to a prompt instruction like "Do not process
refunds over $500," which the model will usually follow but could violate
under adversarial prompting, complex multi-step reasoning, or edge cases
the prompt author did not anticipate.

The exam tests this distinction directly. If a question asks how to
**guarantee** a business rule is enforced, the answer involves hooks or
programmatic checks -- never prompt instructions alone.

## Architecture: Where Hooks Sit in the Agentic Loop

```
while (stop_reason !== "end_turn") {
    response = await claude.messages.create(...)

    for each tool_use block in response:
        1. PRE-EXECUTION HOOK  -- validate/block/modify the tool call
        2. Execute the tool     -- call the actual backend
        3. POST-TOOL-USE HOOK  -- normalize/transform the result
        4. Append result to messages

    Loop back to Claude with updated messages
}
```

Hooks wrap the tool execution step. They do not modify the model's reasoning
or the system prompt -- they operate on the data flowing between the model
and the tools.

## Files in This Directory

| File | Description |
|------|-------------|
| `example-agent-sdk.js` | Working hook implementations with the Agent SDK |
| `exercise.md` | Hands-on exercise for building hooks |
| `scenario-1-csr/post-tool-use-hook.js` | Full CSR PostToolUse hook with normalization and enforcement |
