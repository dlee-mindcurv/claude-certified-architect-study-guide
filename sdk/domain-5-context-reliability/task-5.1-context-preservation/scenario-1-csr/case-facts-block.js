/**
 * Scenario 1: CSR Case Facts Block — Complete Implementation
 *
 * Exam relevance (Task 5.1):
 * - Persistent case facts block injected at top of system prompt each turn
 * - Incremental fact extraction after every tool call
 * - Tool result trimming to conserve context tokens
 * - Handles all CSR tool types: get_customer, lookup_order, process_refund, escalate_to_human
 *
 * This module is designed to be imported by an agentic loop. It does NOT
 * contain the loop itself -- it provides the context management layer.
 */

import { csrSystemPrompt, csrCaseFactsTemplate } from '../../../../shared/prompts/csr-system-prompt.js';

// ─── Case Facts Data Structure ────────────────────────────────────────────────

/**
 * Creates an empty case facts object.
 *
 * EXAM NOTE: This structure is maintained OUTSIDE the conversation history.
 * It survives summarization because we re-inject it into the system prompt
 * before every API call.
 */
export function createCaseFacts() {
  return {
    customer: null,
    orders: [],
    actionsTaken: [],
    openIssues: [],
    refunds: [],
    escalations: [],
    turnCount: 0,
  };
}

// ─── Fact Extraction ──────────────────────────────────────────────────────────

/**
 * Extract key facts from a tool result and update the case facts.
 *
 * EXAM KEY CONCEPT: This runs after EVERY tool call, not just at the end.
 * Intermediate facts (like customer tier discovered during get_customer)
 * inform subsequent decisions (like whether a refund needs approval).
 *
 * @param {string} toolName - The tool that was called
 * @param {object} toolInput - The input passed to the tool
 * @param {object} rawResult - The raw tool result { content, isError? }
 * @param {object} caseFacts - The case facts to update (mutated in place)
 * @returns {object} The updated case facts
 */
export function extractFacts(toolName, toolInput, rawResult, caseFacts) {
  caseFacts.turnCount++;

  if (rawResult.isError) {
    const error = JSON.parse(rawResult.content);
    caseFacts.actionsTaken.push({
      action: `${toolName} call failed`,
      detail: error.message,
      category: error.errorCategory,
      retryable: error.isRetryable,
      turn: caseFacts.turnCount,
    });
    return caseFacts;
  }

  const data = JSON.parse(rawResult.content);

  switch (toolName) {
    case 'get_customer':
      return extractCustomerFacts(data, toolInput, caseFacts);
    case 'lookup_order':
      return extractOrderFacts(data, caseFacts);
    case 'process_refund':
      return extractRefundFacts(data, caseFacts);
    case 'escalate_to_human':
      return extractEscalationFacts(data, caseFacts);
    default:
      return caseFacts;
  }
}

function extractCustomerFacts(data, toolInput, caseFacts) {
  // Single customer match
  if (data.id) {
    caseFacts.customer = {
      id: data.id,
      name: data.name,
      email: data.email,
      tier: data.tier,
      accountStatus: data.accountStatus,
    };
    caseFacts.actionsTaken.push({
      action: 'Verified customer identity',
      detail: `${data.name} (${data.id}, ${data.tier} tier)`,
      turn: caseFacts.turnCount,
    });
    // Remove disambiguation open issue if it existed
    caseFacts.openIssues = caseFacts.openIssues.filter(
      i => i.type !== 'disambiguation'
    );
    return caseFacts;
  }

  // Multiple matches -- disambiguation required
  if (data.multiple_matches) {
    const matchSummaries = data.multiple_matches.map(
      m => `${m.name} (${m.id}, ${m.email})`
    );
    caseFacts.openIssues.push({
      type: 'disambiguation',
      description: `Multiple customers match: ${matchSummaries.join('; ')}`,
      matchCount: data.multiple_matches.length,
      turn: caseFacts.turnCount,
    });
    caseFacts.actionsTaken.push({
      action: 'Customer lookup returned multiple matches',
      detail: `${data.multiple_matches.length} matches found, need disambiguation`,
      turn: caseFacts.turnCount,
    });
    return caseFacts;
  }

  return caseFacts;
}

function extractOrderFacts(data, caseFacts) {
  const orderSummary = {
    orderId: data.orderId,
    customerId: data.customerId,
    total: data.total,
    status: data.status,
    deliveredAt: data.deliveredAt || null,
    trackingNumber: data.trackingNumber || null,
    orderDate: data.orderDate || null,
    itemCount: data.items?.length || 0,
    // Preserve item names for reference but not full details
    itemNames: data.items?.map(i => i.name) || [],
  };

  // Deduplicate: update if already seen, otherwise add
  const existingIdx = caseFacts.orders.findIndex(o => o.orderId === data.orderId);
  if (existingIdx >= 0) {
    caseFacts.orders[existingIdx] = orderSummary;
  } else {
    caseFacts.orders.push(orderSummary);
  }

  caseFacts.actionsTaken.push({
    action: `Looked up order ${data.orderId}`,
    detail: `$${data.total}, ${data.status}`,
    turn: caseFacts.turnCount,
  });

  return caseFacts;
}

function extractRefundFacts(data, caseFacts) {
  caseFacts.refunds.push({
    refundId: data.refundId,
    orderId: data.orderId,
    amount: data.amount,
    status: data.status,
    estimatedDays: data.estimatedProcessingDays,
    reason: data.reason,
    createdAt: data.createdAt,
  });

  caseFacts.actionsTaken.push({
    action: `Processed refund ${data.refundId}`,
    detail: `$${data.amount} for order ${data.orderId} (${data.status})`,
    turn: caseFacts.turnCount,
  });

  // If refund needs approval, add as open issue
  if (data.status === 'pending_approval') {
    caseFacts.openIssues.push({
      type: 'pending_approval',
      description: `Refund ${data.refundId} ($${data.amount}) awaiting manager approval`,
      turn: caseFacts.turnCount,
    });
  }

  // Clear refund-related open issues
  caseFacts.openIssues = caseFacts.openIssues.filter(
    i => i.type !== 'awaiting_refund'
  );

  return caseFacts;
}

function extractEscalationFacts(data, caseFacts) {
  caseFacts.escalations.push({
    ticketId: data.ticketId,
    priority: data.priority,
    issueSummary: data.issueSummary,
    assignedTo: data.assignedTo,
    createdAt: data.createdAt,
  });

  caseFacts.actionsTaken.push({
    action: `Escalated to human agent`,
    detail: `Ticket ${data.ticketId} (${data.priority} priority)`,
    turn: caseFacts.turnCount,
  });

  return caseFacts;
}

// ─── Case Facts Rendering ─────────────────────────────────────────────────────

/**
 * Render the case facts into a markdown block for system prompt injection.
 *
 * EXAM KEY CONCEPT: This block goes at the BEGINNING of the system prompt,
 * in the highest-attention zone of the context window. It uses explicit
 * section headers (## Current Case Facts) so Claude can locate it reliably.
 */
export function renderCaseFacts(caseFacts) {
  const lines = ['## Current Case Facts (verified this session)'];
  lines.push('');

  // Customer
  if (caseFacts.customer) {
    const c = caseFacts.customer;
    lines.push(`**Customer:** ${c.name} (${c.id}, ${c.tier} tier, ${c.email})`);
  } else {
    lines.push('**Customer:** Not yet identified');
  }

  // Orders
  if (caseFacts.orders.length > 0) {
    lines.push('');
    lines.push('**Orders discussed:**');
    for (const o of caseFacts.orders) {
      const parts = [`${o.orderId}: $${o.total}, ${o.status}`];
      if (o.deliveredAt) parts.push(`delivered ${o.deliveredAt}`);
      if (o.trackingNumber) parts.push(`tracking ${o.trackingNumber}`);
      if (o.itemNames.length > 0) parts.push(`items: ${o.itemNames.join(', ')}`);
      lines.push(`- ${parts.join(' | ')}`);
    }
  }

  // Actions taken
  if (caseFacts.actionsTaken.length > 0) {
    lines.push('');
    lines.push('**Actions taken this session:**');
    for (const a of caseFacts.actionsTaken) {
      lines.push(`- [Turn ${a.turn}] ${a.action}: ${a.detail}`);
    }
  }

  // Refunds
  if (caseFacts.refunds.length > 0) {
    lines.push('');
    lines.push('**Refunds processed:**');
    for (const r of caseFacts.refunds) {
      lines.push(`- ${r.refundId}: $${r.amount} for ${r.orderId} (${r.status}, ~${r.estimatedDays} days)`);
    }
  }

  // Open issues
  if (caseFacts.openIssues.length > 0) {
    lines.push('');
    lines.push('**Open issues:**');
    for (const i of caseFacts.openIssues) {
      lines.push(`- ${i.description}`);
    }
  }

  // Escalations
  if (caseFacts.escalations.length > 0) {
    lines.push('');
    lines.push('**Escalations:**');
    for (const e of caseFacts.escalations) {
      lines.push(`- ${e.ticketId}: ${e.issueSummary} (${e.priority} priority)`);
    }
  }

  return lines.join('\n');
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

/**
 * Build the system prompt with case facts injected at the beginning.
 *
 * EXAM KEY CONCEPT: Case facts go BEFORE the base system prompt so they
 * sit at the very top of the context window. The base prompt's own
 * "Case Facts Block" section serves as an instruction to Claude to
 * maintain these facts -- the actual data is provided here.
 */
export function buildSystemPrompt(caseFacts) {
  const caseFactsBlock = renderCaseFacts(caseFacts);
  return `${caseFactsBlock}\n\n---\n\n${csrSystemPrompt}`;
}

// ─── Tool Result Trimming ─────────────────────────────────────────────────────

/**
 * Trim a tool result to only the fields needed for subsequent decisions.
 *
 * EXAM KEY CONCEPT: After extracting facts into the case facts block, the
 * raw tool result in the conversation history does not need to carry all
 * the verbose data. Trimming conserves context window tokens.
 *
 * The full data is preserved in the case facts block (via extractFacts).
 * Only fields that Claude needs for its NEXT decision are kept in the
 * conversation history.
 */
export function trimToolResult(toolName, rawContent) {
  try {
    const data = JSON.parse(rawContent);

    switch (toolName) {
      case 'get_customer':
        // If multiple matches, keep full data for disambiguation decision
        if (data.multiple_matches) return rawContent;
        // Otherwise, keep only decision-relevant fields
        return JSON.stringify({
          id: data.id,
          name: data.name,
          tier: data.tier,
          accountStatus: data.accountStatus,
          _note: 'Full details in case facts block above',
        });

      case 'lookup_order':
        // Keep order status and eligibility info; drop verbose item details
        return JSON.stringify({
          orderId: data.orderId,
          total: data.total,
          status: data.status,
          deliveredAt: data.deliveredAt,
          itemCount: data.items?.length,
          _note: 'Item details and dates in case facts block above',
        });

      case 'process_refund':
        // Refund results are already concise
        return rawContent;

      case 'escalate_to_human':
        return rawContent;

      default:
        return rawContent;
    }
  } catch {
    return rawContent;
  }
}

// ─── Usage Example ────────────────────────────────────────────────────────────
//
// In your agentic loop:
//
//   import { createCaseFacts, extractFacts, buildSystemPrompt, trimToolResult } from './case-facts-block.js';
//
//   const caseFacts = createCaseFacts();
//
//   // Before each API call:
//   const systemPrompt = buildSystemPrompt(caseFacts);
//
//   // After each tool call:
//   extractFacts(toolName, toolInput, rawResult, caseFacts);
//   const trimmedContent = trimToolResult(toolName, rawResult.content);
//
// This ensures the case facts block is always current and at the top of
// the system prompt, while trimmed tool results conserve context tokens.
