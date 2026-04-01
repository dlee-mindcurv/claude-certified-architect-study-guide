# Domain 4: Prompt Engineering (20% of exam)

Domain 4 covers the techniques for crafting prompts that produce reliable,
consistent, and production-quality outputs from Claude. This domain emphasizes
measurable improvements -- not vague "prompt tips" -- with a focus on structured
output, systematic review, and batch processing at scale.

## Task Statements

| Task | Title | Key Concept |
|------|-------|-------------|
| 4.1 | Define explicit review criteria | Categorical severity levels beat vague instructions |
| 4.2 | Apply few-shot examples | Targeted examples for ambiguous-case reasoning |
| 4.3 | Enforce structured output with tool_use | JSON schemas via tool_use eliminate syntax errors |
| 4.4 | Implement validation-retry loops | Retry with error feedback vs. absent-info failures |
| 4.5 | Design batch processing pipelines | Message Batches API for cost-efficient bulk work |
| 4.6 | Architect multi-pass review | Session isolation for independent verification |

## Scenarios Covered

- **Scenario 1 (CSR Agent):** Task 4.2 -- Few-shot examples for escalation
  decisions in ambiguous customer interactions.
- **Scenario 5 (CI/CD Review):** Tasks 4.1, 4.5, 4.6 -- Explicit review
  criteria with severity levels, batch processing of code changes, and
  multi-pass review architecture (per-file + cross-file).
- **Scenario 6 (Data Extraction):** Tasks 4.2, 4.3, 4.4, 4.5 -- Few-shot
  examples for varied document structures, tool_use for structured extraction,
  validation-retry for quality assurance, and batch pipeline for volume.

## Key Exam Themes

1. **Explicit criteria outperform vague instructions.** "Be conservative" fails
   because it is not measurable. Specific severity levels with concrete code
   examples produce consistent, auditable results.

2. **Few-shot examples teach reasoning, not just format.** The value of few-shot
   examples is showing HOW to handle ambiguous cases -- including the reasoning
   for each decision -- not merely demonstrating input/output pairs.

3. **tool_use eliminates syntax errors but NOT semantic errors.** Forcing
   structured output via tool_use guarantees valid JSON conforming to your
   schema, but the model can still put the wrong value in a field or fabricate
   data that is absent from the source document.

4. **Retry is only effective when the error is resolvable.** Retrying a format
   mismatch (fixable) is useful. Retrying extraction of information that does
   not exist in the source document (not fixable) wastes tokens and latency.

5. **Session isolation improves review quality.** A model that generated output
   retains its reasoning context and is biased toward confirming its own work.
   An independent review instance without that context catches more issues.

6. **Batch API trades latency for cost.** The Message Batches API offers 50%
   cost savings but has no guaranteed latency SLA (up to 24 hours). Use it
   for non-blocking workloads like overnight report generation.

## Directory Structure

Each task directory contains:
- `README.md` -- Concept explanation and exam relevance
- `example.js` -- Working implementation using `@anthropic-ai/sdk`
- `exercise.md` -- Hands-on exercise to test understanding
- `scenario-*/` -- Scenario-specific implementations
