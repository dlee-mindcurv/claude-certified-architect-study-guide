# Task 1.6: Decompose Complex Tasks

## Exam Relevance
Tested in Scenarios 4 (Dev Productivity) and 5 (CI Pipeline). This task covers
strategies for breaking large problems into smaller units that Claude can handle
effectively, avoiding attention dilution in long contexts.

## Core Concept: Two Decomposition Strategies

The exam distinguishes between two approaches to task decomposition. Neither is
universally superior -- the right choice depends on the task structure.

### Strategy 1: Fixed Sequential Pipelines (Prompt Chaining)

A prompt chain breaks a task into predetermined stages. Each stage receives
specific input, produces specific output, and feeds into the next stage. The
pipeline structure is decided at design time, not at runtime.

```
Stage 1          Stage 2          Stage 3
[Per-file    --> [Cross-file  --> [Summary
 analysis]       integration]     generation]
```

**When to use prompt chaining:**
- The task has a known, repeatable structure (e.g., code review always needs
  per-file analysis followed by cross-file integration)
- Each stage has a clear input/output contract
- The number and type of subtasks are predictable before execution begins

**Example -- Code Review:**
1. **Per-file pass:** For each changed file, send only that file's diff to
   Claude with a prompt focused on single-file concerns (logic errors, style,
   naming, edge cases).
2. **Cross-file integration pass:** Collect all per-file results and send them
   together with a prompt focused on cross-cutting concerns (API consistency,
   import chains, shared state mutations, breaking changes).

**Why this works better than sending all files at once:** When Claude receives
a 10-file diff in a single prompt, attention dilution causes it to focus on
the most salient changes and skim the rest. By processing files individually
first, every file gets full attention. The integration pass then operates on
condensed summaries rather than raw diffs.

### Strategy 2: Dynamic Adaptive Decomposition

An adaptive decomposition discovers the task structure at runtime. The agent
first surveys the problem space, then creates a prioritized plan based on what
it finds.

```
Phase 1: Survey    Phase 2: Prioritize    Phase 3: Execute
[Map the       --> [Identify high-    --> [Investigate
 structure]         impact areas]          in priority order]
```

**When to use adaptive decomposition:**
- The task structure is unknown before execution (e.g., exploring an unfamiliar
  codebase)
- The number and type of subtasks depend on what the agent discovers
- Some areas may need deep investigation while others need only a glance

**Example -- Legacy Codebase Exploration:**
1. **Map structure:** Scan the directory tree, identify entry points, read
   package manifests and configuration files.
2. **Identify high-impact areas:** Based on the map, identify files that are
   imported by many others (high fan-in), files with complex logic, and files
   that match the investigation goal.
3. **Create prioritized plan:** Rank areas by likely relevance and investigate
   them in order, adjusting the plan as new information emerges.

## Attention Dilution: The Core Problem

Claude processes all input tokens through an attention mechanism. When input
is long, attention is spread thinner across tokens. This manifests as:

- **Missed issues:** In a 10-file code review, Claude might catch a critical
  bug in file 1 but miss a similar bug in file 8.
- **Shallow analysis:** Instead of deep analysis of each file, Claude provides
  surface-level comments across all files.
- **Recency bias:** Issues in content near the end of the prompt receive more
  attention than those at the beginning.

Task decomposition mitigates attention dilution by ensuring each subtask
receives a focused context window. The model works with smaller, relevant
chunks rather than an overwhelming whole.

## Comparison Table

| Dimension | Fixed Pipeline | Adaptive Decomposition |
|-----------|----------------|----------------------|
| Structure | Determined at design time | Discovered at runtime |
| Subtask count | Known in advance | Varies per execution |
| Best for | Repeatable workflows | Exploratory tasks |
| Planning cost | Zero (hardcoded) | One survey pass |
| Flexibility | Low (same stages every time) | High (adapts to findings) |
| Exam scenario | S5 (CI per-file review) | S4 (codebase exploration) |

## Anti-Patterns

**1. Sending everything in one prompt**
```
"Here are 10 changed files. Review them all for bugs, style, security,
and cross-file consistency."
```
Why it fails: Attention dilution. Claude skims rather than deeply analyzing.

**2. Over-decomposing trivial tasks**
Splitting a 2-file change into per-file analysis + integration is overhead
without benefit. Use decomposition when the input exceeds what the model can
attend to effectively, not for every task.

**3. Static pipelines for exploratory tasks**
Hardcoding "Step 1: read src/index.js, Step 2: read src/utils.js" assumes
you know the codebase structure. For exploration, use adaptive decomposition.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Prompt chain for per-file then cross-file code review |
| `exercise.md` | Hands-on exercise comparing both approaches |
| `scenario-4-devtools/decomposition.js` | Adaptive decomposition for legacy codebase exploration |
| `scenario-5-ci/per-file-review.js` | CI per-file review pipeline with integration pass |
