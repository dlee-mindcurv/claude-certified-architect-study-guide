# Task 1.3: Configure Subagent Invocation

## Exam Relevance
Tested primarily in Scenario 3 (Research Coordinator).

## Key Concepts

### The Task Tool

In the Agent SDK, subagents are invoked via the **Task tool**. When a
coordinator makes a Task tool call, the SDK:

1. Creates a **new conversation** (fresh message history)
2. Uses the **subagent's** system prompt, not the coordinator's
3. Provides **only** the tools listed in the subagent's `allowedTools`
4. Runs a complete agentic loop for the subagent
5. Returns the subagent's final text response to the coordinator

The Task tool is conceptually similar to a function call, but the "function"
is an entire Claude conversation with its own tools and context.

### AgentDefinition

Each subagent is configured via an `AgentDefinition`:

```js
const searchAgent = {
  name: 'search-agent',
  model: 'claude-sonnet-4-20250514',
  instructions: searchSubagentPrompt,    // Subagent-specific system prompt
  tools: [web_search],                   // RESTRICTED tool set
};
```

Key properties:
- **name**: Identifier for logging and debugging
- **model**: Can differ from the coordinator (e.g., use Haiku for simple tasks)
- **instructions**: System prompt specific to this subagent's role
- **tools**: Only the tools this subagent needs (principle of least privilege)

### allowedTools

`allowedTools` restricts which tools a subagent can call. This enforces
**scope partitioning**:

```
Coordinator:        [Task tool only — no direct MCP tools]
Search subagent:    [web_search]
Analysis subagent:  [analyze_document]
Synthesis subagent: [verify_fact]  ← "scoped cross-role tool"
```

Why this matters:
- Prevents a search subagent from accidentally modifying documents
- Reduces prompt confusion (subagent only sees relevant tools)
- Enforces separation of concerns at the architecture level

### Explicit Context Passing

Subagents do NOT inherit the coordinator's conversation history. Context
must be passed explicitly through the Task tool's input:

```
WRONG (implicit context):
  "Continue the research from where we left off"
  → Subagent has no idea what prior research was done

CORRECT (explicit context):
  "Research solar energy. Here are the findings from prior agents:
   - Solar cells reached 33.7% efficiency (Source: Energy Journal, 2025-01-10)
   - Global investment reached $180B (Source: Clean Energy Report, 2025-02-05)

   Focus on: cost trends and government policy. Avoid duplicating the above."
```

### fork_session

In some implementations, `fork_session` creates a copy of the current
conversation state as a starting point for a subagent. This is useful when:
- The subagent needs some coordinator context (but not all)
- You want to avoid re-explaining the full background

However, the exam emphasizes that **explicit context is preferred** over
forking, because:
1. Forked sessions carry unnecessary context (wastes tokens)
2. It's harder to control exactly what the subagent sees
3. Explicit passing is more testable and debuggable

### Parallel Spawning

When subtopics are independent, the coordinator can spawn multiple subagents
in parallel by making multiple Task tool calls in a single response:

```
Coordinator response:
  [Task tool call: search-agent("research solar energy")]
  [Task tool call: search-agent("research wind energy")]
  [Task tool call: search-agent("research battery storage")]
```

The SDK (or your orchestration code) runs these in parallel. The coordinator
receives all results at once and can proceed to synthesis.

Parallel spawning is appropriate when:
- Subtopics are independent (no sequential dependency)
- Each subagent has all the context it needs upfront

Parallel spawning is NOT appropriate when:
- A downstream agent needs an upstream agent's output
- The coordinator needs to make routing decisions based on intermediate results

## Files in This Directory

| File | Description |
|------|-------------|
| `example-agent-sdk.js` | AgentDefinition config for 3 subagent types |
| `exercise.md` | Configure 3 AgentDefinitions, verify isolation |
| `scenario-3-research/subagent-config.js` | Research subagent configurations |
