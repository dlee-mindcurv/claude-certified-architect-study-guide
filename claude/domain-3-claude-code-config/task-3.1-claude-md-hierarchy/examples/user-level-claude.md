# Example: User-Level ~/.claude/CLAUDE.md

This file shows what a developer might put in their personal `~/.claude/CLAUDE.md`.
This content is NOT committed to version control and applies to all projects.

---

**File location:** `~/.claude/CLAUDE.md`

```markdown
# Personal Preferences

## Editor and Environment

- I use VS Code as my primary editor
- My terminal is iTerm2 with zsh
- I prefer dark mode references in documentation examples

## Coding Style

- I prefer 2-space indentation
- I like descriptive variable names over short abbreviations
- When showing me options, present them as numbered lists

## Communication

- Explain technical decisions briefly; I have senior-level experience
- Skip basic explanations of language features
- When suggesting refactors, explain the trade-offs

## Personal MCP Servers

- I have a personal notes MCP server running for quick lookups
- My personal GitHub token is configured in the environment

## Languages

- I primarily work in TypeScript and Python
- When generating shell scripts, prefer zsh syntax
- For Python, I prefer f-strings over .format()
```

---

## Key Points for the Exam

1. **Not version controlled:** This file lives in the user's home directory and is never
   committed to a project repository.

2. **Applies globally:** These preferences load for every project the user opens in Claude Code.

3. **Additive with project config:** These preferences combine with project-level CLAUDE.md;
   they do not override project rules.

4. **Personal MCP servers:** User-level config is the right place to reference personal
   tools that are not shared with the team.

5. **Risk of conflicts:** If user-level config conflicts with project-level config
   (e.g., different indentation), behavior may be inconsistent. Project conventions
   should take precedence, and the user should align their personal config or omit
   conflicting preferences.
