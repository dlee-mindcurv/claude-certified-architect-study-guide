# Exercise: Build Provenance-Preserving Synthesis

## Objective

Build a synthesis module that preserves claim-source mappings from multiple
subagents. Feed it conflicting statistics from different sources and verify
that both values are preserved with full attribution, not resolved or averaged.

## Setup

Use the shared research tools and prompts:
```js
import { researchToolDefinitions, executeResearchTool } from '../../../shared/tools/research-tools.js';
import { researchCoordinatorPrompt, synthesisSubagentPrompt } from '../../../shared/prompts/research-coordinator.js';
```

## Part 1: Define the Claim-Source Mapping Structure

Create a module with:

### Claim factory
```js
function createClaim({
  claim,           // The specific factual assertion
  evidence,        // Supporting detail or methodology
  sourceUrl,       // URL of the source
  sourceName,      // Human-readable source name
  publicationDate, // YYYY-MM-DD
  confidence,      // high | medium | low
  page,            // Page number if applicable
}) { ... }
```

### Findings container
```js
function createFindings({
  topic,           // The research subtopic
  findings,        // Array of claims
  gaps,            // Topics with no coverage
  subagentId,      // Which subagent produced these
}) { ... }
```

## Part 2: Build the Conflict Detector

Create a `detectConflicts(allFindings)` function that:

1. Collects all claims across all subagent findings
2. Compares each pair of claims from different sources
3. Identifies conflicts: same topic, same metric, different values
4. Returns an array of conflict objects:

```js
{
  metric: "AI art tools market growth",
  claims: [
    { value: "47%", source: "Research Institute", date: "2025-02-15", claim: "..." },
    { value: "52%", source: "Economic Research Group", date: "2025-01-30", claim: "..." },
  ],
  possibleExplanation: "Different sample sizes (50 vs 75 platforms)",
}
```

### Test with Known Conflicts

The mock research data in `shared/tools/research-tools.js` includes an
intentional conflict:
- doc-001: "AI art tools market grew **47%**" (50 platforms)
- doc-002: "AI art tools market grew **52%**" (75 platforms)

Your conflict detector should find this automatically.

## Part 3: Build the Synthesis Module

Create a `synthesize(allFindings)` function that produces a report with:

### Findings section
All claims with preserved source attribution:
```markdown
- AI art tools market grew 47% year-over-year in 2024
  Source: Research Institute (Feb 2025, p.12) [high confidence]
```

### Conflicting Data section
Each conflict presented with both values:
```markdown
### AI art tools market growth rate
- **47%**: Research Institute (Feb 2025, analysis of 50 platforms)
- **52%**: Economic Research Group (Jan 2025, analysis of 75 platforms)
Note: Difference may reflect sample size (50 vs 75 platforms)
Resolution: NONE — both values preserved
```

### Temporal Context
Statistics include their publication dates:
```markdown
- Solar cell efficiency reached 33.7% in lab tests
  Source: Energy Journal (Jan 2025)
```

### Coverage section
Each topic annotated with coverage level:
```
+ AI in visual arts: well-supported (3 sources, 4 claims)
~ AI in gaming: single-source (1 source, 1 claim)
! AI in publishing: gap (no sources found)
```

### Sources section
Full attribution for all sources:
```
- Research Institute: https://example.com/docs/doc-001 (Feb 2025)
- Economic Research Group: https://example.com/docs/doc-002 (Jan 2025)
```

## Part 4: Test with Conflicting Statistics

Create a test scenario with at least 3 pairs of conflicting statistics:

### Conflict 1: Market growth rate
- Source A: "AI art market grew 47%" (50-platform sample)
- Source B: "AI art market grew 52%" (75-platform sample)
- Type: Methodology difference

### Conflict 2: Temporal progression
- Source A: "Solar cell efficiency 29.1%" (June 2024)
- Source B: "Solar cell efficiency 33.7%" (January 2025)
- Type: Temporal difference (not actually a conflict)

### Conflict 3: Cost savings
- Source A: "AI tools saved studios $2.3M per production" (12 productions)
- Source B: "AI tools saved studios $1.8M per production" (30 productions)
- Type: Sample size difference

### Verification

For each conflict, verify:
- [ ] Both values appear in the report
- [ ] Both sources are attributed
- [ ] Publication dates are included
- [ ] The possible explanation is noted
- [ ] Neither value was arbitrarily chosen over the other
- [ ] No averaged or fabricated compromise value was created

## Part 5: Demonstrate the Anti-Pattern

Create a second synthesis function `synthesizeBadly(allFindings)` that
demonstrates common provenance failures:

1. **Averaging**: "AI art market grew approximately 50%"
2. **Dropping attribution**: "The market experienced significant growth"
3. **Picking one source**: "AI art market grew 52% (Economic Research Group)"
   without mentioning the 47% from Research Institute
4. **Removing dates**: "Solar cell efficiency reached 33.7% in lab tests"
   without the publication date

Show the output of both synthesis functions side-by-side and explain why
each anti-pattern is problematic for the reader.

## Evaluation Criteria

Your solution should demonstrate:

- [ ] Structured claim-source mappings throughout the pipeline
- [ ] Automatic conflict detection across subagent findings
- [ ] Both conflicting values preserved (never averaged or arbitrarily selected)
- [ ] Publication dates on all statistics
- [ ] Coverage annotations (well-supported, single-source, gap)
- [ ] Full source attribution in a Sources section
- [ ] (Bonus) Methodology context preserved alongside claims
- [ ] (Bonus) Temporal context noted when date differences explain value differences

## Deliverables

1. `claim-source.js` -- Claim factory and findings container
2. `conflict-detector.js` -- Automatic conflict detection
3. `synthesizer.js` -- Provenance-preserving synthesis
4. `report-renderer.js` -- Formatted report output
5. `test-conflicts.js` -- Test with 3 pairs of conflicting statistics
6. (Bonus) `bad-synthesis.js` -- Anti-pattern demonstration
