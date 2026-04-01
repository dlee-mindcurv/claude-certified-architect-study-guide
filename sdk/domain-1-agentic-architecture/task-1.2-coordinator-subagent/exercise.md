# Exercise: Build a Coordinator with Dynamic Routing

## Objective

Build a coordinator that manages two subagents and routes queries to the
relevant subagent(s) based on query type -- NOT always invoking both.

## Setup

You will create two subagents:
1. **Fact Lookup Agent** -- uses `web_search` to find factual information
2. **Analysis Agent** -- uses `analyze_document` to extract findings from documents

And a coordinator that:
- Analyzes incoming queries
- Routes to ONE or BOTH subagents based on what the query needs
- Aggregates results

## Requirements

### Part 1: Subagent Loops

Create two subagent runner functions, each with:
- Its own system prompt
- Restricted tool access (fact lookup gets `web_search` only; analysis gets
  `analyze_document` only)
- Fresh message history (no inherited context)

### Part 2: Coordinator Logic

The coordinator must:
1. Classify the query into one of three categories:
   - `"factual"` -- needs web search only (e.g., "What's the latest on solar energy?")
   - `"analytical"` -- needs document analysis only (e.g., "Analyze doc-001")
   - `"comprehensive"` -- needs both (e.g., "Compare web sources with doc-001")
2. Route to the appropriate subagent(s)
3. If both are invoked, run them in parallel
4. Aggregate results into a single response

### Part 3: Verification

Test with these three queries:

```
Query 1 (factual): "What are the latest developments in renewable energy?"
  Expected: Only fact lookup agent invoked

Query 2 (analytical): "Analyze document doc-001 and summarize key findings"
  Expected: Only analysis agent invoked

Query 3 (comprehensive): "Research AI in creative industries and compare
  with the findings in doc-001"
  Expected: Both agents invoked in parallel
```

## Verification Checklist

- [ ] Factual queries invoke ONLY the fact lookup agent
- [ ] Analytical queries invoke ONLY the analysis agent
- [ ] Comprehensive queries invoke BOTH agents in parallel
- [ ] Each subagent has its own system prompt
- [ ] Each subagent has restricted tool access
- [ ] Subagents do NOT inherit the coordinator's conversation history
- [ ] Results from both subagents are aggregated into a single response

## Anti-Pattern Check

- [ ] You did NOT always invoke both subagents regardless of query type
- [ ] Subagents do NOT share a message history
- [ ] The coordinator passes context explicitly (not by reference)
- [ ] Subagent A does NOT directly call Subagent B

## Hints

- Use `Promise.all()` for parallel subagent execution
- The coordinator's classification can be done with a simple Claude call
  (no tools needed for the classification step itself)
- Keep subagent prompts focused -- a subagent should know its role and nothing
  else about the system's architecture
