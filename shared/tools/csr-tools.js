/**
 * Mock MCP Tool Implementations for Customer Support Resolution (Scenario 1)
 *
 * These tools simulate backend systems for the CSR agent:
 * - get_customer: Look up customer by email or ID
 * - lookup_order: Look up order by order number
 * - process_refund: Process a refund for an order
 * - escalate_to_human: Escalate to a human agent
 *
 * Each tool returns structured responses matching real MCP patterns,
 * including proper error handling with isError, errorCategory, and isRetryable.
 */

// ─── Mock Data Store ─────────────────────────────────────────────────────────

const customers = {
  'C-1001': {
    id: 'C-1001',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    tier: 'gold',
    accountStatus: 'active',
    createdAt: '2023-06-15T10:30:00Z',
  },
  'C-1002': {
    id: 'C-1002',
    name: 'Bob Smith',
    email: 'bob@example.com',
    tier: 'standard',
    accountStatus: 'active',
    createdAt: '2024-01-20T14:00:00Z',
  },
  'C-1003': {
    id: 'C-1003',
    name: 'Alice Johnson',
    email: 'alice.j@other.com',
    tier: 'platinum',
    accountStatus: 'active',
    createdAt: '2022-03-10T08:15:00Z',
  },
};

const orders = {
  'ORD-5001': {
    orderId: 'ORD-5001',
    customerId: 'C-1001',
    items: [
      { name: 'Wireless Headphones', price: 79.99, quantity: 1 },
      { name: 'USB-C Cable', price: 12.99, quantity: 2 },
    ],
    total: 105.97,
    status: 'delivered',
    deliveredAt: '2025-03-01T16:45:00Z',
    orderDate: '2025-02-25T09:00:00Z',
  },
  'ORD-5002': {
    orderId: 'ORD-5002',
    customerId: 'C-1001',
    items: [{ name: 'Laptop Stand', price: 49.99, quantity: 1 }],
    total: 49.99,
    status: 'shipped',
    trackingNumber: 'TRK-789456',
    orderDate: '2025-03-10T11:30:00Z',
  },
  'ORD-5003': {
    orderId: 'ORD-5003',
    customerId: 'C-1002',
    items: [{ name: 'Mechanical Keyboard', price: 149.99, quantity: 1 }],
    total: 149.99,
    status: 'delivered',
    deliveredAt: '2025-02-20T14:30:00Z',
    orderDate: '2025-02-15T10:00:00Z',
  },
};

const refunds = [];

// ─── Tool Definitions (for Claude API tool_use) ─────────────────────────────

export const csrToolDefinitions = [
  {
    name: 'get_customer',
    description:
      'Look up a customer account by their email address or customer ID (format: C-XXXX). ' +
      'Returns customer profile including name, email, account tier (standard/gold/platinum), ' +
      'and account status. Use this BEFORE any order lookups or refund processing to verify ' +
      'customer identity. If multiple customers match a name, returns all matches — ask the ' +
      'customer for additional identifiers (email or customer ID) to disambiguate. ' +
      'Does NOT accept order numbers — use lookup_order for order queries.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Customer email address for lookup',
        },
        customer_id: {
          type: 'string',
          description: 'Customer ID in format C-XXXX',
        },
      },
      required: [],
    },
  },
  {
    name: 'lookup_order',
    description:
      'Look up an order by its order number (format: ORD-XXXX). Returns order details ' +
      'including items, total amount, order status (pending/shipped/delivered/cancelled), ' +
      'tracking information, and delivery date. Requires a verified customer ID from a ' +
      'prior get_customer call — will fail if the order does not belong to the specified customer. ' +
      'Accepts ONLY order numbers, not customer names or emails.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'Order number in format ORD-XXXX',
        },
        customer_id: {
          type: 'string',
          description: 'Verified customer ID from get_customer (format: C-XXXX)',
        },
      },
      required: ['order_id', 'customer_id'],
    },
  },
  {
    name: 'process_refund',
    description:
      'Process a refund for a specific order. Requires a verified customer ID and valid order ID. ' +
      'Supports full or partial refunds. Refunds over $100 require human approval and will return ' +
      'a pending status. The order must be in "delivered" status to be eligible for a refund. ' +
      'Returns refund confirmation with refund ID, amount, and estimated processing time.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'Order number to refund (format: ORD-XXXX)',
        },
        customer_id: {
          type: 'string',
          description: 'Verified customer ID (format: C-XXXX)',
        },
        amount: {
          type: 'number',
          description: 'Refund amount in USD. Must not exceed order total.',
        },
        reason: {
          type: 'string',
          description: 'Reason for the refund',
        },
      },
      required: ['order_id', 'customer_id', 'amount', 'reason'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Escalate the current interaction to a human agent. Use when: (1) the customer explicitly ' +
      'requests a human agent, (2) the issue involves a policy exception or gap, or (3) you ' +
      'cannot make meaningful progress after investigation. Include a structured summary with ' +
      'customer details, issue description, actions already taken, and recommended next steps.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'string',
          description: 'Customer ID if identified',
        },
        issue_summary: {
          type: 'string',
          description: 'Brief description of the customer issue',
        },
        actions_taken: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of actions already attempted',
        },
        recommended_action: {
          type: 'string',
          description: 'Recommended next step for the human agent',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Escalation priority level',
        },
      },
      required: ['issue_summary', 'priority'],
    },
  },
];

// ─── Tool Executor (Mock Backend) ────────────────────────────────────────────

export function executeCsrTool(toolName, toolInput) {
  switch (toolName) {
    case 'get_customer':
      return handleGetCustomer(toolInput);
    case 'lookup_order':
      return handleLookupOrder(toolInput);
    case 'process_refund':
      return handleProcessRefund(toolInput);
    case 'escalate_to_human':
      return handleEscalate(toolInput);
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

function handleGetCustomer({ email, customer_id }) {
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

function handleLookupOrder({ order_id, customer_id }) {
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

function handleProcessRefund({ order_id, customer_id, amount, reason }) {
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

function handleEscalate({ customer_id, issue_summary, actions_taken, recommended_action, priority }) {
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
