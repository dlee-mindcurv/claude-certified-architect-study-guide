# /review Command -- Code Generation Scenario

**File location:** `.claude/commands/review.md` (in a code generation team project)

Invoke with: `/review` in Claude Code

---

Review the staged changes with a focus on **code generation quality**. This team uses
Claude Code for code generation, so pay special attention to generated code patterns.

## Review Criteria

### 1. Generated Code Quality
- Does the generated code follow our TypeScript strict mode conventions?
- Are types explicit and meaningful (no `any`, no overly generic types)?
- Does it follow our file naming conventions (kebab-case files, PascalCase components)?
- Are there unnecessary comments that just restate the code?

### 2. Consistency with Existing Codebase
- Does the generated code match the style and patterns of surrounding code?
- Are imports organized the same way as existing files?
- Does it use the same libraries (e.g., Zod for validation, not Joi)?
- Are error handling patterns consistent with the rest of the codebase?

### 3. Test Quality
- Were tests generated alongside the code?
- Do tests cover the happy path and at least 2 edge cases?
- Are test descriptions behavior-focused?
- Do tests follow our Arrange-Act-Assert pattern?

### 4. Architecture Compliance
- Does the code respect module boundaries?
- Are database queries in the data access layer, not in handlers?
- Is business logic in services, not in controllers?
- Are shared types used from `@myproject/shared`?

### 5. Security
- No hardcoded values that should be environment variables
- Input validation at API boundaries
- No sensitive data in log statements

## Output

For each finding:
- **Category:** Which review criteria (1-5)
- **Severity:** Critical | Warning | Suggestion
- **File:Line:** Location of the issue
- **Issue:** What is wrong
- **Fix:** How to fix it

Summary:
- Findings by severity
- Whether this looks like it needs manual adjustment or is ready to commit
- Overall: **Approve** | **Request Changes**
