# Exercise: Define an Extraction Schema and Process Documents

## Objective

Design a JSON schema for a tool_use-based extraction tool, then process
a set of documents with varying completeness. Verify that nullable fields
return null (not fabricated values) and that conflict detection works.

## Part 1: Schema Design (20 minutes)

Design a `tool_use` schema for extracting information from job postings.
The schema should handle these fields:

1. **Always present:** company_name, job_title
2. **Usually present:** location, employment_type (full-time, part-time, contract)
3. **Sometimes present:** salary_range (min, max, currency), remote_policy
4. **Rarely present:** specific benefits, team_size, hiring_manager_name

For each field, decide:
- Is it `required` or optional?
- Should it be nullable (`type: ["string", "null"]`)?
- Does it need an enum? If so, include an "other" option with a detail field.

Write the complete tool definition:
```js
const jobPostingExtractionTool = {
  name: "extract_job_posting",
  description: "...",
  input_schema: {
    type: "object",
    properties: {
      // Your schema here
    },
    required: [/* Only truly required fields */]
  }
};
```

## Part 2: Process Test Documents (20 minutes)

Create 4 test job postings with varying completeness:

1. **Complete posting:** All fields present including salary and benefits
2. **Minimal posting:** Only company, title, and a brief description
3. **Ambiguous posting:** Salary listed as "competitive" (not a number),
   location listed as "flexible" (not a specific place)
4. **Conflicting posting:** Title says "Senior Engineer" but requirements
   list entry-level expectations

For each document:
1. Send it to Claude with your tool definition and `tool_choice: { type: "tool", name: "extract_job_posting" }`
2. Record the extraction result
3. Verify:
   - Are absent fields null (not fabricated)?
   - Are ambiguous values handled with notes (not forced into the schema)?
   - Are conflicts flagged?

## Part 3: Schema Iteration (15 minutes)

Based on Part 2 results:

1. Did any `required` field cause problems? (e.g., Claude fabricated a value
   to satisfy a required field that was absent from the source)
2. Did any `enum` miss a real-world category?
3. Would an `extraction_notes` field help explain ambiguities?

Revise your schema and re-run the test documents.

## Success Criteria

- [ ] Schema has appropriate required vs. optional field classification
- [ ] Nullable fields are used for information that may be absent
- [ ] At least one enum field has an "other" + detail escape hatch
- [ ] All 4 test documents produce valid JSON (tool_use guarantees this)
- [ ] Absent fields return null, not fabricated values
- [ ] Ambiguous values are either null with notes or flagged explicitly
- [ ] Schema has a field_confidence or extraction_notes field for quality signals

## Exam Tip

The exam distinguishes between syntax correctness (which tool_use guarantees)
and semantic correctness (which it does not). A common distractor is claiming
that tool_use "prevents hallucination" -- it does not. It prevents malformed
JSON. Semantic accuracy requires:
- Few-shot examples (Task 4.2) showing null for absent fields
- Validation-retry (Task 4.4) catching semantic errors after extraction
- Self-correction fields like conflict_detected (stated vs. calculated values)
