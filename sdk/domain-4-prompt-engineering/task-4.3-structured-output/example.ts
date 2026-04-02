/**
 * Task 4.3 -- Structured Output with tool_use and JSON Schemas
 *
 * Exam relevance:
 * - tool_use eliminates JSON syntax errors but NOT semantic errors
 * - tool_choice options: "auto", "any", { type: "tool", name: "..." }
 * - Forced tool selection guarantees structured output in a specific schema
 * - Nullable fields (type: ["string", "null"]) enable correct absent-info handling
 * - Scenario 6 (Data Extraction) depends on these patterns
 *
 * This is an API-level concept -- uses @anthropic-ai/sdk directly with
 * client.messages.create() and the tools parameter.
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.3-structured-output/example.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { documentExtractionTool } from '../../../shared/schemas/extraction-output.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Sample Documents ───────────────────────────────────────────────────────

const documents = {
  complete: {
    label: 'Complete invoice (all fields present)',
    text: `INVOICE #INV-2025-0099
Date: April 1, 2025
Due: April 30, 2025

Vendor: DataPipe Solutions
Bill To: Quantum Dynamics Inc., 500 Innovation Dr, Austin TX 78701

Description              Qty    Unit Price    Total
Data Pipeline Setup       1      $8,000.00    $8,000.00
Monthly Monitoring        3        $500.00    $1,500.00
Custom Integration        1      $3,200.00    $3,200.00
─────────────────────────────────────────────────────
Subtotal:                                    $12,700.00
Tax (8.25%):                                  $1,047.75
TOTAL:                                       $13,747.75

Payment Terms: Net 30`,
  },
  sparse: {
    label: 'Sparse receipt (minimal fields)',
    text: `Corner Deli
Coffee           $4.50
Sandwich         $12.00
Total:           $16.50
Cash`,
  },
  narrative: {
    label: 'Narrative research excerpt (no structured fields)',
    text: `A recent analysis by researchers at Stanford University examined the impact of
remote work policies on employee productivity. Published in the Harvard Business
Review in March 2025, the study tracked 2,400 employees across 15 companies
over an 18-month period starting in September 2023.`,
  },
};

// ─── Example 1: Forced Tool Selection ───────────────────────────────────────
//
// EXAM KEY CONCEPT: tool_choice: { type: "tool", name: "extract_document_info" }
// forces Claude to call the specified tool, guaranteeing structured output.

async function extractWithForcedTool(docKey) {
  const doc = documents[docKey];
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Document: ${doc.label}`);
  console.log('─'.repeat(60));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    // ── EXAM KEY CONCEPT: Forced tool selection ────────────────────────
    // Claude MUST call this specific tool -- it cannot respond with text.
    tools: [documentExtractionTool],
    tool_choice: { type: 'tool', name: 'extract_document_info' },
    messages: [
      {
        role: 'user',
        content: `Extract structured information from this document. Return null for any fields not present in the source -- do not fabricate values.\n\n${doc.text}`,
      },
    ],
  });

  // With forced tool selection, the response ALWAYS contains a tool_use block
  const toolUseBlock = response.content.find(b => b.type === 'tool_use');

  if (!toolUseBlock) {
    console.error('ERROR: No tool_use block found (unexpected with forced selection)');
    return null;
  }

  const extraction = toolUseBlock.input;
  console.log('\nExtracted data:');
  console.log(JSON.stringify(extraction, null, 2));

  return extraction;
}

// ─── Example 2: Compare tool_choice Options ─────────────────────────────────

async function demonstrateToolChoiceOptions() {
  console.log('\n' + '='.repeat(60));
  console.log('COMPARING tool_choice OPTIONS');
  console.log('='.repeat(60));

  const testDoc = documents.complete.text;

  // ── Option A: "auto" -- Claude chooses whether to use a tool ──────
  console.log('\n--- tool_choice: "auto" ---');
  console.log('Claude may or may not call the tool.\n');

  const autoResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [documentExtractionTool],
    tool_choice: 'auto',
    messages: [
      { role: 'user', content: `What kind of document is this?\n\n${testDoc}` },
    ],
  });

  const autoToolUse = autoResponse.content.find(b => b.type === 'tool_use');
  const autoText = autoResponse.content.find(b => b.type === 'text');
  console.log(`Tool called: ${autoToolUse ? 'Yes (' + autoToolUse.name + ')' : 'No'}`);
  console.log(`Text response: ${autoText ? 'Yes' : 'No'}`);
  console.log(`stop_reason: ${autoResponse.stop_reason}`);

  // ── Option B: "any" -- Claude must call some tool ─────────────────
  console.log('\n--- tool_choice: "any" ---');
  console.log('Claude must call one of the available tools.\n');

  const anyResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [documentExtractionTool],
    tool_choice: 'any',
    messages: [
      { role: 'user', content: `What kind of document is this?\n\n${testDoc}` },
    ],
  });

  const anyToolUse = anyResponse.content.find(b => b.type === 'tool_use');
  console.log(`Tool called: ${anyToolUse ? 'Yes (' + anyToolUse.name + ')' : 'No'}`);
  console.log(`stop_reason: ${anyResponse.stop_reason}`);

  // ── Option C: forced specific tool ────────────────────────────────
  console.log('\n--- tool_choice: { type: "tool", name: "extract_document_info" } ---');
  console.log('Claude must call extract_document_info specifically.\n');

  const forcedResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [documentExtractionTool],
    tool_choice: { type: 'tool', name: 'extract_document_info' },
    messages: [
      { role: 'user', content: `What kind of document is this?\n\n${testDoc}` },
    ],
  });

  const forcedToolUse = forcedResponse.content.find(b => b.type === 'tool_use');
  console.log(`Tool called: ${forcedToolUse ? 'Yes (' + forcedToolUse.name + ')' : 'No'}`);
  console.log(`stop_reason: ${forcedResponse.stop_reason}`);

  console.log(`
EXAM NOTE on stop_reason:
- With "auto": stop_reason is "end_turn" (text) or "tool_use" (tool call)
- With "any" or forced: stop_reason is always "tool_use"
  The model cannot choose to skip the tool call.
`);
}

// ─── Example 3: Nullable Fields in Action ───────────────────────────────────

async function demonstrateNullableFields() {
  console.log('\n' + '='.repeat(60));
  console.log('NULLABLE FIELDS: Handling Missing Information');
  console.log('='.repeat(60));

  const sparseExtraction = await extractWithForcedTool('sparse');

  if (sparseExtraction) {
    console.log('\n--- Null Field Analysis ---');

    const nullableFields = ['title', 'author', 'date'];
    for (const field of nullableFields) {
      const value = sparseExtraction[field];
      const isNull = value === null;
      console.log(
        `  ${field}: ${isNull ? 'null (CORRECT - not in source)' : JSON.stringify(value) + ' (verify against source)'}`
      );
    }

    console.log(`
EXAM KEY CONCEPT: Nullable fields with type: ["string", "null"] tell Claude
that null is a VALID output. Combined with few-shot examples (Task 4.2) showing
null for absent fields, this dramatically reduces hallucination.

However, tool_use alone does NOT prevent semantic errors. Claude might still
put a fabricated date in the date field -- the schema only prevents it from
using the wrong TYPE (e.g., a number instead of a string).
`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.3 -- Structured Output with tool_use\n');
  console.log('Key insight: tool_use guarantees valid JSON schema compliance,');
  console.log('but it does NOT guarantee semantic correctness.\n');

  // Part 1: Extract from all three document types
  console.log('='.repeat(60));
  console.log('PART 1: Forced Tool Extraction Across Document Types');
  console.log('='.repeat(60));

  for (const docKey of Object.keys(documents)) {
    await extractWithForcedTool(docKey);
  }

  // Part 2: Compare tool_choice options
  await demonstrateToolChoiceOptions();

  // Part 3: Demonstrate nullable fields
  await demonstrateNullableFields();
}

main().catch(console.error);
