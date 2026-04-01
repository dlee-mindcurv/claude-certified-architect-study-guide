---
paths:
  - "src/api/**/*"
  - "app/api/**/*"
---

# API Handler Conventions (Code Generation Scenario)

## Handler Structure

When generating API handlers, follow this structure:

1. **Import validation schema** from adjacent `*.schema.ts` file
2. **Validate request** at the top of the handler
3. **Call service layer** for business logic
4. **Return standardized response**

## Request Handling

- Parse request body with `request.json()` and validate with Zod
- Parse query parameters and validate with Zod
- Return 400 immediately if validation fails, with specific error details
- Extract authenticated user from middleware-provided context

## Response Format

All responses must follow these patterns:

- **Success:** `{ data: T }` with appropriate 2xx status
- **Created:** `{ data: T }` with 201 status
- **No content:** Empty body with 204 status
- **Client error:** `{ error: string, code: number }` with 4xx status
- **Server error:** `{ error: "Internal server error", code: 500 }` (no details exposed)

## Service Layer

- Business logic lives in service files, not in handlers
- Services accept typed parameters and return typed results
- Services throw domain-specific errors that handlers catch and map to HTTP status codes
- Services are testable in isolation (no HTTP request/response objects)

## Error Handling

- Use try/catch in handlers to catch service-layer errors
- Map domain errors to HTTP status codes:
  - `NotFoundError` -> 404
  - `ValidationError` -> 400
  - `AuthorizationError` -> 403
  - `ConflictError` -> 409
- Log errors with request context (request ID, user ID, operation name)

## Database Queries

- All queries use parameterized statements
- Use transactions for multi-step mutations
- Include timeout limits on all queries
- Return typed results from the data access layer

## Testing Generated Handlers

- Each handler must have a corresponding test file
- Test: valid request returns expected response
- Test: invalid request returns 400 with error details
- Test: unauthorized request returns 401/403
- Test: not found returns 404
- Test: service error returns 500 without leaking details
