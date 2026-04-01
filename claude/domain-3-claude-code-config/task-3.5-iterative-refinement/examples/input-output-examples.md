# Input/Output Examples for Iterative Refinement

## Concept

Providing concrete input/output examples is one of the most effective ways to communicate
expected transformations to Claude Code. Examples eliminate ambiguity and serve as implicit
test cases.

## Pattern: Data Transformation

### Without Examples (Ambiguous)

> "Convert our database records to the API response format."

This is vague. Claude must guess the field mappings, naming conventions, and data formats.

### With Examples (Clear)

> "Convert database records to API response format. Here are examples:"
>
> **Input (database record):**
> ```json
> {
>   "id": 42,
>   "user_name": "jdoe",
>   "email_address": "jdoe@example.com",
>   "created_at": "2024-01-15 10:30:00",
>   "is_active": 1,
>   "profile_image_url": null
> }
> ```
>
> **Expected Output (API response):**
> ```json
> {
>   "id": 42,
>   "userName": "jdoe",
>   "email": "jdoe@example.com",
>   "createdAt": "2024-01-15T10:30:00Z",
>   "isActive": true,
>   "profileImageUrl": ""
> }
> ```

Claude can now see: snake_case to camelCase, datetime format change, integer boolean to
actual boolean, null to empty string for URLs.

## Pattern: Code Transformation

### Example: Refactoring callback-style to async/await

> "Refactor callback patterns to async/await. Example:"
>
> **Before:**
> ```typescript
> function getUser(id: string, callback: (err: Error | null, user?: User) => void) {
>   db.query("SELECT * FROM users WHERE id = ?", [id], (err, rows) => {
>     if (err) return callback(err);
>     callback(null, rows[0]);
>   });
> }
> ```
>
> **After:**
> ```typescript
> async function getUser(id: string): Promise<User> {
>   const rows = await db.query("SELECT * FROM users WHERE id = ?", [id]);
>   return rows[0];
> }
> ```

## Pattern: Error Message Formatting

> "Standardize our error messages. Examples:"
>
> | Input | Expected Output |
> |-------|----------------|
> | `"not found"` | `"Resource not found. Verify the ID and try again."` |
> | `"unauthorized"` | `"Authentication required. Please provide a valid token."` |
> | `"validation error: email"` | `"Validation failed: 'email' is not a valid email address."` |

## Pattern: Test Generation

> "Generate tests following this pattern:"
>
> **For this function:**
> ```typescript
> function add(a: number, b: number): number { return a + b; }
> ```
>
> **Expected tests:**
> ```typescript
> describe("add", () => {
>   it("should add two positive numbers", () => {
>     expect(add(2, 3)).toBe(5);
>   });
>   it("should handle negative numbers", () => {
>     expect(add(-1, 1)).toBe(0);
>   });
>   it("should handle zero", () => {
>     expect(add(0, 5)).toBe(5);
>   });
> });
> ```
>
> "Now generate tests for `multiply(a: number, b: number): number` following
> the same pattern."

## Best Practices for Input/Output Examples

1. **Show at least 2 examples** -- one is rarely enough to establish a pattern
2. **Include edge cases** -- show how nulls, empty values, and special cases should be handled
3. **Be consistent** -- all examples should follow the same conventions
4. **Show the complete transformation** -- do not omit fields or steps
5. **Include both happy path and error cases** when relevant
6. **Use realistic data** -- contrived examples may miss important patterns

## When Input/Output Examples Work Best

| Scenario | Effectiveness |
|----------|:------------:|
| Data format transformation | High |
| Code pattern refactoring | High |
| String formatting / parsing | High |
| Error message standardization | High |
| Architectural decisions | Low |
| Business logic implementation | Medium |
| UI layout changes | Low |

## Iterative Refinement with Examples

1. Provide initial examples
2. Review Claude's output
3. If the output diverges from expectations, provide a corrective example:
   > "For this input, you produced X but I expected Y. Adjust the transformation."
4. Claude adjusts based on the corrective example
5. Repeat until the pattern is learned
