# Task 2.3: Distribute Tools Across Agents

## Exam Relevance
Tested in Scenario 3 (Multi-Agent Research System). Maps to Skill S3.

## Too Many Tools Degrade Reliability

When a single agent has access to 18+ tools, selection accuracy drops
significantly. Claude must read and differentiate every tool description on
every turn, and with many tools the probability of misrouting increases --
especially when several tools have overlapping domains.

**Empirical guideline:** Keep each agent scoped to 4-5 tools for reliable
selection. If a workflow needs more tools, distribute them across multiple
agents in a coordinator-subagent architecture.

## Scoped Tool Access Per Role

In a multi-agent system, each subagent should receive only the tools relevant
to its specific role:

```
┌───────────────────────────────────────────────────┐
│ Coordinator                                       │
│ Tools: [delegate_to_search, delegate_to_analysis, │
│         delegate_to_synthesis]                     │
├───────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────┐ │
│  │ Search Agent  │ │ Analysis     │ │ Synthesis │ │
│  │ web_search    │ │ analyze_doc  │ │ verify_   │ │
│  │ search_news   │ │ extract_     │ │   fact    │ │
│  │ search_       │ │   entities   │ │ format_   │ │
│  │   academic    │ │ summarize_   │ │   report  │ │
│  │ filter_       │ │   section    │ │ generate_ │ │
│  │   results     │ │ compare_     │ │   citation│ │
│  │               │ │   claims     │ │           │ │
│  └──────────────┘ └──────────────┘ └───────────┘ │
│       5 tools          5 tools        4 tools     │
│                                                   │
│  Total: 14 tools, but each agent sees only 4-5    │
└───────────────────────────────────────────────────┘
```

### Benefits of Scoped Access

1. **Higher selection accuracy** -- With only 4-5 tools, Claude rarely
   misroutes. The descriptions are more distinct within a smaller set.

2. **Faster inference** -- Fewer tool definitions in the request means fewer
   tokens processed per turn.

3. **Clearer responsibility** -- Each agent has a well-defined role. Tool
   overlap between agents is eliminated by design.

4. **Easier debugging** -- When a tool call fails, you know which agent
   made it and what its responsibility scope is.

## Cross-Role Tools for High-Frequency Needs

Sometimes a downstream agent needs a lightweight tool that technically belongs
to another agent's domain. Rather than routing back through the coordinator
(which adds latency and token cost), give the downstream agent a scoped
version of the tool.

**Example:** The synthesis agent needs to do quick fact-checks while writing
the report. Without `verify_fact`, every fact-check would require:

```
Synthesis agent → Coordinator → Search agent → Coordinator → Synthesis agent
```

With a scoped `verify_fact` tool:

```
Synthesis agent → verify_fact → Synthesis agent
```

This eliminates 2 round-trips per fact-check. The key constraint is that
`verify_fact` is a LIGHTWEIGHT tool for simple lookups. Complex verification
still routes through the coordinator to the search agent.

## tool_choice Configuration

The `tool_choice` parameter in the API controls how Claude selects tools:

### tool_choice: "auto" (default)
Claude decides whether and which tool to use based on the query.
```js
{ tool_choice: { type: 'auto' } }
```
**Use when:** The agent should decide dynamically. Most turns in an agentic loop.

### tool_choice: "any"
Claude must use exactly one tool (but can choose which one).
```js
{ tool_choice: { type: 'any' } }
```
**Use when:** You know a tool call is needed but Claude should pick. Useful
for first-step routing where the agent must take an action.

### tool_choice: forced (specific tool)
Claude must use the specified tool.
```js
{ tool_choice: { type: 'tool', name: 'web_search' } }
```
**Use when:** The first step of a subagent is always the same tool. For
example, a search subagent should always call `web_search` first -- forced
selection prevents it from trying to answer from knowledge.

### When to Use Each

| Scenario | tool_choice | Rationale |
|----------|-------------|-----------|
| General agentic loop | `auto` | Agent decides dynamically |
| Search subagent first turn | forced `web_search` | Must search, not answer from memory |
| Extraction pipeline first step | forced `extract_data` | Always extract first |
| Coordinator routing | `auto` | Decides which subagent based on query |
| Subagent subsequent turns | `auto` | May need more tool calls or may be done |

## Comparison: All Tools vs. Scoped Tools

### All Tools (Anti-Pattern)
```js
// Giving ALL 14 tools to every agent
const allTools = [
  web_search, search_news, search_academic, filter_results,
  analyze_doc, extract_entities, summarize_section, compare_claims,
  verify_fact, format_report, generate_citation, ...
];

// Every agent sees every tool → frequent misrouting
const searchAgent = { tools: allTools };     // May call analyze_doc
const analysisAgent = { tools: allTools };   // May call web_search
const synthesisAgent = { tools: allTools };  // May call anything
```

### Scoped Tools (Correct Pattern)
```js
// Each agent gets only its relevant tools
const searchAgent = {
  tools: [web_search, search_news, search_academic, filter_results],
};

const analysisAgent = {
  tools: [analyze_doc, extract_entities, summarize_section, compare_claims],
};

const synthesisAgent = {
  tools: [verify_fact, format_report, generate_citation],
  // verify_fact is a cross-role tool — lightweight fact-checks
  // without round-tripping to the coordinator
};
```

## Anti-Patterns

**1. Single agent with all tools**
```js
// 18 tools = degraded selection accuracy
const agent = { tools: allEighteenTools };
```
Claude must differentiate all 18 descriptions on every turn.

**2. Duplicating tools across agents**
```js
// web_search available to every subagent
const searchAgent = { tools: [web_search, ...] };
const analysisAgent = { tools: [web_search, analyze_doc, ...] };
```
Defeats the purpose of scoping. If the analysis agent has `web_search`, it
may search instead of analyzing.

**3. Never using forced tool_choice**
```js
// Search subagent might try to answer without searching
const response = await client.messages.create({
  tools: [web_search],
  tool_choice: { type: 'auto' },  // Should be forced
  ...
});
```
The search subagent should ALWAYS search first, not attempt to answer from
its training data.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | 3 subagents with scoped tools + forced tool_choice |
| `exercise.md` | Configure scoped agents and measure improvement |
| `scenario-3-research/scoped-tools.js` | Research system tool distribution |
