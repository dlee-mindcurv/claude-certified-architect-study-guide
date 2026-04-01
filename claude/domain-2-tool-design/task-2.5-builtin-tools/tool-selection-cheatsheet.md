# Built-in Tool Selection Cheatsheet

## Quick Reference

| I need to... | Use | Not |
|-------------|-----|-----|
| Find files named `*.test.ts` | **Glob** | Bash (`find`) |
| Find files containing `import React` | **Grep** | Bash (`grep`) |
| Read `src/index.ts` | **Read** | Bash (`cat`) |
| Change line 42 of a file | **Edit** | Write (whole file) |
| Create a new file | **Write** | Bash (`echo >`) |
| Run `npm test` | **Bash** | -- |
| Find all TODO comments | **Grep** | Bash (`grep -r`) |
| List files in a directory | **Glob** (`dir/*`) | Bash (`ls`) |
| Check if a file exists | **Read** (will error if not) | Bash (`test -f`) |
| Search for a function definition | **Grep** (`function myFunc`) | -- |

## Tool Decision Flowchart

```
START: What is the task?
  |
  |-- "I need to find files"
  |     |
  |     |-- By name/pattern? --> GLOB
  |     |-- By content? ------> GREP
  |
  |-- "I need to read a file"
  |     |
  |     |-- Specific file? --------> READ
  |     |-- Search then read? -----> GREP (find) + READ (examine)
  |
  |-- "I need to change a file"
  |     |
  |     |-- New file? ---------> WRITE
  |     |-- Modify existing? --> EDIT
  |     |-- Complete rewrite? -> WRITE (after reading first)
  |
  |-- "I need to run something"
  |     |
  |     |-- Build/test/lint? --> BASH
  |     |-- Git command? -----> BASH
  |     |-- Install packages? -> BASH
  |
  |-- "I need to explore a codebase"
        |
        |-- Discover structure --> GLOB (find files)
        |-- Understand patterns --> GREP (search patterns)
        |-- Read key files ------> READ (examine details)
```

## Common Task Sequences

### Explore and Understand

1. **Glob** -- Find relevant files (`**/*.ts`)
2. **Grep** -- Search for specific patterns (`import.*database`)
3. **Read** -- Examine key files in detail

### Find and Fix

1. **Grep** -- Find the bug location (`error.*undefined`)
2. **Read** -- Understand the context around the bug
3. **Edit** -- Apply the fix

### Create New Feature

1. **Glob** -- Find existing similar files to use as templates
2. **Read** -- Read the template file
3. **Write** -- Create the new file based on the template
4. **Bash** -- Run tests to verify

### Refactor

1. **Grep** -- Find all usages of the target (`oldFunctionName`)
2. **Read** -- Understand each usage context
3. **Edit** -- Update each file
4. **Bash** -- Run tests to check for regressions

## Grep vs Glob Decision Guide

| Question | Grep | Glob |
|----------|------|------|
| Do I know the file name? | | X |
| Do I know the file content? | X | |
| Am I searching for a string? | X | |
| Am I searching for a file type? | | X |
| Do I want file paths only? | X (files_with_matches mode) | X |
| Do I want matching lines? | X (content mode) | |
| Do I want to count matches? | X (count mode) | |

## Edit vs Write Decision Guide

| Situation | Edit | Write |
|-----------|------|-------|
| Change one line | X | |
| Change a function | X | |
| Add a section | X | |
| Remove a section | X | |
| Create new file | | X |
| Complete rewrite | | X |
| Rename throughout file | X (replace_all) | |
| Generate from template | | X |

## Performance Notes

- **Glob** is faster than `Bash find` for file discovery
- **Grep** is faster than `Bash grep` and handles permissions better
- **Read** with offset/limit is efficient for large files (do not read the whole file)
- **Edit** sends only the diff; Write sends the entire file content
- **Bash** should be reserved for operations no other tool can handle
