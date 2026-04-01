# Claude Certified Architect — Foundations Exam Prep

## Project Structure
- `sdk/` — Node SDK examples using `@anthropic-ai/claude-agent-sdk` (query, tool, createSdkMcpServer) and `@anthropic-ai/sdk` (raw API)
- `claude/` — Native Claude Code configuration examples (CLAUDE.md, commands, skills, rules)
- `shared/` — Reusable mock MCP tools, schemas, and prompts
- `exercises/` — Hands-on preparation exercises with starter/solution files
- `documentation/` — Exam guide PDF and cross-reference maps

## Conventions
- ES modules (`import`/`export`) — package.json has `"type": "module"`
- Agent SDK examples use `query()` from `@anthropic-ai/claude-agent-sdk`
- Raw API examples use `Anthropic` from `@anthropic-ai/sdk` (for tool_use, batch API concepts)
- Mock tools use `tool()` + `createSdkMcpServer()` from the Agent SDK
- Tool names follow MCP convention: `mcp__<server>__<tool>` (e.g., `mcp__csr__get_customer`)
- Each task directory follows: `README.md`, `example-*.js`, `exercise.md`, `scenario-*/`

## Running Examples
```bash
npm install

# Agent SDK examples
node sdk/domain-1-agentic-architecture/task-1.1-agentic-loops/example-agent-sdk.js

# Raw API examples
node sdk/domain-1-agentic-architecture/task-1.1-agentic-loops/example-raw-api.js

# Exercises
npm run exercise:1
```

@import documentation/SCENARIO_DOMAIN_MAP.md
