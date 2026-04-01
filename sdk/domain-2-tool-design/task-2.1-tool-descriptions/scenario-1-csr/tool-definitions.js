/**
 * Scenario 1 (CSR Agent) — Well-Crafted Tool Definitions
 *
 * Exam relevance: Task 2.1 (Tool descriptions as LLM selection mechanism)
 *
 * EXAM KEY CONCEPT:
 *   Every tool() description should include 5 components:
 *   1. What the tool does (primary function)
 *   2. Input format and constraints (accepted identifiers)
 *   3. Edge cases and boundaries (what it does NOT accept)
 *   4. When to use vs. alternatives (routing guidance)
 *   5. Prerequisites (what must happen before calling)
 *
 * This file re-exports the shared CSR tools and annotates WHY each
 * description component matters for routing reliability.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Annotated Tool Definitions ───────────────────────────────────────────
// These are purpose-built with all 5 description components.

export const getCustomerTool = tool(
  'get_customer',
  // Component 1: What it does
  'Look up a customer account by their email address or customer ID ' +
  '(format: C-XXXX). ' +
  // Component 2: What it returns
  'Returns customer profile including name, email, account tier ' +
  '(standard/gold/platinum), and account status. ' +
  // Component 5: Prerequisites / ordering
  'Use this BEFORE any order lookups or refund processing to verify ' +
  'customer identity. ' +
  // Component 3: Edge cases
  'If multiple customers match a name, returns all matches — ask the ' +
  'customer for additional identifiers to disambiguate. ' +
  // Component 4: Boundaries and routing
  'Does NOT accept order numbers — use lookup_order for order queries.',
  {
    email: z.string().optional()
      .describe('Customer email address for lookup (e.g., alice@example.com)'),
    customer_id: z.string().optional()
      .describe('Customer ID in format C-XXXX (e.g., C-1001)'),
  },
  async ({ email, customer_id }) => {
    // Stub — see shared/tools/csr-tools.js for real implementation
    return { content: [{ type: 'text', text: JSON.stringify({ stub: true, email, customer_id }) }] };
  },
);
// WHY THIS WORKS:
// - "email address or customer ID (format: C-XXXX)" tells Claude exactly
//   what identifiers to extract from the user's message
// - "Use this BEFORE any order lookups" establishes prerequisite ordering
// - "Does NOT accept order numbers" prevents passing ORD-XXXX here

export const lookupOrderTool = tool(
  'lookup_order',
  // Component 1: What it does
  'Look up an order by its order number (format: ORD-XXXX). ' +
  // Component 2: What it returns
  'Returns order details including items, total amount, order status ' +
  '(pending/shipped/delivered/cancelled), tracking information, and ' +
  'delivery date. ' +
  // Component 5: Prerequisites
  'Requires a verified customer ID from a prior get_customer call — ' +
  'will fail if the order does not belong to the specified customer. ' +
  // Component 4: Boundaries
  'Accepts ONLY order numbers, not customer names or emails.',
  {
    order_id: z.string()
      .describe('Order number in format ORD-XXXX (e.g., ORD-5001)'),
    customer_id: z.string()
      .describe('Verified customer ID from a prior get_customer call (format: C-XXXX)'),
  },
  async ({ order_id, customer_id }) => {
    return { content: [{ type: 'text', text: JSON.stringify({ stub: true, order_id, customer_id }) }] };
  },
);
// WHY THIS WORKS:
// - "Requires a verified customer ID from a prior get_customer call"
//   creates an explicit dependency chain: get_customer -> lookup_order
// - "will fail if the order does not belong to the specified customer"
//   explains the consequence of skipping the prerequisite

export const processRefundTool = tool(
  'process_refund',
  // Component 1: What it does
  'Process a refund for a specific order. ' +
  // Component 5: Prerequisites
  'Requires a verified customer ID and a valid order ID. The order ' +
  'must be in "delivered" status to be eligible for refund. ' +
  // Component 2: Capabilities
  'Supports full or partial refunds. ' +
  // Component 3: Edge cases and business rules
  'Refunds over $100 require human approval and will return ' +
  '"pending_approval" status instead of immediate confirmation. ' +
  // Component 4: Routing
  'If the order is not delivered, do NOT call this tool — inform the ' +
  'customer of the order status instead.',
  {
    order_id: z.string().describe('Order number to refund (ORD-XXXX)'),
    customer_id: z.string().describe('Verified customer ID (C-XXXX)'),
    amount: z.number().describe('Refund amount in USD (must not exceed order total)'),
    reason: z.string().describe('Reason for the refund'),
  },
  async ({ order_id, customer_id, amount, reason }) => {
    return { content: [{ type: 'text', text: JSON.stringify({ stub: true, order_id, customer_id, amount, reason }) }] };
  },
);

export const escalateToHumanTool = tool(
  'escalate_to_human',
  // Component 1: What it does
  'Escalate the current interaction to a human agent. ' +
  // Component 4: When to use (routing guidance)
  'Use when: (1) customer explicitly requests a human agent ' +
  '(honor immediately), (2) issue involves a policy exception, ' +
  'or (3) you cannot make meaningful progress after investigation. ' +
  // Component 3: When NOT to use
  'Do NOT escalate when the issue is within your capability — ' +
  'standard returns, order status checks, and simple refunds should ' +
  'be handled directly.',
  {
    customer_id: z.string().optional().describe('Customer ID if identified'),
    issue_summary: z.string().describe('Brief description of the issue'),
    actions_taken: z.array(z.string()).optional().describe('Actions already attempted'),
    recommended_action: z.string().optional().describe('Recommended next step for human'),
    priority: z.enum(['low', 'medium', 'high', 'urgent'])
      .describe('low=general, medium=unresolved, high=frustrated/policy, urgent=fraud/safety'),
  },
  async ({ customer_id, issue_summary, actions_taken, recommended_action, priority }) => {
    return { content: [{ type: 'text', text: JSON.stringify({ stub: true, issue_summary, priority }) }] };
  },
);

// ─── Bundled MCP Server ───────────────────────────────────────────────────

export const annotatedCsrServer = createSdkMcpServer({
  name: 'csr-annotated',
  version: '1.0.0',
  tools: [getCustomerTool, lookupOrderTool, processRefundTool, escalateToHumanTool],
});

// ─── Description Quality Checklist ────────────────────────────────────────
// Use this checklist when reviewing any tool definition:
//
// [ ] Does the description say what the tool DOES? (primary function)
// [ ] Does the description say what it ACCEPTS? (input formats with examples)
// [ ] Does the description say what it RETURNS? (output shape and fields)
// [ ] Does the description say what it does NOT do? (boundary statements)
// [ ] Does the description say WHEN to use it? (vs. alternatives)
// [ ] Does the description state PREREQUISITES? (ordering dependencies)
// [ ] Does each z.string()/z.number() have a .describe() with format?
// [ ] Are edge cases documented? (multiple matches, missing data, etc.)
