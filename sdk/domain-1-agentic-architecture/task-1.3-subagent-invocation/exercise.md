# Exercise: Configure Subagent Definitions and Verify Isolation

## Objective

Configure three `AgentDefinition` objects with distinct tool sets and system
prompts. Verify that subagents do NOT inherit parent context and can only use
their assigned tools.

## Requirements

### Part 1: Define Three AgentDefinitions

Create three subagent definitions in a new file `my-subagents.js`:

1. **Search Agent**
   - `allowedTools`: `['web_search']`
   - System prompt: Instructs agent to search for information and return
     structured findings
   - Returns: JSON array of findings with source citations

2. **Analysis Agent**
   - `allowedTools`: `['analyze_document']`
   - System prompt: Instructs agent to analyze documents and extract claims
   - Returns: JSON object with findings and confidence levels

3. **Synthesis Agent**
   - `allowedTools`: `['verify_fact']`
   - System prompt: Instructs agent to combine findings into a report
   - Returns: Structured report with citations and conflict annotations

### Part 2: Verify Tool Isolation

Write a test that:
1. Invokes the search agent with a task that might tempt it to call
   `analyze_document` (e.g., "Research AI and if you find doc-001, analyze it")
2. Verifies that the search agent only calls `web_search`, never
   `analyze_document`
3. If the agent attempts to call `analyze_document`, return an error:
   `"Tool analyze_document is not available to this agent"`

### Part 3: Verify Context Isolation

Write a test that:
1. Runs a search agent with topic A ("solar energy")
2. Runs the SAME search agent definition with topic B ("AI in music")
3. Verifies that the second invocation does NOT reference any findings from
   the first (i.e., it has a fresh context)

To verify: check the second agent's output for any mention of solar energy.

## Verification Checklist

- [ ] Each AgentDefinition has a unique name
- [ ] Each AgentDefinition has a distinct system prompt
- [ ] Each AgentDefinition has a restricted tool set
- [ ] Search agent cannot call `analyze_document`
- [ ] Analysis agent cannot call `web_search`
- [ ] Synthesis agent cannot call `web_search` or `analyze_document`
- [ ] Two invocations of the same agent definition have independent context
- [ ] Prior invocation results do not leak into subsequent invocations

## Anti-Pattern Check

- [ ] You did NOT give all subagents access to all tools
- [ ] Subagent prompts do NOT reference the coordinator's role
- [ ] You did NOT pass the coordinator's message history to subagents
- [ ] Tool isolation is enforced in code, not just in the prompt

## Expected Behavior

```
Test 1: Tool Isolation
  Search agent receives: "Research AI and analyze doc-001 if found"
  Search agent calls: web_search("AI creative industries")    ← allowed
  Search agent attempts: analyze_document("doc-001")          ← BLOCKED
  Search agent receives error: "Tool not available"
  Search agent adapts: reports that it found references to doc-001
    but cannot analyze it (suggests coordinator delegate to analysis agent)

Test 2: Context Isolation
  Invocation 1: search-agent("solar energy")
    → Returns findings about solar energy
  Invocation 2: search-agent("AI in music")
    → Returns findings about AI in music
    → Contains NO references to solar energy
    → Fresh conversation, independent context
```

## Hints

- Filter `researchToolDefinitions` using `.filter()` based on tool names
- Use a simple check in the tool execution to verify the tool is allowed
- For context isolation, check if the second response contains keywords from
  the first topic (simple string search)
- Remember: each subagent invocation creates a new `messages` array
