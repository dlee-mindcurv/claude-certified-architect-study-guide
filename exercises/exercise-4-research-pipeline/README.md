# Exercise 4: Design and Debug a Multi-Agent Research Pipeline

**Domains reinforced:** D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)

## Objective

Practice orchestrating subagents in a hub-and-spoke pattern with explicit context
passing, parallel execution, structured output with provenance tracking, error
propagation, and handling conflicting source data.

## Prerequisites

- `npm install` from the project root
- `ANTHROPIC_API_KEY` in `.env`

## Steps

### Step 1: Build the coordinator with subagent delegation

The coordinator receives a research topic and:
1. Decomposes it into subtopics
2. Delegates subtopics to specialized subagents
3. Passes explicit context (subagents do NOT inherit conversation history)
4. Collects results and delegates to a synthesis subagent

Key pattern: Subagents receive ALL context through their prompt, not through
shared conversation state. This means the coordinator must serialize findings
from upstream agents into the downstream agent's prompt.

### Step 2: Implement parallel subagent execution

Independent search subagents can run in parallel:
- Use `Promise.all()` for concurrent subagent execution
- Each subagent operates independently with its own tools
- Results are collected and merged by the coordinator

### Step 3: Design structured output with provenance

Every claim in the output must trace back to a source:
```
{
  claim: "AI art tools market grew 47% year-over-year",
  evidence: "Based on market analysis of 50 major AI art platforms",
  source: { url: "...", name: "Research Institute", date: "2025-02-15" },
  confidence: "high"
}
```

This separation of content from metadata enables:
- Source verification
- Conflict detection (same claim, different numbers from different sources)
- Temporal context (when data was collected)

### Step 4: Implement error propagation

When a subagent fails, propagate structured error context:
```
{
  failureType: "search_timeout",
  attemptedQuery: "AI music production market size",
  partialResults: [...],
  alternatives: ["Try narrower query", "Search different source type"]
}
```

The coordinator should:
- Retry transient errors
- Try alternative queries for empty results
- Proceed with partial results rather than failing entirely
- Annotate the final report with coverage gaps

### Step 5: Test with conflicting source data

The mock data includes conflicting statistics:
- doc-001 says AI art tools grew **47%** (from Research Institute)
- doc-002 says AI art tools grew **52%** (from Economic Research Group)

The pipeline should:
- Detect the conflict
- Present both values with source attribution
- Note methodological differences (different sample sizes)
- NOT arbitrarily choose one value

## Running

```bash
# Run the starter (has TODOs to complete)
npm run exercise:4

# Run the solution
node exercises/exercise-4-research-pipeline/solution.js
```

## Key Exam Concepts Practiced

- **Task 1.2**: Coordinator-subagent hub-and-spoke pattern
- **Task 1.3**: Explicit context passing between agents
- **Task 2.3**: Tool scoping (different tools per subagent role)
- **Task 5.6**: Information provenance and uncertainty handling
- **Task 1.4**: Error propagation with structured context
