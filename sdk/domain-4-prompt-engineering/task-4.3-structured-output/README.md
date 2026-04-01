# Task 4.3: Enforce Structured Output Using tool_use and JSON Schemas

## Exam Relevance
Tested in Scenario 6 (Data Extraction).

## Why tool_use Is the Most Reliable Approach

Claude's `tool_use` feature is the most reliable mechanism for producing
structured output. When Claude generates a tool call, the `input` field is
guaranteed to be valid JSON conforming to the tool's `input_schema`. This
eliminates an entire class of errors that occur when asking Claude to produce
JSON in free text:

- No unterminated strings
- No trailing commas
- No missing brackets
- No comments inside JSON

### What tool_use Does and Does NOT Guarantee

**Eliminates (syntax errors):**
- Malformed JSON
- Schema violations (missing required fields, wrong types)
- Invalid enum values

**Does NOT eliminate (semantic errors):**
- Wrong value in the correct field (e.g., journal name in the title field)
- Fabricated values for fields where the source document has no information
- Incorrect confidence scores
- Misidentified entities

This distinction is critical for the exam: tool_use solves the format problem
but NOT the accuracy problem. Accuracy requires few-shot examples (Task 4.2)
and validation-retry (Task 4.4).

## tool_choice Options

The `tool_choice` parameter controls how Claude selects tools:

### `tool_choice: "auto"` (default)
Claude decides whether to call a tool or respond with text. Use this when
you want Claude to make its own decision about when tools are needed.

```js
tool_choice: "auto"
// Claude may or may not call a tool
```

### `tool_choice: "any"`
Claude MUST call exactly one tool, but it chooses which one. Use this when
you want guaranteed structured output but have multiple tool schemas for
different document types.

```js
tool_choice: "any"
// Claude must call one of the available tools
```

### `tool_choice: { type: "tool", name: "extract_metadata" }`
Claude MUST call the specified tool. Use this for forced extraction where
you always want output in a specific schema, regardless of document content.

```js
tool_choice: { type: "tool", name: "extract_metadata" }
// Claude must call extract_metadata specifically
```

## Schema Design Principles

### Required vs. Optional Fields

Only mark fields as `required` when downstream processing cannot function
without them:

```json
{
  "required": ["document_id", "document_type", "field_confidence"]
}
```

Fields that may or may not exist in the source document should be optional
and nullable:

```json
{
  "title": { "type": ["string", "null"] },
  "author": { "type": ["string", "null"] }
}
```

### Nullable Fields for Absent Information

Use `type: ["string", "null"]` for fields that may not exist in the source.
This tells Claude that `null` is a valid value -- combined with few-shot
examples showing correct null handling, this significantly reduces hallucination.

### Enum with "other" + Detail Field

For categorization fields, use an enum with an "other" escape hatch:

```json
{
  "document_type": {
    "type": "string",
    "enum": ["invoice", "contract", "research_paper", "receipt", "other"]
  },
  "document_type_detail": {
    "type": ["string", "null"],
    "description": "Additional detail when document_type is 'other'"
  }
}
```

This pattern:
- Constrains the primary field to known categories (reliable for routing)
- Provides an escape hatch for unexpected document types
- Captures detail text only when the enum value is "other"

### Self-Correction Fields

Include both stated and calculated values for self-correction validation:

```json
{
  "stated_total": { "type": "number" },
  "calculated_total": { "type": "number" },
  "conflict_detected": { "type": "boolean" }
}
```

Claude computes `calculated_total` independently from line items and compares
it to `stated_total`. If they differ, `conflict_detected` is set to `true`.
This provides a built-in validation signal without a separate API call.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | tool_use with JSON schema, forced tool selection, nullable fields |
| `exercise.md` | Define an extraction schema and process documents |
| `scenario-6-extraction/tool-use-schema.js` | Full extraction tool definitions |
