# Exercise: Built-in Tool Selection

## Objective

Given a codebase exploration task, demonstrate the correct tool selection sequence.
Practice choosing the right tool for each step.

## Part 1: Tool Selection Quiz

For each task, identify the correct built-in tool. Answers are below.

### Questions

1. Find all files with `.config.` in their name
2. Find all files that contain `process.env`
3. Read the contents of `tsconfig.json`
4. Add a new field to an existing interface in `types.ts`
5. Create a new test file `math.test.ts`
6. Run the project's test suite
7. Find all TypeScript files in the `src/api/` directory
8. Find which files import `UserService`
9. Read lines 50-100 of a large file
10. Replace all occurrences of `oldName` with `newName` in a file

### Answers

1. **Glob** -- searching by file name pattern: `**/*.config.*`
2. **Grep** -- searching file contents: pattern `process\.env`
3. **Read** -- reading a specific known file
4. **Edit** -- modifying part of an existing file
5. **Write** -- creating a new file that does not exist
6. **Bash** -- running `npm test` or `pnpm test`
7. **Glob** -- finding files by pattern: `src/api/**/*.ts`
8. **Grep** -- searching file contents: pattern `import.*UserService`
9. **Read** -- with offset=50, limit=50
10. **Edit** -- with replace_all=true

## Part 2: Codebase Exploration Sequence

### Scenario

You are joining a new project and need to understand how authentication works.
Identify the correct tool sequence.

### Step 1: Discover auth-related files

**Tool:** Glob
**Pattern:** `**/*auth*`
**Why:** You do not know the file names yet, but "auth" is likely in the name.

**Expected result:** A list of files like:
```
src/middleware/auth.ts
src/services/auth-service.ts
src/handlers/auth-handler.ts
src/types/auth.ts
tests/auth-service.test.ts
```

### Step 2: Find the main auth entry point

**Tool:** Grep
**Pattern:** `export.*authenticate` or `app.use.*auth`
**Why:** You want to find where authentication is applied in the application.

**Expected result:** The middleware registration in `src/app.ts` or `src/index.ts`.

### Step 3: Read the auth middleware

**Tool:** Read
**File:** `src/middleware/auth.ts`
**Why:** You found the file; now you need to understand its implementation.

### Step 4: Find what calls the auth service

**Tool:** Grep
**Pattern:** `import.*auth-service` or `AuthService`
**Why:** You want to understand the usage pattern across the codebase.

### Step 5: Check the auth tests

**Tool:** Read
**File:** `tests/auth-service.test.ts`
**Why:** Tests reveal the expected behavior and edge cases.

### Step 6: Verify test status

**Tool:** Bash
**Command:** `pnpm test -- --filter auth`
**Why:** Confirm the tests pass with the current code.

## Part 3: Practice Sequence

Try this exploration in your own project:

1. **Glob** `**/*error*` -- Find all error-related files
2. **Grep** `throw new` -- Find all locations that throw errors
3. **Read** the most common error handling file
4. **Grep** `catch` -- Find all catch blocks
5. **Read** a few catch blocks to understand error handling patterns
6. **Bash** `pnpm test` -- Run tests to verify error handling works

Document what you found. Did each tool choice make sense? Was there a step where a
different tool would have been better?

## Part 4: Anti-Pattern Identification

Identify what is wrong with each approach and suggest the correct tool:

1. **Using `Bash` with `grep -r "TODO" .`**
   Problem: Bash grep is slower and may have permission issues.
   Correct: Use Grep tool with pattern `TODO`.

2. **Using `Write` to change one import statement in a 500-line file**
   Problem: Write sends the entire 500-line file over the wire.
   Correct: Use Edit to change only the import line.

3. **Using `Grep` with pattern `*.test.ts` to find test files**
   Problem: Grep searches file contents, not file names.
   Correct: Use Glob with pattern `**/*.test.ts`.

4. **Using `Read` on every file in a directory to find a specific function**
   Problem: Reading every file is slow and wasteful.
   Correct: Use Grep to search for the function name across all files.

5. **Using `Bash` with `cat src/index.ts | head -20`**
   Problem: Read tool handles this natively with offset and limit.
   Correct: Use Read with limit=20.

## Key Takeaways

- Match the tool to the task: names (Glob), content (Grep), details (Read), changes (Edit)
- Use tools in sequence: discover (Glob) then search (Grep) then examine (Read)
- Edit is preferred over Write for modifying existing files
- Bash is for build/test/git commands, not file operations
- The correct tool sequence produces faster, more accurate results
