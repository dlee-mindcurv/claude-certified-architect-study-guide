# Task 4.6: Architect Multi-Pass Review

## Exam Relevance
Tested in Scenario 5 (CI/CD Code Review Pipeline).

## Why Self-Review Has Limitations

When Claude generates output and is then asked to review that same output in
the same conversation, it retains the reasoning context from generation. This
creates a systematic bias: the reviewer "remembers" why it made each decision
and is more likely to confirm its own work than to challenge it.

This is analogous to asking a human to proofread a document they just wrote --
they tend to read what they intended to write, not what is actually on the page.

### The Session Isolation Principle

An independent review instance -- a separate API call without the generation
context -- is more effective because:

1. It evaluates the output on its own merits, without knowing the original
   reasoning.
2. It applies the review criteria fresh, without being anchored by prior
   decisions.
3. It can identify issues that the generator rationalized away during
   generation.

## Multi-Pass Review Architecture

The most effective review architecture for code review uses three phases:

### Phase 1: Per-File Local Analysis

Each file in the PR is reviewed in a SEPARATE API call. Each call:
- Receives only one file (not the entire PR)
- Focuses on local issues: bugs, security, logic errors within that file
- Does NOT analyze cross-file concerns (imports, API contracts, data flow)

Why separate calls? Because:
- Each file gets the model's full attention (no dilution across many files)
- Local analysis is more reliable with focused context
- Results are parallelizable (multiple files reviewed simultaneously)

### Phase 2: Cross-File Integration Pass

A second API call receives:
- All per-file results from Phase 1
- The list of modified files (not necessarily full content)

This pass focuses ONLY on cross-file concerns:
- Data flow between modified files
- API contract changes (caller/callee consistency)
- Import/export consistency
- Shared state modifications

Why a separate pass? Because:
- Cross-file issues require seeing the full picture, not individual files
- Per-file passes would miss issues that only emerge from file interactions
- The context is different: per-file results + file list, not raw code

### Phase 3: Independent Verification (Optional)

A third API call receives:
- The original code
- The combined findings from Phases 1 and 2

This pass:
- Verifies each finding against the original code
- Assigns confidence scores
- Filters out low-confidence findings
- Catches any false positives from the earlier phases

This phase is independent in that it has NO access to the reasoning that
produced the findings -- it only sees the findings themselves and the code.

## Verification with Confidence Scores

Each finding from the multi-pass pipeline includes a confidence score (0-1).
The verification pass can adjust these scores:

- Confirmed finding: confidence stays the same or increases
- Dubious finding: confidence decreases
- Refuted finding: removed from results

This creates a quality gate: only findings above a confidence threshold
(e.g., 0.8) are surfaced to the developer.

## When Multi-Pass Is Worth the Cost

Multi-pass review costs 3x the API calls of single-pass. It is justified when:

- **High false-positive cost:** Every false positive erodes developer trust
  in the CI tool. The verification pass significantly reduces false positives.
- **Complex PRs:** Changes spanning multiple files with cross-file
  dependencies. Single-pass misses integration issues.
- **Security-sensitive code:** The cost of missing a real vulnerability
  outweighs the cost of additional API calls.

It is NOT justified for:
- Simple single-file changes (one phase is sufficient)
- Style-only changes (explicit criteria handle this, Task 4.1)
- Draft PRs (save the multi-pass for the final review)

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Three-phase review pipeline with session isolation |
| `exercise.md` | Implement multi-pass review and compare to single-pass |
| `scenario-5-ci/multi-pass-review.js` | Full CI multi-pass review pipeline |
