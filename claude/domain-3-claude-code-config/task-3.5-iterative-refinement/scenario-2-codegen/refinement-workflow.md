# Scenario 2: Code Generation Refinement Workflow

## Context

In a code generation scenario, a team uses Claude Code to generate new features. This
workflow combines all iterative refinement techniques to produce high-quality generated code
that matches team standards.

## The Complete Workflow

### Phase 1: Requirements Gathering (Interview Pattern)

Start with a high-level request and let Claude ask clarifying questions.

**Developer:**
> "I need to add a product search feature to our API."

**Claude asks:**
- What fields should be searchable? (name, description, category, tags)
- Full-text search or exact match?
- Should results be paginated?
- Any filtering beyond text search? (price range, category, in-stock)
- Sort options? (relevance, price, date added)
- Response format?

**Developer answers each question.** This ensures Claude understands the complete
requirements before generating any code.

### Phase 2: Specification by Example (Input/Output Examples)

After the interview, provide concrete examples of expected behavior.

**Developer:**
> "Here are examples of the search API:"
>
> **Request:** `GET /api/products/search?q=laptop&minPrice=500&sort=price_asc&page=1`
>
> **Response:**
> ```json
> {
>   "data": [
>     {
>       "id": "prod_123",
>       "name": "Pro Laptop 15",
>       "price": 599.99,
>       "category": "electronics",
>       "relevanceScore": 0.95
>     }
>   ],
>   "pagination": {
>     "page": 1,
>     "pageSize": 20,
>     "total": 47,
>     "totalPages": 3
>   }
> }
> ```
>
> **Request:** `GET /api/products/search?q=nonexistent`
>
> **Response:**
> ```json
> {
>   "data": [],
>   "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
> }
> ```

### Phase 3: Test-Driven Implementation

Write tests that encode the requirements, then iterate.

**Iteration 1: Core search functionality**

Write tests for:
- Basic text search returns matching products
- Empty query returns validation error
- No results returns empty array with pagination

Share failures. Claude implements the basic search.

**Iteration 2: Filtering and sorting**

Add tests for:
- Price range filtering works correctly
- Category filtering works correctly
- Sort by price ascending/descending
- Sort by relevance (default)

Share failures. Claude adds filtering and sorting.

**Iteration 3: Pagination and edge cases**

Add tests for:
- Pagination returns correct page and total counts
- Out-of-range page returns empty data
- Large result sets are properly paginated
- Special characters in search query are handled

Share failures. Claude adds pagination and edge case handling.

### Phase 4: Issue Resolution (Sequential)

After the main implementation, address any remaining issues sequentially.

1. **Run full test suite** -- identify any failures
2. **Fix each issue one at a time** -- starting with the most impactful
3. **Verify after each fix** -- ensure no regressions
4. **Run linting and type checking** -- fix style and type issues

Use sequential resolution here because issues may be related (a type error might cause
multiple test failures).

### Phase 5: Review and Polish

Use the team's `/review` command to perform a final quality check against team standards.
Address any findings from the review.

## Workflow Summary

```
Interview Pattern         --> Clarify requirements
  |
  v
Input/Output Examples     --> Define expected behavior concretely
  |
  v
Test-Driven Iteration     --> Implement and verify incrementally
  (3-4 rounds)
  |
  v
Sequential Issue Fix      --> Address remaining problems one by one
  |
  v
Team Review Command       --> Verify against team standards
  |
  v
Done: Code is generated, tested, reviewed, and matches team conventions
```

## Expected Outcomes

By following this workflow:
- Requirements are fully understood before code is written
- Expected behavior is unambiguously defined
- Implementation is verified by tests at every step
- Issues are resolved systematically
- Final code matches team standards

## Time Investment

| Phase | Time | Value |
|-------|------|-------|
| Interview | 5-10 min | Prevents building the wrong thing |
| Examples | 5 min | Prevents misunderstanding the format |
| Test iteration (3 rounds) | 15-20 min | Ensures correctness |
| Issue resolution | 5-10 min | Catches remaining problems |
| Review | 5 min | Ensures team standards compliance |
| **Total** | **35-50 min** | **High-quality, tested, reviewed code** |

Without this workflow, a single prompt might generate code in 5 minutes but require
hours of manual debugging and rework.
