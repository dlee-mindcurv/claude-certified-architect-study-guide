# Domain 1: Agentic Architecture (27% of exam)

Domain 1 is the largest section of the Claude Certified Architect -- Foundations
exam and covers the core patterns for building reliable, production-grade agentic
systems with Claude.

## Task Statements

| Task | Title | Key Concept |
|------|-------|-------------|
| 1.1 | Design and implement agentic loops | stop_reason-driven control flow |
| 1.2 | Design coordinator-subagent topologies | Hub-and-spoke orchestration |
| 1.3 | Configure subagent invocation | Task tool, allowedTools, AgentDefinition |
| 1.4 | Implement enforcement and handoff | Prerequisite gates, structured escalation |
| 1.5 | Implement hooks and middleware | PostToolUse, logging, guardrails |
| 1.6 | Decompose complex tasks | Dynamic routing vs. fixed pipelines |
| 1.7 | Manage session and state | Conversation history, context windows |

## Scenarios Covered

- **Scenario 1 (CSR Agent):** Tasks 1.1, 1.4 -- Single-agent loop with workflow
  gates and escalation handoff.
- **Scenario 3 (Research Coordinator):** Tasks 1.1, 1.2, 1.3 -- Multi-agent
  system with coordinator, parallel subagents, and synthesis.
- **Scenario 4 (Dev Productivity):** Tasks 1.2, 1.6 -- Coordinator with
  codebase exploration and task decomposition.

## Key Exam Themes

1. **stop_reason is the ONLY reliable loop signal.** Never parse natural language
   or check text content to decide whether to continue looping.

2. **Coordinators manage ALL inter-subagent communication.** Subagents never talk
   to each other directly. The coordinator is the single routing hub.

3. **Context is explicit, not inherited.** Subagents receive context only through
   their prompts -- they do not inherit the coordinator's conversation history.

4. **Enforcement is programmatic.** Workflow constraints (e.g., "verify customer
   before processing refund") must be enforced in code, not merely stated in
   prompts.

5. **Dynamic routing over fixed pipelines.** Not every query needs every
   subagent -- route based on the actual request.

## Directory Structure

Each task directory contains:
- `README.md` -- Concept explanation and exam relevance
- `example-raw-api.js` -- Implementation using `@anthropic-ai/sdk` directly
- `example-agent-sdk.js` -- Reference implementation using Agent SDK patterns
- `exercise.md` -- Hands-on exercise to test understanding
- `scenario-*/` -- Scenario-specific implementations
