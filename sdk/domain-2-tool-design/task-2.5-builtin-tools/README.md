# Task 2.5: Select Built-In Tools Effectively

## Exam Relevance
Tested in Scenarios 2 (Code Generation) and 4 (Dev Productivity). Maps to
Skill S4.

## Overview

Claude Code provides built-in tools that are specifically designed for
codebase operations. Choosing the right tool for each operation reduces
token usage, improves reliability, and avoids unnecessary errors.

This task is primarily covered in the Claude Code native examples:

**See:** `claude/domain-2-tool-design/task-2.5-builtin-tools/`

The SDK-side materials in this directory provide exercises and scenario
guides that help you understand which tool to choose for different codebase
operations -- knowledge that applies to both Claude Code usage and to
designing tool sets for SDK-based agents.

## Claude Code Built-In Tools

| Tool | Purpose | Best For |
|------|---------|----------|
| **Read** | Read file contents | Viewing specific files, reading configs |
| **Write** | Create new files | New files, complete rewrites |
| **Edit** | Modify existing files | Targeted changes, surgical edits |
| **Glob** | Find files by pattern | Locating files by name/extension |
| **Grep** | Search file contents | Finding code patterns, references |
| **Bash** | Execute shell commands | Build, test, install, git operations |

## Key Selection Principles

1. **Prefer specialized tools over Bash wrappers.** Use Grep instead of
   `bash: grep -r`, Glob instead of `bash: find`, Read instead of `bash: cat`.

2. **Use Edit for modifications, Write for new files.** Edit sends only the
   diff; Write sends the entire file. For small changes to large files, Edit
   saves significant tokens.

3. **Use Glob to locate, then Read to examine.** Do not use `bash: find` then
   `bash: cat`. Glob finds files; Read examines them.

4. **Bash is for execution, not for reading.** Use Bash for `npm install`,
   `npm test`, `git status` -- not for viewing file contents.

## Files in This Directory

| File | Description |
|------|-------------|
| `exercise.md` | Choose the correct tool for given codebase tasks |
| `scenario-2-codegen/tool-selection-guide.md` | Code gen: tool selection |
| `scenario-4-devtools/tool-selection-guide.md` | Dev tools: tool selection |

## Cross-References

- `claude/domain-2-tool-design/task-2.5-builtin-tools/` -- Claude Code native
  configuration and tool usage examples
- `claude/domain-3-claude-code-config/` -- CLAUDE.md rules that guide tool
  selection behavior
