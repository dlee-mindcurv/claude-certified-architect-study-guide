# Exercise: Implement Multi-Pass Review and Compare to Single-Pass

## Objective

Build a multi-pass review pipeline, then compare its output to a single-pass
review of the same code. Measure the differences in false positive rate,
cross-file issue detection, and finding quality.

## Setup

Prepare a multi-file code sample with:
- At least 3 files
- At least 2 per-file issues (bugs, security) per file
- At least 2 cross-file issues (API contract violations, data leaks)
- At least 3 "non-issues" that should NOT be flagged (style, naming)

You can use the sample files from `example.js` or create your own.

## Part 1: Single-Pass Baseline (15 minutes)

Send ALL files in a SINGLE API call with the full review criteria prompt:

```js
const response = await client.messages.create({
  model: MODEL,
  max_tokens: 4096,
  messages: [{
    role: 'user',
    content: `${reviewCriteriaPrompt}\n\n${allFilesContent}`
  }]
});
```

Record:
- Total findings count
- Per-file issues found
- Cross-file issues found
- False positives (issues that should not have been flagged)
- False negatives (real issues that were missed)

## Part 2: Multi-Pass Pipeline (30 minutes)

Implement three phases:

### Phase 1: Per-File Analysis
- One API call per file
- Use `perFileReviewPrompt` (local issues only)
- Run in parallel (`Promise.all`)
- Collect findings per file

### Phase 2: Cross-File Integration
- One API call receiving all per-file results
- Use `crossFileReviewPrompt` with per-file results injected
- Focus on cross-file issues only
- Do NOT repeat per-file issues

### Phase 3: Independent Verification
- One API call receiving all findings + original code
- NO shared conversation context with Phases 1-2
- Verify each finding: confirmed, adjusted, or rejected
- Assign confidence scores

## Part 3: Comparison Analysis (15 minutes)

Compare single-pass vs. multi-pass results:

| Metric | Single-Pass | Multi-Pass |
|--------|------------|------------|
| Total findings | | |
| True positives | | |
| False positives | | |
| False negatives | | |
| Cross-file issues found | | |
| Average confidence | | |
| API calls | 1 | 3 + N files |

Calculate:
```
Precision = true_positives / (true_positives + false_positives)
Recall = true_positives / (true_positives + false_negatives)
F1 = 2 * (precision * recall) / (precision + recall)
```

## Part 4: Cost-Benefit Analysis (10 minutes)

Answer these questions:

1. **How many more API calls does multi-pass require?**
   Single: 1 call
   Multi: 1 per file + 1 cross-file + 1 verification = N + 2

2. **What is the cost multiplier?**
   For a 5-file PR: (5 + 2) / 1 = 7x more calls
   But each call is focused (less max_tokens needed)

3. **When is multi-pass worth it?**
   - Large PRs with cross-file dependencies: YES / NO?
   - Single-file typo fix: YES / NO?
   - Security-sensitive code: YES / NO?
   - Draft PR (not ready for merge): YES / NO?

4. **What is the key quality improvement?**
   - Fewer false positives (verification phase filters them)
   - Better cross-file coverage (dedicated integration pass)
   - Higher confidence scores (verification confirms or rejects)

## Success Criteria

- [ ] Single-pass baseline recorded with all metrics
- [ ] Multi-pass pipeline implemented with all 3 phases
- [ ] Phase 1 runs per-file reviews in parallel
- [ ] Phase 2 receives per-file results and finds cross-file issues
- [ ] Phase 3 is independent (no shared context with earlier phases)
- [ ] Comparison table completed with precision/recall/F1
- [ ] Cost-benefit analysis answers all 4 questions
- [ ] Multi-pass shows improvement in at least one metric

## Exam Tip

The exam tests two key concepts about multi-pass review:

1. **Self-review bias.** The same model instance that generated output retains
   its reasoning context. Asking it to "review your work" in the same
   conversation is less effective than a fresh API call. The verification
   phase (Phase 3) must be a SEPARATE API call with NO shared history.

2. **Per-file vs. cross-file separation.** Per-file analysis focuses on local
   issues within a single file. Cross-file analysis focuses on interactions
   between files. Combining these in a single pass reduces quality for both
   because the model must split attention between fundamentally different
   analysis tasks.

A common distractor is a "multi-pass" system that runs the same prompt twice
in the same conversation. This is NOT multi-pass review -- it is self-review
with all the confirmation bias problems described above.
