# /review Command

**File location:** `.claude/commands/review.md`

Invoke with: `/review` in Claude Code

---

Perform a thorough code review of the staged changes (use `git diff --cached`).

Check each change against this checklist:

## 1. Correctness
- Are there logic errors or incorrect assumptions?
- Are edge cases handled (null, undefined, empty arrays, boundary values)?
- Does the code do what the PR description says it should?

## 2. Security
- No hardcoded secrets, tokens, or passwords
- User input is validated and sanitized
- SQL queries use parameterized statements
- No sensitive data in logs or error messages

## 3. Performance
- No N+1 query patterns in database access
- No unnecessary re-renders in React components
- Large lists use pagination or virtualization
- Async operations are properly parallelized when independent

## 4. Code Quality
- Follows project naming conventions
- No dead code or commented-out blocks
- Functions are focused (single responsibility)
- Error handling is explicit (no empty catch blocks)

## 5. Testing
- New code paths have corresponding tests
- Edge cases are tested
- Mocks are appropriate (not over-mocking)
- Test descriptions are clear and behavior-focused

## Output Format

For each finding, report:
- **Severity:** Critical | Warning | Suggestion
- **Location:** `filename:line_number`
- **Issue:** Brief description
- **Fix:** Recommended change

End with:
- Total count by severity
- Overall recommendation: **Approve** or **Request Changes**
