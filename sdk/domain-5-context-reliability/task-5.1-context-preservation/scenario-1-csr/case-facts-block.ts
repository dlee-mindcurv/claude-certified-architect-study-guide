/**
 * Scenario 1: CSR Case Facts Block -- Agent SDK Implementation
 *
 * Exam relevance (Task 5.1):
 * - Persistent case facts block injected at top of system prompt each turn
 * - Incremental fact extraction after every tool call
 * - Tool result trimming to conserve context tokens
 * - Case facts survive context compaction because they are rebuilt each turn
 *
 * EXAM KEY CONCEPT:
 *   This module provides the context management layer for a CSR agent.
 *   The case facts object is maintained OUTSIDE conversation history and
 *   re-injected into the system prompt before every API call. This places
 *   verified data at the TOP of the context (highest-attention zone).
 *
 *   The module is designed to be imported by an agentic loop. It does NOT
 *   contain the loop itself -- it provides the context management layer.
 */

import { csrSystemPrompt } from '../../../../shared/prompts/csr-system-prompt.js';

// ─── Case Facts Data Structure ────────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: This structure is maintained OUTSIDE conversation history.
 * It survives summarization because we re-inject it into the system prompt
 * before every API call.
 */

interface CaseFactsCustomer {
  id: string;
  name: string;
  email: string;
  tier: string;
  accountStatus: string;
}

interface CaseFactsOrder {
  orderId: string;
  customerId: string;
  total: number;
  status: string;
  deliveredAt: string | null;
  trackingNumber: string | null;
  itemCount: number;
  itemNames: string[];
}

interface CaseFactsAction {
  action: string;
  detail: string;
  turn: number;
  category?: string;
  retryable?: boolean;
}

interface CaseFactsIssue {
  type: string;
  description: string;
  matchCount?: number;
  turn: number;
}

interface CaseFactsRefund {
  refundId: string;
  orderId: string;
  amount: number;
  status: string;
  estimatedDays: number;
}

interface CaseFactsEscalation {
  ticketId: string;
  priority: string;
  issueSummary: string;
  assignedTo: string;
}

interface CaseFacts {
  customer: CaseFactsCustomer | null;
  orders: CaseFactsOrder[];
  actionsTaken: CaseFactsAction[];
  openIssues: CaseFactsIssue[];
  refunds: CaseFactsRefund[];
  escalations: CaseFactsEscalation[];
  turnCount: number;
}

export function createCaseFacts(): CaseFacts {
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
 */
export function extractFacts(toolName: string, toolInput: Record<string, unknown>, rawResult: { isError: boolean; content: string }, caseFacts: CaseFacts): CaseFacts {
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

function extractCustomerFacts(data: Record<string, unknown>, _toolInput: Record<string, unknown>, caseFacts: CaseFacts): CaseFacts {
  if (data.id) {
    caseFacts.customer = {
      id: data.id as string,
      name: data.name as string,
      email: data.email as string,
      tier: data.tier as string,
      accountStatus: data.accountStatus as string,
    };
    caseFacts.actionsTaken.push({
      action: 'Verified customer identity',
      detail: `${data.name} (${data.id}, ${data.tier} tier)`,
      turn: caseFacts.turnCount,
    });
    caseFacts.openIssues = caseFacts.openIssues.filter((i: CaseFactsIssue) => i.type !== 'disambiguation');
  }

  if (data.multiple_matches) {
    const matches = data.multiple_matches as Array<{ name: string; id: string; email: string }>;
    const matchSummaries = matches.map((m: { name: string; id: string; email: string }) => `${m.name} (${m.id}, ${m.email})`);
    caseFacts.openIssues.push({
      type: 'disambiguation',
      description: `Multiple customers match: ${matchSummaries.join('; ')}`,
      matchCount: matches.length,
      turn: caseFacts.turnCount,
    });
    caseFacts.actionsTaken.push({
      action: 'Customer lookup returned multiple matches',
      detail: `${matches.length} matches found, need disambiguation`,
      turn: caseFacts.turnCount,
    });
  }

  return caseFacts;
}

function extractOrderFacts(data: Record<string, unknown>, caseFacts: CaseFacts): CaseFacts {
  const items = data.items as Array<{ name: string }> | undefined;
  const orderSummary: CaseFactsOrder = {
    orderId: data.orderId as string,
    customerId: data.customerId as string,
    total: data.total as number,
    status: data.status as string,
    deliveredAt: (data.deliveredAt as string) || null,
    trackingNumber: (data.trackingNumber as string) || null,
    itemCount: items?.length || 0,
    itemNames: items?.map((i: { name: string }) => i.name) || [],
  };

  const existingIdx = caseFacts.orders.findIndex((o: CaseFactsOrder) => o.orderId === data.orderId);
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

function extractRefundFacts(data: Record<string, unknown>, caseFacts: CaseFacts): CaseFacts {
  caseFacts.refunds.push({
    refundId: data.refundId as string,
    orderId: data.orderId as string,
    amount: data.amount as number,
    status: data.status as string,
    estimatedDays: data.estimatedProcessingDays as number,
  });

  caseFacts.actionsTaken.push({
    action: `Processed refund ${data.refundId}`,
    detail: `$${data.amount} for order ${data.orderId} (${data.status})`,
    turn: caseFacts.turnCount,
  });

  if (data.status === 'pending_approval') {
    caseFacts.openIssues.push({
      type: 'pending_approval',
      description: `Refund ${data.refundId} ($${data.amount}) awaiting manager approval`,
      turn: caseFacts.turnCount,
    });
  }

  caseFacts.openIssues = caseFacts.openIssues.filter((i: CaseFactsIssue) => i.type !== 'awaiting_refund');
  return caseFacts;
}

function extractEscalationFacts(data: Record<string, unknown>, caseFacts: CaseFacts): CaseFacts {
  caseFacts.escalations.push({
    ticketId: data.ticketId as string,
    priority: data.priority as string,
    issueSummary: data.issueSummary as string,
    assignedTo: data.assignedTo as string,
  });

  caseFacts.actionsTaken.push({
    action: 'Escalated to human agent',
    detail: `Ticket ${data.ticketId} (${data.priority} priority)`,
    turn: caseFacts.turnCount,
  });

  return caseFacts;
}

// ─── Case Facts Rendering ─────────────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: This block goes at the BEGINNING of the system prompt,
 * in the highest-attention zone. It uses explicit section headers
 * (## Current Case Facts) so Claude can locate it reliably.
 */
export function renderCaseFacts(caseFacts: CaseFacts): string {
  const lines: string[] = ['## Current Case Facts (verified this session)', ''];

  if (caseFacts.customer) {
    const c = caseFacts.customer;
    lines.push(`**Customer:** ${c.name} (${c.id}, ${c.tier} tier, ${c.email})`);
  } else {
    lines.push('**Customer:** Not yet identified');
  }

  if (caseFacts.orders.length > 0) {
    lines.push('', '**Orders discussed:**');
    for (const o of caseFacts.orders) {
      const parts = [`${o.orderId}: $${o.total}, ${o.status}`];
      if (o.deliveredAt) parts.push(`delivered ${o.deliveredAt}`);
      if (o.itemNames.length > 0) parts.push(`items: ${o.itemNames.join(', ')}`);
      lines.push(`- ${parts.join(' | ')}`);
    }
  }

  if (caseFacts.actionsTaken.length > 0) {
    lines.push('', '**Actions taken this session:**');
    for (const a of caseFacts.actionsTaken) {
      lines.push(`- [Turn ${a.turn}] ${a.action}: ${a.detail}`);
    }
  }

  if (caseFacts.refunds.length > 0) {
    lines.push('', '**Refunds processed:**');
    for (const r of caseFacts.refunds) {
      lines.push(`- ${r.refundId}: $${r.amount} for ${r.orderId} (${r.status}, ~${r.estimatedDays} days)`);
    }
  }

  if (caseFacts.openIssues.length > 0) {
    lines.push('', '**Open issues:**');
    for (const i of caseFacts.openIssues) {
      lines.push(`- ${i.description}`);
    }
  }

  if (caseFacts.escalations.length > 0) {
    lines.push('', '**Escalations:**');
    for (const e of caseFacts.escalations) {
      lines.push(`- ${e.ticketId}: ${e.issueSummary} (${e.priority} priority)`);
    }
  }

  return lines.join('\n');
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: Case facts go BEFORE the base system prompt so they
 * sit at the very top of the context window.
 */
export function buildSystemPrompt(caseFacts: CaseFacts): string {
  return `${renderCaseFacts(caseFacts)}\n\n---\n\n${csrSystemPrompt}`;
}

// ─── Tool Result Trimming ─────────────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: After extracting facts into the case facts block, the
 * raw tool result in conversation history does not need all the verbose data.
 * Trimming conserves context window tokens.
 */
export function trimToolResult(toolName: string, rawContent: string): string {
  try {
    const data = JSON.parse(rawContent);

    switch (toolName) {
      case 'get_customer':
        if (data.multiple_matches) return rawContent;
        return JSON.stringify({
          id: data.id, name: data.name, tier: data.tier,
          accountStatus: data.accountStatus,
          _note: 'Full details in case facts block above',
        });

      case 'lookup_order':
        return JSON.stringify({
          orderId: data.orderId, total: data.total, status: data.status,
          deliveredAt: data.deliveredAt, itemCount: data.items?.length,
          _note: 'Item details in case facts block above',
        });

      default:
        return rawContent;
    }
  } catch {
    return rawContent;
  }
}

// ─── Usage Example ────────────────────────────────────────────────────────────
//
// In your agentic loop (raw API or Agent SDK hooks):
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
