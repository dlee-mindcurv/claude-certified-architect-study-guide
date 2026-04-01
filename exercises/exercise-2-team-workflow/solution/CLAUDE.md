# Project Standards

## Code Style

- Use ES modules (`import`/`export`) — never CommonJS `require()`
- Variables and functions: `camelCase`
- Classes and constructors: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- File names: `kebab-case.js`
- Use `const` by default; `let` only when reassignment is needed; never `var`
- Single quotes for strings; template literals for interpolation
- Semicolons required
- 2-space indentation

## Testing Requirements

- Test framework: `node:test` (built-in) or `vitest`
- Test files: `*.test.js` co-located with source files
- All public APIs must have tests covering: happy path, error cases, edge cases
- Async code must test both success and rejection paths
- Mock external dependencies (API calls, file I/O) — never hit real services in tests
- Aim for 80%+ line coverage on critical paths

## Error Handling

- Use structured error responses: `{ errorCategory, isRetryable, message }`
- Error categories: `transient`, `validation`, `business`, `permission`
- Never swallow errors silently — always log or propagate
- Wrap async operations in try/catch with meaningful error messages
- Include enough context in error messages for debugging (IDs, input values)

## Git Conventions

- Commit format: `type(scope): description` (conventional commits)
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Branch naming: `feature/short-description`, `fix/issue-number`
- PR descriptions must include: what changed, why, and how to test

## Import Ordering

Organize imports in this order, separated by blank lines:

1. Node.js built-in modules (`node:fs`, `node:path`)
2. Third-party packages (`@anthropic-ai/sdk`, `dotenv`)
3. Local absolute imports (`@/lib/utils`)
4. Local relative imports (`./helpers`, `../shared/tools`)
