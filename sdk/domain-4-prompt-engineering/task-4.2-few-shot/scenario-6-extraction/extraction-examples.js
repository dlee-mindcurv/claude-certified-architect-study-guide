/**
 * Scenario 6 (Data Extraction) -- Few-Shot Examples for Varied Document Structures
 *
 * Exam relevance:
 * - Task 4.2: Few-shot examples reduce hallucination in extraction
 * - Examples cover inline citations vs. bibliographies, narrative vs. tabular,
 *   and missing fields
 * - Each example demonstrates reasoning about what IS and IS NOT in the source
 *
 * Key extraction failure modes addressed by these examples:
 * 1. Missing fields: Claude fabricates plausible values instead of returning null
 * 2. Narrative format: Information embedded in prose, not labeled fields
 * 3. Conflicting values: Stated total differs from calculated total
 * 4. Ambiguous entities: Same name appears in different roles
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.2-few-shot/scenario-6-extraction/extraction-examples.js
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { documentExtractionTool } from '../../../../shared/schemas/extraction-output.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Few-Shot Extraction Examples ───────────────────────────────────────────
//
// EXAM KEY CONCEPT: These examples teach Claude how to handle the specific
// failure modes that cause incorrect extraction. Each example addresses a
// different document structure and a different type of difficulty.

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
      key_dates: [{ label: 'invoice_date', date: '2025-03-15' }],
      field_confidence: { title: 0.99, date: 0.99, entities: 0.95, monetary_values: 0.98 },
      extraction_notes: null,
    },
    reasoning:
      'All fields present in structured tabular format. Calculated total (250 + 212.50 = ' +
      '462.50 subtotal, + 37.00 tax = 499.50) matches stated total. No vendor name is ' +
      'present in this excerpt, so the vendor entity is not included. Author is null because ' +
      'invoices do not have authors.',
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
      key_dates: [],
      field_confidence: { title: 0.0, date: 0.0, entities: 0.90, monetary_values: 0.95 },
      extraction_notes:
        'No date present in document. No itemized line items, so calculated_value ' +
        'cannot be independently verified. Title is null -- "Quick Mart" is the vendor name, ' +
        'not a receipt title or number.',
    },
    reasoning:
      'CRITICAL: Date is NOT present in this document. The correct output is null, not a ' +
      'fabricated or inferred date. The confidence for date is 0.0 because there is no date ' +
      'information whatsoever. Similarly, there is no receipt number or title. "Quick Mart" ' +
      'is the vendor name, not a title. calculated_value is null because there are no line ' +
      'items to independently calculate from.',
  },
  {
    id: 'narrative-research-inline-citations',
    description: 'Research paper in narrative format with inline citations (not structured fields)',
    input: `In their landmark 2024 study published in Nature Climate Science (Vol 12,
pp 234-251), Dr. Kim and Dr. Patel examined rising ocean temperatures using data
from 450 monitoring stations across the Pacific. They found that sea surface
temperatures increased by 0.8 degrees Celsius over the study period (2015-2023),
with the strongest warming observed in equatorial regions. The research was funded
by the National Science Foundation (Grant #OCE-2401234).`,
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
      key_dates: [
        { label: 'publication_year', date: '2024' },
        { label: 'study_period_start', date: '2015' },
        { label: 'study_period_end', date: '2023' },
      ],
      field_confidence: { title: 0.0, date: 0.70, entities: 0.90, monetary_values: 1.0 },
      extraction_notes:
        'This is an excerpt, not the full paper. The paper TITLE is not stated -- ' +
        '"Nature Climate Science" is the journal name, not the paper title. Author field is ' +
        'null at the top level because we cannot determine the full author list from "Dr. Kim ' +
        'and Dr. Patel" (these may be abbreviated). Date confidence is 0.70 because only the ' +
        'year is provided. Grant number noted but not extracted as monetary value since the ' +
        'grant amount is not stated.',
    },
    reasoning:
      'Narrative format requires different extraction logic than tabular. The paper title is ' +
      'NOT present in this excerpt. "Nature Climate Science" is the JOURNAL, not the paper. ' +
      'This is the most common hallucination in research paper extraction -- fabricating a ' +
      'title from the subject matter. The correct answer is null. Multiple dates are present ' +
      '(publication year, study period) and should be extracted separately with labels.',
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
      key_dates: [
        { label: 'effective_date', date: '2025-01-01' },
        { label: 'end_date', date: '2026-12-31' },
      ],
      field_confidence: { title: 0.95, date: 0.99, entities: 0.98, monetary_values: 0.95 },
      extraction_notes:
        'CONFLICT DETECTED: Stated total contract value ($100,000) does not match ' +
        'calculated value (24 months x $4,500 = $108,000). This may indicate a discount, ' +
        'a typo, or terms not fully described in this excerpt. Flagging for human review.',
    },
    reasoning:
      'The stated total ($100,000) and the calculated total (24 x $4,500 = $108,000) ' +
      'differ by $8,000. Rather than choosing one over the other, the extraction reports ' +
      'BOTH values and sets conflict_detected: true. The extraction_notes explain the ' +
      'discrepancy and suggest possible explanations without guessing which is correct.',
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

// ─── Demo: Test Extraction with and without Examples ────────────────────────

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

async function runExtractionWithExamples() {
  console.log('Task 4.2 / Scenario 6 -- Extraction with Few-Shot Examples\n');

  const examplesPrompt = formatExtractionExamples();

  const systemPrompt = `You are a document extraction agent. Extract structured information
from documents using the provided tool. Follow the patterns shown in the examples exactly.
When a field is not present in the source document, return null -- NEVER fabricate values.

${examplesPrompt}`;

  console.log('Extracting from test document with few-shot examples...\n');
  console.log(`Document:\n${testDocument.trim()}\n`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: [documentExtractionTool],
    tool_choice: { type: 'tool', name: 'extract_document_info' },
    messages: [
      {
        role: 'user',
        content: `Extract structured information from this document:\n\n${testDocument}`,
      },
    ],
  });

  // Extract the tool_use result
  const toolUseBlock = response.content.find(b => b.type === 'tool_use');
  if (toolUseBlock) {
    console.log('Extraction result (via tool_use):');
    console.log(JSON.stringify(toolUseBlock.input, null, 2));

    // ── Validate key extraction behaviors ──────────────────────────────
    console.log('\n--- Validation ---');
    const input = toolUseBlock.input;

    // Check conflict detection
    const totalValue = input.monetary_values?.find(
      v => v.label?.toLowerCase().includes('total') || v.label?.toLowerCase().includes('estimated')
    );
    if (totalValue) {
      const calculatedTotal = 6 * 15000 + 20000; // 6 months * $15k + $20k bonus = $110k
      console.log(`Stated total: $${totalValue.stated_value}`);
      console.log(`Expected calculated: $${calculatedTotal} (6 x $15,000 + $20,000 bonus)`);
      console.log(`Conflict detected: ${totalValue.conflict_detected}`);
      console.log(
        totalValue.conflict_detected
          ? 'PASS: Model correctly identified the discrepancy'
          : 'NOTE: Model may have interpreted "estimated" as approximate, which is also reasonable'
      );
    }

    // Check for null fields (no author for a contract)
    console.log(`\nAuthor field: ${input.author === null ? 'null (CORRECT)' : input.author + ' (check if appropriate)'}`);
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
