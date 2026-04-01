# Task 5.1: Preserve Critical Context Across Extended Conversations

## Exam Relevance
Tested in Scenario 1 (CSR Agent). Assessed skill: S1.

## The Problem: Context Degrades Over Long Conversations

Claude's context window is large, but not infinite. More importantly, even within
the window, the model's attention is not uniform. Three specific failure modes
threaten context reliability in extended interactions:

### 1. Progressive Summarization Risks

When conversations grow long enough to require summarization (or when earlier
messages are compressed to fit new ones), specific details get lost:

- **Numbers become ranges:** "$105.97 refund for order ORD-5001" becomes
  "a refund was discussed for one of the customer's orders"
- **Dates become relative:** "delivered on March 1, 2025" becomes
  "delivered recently"
- **Identifiers disappear:** "Customer C-1001 (Gold tier)" becomes
  "the customer"

This is especially dangerous in CSR scenarios where exact order numbers, refund
amounts, and customer IDs are load-bearing facts.

### 2. The "Lost in the Middle" Effect

Research shows that language models attend more strongly to information at the
beginning and end of their context window, with weaker attention to content in
the middle. In a 20-turn CSR conversation, the customer details verified in turn
2 sit in the middle by turn 15 -- exactly where attention is weakest.

### 3. Tool Result Accumulation

Each tool call returns structured data that gets appended to the conversation
history. After several get_customer, lookup_order, and process_refund calls, the
raw tool results can consume thousands of tokens. Much of this is verbose
metadata that was useful for one decision but is not needed going forward.

## The Solution: Persistent Case Facts Block

The case facts block pattern addresses all three failure modes:

```
┌─────────────────────────────────────────────────┐
│  System Prompt                                   │
│  ┌───────────────────────────────────────────┐   │
│  │ ## Current Case Facts                      │   │
│  │ - Customer: Alice Johnson (C-1001, Gold)   │   │
│  │ - Orders: ORD-5001 ($105.97, delivered)    │   │
│  │ - Actions: Verified identity, looked up    │   │
│  │   order, initiated refund                  │   │
│  │ - Open: Awaiting refund confirmation       │   │
│  └───────────────────────────────────────────┘   │
│  [rest of system prompt]                         │
├─────────────────────────────────────────────────┤
│  Conversation Messages (may be summarized)       │
│  Turn 1: User asks about order...                │
│  Turn 2: Agent verifies customer...              │
│  ...                                             │
│  Turn N: Current turn                            │
└─────────────────────────────────────────────────┘
```

### Why This Works

1. **Placement at the beginning**: The case facts block sits in the system prompt,
   which is always at the start of the context window -- the highest-attention
   zone. It never drifts to the middle.

2. **Outside summarized history**: Even if the conversation history is summarized
   or truncated, the case facts block is independently maintained and re-injected
   fresh each turn.

3. **Structured extraction**: After each tool call, relevant fields are extracted
   into the block. Verbose tool outputs can then be trimmed to reduce token waste.

4. **Explicit section headers**: Key findings use clear headers (## Current Case
   Facts) so Claude can locate them reliably even in long contexts.

### Implementation Strategy

After each tool call in the agentic loop:

1. **Extract** key facts from the tool result (customer ID, order details, etc.)
2. **Update** the case facts data structure
3. **Rebuild** the system prompt with the current case facts block injected at
   the beginning
4. **Trim** verbose tool results to only the fields needed for subsequent decisions

### Anti-Patterns

- **Relying on conversation memory alone**: Without explicit case facts, Claude
  must reconstruct details from scattered tool results across multiple turns.
- **Including the full case facts block in the user message**: This wastes the
  high-attention zone at the start. Put it in the system prompt.
- **Only updating case facts at the end**: Update after EACH tool call, not just
  at the end. Intermediate facts (e.g., customer tier discovered during lookup)
  inform subsequent decisions.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Working agentic loop with case facts extraction and injection |
| `exercise.md` | Hands-on exercise comparing accuracy with and without case facts |
| `scenario-1-csr/case-facts-block.js` | CSR-specific case facts implementation |
