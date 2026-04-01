# Claude Certified Architect — Foundations Exam Prep

Working examples, exercises, and documentation covering all 5 domains and 6 scenarios from the Claude Certified Architect – Foundations certification exam.

## Quick Start

```bash
npm install
cp .env.example .env  # Add your ANTHROPIC_API_KEY
node sdk/domain-1-agentic-architecture/task-1.1-agentic-loops/example-raw-api.js
```

## Structure

### `sdk/` — Node SDK Examples
Examples using `@anthropic-ai/sdk` (raw API) and Claude Agent SDK patterns.

| Directory | Domain | Weight |
|-----------|--------|--------|
| `sdk/domain-1-agentic-architecture/` | Agentic Architecture & Orchestration | 27% |
| `sdk/domain-2-tool-design/` | Tool Design & MCP Integration | 18% |
| `sdk/domain-4-prompt-engineering/` | Prompt Engineering & Structured Output | 20% |
| `sdk/domain-5-context-reliability/` | Context Management & Reliability | 15% |

### `claude/` — Native Claude Code Examples
Configuration files, rules, commands, and skills for Claude Code workflows.

| Directory | Domain | Weight |
|-----------|--------|--------|
| `claude/domain-2-tool-design/` | MCP server config, built-in tool selection | 18% |
| `claude/domain-3-claude-code-config/` | Claude Code Configuration & Workflows | 20% |
| `claude/domain-5-context-reliability/` | Codebase context management | 15% |

### `exercises/` — Preparation Exercises
The 4 hands-on exercises from the exam guide, each with starter code and solutions.

### `shared/` — Reusable Components
Mock tools, JSON schemas, and system prompts shared across examples.

## 6 Exam Scenarios

| # | Scenario | Type | Key Domains |
|---|----------|------|-------------|
| 1 | Customer Support Resolution Agent | Agent SDK | D1, D2, D5 |
| 2 | Code Generation with Claude Code | Claude Code | D3, D5 |
| 3 | Multi-Agent Research System | Agent SDK | D1, D2, D5 |
| 4 | Developer Productivity with Claude | SDK + CC | D1, D2, D3 |
| 5 | Claude Code for CI | Claude Code CLI | D3, D4 |
| 6 | Structured Data Extraction | Claude API | D4, D5 |

See `documentation/SCENARIO_DOMAIN_MAP.md` for the full cross-reference matrix.

## Study Approach

**By domain weight (recommended for first pass):**
1. Domain 1 (27%) → `sdk/domain-1-agentic-architecture/`
2. Domain 3 (20%) → `claude/domain-3-claude-code-config/`
3. Domain 4 (20%) → `sdk/domain-4-prompt-engineering/`
4. Domain 2 (18%) → `sdk/domain-2-tool-design/` + `claude/domain-2-tool-design/`
5. Domain 5 (15%) → `sdk/domain-5-context-reliability/` + `claude/domain-5-context-reliability/`

**By scenario (recommended for second pass):**
Pick any scenario and follow all its task statement examples end-to-end.
