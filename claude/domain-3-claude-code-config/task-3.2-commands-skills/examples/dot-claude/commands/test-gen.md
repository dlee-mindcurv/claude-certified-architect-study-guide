# /test-gen Command

**File location:** `.claude/commands/test-gen.md`

Invoke with: `/test-gen <function-or-file-name>` in Claude Code

---

Generate comprehensive unit tests for: $ARGUMENTS

## Instructions

1. Read the source file containing the target function or module
2. Identify all public functions and their signatures
3. Generate tests following these guidelines:

### Test Structure
- Use `describe` blocks for each function
- Use `it` blocks with behavior-focused descriptions
- Follow the Arrange-Act-Assert pattern

### Coverage Requirements
- **Happy path:** Normal expected inputs and outputs
- **Edge cases:** Empty strings, zero values, empty arrays, null/undefined
- **Boundary conditions:** Min/max values, off-by-one scenarios
- **Error cases:** Invalid inputs, network failures, permission errors
- **Type edge cases:** Wrong types (if applicable), special characters

### Mocking
- Mock external dependencies (database, API calls, file system)
- Do not mock the function under test
- Use dependency injection patterns where possible
- Reset mocks between tests

### Assertions
- Assert on specific values, not just truthiness
- Check error messages and error types, not just that errors are thrown
- Verify mock call arguments and call counts
- Use snapshot testing sparingly and only for complex output structures

## Output

Generate the test file with the conventional naming:
- Source: `user-service.ts` --> Test: `user-service.test.ts`
- Source: `UserProfile.tsx` --> Test: `UserProfile.test.tsx`

Place the test file adjacent to the source file.
