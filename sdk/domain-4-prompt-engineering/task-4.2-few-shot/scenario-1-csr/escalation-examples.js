/**
 * Scenario 1 (CSR) -- Escalation Few-Shot Examples
 *
 * Exam relevance:
 * - Task 4.2: Few-shot examples for ambiguous escalation decisions
 * - Task 5.2: Escalation criteria in the CSR agent
 * - Examples demonstrate REASONING for each decision, enabling generalization
 *
 * Uses Agent SDK query() with the CSR system prompt and few-shot escalation
 * examples injected into the prompt. Tests novel ambiguous cases against
 * the reasoning framework.
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.2-few-shot/scenario-1-csr/escalation-examples.js
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrSystemPrompt } from '../../../../shared/prompts/csr-system-prompt.js';

// ─── Escalation Few-Shot Examples ───────────────────────────────────────────
//
// EXAM KEY CONCEPT: These examples cover the BOUNDARY cases -- situations
// where the correct action is ambiguous. Clear-cut cases do not need examples.

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
      'a human agent to make a judgment call about customer retention vs. margin.',
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
      'our capability to investigate and resolve. Acknowledge frustration, look up the order, ' +
      'provide a concrete update and resolution offer. Only escalate if they reiterate preference for a human.',
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
      'whether a clearance-to-full-price exchange is permitted. Escalate so a human can apply judgment.',
    tools_to_use: ['get_customer', 'escalate_to_human'],
    category: 'policy-silent',
  },
];

// ─── Format Examples for Prompt ─────────────────────────────────────────────

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

// ─── Novel Test Cases ───────────────────────────────────────────────────────

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

// ─── Demo: Test with Agent SDK query() ──────────────────────────────────────

async function testEscalationDecisions() {
  console.log('Task 4.2 / Scenario 1 -- Escalation Few-Shot Examples\n');
  console.log('Testing novel cases against the few-shot-enhanced prompt.\n');

  const examplesSection = formatEscalationExamples();

  for (const testCase of novelTestCases) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Test: ${testCase.id}`);
    console.log(`Customer: "${testCase.message}"`);
    console.log(`Expected: ${testCase.expectedAction} (${testCase.explanation})`);

    // EXAM KEY CONCEPT: The CSR system prompt context + few-shot examples
    // are combined in a single query() prompt. Each test runs in isolation.
    const prompt = `${csrSystemPrompt}\n\n${examplesSection}\n\n## Current Customer Message\n\n"${testCase.message}"\n\nProvide your decision (RESOLVE or ESCALATE) and your reasoning. Reference which example's reasoning framework applies to this situation.`;

    let resultText = '';
    for await (const message of query({ prompt })) {
      if (message.type === 'result' && message.subtype === 'success') {
        resultText = message.result;
      }
    }

    console.log(`\nAgent decision:\n${resultText}`);
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
