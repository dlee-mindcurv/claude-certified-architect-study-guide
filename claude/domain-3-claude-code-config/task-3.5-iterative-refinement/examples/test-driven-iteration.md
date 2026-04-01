# Test-Driven Iteration Pattern

## Concept

Test-driven iteration uses automated tests as the feedback mechanism for Claude Code.
You write tests that define expected behavior, share failures with Claude, and iterate
until all tests pass. This provides the tightest, most verifiable feedback loop.

## The Workflow

```
+------------------+
| 1. Write tests   |  <-- You define the expected behavior
| that fail         |
+------------------+
        |
        v
+------------------+
| 2. Share failures |  <-- "Make these tests pass"
| with Claude       |
+------------------+
        |
        v
+------------------+
| 3. Claude writes  |  <-- Claude implements based on test expectations
| implementation    |
+------------------+
        |
        v
+------------------+
| 4. Run tests      |  <-- Verify the implementation
+------------------+
        |
     All pass?
      /     \
    YES      NO
    |         |
    v         v
  DONE    Go to step 2
          (share remaining
           failures)
```

## Example: Building a URL Parser

### Iteration 1: Write initial tests

```typescript
describe("parseQueryString", () => {
  it("should parse simple key-value pairs", () => {
    expect(parseQueryString("name=alice&age=30")).toEqual({
      name: "alice",
      age: "30",
    });
  });

  it("should handle URL-encoded values", () => {
    expect(parseQueryString("greeting=hello%20world")).toEqual({
      greeting: "hello world",
    });
  });

  it("should handle empty string", () => {
    expect(parseQueryString("")).toEqual({});
  });
});
```

**Prompt to Claude:**
> "Here are failing tests for a `parseQueryString` function. Implement it to make them pass."

### Iteration 2: Tests pass, add more

All 3 tests pass. Now add edge cases:

```typescript
it("should handle keys without values", () => {
  expect(parseQueryString("debug&verbose")).toEqual({
    debug: "",
    verbose: "",
  });
});

it("should handle duplicate keys (last wins)", () => {
  expect(parseQueryString("color=red&color=blue")).toEqual({
    color: "blue",
  });
});

it("should handle leading question mark", () => {
  expect(parseQueryString("?name=alice")).toEqual({
    name: "alice",
  });
});
```

**Prompt to Claude:**
> "These additional tests fail. Update the implementation to handle these edge cases."

### Iteration 3: Handle encoded special characters

```typescript
it("should handle plus signs as spaces", () => {
  expect(parseQueryString("q=hello+world")).toEqual({
    q: "hello world",
  });
});

it("should handle encoded ampersands in values", () => {
  expect(parseQueryString("company=Ben%26Jerry")).toEqual({
    company: "Ben&Jerry",
  });
});
```

**Prompt to Claude:**
> "Two more test failures. The function needs to handle plus-as-space and encoded ampersands."

## Why This Works

1. **Unambiguous specification:** Tests define exactly what "correct" means
2. **Incremental complexity:** Start simple, add edge cases progressively
3. **Regression prevention:** Earlier tests continue to pass as new ones are added
4. **Verifiable progress:** Each iteration has clear success/failure criteria
5. **Self-documenting:** The tests document the function's expected behavior

## Tips for Effective Test-Driven Iteration

### Start Simple
Begin with the happy path. Get basic functionality working before adding edge cases.

### Be Specific in Failure Sharing
Instead of just saying "tests fail," share the exact error output:
> "Test 'should handle duplicate keys' fails: Expected `{ color: 'blue' }` but received
> `{ color: 'red' }`. The implementation should use the last value for duplicate keys."

### Add Tests Incrementally
Do not dump 50 test cases at once. Add 3-5 at a time so Claude can focus on specific
behaviors per iteration.

### Include the Error Output
Claude Code can read test output directly. Share the full output so it can see:
- Which tests failed
- What was expected vs received
- Stack traces pointing to the issue

### Combine with CLAUDE.md Context
Your CLAUDE.md testing conventions (describe/it pattern, assertion style) should guide
the test structure. Claude reads these conventions when generating the implementation.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Better Approach |
|-------------|-------------|-----------------|
| Writing 50 tests at once | Overwhelming; hard to debug | Add 3-5 tests per iteration |
| Vague test descriptions | Claude cannot understand intent | Use descriptive it() strings |
| Testing implementation details | Fragile tests that break on refactor | Test behavior and outputs |
| No tests for error cases | Implementation may not handle failures | Always include error tests |
| Sharing only "it failed" | Claude cannot diagnose the issue | Share full test output |
