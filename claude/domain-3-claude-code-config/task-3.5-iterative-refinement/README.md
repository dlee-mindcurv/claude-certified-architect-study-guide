# Task 3.5: Apply Iterative Refinement Techniques

## Overview

Iterative refinement is the practice of improving Claude Code's output through structured
feedback loops rather than expecting perfect results from a single prompt. The exam tests
your knowledge of specific techniques: concrete input/output examples, test-driven iteration,
the interview pattern, and sequential vs parallel issue resolution.

## Technique 1: Concrete Input/Output Examples

### What It Is

Providing explicit examples of expected transformations helps Claude understand exactly what
you want. Instead of describing the transformation abstractly, you show it.

### Why It Works

- Removes ambiguity about the expected format and behavior
- Claude can pattern-match from examples more reliably than from descriptions
- Works especially well for data transformations, formatting, and parsing tasks

### Example

Instead of:
> "Convert the API response to match our frontend model format"

Provide:
> "Convert the API response to our frontend format. Example:
> Input: `{ "user_name": "jdoe", "created_at": "2024-01-15T10:00:00Z" }`
> Output: `{ "userName": "jdoe", "createdAt": new Date("2024-01-15T10:00:00Z") }`"

## Technique 2: Test-Driven Iteration

### What It Is

Write tests that define the expected behavior first, then share the test failures with
Claude Code and ask it to make them pass. Iterate: fix one failure, run tests, fix the next.

### The Pattern

1. Write (or generate) test cases that define expected behavior
2. Run tests -- they fail because the implementation does not exist yet
3. Share the failures with Claude: "Here are the failing tests. Implement the code to make
   them pass."
4. Claude writes the implementation
5. Run tests again
6. If failures remain, share the new failures: "These tests still fail. Fix the implementation."
7. Repeat until all tests pass

### Why It Works

- Tests serve as an unambiguous specification
- Each iteration has clear success criteria (tests pass or fail)
- Prevents regression: passing tests stay passing
- Builds confidence in the final implementation

## Technique 3: The Interview Pattern

### What It Is

Instead of giving Claude a complete specification upfront, start with a high-level request
and let Claude ask clarifying questions. Answer them, then let Claude proceed with better
understanding.

### The Pattern

1. State the high-level goal: "I need a user authentication system"
2. Claude asks questions: "What auth methods? Session or JWT? OAuth providers?"
3. You answer the questions
4. Claude may ask follow-up questions based on your answers
5. Once requirements are clear, Claude proceeds with implementation

### Why It Works

- Surfaces requirements you might not have thought to specify
- Produces better results than a long, potentially incomplete specification
- Natural conversation flow that builds shared understanding
- Especially useful when you are not sure of all the requirements yourself

### When to Use

- New features with open-ended requirements
- When you have a goal but not a detailed specification
- When integrating with unfamiliar systems or libraries
- When there are important decisions that depend on context

## Technique 4: Sequential vs Parallel Issue Resolution

### Sequential Resolution

Address issues one at a time. Fix one problem, verify the fix, then move to the next.

**When to use:**
- Issues might be related (fixing one may fix others)
- Each fix is complex and needs focused attention
- You want to verify each fix in isolation

### Parallel Resolution

Address multiple independent issues simultaneously.

**When to use:**
- Issues are clearly independent (different files, different subsystems)
- Fixes are straightforward and unlikely to conflict
- You want to save time on mechanical changes

### Decision Guide

| Scenario | Approach |
|----------|----------|
| 5 type errors in the same module | Sequential (may be related) |
| Linting fixes across different files | Parallel (independent) |
| A failing test and a type error | Sequential (test may depend on the type fix) |
| Adding missing JSDoc to 10 functions | Parallel (independent) |
| A cascade of import errors | Sequential (root cause may fix downstream errors) |

## Exam Tips

- Know all four techniques and when each is appropriate
- Test-driven iteration is the most structured and verifiable technique
- The interview pattern is for open-ended or underspecified requirements
- Input/output examples are for transformation and formatting tasks
- Sequential resolution is safer; parallel is faster
- Combining techniques (e.g., interview pattern + test-driven iteration) is valid
