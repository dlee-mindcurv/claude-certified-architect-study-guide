/**
 * Task 5.2 — Escalation Patterns with Explicit Criteria
 *
 * Exam relevance:
 * - Explicit escalation triggers vs. unreliable proxies (sentiment, confidence)
 * - Few-shot examples in system prompt for each escalation type
 * - Immediate escalation for customer requests vs. resolution for capability matches
 * - Disambiguation pattern for multiple customer matches
 *
 * This example demonstrates:
 * 1. System prompt with few-shot escalation examples for each trigger type
 * 2. Logic for handling customer-request escalation vs. policy exceptions
 * 3. Disambiguation pattern: ask for identifiers, never guess
 * 4. Why NOT to use sentiment analysis or confidence scores
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../../shared/tools/csr-tools.js';
import { handoffSummarySchema } from '../../../shared/schemas/handoff-summary.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 15;

// ─── Enhanced System Prompt with Escalation Few-Shot Examples ─────────────────
//
// EXAM KEY CONCEPT: Escalation criteria are most effective when encoded as
// few-shot examples showing the BOUNDARY between "resolve" and "escalate."
// Each example includes the reasoning so Claude can generalize to new cases.

const escalationSystemPrompt = `You are a customer support resolution agent. Your goal is 80%+ first-contact resolution while knowing when to escalate.

## Available Tools
- get_customer: Look up customer by email or customer ID
- lookup_order: Look up order details by order number
- process_refund: Process refunds for delivered orders
- escalate_to_human: Escalate to human agent when appropriate

## Critical Rules
1. ALWAYS verify customer identity via get_customer BEFORE any order lookups
2. If get_customer returns multiple matches, ask the customer for their email or customer ID -- do NOT guess or use heuristics to select
3. Refunds over $100 require human approval (process_refund returns pending_approval)

## Escalation Criteria

### Trigger 1: Customer Explicitly Requests Human Agent
- Honor IMMEDIATELY -- do not investigate first
- Do not try to resolve the issue or offer alternatives before escalating
- Include whatever context you have gathered so far in the handoff

### Trigger 2: Policy Gap or Exception
- The customer's request falls outside your defined capabilities
- Examples: competitor price matching, warranty exceptions, account-level changes
- Escalate rather than deny outright -- a human agent may have authority for exceptions

### Trigger 3: Inability to Progress
- You have investigated but cannot resolve (all tools failed, missing info, no matching workflow)
- You have tried reasonable alternatives before escalating

### When NOT to Escalate
- The issue is within your capability (standard return, order status, tracking info)
- The customer is frustrated but the issue is resolvable -- acknowledge frustration, offer resolution
- Only escalate a frustrated customer if they explicitly ask for a human after your resolution attempt

## Few-Shot Escalation Examples

### Example 1: RESOLVE — Standard return with evidence
Customer: "I received a damaged headphone set from order ORD-5001. I have photos."
Correct action: Verify customer -> Look up order -> Process refund for damaged item
Reasoning: Standard damage claim with evidence is within policy. Resolve directly. Do NOT escalate just because the customer mentions damage.

### Example 2: ESCALATE — Policy exception (competitor price matching)
Customer: "I saw this item cheaper on Amazon. Can you match their price?"
Correct action: Escalate to human with policy_exception reason
Reasoning: Price matching policy covers own-site adjustments only. Competitor matching is a policy gap. Escalate rather than deny -- a manager may approve an exception.

### Example 3: ESCALATE — Customer explicitly requests human
Customer: "I'd like to speak with a real person please."
Correct action: Escalate immediately with customer_requested reason
Reasoning: Customer explicitly requested a human. Honor immediately WITHOUT investigating first. Do not ask "Can I help you with something first?" -- that ignores their stated preference.

### Example 4: RESOLVE — Frustrated but resolvable
Customer: "This is ridiculous! My order was supposed to arrive yesterday! I want to talk to someone!"
Correct action: Verify customer -> Look up order -> Provide tracking/delivery info. If customer reiterates human request after your response, THEN escalate.
Reasoning: The underlying issue (delivery status) is within capability. "I want to talk to someone" in context of frustration is different from a standalone "I'd like to speak with a person." Acknowledge the frustration, provide information. Only escalate if they persist.

### Example 5: ESCALATE — Multiple matches requiring disambiguation
Customer: "Hi, I'm Alice Johnson and I need help with my order."
Tool result: get_customer returns 2 matches for "Alice Johnson"
Correct action: Ask the customer for their email address or customer ID to disambiguate
Reasoning: NEVER use heuristics (most recent account, highest tier, etc.) to guess which customer. The cost of one extra question is far lower than the cost of acting on the wrong account.

### Example 6: RESOLVE — High-value refund (system handles approval)
Customer: "I need a full refund for order ORD-5003, the keyboard doesn't work. My email is bob@example.com."
Correct action: Verify customer -> Look up order -> Process refund (system returns pending_approval)
Reasoning: High-value refunds ($149.99 > $100) get pending_approval status automatically. The SYSTEM handles the approval routing -- you still process it. This is NOT a reason to escalate.

## Anti-Patterns: What NOT to Use for Escalation

### DO NOT use sentiment analysis
Negative sentiment + resolvable issue = resolve (not escalate)
Positive sentiment + policy gap = escalate (not resolve)
Sentiment does not correlate with escalation need.

### DO NOT use confidence scores
Model confidence scores are not calibrated without labeled validation data.
A "0.7 confidence" does not mean a 70% probability of being correct.
Use explicit criteria, not probabilistic thresholds.

### DO NOT use heuristic selection for ambiguous matches
When multiple customers match, ask for clarification. Never pick "the most likely" one.`;

// ─── Handoff Summary Builder ──────────────────────────────────────────────────
//
// When escalating, provide structured context so the human agent can resolve
// without needing the full conversation transcript.

function buildHandoffContext(caseFacts, escalationReason, customerMessage) {
  return {
    customer: caseFacts.customer || { id: 'unknown', name: 'unidentified' },
    issue: {
      summary: customerMessage.substring(0, 200),
      category: categorizeIssue(customerMessage),
    },
    actions_taken: caseFacts.actionsTaken.map(a => ({
      action: a.action || a,
      result: a.detail || 'completed',
    })),
    relevant_orders: caseFacts.orders.map(o => ({
      order_id: o.orderId,
      total: o.total,
      status: o.status,
    })),
    recommended_action: getRecommendation(escalationReason),
    escalation_reason: escalationReason,
    priority: getPriority(escalationReason, caseFacts),
  };
}

function categorizeIssue(message) {
  const lower = message.toLowerCase();
  if (lower.includes('refund') || lower.includes('return')) return 'return';
  if (lower.includes('price') || lower.includes('billing')) return 'billing';
  if (lower.includes('account')) return 'account';
  return 'other';
}

function getRecommendation(reason) {
  const recommendations = {
    customer_requested: 'Customer requested human agent. Review context and assist directly.',
    policy_exception: 'Request falls outside standard policy. Evaluate for exception approval.',
    unable_to_resolve: 'Agent could not resolve after investigation. Review attempted actions.',
    multiple_match: 'Multiple customer matches found. Verify identity before proceeding.',
    high_value_refund: 'Refund pending manager approval. Review and approve or deny.',
  };
  return recommendations[reason] || 'Review and resolve.';
}

function getPriority(reason, caseFacts) {
  if (reason === 'customer_requested') return 'high';
  if (reason === 'policy_exception') return 'medium';
  if (caseFacts.customer?.tier === 'platinum') return 'high';
  return 'medium';
}

// ─── Agentic Loop with Escalation Awareness ───────────────────────────────────

async function runEscalationAwareAgent(userMessage) {
  console.log('\n' + '='.repeat(60));
  console.log('Task 5.2: Escalation Patterns');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  const messages = [{ role: 'user', content: userMessage }];
  const caseFacts = { customer: null, orders: [], actionsTaken: [], openIssues: [] };
  let turnCount = 0;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`[SAFETY] Max turns (${MAX_TURNS}) reached.`);
      break;
    }

    console.log(`\n--- Turn ${turnCount} ---`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: escalationSystemPrompt,
      tools: csrToolDefinitions,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const finalText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      console.log(`\nAgent: ${finalText}`);
      console.log(`\n--- Completed in ${turnCount} turns ---`);
      return { text: finalText, caseFacts, turns: turnCount };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      for (const toolUse of toolUseBlocks) {
        console.log(`  Tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

        const result = executeCsrTool(toolUse.name, toolUse.input);
        const parsed = JSON.parse(result.content);

        // Track tool results for case facts
        if (!result.isError) {
          if (toolUse.name === 'get_customer' && parsed.id) {
            caseFacts.customer = { id: parsed.id, name: parsed.name, tier: parsed.tier };
          }
          if (toolUse.name === 'lookup_order') {
            caseFacts.orders.push({ orderId: parsed.orderId, total: parsed.total, status: parsed.status });
          }
          if (toolUse.name === 'escalate_to_human') {
            console.log(`\n  >>> ESCALATION TRIGGERED <<<`);
            console.log(`  Ticket: ${parsed.ticketId}`);
            console.log(`  Priority: ${parsed.priority}`);
            console.log(`  Assigned to: ${parsed.assignedTo}`);
          }
        }

        caseFacts.actionsTaken.push({
          action: toolUse.name,
          detail: result.isError ? `Error: ${parsed.message}` : 'Success',
        });

        if (result.isError) {
          console.log(`    ERROR [${parsed.errorCategory}]: ${parsed.message}`);
        } else {
          console.log(`    OK: ${result.content.substring(0, 80)}...`);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    console.error(`Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }
}

// ─── Test Cases Covering All Escalation Types ─────────────────────────────────

async function main() {
  // Test 1: RESOLVE — Standard return (should NOT escalate)
  console.log('\n\n>>> TEST 1: Standard Return (expect: RESOLVE) <<<');
  await runEscalationAwareAgent(
    "I received damaged headphones from order ORD-5001. My email is alice@example.com. " +
    "I'd like a refund please."
  );

  // Test 2: ESCALATE — Customer requests human (should escalate IMMEDIATELY)
  console.log('\n\n>>> TEST 2: Customer Requests Human (expect: IMMEDIATE ESCALATION) <<<');
  await runEscalationAwareAgent(
    "I'd like to speak with a real person please."
  );

  // Test 3: ESCALATE — Policy exception (competitor price matching)
  console.log('\n\n>>> TEST 3: Policy Exception (expect: ESCALATE) <<<');
  await runEscalationAwareAgent(
    "I saw this keyboard cheaper on Amazon for $99. Can you match their price? " +
    "My email is bob@example.com, order ORD-5003."
  );

  // Test 4: RESOLVE — Frustrated but resolvable (should NOT escalate on frustration alone)
  console.log('\n\n>>> TEST 4: Frustrated but Resolvable (expect: RESOLVE) <<<');
  await runEscalationAwareAgent(
    "This is absolutely ridiculous! My order ORD-5002 was supposed to be here by now! " +
    "My email is alice@example.com."
  );
}

main().catch(console.error);
