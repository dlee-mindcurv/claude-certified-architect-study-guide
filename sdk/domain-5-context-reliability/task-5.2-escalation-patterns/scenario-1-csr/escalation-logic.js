/**
 * Scenario 1: CSR Escalation Logic — Complete Implementation
 *
 * Exam relevance (Task 5.2):
 * - Three escalation trigger types: customer_requested, policy_exception, unable_to_resolve
 * - Immediate vs. deferred escalation patterns
 * - Disambiguation for multiple customer matches (ask, never guess)
 * - Structured handoff summary for human agent continuity
 * - Anti-patterns: sentiment analysis, confidence thresholds, heuristic selection
 *
 * This module provides:
 * 1. Escalation criteria evaluation (programmatic + prompt-based)
 * 2. Handoff summary construction using the shared schema
 * 3. Disambiguation handling for multi-match customer lookups
 * 4. Full agentic loop with escalation awareness
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../../../shared/tools/csr-tools.js';
import { handoffSummarySchema } from '../../../../shared/schemas/handoff-summary.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 15;

// ─── Escalation Types ─────────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Escalation reasons are explicit categories, not scores.
// Each reason maps to specific handling behavior and priority.

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

## Tools
- get_customer: Look up customer by email or customer ID (call FIRST)
- lookup_order: Look up order by order number (requires verified customer ID)
- process_refund: Process refunds for delivered orders (requires verified customer ID)
- escalate_to_human: Escalate to human agent

## Workflow Rules
1. ALWAYS call get_customer before lookup_order or process_refund
2. If multiple customers match, ask for email or customer ID -- NEVER select heuristically
3. Refunds over $100 automatically get pending_approval status (system-managed)

## Escalation Decision Framework

### ESCALATE IMMEDIATELY (do not investigate first):
- Customer explicitly requests a human agent
- Customer says "let me speak to a manager/supervisor/person"
- Do NOT offer alternatives or try to resolve before escalating

### ESCALATE AFTER INVESTIGATION:
- Issue requires a policy exception (e.g., competitor price matching, warranty extension)
- All available tools have failed or returned errors after retries
- Issue requires capabilities outside your toolset

### DO NOT ESCALATE:
- Standard return/refund (even for high values -- the system manages approval)
- Order status inquiry (even with frustrated customer)
- Customer is frustrated but the underlying issue matches your capabilities
- Refund returns pending_approval -- this is normal workflow, not a failure

## Few-Shot Examples

### 1. RESOLVE: Standard return
Customer: "My headphones from ORD-5001 are broken. Email: alice@example.com"
Action: get_customer -> lookup_order -> process_refund
Why resolve: Damage return is standard workflow. The tools can handle it.

### 2. ESCALATE IMMEDIATELY: Customer requests human
Customer: "I appreciate the help but I'd really prefer to speak to a person."
Action: escalate_to_human immediately
Why escalate: Explicit human request. Honor it. Do not investigate first.
Why NOT resolve: The customer's preference overrides your capability.

### 3. ESCALATE: Policy exception
Customer: "Amazon has this for $30 less. Can you price match?"
Action: escalate_to_human with policy_exception reason
Why escalate: Competitor price matching is outside policy scope.
Why NOT deny: A manager may approve an exception. Let the human decide.

### 4. RESOLVE: Frustrated customer with solvable issue
Customer: "I'm SO frustrated! Where is my package?! This always happens!"
Action: get_customer -> lookup_order -> provide tracking info
Why resolve: Delivery tracking is within capability. Frustration is not an escalation trigger.
Why NOT escalate: The issue (where is my package) has a clear resolution path.

### 5. ASK: Multiple customer matches
Customer: "Hi, I'm Alice Johnson."
get_customer result: { multiple_matches: [{id: "C-1001", ...}, {id: "C-1003", ...}] }
Action: "I found multiple accounts under that name. Could you provide your email address or customer ID?"
Why ask: Acting on the wrong account is worse than asking one extra question.
Why NOT guess: Heuristic selection (newest account, highest tier) risks wrong-account errors.

### 6. RESOLVE: High-value refund (system-managed approval)
Customer: "I need to return my $149.99 keyboard (ORD-5003). Email: bob@example.com"
Action: get_customer -> lookup_order -> process_refund (returns pending_approval)
Why resolve: The system automatically routes high-value refunds for approval.
Why NOT escalate: pending_approval is expected behavior, not a failure state.

## CRITICAL ANTI-PATTERNS — Do Not Use These

1. SENTIMENT ANALYSIS: "Customer sounds angry, so escalate"
   Wrong because: Angry + solvable = resolve. Polite + policy gap = escalate.

2. CONFIDENCE SCORES: "I'm only 60% confident, so escalate"
   Wrong because: Without calibrated validation data, confidence scores are meaningless numbers.

3. HEURISTIC SELECTION: "Two Alice Johnsons found, pick the Gold tier one"
   Wrong because: You might process a refund for the wrong customer.

## Handoff Summary Format
When escalating, use escalate_to_human with:
- customer_id: verified ID if available
- issue_summary: one-line description
- actions_taken: list of what you already tried
- recommended_action: what the human should do next
- priority: based on escalation type and customer tier`;

// ─── Escalation Priority Mapping ──────────────────────────────────────────────

/**
 * Determine escalation priority based on reason and customer context.
 *
 * EXAM NOTE: Priority is determined by escalation REASON and customer TIER,
 * not by sentiment or urgency language. This is a deterministic mapping,
 * not a probabilistic assessment.
 */
export function determineEscalationPriority(reason, customerTier) {
  // Customer request is always high priority (respect their preference)
  if (reason === ESCALATION_REASONS.CUSTOMER_REQUESTED) return 'high';

  // Platinum customers get elevated priority
  if (customerTier === 'platinum') return 'high';

  // Policy exceptions are medium (require human judgment)
  if (reason === ESCALATION_REASONS.POLICY_EXCEPTION) return 'medium';

  // Unable to resolve depends on whether customer was identified
  if (reason === ESCALATION_REASONS.UNABLE_TO_RESOLVE) return 'medium';

  return 'medium';
}

// ─── Handoff Summary Builder ──────────────────────────────────────────────────

/**
 * Build a structured handoff summary for the human agent.
 *
 * EXAM KEY CONCEPT: The handoff summary must contain enough context that
 * the human agent can resolve the issue WITHOUT reading the full transcript.
 * This maps to the handoffSummarySchema defined in shared/schemas/.
 */
export function buildHandoffSummary({
  customer,
  orders,
  actionsTaken,
  escalationReason,
  customerMessage,
  customerTier,
}) {
  return {
    customer: customer || { id: 'unknown', name: 'unidentified' },
    issue: {
      summary: customerMessage,
      category: inferCategory(customerMessage),
      root_cause: inferRootCause(escalationReason),
    },
    actions_taken: actionsTaken.map(a => ({
      action: typeof a === 'string' ? a : a.action,
      result: typeof a === 'string' ? 'completed' : (a.result || a.detail || 'completed'),
    })),
    relevant_orders: (orders || []).map(o => ({
      order_id: o.orderId,
      total: o.total,
      status: o.status,
    })),
    recommended_action: getRecommendedAction(escalationReason),
    refund_amount: null,
    escalation_reason: escalationReason,
    priority: determineEscalationPriority(escalationReason, customerTier),
  };
}

function inferCategory(message) {
  const lower = (message || '').toLowerCase();
  if (lower.includes('refund') || lower.includes('return') || lower.includes('damaged')) return 'return';
  if (lower.includes('price') || lower.includes('charge') || lower.includes('billing')) return 'billing';
  if (lower.includes('account') || lower.includes('password')) return 'account';
  if (lower.includes('broken') || lower.includes('defective')) return 'product';
  return 'other';
}

function inferRootCause(reason) {
  const causes = {
    [ESCALATION_REASONS.CUSTOMER_REQUESTED]: 'Customer prefers human assistance',
    [ESCALATION_REASONS.POLICY_EXCEPTION]: 'Request requires policy exception authority',
    [ESCALATION_REASONS.UNABLE_TO_RESOLVE]: 'Issue could not be resolved with available tools',
    [ESCALATION_REASONS.MULTIPLE_MATCH]: 'Customer identity could not be disambiguated',
    [ESCALATION_REASONS.HIGH_VALUE_REFUND]: 'Refund requires manager approval',
  };
  return causes[reason] || null;
}

function getRecommendedAction(reason) {
  const actions = {
    [ESCALATION_REASONS.CUSTOMER_REQUESTED]:
      'Customer requested human agent. Review context and assist directly.',
    [ESCALATION_REASONS.POLICY_EXCEPTION]:
      'Request falls outside standard policy. Evaluate for exception approval.',
    [ESCALATION_REASONS.UNABLE_TO_RESOLVE]:
      'Agent exhausted available resolution paths. Review and determine next steps.',
    [ESCALATION_REASONS.MULTIPLE_MATCH]:
      'Multiple customer records match. Verify identity through additional means.',
    [ESCALATION_REASONS.HIGH_VALUE_REFUND]:
      'High-value refund pending approval. Review order details and approve or deny.',
  };
  return actions[reason] || 'Review and resolve.';
}

// ─── Full Agentic Loop with Escalation Tracking ──────────────────────────────

async function runCsrWithEscalation(userMessage) {
  console.log('\n' + '='.repeat(60));
  console.log('Scenario 1: CSR Agent with Escalation Logic');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  const messages = [{ role: 'user', content: userMessage }];
  const context = {
    customer: null,
    orders: [],
    actionsTaken: [],
    escalation: null,
  };
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
      system: escalationPrompt,
      tools: csrToolDefinitions,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const finalText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      console.log(`\nAgent: ${finalText}`);

      const outcome = context.escalation ? 'ESCALATED' : 'RESOLVED';
      console.log(`\n--- ${outcome} in ${turnCount} turns ---`);

      if (context.escalation) {
        console.log('\nHandoff Summary:');
        console.log(JSON.stringify(context.escalation, null, 2));
      }

      return { text: finalText, context, outcome, turns: turnCount };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      for (const toolUse of toolUseBlocks) {
        console.log(`  Tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

        const result = executeCsrTool(toolUse.name, toolUse.input);
        const parsed = JSON.parse(result.content);

        // Track context for handoff summary
        if (!result.isError) {
          switch (toolUse.name) {
            case 'get_customer':
              if (parsed.id) {
                context.customer = {
                  id: parsed.id,
                  name: parsed.name,
                  tier: parsed.tier,
                  email: parsed.email,
                };
              }
              break;
            case 'lookup_order':
              context.orders.push({
                orderId: parsed.orderId,
                total: parsed.total,
                status: parsed.status,
              });
              break;
            case 'escalate_to_human':
              // Build the handoff summary when escalation happens
              context.escalation = buildHandoffSummary({
                customer: context.customer,
                orders: context.orders,
                actionsTaken: context.actionsTaken,
                escalationReason: toolUse.input.priority === 'high'
                  ? ESCALATION_REASONS.CUSTOMER_REQUESTED
                  : ESCALATION_REASONS.POLICY_EXCEPTION,
                customerMessage: userMessage,
                customerTier: context.customer?.tier,
              });
              console.log(`\n  >>> ESCALATION: ${parsed.ticketId} (${parsed.priority}) <<<`);
              break;
          }
        }

        context.actionsTaken.push(
          `${toolUse.name}: ${result.isError ? `Error - ${parsed.message}` : 'Success'}`
        );

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

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Testing all escalation types...\n');

  // Type 1: Standard resolve (no escalation)
  console.log('\n>>> TYPE 1: RESOLVE — Standard refund <<<');
  await runCsrWithEscalation(
    "My headphones from order ORD-5001 arrived broken. Email: alice@example.com. " +
    "Can I get a refund?"
  );

  // Type 2: Customer requests human (immediate escalation)
  console.log('\n>>> TYPE 2: ESCALATE — Customer requests human <<<');
  await runCsrWithEscalation(
    "I'd prefer to speak with a real person, please."
  );

  // Type 3: Policy exception (escalate after context gathering)
  console.log('\n>>> TYPE 3: ESCALATE — Policy exception <<<');
  await runCsrWithEscalation(
    "Hi, I found this keyboard cheaper at Best Buy. Can you match the $99 price? " +
    "My order is ORD-5003, email bob@example.com."
  );

  // Type 4: Frustrated but resolvable (resolve, not escalate)
  console.log('\n>>> TYPE 4: RESOLVE — Frustrated but solvable <<<');
  await runCsrWithEscalation(
    "This is TERRIBLE service! Where is my order ORD-5002?! " +
    "My email is alice@example.com. I want answers NOW!"
  );
}

main().catch(console.error);
