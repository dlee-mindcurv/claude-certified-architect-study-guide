# Task 5.2: Define Escalation Criteria with Few-Shot Examples

## Exam Relevance
Tested in Scenario 1 (CSR Agent). Assessed skill: S1.

## The Problem: When Should an Agent Escalate?

CSR agents must achieve high first-contact resolution while knowing when to hand
off to a human. The challenge is defining clear, reliable escalation criteria
that avoid two failure modes:

1. **Over-escalation**: Routing solvable issues to humans, defeating automation
2. **Under-escalation**: Attempting resolution when a human is needed, frustrating
   customers or violating policy

## Appropriate Escalation Triggers

Reliable escalation is based on **explicit, categorical triggers** -- not
probabilistic signals. The three reliable trigger categories are:

### 1. Customer Request (Immediate Escalation)

When a customer explicitly asks for a human agent, honor the request immediately.
Do NOT investigate the issue first, offer alternatives, or try to persuade them
to stay.

**Why immediate?** The customer has expressed a preference. Investigating first
signals that you are not listening to them. Even if you could resolve the issue,
the customer has chosen a different path.

### 2. Policy Gap or Exception

When the customer's request falls outside defined policy boundaries, escalate
rather than deny outright or improvise a resolution.

**Examples:**
- Competitor price matching (policy covers own-site only)
- Warranty claims for items past the return window
- Requests for account-level actions (credit adjustments, tier changes)

**Why escalate instead of deny?** A human agent may have authority for exceptions.
Denying outright could lose a customer when an exception would have been granted.

### 3. Inability to Progress

When the agent has investigated and cannot make meaningful progress:
- All applicable tools returned errors
- The issue requires information not available through tools
- The customer's description does not match any available workflow

## What NOT to Use as Escalation Signals

### Sentiment Analysis and Confidence Scores Are Unreliable Proxies

It is tempting to build escalation logic like:
```js
// ANTI-PATTERN: Do not do this
if (sentimentScore < -0.5 || confidenceScore < 0.3) {
  escalate();
}
```

This fails for several reasons:

1. **False positives**: A customer saying "this is ridiculous, my order was late"
   is frustrated but the issue (delivery status) is perfectly resolvable. Escalating
   based on negative sentiment wastes human agent time on solvable issues.

2. **False negatives**: A polite customer requesting competitor price matching
   ("Could you match Amazon's price? Thanks!") has positive sentiment but requires
   escalation because it is a policy gap.

3. **Threshold fragility**: What sentiment score separates "resolve" from
   "escalate"? Any threshold is arbitrary and will produce errors at the boundary.

4. **Confidence scores are not calibrated**: A model reporting "0.7 confidence"
   does not mean it is right 70% of the time. Without calibration against labeled
   data, confidence scores are not decision-reliable.

### Multiple Matches Require Clarification, Not Heuristic Selection

When `get_customer` returns multiple matches (e.g., two customers named "Alice
Johnson"), the correct response is to ask for additional identifiers -- NOT to:
- Pick the most recent account
- Pick the account with matching tier
- Use a scoring heuristic to select "the most likely" match

**Why?** Any heuristic selection risks acting on the wrong customer's account.
The disambiguation cost (one extra question) is far lower than the cost of
processing a refund for the wrong customer.

## Few-Shot Examples in the System Prompt

The most effective way to encode escalation criteria is through few-shot examples
in the system prompt. Each example shows:
1. A customer message
2. The correct action
3. The reasoning (why this action and not the alternative)

See the system prompt in `shared/prompts/csr-system-prompt.js` for the full set:

- **Example 1 (Resolve):** Standard damage return with evidence
- **Example 2 (Escalate):** Competitor price matching (policy gap)
- **Example 3 (Escalate):** Customer explicitly requests human
- **Example 4 (Resolve):** Frustrated customer with resolvable issue

### Why Few-Shot Examples Work Better Than Rules

Rules like "escalate when the customer is angry" are ambiguous. Few-shot examples
show Claude concrete instances of the boundary between "resolve" and "escalate,"
making the criteria concrete and less subject to interpretation.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Working escalation logic with all trigger types |
| `exercise.md` | Build escalation criteria with 4 few-shot examples |
| `scenario-1-csr/escalation-logic.js` | Full CSR escalation implementation |
