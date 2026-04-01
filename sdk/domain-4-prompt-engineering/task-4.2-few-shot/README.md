# Task 4.2: Apply Few-Shot Examples

## Exam Relevance
Tested in Scenario 1 (CSR Agent) and Scenario 6 (Data Extraction).

## Why Few-Shot Examples Are the Most Effective Technique

Few-shot examples are consistently the single most effective prompt engineering
technique for achieving consistent output from Claude. They work because they
demonstrate:

1. **How to handle ambiguous cases** -- The most valuable few-shot examples
   cover situations where the correct action is not obvious. Rather than
   showing trivial cases, they demonstrate judgment calls with explicit
   reasoning.

2. **The reasoning process, not just input/output** -- Effective few-shot
   examples include the WHY, not just the WHAT. An example that shows
   "Customer said X -> Escalate" is less useful than one that shows
   "Customer said X -> Escalate because policy does not cover competitor
   price matching, and denying outright could damage the relationship."

3. **Generalization to novel patterns** -- By showing reasoning across 2-4
   diverse examples, Claude learns to apply the same reasoning framework
   to situations it has not seen. The examples teach the decision process,
   enabling correct handling of new variations.

## Role in Ambiguous-Case Handling

Consider customer support escalation. Clear-cut cases are easy:
- Customer wants order status -> Look it up (obvious, no example needed)
- Customer requests human agent -> Escalate immediately (policy is clear)

The hard cases are ambiguous:
- Customer is frustrated but the issue is resolvable
- Customer asks for something outside policy but not explicitly prohibited
- Customer's request could be interpreted multiple ways

Few-shot examples shine precisely in these ambiguous scenarios because they
establish a consistent reasoning pattern that Claude applies to novel
ambiguous situations.

## Effectiveness for Reducing Hallucination in Extraction

In data extraction (Scenario 6), few-shot examples are critical for:

- **Missing fields:** Show an example where a field is absent from the source
  and the correct output is `null` -- not a fabricated value.
- **Varied document structures:** Show how the same information appears in
  different formats (inline citations vs. bibliographies, narrative text
  vs. tabular data).
- **Ambiguous values:** Show an example where a value could be interpreted
  multiple ways and the correct approach is to flag the ambiguity rather
  than guess.

Without these examples, Claude will sometimes fill in missing fields with
plausible-sounding but incorrect values (hallucination). The examples teach
it that `null` is the correct answer when information is not present.

## Best Practices for Few-Shot Examples

1. **Use 2-4 targeted examples.** More is not better -- too many examples
   consume context window without proportional benefit. Choose examples that
   cover the most ambiguous or error-prone cases.

2. **Include reasoning in each example.** Format as:
   - Input (what Claude sees)
   - Decision (what Claude should do)
   - Reasoning (WHY this is the correct decision)

3. **Cover the boundary cases.** If there is a threshold (e.g., refunds over
   $100 require approval), include examples on both sides of the boundary.

4. **Show both positive and negative examples.** Include at least one example
   where the correct action is to NOT escalate / NOT extract / NOT flag.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Working examples with escalation and extraction few-shot prompts |
| `exercise.md` | Add few-shot examples to an extraction prompt |
| `scenario-1-csr/escalation-examples.js` | CSR escalation few-shot examples |
| `scenario-6-extraction/extraction-examples.js` | Data extraction few-shot examples |
