# Scenario 4 (Dev Productivity) — Tool Selection Guide

## Context

In the Developer Productivity scenario, Claude Code assists developers with
codebase exploration, analysis, refactoring, and maintenance tasks. The
emphasis is on efficiently navigating large codebases, understanding existing
patterns, and making targeted modifications.

Unlike code generation (Scenario 2), which focuses on creating new code, dev
productivity focuses on understanding and improving existing code. This shifts
the tool distribution toward exploration tools (Glob, Grep, Read) with
targeted modifications (Edit).

## Tool Selection Matrix for Dev Productivity Tasks

### Codebase Exploration

| Task | Best Tool | Why | Example |
|------|-----------|-----|---------|
| Map the project structure | **Glob** `**/*` | Fast directory listing | "What does this project contain?" |
| Find a specific file | **Glob** `**/<filename>` | Name-based lookup | "Where is the auth middleware?" |
| Find all files of a type | **Glob** `**/*.{ts,tsx}` | Extension matching | "Show me all React components" |
| Search for a function | **Grep** `function\s+name` | Content search across files | "Where is handleSubmit defined?" |
| Find all usages of a module | **Grep** `import.*module` | Import pattern matching | "What uses the logger module?" |
| Find all TODO/FIXME comments | **Grep** `TODO\|FIXME` | Multi-pattern search | "What tech debt exists?" |
| Understand a file | **Read** | Full file content | "How does this middleware work?" |
| Check a specific section | **Read** with offset/limit | Targeted reading | "What does line 50-80 do?" |

### Code Analysis

| Task | Best Tool | Why | Example |
|------|-----------|-----|---------|
| Find duplicate patterns | **Grep** `<pattern>` | Find repeated code | "Is this pattern used elsewhere?" |
| Check error handling | **Grep** `catch\|\.catch` | Find all error handlers | "How are errors handled?" |
| Find API endpoints | **Grep** `router\.\(get\|post\|put\)` | Route definitions | "List all REST endpoints" |
| Check test coverage gaps | **Glob** `src/**/*.js` + **Glob** `tests/**/*.test.js` | Compare source to tests | "Which files lack tests?" |
| Review dependencies | **Read** `package.json` | Direct file read | "What libraries does this use?" |
| Check config files | **Glob** `**/*.{json,yaml,yml,toml}` + **Read** | Find then read configs | "What environment configs exist?" |

### Targeted Modifications

| Task | Best Tool | Why | Example |
|------|-----------|-----|---------|
| Fix a specific bug | **Edit** | Surgical change | "Fix the off-by-one error on line 42" |
| Rename a variable | **Edit** with `replace_all` | All occurrences in file | "Rename userId to accountId" |
| Add error handling | **Edit** | Insert try-catch wrapper | "Add error handling to this function" |
| Update a config value | **Edit** | Single value change | "Change the timeout to 30s" |
| Add a new field | **Edit** | Insert at specific location | "Add createdAt to the schema" |
| Comment out code | **Edit** | Wrap in comments | "Disable the legacy endpoint" |

### Execution and Verification

| Task | Best Tool | Why | Example |
|------|-----------|-----|---------|
| Run tests | **Bash** | Execution | "Run the test suite" |
| Check git history | **Bash** `git log` | Git operations | "Show recent commits" |
| View git diff | **Bash** `git diff` | Git operations | "What changed in this branch?" |
| Install packages | **Bash** `npm install` | Package management | "Install the new dependency" |
| Check running processes | **Bash** `ps` / `lsof` | System info | "Is the dev server running?" |
| Run linting | **Bash** `npm run lint` | Code quality | "Check for lint errors" |

## Exploration Workflows

### Workflow: Onboard to a New Codebase

```
1. Glob  **/*              →  Map the project structure
2. Read  README.md         →  Understand the project purpose
3. Read  package.json      →  Check dependencies and scripts
4. Glob  src/**/*.{js,ts}  →  Find all source files
5. Read  src/index.js      →  Read the entry point
6. Grep  "import.*from"    →  Understand module relationships
```

### Workflow: Investigate a Bug Report

```
1. Grep  "errorMessage"    →  Find where the error originates
2. Read  <matched file>    →  Read the surrounding code
3. Grep  "functionName"    →  Find all callers of the function
4. Read  <caller files>    →  Understand the call chain
5. Edit  <fix location>    →  Apply the fix
6. Bash  npm test          →  Verify the fix
```

### Workflow: Refactor a Module

```
1. Read  <target module>   →  Understand current implementation
2. Grep  "import.*module"  →  Find all consumers
3. Glob  **/*.test.*       →  Find related tests
4. Read  <test files>      →  Understand test expectations
5. Edit  <module>          →  Apply refactoring changes
6. Edit  <consumers>       →  Update imports/usage if needed
7. Bash  npm test          →  Run tests
8. Edit  <fix failures>    →  Fix any broken tests
9. Bash  npm test          →  Confirm all green
```

### Workflow: Security Audit

```
1. Grep  "eval\|exec\|spawn"     →  Find code execution calls
2. Grep  "password\|secret\|key"  →  Find credential handling
3. Grep  "sql\|query\|SELECT"     →  Find database queries
4. Read  <flagged files>          →  Review each finding
5. Grep  "sanitize\|escape\|validate" →  Check for input validation
6. Write <audit-report>           →  Create findings report
```

## Tool Combination Patterns

### Pattern: Glob + Read (Find then Examine)
```
Glob("src/middleware/**/*.js")  →  ["auth.js", "cors.js", "rate-limit.js"]
Read("src/middleware/auth.js")  →  Full file contents
```
Use when you know the file TYPE but not the exact path.

### Pattern: Grep + Read (Search then Context)
```
Grep("async function processOrder")  →  "src/orders/handler.js:45"
Read("src/orders/handler.js", offset: 40, limit: 30)  →  Lines 40-70
```
Use when you need to find WHERE something is, then understand it IN CONTEXT.

### Pattern: Grep + Edit (Find then Fix)
```
Grep("deprecated_function")  →  ["file1.js:10", "file2.js:25", "file3.js:8"]
Edit("file1.js", replace "deprecated_function" with "new_function")
Edit("file2.js", replace "deprecated_function" with "new_function")
Edit("file3.js", replace "deprecated_function" with "new_function")
```
Use when you need to replace a pattern across multiple files.

### Pattern: Read + Edit (Understand then Modify)
```
Read("src/config.js")  →  Understand current config structure
Edit("src/config.js", add new config entry)
```
Use when you need to UNDERSTAND the file before making a change.
Always Read before Edit for non-trivial modifications.

## Key Exam Takeaways

1. **Dev productivity is exploration-heavy.** Most tasks start with Glob or
   Grep to find relevant code, then Read to understand it, then Edit to
   modify it.

2. **Grep is the workhorse.** For finding patterns, usages, imports, error
   handling, and security concerns -- Grep is almost always the right first
   step.

3. **Edit over Write, always.** Dev productivity modifications are targeted
   by nature. A bug fix changes 2-5 lines. A refactoring changes specific
   functions. Edit sends only the diff.

4. **Bash only for execution.** Running tests, checking git, installing
   packages. Never for reading or searching.

5. **Multi-step exploration is normal.** A single dev task often requires
   3-5 tool calls before any modification: Glob to find, Grep to search,
   Read to understand, then Edit to change.
