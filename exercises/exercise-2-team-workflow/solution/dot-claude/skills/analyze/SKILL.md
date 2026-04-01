---
context: fork
allowed-tools:
  - Read
  - Glob
  - Grep
description: "Analyze code for patterns, complexity, and potential issues"
---

Analyze the code at the specified path for quality, complexity, and potential issues.

## Target

Analyze: $ARGUMENTS

If $ARGUMENTS is a directory, find all `.js` and `.ts` files in it. If it is a single file, analyze just that file.

## Analysis Checklist

For each file, evaluate:

### 1. Complexity
- Functions longer than 40 lines
- Nesting deeper than 3 levels (if/for/while/try)
- Functions with more than 5 parameters
- Cyclomatic complexity concerns (many branching paths)

### 2. Error Handling
- Async functions missing try/catch
- Promise chains without .catch()
- Empty catch blocks that swallow errors
- Missing error propagation in middleware

### 3. Naming Consistency
- Variables that do not follow camelCase
- Functions with misleading names (e.g., `getData` that also writes data)
- Boolean variables without is/has/should prefix
- Abbreviations that reduce readability

### 4. Performance
- Unnecessary re-computation in loops
- Missing early returns that cause unnecessary processing
- Large objects copied where references would suffice
- N+1 patterns in data fetching

## Output Format

Produce a structured report:

### Summary
- Total files analyzed
- Overall health: Good / Needs Attention / Critical

### Findings
For each issue found:
- **File**: path
- **Line**: approximate line number
- **Severity**: high / medium / low
- **Category**: complexity / error-handling / naming / performance
- **Description**: what the issue is
- **Recommendation**: how to fix it

### Recommendations
Top 3 highest-impact improvements to make first.
