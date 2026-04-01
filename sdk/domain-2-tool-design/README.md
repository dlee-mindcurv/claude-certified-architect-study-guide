# Domain 2: Tool Design & MCP Integration (18% of exam)

Domain 2 covers how to design, describe, distribute, and integrate tools so that
Claude selects the right tool reliably, recovers from errors gracefully, and
operates within the Model Context Protocol (MCP) ecosystem.

This domain is split between SDK examples (`sdk/domain-2-tool-design/`) and
Claude Code native examples (`claude/domain-2-tool-design/`).

## Task Statements

| Task | Title | Key Concept | Location |
|------|-------|-------------|----------|
| 2.1 | Write effective tool descriptions | Descriptions as LLM selection mechanism | `sdk/` |
| 2.2 | Design structured error responses | MCP isError, error categories, isRetryable | `sdk/` |
| 2.3 | Distribute tools across agents | Scoped access, tool_choice, cross-role tools | `sdk/` |
| 2.4 | Configure MCP integration | MCP client setup, tool discovery, resources | `sdk/` + `claude/` |
| 2.5 | Select built-in tools effectively | Claude Code tool selection for codebase tasks | `claude/` + `sdk/` |

## Scenarios Covered

- **Scenario 1 (CSR Agent):** Tasks 2.1, 2.2 -- Tool descriptions that
  differentiate `get_customer` vs `lookup_order`, structured error handling
  across all 4 CSR tools.
- **Scenario 3 (Research Coordinator):** Tasks 2.2, 2.3 -- Error propagation
  from subagents to coordinator, scoped tool distribution across search/analysis/
  synthesis subagents.
- **Scenario 4 (Dev Productivity):** Tasks 2.4, 2.5 -- MCP client integration
  with code analysis servers, built-in tool selection for codebase operations.

## Key Exam Themes

1. **Tool descriptions are the primary selection mechanism.** Claude reads the
   `description` field of each tool definition to decide which tool to call.
   Minimal or ambiguous descriptions cause misrouting, especially when tools
   have similar input schemas.

2. **Structured errors enable smart recovery.** Returning `isError: true` with
   an `errorCategory` (transient/validation/business/permission) and
   `isRetryable` boolean lets the agent decide whether to retry, fix input,
   explain to the user, or escalate -- instead of generic failure.

3. **Fewer tools per agent = better selection.** Giving an agent 18 tools
   degrades reliability. Scope each agent to 4-5 relevant tools. Use cross-role
   tools (like `verify_fact` for the synthesis agent) for high-frequency needs
   that would otherwise require round-trips to the coordinator.

4. **MCP is the standard protocol for tool integration.** The Model Context
   Protocol defines how agents discover and invoke tools from external servers.
   SDK code configures MCP client connections; Claude Code uses
   `.claude/settings.json` for MCP server configuration.

5. **Built-in tools have specific strengths.** Claude Code's built-in tools
   (Read, Write, Edit, Glob, Grep, Bash) each have optimal use cases.
   Choosing the wrong tool (e.g., Bash+grep instead of Grep) wastes tokens
   and reduces reliability.

## Skills & Knowledge Tested

- **S1:** Understands how tool descriptions, input schemas, and system prompt
  wording collectively determine tool selection behavior.
- **S2:** Can design MCP-compliant tool definitions with proper schemas.
- **S3:** Can distribute tools across multi-agent architectures and configure
  error handling that enables recovery.
- **S4:** Can configure MCP client/server integrations in both SDK and Claude
  Code contexts.

## Directory Structure

```
sdk/domain-2-tool-design/
  task-2.1-tool-descriptions/     # S1: Description quality → selection reliability
    README.md
    example.js                    # Before/after comparison
    exercise.md
    scenario-1-csr/
      tool-definitions.js         # Well-crafted CSR tool descriptions
  task-2.2-structured-errors/     # S1, S3: Error categories → smart recovery
    README.md
    example.js                    # Structured error handling agent loop
    exercise.md
    scenario-1-csr/
      error-responses.js          # CSR error handling
    scenario-3-research/
      error-propagation.js        # Subagent → coordinator error propagation
  task-2.3-tool-distribution/     # S3: Scoped tools → reliable selection
    README.md
    example.js                    # 3 subagents with scoped tools
    exercise.md
    scenario-3-research/
      scoped-tools.js             # Research system tool distribution
  task-2.4-mcp-integration/       # S4: MCP client setup and tool discovery
    README.md
    example.js                    # MCP client reference implementation
    exercise.md
    scenario-4-devtools/
      mcp-client.js               # Dev productivity MCP client
  task-2.5-builtin-tools/         # S4: Claude Code built-in tool selection
    README.md                     # Cross-link to claude/ examples
    exercise.md
    scenario-2-codegen/
      tool-selection-guide.md
    scenario-4-devtools/
      tool-selection-guide.md
```
