# Task 5.4: Manage Codebase Context in Extended Sessions

## Exam Relevance
Tested in Scenario 4 (Dev Productivity). Assessed skill: S4.

## The Problem: Context Degradation in Extended Sessions

When using Claude for codebase exploration and development tasks, sessions can
grow very long. A developer might ask Claude to:
1. Explore a module's architecture
2. Find all callers of a specific function
3. Understand the test coverage
4. Implement a fix based on findings

By step 4, the detailed findings from step 1 may have drifted to the middle
of the context window, and the verbatim file contents from step 2 consume
significant tokens. This creates two interacting problems:

- **Attention degradation**: Key findings from early exploration get less
  attention as the conversation grows
- **Token exhaustion**: Raw file contents and search results accumulate,
  consuming the context budget

## Solutions for Codebase Context Management

### 1. Subagent Delegation for Investigation

Instead of having a single agent read every file and hold everything in its
context, delegate specific investigation questions to subagents:

```
Main Agent (coordinator):
  "What is the architecture of the auth module?"
     └─> Subagent 1: reads auth files, returns structured summary
  "What functions call validateToken?"
     └─> Subagent 2: searches codebase, returns caller list
  "What are the test gaps?"
     └─> Subagent 3: examines test files, returns coverage report
```

Each subagent:
- Has a focused context (only the files relevant to its question)
- Returns a structured summary (not raw file contents)
- Completes and discards its context, freeing tokens for the main agent

The main agent receives only the summaries, maintaining a high-level view
without being burdened by verbatim file contents.

### 2. Scratchpad Files for Key Findings

A scratchpad file is a persistent record of key findings that survives beyond
the context window. The pattern:

1. After each investigation phase, write key findings to a file
   (e.g., `.claude/scratchpad.md`)
2. Before subsequent phases, read the scratchpad to refresh context
3. Update the scratchpad as new findings emerge

**Why a file instead of a prompt block?**
- Files persist across sessions (context windows end, files don't)
- Files can be referenced by future sessions without re-discovering everything
- Files can grow larger than what fits in a system prompt

### 3. Structured State for Crash Recovery

Extended development sessions can be interrupted (network drops, editor restarts,
manual cancellation). Without structured state, all progress is lost.

State export pattern:
```json
{
  "task": "Fix authentication timeout bug",
  "phase": "implementation",
  "findings": {
    "root_cause": "Token validation does not handle expired tokens gracefully",
    "affected_files": ["src/auth/validate.js", "src/middleware/auth.js"],
    "test_files": ["test/auth/validate.test.js"]
  },
  "actions_completed": [
    "Identified root cause in validateToken()",
    "Found 3 callers that need updating"
  ],
  "next_steps": [
    "Add expiry check in validateToken()",
    "Update caller error handling",
    "Add test case for expired token"
  ]
}
```

This state can be written to a scratchpad file and used to resume in a new
session without repeating the investigation.

### 4. /compact for Context Reduction (Claude Code)

In Claude Code, the `/compact` command asks Claude to summarize the current
conversation, reducing its token footprint. This is useful when:
- The conversation has grown long with verbose file contents
- You need room for new investigation
- You want to refocus on a specific subtask

**When to use /compact:**
- After a major investigation phase before starting implementation
- When Claude says it is running out of context
- Before switching to a different subtask

**What gets lost:**
- Verbatim file contents (replaced with summaries)
- Exact line numbers and code snippets
- Intermediate reasoning steps

**What is preserved (approximately):**
- Key findings and conclusions
- File paths and function names
- The overall plan and current progress

This is why scratchpad files complement /compact: the scratchpad preserves
exact details that the summary might lose.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Subagent delegation and scratchpad pattern |
| `exercise.md` | Explore a codebase using delegation and scratchpad |
| `scenario-4-devtools/scratchpad.js` | Dev productivity scratchpad implementation |
