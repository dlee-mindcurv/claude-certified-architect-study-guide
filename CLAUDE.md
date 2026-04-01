# Claude Certified Architect — Foundations Exam Prep

## Project Structure
- `sdk/` — Node SDK examples (Agent SDK + @anthropic-ai/sdk)
- `claude/` — Native Claude Code configuration examples
- `shared/` — Reusable mock tools, schemas, and prompts
- `exercises/` — Hands-on preparation exercises with starter/solution files
- `documentation/` — Exam guide PDF and cross-reference maps

## Conventions
- ES modules (`import`/`export`) — package.json has `"type": "module"`
- All SDK examples require `ANTHROPIC_API_KEY` in `.env`
- Mock tools simulate real MCP backend responses including structured errors
- Each task directory follows: `README.md`, `example-*.js`, `exercise.md`, `scenario-*/`

## Running Examples
```bash
# Install dependencies
npm install

# Run any example
node sdk/domain-1-agentic-architecture/task-1.1-agentic-loops/example-raw-api.js

# Run exercises
npm run exercise:1
```

@import documentation/SCENARIO_DOMAIN_MAP.md
