# CI Context -- CLAUDE.md for Automated Pipelines

This CLAUDE.md is designed to provide context when Claude Code runs in CI/CD pipelines.
It includes information that is especially useful for automated review and generation tasks.

## Project Overview

- TypeScript monorepo with packages: api, frontend, shared
- Build system: Turborepo with pnpm
- Testing framework: Vitest
- Linting: ESLint with strict TypeScript rules

## Testing Standards (for automated test generation)

- Test files: `*.test.ts` adjacent to source files
- Framework: Vitest (`describe`, `it`, `expect`)
- Mocking: Use `vi.mock()` for module mocks, `vi.fn()` for function mocks
- Run tests: `pnpm test` (all packages) or `pnpm --filter <pkg> test`
- Test fixtures are in `__fixtures__/` directories adjacent to test files
- Mock data files use the `*.mock.ts` naming convention

## Review Criteria (for automated code review)

When reviewing code in CI, prioritize these checks:

### Critical (must fix before merge)
- Security vulnerabilities (SQL injection, XSS, hardcoded secrets)
- Data loss risks (destructive operations without confirmation)
- Authentication/authorization bypasses
- Unhandled errors in critical paths

### Warning (should fix before merge)
- Performance issues (N+1 queries, missing indexes, memory leaks)
- Missing error handling in non-critical paths
- Type safety issues (`any` types, unsafe casts)
- Missing input validation at API boundaries

### Suggestion (nice to fix)
- Code style inconsistencies
- Missing documentation on public APIs
- Opportunities for code reuse
- Test coverage gaps

## Architecture Boundaries (for review context)

- `packages/api/src/handlers/` -- HTTP handlers (thin, delegate to services)
- `packages/api/src/services/` -- Business logic (testable, no HTTP concerns)
- `packages/api/src/db/` -- Data access layer (queries, transactions)
- `packages/frontend/src/components/` -- React components
- `packages/frontend/src/hooks/` -- Custom React hooks
- `packages/shared/src/types/` -- Shared TypeScript types

## Known Issues (skip during review)

- TODO comments in `packages/api/src/services/legacy-auth.ts` are tracked in JIRA-1234
- Deprecated endpoints in `packages/api/src/handlers/v1/` are being migrated
- Type assertion in `packages/shared/src/types/config.ts:42` is intentional (documented)

## Environment

- Node.js 20 LTS
- pnpm 9.x
- TypeScript 5.x strict mode
- Target: ES2022
