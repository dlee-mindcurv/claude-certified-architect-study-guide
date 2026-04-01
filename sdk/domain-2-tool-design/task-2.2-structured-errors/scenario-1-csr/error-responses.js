/**
 * Scenario 1 (CSR Agent) — Structured Error Handling for All 4 CSR Tools
 *
 * Exam relevance: Task 2.2 (Structured errors for MCP tools)
 *
 * This module demonstrates the complete set of structured error responses
 * returned by the CSR tools. Each error includes:
 * - isError: true (MCP flag signaling tool failure)
 * - errorCategory: transient | validation | business | permission
 * - isRetryable: boolean (prevents wasted retry attempts)
 * - message: human-readable description for the agent
 *
 * The agent uses these fields to choose the correct recovery strategy:
 * - transient → retry automatically with backoff
 * - validation → fix input and retry (different input = new call)
 * - business → explain policy to user, do NOT retry
 * - permission → verify identity or escalate to human agent
 */

import {
  createErrorResponse,
  createSuccessResponse,
  ERROR_CATEGORIES,
} from '../../../../shared/schemas/error-response.js';

// ─── get_customer Error Responses ──────────────────────────────────────────

export const customerErrors = {
  // Transient: database temporarily unavailable (auto-retry)
  databaseUnavailable: () =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.TRANSIENT,
      isRetryable: true,
      message: 'Customer database temporarily unavailable. Please retry.',
    }),

  // Validation: no identifier provided
  missingIdentifier: () =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.VALIDATION,
      isRetryable: false,
      message:
        'Either email or customer_id is required. ' +
        'Accepted formats: email address (user@example.com) or customer ID (C-XXXX).',
    }),

  // Validation: customer not found by email
  emailNotFound: (email) =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.VALIDATION,
      isRetryable: false,
      message: `No customer found with email: ${email}. Verify the email address with the customer.`,
    }),

  // Validation: customer not found by ID
  idNotFound: (customerId) =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.VALIDATION,
      isRetryable: false,
      message: `No customer found with ID: ${customerId}. Customer IDs use format C-XXXX.`,
    }),

  // Success: single customer match
  found: (customer) => createSuccessResponse(customer),

  // Success: multiple matches (ambiguous)
  multipleMatches: (customers) =>
    createSuccessResponse({
      multiple_matches: customers,
      disambiguation_needed: true,
      message: 'Multiple customers found. Ask for email or customer ID to disambiguate.',
    }),
};

// ─── lookup_order Error Responses ──────────────────────────────────────────

export const orderErrors = {
  // Validation: missing required fields
  missingFields: () =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.VALIDATION,
      isRetryable: false,
      message:
        'Both order_id and customer_id are required. ' +
        'Call get_customer first to obtain the customer ID.',
    }),

  // Validation: order not found
  orderNotFound: (orderId) =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.VALIDATION,
      isRetryable: false,
      message: `No order found with ID: ${orderId}. Order IDs use format ORD-XXXX.`,
    }),

  // Permission: order belongs to a different customer
  ownershipMismatch: (orderId, customerId) =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.PERMISSION,
      isRetryable: false,
      message:
        `Order ${orderId} does not belong to customer ${customerId}. ` +
        'Verify the customer identity before retrying.',
    }),

  // Success: order found and ownership verified
  found: (order) => createSuccessResponse(order),
};

// ─── process_refund Error Responses ────────────────────────────────────────

export const refundErrors = {
  // Validation: order not found
  orderNotFound: (orderId) =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.VALIDATION,
      isRetryable: false,
      message: `No order found with ID: ${orderId}. Verify the order number.`,
    }),

  // Permission: order belongs to a different customer
  ownershipMismatch: (orderId, customerId) =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.PERMISSION,
      isRetryable: false,
      message:
        `Order ${orderId} does not belong to customer ${customerId}. ` +
        'Cannot process refund for another customer\'s order.',
    }),

  // Business: order not in refundable status
  notDelivered: (orderId, currentStatus) =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.BUSINESS,
      isRetryable: false,
      message:
        `Order ${orderId} is in "${currentStatus}" status. ` +
        'Only delivered orders can be refunded. ' +
        (currentStatus === 'shipped'
          ? 'The order is still in transit — the customer can request a refund once delivered.'
          : currentStatus === 'pending'
            ? 'The order has not shipped yet — suggest cancellation instead of refund.'
            : `Current status "${currentStatus}" does not qualify for refund.`),
    }),

  // Business: refund amount exceeds order total
  amountExceedsTotal: (amount, orderTotal) =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.BUSINESS,
      isRetryable: false,
      message:
        `Refund amount $${amount.toFixed(2)} exceeds order total $${orderTotal.toFixed(2)}. ` +
        `Maximum refund is $${orderTotal.toFixed(2)}.`,
    }),

  // Success: refund processed (may need approval)
  processed: (refund) => createSuccessResponse(refund),

  // Success: refund pending human approval (amount > $100)
  pendingApproval: (refund) =>
    createSuccessResponse({
      ...refund,
      note:
        'Refund exceeds $100 and requires human approval. ' +
        'The customer will be notified within 5 business days.',
    }),
};

// ─── escalate_to_human Error Responses ─────────────────────────────────────

export const escalationErrors = {
  // Validation: missing required fields
  missingSummary: () =>
    createErrorResponse({
      errorCategory: ERROR_CATEGORIES.VALIDATION,
      isRetryable: false,
      message: 'issue_summary and priority are required for escalation.',
    }),

  // Success: escalation ticket created
  created: (ticket) => createSuccessResponse(ticket),
};

// ─── Error Handling Decision Matrix ────────────────────────────────────────
// This matrix summarizes the agent's recovery strategy for each error.
// Use this as a reference when building the error handling section of
// the system prompt.

export const errorRecoveryMatrix = {
  transient: {
    strategy: 'Retry automatically with backoff',
    maxRetries: 2,
    agentAction: 'Wait and retry the same call',
    userMessage: 'Apologize for brief delay, assure working on it',
  },
  validation: {
    strategy: 'Fix input and make a new call',
    maxRetries: 0, // Different input = new call, not retry
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
