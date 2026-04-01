# Exercise: Simulate Subagent Failures and Verify Coordinator Recovery

## Objective

Build a multi-agent research coordinator that handles subagent failures
gracefully. Simulate a timeout, verify the coordinator's recovery logic, and
confirm the final output includes accurate coverage annotations.

## Setup

Use the shared research tools and prompts:
```js
import { researchToolDefinitions, executeResearchTool } from '../../../shared/tools/research-tools.js';
import { researchCoordinatorPrompt } from '../../../shared/prompts/research-coordinator.js';
```

## Part 1: Build the Structured Error Context

Create a module that defines:

1. **Error context factory** with these fields:
   ```js
   {
     isError: true,
     failureType: 'timeout' | 'rate_limit' | 'access_denied' | 'invalid_query' | 'service_unavailable',
     attemptedQuery: string,      // The exact query that failed
     partialResults: [],           // Any results obtained before failure
     alternatives: [],             // Suggested recovery approaches
     timestamp: string,            // ISO timestamp
   }
   ```

2. **Empty result factory** (explicitly NOT an error):
   ```js
   {
     isError: false,
     query: string,
     results: [],
     totalResults: 0,
     message: 'No results found for this query',
   }
   ```

3. A test that verifies the two factories produce objects with different
   `isError` values for the same query.

## Part 2: Build the Recovery Decision Logic

Implement a `coordinatorRecover(errorContext)` function that:

| failureType | Has Partial Results? | Action |
|-------------|---------------------|--------|
| timeout | Yes | Use partials, note gap in coverage |
| timeout | No | Retry once, mark gap if retry fails |
| rate_limit | Any | Log for deferred retry |
| access_denied | Any | Try alternative source if available |
| invalid_query | Any | Rephrase and retry |
| service_unavailable | Any | Mark gap, proceed with other sources |

Each recovery attempt returns:
```js
{
  recovered: boolean,
  strategy: string,          // 'partial_results_with_gap' | 'retry_success' | 'retry_failed' | ...
  results: [],               // Any results recovered
  coverageNote: string,      // Annotation for the final report
}
```

## Part 3: Simulate a Research Run with Mixed Outcomes

Create a simulation with 4 subagent tasks:

| Subagent | Topic | Simulated Outcome |
|----------|-------|-------------------|
| A | "AI in visual arts" | Success (3 results) |
| B | "AI in music production" | Timeout with 1 partial result |
| C | "AI in quantum agriculture" | Valid empty result (0 results) |
| D | "AI film production VFX" | Success (2 results) |

Run all four and collect results.

## Part 4: Build the Final Report with Coverage Annotations

Assemble the final report that includes:

### Findings section
All findings from successful subagents and recovered partial results.
Each finding must include source attribution.

### Coverage section
Two subsections:

**Well-Supported Topics:**
- Topics with 2+ independent sources

**Coverage Gaps:**
- Topics where subagents failed (with explanation of what happened)
- Topics with valid empty results (noting the topic lacks published coverage)
- Topics with partial results (noting incomplete coverage)

## Part 5: Verification Checklist

After running your simulation, verify:

- [ ] Subagent A (visual arts) appears in findings with 3 results
- [ ] Subagent B (music) partial result appears in findings (1 result)
- [ ] Subagent B has a coverage gap annotation noting the timeout
- [ ] Subagent C (quantum agriculture) has a coverage gap annotation noting
      "no sources found" (NOT "search failed")
- [ ] Subagent D (film VFX) appears in findings with 2 results
- [ ] The coverage gap for Subagent B says "timed out" (failure language)
- [ ] The coverage gap for Subagent C says "no sources found" (valid-empty language)
- [ ] No findings are fabricated or attributed to the wrong source
- [ ] Total findings count = 3 (visual arts) + 1 (music partial) + 2 (film) = 6

## Bonus: Test Error Suppression Detection

Create a variant that intentionally suppresses errors (filters out failed
subagents without annotating gaps). Then compare the two reports:

1. **With coverage annotations**: Reader knows music topic is underrepresented
2. **Without annotations**: Reader assumes comprehensive coverage was achieved

Explain in a comment why the second variant is dangerous for decision-making.

## Deliverables

1. `error-context.js` -- Structured error and empty result factories
2. `recovery-logic.js` -- Coordinator recovery decision function
3. `simulation-runner.js` -- Full simulation with 4 subagents
4. `report-builder.js` -- Report assembly with coverage annotations
5. Verification checklist with pass/fail for each item
