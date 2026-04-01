# Exercise: Build Escalation Criteria with Few-Shot Examples

## Objective

Create a system prompt with explicit escalation criteria encoded as few-shot
examples. Test it against edge cases to verify that escalation decisions are
based on categorical triggers, not sentiment or confidence heuristics.

## Setup

Use the shared CSR tools:
```js
import { csrToolDefinitions, executeCsrTool } from '../../../shared/tools/csr-tools.js';
```

## Part 1: Write 4 Few-Shot Escalation Examples

Write a system prompt that includes exactly 4 few-shot examples. Each example
must cover a different escalation type and follow this format:

```
### Example N: [RESOLVE/ESCALATE] — [Brief category]
Customer: "[exact customer message]"
Correct action: [what the agent should do]
Reasoning: [why this action, why NOT the alternative]
```

Your 4 examples must cover these categories:

### Example A: Resolve — Issue within capability but customer sounds upset
The customer is clearly frustrated (uses strong language) but the underlying
issue is a standard order status inquiry. The agent should resolve, not escalate.

**Key point:** Frustration alone is NOT an escalation trigger.

### Example B: Escalate — Customer explicitly requests human agent
The customer politely but clearly asks for a human. The agent should escalate
immediately without investigating.

**Key point:** Explicit request = immediate honor. Do not investigate first.

### Example C: Escalate — Policy gap requiring human judgment
The customer requests something outside the defined policy (e.g., warranty
extension, competitor price match, combining promotions). The agent should
escalate with context.

**Key point:** Escalate rather than deny. A human may grant an exception.

### Example D: Resolve — High-value transaction with system-managed approval
The customer requests a refund that exceeds the auto-approval threshold. The
system handles the approval routing (returns `pending_approval`). The agent
should process normally and inform the customer of the timeline.

**Key point:** System-managed approval is NOT an escalation trigger.

## Part 2: Write the Anti-Pattern Warnings

Add a section to your system prompt that explicitly warns against these
anti-patterns:

1. **Sentiment-based escalation**: Explain why negative sentiment does not
   correlate with escalation need (frustrated + resolvable = resolve)

2. **Confidence-score thresholds**: Explain why arbitrary confidence thresholds
   produce unreliable decisions without calibration against labeled data

3. **Heuristic customer selection**: Explain why multiple customer matches
   require clarification, not heuristic selection (most recent, highest tier, etc.)

## Part 3: Test with Edge Cases

Create an agentic loop using your system prompt and test it against these
5 edge cases:

### Edge Case 1: Frustrated customer with simple issue
```
"UGH! This is the WORST! Where is my order ORD-5003?! My email is bob@example.com"
```
**Expected:** RESOLVE (look up order, provide status)

### Edge Case 2: Polite escalation request
```
"Thanks for your help, but I think I'd prefer to speak with a human agent about this."
```
**Expected:** ESCALATE immediately (customer_requested)

### Edge Case 3: Ambiguous frustration + human mention
```
"This is so frustrating! I feel like I need to talk to someone who can actually help!"
```
**Expected:** This is the hardest case. The customer mentions "talk to someone"
in the context of frustration, not as a standalone request. Acceptable outcomes:
- Attempt resolution first, then escalate if customer repeats
- Ask: "I understand your frustration. Would you like me to look into this, or would you prefer to speak with a human agent?"

### Edge Case 4: Policy gap with positive sentiment
```
"Hey! Love your products. Quick question -- can you match the price I saw on Best Buy? My email is alice@example.com."
```
**Expected:** ESCALATE (policy_exception) despite positive sentiment

### Edge Case 5: Multiple customer matches
```
"Hi, I'm Alice Johnson and I need help with an order."
```
**Expected:** Ask for email or customer ID. Do NOT pick a match heuristically.

## Part 4: Evaluate Results

For each test case, record:

| Test Case | Expected Outcome | Actual Outcome | Correct? | Notes |
|-----------|-----------------|----------------|----------|-------|
| 1 | Resolve | | | |
| 2 | Escalate (immediate) | | | |
| 3 | Attempt resolve or ask | | | |
| 4 | Escalate (policy) | | | |
| 5 | Ask for disambiguation | | | |

## Bonus: Compare With Sentiment-Based Approach

For contrast, create a second system prompt that uses sentiment-based escalation:

```
Escalate when the customer seems very unhappy (sentiment < -0.5) or when you
are less than 70% confident you can resolve the issue.
```

Run the same 5 edge cases and compare how many each approach gets right.

**Expected finding:** The few-shot approach handles boundary cases more
reliably because it encodes WHAT to do, not HOW to feel about the situation.

## Deliverables

1. System prompt with 4 few-shot escalation examples
2. Anti-pattern warnings section
3. Test results table for 5 edge cases
4. (Bonus) Comparison table showing few-shot vs. sentiment-based results
