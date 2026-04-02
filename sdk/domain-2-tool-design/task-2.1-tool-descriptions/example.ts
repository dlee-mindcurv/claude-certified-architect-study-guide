/**
 * Task 2.1 — Tool Description Quality: Before vs. After
 *
 * Exam relevance:
 * - Tool descriptions are the PRIMARY mechanism Claude uses for selection
 * - Minimal descriptions cause misrouting, especially with similar tools
 * - Good descriptions include: input formats, edge cases, boundaries,
 *   when-to-use guidance, and prerequisites
 *
 * EXAM KEY CONCEPT:
 *   tool() description strings are the LLM's ONLY guide for routing.
 *   Include: what it does, accepted formats, prerequisites, boundaries,
 *   and routing guidance vs. other tools.
 *
 * This example demonstrates:
 * 1. BEFORE: Minimal descriptions -> agent confuses get_customer and lookup_order
 * 2. AFTER:  Expanded descriptions -> agent correctly routes the same query
 * 3. Both tested with the SAME ambiguous query
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Mock Data ────────────────────────────────────────────────────────────

const customers: Record<string, { id: string; name: string; email: string; tier: string }> = {
  'C-1001': { id: 'C-1001', name: 'Alice Johnson', email: 'alice@example.com', tier: 'gold' },
};
const orders: Record<string, { orderId: string; customerId: string; total: number; status: string }> = {
  'ORD-5001': { orderId: 'ORD-5001', customerId: 'C-1001', total: 105.97, status: 'delivered' },
};

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
function err(msg: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }], isError: true };
}

// ─── BEFORE: Minimal (Vague) Descriptions ─────────────────────────────────
// These descriptions are vague and overlapping. Both say "retrieves."
// Neither specifies accepted input formats, prerequisites, or boundaries.

const vagueGetCustomer = tool(
  'get_customer',
  'Retrieves customer information',                       // BAD: vague
  {
    email: z.string().optional().describe('Email address'),
    customer_id: z.string().optional().describe('Customer ID'),
  },
  async ({ email, customer_id }) => {
    if (customer_id && customers[customer_id]) return ok(customers[customer_id]);
    const match = Object.values(customers).find(c => c.email === email);
    return match ? ok(match) : err('Customer not found');
  },
);

const vagueLookupOrder = tool(
  'lookup_order',
  'Retrieves order details',                              // BAD: vague
  {
    order_id: z.string().describe('Order ID'),
    customer_id: z.string().describe('Customer ID'),
  },
  async ({ order_id, customer_id }) => {
    const order = orders[order_id];
    if (!order) return err('Order not found');
    if (order.customerId !== customer_id) return err('Permission denied');
    return ok(order);
  },
);

// ─── AFTER: Expanded (Precise) Descriptions ───────────────────────────────
// Each description specifies: what it does, accepted formats, prerequisites,
// boundaries, and routing guidance vs. the other tools.

const preciseGetCustomer = tool(
  'get_customer',
  // EXAM KEY CONCEPT: 5 components of an effective tool description
  'Look up a customer by email or customer ID (format: C-XXXX). ' +         // 1. What it does + formats
  'Returns profile with name, tier, and account status. ' +                  // 2. What it returns
  'Call BEFORE any order lookups or refunds to verify identity. ' +          // 3. Prerequisites
  'Does NOT accept order numbers — use lookup_order for order queries.',     // 4. Boundaries + routing
  {
    email: z.string().optional().describe('Customer email (e.g., alice@example.com)'),
    customer_id: z.string().optional().describe('Customer ID in format C-XXXX'),
  },
  async ({ email, customer_id }) => {
    if (customer_id && customers[customer_id]) return ok(customers[customer_id]);
    const match = Object.values(customers).find(c => c.email === email);
    return match ? ok(match) : err('Customer not found');
  },
);

const preciseLookupOrder = tool(
  'lookup_order',
  'Look up an order by order number (format: ORD-XXXX). ' +
  'Returns items, total, status, and delivery info. ' +
  'Requires a verified customer_id from a prior get_customer call — ' +
  'will fail if the order does not belong to the specified customer. ' +
  'Accepts ONLY order numbers, not customer names or emails.',
  {
    order_id: z.string().describe('Order number (format: ORD-XXXX)'),
    customer_id: z.string().describe('Verified customer ID from get_customer (C-XXXX)'),
  },
  async ({ order_id, customer_id }) => {
    const order = orders[order_id];
    if (!order) return err('Order not found');
    if (order.customerId !== customer_id) return err('Permission denied');
    return ok(order);
  },
);

// ─── Build MCP Servers ────────────────────────────────────────────────────

const vagueServer = createSdkMcpServer({
  name: 'csr-vague',
  version: '1.0.0',
  tools: [vagueGetCustomer, vagueLookupOrder],
});

const preciseServer = createSdkMcpServer({
  name: 'csr-precise',
  version: '1.0.0',
  tools: [preciseGetCustomer, preciseLookupOrder],
});

// ─── Run Comparison ───────────────────────────────────────────────────────
// The SAME ambiguous query is tested with both tool sets.
// With vague descriptions, the agent may call lookup_order directly
// (which fails because no customer_id was verified first).
// With precise descriptions, the agent calls get_customer first.

async function runWithServer(label: string, mcpServer: ReturnType<typeof createSdkMcpServer>): Promise<string[]> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(label);
  console.log('='.repeat(60));

  const toolLog: string[] = [];

  for await (const message of query({
    prompt:
      'Can you check my order ORD-5001? My email is alice@example.com',
    options: {
      mcpServers: [mcpServer],
      maxTurns: 6,
      hooks: {
        // Log every tool call so we can compare routing order
        postToolUse: async ({ toolName, toolInput }: { toolName: string; toolInput: unknown }) => {
          toolLog.push(toolName);
          console.log(`  Tool call: ${toolName}(${JSON.stringify(toolInput)})`);
        },
      },
    } as any,
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      console.log(`\n  Final: ${message.result.substring(0, 150)}...`);
    }
  }

  console.log(`  Tool call order: ${toolLog.join(' -> ')}`);
  return toolLog;
}

async function main(): Promise<void> {
  console.log('Task 2.1: Tool Description Quality — Before vs. After');
  console.log('Test query: "Can you check my order ORD-5001? My email is alice@example.com"');
  console.log('Correct sequence: get_customer(email) -> lookup_order(order_id, customer_id)\n');

  const vagueLog = await runWithServer('BEFORE: Vague descriptions', vagueServer);
  const preciseLog = await runWithServer('AFTER: Precise descriptions', preciseServer);

  // ── Analysis ──────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('ANALYSIS');
  console.log('='.repeat(60));

  const vagueFirst = vagueLog[0]?.replace(/^mcp__csr-vague__/, '') || 'none';
  const preciseFirst = preciseLog[0]?.replace(/^mcp__csr-precise__/, '') || 'none';

  console.log(`  Vague first tool:   ${vagueFirst}`);
  console.log(`  Precise first tool: ${preciseFirst}`);

  // EXAM KEY CONCEPT: Description quality determines routing accuracy
  console.log(`
  KEY TAKEAWAY (exam):
  - Tool descriptions are the PRIMARY selection mechanism
  - Include: input formats, prerequisites, boundaries, routing guidance
  - "Call BEFORE any order lookups" creates prerequisite ordering
  - "Does NOT accept order numbers" prevents misrouting
  `);
}

main().catch(console.error);
