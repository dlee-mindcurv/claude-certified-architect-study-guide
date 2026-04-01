# Exercise: Add Few-Shot Examples to an Extraction Prompt

## Objective

Add targeted few-shot examples to a data extraction prompt and measure the
impact on extraction accuracy across varied document structures.

## Background

You have a basic extraction prompt that says:

```
Extract structured information from the following document.
Return JSON with: document_type, title, date, entities, monetary_values.
Fields not present should be null.
```

This prompt works for well-structured documents but struggles with:
- Documents where fields are missing
- Narrative format vs. tabular format
- Ambiguous or conflicting values

Your job is to add few-shot examples that address these failure modes.

## Part 1: Identify Failure Modes (15 minutes)

Run the basic prompt (without few-shot examples) against these four documents:

1. **Complete invoice** -- structured, all fields present
2. **Sparse receipt** -- minimal info (just store name, total, payment method)
3. **Narrative research excerpt** -- information embedded in prose
4. **Contract with ambiguity** -- stated total vs. calculated total differ

Record what goes wrong:
- Does Claude fabricate missing fields?
- Does it handle narrative format correctly?
- Does it detect the total conflict?

## Part 2: Design Few-Shot Examples (20 minutes)

Create 3-4 few-shot examples that address the failures you identified.

For each example, include:

1. **Input:** A sample document
2. **Output:** The correct extraction JSON
3. **Reasoning:** Why this output is correct -- what decision was made and why

Guidelines:
- Each example should address a DIFFERENT failure mode
- Include at least one example with null fields and explicit reasoning about
  why they are null (not "I could not find it" but "this field is absent from
  the source document")
- Include at least one example showing conflict detection between stated and
  calculated values
- Keep examples concise -- long examples consume context window without
  proportional benefit

## Part 3: Measure Impact (20 minutes)

1. Create a test set of 6-8 documents covering the failure modes
2. Run each document through:
   - The basic prompt (no few-shot examples)
   - Your improved prompt (with few-shot examples)
3. Score each extraction on:
   - **Null accuracy:** Did it correctly return null for absent fields?
   - **Format consistency:** Is the output structure consistent across documents?
   - **Conflict detection:** Did it flag stated vs. calculated mismatches?
   - **Hallucination rate:** Did it fabricate any values not in the source?

## Part 4: Refine (15 minutes)

Based on your measurements:
- If hallucination persists for a specific case, add a targeted example
- If an example is not helping (Claude already handles that case well), remove
  it to save context window
- Consider whether your reasoning explanations are specific enough

## Success Criteria

- [ ] 3-4 few-shot examples covering distinct failure modes
- [ ] Each example includes input, output, AND reasoning
- [ ] At least one example demonstrates correct null handling
- [ ] At least one example demonstrates conflict detection
- [ ] Measured hallucination rate decreased compared to no-example baseline
- [ ] Null accuracy improved compared to baseline
- [ ] Examples are concise (each under 20 lines of prompt text)

## Exam Tip

The exam tests two key insights about few-shot examples:

1. **Quality over quantity.** 2-4 targeted examples outperform 10+ generic ones.
   Each example should teach Claude something it would not do correctly without
   the example. Trivial cases (well-structured document with all fields present)
   are not worth using as examples.

2. **Reasoning enables generalization.** An example that shows only
   input -> output teaches one specific mapping. An example that shows
   input -> output + reasoning teaches a decision framework that Claude can
   apply to novel inputs it has never seen.
