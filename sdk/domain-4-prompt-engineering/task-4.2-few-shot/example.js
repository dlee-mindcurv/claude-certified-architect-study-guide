/**
 * Task 4.2 -- Few-Shot Examples for Consistent Output
 *
 * Exam relevance:
 * - Few-shot examples are the most effective single technique for consistency
 * - They demonstrate REASONING, not just input -> output mapping
 * - 2-4 targeted examples for ambiguous cases outperform dozens of trivial ones
 * - Scenarios 1 (CSR) and 6 (Data Extraction) both depend on this pattern
 *
 * This example demonstrates two applications:
 * 1. Escalation decisions with reasoning (CSR scenario)
 * 2. Extraction format with varied document structures (Extraction scenario)
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.2-few-shot/example.js
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Part 1: Escalation Few-Shot Examples ───────────────────────────────────
//
// EXAM KEY CONCEPT: Few-shot examples for ambiguous escalation decisions
// include the REASONING for each decision, not just the action. This enables
// Claude to generalize the reasoning framework to novel situations.

const escalationPrompt = `You are a customer support agent. Decide whether to resolve the issue yourself or escalate to a human agent.

## Few-Shot Examples

### Example 1: Resolve (standard return with evidence)
Customer: "I received a damaged headphone set from order ORD-5001. I have photos."
Decision: RESOLVE
Reasoning: This is a standard damage claim with photo evidence. Our policy covers
returns for damaged items. Process the return/refund directly -- no policy exception
is needed.

### Example 2: Escalate (policy gap)
Customer: "I saw this item cheaper on Amazon. Can you match their price?"
Decision: ESCALATE
Reasoning: Our price-matching policy only covers our own website's price history.
Competitor price matching is not explicitly covered -- this is a policy gap. Rather
than deny outright (which could damage the relationship), escalate so a human can
make a judgment call on whether to make an exception.

### Example 3: Resolve (frustrated but resolvable)
Customer: "This is absolutely ridiculous! I've been waiting two weeks for my order!"
Decision: RESOLVE
Reasoning: The customer is frustrated, but the underlying issue -- delivery delay --
is within our capability to investigate. Look up the order, provide tracking info,
and offer a resolution (expedited shipping, partial refund). Only escalate if the
customer explicitly requests a human AFTER receiving this information.

### Example 4: Escalate (ambiguous request, policy silent)
Customer: "I bought this as a gift and the recipient wants to exchange it for something
completely different. The original item was on sale but the new one isn't."
Decision: ESCALATE
Reasoning: This involves multiple policy intersections: gift exchanges, sale-to-regular
price differences, and potentially different product categories. Our policy is silent
on whether the price difference should be charged. Escalate rather than make an
incorrect assumption about pricing policy.

## Current Customer Message
`;

async function demonstrateEscalation() {
  console.log('='.repeat(60));
  console.log('PART 1: Escalation Decisions with Few-Shot Examples');
  console.log('='.repeat(60));

  // Test with an ambiguous case not covered by examples
  const ambiguousMessage = `I ordered a laptop bag but I realized it's also available in
your physical store near me for $10 less. Can I get the price adjusted? I don't want
to return and rebuy since that seems wasteful.`;

  console.log(`\nCustomer: "${ambiguousMessage}"\n`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `${escalationPrompt}${ambiguousMessage}\n\nProvide your decision (RESOLVE or ESCALATE) and reasoning.`,
      },
    ],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  console.log('Agent decision:', text);
  console.log(`
EXAM NOTE: Observe that Claude applies the reasoning FRAMEWORK from the
examples to a novel situation. The examples taught it:
- Own-site price adjustments are within policy (resolve)
- Competitor price matching is a policy gap (escalate)
- This case (online vs. physical store pricing) was not shown but Claude
  can reason about whether it falls within or outside policy.
`);
}

// ─── Part 2: Extraction Few-Shot Examples ───────────────────────────────────
//
// EXAM KEY CONCEPT: Extraction few-shot examples demonstrate:
// - How to handle MISSING fields (return null, not a guess)
// - Different document structures (narrative vs. tabular)
// - Ambiguous values (flag rather than guess)

const extractionPrompt = `Extract structured information from the provided document.
Return JSON conforming to the schema.

## Few-Shot Examples

### Example 1: Complete invoice (all fields present)
Input document:
"""
INVOICE #2025-001
Date: 2025-03-01
Bill To: Acme Corp
Items: Widget A x10 @ $25 = $250, Widget B x5 @ $42.50 = $212.50
Subtotal: $462.50, Tax (8%): $37.00, Total: $499.50
"""

Output:
{
  "document_type": "invoice",
  "title": "INVOICE #2025-001",
  "date": "2025-03-01",
  "entities": [{"name": "Acme Corp", "role": "client"}],
  "monetary_values": [
    {"label": "subtotal", "stated_value": 462.50, "calculated_value": 462.50, "conflict_detected": false},
    {"label": "tax", "stated_value": 37.00, "calculated_value": 37.00, "conflict_detected": false},
    {"label": "total", "stated_value": 499.50, "calculated_value": 499.50, "conflict_detected": false}
  ],
  "extraction_notes": null
}
Reasoning: All fields clearly present. Calculated values match stated values.

### Example 2: Receipt with missing fields (return null, do NOT fabricate)
Input document:
"""
Quick Mart
Some items purchased
Total: $23.47
Paid: Cash
"""

Output:
{
  "document_type": "receipt",
  "title": null,
  "date": null,
  "entities": [{"name": "Quick Mart", "role": "vendor"}],
  "monetary_values": [
    {"label": "total", "stated_value": 23.47, "calculated_value": null, "conflict_detected": false}
  ],
  "extraction_notes": "No date, no itemized line items, no receipt number. Title and date are null because they are not present in the source document."
}
Reasoning: Date and title are absent from the source. The correct output is null --
NOT a fabricated date or inferred title. The extraction_notes field explains what is
missing so downstream systems can request human review if needed.

### Example 3: Research paper with narrative format (different structure)
Input document:
"""
In their 2024 study published in Nature Climate Science (Vol 12, pp 234-251),
Dr. Kim and Dr. Patel found that sea surface temperatures increased by 0.8C
over the study period (2015-2023). The sample included 450 monitoring stations.
The authors thank the National Science Foundation (Grant #OCE-2401234).
"""

Output:
{
  "document_type": "research_paper",
  "title": null,
  "date": "2024",
  "entities": [
    {"name": "Dr. Kim", "role": "author"},
    {"name": "Dr. Patel", "role": "author"}
  ],
  "monetary_values": [],
  "extraction_notes": "Title not stated in excerpt -- only publication info. Date extracted as year only (no specific date provided). Grant number noted but not extracted as monetary value since amount is not stated."
}
Reasoning: This document is narrative format, not structured. The title is NOT
present in this excerpt (the publication name "Nature Climate Science" is the
journal, not the paper title). Returning null rather than guessing. The date is
only a year with no month/day.

## Document to Extract
`;

async function demonstrateExtraction() {
  console.log('\n' + '='.repeat(60));
  console.log('PART 2: Extraction with Few-Shot Examples');
  console.log('='.repeat(60));

  const testDocument = `
SERVICE AGREEMENT between DataFlow Inc and Nexus Corp.
Effective January 15, 2025. Monthly fee: $3,200 for 12 months.
Total contract value: $38,400.
Auto-renews annually unless 60-day notice given.
`;

  console.log(`\nDocument: "${testDocument.trim()}"\n`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `${extractionPrompt}"""
${testDocument}
"""

Return the extraction as JSON.`,
      },
    ],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  console.log('Extraction result:', text);
  console.log(`
EXAM NOTE: Observe how the few-shot examples influence this extraction:
- The contract has a stated total ($38,400) and an implied total (12 x $3,200 = $38,400)
  The examples taught Claude to compare calculated vs stated values.
- There is no explicit "title" -- the examples taught Claude to return null rather
  than fabricating "Service Agreement" as a title.
- Two entities are identified with appropriate roles, following the entity extraction
  pattern from the examples.
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.2 -- Few-Shot Examples for Consistent Output\n');
  console.log('Key insight: Few-shot examples teach REASONING, not just format.');
  console.log('They are most valuable for ambiguous cases where the correct');
  console.log('action requires judgment.\n');

  await demonstrateEscalation();
  await demonstrateExtraction();
}

main().catch(console.error);
