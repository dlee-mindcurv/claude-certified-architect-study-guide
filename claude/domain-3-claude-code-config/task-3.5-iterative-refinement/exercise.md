# Exercise: Iterative Refinement Techniques

## Objective

Practice the test-driven iteration pattern and the interview pattern to produce
higher-quality output from Claude Code.

## Part 1: Test-Driven Iteration

### Scenario

You need a `parseCSV` function that converts CSV strings into arrays of objects
using the first row as headers.

### Step 1: Write the tests first

Create `parse-csv.test.ts` with these test cases:

```typescript
describe("parseCSV", () => {
  it("should parse a simple CSV with headers", () => {
    const input = "name,age\nAlice,30\nBob,25";
    const result = parseCSV(input);
    expect(result).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]);
  });

  it("should handle empty input", () => {
    expect(parseCSV("")).toEqual([]);
  });

  it("should handle header-only input", () => {
    expect(parseCSV("name,age")).toEqual([]);
  });

  it("should handle values with commas in quotes", () => {
    const input = 'name,address\nAlice,"123 Main St, Apt 4"';
    const result = parseCSV(input);
    expect(result).toEqual([
      { name: "Alice", address: "123 Main St, Apt 4" },
    ]);
  });

  it("should trim whitespace from values", () => {
    const input = "name , age \n Alice , 30 ";
    const result = parseCSV(input);
    expect(result).toEqual([
      { name: "Alice", age: "30" },
    ]);
  });
});
```

### Step 2: Share failures with Claude

Run the tests. They will fail (no implementation exists). Share the output:

> "Here are my failing tests for a parseCSV function. Implement the function
> to make all tests pass."

### Step 3: Iterate

- If some tests pass but others fail, share the remaining failures:
  > "These tests still fail: [paste failures]. Fix the implementation."
- Repeat until all tests pass

### Step 4: Add more tests

Once all initial tests pass, add edge cases:
- Input with newlines inside quoted values
- Input with escaped quotes
- Input with varying numbers of columns per row

Share the new failures and iterate again.

### Reflection

- How many iterations did it take?
- Did the test-first approach produce a more robust implementation?
- Were there edge cases the tests caught that a description would have missed?

## Part 2: The Interview Pattern

### Scenario

You need Claude to implement a rate limiter for your API.

### Step 1: Start with a high-level request

Tell Claude:
> "I need to add rate limiting to my API. What questions do you have before
> you start implementing?"

### Step 2: Answer Claude's questions

Claude should ask questions like:
- What rate limiting algorithm? (fixed window, sliding window, token bucket)
- What are the limits? (requests per time period)
- Per user, per IP, or per API key?
- Should limits vary by endpoint?
- Where should rate limit state be stored? (in-memory, Redis)
- What response should rate-limited requests receive?

Answer each question based on your needs. For this exercise:
- Sliding window algorithm
- 100 requests per minute per user
- Per authenticated user (fall back to IP for unauthenticated)
- Higher limits for admin endpoints (500/min)
- Store in Redis
- Return 429 with Retry-After header

### Step 3: Let Claude proceed

After answering questions, Claude should implement the rate limiter with a clear
understanding of your requirements.

### Step 4: Compare the result

Consider what would have happened if you had just said:
> "Add rate limiting to my API."

Without the interview pattern, Claude would have had to guess at every decision point,
likely producing a generic implementation that does not match your actual needs.

### Reflection

- What questions did Claude ask that you had not considered?
- Did the interview produce a more tailored implementation?
- How does this compare to writing a detailed specification upfront?

## Part 3: Combining Techniques

Try combining both techniques:

1. Use the interview pattern to clarify requirements for a new feature
2. Write tests based on the clarified requirements
3. Use test-driven iteration to implement the feature
4. Use input/output examples to refine edge case handling

This combined approach produces the highest quality output.

## Key Takeaways

- Test-driven iteration gives Claude unambiguous success criteria
- The interview pattern surfaces hidden requirements
- Combining techniques is more effective than any single technique
- Each iteration improves the output; expect 2-4 rounds for complex tasks
- Always verify the final result against the original requirements
