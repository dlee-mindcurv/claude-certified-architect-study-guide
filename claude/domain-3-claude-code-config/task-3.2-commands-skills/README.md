# Task 3.2: Create and Manage Commands and Skills

## Overview

Commands (slash commands) and skills provide repeatable, shareable workflows in Claude Code.
Commands are prompt templates invoked with `/command-name`. Skills are more powerful: they
can run in isolated contexts, restrict available tools, and accept arguments. Understanding
the scoping, authoring, and invocation of both is exam-critical.

## Commands (Slash Commands)

### What They Are

Commands are markdown files that contain prompt templates. When you type `/command-name`
in Claude Code, the content of that markdown file is sent as your prompt. This ensures
consistent, repeatable interactions.

### Project-Scoped Commands: `.claude/commands/`

- **Location:** `<project-root>/.claude/commands/<name>.md`
- **Shared via version control:** Yes -- committed to the repo
- **Invoked as:** `/project:command-name` or just `/command-name`
- **Use cases:** Team review checklists, test generation prompts, documentation templates

Example file structure:
```
.claude/commands/
  review.md         -->  /review
  test-gen.md       -->  /test-gen
  migrate.md        -->  /migrate
```

### User-Scoped Commands: `~/.claude/commands/`

- **Location:** `~/.claude/commands/<name>.md`
- **Shared via version control:** No -- personal only
- **Invoked as:** `/user:command-name`
- **Use cases:** Personal workflow shortcuts, custom debug prompts

### Command Content

Commands are plain markdown. They can reference the current context:

```markdown
Review the currently open file for:
1. Security vulnerabilities
2. Performance issues
3. Adherence to our coding standards

Provide specific line-number references for each finding.
```

You can also use `$ARGUMENTS` to pass dynamic input:

```markdown
Generate comprehensive unit tests for the following function:

$ARGUMENTS
```

When invoked as `/test-gen calculateTotal`, the `$ARGUMENTS` placeholder is replaced with
`calculateTotal`.

## Skills

### What They Are

Skills are enhanced commands defined by a `SKILL.md` file in `.claude/skills/<skill-name>/`.
They support YAML frontmatter that controls execution behavior.

### Location

- **Project-scoped:** `.claude/skills/<skill-name>/SKILL.md`
- **User-scoped:** `~/.claude/skills/<skill-name>/SKILL.md`

### SKILL.md Frontmatter

```yaml
---
context: fork
allowed-tools:
  - Read
  - Grep
  - Glob
argument-hint: "Describe what you want to analyze"
---
```

**Key frontmatter fields:**

| Field | Description |
|-------|-------------|
| `context: fork` | Runs the skill in an isolated subagent. Output does not pollute the main conversation context. |
| `allowed-tools` | Restricts which tools the skill can use. Limits blast radius. |
| `argument-hint` | Shown to the user as a placeholder when invoking the skill. |

### context: fork

The `context: fork` setting is critical for the exam. When a skill runs with `context: fork`:

1. A **subagent** is spawned with its own conversation context
2. The subagent executes the skill instructions
3. Only the **final result** is returned to the main conversation
4. Verbose intermediate output (grep results, file reads) stays in the fork

This is essential for skills that produce large amounts of intermediate output that would
otherwise consume the main conversation's context window.

**Without fork:** All tool calls and intermediate output accumulate in the main context.
**With fork:** Only the summarized result appears in the main context.

### Personal Skill Variants: `~/.claude/skills/`

Developers can create personal skill variants in their home directory. These are not shared
with the team and can customize behavior for individual workflows.

## Exam Tips

- Know the difference between project-scoped (`.claude/commands/`) and user-scoped
  (`~/.claude/commands/`) commands
- Understand `context: fork` and why it matters for context management
- Know that `allowed-tools` restricts which tools a skill can access
- Understand `$ARGUMENTS` placeholder in command templates
- Be able to choose between a command (simple prompt) and a skill (isolated execution)
