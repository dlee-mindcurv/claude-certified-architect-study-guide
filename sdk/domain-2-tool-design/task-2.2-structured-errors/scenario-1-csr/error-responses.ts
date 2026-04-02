/**
 * Scenario 1 (CSR Agent) — Structured Error Patterns for All 4 CSR Tools
 *
 * Exam relevance: Task 2.2 (Structured errors for MCP tools)
 *
 * EXAM KEY CONCEPT:
 *   Every tool error should include:
 *   - isError: true  (MCP flag signaling tool failure)
 *   - errorCategory:  transient | validation | business | permission
 *   - isRetryable:    boolean (prevents wasted retry attempts)
 *   - message:        human-readable description for the agent
 *
 *   The agent uses these fields to choose the correct recovery strategy.
 *
 * This module catalogs the structured error patterns returned by each
 * CSR tool(), showing how the agent SDK tool() implementations use
 * { isError: true } in their return values to signal failures.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Helper: MCP tool result formatters ───────────────────────────────────

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function err(errorCategory, message, isRetryable = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ errorCategory, isRetryable, message }) }],
    isError: true,   // EXAM KEY: this flag tells Claude the tool call failed
  };
}

// ─── get_customer Error Catalog ───────────────────────────────────────────

export const customerErrorPatterns = {
  // Transient: database temporarily unavailable (auto-retry)
  databaseUnavailable: () => err('transient', 'Customer database temporarily unavailable. Please retry.', true),

  // Validation: no identifier provided
  missingIdentifier: () => err('validation', 'Either email or customer_id is required. Formats: email or C-XXXX.'),

  // Validation: customer not found
  emailNotFound: (email) => err('validation', `No customer found with email: ${email}. Verify with the customer.`),
  idNotFound: (id) => err('validation', `No customer found with ID: ${id}. Customer IDs use format C-XXXX.`),
};

// ─── lookup_order Error Catalog ───────────────────────────────────────────

export const orderErrorPatterns = {
  // Validation: missing required fields
  missingFields: () => err('validation', 'Both order_id and customer_id required. Call get_customer first.'),

  // Validation: order not found
  orderNotFound: (orderId) => err('validation', `No order found: ${orderId}. Order IDs use format ORD-XXXX.`),

  // Permission: order belongs to a different customer
  ownershipMismatch: (orderId, customerId) =>
    err('permission', `Order ${orderId} does not belong to customer ${customerId}.`),
};

// ─── process_refund Error Catalog ─────────────────────────────────────────

export const refundErrorPatterns = {
  // Business: order not in refundable status
  notDelivered: (orderId, currentStatus) =>
    err('business', `Order ${orderId} is "${currentStatus}" — only delivered orders can be refunded.`),

  // Business: refund amount exceeds total
  amountExceedsTotal: (amount, total) =>
    err('business', `Refund $${amount} exceeds order total $${total}.`),

  // Permission: wrong customer
  ownershipMismatch: (orderId, customerId) =>
    err('permission', `Order ${orderId} does not belong to ${customerId}. Cannot process refund.`),
};

// ─── escalate_to_human Error Catalog ──────────────────────────────────────

export const escalationErrorPatterns = {
  // Validation: missing required fields
  missingSummary: () => err('validation', 'issue_summary and priority are required for escalation.'),
};

// ─── Error Recovery Matrix ────────────────────────────────────────────────
// EXAM KEY CONCEPT: This matrix maps error categories to agent strategies.
// Include a version of this in the system prompt so the agent knows how
// to handle each error type.

export const errorRecoveryMatrix = {
  transient: {
    strategy: 'Retry automatically with backoff',
    maxRetries: 2,
    agentAction: 'Wait and retry the same call',
    userMessage: 'Apologize for brief delay, assure working on it',
  },
  validation: {
    strategy: 'Fix input and make a new call',
    maxRetries: 0,  // Different input = new call, not retry
    agentAction: 'Parse error message, correct the input format',
    userMessage: 'Ask customer for correct identifier if needed',
  },
  business: {
    strategy: 'Explain to user, do NOT retry',
    maxRetries: 0,
    agentAction: 'Read the business rule from the error message',
    userMessage: 'Explain the policy clearly, offer alternatives',
  },
  permission: {
    strategy: 'Verify identity or escalate',
    maxRetries: 0,
    agentAction: 'Re-verify customer ID, escalate if mismatch persists',
    userMessage: 'Ask customer to confirm their identity',
  },
};

// ─── Demonstration ────────────────────────────────────────────────────────

function demonstrateErrorPatterns() {
  console.log('Task 2.2 Scenario 1: CSR Error Response Patterns\n');

  console.log('--- get_customer errors ---');
  console.log(JSON.stringify(customerErrorPatterns.missingIdentifier(), null, 2));
  console.log(JSON.stringify(customerErrorPatterns.emailNotFound('unknown@test.com'), null, 2));

  console.log('\n--- lookup_order errors ---');
  console.log(JSON.stringify(orderErrorPatterns.ownershipMismatch('ORD-5001', 'C-1002'), null, 2));

  console.log('\n--- process_refund errors ---');
  console.log(JSON.stringify(refundErrorPatterns.notDelivered('ORD-5002', 'shipped'), null, 2));

  console.log('\n--- Recovery Matrix ---');
  for (const [category, strategy] of Object.entries(errorRecoveryMatrix)) {
    console.log(`  ${category}: ${strategy.strategy} (retries: ${strategy.maxRetries})`);
  }
}

// Run if executed directly
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;
if (isDirectExecution) {
  demonstrateErrorPatterns();
}
