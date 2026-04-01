# Project Coding Standards

## TypeScript

- Enable strict mode in all TypeScript files (`"strict": true` in tsconfig.json)
- Use explicit return types on all exported functions
- Prefer `interface` over `type` for object shapes unless unions are needed
- Use `unknown` instead of `any`; if `any` is unavoidable, add a comment explaining why

## Error Handling

- Never use empty catch blocks; always log or re-throw
- Use custom error classes that extend `Error` for domain-specific errors
- All async functions must have try/catch or propagate errors to a handler
- Include context in error messages (what operation failed and with what inputs)

## Testing

- All new functions must have corresponding unit tests
- Test files live adjacent to source files with `.test.ts` or `.spec.ts` suffix
- Use descriptive test names: `it("should return 404 when user is not found")`
- Aim for test coverage above 80% on new code

## Documentation

- All exported functions must have JSDoc comments with @param and @returns
- Complex logic must have inline comments explaining the "why" not the "what"
- Update the relevant README when adding new features or changing APIs

## Git Conventions

- Commit messages follow Conventional Commits: `type(scope): description`
- Keep commits focused on a single change
- Reference issue numbers in commit messages when applicable
