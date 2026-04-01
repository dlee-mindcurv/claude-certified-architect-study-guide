# Exercise 3: Build a Structured Data Extraction Pipeline

**Domains reinforced:** D4 (Prompt Engineering), D5 (Context Management)

## Objective

Practice building a structured data extraction pipeline using JSON schemas with
tool_use for guaranteed output structure, validation-retry loops, few-shot examples,
batch processing with the Message Batches API, and human review routing with
confidence scores.

## Prerequisites

- `npm install` from the project root
- `ANTHROPIC_API_KEY` in `.env`

## Steps

### Step 1: Define the extraction tool with a JSON schema

Create a tool whose `input_schema` enforces structured output. Key schema design
principles:
- **Required fields**: only what MUST be present for downstream processing
- **Optional/nullable fields**: use `type: ["string", "null"]` for data that may
  not exist in source documents
- **Enum with "other"**: extensible categorization (e.g., document_type includes
  "other" with a detail field)
- **conflict_detected**: self-validation (calculated vs stated values)
- **confidence scores**: enable human review routing

### Step 2: Implement a validation-retry loop

After the model returns structured data via tool_use:
1. Validate the output against business rules (not just schema compliance)
2. If validation fails, send the errors back to the model with specific feedback
3. Allow up to 3 retries before marking extraction as "partial"

Note: tool_use eliminates JSON syntax errors but NOT semantic errors (values in
wrong fields, fabricated data).

### Step 3: Add few-shot examples for varied document formats

Provide examples showing how to extract data from:
- Invoices (line items, totals, tax)
- Research papers (authors, abstract, DOI)
- Contracts (parties, terms, monetary values)

Examples demonstrate the expected null handling, confidence scoring, and
conflict detection patterns.

### Step 4: Design batch processing with the Message Batches API

Structure batch requests with:
- `custom_id` for correlating results back to source documents
- Consistent system prompts and tool configurations across the batch
- Error handling for partial batch failures

### Step 5: Implement human review routing with confidence scores

Route extractions based on field-level confidence:
- Auto-approve: all field confidences >= 0.9
- Flag for review: any field confidence < 0.9 but >= 0.7
- Reject: any field confidence < 0.7 or conflict_detected is true

## Running

```bash
# Run the starter (has TODOs to complete)
npm run exercise:3

# Run the solution
node exercises/exercise-3-data-extraction/solution.js
```

## Sample Documents

The `sample-documents/` directory contains test inputs:
- `invoice.txt` — Invoice with line items, tax, and totals
- `research-paper.txt` — Research paper abstract with metadata
- `contract.txt` — Service agreement with monetary terms

## Key Exam Concepts Practiced

- **Task 4.3**: JSON schemas with tool_use for structured output
- **Task 4.4**: Validation-retry loops for semantic correctness
- **Task 4.2**: Few-shot examples for varied document formats
- **Task 4.5**: Message Batches API with custom_id correlation
- **Task 5.5**: Confidence-based routing for human review
