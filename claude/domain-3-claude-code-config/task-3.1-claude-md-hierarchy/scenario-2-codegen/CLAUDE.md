# Scenario 2: Code Generation -- Team CLAUDE.md

This CLAUDE.md is designed for a multi-developer team using Claude Code for consistent
code generation across the project.

## Architecture

- This is a Next.js 14 application using the App Router
- Backend API routes live in `app/api/`
- Shared types are in `lib/types/`
- Database access layer is in `lib/db/`
- Reusable UI components are in `components/`

## Code Generation Standards

When generating code, always follow these conventions:

### TypeScript

- Strict mode is enabled; do not use `any` types
- All function parameters and return types must be explicitly typed
- Use Zod for runtime validation at API boundaries
- Prefer `const` assertions for literal types

### Naming

- Files: kebab-case (`user-profile.tsx`, `auth-service.ts`)
- Components: PascalCase (`UserProfile`, `AuthModal`)
- Functions: camelCase (`getUserById`, `validateToken`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE`)
- Types/Interfaces: PascalCase with descriptive names (`UserProfileResponse`)

### File Organization

- One primary export per file
- Group imports: external packages, then internal modules, then relative imports
- Separate each import group with a blank line

### Error Handling

- API routes must return typed error responses
- Use Result pattern for operations that can fail: `{ success: true, data } | { success: false, error }`
- Log errors with structured logging (include request ID, user ID, operation name)

### Testing

- Generate tests alongside code: every new file gets a `.test.ts` companion
- Use `describe/it` blocks with clear behavior descriptions
- Mock external dependencies; do not mock internal modules
- Include edge cases: empty inputs, null values, boundary conditions

## Team Workflow

- All generated code must pass `pnpm lint` and `pnpm typecheck` before commit
- Use Conventional Commits for all commit messages
- PR descriptions should explain what was generated and any manual adjustments made
