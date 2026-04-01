---
paths:
  - "src/api/**/*"
---

# API Coding Conventions

## Handler Pattern

- All route handlers must use async/await (no raw promise chains)
- Extract business logic into service functions; handlers should only:
  1. Parse and validate the request
  2. Call the appropriate service function
  3. Format and return the response
- Keep handlers under 30 lines

## Request Validation

- Validate all request bodies and query parameters using Zod schemas
- Define schemas in `*.schema.ts` files adjacent to the handler
- Validate at the handler entry point before any business logic executes
- Return 400 with specific field-level error messages for validation failures

## Error Responses

- All error responses must use the standardized format:
  ```json
  {
    "error": "Human-readable error message",
    "code": 400,
    "requestId": "uuid"
  }
  ```
- Map domain errors to HTTP status codes in the error handler middleware
- Never expose stack traces or internal details in production error responses
- Log full error details server-side with the request ID for correlation

## Database Access

- All database queries must use parameterized queries (no string interpolation)
- Use transactions for multi-table mutations
- Set query timeouts on all database operations
- Handle connection pool exhaustion with appropriate retry or error responses

## Logging

- Include the request ID in all log statements within a request lifecycle
- Use structured logging (JSON format) with consistent field names
- Log at appropriate levels: error for failures, warn for degraded, info for events
- Never log sensitive data (tokens, passwords, PII)

## Response Format

- Successful responses: `{ data: T }`
- Paginated responses: `{ data: T[], pagination: { page, pageSize, total } }`
- Use camelCase for all JSON field names
- Dates as ISO 8601 strings
