/**
 * Mock CSR Tools for Scenario 1 — Using @anthropic-ai/claude-agent-sdk
 *
 * Exports:
 *   - Individual tool() definitions (for scoped distribution to subagents)
 *   - csrServer: bundled createSdkMcpServer() with all CSR tools
 *   - Legacy: csrToolDefinitions + executeCsrTool (for raw API examples)
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  email: string;
  tier: string;
  accountStatus: string;
  createdAt: string;
}

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  status: string;
  orderDate: string;
  deliveredAt?: string;
  trackingNumber?: string;
}

interface Refund {
  refundId: string;
  orderId: string;
  customerId: string;
  amount: number;
  reason: string;
  status: string;
  estimatedProcessingDays: number;
  createdAt: string;
}

interface RawToolResult {
  isError?: boolean;
  content: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const customers: Record<string, Customer> = {
  'C-1001': {
    id: 'C-1001', name: 'Alice Johnson', email: 'alice@example.com',
    tier: 'gold', accountStatus: 'active', createdAt: '2023-06-15T10:30:00Z',
  },
  'C-1002': {
    id: 'C-1002', name: 'Bob Smith', email: 'bob@example.com',
    tier: 'standard', accountStatus: 'active', createdAt: '2024-01-20T14:00:00Z',
  },
};

const orders: Record<string, Order> = {
  'ORD-5001': {
    orderId: 'ORD-5001', customerId: 'C-1001',
    items: [
      { name: 'Wireless Headphones', price: 79.99, quantity: 1 },
      { name: 'USB-C Cable', price: 12.99, quantity: 2 },
    ],
    total: 105.97, status: 'delivered',
    deliveredAt: '2025-03-01T16:45:00Z', orderDate: '2025-02-25T09:00:00Z',
  },
  'ORD-5002': {
    orderId: 'ORD-5002', customerId: 'C-1001',
    items: [{ name: 'Laptop Stand', price: 49.99, quantity: 1 }],
    total: 49.99, status: 'shipped',
    trackingNumber: 'TRK-789456', orderDate: '2025-03-10T11:30:00Z',
  },
  'ORD-5003': {
    orderId: 'ORD-5003', customerId: 'C-1002',
    items: [{ name: 'Mechanical Keyboard', price: 149.99, quantity: 1 }],
    total: 149.99, status: 'delivered',
    deliveredAt: '2025-02-20T14:30:00Z', orderDate: '2025-02-15T10:00:00Z',
  },
};

const refunds: Refund[] = [];

// ─── Helper: format MCP CallToolResult ──────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function err(errorCategory: string, message: string, isRetryable = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ errorCategory, isRetryable, message }) }],
    isError: true,
  };
}

// ─── Agent SDK tool() definitions ───────────────────────────────────────────

export const getCustomerTool = tool(
  'get_customer',
    'Look up a customer account by their email address or customer ID (format: C-XXXX). ' +
    'Returns customer profile including name, email, account tier (standard/gold/platinum), ' +
    'and account status. Use this BEFORE any order lookups or refund processing to verify ' +
    'customer identity. If multiple customers match a name, returns all matches — ask the ' +
    'customer for additional identifiers (email or customer ID) to disambiguate. ' +
    'Does NOT accept order numbers — use lookup_order for order queries.',
  {
    email: z.string().optional().describe('Customer email address'),
    customer_id: z.string().optional().describe('Customer ID (format: C-XXXX)'),
  },
  async ({ email, customer_id }) => {
    if (customer_id) {
      const c = customers[customer_id];
      return c ? ok(c) : err('validation', `No customer found with ID: ${customer_id}`);
    }
    if (email) {
      const matches = Object.values(customers).filter(c => c.email === email);
      if (matches.length === 0) return err('validation', `No customer found with email: ${email}`);
      return ok(matches.length === 1 ? matches[0] : { multiple_matches: matches });
    }
    return err('validation', 'Either email or customer_id is required');
  },
);

export const lookupOrderTool = tool(
  'lookup_order',
    'Look up an order by its order number (format: ORD-XXXX). Returns order details ' +
    'including items, total amount, order status (pending/shipped/delivered/cancelled), ' +
    'tracking information, and delivery date. Requires a verified customer ID from a ' +
    'prior get_customer call — will fail if the order does not belong to the specified customer. ' +
    'Accepts ONLY order numbers, not customer names or emails.',
  {
    order_id: z.string().describe('Order number (ORD-XXXX)'),
    customer_id: z.string().describe('Verified customer ID (C-XXXX)'),
  },
  async ({ order_id, customer_id }) => {
    const order = orders[order_id];
    if (!order) return err('validation', `No order found: ${order_id}`);
    if (order.customerId !== customer_id) return err('permission', `Order ${order_id} does not belong to ${customer_id}`);
    return ok(order);
  },
);

export const processRefundTool = tool(
  'process_refund',
  'Process a refund for a delivered order. Refunds over $100 need human approval. ' +
  'Order must be in "delivered" status.',
  {
    order_id: z.string().describe('Order number (ORD-XXXX)'),
    customer_id: z.string().describe('Verified customer ID (C-XXXX)'),
    amount: z.number().describe('Refund amount in USD'),
    reason: z.string().describe('Reason for the refund'),
  },
  async ({ order_id, customer_id, amount, reason }) => {
    const order = orders[order_id];
    if (!order) return err('validation', `No order found: ${order_id}`);
    if (order.customerId !== customer_id) return err('permission', `Order ${order_id} does not belong to ${customer_id}`);
    if (order.status !== 'delivered') return err('business', `Order is "${order.status}" — only delivered orders can be refunded`);
    if (amount > order.total) return err('validation', `Refund $${amount} exceeds order total $${order.total}`);

    const needsApproval = amount > 100;
    const refund = {
      refundId: `REF-${Date.now()}`, orderId: order_id, customerId: customer_id,
      amount, reason, status: needsApproval ? 'pending_approval' : 'approved',
      estimatedProcessingDays: needsApproval ? 5 : 3, createdAt: new Date().toISOString(),
    };
    refunds.push(refund);
    return ok(refund);
  },
);

export const escalateToHumanTool = tool(
  'escalate_to_human',
  'Escalate to a human agent. Use when: customer requests human, policy exception, ' +
  'or no meaningful progress after investigation.',
  {
    customer_id: z.string().optional().describe('Customer ID if identified'),
    issue_summary: z.string().describe('Brief description of the issue'),
    actions_taken: z.array(z.string()).optional().describe('Actions already attempted'),
    recommended_action: z.string().optional().describe('Recommended next step'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('Priority level'),
  },
  async ({ customer_id, issue_summary, actions_taken, recommended_action, priority }) => {
    return ok({
      ticketId: `ESC-${Date.now()}`, customerId: customer_id || 'unknown',
      issueSummary: issue_summary, actionsTaken: actions_taken || [],
      recommendedAction: recommended_action || 'Review and resolve',
      priority, status: 'assigned', assignedTo: 'next-available-agent',
      createdAt: new Date().toISOString(),
    });
  },
);

// ─── Bundled MCP Server ─────────────────────────────────────────────────────

export const csrServer = createSdkMcpServer({
  name: 'csr',
  version: '1.0.0',
  tools: [getCustomerTool, lookupOrderTool, processRefundTool, escalateToHumanTool],
});

// ─── Legacy exports (for raw API examples that still use @anthropic-ai/sdk) ─

export const csrToolDefinitions = [
  {
    name: 'get_customer',
    description: getCustomerTool.description,
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Customer email address for lookup' },
        customer_id: { type: 'string', description: 'Customer ID in format (C-XXXX)' },
      },
      required: [],
    },
  },
  {
    name: 'lookup_order',
    description: lookupOrderTool.description,
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number (ORD-XXXX)' },
        customer_id: { type: 'string', description: 'Verified customer ID (C-XXXX)' },
      },
      required: ['order_id', 'customer_id'],
    },
  },
  {
    name: 'process_refund',
    description: processRefundTool.description,
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order number (ORD-XXXX)' },
        customer_id: { type: 'string', description: 'Verified customer ID (C-XXXX)' },
        amount: { type: 'number', description: 'Refund amount in USD' },
        reason: { type: 'string', description: 'Reason for the refund' },
      },
      required: ['order_id', 'customer_id', 'amount', 'reason'],
    },
  },
  {
    name: 'escalate_to_human',
    description: escalateToHumanTool.description,
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        issue_summary: { type: 'string' },
        actions_taken: { type: 'array', items: { type: 'string' } },
        recommended_action: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      },
      required: ['issue_summary', 'priority'],
    },
  },
];

export function executeCsrToolRaw(toolName: string, toolInput: Record<string, unknown>): RawToolResult {
  switch (toolName) {
    case 'get_customer':
      return handleGetCustomer(toolInput as { email?: string; customer_id?: string });
    case 'lookup_order':
      return handleLookupOrder(toolInput as { order_id?: string; customer_id?: string });
    case 'process_refund':
      return handleProcessRefund(toolInput as { order_id: string; customer_id: string; amount: number; reason: string });
    case 'escalate_to_human':
      return handleEscalate(toolInput as { customer_id?: string; issue_summary: string; actions_taken?: string[]; recommended_action?: string; priority: string });
    default:
      return {
        isError: true,
        content: JSON.stringify({
          errorCategory: 'validation',
          isRetryable: false,
          message: `Unknown tool: ${toolName}`,
        }),
      };
  }
}

function handleGetCustomer({ email, customer_id }: { email?: string; customer_id?: string }): RawToolResult {
  // Simulate transient error (10% chance)
  if (Math.random() < 0.1) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'transient',
        isRetryable: true,
        message: 'Customer database temporarily unavailable. Please retry.',
      }),
    };
  }

  if (customer_id) {
    const customer = customers[customer_id];
    if (!customer) {
      return {
        isError: true,
        content: JSON.stringify({
          errorCategory: 'validation',
          isRetryable: false,
          message: `No customer found with ID: ${customer_id}`,
        }),
      };
    }
    return { content: JSON.stringify(customer) };
  }

  if (email) {
    const matches = Object.values(customers).filter((c) => c.email === email);
    if (matches.length === 0) {
      return {
        isError: true,
        content: JSON.stringify({
          errorCategory: 'validation',
          isRetryable: false,
          message: `No customer found with email: ${email}`,
        }),
      };
    }
    return { content: JSON.stringify(matches.length === 1 ? matches[0] : { multiple_matches: matches }) };
  }

  return {
    isError: true,
    content: JSON.stringify({
      errorCategory: 'validation',
      isRetryable: false,
      message: 'Either email or customer_id is required',
    }),
  };
}

function handleLookupOrder({ order_id, customer_id }: { order_id?: string; customer_id?: string }): RawToolResult {
  if (!order_id || !customer_id) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'validation',
        isRetryable: false,
        message: 'Both order_id and customer_id are required',
      }),
    };
  }

  const order = orders[order_id];
  if (!order) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'validation',
        isRetryable: false,
        message: `No order found with ID: ${order_id}`,
      }),
    };
  }

  if (order.customerId !== customer_id) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'permission',
        isRetryable: false,
        message: `Order ${order_id} does not belong to customer ${customer_id}`,
      }),
    };
  }

  return { content: JSON.stringify(order) };
}

function handleProcessRefund({ order_id, customer_id, amount, reason }: { order_id: string; customer_id: string; amount: number; reason: string }): RawToolResult {
  const order = orders[order_id];
  if (!order) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'validation',
        isRetryable: false,
        message: `No order found with ID: ${order_id}`,
      }),
    };
  }

  if (order.customerId !== customer_id) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'permission',
        isRetryable: false,
        message: `Order ${order_id} does not belong to customer ${customer_id}`,
      }),
    };
  }

  if (order.status !== 'delivered') {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'business',
        isRetryable: false,
        message: `Order ${order_id} is in "${order.status}" status. Only delivered orders can be refunded.`,
      }),
    };
  }

  if (amount > order.total) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'validation',
        isRetryable: false,
        message: `Refund amount $${amount} exceeds order total $${order.total}`,
      }),
    };
  }

  const refundId = `REF-${Date.now()}`;
  const needsApproval = amount > 100;

  const refund = {
    refundId,
    orderId: order_id,
    customerId: customer_id,
    amount,
    reason,
    status: needsApproval ? 'pending_approval' : 'approved',
    estimatedProcessingDays: needsApproval ? 5 : 3,
    createdAt: new Date().toISOString(),
  };

  refunds.push(refund);
  return { content: JSON.stringify(refund) };
}

function handleEscalate({ customer_id, issue_summary, actions_taken, recommended_action, priority }: { customer_id?: string; issue_summary: string; actions_taken?: string[]; recommended_action?: string; priority: string }): RawToolResult {
  const ticket = {
    ticketId: `ESC-${Date.now()}`,
    customerId: customer_id || 'unknown',
    issueSummary: issue_summary,
    actionsTaken: actions_taken || [],
    recommendedAction: recommended_action || 'Review and resolve',
    priority,
    status: 'assigned',
    assignedTo: 'next-available-agent',
    createdAt: new Date().toISOString(),
  };

  return { content: JSON.stringify(ticket) };
}


export function executeCsrTool(toolName: string, toolInput: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookup: Record<string, { handler: (args: any, extra: any) => Promise<any> } | undefined> = {
    get_customer: getCustomerTool,
    lookup_order: lookupOrderTool,
    process_refund: processRefundTool,
    escalate_to_human: escalateToHumanTool,
  };
  const t = lookup[toolName];
  if (!t) return { isError: true, content: JSON.stringify({ errorCategory: 'validation', message: `Unknown tool: ${toolName}` }) };

  // Synchronous wrapper for legacy callers — call handler then flatten result
  let result: { isError?: boolean; content: Array<{ type: string; text?: string }> } | undefined;
  t.handler(toolInput, {}).then((r: typeof result) => { result = r; });
  // Since our handlers are sync internally, the promise resolves immediately
  return {
    isError: result?.isError ?? false,
    content: result!.content[0]!.text ?? '{}',
  };
}
