# Task 1.2: Design Coordinator-Subagent Topologies

## Exam Relevance
Tested in Scenarios 3 (Research Coordinator) and 4 (Dev Productivity).

## The Hub-and-Spoke Pattern

In a multi-agent system, the **coordinator** is the central hub that manages all
inter-subagent communication. Subagents are spokes -- they execute specialized
tasks but never communicate with each other directly.

```
                    ┌─────────────┐
                    │ Coordinator │
                    │   (Hub)     │
                    └──┬──┬──┬───┘
                       │  │  │
            ┌──────────┘  │  └──────────┐
            ▼             ▼             ▼
     ┌────────────┐ ┌──────────┐ ┌────────────┐
     │  Search    │ │ Analysis │ │ Synthesis  │
     │  Subagent  │ │ Subagent │ │ Subagent   │
     └────────────┘ └──────────┘ └────────────┘
       (Spoke)       (Spoke)       (Spoke)
```

### Key Properties

1. **All communication flows through the coordinator.** Subagent A never talks
   to Subagent B. If B needs A's output, the coordinator passes it explicitly.

2. **Subagents have isolated context.** They do NOT inherit the coordinator's
   conversation history. They receive context only through their invocation
   prompt.

3. **The coordinator manages error handling.** If a subagent fails, the
   coordinator decides whether to retry, try an alternative, or proceed with
   partial results.

4. **The coordinator manages routing.** Not every query needs every subagent.
   The coordinator dynamically decides which subagents to invoke.

## Core Concepts

### Dynamic Routing (Not Always Full Pipeline)

A common exam distractor is "always run all subagents." In reality:

```
Query: "What's the latest on solar energy?"
  → Route to: Search subagent only (no document analysis needed)

Query: "Analyze document doc-001 and compare with web sources"
  → Route to: Search subagent AND Document analysis subagent

Query: "Produce a comprehensive report on AI in creative industries"
  → Route to: ALL subagents (search → analysis → synthesis)
```

The coordinator analyzes the query and routes accordingly. Fixed pipelines that
always invoke every subagent waste tokens and add latency.

### Scope Partitioning

When decomposing a topic, the coordinator must ensure:

1. **Complete coverage** -- All relevant subtopics are assigned to at least one
   subagent. Missing entire domains is a critical failure.
2. **Minimal overlap** -- Distinct subtopics go to different subagents to avoid
   duplicate work.
3. **Explicit boundaries** -- Each subagent knows exactly what it is and is NOT
   responsible for.

Example decomposition for "AI in creative industries":
```
Subagent 1: Visual arts and design (image generation, graphic design tools)
Subagent 2: Music and audio (composition, production, mastering)
Subagent 3: Film and video (VFX, scriptwriting, editing)
Subagent 4: Writing and publishing (content generation, editing assistance)
```

NOT: "Subagent 1: AI art, Subagent 2: everything else" (unbalanced partitioning)

### Iterative Refinement Loops

After initial subagent execution, the coordinator evaluates results for:

1. **Coverage gaps** -- Are all subtopics addressed?
2. **Source quality** -- Are claims properly cited?
3. **Conflicting data** -- Are conflicts annotated (not arbitrarily resolved)?
4. **Temporal context** -- Are publication dates noted alongside statistics?

If gaps are found, the coordinator re-delegates to targeted subagents:

```
Round 1: Search subagents return findings
Round 2: Synthesis subagent produces initial report
Round 3: Coordinator identifies gap in "AI in gaming"
Round 4: Search subagent runs targeted query for gaming
Round 5: Synthesis subagent integrates new findings
```

### Error Handling at the Coordinator Level

When a subagent fails:

| Error Type | Coordinator Action |
|---|---|
| Transient (timeout) | Retry same subagent with same query |
| Empty results | Retry with alternative query phrasing |
| Validation error | Fix input and retry |
| Persistent failure | Proceed with partial results, annotate gap |

The coordinator NEVER fails entirely because one subagent failed. It always
proceeds with whatever partial results are available and documents what is
missing.

## Files in This Directory

| File | Description |
|------|-------------|
| `example-agent-sdk.js` | Coordinator using Agent SDK patterns (Task tool) |
| `example-raw-api.js` | Coordinator using nested agentic loops (raw API) |
| `exercise.md` | Build a coordinator with 2 subagents |
| `scenario-3-research/coordinator.js` | Full research coordinator |
| `scenario-4-devtools/coordinator.js` | Dev productivity coordinator |
