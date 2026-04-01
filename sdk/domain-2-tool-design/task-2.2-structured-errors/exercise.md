# Exercise: Implement Structured Error Responses

## Objective

Implement structured error responses for a tool that validates and processes
discount codes. Then verify that an agent loop handles each error type
correctly: retrying transient errors, fixing validation errors, and explaining
business errors to the user.

## Background

You are building a discount code tool for the CSR agent. The tool accepts a
discount code and an order total, then returns the discounted amount. Three
types of failures can occur:

1. **Transient:** The discount service is temporarily unavailable
2. **Validation:** The discount code format is invalid
3. **Business:** The discount code has expired or does not apply to the order

## Part 1: Implement the Tool

Create a file `apply-discount.js` in this directory. Implement the
`applyDiscount` function that returns structured MCP error responses:

```js
import {
  createErrorResponse,
  createSuccessResponse,
  ERROR_CATEGORIES,
} from '../../../shared/schemas/error-response.js';

// Mock data
const discountCodes = {
  'SAVE20': { percent: 20, minOrder: 50.00, expiresAt: '2025-12-31' },
  'SUMMER10': { percent: 10, minOrder: 0, expiresAt: '2024-06-30' },  // Expired
  'VIP50': { percent: 50, minOrder: 200.00, expiresAt: '2026-01-01' },
};

export function applyDiscount({ code, order_total }) {
  // TODO: Implement with these error cases:
  //
  // 1. Transient: Simulate 10% chance of service unavailability
  //    → errorCategory: 'transient', isRetryable: true
  //    → message: 'Discount service temporarily unavailable'
  //
  // 2. Validation: Code must match pattern /^[A-Z]+\d+$/
  //    → errorCategory: 'validation', isRetryable: false
  //    → message: Include the invalid code and expected format
  //
  // 3. Business (expired): Check expiresAt against current date
  //    → errorCategory: 'business', isRetryable: false
  //    → message: Include code name and expiration date
  //
  // 4. Business (min order): Check order_total >= minOrder
  //    → errorCategory: 'business', isRetryable: false
  //    → message: Include minimum amount and current total
  //
  // 5. Success: Return discounted amount and savings
  //    → { originalTotal, discountPercent, savings, newTotal }
}
```

## Part 2: Add the Tool Definition

Write a tool definition for `apply_discount` with a description that follows
the Task 2.1 principles (input formats, boundaries, prerequisites):

```js
export const discountToolDefinition = {
  name: 'apply_discount',
  description: '???', // TODO: Write a complete description
  input_schema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: '???', // TODO: Include format constraint
      },
      order_total: {
        type: 'number',
        description: '???', // TODO: Include valid range
      },
    },
    required: ['code', 'order_total'],
  },
};
```

## Part 3: Agent Loop Integration

Extend the example from `example.js` to include your discount tool. Test with
these 3 queries:

1. **Transient test:** `"Apply code SAVE20 to my $75 order"`
   - Expected: Tool auto-retries, eventually succeeds (or reports temporary issue)

2. **Validation test:** `"Use discount code save-twenty on my order"`
   - Expected: Agent recognizes invalid format, asks for the correct code

3. **Business test:** `"Apply code SUMMER10 to my $30 order"`
   - Expected: Agent explains the code is expired (not just "failed")

## Verification Checklist

### Error Response Structure
- [ ] Each error includes `isError: true` on the outer response
- [ ] Each error includes `errorCategory` matching one of the 4 categories
- [ ] Each error includes `isRetryable` set correctly for the category
- [ ] Each error includes a human-readable `message` with specific details

### Agent Recovery Behavior
- [ ] Transient errors are retried automatically (up to the retry limit)
- [ ] Validation errors cause the agent to ask the user for correct input
- [ ] Business errors are explained to the user (not just "operation failed")
- [ ] The agent never retries a non-retryable error with the same input

### Contrast with Generic Errors
- [ ] Replace your structured errors with `{ isError: true, content: 'Failed' }`
- [ ] Observe: the agent cannot determine the correct recovery action
- [ ] Restore structured errors and observe the improved recovery behavior

## Expected Output (Business Error)

For the query "Apply code SUMMER10 to my $30 order":

```
Tool call: apply_discount({ code: "SUMMER10", order_total: 30 })
ERROR [business]: Discount code SUMMER10 expired on 2024-06-30
  isRetryable: false

Agent: "I'm sorry, but the discount code SUMMER10 has expired (it was valid
until June 30, 2024). Would you like to try a different discount code?"
```

The agent explains the SPECIFIC reason (expired, with date) rather than a
generic failure message. This is only possible because the error response
includes the `errorCategory` and descriptive `message`.

## Hints

- Use `createErrorResponse` and `createSuccessResponse` from the shared schema
- The `isRetryable` flag should be `true` ONLY for transient errors
- For validation errors, include the invalid input in the message so Claude can
  explain what was wrong
- For business errors, include dates and amounts so Claude can communicate the
  specific constraint to the user
