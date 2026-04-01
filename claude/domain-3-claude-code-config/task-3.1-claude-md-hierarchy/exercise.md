# Exercise: CLAUDE.md Hierarchy Configuration

## Objective

Practice creating a multi-level CLAUDE.md hierarchy and diagnose a common misconfiguration.

## Part 1: Create the Hierarchy

Create the following file structure in a test project:

```
my-project/
  CLAUDE.md                      <-- Project-level (root)
  .claude/
    CLAUDE.md                    <-- Project-level (.claude dir)
  packages/
    api/
      CLAUDE.md                  <-- Directory-level (API package)
    frontend/
      CLAUDE.md                  <-- Directory-level (frontend package)
```

### Step 1: Root CLAUDE.md

Write a root `CLAUDE.md` with these universal rules:
- All code must use TypeScript strict mode
- All functions must have JSDoc comments
- All errors must be handled explicitly (no silent catches)
- Tests are required for all new functions

### Step 2: .claude/CLAUDE.md

Write a `.claude/CLAUDE.md` with build/tooling instructions:
- Use `pnpm` as the package manager
- Run `pnpm test` to execute tests
- Run `pnpm lint` to check code style
- The project uses a monorepo structure with Turborepo

### Step 3: API Package CLAUDE.md

Write `packages/api/CLAUDE.md` with:
- All handlers must use async/await (no raw promises)
- Errors must return standardized JSON: `{ error: string, code: number }`
- Use Zod for request validation
- Database queries must use parameterized queries

### Step 4: Frontend Package CLAUDE.md

Write `packages/frontend/CLAUDE.md` with:
- Use functional components with React hooks
- Use Tailwind CSS for styling (no inline styles, no CSS modules)
- All components must have a corresponding `.test.tsx` file
- Use React Query for data fetching

## Part 2: Diagnose the Misconfiguration

### Scenario

A developer reports that their personal preference for using 2-space indentation is not
being applied when they work on the project. They have added this instruction:

```markdown
# Formatting

- Use 2-space indentation for all files
- Prefer single quotes over double quotes
```

They placed this content in `~/.claude/CLAUDE.md` on their machine.

### Questions

1. **Will this instruction be loaded when they open the project?**
   Yes -- user-level CLAUDE.md applies to all projects.

2. **Will their teammates see this instruction?**
   No -- `~/.claude/CLAUDE.md` is user-level and not version controlled.

3. **The developer now wants the entire team to use 2-space indentation. Where should
   they put this instruction?**
   In the project root `CLAUDE.md` or `.claude/CLAUDE.md`, and commit it to version control.

4. **Another developer has 4-space indentation in their `~/.claude/CLAUDE.md`. What happens?**
   Both instructions load (user-level and project-level are additive). Claude sees conflicting
   guidance and may not consistently follow either. The project-level instruction should take
   precedence conceptually, but it is better to resolve the conflict explicitly.

5. **How can you verify which CLAUDE.md files are loaded?**
   Use the `/memory` command in Claude Code to see all active memory files.

## Part 3: Verification

After creating the hierarchy, run `/memory` in Claude Code while in different directories
and confirm:

- [ ] At the project root: root CLAUDE.md + .claude/CLAUDE.md are loaded
- [ ] In packages/api/: all project-level files + api/CLAUDE.md are loaded
- [ ] In packages/frontend/: all project-level files + frontend/CLAUDE.md are loaded
- [ ] User-level CLAUDE.md is always present regardless of location

## Key Takeaways

- User-level config is personal and invisible to teammates
- Project-level config is shared and should contain team conventions
- Directory-level config adds package-specific rules without affecting other packages
- Use /memory to diagnose loading issues
- Conflicting instructions across levels should be avoided; resolve them explicitly
