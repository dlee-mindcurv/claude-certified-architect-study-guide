# Exercise: Path-Specific Rules

## Objective

Create three rule files for different code areas and verify that rules load only when
editing files that match their glob patterns.

## Part 1: Create Rule Files

Create the following three rule files in `.claude/rules/`:

### Rule 1: Testing Conventions

**File:** `.claude/rules/testing.md`

```yaml
---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
---
```

Content should specify:
- Use `describe/it` blocks (not `test()`)
- Follow Arrange-Act-Assert pattern
- Mock external dependencies only
- Use `userEvent` over `fireEvent` for React component tests
- Each test should be independent (no shared mutable state)

### Rule 2: API Conventions

**File:** `.claude/rules/api-conventions.md`

```yaml
---
paths:
  - "src/api/**/*"
---
```

Content should specify:
- All handlers use async/await
- Return standardized error format
- Validate input with Zod at entry point
- Use parameterized database queries
- Include request ID in log statements

### Rule 3: Infrastructure as Code

**File:** `.claude/rules/terraform.md`

```yaml
---
paths:
  - "terraform/**/*"
---
```

Content should specify:
- Use variables for all configurable values
- Add descriptions to all variables and outputs
- Use `locals` for computed values
- Follow naming convention: `<project>-<environment>-<resource>`
- Tag all resources with environment, team, and managed-by

## Part 2: Verify Selective Loading

### Test 1: Edit a test file

Open or edit a file like `src/utils/math.test.ts`. Run `/memory` to verify:
- [ ] `testing.md` rule is loaded
- [ ] `api-conventions.md` is NOT loaded (path does not match)
- [ ] `terraform.md` is NOT loaded (path does not match)

### Test 2: Edit an API file

Open or edit a file like `src/api/routes/users.ts`. Run `/memory` to verify:
- [ ] `api-conventions.md` rule is loaded
- [ ] `testing.md` is NOT loaded (file is not a test)
- [ ] `terraform.md` is NOT loaded (path does not match)

### Test 3: Edit an API test file

Open or edit `src/api/routes/users.test.ts`. Run `/memory` to verify:
- [ ] BOTH `testing.md` AND `api-conventions.md` are loaded (both globs match)
- [ ] `terraform.md` is NOT loaded

### Test 4: Edit a Terraform file

Open or edit `terraform/modules/vpc/main.tf`. Run `/memory` to verify:
- [ ] `terraform.md` rule is loaded
- [ ] `testing.md` is NOT loaded
- [ ] `api-conventions.md` is NOT loaded

## Part 3: Thought Exercise

Consider these scenarios and determine which rule files would load:

| File Being Edited | Rules Loaded |
|-------------------|-------------|
| `src/api/middleware/auth.ts` | api-conventions.md |
| `src/components/Button.test.tsx` | testing.md |
| `src/api/handlers/users.spec.ts` | testing.md, api-conventions.md |
| `terraform/environments/prod/main.tf` | terraform.md |
| `src/utils/helpers.ts` | (none of these three) |
| `README.md` | (none of these three) |

## Key Takeaways

- Rules load per-file based on glob matching, not per-directory
- Multiple rules can match the same file (additive)
- Use `/memory` to verify which rules are active
- Glob patterns should be specific enough to avoid false matches
- Centralized rules in `.claude/rules/` are easier to maintain than scattered CLAUDE.md files
