---
glob: "**/*.test.{js,ts}"
---

# Test File Rules

These rules apply automatically when editing test files.

## Test Structure

- Use `describe()` blocks to group related tests by feature or function
- Use `it()` or `test()` with descriptive names: `it('returns null when customer ID is not found')`
- Keep each test focused on a single behavior — split compound assertions

## Assertions

- Use `assert.strictEqual()` for value comparisons — never `assert.equal()` (loose comparison)
- Use `assert.deepStrictEqual()` for object/array comparisons
- Use `assert.throws()` or `assert.rejects()` for error assertions with specific error checks
- Always assert the specific value, not just truthiness

## Mocking

- Mock external dependencies (API clients, databases, file system) at the boundary
- Use `node:test` mock utilities or `vi.mock()` for vitest
- Reset mocks between tests to ensure isolation
- Prefer dependency injection over module-level mocking when possible

## Test Isolation

- Each test must be independent — no shared mutable state between tests
- Use `beforeEach` for per-test setup, not `before` (which runs once)
- Clean up side effects (temp files, environment variables) in `afterEach`

## Required Edge Cases

Every function under test should cover:
- Null/undefined inputs
- Empty strings and empty arrays
- Boundary values (0, negative numbers, max values)
- Error paths (network failures, invalid data)
- Concurrent/async race conditions where applicable
