---
glob: "src/api/**/*.{js,ts}"
---

# API Route Conventions

These rules apply automatically when editing API route files.

## Request Validation

- Validate ALL inputs at the API boundary — never trust client data
- Use schema validation (Zod, Joi, or JSON Schema) for request bodies
- Validate path parameters and query strings explicitly
- Return 400 for malformed requests with a specific error message

## Error Response Format

All error responses must follow this structure:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": {}
  }
}
```

## HTTP Status Codes

- `200` — Successful GET, PUT, PATCH
- `201` — Successful POST that creates a resource
- `204` — Successful DELETE with no response body
- `400` — Malformed request (bad JSON, missing required fields)
- `401` — Missing or invalid authentication
- `403` — Authenticated but not authorized for this resource
- `404` — Resource not found
- `422` — Request is well-formed but semantically invalid (business rule violation)
- `500` — Unexpected server error (always log the full error internally)

## Authentication and Authorization

- Every route must check authentication unless explicitly marked as public
- Authorization checks must happen BEFORE any data mutations
- Never leak internal error details in 401/403 responses

## Logging

- Log all incoming requests with method, path, and request ID
- Log response status codes and latency
- Log errors with full stack traces (server-side only — never expose to client)
- Use structured logging (JSON format) with correlation IDs
