/**
 * Scenario 1 (CSR) -- Escalation Few-Shot Examples
 *
 * Exam relevance:
 * - Task 4.2: Few-shot examples for ambiguous escalation decisions
 * - Task 5.2: Escalation criteria in the CSR agent
 * - Examples demonstrate REASONING for each decision, enabling generalization
 *
 * These examples are designed for the CSR system prompt's escalation section.
 * They cover the four critical ambiguous cases:
 *   1. Standard issue that looks complex but is within policy (resolve)
 *   2. Policy gap requiring human judgment (escalate)
 *   3. Frustrated customer with resolvable issue (resolve, but escalate if they insist)
 *   4. Ambiguous request where policy is silent (escalate)
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.2-few-shot/scenario-1-csr/escalation-examples.js
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrSystemPrompt } from '../../../../shared/prompts/csr-system-prompt.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Escalation Few-Shot Examples ───────────────────────────────────────────
//
// EXAM KEY CONCEPT: These examples cover the BOUNDARY cases -- situations
// where the correct action is ambiguous. Clear-cut cases (order status check,
// explicit human request) do not need examples because Claude handles them
// correctly without guidance.
//
// Each example includes:
// - Customer message (input)
// - Correct action (decision)
// - Reasoning (WHY this decision is correct)

export const escalationExamples = [
  {
    id: 'resolve-standard-return',
    customerMessage:
      'I received a damaged headphone set from order ORD-5001. I have photos of the damage.',
    action: 'RESOLVE',
    reasoning:
      'Standard damage claim with photo evidence. Our return policy explicitly covers ' +
      'damaged items with evidence. Process the return/refund directly. No policy exception ' +
      'is needed, and involving a human agent would only add unnecessary wait time for the customer.',
    tools_to_use: ['get_customer', 'lookup_order', 'process_refund'],
    category: 'within-policy',
  },
  {
    id: 'escalate-policy-gap',
    customerMessage:
      'I saw this exact laptop on Amazon for $200 less. Can you match their price? ' +
      "I've been a loyal customer for 3 years.",
    action: 'ESCALATE',
    reasoning:
      'Our price-matching policy only covers our own website price history (e.g., if we ' +
      'drop the price within 30 days of purchase). Competitor price matching is not covered ' +
      'by any existing policy. This is a policy gap -- not a clear denial. Escalating allows ' +
      'a human agent to make a judgment call about customer retention vs. margin, especially ' +
      'given the customer mentions loyalty.',
    tools_to_use: ['get_customer', 'escalate_to_human'],
    category: 'policy-gap',
  },
  {
    id: 'resolve-frustrated-resolvable',
    customerMessage:
      'This is absolutely ridiculous! I ordered this TWO WEEKS ago and it still has not ' +
      'arrived. Your shipping is terrible. I want answers NOW.',
    action: 'RESOLVE',
    reasoning:
      'The customer is frustrated, but the underlying issue -- shipping delay -- is within ' +
      'our capability to investigate and resolve. The correct approach is: (1) acknowledge ' +
      'the frustration empathetically, (2) look up the order and tracking information, ' +
      '(3) provide a concrete update and offer a resolution (expedited re-ship or partial ' +
      'refund). Only escalate if, AFTER receiving information and a resolution offer, the ' +
      'customer explicitly requests a human agent.',
    tools_to_use: ['get_customer', 'lookup_order'],
    category: 'frustrated-but-resolvable',
  },
  {
    id: 'escalate-ambiguous-policy-silent',
    customerMessage:
      'I bought a gift for someone and they want to exchange it, but the item I bought ' +
      'was on clearance and the replacement they want is full price. Can you do the ' +
      'exchange and just charge me the difference?',
    action: 'ESCALATE',
    reasoning:
      'This request involves multiple policy intersections: gift exchanges, clearance-to-' +
      'regular-price conversions, and partial payment processing. Our policy is silent on ' +
      'whether a clearance-to-full-price exchange is permitted and how the price difference ' +
      'should be handled. Making an incorrect assumption could either cost the company money ' +
      '(eating the difference) or frustrate the customer (refusing a reasonable request). ' +
      'Escalate so a human can apply judgment.',
    tools_to_use: ['get_customer', 'escalate_to_human'],
    category: 'policy-silent',
  },
];

// ─── Format Examples for Prompt Injection ───────────────────────────────────

/**
 * Format escalation examples as a prompt section.
 *
 * EXAM KEY CONCEPT: The format includes reasoning as a first-class field,
 * not just input -> output. This teaches Claude to reason about novel
 * situations using the same decision framework.
 */
export function formatEscalationExamples(examples = escalationExamples) {
  let prompt = '## Escalation Decision Examples\n\n';

  for (const ex of examples) {
    prompt += `### Example: ${ex.action} (${ex.category})\n`;
    prompt += `Customer: "${ex.customerMessage}"\n`;
    prompt += `Action: ${ex.action}\n`;
    prompt += `Reasoning: ${ex.reasoning}\n`;
    prompt += `Tools: ${ex.tools_to_use.join(' -> ')}\n\n`;
  }

  return prompt;
}

// ─── Demo: Test with Novel Ambiguous Cases ──────────────────────────────────

const novelTestCases = [
  {
    id: 'novel-partial-refund-dispute',
    message:
      'I returned an item two weeks ago and was told I would get a full refund, but I ' +
      'only received a partial refund. The restocking fee was not mentioned at checkout.',
    expectedAction: 'ESCALATE',
    explanation: 'Restocking fee policy dispute -- customer claims it was not disclosed.',
  },
  {
    id: 'novel-warranty-extension',
    message:
      'My laptop broke down just one week after the warranty expired. Can you make an exception?',
    expectedAction: 'ESCALATE',
    explanation: 'Warranty exception request -- policy gap, requires human judgment.',
  },
  {
    id: 'novel-standard-tracking',
    message:
      'Where is my order ORD-7823? The tracking page is not loading.',
    expectedAction: 'RESOLVE',
    explanation: 'Standard order tracking inquiry -- fully within agent capability.',
  },
];

async function testEscalationDecisions() {
  console.log('Task 4.2 / Scenario 1 -- Escalation Few-Shot Examples\n');
  console.log('Testing novel cases against the few-shot-enhanced prompt.\n');

  // Build the prompt with few-shot examples
  const systemPrompt = csrSystemPrompt;
  const examplesSection = formatEscalationExamples();

  for (const testCase of novelTestCases) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Test: ${testCase.id}`);
    console.log(`Customer: "${testCase.message}"`);
    console.log(`Expected: ${testCase.expectedAction} (${testCase.explanation})`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${examplesSection}\n\n## Current Customer Message\n\n"${testCase.message}"\n\nProvide your decision (RESOLVE or ESCALATE) and your reasoning. Reference which example's reasoning framework applies to this situation.`,
        },
      ],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    console.log(`\nAgent decision:\n${text}`);
  }
}

async function main() {
  await testEscalationDecisions();

  console.log(`\n${'='.repeat(60)}`);
  console.log('KEY TAKEAWAYS FOR THE EXAM');
  console.log('='.repeat(60));
  console.log(`
1. Few-shot examples are most valuable for AMBIGUOUS cases, not clear-cut ones.
2. Each example includes REASONING that teaches a decision framework.
3. Novel cases are handled by applying the reasoning from the closest example.
4. The examples cover four boundary categories:
   - Within policy (resolve)
   - Policy gap (escalate)
   - Frustrated but resolvable (resolve, escalate if they insist)
   - Policy silent (escalate)
`);
}

main().catch(console.error);
