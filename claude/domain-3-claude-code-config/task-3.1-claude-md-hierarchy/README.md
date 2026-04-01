# Task 3.1: Configure the CLAUDE.md Hierarchy

## Overview

CLAUDE.md files provide persistent instructions to Claude Code. They form a layered hierarchy
that allows instructions to be scoped at different levels: personal preferences, shared project
conventions, and package-specific rules. Understanding this hierarchy -- including load order,
precedence, and modular organization -- is essential for the exam.

## The CLAUDE.md Hierarchy

### 1. User-Level: `~/.claude/CLAUDE.md`

- **Scope:** Applies to ALL projects for this user
- **Shared via version control:** No -- this is personal configuration
- **Use cases:** Personal coding style preferences, preferred editor references, personal MCP
  server configs, global conventions you always want applied
- **Example path:** `/Users/yourname/.claude/CLAUDE.md`

### 2. Project-Level: Root `CLAUDE.md` or `.claude/CLAUDE.md`

- **Scope:** Applies to the entire project
- **Shared via version control:** Yes -- committed to the repository
- **Use cases:** Team coding standards, project architecture rules, build/test instructions,
  technology stack conventions
- **Two valid locations:**
  - `<project-root>/CLAUDE.md` -- visible in the root directory
  - `<project-root>/.claude/CLAUDE.md` -- tucked away in the .claude directory
- Both are loaded if present; they are additive

### 3. Directory-Level: Subdirectory `CLAUDE.md` Files

- **Scope:** Applies only when working within that directory or its children
- **Shared via version control:** Yes
- **Use cases:** Package-specific conventions, module-specific patterns, microservice boundaries
- **Example path:** `packages/api/CLAUDE.md`, `services/auth/CLAUDE.md`

## Load Order and Precedence Diagram

```
+---------------------------------------------+
|  1. User-level: ~/.claude/CLAUDE.md          |  <-- Loaded first (personal)
+---------------------------------------------+
                    |
                    v
+---------------------------------------------+
|  2. Project root: CLAUDE.md                  |  <-- Loaded second (team shared)
|     Project root: .claude/CLAUDE.md          |
+---------------------------------------------+
                    |
                    v
+---------------------------------------------+
|  3. Directory-level: packages/api/CLAUDE.md  |  <-- Loaded when working in
|                                              |      that directory (additive)
+---------------------------------------------+
                    |
                    v
+---------------------------------------------+
|  4. .claude/rules/ files (glob-matched)      |  <-- Loaded when editing files
|                                              |      matching their path patterns
+---------------------------------------------+
```

**Key points about precedence:**
- All levels are **additive** -- they do not override each other; they combine
- If instructions conflict, Claude Code sees all of them and must reconcile
- More specific instructions (directory-level) effectively take precedence for
  the files they apply to because they provide more targeted context
- `.claude/rules/` files with path globs are the most targeted and only load when
  editing matching files

## @import Syntax for Modular Includes

Instead of putting everything in a single CLAUDE.md, you can split instructions into
separate files and include them:

```markdown
# CLAUDE.md

@import docs/coding-standards.md
@import docs/testing-guidelines.md
@import docs/api-conventions.md
```

This keeps your CLAUDE.md concise while allowing detailed instructions in dedicated files.
The imported files are resolved relative to the CLAUDE.md file's location.

## .claude/rules/ as an Alternative

For path-specific conventions, `.claude/rules/` files (covered in Task 3.3) offer a more
targeted alternative to directory-level CLAUDE.md files. Key differences:

| Feature | Directory CLAUDE.md | .claude/rules/ |
|---------|-------------------|----------------|
| Scope trigger | Working in that directory | Editing files matching glob patterns |
| Location | In the target directory | Centralized in .claude/rules/ |
| Cross-directory | No | Yes -- globs can span directories |
| Best for | Package-level conventions | File-type or pattern-based conventions |

## The /memory Command

Use `/memory` in Claude Code to diagnose which CLAUDE.md files and rules are currently loaded.
This is invaluable for debugging when instructions do not seem to take effect.

```
> /memory

Loaded memory files:
  ~/.claude/CLAUDE.md (user-level)
  /project/CLAUDE.md (project-level)
  /project/.claude/CLAUDE.md (project-level)
  /project/packages/api/CLAUDE.md (directory-level)
  /project/.claude/rules/testing.md (path rule, active)
```

## Exam Tips

- Know the three hierarchy levels and which are version-controlled
- Understand that all levels are additive, not overriding
- Know when to use directory-level CLAUDE.md vs .claude/rules/ files
- Be able to diagnose why instructions are not loading (wrong level, wrong location)
- Understand @import syntax for modular organization
- Know that /memory shows which files are currently active
