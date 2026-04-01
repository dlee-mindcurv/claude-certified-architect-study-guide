# Scenario 2 (Code Generation) — Built-In Tool Selection Guide

## Context

In the Code Generation with Claude Code scenario, Claude generates, modifies,
and tests code in a real codebase. Choosing the right built-in tool at each
step determines both efficiency (token usage) and reliability (correct output).

## Tool Selection Matrix for Code Generation Tasks

### Exploration Phase (Understanding the Codebase)

| Task | Best Tool | Why | Avoid |
|------|-----------|-----|-------|
| Find all source files | **Glob** `src/**/*.{js,ts}` | Optimized for pattern matching | `Bash: find` |
| Find files using a module | **Grep** `import.*moduleName` | Content search, not name match | Read every file |
| Understand project structure | **Glob** `**/*` + **Read** key files | Glob for structure, Read for details | `Bash: tree` |
| Check existing implementations | **Grep** `function targetName` | Fast pattern match across codebase | Read files sequentially |
| Read a specific file | **Read** with optional offset/limit | Direct file access | `Bash: cat` |
| Find test files | **Glob** `**/*.test.{js,ts}` | Pattern match on filenames | `Bash: find -name` |
| Check package dependencies | **Read** `package.json` | Direct read of known file | `Bash: cat package.json` |

### Generation Phase (Creating and Modifying Code)

| Task | Best Tool | Why | Avoid |
|------|-----------|-----|-------|
| Create a new file | **Write** | Purpose-built for new files | `Bash: echo > file` |
| Add a function to existing file | **Edit** | Sends only the insertion diff | Write (entire file) |
| Modify a function body | **Edit** | Sends only the changed lines | Write (entire file) |
| Add imports to a file | **Edit** | Small change at top of file | Write (entire file) |
| Rename across a file | **Edit** `replace_all` | Handles all occurrences | Manual find-and-replace |
| Scaffold multiple files | **Write** for each file | Each file is new | Bash with heredocs |
| Update config values | **Edit** | Targeted config change | Write (overwrite config) |

### Validation Phase (Testing and Verification)

| Task | Best Tool | Why | Avoid |
|------|-----------|-----|-------|
| Run test suite | **Bash** `npm test` | Execution requires shell | No alternative |
| Run single test file | **Bash** `npm test -- file.test.js` | Execution requires shell | No alternative |
| Check for syntax errors | **Bash** `npx tsc --noEmit` | Compiler check requires shell | No alternative |
| Lint the code | **Bash** `npm run lint` | Linting requires shell | No alternative |
| Install dependencies | **Bash** `npm install` | Package management requires shell | No alternative |
| Build the project | **Bash** `npm run build` | Build requires shell | No alternative |
| Check git status | **Bash** `git status` | Git requires shell | No alternative |

## Decision Flowchart

```
Is the task about FINDING files or content?
├── Finding files by name/pattern → Glob
├── Finding content inside files → Grep
└── No

Is the task about READING a file?
├── Reading a known file → Read
├── Reading part of a large file → Read with offset/limit
└── No

Is the task about MODIFYING a file?
├── New file that does not exist → Write
├── Changing part of an existing file → Edit
├── Complete rewrite of a file → Write (read first)
└── No

Is the task about EXECUTING something?
├── Running commands (build, test, install) → Bash
└── No → Probably not a tool task
```

## Common Code Generation Workflows

### Workflow: Implement a New Feature

```
1. Glob  →  Find related existing files (e.g., similar components)
2. Read  →  Study the existing patterns and conventions
3. Write →  Create the new file(s)
4. Edit  →  Add imports or registrations to existing files
5. Bash  →  Run tests to verify
6. Edit  →  Fix any issues found by tests
7. Bash  →  Run tests again to confirm
```

### Workflow: Fix a Bug

```
1. Grep  →  Find the code related to the bug
2. Read  →  Read the relevant function(s)
3. Edit  →  Apply the fix (targeted change)
4. Bash  →  Run relevant tests
5. Read  →  Check if similar patterns exist elsewhere
6. Grep  →  Find other instances of the same pattern
7. Edit  →  Fix other instances if needed
8. Bash  →  Run full test suite
```

### Workflow: Add Tests for Existing Code

```
1. Read  →  Read the file to be tested
2. Glob  →  Find existing test files for conventions
3. Read  →  Study existing test patterns
4. Write →  Create the new test file
5. Bash  →  Run the tests
6. Edit  →  Fix failing tests
7. Bash  →  Run tests again
```

## Token Efficiency Comparison

For a 500-line file where you need to change 3 lines:

| Approach | Tokens Sent | Efficiency |
|----------|-------------|------------|
| **Edit** (correct) | ~50 tokens (just the diff) | Optimal |
| **Write** (suboptimal) | ~2000 tokens (entire file) | 40x more tokens |
| **Bash: sed** (anti-pattern) | ~80 tokens but fragile | Error-prone |

For finding a function across 200 files:

| Approach | API Calls | Efficiency |
|----------|-----------|------------|
| **Grep** (correct) | 1 call | Optimal |
| **Read** each file (anti-pattern) | 200 calls | 200x more calls |
| **Bash: grep** (suboptimal) | 1 call but less integrated | Misses context |

## Key Exam Takeaways

1. **Edit over Write** for existing files -- always. The only exception is a
   complete file rewrite where more than 50% of the content changes.

2. **Grep over Read** for searching -- always. Do not read entire files to
   search for a pattern.

3. **Glob over Bash** for finding files -- always. Glob is optimized for
   file pattern matching.

4. **Bash only for execution** -- builds, tests, installs, git commands.
   Never for reading or searching.

5. **Read for examination** -- when you know the file and want to understand
   its contents. Optionally use offset/limit for large files.
