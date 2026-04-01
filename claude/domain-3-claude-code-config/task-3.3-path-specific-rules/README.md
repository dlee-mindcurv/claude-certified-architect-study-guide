# Task 3.3: Apply Path-Specific Rules Using .claude/rules/

## Overview

The `.claude/rules/` directory provides a way to define context-sensitive instructions that
load only when Claude Code is editing files matching specific glob patterns. This is more
targeted than directory-level CLAUDE.md files and allows cross-directory conventions based
on file type or path pattern rather than physical directory structure.

## How .claude/rules/ Works

### File Structure

Rules files are markdown files with YAML frontmatter stored in `.claude/rules/`:

```
.claude/rules/
  testing.md
  api-conventions.md
  terraform.md
  react-components.md
```

### YAML Frontmatter Format

Each rule file starts with YAML frontmatter delimited by `---` that specifies which files
the rules apply to:

```yaml
---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
---

# Testing Conventions

When writing or modifying test files...
```

### How Rules Load

1. When Claude Code is about to edit a file, it checks all rule files in `.claude/rules/`
2. Each rule file's `paths` globs are matched against the file being edited
3. If any glob matches, that rule file's content is loaded into context
4. Multiple rule files can match simultaneously
5. Rules are additive with other CLAUDE.md content

### Glob Pattern Syntax

| Pattern | Matches |
|---------|---------|
| `**/*.test.*` | Any test file at any depth (`src/utils/math.test.ts`) |
| `src/api/**/*` | Any file under src/api/ (`src/api/routes/users.ts`) |
| `**/*.tsx` | Any TSX file (`components/Button.tsx`) |
| `terraform/**/*` | Any file under terraform/ (`terraform/modules/vpc/main.tf`) |
| `*.md` | Markdown files in root only (`README.md`) |
| `**/*.{ts,tsx}` | TypeScript and TSX files at any depth |

## Comparison: .claude/rules/ vs Directory-Level CLAUDE.md

| Feature | .claude/rules/ | Directory CLAUDE.md |
|---------|---------------|-------------------|
| **Trigger** | File matches glob pattern | Working in that directory |
| **Location** | Centralized in .claude/rules/ | Distributed in each directory |
| **Cross-directory** | Yes -- globs span directories | No -- scoped to one directory |
| **File-type rules** | Excellent (match by extension) | Poor (match by location only) |
| **Discoverability** | All rules in one place | Scattered across directories |
| **Best for** | File-type conventions, cross-cutting concerns | Package-specific conventions |

## When to Use .claude/rules/

**Use .claude/rules/ when:**
- You want rules based on file type (all test files, all TypeScript files)
- The convention spans multiple directories (testing patterns everywhere)
- You want centralized rule management
- The rule is about how code is written, not where it lives

**Use directory-level CLAUDE.md when:**
- The convention is specific to a package or module
- The rules relate to the module's architecture and boundaries
- The directory has its own build/test setup

## Example: Multi-Rule Loading

When editing `src/api/routes/users.test.ts`, the following rules might all load:

1. `testing.md` (matches `**/*.test.*`)
2. `api-conventions.md` (matches `src/api/**/*`)
3. `typescript.md` (matches `**/*.ts`)

All three rule files contribute additive context for editing that file.

## Exam Tips

- Know the YAML frontmatter format with `paths` containing glob arrays
- Understand that rules load per-file, not per-directory
- Multiple rules can match simultaneously (additive)
- Know when to choose .claude/rules/ over directory-level CLAUDE.md
- Glob patterns follow standard glob syntax with `**` for recursive matching
- Rules are version-controlled and shared with the team
