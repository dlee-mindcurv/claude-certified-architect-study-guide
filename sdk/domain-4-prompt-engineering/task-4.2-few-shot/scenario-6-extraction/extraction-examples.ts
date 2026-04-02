/**
 * Scenario 6 (Data Extraction) -- Few-Shot Examples for Varied Document Structures
 *
 * Exam relevance:
 * - Task 4.2: Few-shot examples reduce hallucination in extraction
 * - Examples cover inline citations vs. bibliographies, narrative vs. tabular,
 *   and missing fields
 * - Each example demonstrates reasoning about what IS and IS NOT in the source
 *
 * Uses Agent SDK query() with few-shot examples in the prompt. Also shows the
 * raw SDK approach with tool_use for comparison.
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.2-few-shot/scenario-6-extraction/extraction-examples.js
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

// ─── Few-Shot Extraction Examples ───────────────────────────────────────────

export const extractionFewShotExamples = [
  {
    id: 'complete-invoice-tabular',
    description: 'Tabular invoice with all fields present -- baseline for format',
    input: `INVOICE #INV-2025-0042
Date: March 15, 2025
Bill To: Acme Corp, 123 Main St, Springfield IL 62701

Description          Qty    Unit Price    Total
Widget A              10      $25.00      $250.00
Widget B               5      $42.50      $212.50
Subtotal: $462.50
Tax (8%): $37.00
TOTAL: $499.50`,
    output: {
      document_id: 'example-invoice',
      document_type: 'invoice',
      title: 'INVOICE #INV-2025-0042',
      author: null,
      date: '2025-03-15',
      entities: [{ name: 'Acme Corp', role: 'client' }],
      monetary_values: [
        { label: 'subtotal', stated_value: 462.50, calculated_value: 462.50, conflict_detected: false },
        { label: 'tax', stated_value: 37.00, calculated_value: 37.00, conflict_detected: false },
        { label: 'total', stated_value: 499.50, calculated_value: 499.50, conflict_detected: false },
      ],
      field_confidence: { title: 0.99, date: 0.99, entities: 0.95, monetary_values: 0.98 },
      extraction_notes: null,
    },
    reasoning:
      'All fields present in structured tabular format. Calculated total matches stated total. ' +
      'Author is null because invoices do not have authors.',
  },
  {
    id: 'sparse-receipt-missing-fields',
    description: 'Minimal receipt -- demonstrates correct null handling for absent fields',
    input: `Quick Mart
Some items purchased
Total: $23.47
Paid: Cash`,
    output: {
      document_id: 'example-receipt',
      document_type: 'receipt',
      title: null,
      author: null,
      date: null,
      entities: [{ name: 'Quick Mart', role: 'vendor' }],
      monetary_values: [
        { label: 'total', stated_value: 23.47, calculated_value: null, conflict_detected: false },
      ],
      field_confidence: { title: 0.0, date: 0.0, entities: 0.90, monetary_values: 0.95 },
      extraction_notes:
        'No date present in document. No itemized line items, so calculated_value ' +
        'cannot be independently verified. Title is null -- "Quick Mart" is the vendor name.',
    },
    reasoning:
      'CRITICAL: Date is NOT present. The correct output is null, not a fabricated date. ' +
      'calculated_value is null because there are no line items to verify from.',
  },
  {
    id: 'narrative-research-inline-citations',
    description: 'Research paper in narrative format with inline citations',
    input: `In their landmark 2024 study published in Nature Climate Science (Vol 12,
pp 234-251), Dr. Kim and Dr. Patel examined rising ocean temperatures using data
from 450 monitoring stations across the Pacific. They found that sea surface
temperatures increased by 0.8 degrees Celsius over the study period (2015-2023).
The research was funded by the National Science Foundation (Grant #OCE-2401234).`,
    output: {
      document_id: 'example-research',
      document_type: 'research_paper',
      title: null,
      author: null,
      date: '2024',
      entities: [
        { name: 'Dr. Kim', role: 'author' },
        { name: 'Dr. Patel', role: 'author' },
      ],
      monetary_values: [],
      field_confidence: { title: 0.0, date: 0.70, entities: 0.90, monetary_values: 1.0 },
      extraction_notes:
        'This is an excerpt, not the full paper. The paper TITLE is not stated -- ' +
        '"Nature Climate Science" is the journal name, not the paper title.',
    },
    reasoning:
      'Narrative format requires different extraction logic. The paper title is NOT present. ' +
      '"Nature Climate Science" is the JOURNAL, not the paper. Returning null rather than guessing.',
  },
  {
    id: 'contract-conflicting-values',
    description: 'Contract where stated total differs from calculated total',
    input: `SERVICE AGREEMENT
Effective Date: January 1, 2025
Parties: TechStart Inc. ("Client") and CloudServ LLC ("Provider")
Term: 24 months
Monthly Fee: $4,500/month
Total Contract Value: $100,000
Auto-renewal: Yes, 12-month terms unless 90-day written notice`,
    output: {
      document_id: 'example-contract',
      document_type: 'contract',
      title: 'SERVICE AGREEMENT',
      author: null,
      date: '2025-01-01',
      entities: [
        { name: 'TechStart Inc.', role: 'client' },
        { name: 'CloudServ LLC', role: 'vendor', role_detail: 'Provider' },
      ],
      monetary_values: [
        { label: 'monthly_fee', stated_value: 4500, calculated_value: null, conflict_detected: false },
        {
          label: 'total_contract_value',
          stated_value: 100000,
          calculated_value: 108000,
          conflict_detected: true,
        },
      ],
      field_confidence: { title: 0.95, date: 0.99, entities: 0.98, monetary_values: 0.95 },
      extraction_notes:
        'CONFLICT DETECTED: Stated total ($100,000) does not match calculated (24 x $4,500 = $108,000).',
    },
    reasoning:
      'The stated total ($100,000) and calculated total (24 x $4,500 = $108,000) differ. ' +
      'Report BOTH values and set conflict_detected: true. Do NOT silently correct.',
  },
];

// ─── Format Examples into Prompt ────────────────────────────────────────────

export function formatExtractionExamples(examples = extractionFewShotExamples) {
  let prompt = '## Extraction Examples\n\n';
  prompt += 'These examples demonstrate correct extraction for different document structures.\n\n';

  for (const ex of examples) {
    prompt += `### Example: ${ex.description}\n\n`;
    prompt += `**Input document:**\n\`\`\`\n${ex.input}\n\`\`\`\n\n`;
    prompt += `**Correct output:**\n\`\`\`json\n${JSON.stringify(ex.output, null, 2)}\n\`\`\`\n\n`;
    prompt += `**Reasoning:** ${ex.reasoning}\n\n`;
    prompt += '---\n\n';
  }

  return prompt;
}

// ─── Test Document ──────────────────────────────────────────────────────────

const testDocument = `
CONSULTING AGREEMENT

Date: February 28, 2025
Between: Bright Ideas LLC ("Consultant") and MegaCorp International ("Client")

Scope: Strategic technology advisory services
Duration: 6 months
Rate: $15,000/month
Performance Bonus: Up to $20,000 upon successful project completion
Total Estimated Value: $100,000

Note: Final invoice will include applicable state taxes.
`;

// ─── Demo: Extract with Agent SDK query() ───────────────────────────────────

async function runExtractionWithExamples() {
  console.log('Task 4.2 / Scenario 6 -- Extraction with Few-Shot Examples\n');

  const examplesPrompt = formatExtractionExamples();

  const systemContext = `You are a document extraction agent. Extract structured information
from documents following the patterns shown in the examples exactly.
When a field is not present in the source document, return null -- NEVER fabricate values.

${examplesPrompt}`;

  console.log('Extracting from test document with few-shot examples...\n');
  console.log(`Document:\n${testDocument.trim()}\n`);

  // EXAM KEY CONCEPT: query() with few-shot examples in the prompt guides
  // extraction behavior. The examples teach null handling, conflict detection,
  // and format-specific logic.
  const prompt = `${systemContext}\n\nExtract structured information from this document and return JSON:\n\n${testDocument}`;

  let resultText = '';
  for await (const message of query({ prompt })) {
    if (message.type === 'result' && message.subtype === 'success') {
      resultText = message.result;
    }
  }

  console.log('Extraction result:');
  console.log(resultText);

  // ── Validate key extraction behaviors ──────────────────────────────
  console.log('\n--- Validation ---');
  try {
    const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, resultText];
    const input = JSON.parse(jsonMatch[1]!.trim()) as Record<string, unknown>;

    const totalValue = (input.monetary_values as Array<Record<string, unknown>> | undefined)?.find(
      (v: Record<string, unknown>) => (v.label as string | undefined)?.toLowerCase().includes('total') || (v.label as string | undefined)?.toLowerCase().includes('estimated')
    );
    if (totalValue) {
      const calculatedTotal = 6 * 15000 + 20000;
      console.log(`Stated total: $${totalValue.stated_value}`);
      console.log(`Expected calculated: $${calculatedTotal} (6 x $15,000 + $20,000 bonus)`);
      console.log(`Conflict detected: ${totalValue.conflict_detected}`);
    }

    console.log(`Author field: ${input.author === null ? 'null (CORRECT)' : input.author}`);
  } catch {
    console.log('Could not parse JSON for validation');
  }
}

async function main() {
  await runExtractionWithExamples();

  console.log(`\n${'='.repeat(60)}`);
  console.log('KEY TAKEAWAYS FOR THE EXAM');
  console.log('='.repeat(60));
  console.log(`
1. MISSING FIELDS: The sparse receipt example teaches null for absent fields.
   Without it, Claude may fabricate dates or titles.

2. NARRATIVE FORMAT: The research paper example teaches extraction from prose.
   The key lesson: journal name is NOT paper title.

3. CONFLICT DETECTION: The contract example teaches comparing stated vs.
   calculated values. Both are reported; neither is assumed correct.

4. CONFIDENCE SCORES: Low confidence (0.0 for absent date) provides downstream
   systems with routing signals for human review.

5. EXTRACTION NOTES: Free-text field explains ambiguities and missing data,
   enabling humans to understand the extraction context.
`);
}

main().catch(console.error);
