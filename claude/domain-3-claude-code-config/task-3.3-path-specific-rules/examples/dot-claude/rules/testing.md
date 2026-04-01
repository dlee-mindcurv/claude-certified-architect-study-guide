---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
---

# Testing Conventions

## Test Structure

- Use `describe` blocks to group tests by function or component
- Use `it` blocks with behavior-focused descriptions (not implementation-focused)
- Follow the Arrange-Act-Assert (AAA) pattern in every test
- Keep each test independent: no shared mutable state between tests

## Naming

- Test descriptions should read as sentences: `it("should return null when user is not found")`
- Describe blocks should name the unit: `describe("UserService.findById")`
- Avoid vague descriptions like `it("works correctly")` or `it("handles edge case")`

## Mocking

- Mock external dependencies (database, HTTP clients, file system)
- Do not mock the module under test
- Reset all mocks between tests using `beforeEach` or `afterEach`
- Prefer dependency injection over module mocking when possible

## React Component Tests

- Use React Testing Library, not Enzyme
- Use `userEvent` over `fireEvent` for simulating user interactions
- Query by accessible roles and labels, not by test IDs or CSS classes
- Test behavior from the user's perspective, not implementation details

## Assertions

- Assert on specific values, not just truthiness
- When testing errors, assert on the error type and message
- Verify mock call arguments, not just call counts
- Use `toEqual` for object comparison, `toBe` for primitives

## Coverage

- All new code paths must have tests
- Include at least: happy path, one edge case, one error case
- Do not write tests solely to increase coverage numbers
