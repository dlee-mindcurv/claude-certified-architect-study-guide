# API Package Conventions

## Async Patterns

- All route handlers must use async/await syntax
- Never use raw `.then()/.catch()` promise chains in handlers
- Use `Promise.all()` for concurrent independent operations
- Use `Promise.allSettled()` when partial failures are acceptable

## Error Handling

- All API errors must return a standardized JSON response:
  ```json
  {
    "error": "Human-readable error message",
    "code": 400
  }
  ```
- Use a centralized error handler middleware
- Never expose stack traces in production responses
- Log full error details server-side; return safe messages client-side
- Map domain errors to appropriate HTTP status codes

## Request Validation

- Use Zod schemas for all request body and query parameter validation
- Define schemas in dedicated `*.schema.ts` files adjacent to handlers
- Validate at the handler entry point before any business logic
- Return 400 with specific validation error messages

## Database

- All database queries must use parameterized queries (never string interpolation)
- Use transactions for operations that modify multiple tables
- Always handle connection pool exhaustion gracefully
- Include query timeouts on all database operations

## Response Format

- All successful responses use: `{ data: T }` wrapper
- Paginated responses include: `{ data: T[], pagination: { page, pageSize, total } }`
- Use consistent date format: ISO 8601 strings
- Use camelCase for all JSON field names
