# Exercise: Context Preservation with Persistent Case Facts

## Objective

Build a conversation handler that maintains a persistent case facts block across
a 10-turn customer support interaction. Compare the agent's accuracy with and
without case facts preservation to demonstrate the impact of the pattern.

## Setup

Use the shared CSR tools and system prompt:
```js
import { csrToolDefinitions, executeCsrTool } from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';
```

## Part 1: Build the Case Facts Handler

Create a module that:

1. **Defines a `caseFacts` data structure** with fields for:
   - Customer identity (id, name, email, tier)
   - Orders discussed (orderId, total, status, delivery date)
   - Actions taken (list of action descriptions)
   - Open issues (what still needs resolution)
   - Refunds processed (refundId, amount, status)

2. **Implements `extractFacts(toolName, toolInput, toolResult)`** that updates
   the case facts after each tool call. Handle:
   - `get_customer`: Extract customer identity fields
   - `get_customer` with multiple matches: Note the ambiguity as an open issue
   - `lookup_order`: Add order to the orders list (deduplicate by orderId)
   - `process_refund`: Add refund details, resolve related open issues
   - `escalate_to_human`: Record the escalation ticket

3. **Implements `renderCaseFactsBlock(caseFacts)`** that produces a markdown
   block like:
   ```
   ## Current Case Facts (verified this session)
   - **Customer:** Alice Johnson (C-1001, Gold tier, alice@example.com)
   - **Orders discussed:** ORD-5001 ($105.97, delivered, delivered 2025-03-01)
   - **Actions taken:** Verified customer; Looked up order ORD-5001
   - **Open issues:** Customer requesting full refund
   ```

4. **Implements `buildSystemPrompt(caseFacts)`** that places the case facts
   block at the BEGINNING of the system prompt (before the base prompt content).

## Part 2: Build the Agent Loop with Case Facts

Modify the standard agentic loop to:

1. Create empty case facts before the loop starts
2. After each tool call, extract facts and update the case facts object
3. Before each API call, rebuild the system prompt with the current case facts
4. Trim verbose tool results to only the fields needed going forward

## Part 3: Simulate a 10-Turn Conversation

Create a multi-turn test scenario with these sequential user messages:

```
Turn 1: "Hi, I'm Alice. I have a problem with my recent order."
Turn 3: "My email is alice@example.com"
Turn 5: "It's order ORD-5001, the headphones arrived damaged"
Turn 7: "I'd like a full refund please"
Turn 9: "Also, can you check on my other order ORD-5002?"
```

(Odd-numbered turns are user messages; even-numbered turns are agent responses
involving tool calls.)

## Part 4: Compare With and Without Case Facts

Run the same 10-turn scenario twice:

### Run A: Without case facts (baseline)
- Use the standard system prompt without case facts injection
- Do NOT trim tool results
- After all 10 turns, ask Claude: "Can you summarize the customer's name, their
  customer ID, the exact order total, and what actions you've taken?"

### Run B: With case facts
- Use the case facts pattern from Parts 1-2
- Trim tool results after extraction
- Ask the same summary question after 10 turns

### Evaluation Criteria

For each run, check whether Claude correctly recalls:

| Fact | Expected Value |
|------|---------------|
| Customer name | Alice Johnson |
| Customer ID | C-1001 |
| Customer tier | Gold |
| Order ORD-5001 total | $105.97 |
| Order ORD-5001 status | delivered |
| Order ORD-5002 status | shipped |
| Refund amount | $105.97 |
| Number of tool calls made | (actual count) |

## Expected Observations

- **Without case facts**: Claude is more likely to get specific values wrong
  (e.g., rounding the order total, confusing order statuses) as the conversation
  grows longer and tool results accumulate.
- **With case facts**: The structured block at the beginning of the system prompt
  provides a reliable reference that Claude attends to strongly, even after many
  turns.

## Bonus: Token Budget Comparison

Track the total token usage for both runs. The case facts version should use
fewer input tokens despite providing better accuracy, because trimmed tool
results offset the cost of the case facts block.

## Deliverables

1. `case-facts-handler.js` -- The case facts module (extract, render, build)
2. `comparison-runner.js` -- Script that runs both versions and compares results
3. A brief write-up of which facts each version got right/wrong after 10 turns
