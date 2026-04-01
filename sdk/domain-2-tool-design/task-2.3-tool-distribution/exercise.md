# Exercise: Configure Scoped Tool Distribution

## Objective

Configure a 3-agent research system where each subagent has only its relevant
tools. Then demonstrate that adding `verify_fact` as a cross-role tool to the
synthesis agent reduces coordinator round-trips.

## Setup

You have a research system with 9 tools total:

```js
const allResearchTools = [
  // Search domain (assign to search agent)
  { name: 'web_search', description: 'Search the web for a topic' },
  { name: 'search_news', description: 'Search recent news articles' },
  { name: 'search_academic', description: 'Search academic papers' },

  // Analysis domain (assign to analysis agent)
  { name: 'analyze_document', description: 'Analyze a document in depth' },
  { name: 'extract_entities', description: 'Extract named entities from text' },
  { name: 'compare_claims', description: 'Compare two conflicting claims' },

  // Synthesis domain (assign to synthesis agent)
  { name: 'format_report', description: 'Format findings as a report' },
  { name: 'generate_citation', description: 'Generate a citation for a source' },
  { name: 'verify_fact', description: 'Quick fact verification' },
];
```

## Part 1: Assign Tools to Agents

Create three agent configurations, each with only its relevant tools:

```js
const searchAgentConfig = {
  name: 'search-agent',
  tools: ???,         // 3 tools from the search domain
  tool_choice: ???,   // What should the first-turn tool_choice be?
  systemPrompt: ???,  // Write a focused prompt for this role
};

const analysisAgentConfig = {
  name: 'analysis-agent',
  tools: ???,         // 3 tools from the analysis domain
  tool_choice: ???,
  systemPrompt: ???,
};

const synthesisAgentConfig = {
  name: 'synthesis-agent',
  tools: ???,         // 2 synthesis tools + 1 cross-role tool
  tool_choice: ???,
  systemPrompt: ???,
};
```

Answer these questions:
1. Which tool_choice type should the search agent use on its first turn?
2. Should the analysis agent use forced or auto tool_choice? Why?
3. Why does verify_fact go to the synthesis agent and not the search agent?

## Part 2: Cross-Role Tool Impact

Compare two approaches for fact-checking during synthesis:

### Approach A: No cross-role tool (round-trip through coordinator)
```
Synthesis → "I need to verify claim X"
  → Coordinator receives request
    → Coordinator delegates to search agent
      → Search agent calls web_search
      → Search agent returns result
    → Coordinator passes result to synthesis
Synthesis → continues writing report
```
**Count the turns:** How many API calls does this require?

### Approach B: verify_fact cross-role tool
```
Synthesis → calls verify_fact("claim X")
  → Gets result immediately
Synthesis → continues writing report
```
**Count the turns:** How many API calls does this require?

Calculate the token savings if the synthesis agent does 5 fact-checks during
report generation.

## Part 3: Implementation

Create a file `scoped-agents.js` in this directory that:

1. Defines 3 agent configurations with scoped tools
2. Runs the search agent with forced `web_search` on the first turn
3. Passes search results to the analysis agent
4. Passes combined findings to the synthesis agent with `verify_fact`
5. Logs the tool calls made by each agent

Test query: "Research the impact of AI on creative industries"

## Verification Checklist

### Tool Distribution
- [ ] Search agent has exactly 3 search-domain tools
- [ ] Analysis agent has exactly 3 analysis-domain tools
- [ ] Synthesis agent has 2 synthesis tools + verify_fact
- [ ] No tool appears in more than one agent (except verify_fact)

### tool_choice
- [ ] Search agent uses forced `web_search` on first turn
- [ ] Analysis agent uses forced `analyze_document` on first turn (if it always
      starts with a specific document) or `auto` if the task varies
- [ ] Synthesis agent uses `auto` (it may or may not need verify_fact)

### Cross-Role Tool
- [ ] verify_fact in synthesis agent eliminates coordinator round-trips
- [ ] Complex verification still routes through coordinator
- [ ] verify_fact description explicitly states it is for lightweight checks

### Selection Accuracy
- [ ] Search agent never calls analyze_document (it does not have it)
- [ ] Analysis agent never calls web_search (it does not have it)
- [ ] Synthesis agent never calls web_search or analyze_document

## Expected Flow

```
Search Agent (forced web_search):
  Turn 1: web_search({ query: "AI creative industries 2025" })
  Turn 2: web_search({ query: "AI impact music production" })
  → Returns: list of findings with sources

Analysis Agent (forced analyze_document):
  Turn 1: analyze_document({ document_id: "doc-001" })
  Turn 2: extract_entities({ text: "..." })
  → Returns: structured findings with claims and evidence

Synthesis Agent (auto, with verify_fact):
  Turn 1: verify_fact({ claim: "AI art tools market grew 47%..." })
  Turn 2: verify_fact({ claim: "60% of writers used AI tools..." })
  Turn 3: (end_turn) → produces the final report
  → Returns: formatted report with verified claims
```

## Bonus: Measure Selection Accuracy

Run the same research query 5 times with:
1. Scoped tools (as designed above)
2. All 9 tools given to every agent

Track which tools each agent calls on each run. Calculate:
- **Correct selection rate** = calls to intended tools / total calls
- **Misrouting rate** = calls to unintended tools / total calls

Expected: scoped tools achieve 100% correct selection; all-tools shows
measurable misrouting.
