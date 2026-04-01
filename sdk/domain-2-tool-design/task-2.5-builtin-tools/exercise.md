# Exercise: Choose the Correct Built-In Tool

## Objective

For each codebase task described below, identify the best Claude Code built-in
tool to use. Explain why your choice is better than the alternatives.

## Reference: Built-In Tools

| Tool | Purpose | Token Cost |
|------|---------|------------|
| Read | View file contents | Proportional to file size |
| Write | Create or completely rewrite a file | Full file content |
| Edit | Make targeted changes to a file | Only the diff |
| Glob | Find files by name pattern | List of matching paths |
| Grep | Search file contents by regex | Matching lines + context |
| Bash | Execute shell commands | Command + output |

## Part 1: Tool Selection

For each task, write: (a) the best tool, (b) why, and (c) why the most
tempting alternative is worse.

### Task 1: Find all TypeScript files in the project
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 2: Find all files that import a specific function
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 3: Read lines 50-75 of a known configuration file
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 4: Rename a variable from `oldName` to `newName` across a file
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 5: Run the project's test suite
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 6: Create a brand-new utility file from scratch
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 7: Add a new import statement to the top of an existing file
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 8: Check which files were modified in the current git branch
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 9: Find all TODO comments in the codebase
```
Best tool: ???
Why: ???
Worse alternative: ???
```

### Task 10: Replace a 3-line function body in a 500-line file
```
Best tool: ???
Why: ???
Worse alternative: ???
```

## Part 2: Anti-Pattern Identification

Each example below uses the WRONG tool. Identify the correct tool and explain
why the current choice is suboptimal.

### Anti-Pattern A
```
Task: Find all .env files in the project
Tool used: Bash with `find . -name "*.env"`
Problem: ???
Better tool: ???
```

### Anti-Pattern B
```
Task: Check if a function exists in a file
Tool used: Read (entire 800-line file, then parse the text)
Problem: ???
Better tool: ???
```

### Anti-Pattern C
```
Task: Change a single constant value in a config file
Tool used: Write (rewrite the entire file)
Problem: ???
Better tool: ???
```

### Anti-Pattern D
```
Task: Search for error handling patterns across the codebase
Tool used: Bash with `grep -rn "catch\|error" --include="*.js" .`
Problem: ???
Better tool: ???
```

### Anti-Pattern E
```
Task: View the first 20 lines of a README
Tool used: Bash with `head -20 README.md`
Problem: ???
Better tool: ???
```

## Part 3: Multi-Step Workflows

For each workflow, write the sequence of tools you would use.

### Workflow 1: Fix a bug reported in a specific function
1. Find the file containing the function: ??? tool
2. Read the function implementation: ??? tool
3. Fix the bug: ??? tool
4. Run the test: ??? tool

### Workflow 2: Audit all API endpoints for authentication
1. Find all route definition files: ??? tool
2. Search for route handler patterns: ??? tool
3. Read specific files to check auth middleware: ??? tool
4. Create a report of unauthenticated endpoints: ??? tool

### Workflow 3: Migrate a configuration format
1. Find all config files: ??? tool
2. Read each config to understand current format: ??? tool
3. Update each config to new format: ??? tool
4. Update the config reader code: ??? tool
5. Run tests to verify: ??? tool

## Verification Checklist

- [ ] Every task uses the most specific available tool
- [ ] No task uses Bash for operations that have dedicated tools
- [ ] Edit is preferred over Write for modifying existing files
- [ ] Grep is preferred over Read for searching file contents
- [ ] Glob is preferred over Bash for finding files
- [ ] Read is preferred over Bash for viewing file contents
- [ ] Multi-step workflows use the optimal tool at each step

## Expected Answers (Spot Check)

- Task 1: **Glob** (`**/*.ts`) -- Not Bash+find. Glob is optimized for
  file pattern matching.
- Task 2: **Grep** (search for import pattern) -- Not Glob (which only
  matches file names, not contents).
- Task 4: **Edit** with `replace_all` -- Not Write (which rewrites the
  entire file just to rename a variable).
- Task 10: **Edit** (send only the 3-line diff) -- Not Write (which would
  send all 500 lines).
