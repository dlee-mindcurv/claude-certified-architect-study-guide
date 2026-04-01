# Exercise: Task 1.6 -- Decompose Complex Tasks

## Learning Objectives

After completing this exercise you will be able to:
- Implement a fixed prompt chain for multi-file code review
- Implement adaptive decomposition for codebase exploration
- Compare output quality between monolithic and decomposed approaches
- Identify when each strategy is appropriate

## Prerequisites

- Completed Task 1.1 (agentic loop fundamentals)
- Familiarity with the `@anthropic-ai/sdk` API

---

## Part 1: Monolithic vs. Decomposed Code Review

### Setup

The following 10-file code change simulates a pull request that adds a
notification system to an e-commerce backend. Some files have bugs, some have
style issues, and there are cross-file coordination problems.

```js
const prFiles = [
  { filename: 'src/models/notification.js', diff: '... new Notification model ...' },
  { filename: 'src/models/user-preferences.js', diff: '... add notificationOpts field ...' },
  { filename: 'src/api/notifications.js', diff: '... POST /notifications endpoint ...' },
  { filename: 'src/api/orders.js', diff: '... emit notification on order status change ...' },
  { filename: 'src/api/refunds.js', diff: '... emit notification on refund processed ...' },
  { filename: 'src/services/email.js', diff: '... send email for notification ...' },
  { filename: 'src/services/push.js', diff: '... send push notification ...' },
  { filename: 'src/utils/rate-limiter.js', diff: '... rate limit per user ...' },
  { filename: 'src/config/notification-config.js', diff: '... default templates, channels ...' },
  { filename: 'tests/notifications.test.js', diff: '... test the notification flow ...' },
];
```

### Task A: Monolithic Approach

Send all 10 file diffs to Claude in a single API call:

```js
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{
    role: 'user',
    content: `Review these 10 file changes:\n\n${prFiles.map(f =>
      `=== ${f.filename} ===\n${f.diff}`
    ).join('\n\n')}`
  }],
});
```

Record:
- How many issues Claude found per file
- Whether Claude caught the cross-file coordination bug (orders.js emits
  notifications but does not check user-preferences.js for opt-out)
- How deep the analysis was for file 7 vs. file 1

### Task B: Decomposed Approach (Prompt Chain)

Implement the two-stage pipeline from `example.js`:

1. **Per-file pass:** 10 parallel API calls, one per file
2. **Cross-file integration pass:** 1 API call with all per-file summaries

Record the same metrics as Task A.

### Task C: Compare Results

Fill in this comparison table:

| Metric | Monolithic | Decomposed |
|--------|-----------|------------|
| Total issues found | ? | ? |
| Issues in file 1 (notifications.js) | ? | ? |
| Issues in file 7 (push.js) | ? | ? |
| Cross-file bugs found | ? | ? |
| Total API calls | 1 | 11 |
| Total latency (approx) | ? | ? |

**Expected finding:** The decomposed approach should find more issues,
especially in files that appear later in the monolithic prompt (attention
dilution). The cross-file integration pass should catch the opt-out
coordination bug that the monolithic approach may miss.

---

## Part 2: Adaptive Decomposition

### Scenario

You are given access to a legacy Node.js codebase you have never seen before.
The goal: identify the top 3 areas of technical debt that would benefit from
refactoring.

### Task

Implement a three-phase adaptive decomposition:

**Phase 1: Survey**
```js
// Use Claude to analyze the directory structure
const surveyPrompt = `Given this directory tree, identify:
1. Entry points (main files, server.js, index.js)
2. High-fan-in files (imported by many others)
3. Configuration and build files
4. Test coverage indicators

Directory tree:
${directoryTree}`;
```

**Phase 2: Prioritize**
```js
// Based on survey results, decide which files to examine deeply
const prioritizePrompt = `Based on this codebase survey, rank the top 5
files/directories most likely to contain technical debt. Consider:
- Files with high fan-in (changes here affect many others)
- Files with no corresponding tests
- Large files (>300 lines)
- Files with outdated patterns

Survey results:
${surveyResults}`;
```

**Phase 3: Investigate**
```js
// Read and analyze each prioritized file
// This is an ADAPTIVE step: the plan was created at runtime
for (const target of prioritizedTargets) {
  const analysis = await analyzeFile(target);
  // Analysis may reveal NEW targets not in the original plan
}
```

### Verification Questions

1. How many API calls did your survey phase require?
2. Did Phase 2 identify any targets that Phase 1 missed?
3. Did Phase 3 investigation reveal new areas not in the Phase 2 plan?
4. Could you have predicted the investigation plan before Phase 1?

---

## Part 3: Decision Framework

For each scenario, decide whether to use a fixed pipeline or adaptive
decomposition and explain why:

1. **Reviewing a 15-file PR that adds a new REST endpoint**
   - Your answer: _______________
   - Reasoning: _______________

2. **Investigating why a production service has increasing latency**
   - Your answer: _______________
   - Reasoning: _______________

3. **Generating API documentation for 20 endpoint files**
   - Your answer: _______________
   - Reasoning: _______________

4. **Migrating a codebase from CommonJS to ES modules**
   - Your answer: _______________
   - Reasoning: _______________

### Expected Answers

1. **Fixed pipeline** -- The structure is known (per-file then cross-file).
2. **Adaptive** -- You do not know where the bottleneck is until you investigate.
3. **Fixed pipeline** -- Each file gets the same documentation template.
4. **Adaptive** -- Migration order depends on the dependency graph, which must
   be discovered first.

---

## Reflection Questions

1. **What is the practical cost of decomposition?** (More API calls, higher
   latency, higher token usage. Worth it when input exceeds the model's
   effective attention span.)

2. **When does decomposition hurt more than it helps?** (Trivial tasks, very
   short inputs, tasks where global context is essential for every subtask.)

3. **Can you combine both strategies?** (Yes. Use adaptive decomposition to
   discover the plan, then execute each step as a fixed pipeline stage.)
