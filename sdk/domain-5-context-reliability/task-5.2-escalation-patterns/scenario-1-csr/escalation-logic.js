/**
 * Scenario 1: CSR Escalation Logic -- Agent SDK Implementation
 *
 * Exam relevance (Task 5.2):
 * - Three escalation trigger types: customer_requested, policy_exception, unable_to_resolve
 * - Immediate vs. deferred escalation patterns
 * - Disambiguation for multiple customer matches (ask, never guess)
 * - Structured handoff summary for human agent continuity
 * - Anti-patterns: sentiment analysis, confidence thresholds, heuristic selection
 *
 * EXAM KEY CONCEPT:
 *   Escalation reasons are explicit CATEGORIES, not scores. Each reason maps
 *   to specific handling behavior and priority. The handoff summary must contain
 *   enough context that the human agent can resolve WITHOUT reading the full
 *   transcript.
 *
 * Uses query() with a comprehensive escalation prompt and hooks to track
 * escalation events.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../../../shared/tools/csr-tools.js';

// ─── Escalation Types ─────────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Escalation reasons are explicit categories, not scores.

export const ESCALATION_REASONS = {
  CUSTOMER_REQUESTED: 'customer_requested',
  POLICY_EXCEPTION: 'policy_exception',
  HIGH_VALUE_REFUND: 'high_value_refund',
  UNABLE_TO_RESOLVE: 'unable_to_resolve',
  MULTIPLE_MATCH: 'multiple_match',
};

// ─── System Prompt with Complete Escalation Criteria ──────────────────────────

const escalationPrompt = `You are a customer support resolution agent for an e-commerce company.

## Goal
Achieve 80%+ first-contact resolution. Escalate only when a clear trigger is met.

## Workflow Rules
1. ALWAYS call get_customer before lookup_order or process_refund
2. If multiple customers match, ask for email or customer ID -- NEVER select heuristically
3. Refunds over $100 automatically get pending_approval status (system-managed)

## Escalation Decision Framework

### ESCALATE IMMEDIATELY (do not investigate first):
- Customer explicitly requests a human agent
- Customer says "let me speak to a manager/supervisor/person"

### ESCALATE AFTER INVESTIGATION:
- Issue requires a policy exception (competitor price matching, warranty extension)
- All available tools have failed or returned errors after retries

### DO NOT ESCALATE:
- Standard return/refund (even for high values -- the system manages approval)
- Order status inquiry (even with frustrated customer)
- Customer is frustrated but the underlying issue matches your capabilities
- Refund returns pending_approval -- this is normal workflow, not a failure

## Few-Shot Examples

### 1. RESOLVE: Standard return
Customer: "My headphones from ORD-5001 are broken. Email: alice@example.com"
Action: get_customer -> lookup_order -> process_refund
Why: Damage return is standard workflow.

### 2. ESCALATE IMMEDIATELY: Customer requests human
Customer: "I'd prefer to speak to a person."
Action: escalate_to_human immediately
Why: Explicit human request. Honor it. Do not investigate first.

### 3. ESCALATE: Policy exception
Customer: "Amazon has this for $30 less. Can you price match?"
Action: escalate_to_human with policy_exception reason
Why: Competitor price matching is outside policy scope.

### 4. RESOLVE: Frustrated customer with solvable issue
Customer: "I'm SO frustrated! Where is my package?!"
Action: get_customer -> lookup_order -> provide tracking info
Why: Delivery tracking is within capability. Frustration is not a trigger.

### 5. ASK: Multiple customer matches
Customer: "Hi, I'm Alice Johnson."
get_customer result: multiple matches
Action: Ask for email or customer ID
Why: Acting on the wrong account is worse than asking one extra question.

## CRITICAL ANTI-PATTERNS

1. SENTIMENT ANALYSIS: "Customer sounds angry, so escalate"
   Wrong: Angry + solvable = resolve. Polite + policy gap = escalate.

2. CONFIDENCE SCORES: "I'm only 60% confident, so escalate"
   Wrong: Without calibrated validation data, confidence scores are meaningless.

3. HEURISTIC SELECTION: "Two Alice Johnsons found, pick the Gold tier one"
   Wrong: You might process a refund for the wrong customer.

## Handoff Summary
When escalating, use escalate_to_human with:
- customer_id, issue_summary, actions_taken, recommended_action, priority`;

// ─── Escalation Priority Mapping ──────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: Priority is determined by escalation REASON and customer
 * TIER, not by sentiment or urgency language.
 */
export function determineEscalationPriority(reason, customerTier) {
  if (reason === ESCALATION_REASONS.CUSTOMER_REQUESTED) return 'high';
  if (customerTier === 'platinum') return 'high';
  if (reason === ESCALATION_REASONS.POLICY_EXCEPTION) return 'medium';
  return 'medium';
}

// ─── Handoff Summary Builder ──────────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: The handoff summary must contain enough context that
 * the human agent can resolve WITHOUT reading the full transcript.
 */
export function buildHandoffSummary({ customer, orders, actionsTaken, escalationReason, customerMessage, customerTier }) {
  return {
    customer: customer || { id: 'unknown', name: 'unidentified' },
    issue: {
      summary: customerMessage,
      category: inferCategory(customerMessage),
    },
    actions_taken: actionsTaken.map(a => ({
      action: typeof a === 'string' ? a : a.action,
      result: typeof a === 'string' ? 'completed' : (a.detail || 'completed'),
    })),
    relevant_orders: (orders || []).map(o => ({
      order_id: o.orderId, total: o.total, status: o.status,
    })),
    recommended_action: getRecommendedAction(escalationReason),
    escalation_reason: escalationReason,
    priority: determineEscalationPriority(escalationReason, customerTier),
  };
}

function inferCategory(message) {
  const lower = (message || '').toLowerCase();
  if (lower.includes('refund') || lower.includes('return') || lower.includes('damaged')) return 'return';
  if (lower.includes('price') || lower.includes('billing')) return 'billing';
  if (lower.includes('account')) return 'account';
  return 'other';
}

function getRecommendedAction(reason) {
  const actions = {
    [ESCALATION_REASONS.CUSTOMER_REQUESTED]: 'Customer requested human agent. Review context and assist directly.',
    [ESCALATION_REASONS.POLICY_EXCEPTION]: 'Request falls outside standard policy. Evaluate for exception approval.',
    [ESCALATION_REASONS.UNABLE_TO_RESOLVE]: 'Agent exhausted available resolution paths. Review and determine next steps.',
    [ESCALATION_REASONS.MULTIPLE_MATCH]: 'Multiple customer records match. Verify identity through additional means.',
  };
  return actions[reason] || 'Review and resolve.';
}

// ─── Full Agent with Escalation Tracking ────────────────────────────────────

async function runCsrWithEscalation(userMessage) {
  console.log('\n' + '='.repeat(60));
  console.log('Scenario 1: CSR Agent with Escalation Logic');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  let finalText = '';
  let escalated = false;

  for await (const message of query({
    prompt: userMessage,
    options: {
      systemPrompt: escalationPrompt,
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
    // Track escalation events from tool use messages
    if (message.type === 'tool_result') {
      try {
        const data = JSON.parse(message.content);
        if (data.ticketId) {
          escalated = true;
          console.log(`\n  >>> ESCALATION: ${data.ticketId} (${data.priority}) <<<`);
        }
      } catch { /* not JSON or not escalation */ }
    }

    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  const outcome = escalated ? 'ESCALATED' : 'RESOLVED';
  console.log(`\nAgent: ${finalText}`);
  console.log(`\n--- ${outcome} ---`);

  return { text: finalText, outcome };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Testing all escalation types...\n');

  console.log('\n>>> TYPE 1: RESOLVE -- Standard refund <<<');
  await runCsrWithEscalation(
    "My headphones from order ORD-5001 arrived broken. Email: alice@example.com. Can I get a refund?"
  );

  console.log('\n>>> TYPE 2: ESCALATE -- Customer requests human <<<');
  await runCsrWithEscalation(
    "I'd prefer to speak with a real person, please."
  );

  console.log('\n>>> TYPE 3: ESCALATE -- Policy exception <<<');
  await runCsrWithEscalation(
    "Hi, I found this keyboard cheaper at Best Buy. Can you match the $99 price? " +
    "My order is ORD-5003, email bob@example.com."
  );

  console.log('\n>>> TYPE 4: RESOLVE -- Frustrated but solvable <<<');
  await runCsrWithEscalation(
    "This is TERRIBLE service! Where is my order ORD-5002?! " +
    "My email is alice@example.com. I want answers NOW!"
  );
}

main().catch(console.error);
