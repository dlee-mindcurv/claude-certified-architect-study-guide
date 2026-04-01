# Guide: Using /compact and Scratchpad Files for Context Management

## The Problem

Claude Code's context window is finite. In extended sessions involving codebase exploration,
the context fills with:
- Full file contents from Read operations
- Search results from Grep and Glob
- Intermediate reasoning and analysis
- Previous conversation turns and responses

When context is full, earlier information may be lost, or the session becomes sluggish.

## The /compact Command

### What It Does

`/compact` compresses the conversation history. It:
- Summarizes verbose tool outputs (search results, file contents)
- Condenses intermediate reasoning into key points
- Preserves decisions, conclusions, and current task state
- Frees up context space for continued work

### When to Use

| Situation | Action |
|-----------|--------|
| Context warning message appears | Run /compact |
| Completing one phase, starting another | Run /compact between phases |
| After extensive exploration | Run /compact before implementation |
| Claude's responses seem to lose earlier context | Run /compact to consolidate |
| Before a complex task that needs room | Run /compact proactively |

### What Gets Preserved

- Key decisions and their rationale
- Current task description and goals
- Important findings and conclusions
- Error messages that are still relevant
- CLAUDE.md instructions (always present)

### What Gets Removed

- Raw file contents that were read
- Verbose Grep/Glob search results
- Step-by-step reasoning that led to conclusions
- Intermediate tool outputs
- Exploratory dead ends

## Scratchpad Files

### What They Are

Scratchpad files are temporary working files you create to persist important information
on disk. Unlike conversation context, files survive compaction and session boundaries.

### Naming Conventions

| File | Purpose |
|------|---------|
| `SCRATCHPAD.md` | General findings and notes |
| `DECISIONS.md` | Architectural decisions log |
| `PROGRESS.md` | Task progress tracker |
| `ARCHITECTURE.md` | Discovered architecture map |
| `TODO.md` | Remaining tasks and blockers |

### Scratchpad Lifecycle

```
1. CREATE
   At the start of a complex task, create the scratchpad:
   "Create SCRATCHPAD.md to track our findings"

2. UPDATE
   As you discover things, update the scratchpad:
   "Add our findings about the auth module to SCRATCHPAD.md"

3. COMPACT
   When context is full, run /compact:
   > /compact

4. RESTORE
   Immediately after compaction, read the scratchpad:
   "Read SCRATCHPAD.md to restore our working context"

5. CONTINUE
   Resume work with fresh context + scratchpad knowledge

6. CLEANUP
   When the task is done, delete the scratchpad:
   "Delete SCRATCHPAD.md -- we are done with this exploration"
```

## Scratchpad Templates

### Exploration Scratchpad

```markdown
# Exploration: [Topic]

## Goal
What we are trying to understand.

## Key Files
- `path/to/file.ts` -- Description of its role
- `path/to/other.ts` -- Description of its role

## Architecture
Brief description of how the system works.

## Findings
1. Finding one with details
2. Finding two with details

## Open Questions
- Question that still needs answering
- Another open question

## Next Steps
- What to do next
```

### Refactoring Scratchpad

```markdown
# Refactoring: [Description]

## Current State
How the code works now.

## Target State
How the code should work after refactoring.

## Files to Change
| File | Change | Status |
|------|--------|--------|
| path/to/file.ts | Extract function | Done |
| path/to/other.ts | Update imports | Pending |

## Decisions
- Decision 1: Rationale
- Decision 2: Rationale

## Test Status
- Tests passing before refactor: Yes
- Tests currently passing: Yes/No
- New tests needed: List
```

## Best Practices

### 1. Write Before Compacting

Always update the scratchpad BEFORE running /compact. Information in conversation context
that is not in the scratchpad will be condensed and may lose detail.

### 2. Be Structured

Use headings, tables, and lists. Structured information is easier to parse after
restoration than narrative paragraphs.

### 3. Include File Paths

Always include full file paths in your scratchpad. After compaction, you will need to
re-read specific files, and having the paths ready saves a search step.

### 4. Track What Is Done vs Pending

Mark completed items clearly so after compaction you know where to resume.

### 5. Keep It Concise

The scratchpad should contain findings and decisions, not raw data. If you need raw data,
reference the file path where it can be re-read.

### 6. One Scratchpad Per Task

Do not mix findings from different tasks in one scratchpad. Create separate files for
separate investigations.

## The Complete Workflow

```
Session Start
  |
  v
Begin Exploration (subagents for large searches)
  |
  v
Create SCRATCHPAD.md (initial structure)
  |
  v
Work + Update SCRATCHPAD.md (as findings emerge)
  |
  v
Context Getting Full?
  |
  +-- No --> Continue working
  |
  +-- Yes --> Update SCRATCHPAD.md
              |
              v
              /compact
              |
              v
              Read SCRATCHPAD.md
              |
              v
              Continue working
  |
  v
Task Complete
  |
  v
Clean up SCRATCHPAD.md
```

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| No scratchpad before /compact | Detailed findings lost | Always write first |
| Unstructured scratchpad | Hard to parse after restore | Use headings and lists |
| Never compacting | Context exhaustion, slow responses | Compact between phases |
| Compacting too early | Lose details still needed | Wait until a natural break point |
| Forgetting to read after compact | Working without context | Always read scratchpad after compact |
