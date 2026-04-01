# Domain 5: Context Window Reliability (15% of exam)

Domain 5 covers the strategies and patterns for maintaining information accuracy,
attribution, and decision quality across extended conversations and multi-agent
systems. While the context window gives Claude enormous capacity, that capacity
introduces failure modes that architects must anticipate and mitigate.

## Task Statements

| Task | Title | Key Concept |
|------|-------|-------------|
| 5.1 | Preserve critical context | Case facts block, progressive summarization risks |
| 5.2 | Define escalation criteria | Explicit triggers, few-shot examples, anti-heuristics |
| 5.3 | Propagate errors with context | Structured error objects, coverage annotations |
| 5.4 | Manage codebase context | Scratchpad files, subagent delegation, /compact |
| 5.5 | Route to human review | Confidence calibration, stratified sampling |
| 5.6 | Preserve provenance | Claim-source mappings, conflicting statistics |

## Scenarios Covered

- **Scenario 1 (CSR Agent):** Tasks 5.1, 5.2 -- Context preservation across
  multi-turn customer interactions; escalation criteria with few-shot examples.
- **Scenario 3 (Research Coordinator):** Tasks 5.3, 5.6 -- Error propagation
  from subagents to coordinator; provenance tracking through synthesis.
- **Scenario 4 (Dev Productivity):** Task 5.4 -- Context management during
  extended codebase exploration sessions.
- **Scenario 6 (Data Extraction):** Task 5.5 -- Field-level confidence routing
  and stratified sampling for human review.

## Skills Assessed

- **S1:** Configure and optimize context management for extended interactions
- **S3:** Design error propagation and recovery patterns for multi-agent systems
- **S4:** Implement context management strategies for code-focused agents
- **S6:** Build extraction pipelines with confidence-based quality controls

## Key Exam Themes

1. **Context is not infinite -- it degrades.** Even within the context window,
   information in the middle of long conversations gets less attention than
   information at the beginning or end ("lost in the middle" effect). Architects
   must actively manage what information sits where.

2. **Progressive summarization destroys specifics.** When conversations are
   summarized, specific numbers, dates, and identifiers get condensed into vague
   statements. The case facts block pattern counteracts this by maintaining an
   always-current structured summary outside the summarized history.

3. **Escalation is not sentiment analysis.** Reliable escalation criteria are
   explicit rules with few-shot examples, not confidence scores or sentiment
   thresholds. Sentiment analysis and confidence scores are unreliable proxies
   that produce false positives and false negatives.

4. **Errors carry context, not just status codes.** A generic "error" status
   hides the difference between "service unavailable" and "no results found."
   Structured error objects with failure type, attempted query, partial results,
   and alternatives enable intelligent recovery.

5. **Source attribution is lost during summarization.** When subagent findings
   are synthesized into a report, claim-source mappings must be explicitly
   preserved. Conflicting statistics from different sources must be presented
   with attribution, not arbitrarily resolved.

6. **Aggregate accuracy masks segment-level problems.** A 95% overall accuracy
   rate might hide a 60% rate for a specific document type or field. Stratified
   sampling and segment-level analysis reveal the true quality picture.

## Directory Structure

Each task directory contains:
- `README.md` -- Concept explanation and exam relevance
- `example.js` -- Working implementation using `@anthropic-ai/sdk`
- `exercise.md` -- Hands-on exercise to test understanding
- `scenario-*/` -- Scenario-specific implementations

## Split Between SDK and Claude Code

Domain 5 spans both the SDK and Claude Code contexts:

| Concept | SDK (Anthropic API) | Claude Code |
|---------|--------------------:|:-----------:|
| Case facts block | System prompt injection | CLAUDE.md conventions |
| Escalation criteria | System prompt few-shots | N/A (interactive) |
| Error propagation | Structured tool results | Tool error handling |
| Codebase context | Subagent spawning | /compact, scratchpad files |
| Human review routing | Confidence-based logic | N/A (batch pipelines) |
| Provenance tracking | Claim-source mappings | Citation in reports |
