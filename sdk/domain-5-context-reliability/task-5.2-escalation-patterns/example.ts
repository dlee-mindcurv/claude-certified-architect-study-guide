/**
 * Task 5.2 -- Escalation Patterns with Explicit Criteria (Agent SDK)
 *
 * Exam relevance:
 * - Explicit escalation triggers vs. unreliable proxies (sentiment, confidence)
 * - Few-shot examples in system prompt for each escalation type
 * - Immediate escalation for customer requests vs. resolution for capability matches
 * - Anti-patterns: sentiment analysis, confidence thresholds, heuristic selection
 *
 * EXAM KEY CONCEPT:
 *   Escalation criteria are most effective when encoded as few-shot examples
 *   showing the BOUNDARY between "resolve" and "escalate." Each example includes
 *   reasoning so Claude can generalize to new cases. Do NOT use sentiment or
 *   confidence scores for escalation decisions.
 *
 * This example uses query() with an escalation-aware system prompt.
 * The escalation decision is driven by prompt engineering (few-shot examples),
 * not by programmatic confidence scores.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../../shared/tools/csr-tools.js';

// ─── Enhanced System Prompt with Escalation Few-Shot Examples ─────────────────
//
// EXAM KEY CONCEPT: Each few-shot example shows the boundary between resolve
// and escalate, including the reasoning. This is more reliable than sentiment
// analysis or model confidence scores.

const escalationSystemPrompt = `You are a customer support resolution agent. Your goal is 80%+ first-contact resolution while knowing when to escalate.

## Escalation Criteria

### Trigger 1: Customer Explicitly Requests Human Agent
- Honor IMMEDIATELY -- do not investigate first
- Do not try to resolve the issue before escalating
- Include whatever context you have gathered so far in the handoff

### Trigger 2: Policy Gap or Exception
- The customer's request falls outside your defined capabilities
- Examples: competitor price matching, warranty exceptions, account-level changes
- Escalate rather than deny -- a human agent may have authority for exceptions

### Trigger 3: Inability to Progress
- All tools failed, missing info, no matching workflow
- You have tried reasonable alternatives before escalating

### When NOT to Escalate
- Issue is within your capability (standard return, order status, tracking)
- Customer is frustrated but the issue is resolvable
- Only escalate a frustrated customer if they explicitly ask for a human

## Few-Shot Escalation Examples

### Example 1: RESOLVE -- Standard return with evidence
Customer: "I received a damaged headphone set from order ORD-5001. I have photos."
Correct action: Verify customer -> Look up order -> Process refund
Reasoning: Standard damage claim is within policy. Resolve directly.

### Example 2: ESCALATE -- Policy exception (competitor price matching)
Customer: "I saw this item cheaper on Amazon. Can you match their price?"
Correct action: Escalate with policy_exception reason
Reasoning: Competitor matching is a policy gap. Escalate rather than deny.

### Example 3: ESCALATE -- Customer explicitly requests human
Customer: "I'd like to speak with a real person please."
Correct action: Escalate immediately with customer_requested reason
Reasoning: Honor immediately WITHOUT investigating first.

### Example 4: RESOLVE -- Frustrated but resolvable
Customer: "This is ridiculous! My order was supposed to arrive yesterday!"
Correct action: Verify customer -> Look up order -> Provide tracking info
Reasoning: Delivery status is within capability. Frustration is not an escalation trigger.

## ANTI-PATTERNS -- Do NOT Use These for Escalation

### DO NOT use sentiment analysis
Negative sentiment + resolvable issue = resolve (not escalate)
Positive sentiment + policy gap = escalate (not resolve)

### DO NOT use confidence scores
Model confidence scores are not calibrated without labeled validation data.
Use explicit criteria, not probabilistic thresholds.

### DO NOT use heuristic selection for ambiguous matches
When multiple customers match, ask for clarification. Never pick "the most likely" one.`;

// ─── Run Escalation-Aware Agent via query() ─────────────────────────────────

async function runEscalationAwareAgent(userMessage) {
  console.log('\n' + '='.repeat(60));
  console.log('Task 5.2: Escalation Patterns');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  let finalText = '';

  // EXAM KEY CONCEPT: The escalation logic is entirely in the system prompt
  // (few-shot examples + explicit criteria). query() handles tool dispatch.
  for await (const message of query({
    prompt: userMessage,
    options: {
      systemPrompt: escalationSystemPrompt,
      mcpServers: { csr: csrServer },
      allowedTools: [
        'mcp__csr__get_customer',
        'mcp__csr__lookup_order',
        'mcp__csr__process_refund',
        'mcp__csr__escalate_to_human',
      ],
      maxTurns: 15,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  console.log(`\nAgent: ${finalText}`);
  return finalText;
}

// ─── Test Cases Covering All Escalation Types ─────────────────────────────────

async function main() {
  // Test 1: RESOLVE -- Standard return (should NOT escalate)
  console.log('\n\n>>> TEST 1: Standard Return (expect: RESOLVE) <<<');
  await runEscalationAwareAgent(
    "I received damaged headphones from order ORD-5001. My email is alice@example.com. " +
    "I'd like a refund please."
  );

  // Test 2: ESCALATE -- Customer requests human (should escalate IMMEDIATELY)
  console.log('\n\n>>> TEST 2: Customer Requests Human (expect: IMMEDIATE ESCALATION) <<<');
  await runEscalationAwareAgent(
    "I'd like to speak with a real person please."
  );

  // Test 3: ESCALATE -- Policy exception (competitor price matching)
  console.log('\n\n>>> TEST 3: Policy Exception (expect: ESCALATE) <<<');
  await runEscalationAwareAgent(
    "I saw this keyboard cheaper on Amazon for $99. Can you match their price? " +
    "My email is bob@example.com, order ORD-5003."
  );
}

main().catch(console.error);
