# Exercise: Task 1.7 -- Manage Session and State

## Learning Objectives

After completing this exercise you will be able to:
- Use named sessions for ongoing investigations
- Decide when to resume vs. start fresh with a summary
- Use fork_session to explore alternatives in parallel
- Write effective structured summaries for fresh sessions

## Prerequisites

- Completed Task 1.1 (agentic loop fundamentals)
- Familiarity with the `@anthropic-ai/sdk` API
- Understanding of conversation history (messages array)

---

## Part 1: Named Session Resumption

### Scenario

You are investigating a performance regression in a web application. The
investigation will span multiple work sessions over the course of a day.

### Task A: Start and Save a Session

1. Create a named session called `"perf-regression"`.
2. Send an initial message asking the agent to investigate slow API responses
   on the `/api/orders` endpoint.
3. Save the session (message history) to disk.

```js
// Starter code
const messages = [
  { role: 'user', content: 'Our /api/orders endpoint has 5s response times...' },
];

const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages,
});

messages.push({ role: 'assistant', content: response.content });

// TODO: Save the session to disk with the name "perf-regression"
```

### Task B: Resume the Session

1. Load the saved session from disk.
2. Append a new user message: "I checked the database queries -- the main
   query has no index on `customer_id`. What is the expected improvement
   from adding an index?"
3. Send the updated messages to the API and verify the model references
   information from the first turn.

### Task C: Verify Context Continuity

After resuming, check that the model's response references specific details
from the first turn (e.g., the endpoint name, the 5s response time). This
confirms the full history was loaded.

---

## Part 2: Resume vs. Fresh Start

### Scenario

It is now the next morning. The files you investigated yesterday have been
modified by a teammate overnight.

### Task A: Detect Stale Data

Implement a function that checks whether a session should be resumed or
started fresh:

```js
function shouldResumeOrStartFresh(sessionName, options) {
  // TODO:
  // 1. Load the session
  // 2. Check how old it is
  // 3. Check if relevant files have changed (use file modification times)
  // 4. Check the turn count
  // 5. Return { action: 'resume' | 'fresh', reason: '...' }
}
```

Test cases:

| Session age | Turns | Files changed? | Expected decision |
|-------------|-------|----------------|-------------------|
| 10 minutes  | 5     | No             | Resume            |
| 10 minutes  | 5     | Yes            | Fresh + summary   |
| 3 hours     | 15    | No             | Fresh + summary   |
| 10 minutes  | 50    | No             | Fresh + summary   |

### Task B: Write a Structured Summary

Given these findings from yesterday's session, write a structured summary
for injecting into a fresh session:

**Findings:**
- The `/api/orders` endpoint makes 3 database queries per request
- Query 1 (customer lookup) takes 50ms -- acceptable
- Query 2 (order list) takes 4200ms -- missing index on `customer_id`
- Query 3 (item details) takes 800ms -- N+1 query pattern
- The endpoint handler does not use caching
- A Redis instance is available but not connected to this service

**Your structured summary should include:**
1. Verified facts (with specific numbers)
2. Key files examined (with relevant line numbers)
3. Open questions
4. What changed overnight
5. The current task

### Task C: Compare Quality

Run two experiments:
1. Resume the stale session and ask "How should we fix the performance issue?"
2. Start fresh with your structured summary and ask the same question.

Compare:
- Does the resumed session reference outdated file contents?
- Does the fresh session's response account for overnight changes?
- Which response is more actionable?

---

## Part 3: fork_session for Parallel Exploration

### Scenario

You have identified two possible approaches to fix the N+1 query:
- **Approach A:** Use a SQL JOIN to fetch all items in a single query
- **Approach B:** Add a batch loader (DataLoader pattern) to coalesce item fetches

You want to explore both approaches in parallel and then compare.

### Task A: Create a Shared Baseline

1. Start a session `"perf-fix-baseline"` that contains the investigation
   findings (from Part 2).
2. Verify the model understands the N+1 problem and the two approaches.

### Task B: Fork the Session

1. Fork `"perf-fix-baseline"` into `"perf-fix-join"`:
   ```
   "Let's explore Approach A: rewrite the item fetch as a SQL JOIN.
    Show me the implementation."
   ```

2. Fork `"perf-fix-baseline"` into `"perf-fix-dataloader"`:
   ```
   "Let's explore Approach B: implement a DataLoader to batch item fetches.
    Show me the implementation."
   ```

3. Verify both forks share the same baseline history up to the fork point.

### Task C: Compare Approaches

Continue each fork with follow-up questions:
- "What are the performance characteristics?"
- "What are the tradeoffs?"
- "How does this affect the existing test suite?"

Then write a comparison summary:

| Dimension | Approach A (JOIN) | Approach B (DataLoader) |
|-----------|-------------------|------------------------|
| Query count reduction | ? | ? |
| Implementation complexity | ? | ? |
| Test impact | ? | ? |
| Caching potential | ? | ? |

---

## Reflection Questions

1. **Why is resuming a stale session dangerous?** The model will reason about
   file contents that no longer exist. It may suggest changes to code that has
   already been modified, or miss new code that affects its analysis.

2. **What is the token cost of resuming a long session?** Every prior message
   (including tool results) is sent as input tokens on every subsequent API
   call. A 50-turn session with tool results could consume 50K+ input tokens
   per call, even for a simple follow-up question.

3. **Can fork_session branches be merged?** Not automatically. You compare
   the outcomes manually (or ask Claude to compare them in a new session).
   The fork is for exploration, not version control.

4. **What belongs in a structured summary vs. what should be re-investigated?**
   Include verified facts and specific findings. Exclude speculative
   hypotheses and exploration dead-ends. When in doubt, let the model
   re-verify rather than trusting stale conclusions.
