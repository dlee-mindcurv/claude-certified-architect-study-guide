# Exercise 2: Configure Claude Code for a Team Development Workflow

**Domains reinforced:** D3 (Claude Code Configuration), D2 (Tool Design & MCP)

## Objective

Practice configuring Claude Code with CLAUDE.md hierarchies, custom slash commands,
path-specific rules with YAML frontmatter, MCP server integration, and plan mode
vs direct execution.

## Prerequisites

This exercise does not require an API key — it focuses on configuration files.
Review the starter/ directory, complete the TODOs, then compare with solution/.

## Steps

### Step 1: Create a project-level CLAUDE.md with universal standards

The project CLAUDE.md sets baseline rules for Claude Code across the entire repository.
It should include:
- Code style conventions (ES modules, naming patterns)
- Testing requirements
- Commit message format
- Import ordering rules
- Error handling standards

### Step 2: Create path-specific rule files with YAML frontmatter

Files in `.claude/rules/` use YAML frontmatter with `glob` patterns to apply rules
only to matching file paths. Create rules for:
- `testing.md` — rules that apply to test files (`**/*.test.{js,ts}`)
- `api-conventions.md` — rules for API route files (`src/api/**/*.{js,ts}`)

### Step 3: Create a project-scoped skill with context: fork and allowed-tools

Skills (formerly slash commands) live in `.claude/skills/`. Create an analysis
skill that:
- Uses `context: fork` so the skill runs in a branched conversation (does not
  pollute the main thread)
- Restricts available tools with `allowed-tools`
- Provides a structured prompt for code analysis

### Step 4: Configure an MCP server in .mcp.json

Set up an MCP server configuration with:
- Server command and arguments
- Environment variable expansion using `${env:VAR_NAME}` syntax
- Proper scoping (project-level vs user-level)

### Step 5: Test plan mode vs direct execution

Understand when to use:
- **Plan mode** (`--plan`): Claude proposes changes, waits for approval
- **Direct execution**: Claude makes changes immediately
- **Autofix mode**: Runs after lint/test failures to auto-correct

## Directory Structure

**Note:** In a real project, rule files live in `.claude/rules/` and the MCP config
is `.mcp.json`. In this exercise, we use `dot-claude/` and `dot-mcp.json` to avoid
conflicts with actual Claude Code configuration. When applying these patterns to your
own projects, rename to the dot-prefixed versions.

```
exercise-2-team-workflow/
  starter/                          # Complete the TODOs in these files
    CLAUDE.md                       # Step 1: Universal project rules
    dot-claude/                     # Maps to .claude/ in a real project
      rules/
        testing.md                  # Step 2: Test file rules
        api-conventions.md          # Step 2: API route rules
      skills/
        analyze/
          SKILL.md                  # Step 3: Analysis skill
    dot-mcp.json                    # Maps to .mcp.json in a real project
  solution/                         # Reference implementation
    CLAUDE.md
    dot-claude/
      rules/
        testing.md
        api-conventions.md
      skills/
        analyze/
          SKILL.md
    dot-mcp.json
```

## Key Exam Concepts Practiced

- **Task 3.1**: CLAUDE.md hierarchy (project-level, user-level, enterprise)
- **Task 3.2**: `.claude/rules/` with YAML frontmatter glob patterns
- **Task 3.3**: Custom skills with context: fork and allowed-tools
- **Task 3.4**: `.mcp.json` with environment variable expansion
- **Task 3.5**: Plan mode vs direct execution trade-offs
