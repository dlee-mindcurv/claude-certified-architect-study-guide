# Project Build and Tooling Instructions

**NOTE:** This file represents `.claude/CLAUDE.md` in a project root. It is named
`dot-claude-CLAUDE.md` in this examples directory because `.claude/` is a reserved
configuration directory. In your actual project, place this content at `.claude/CLAUDE.md`.

---

## Package Manager

- This project uses **pnpm** as the package manager
- Do not use npm or yarn; always use pnpm commands
- Install dependencies: `pnpm install`
- Add a dependency: `pnpm add <package>` or `pnpm add -D <package>` for dev deps

## Monorepo Structure

- This is a pnpm workspace monorepo managed by Turborepo
- Packages live in `packages/` (api, frontend, shared)
- Shared types and utilities are in `packages/shared`
- Import shared code as `@myproject/shared`

## Common Commands

- Run all tests: `pnpm test`
- Run tests for a specific package: `pnpm --filter @myproject/api test`
- Lint all packages: `pnpm lint`
- Build all packages: `pnpm build`
- Start dev servers: `pnpm dev`
- Type check: `pnpm typecheck`

## CI/CD

- The CI pipeline runs on GitHub Actions
- All PRs must pass: lint, typecheck, test, and build
- Merge to `main` triggers automatic deployment to staging
- Production deploys require manual approval

## Environment Variables

- Local env vars go in `.env.local` (gitignored)
- Required env vars are documented in `.env.example`
- Never commit secrets; use the team vault for sensitive values
