/**
 * Structured Handoff Summary Schema for Human Escalation (Scenario 1)
 *
 * Exam relevance: Task 1.4 (Multi-step workflows with enforcement and handoff patterns)
 *
 * When escalating to human agents, provide a structured summary so they can
 * resolve the issue WITHOUT needing the full conversation transcript.
 */

export const handoffSummarySchema = {
  type: 'object',
  properties: {
    customer: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        tier: { type: 'string', enum: ['standard', 'gold', 'platinum'] },
        email: { type: 'string' },
      },
      required: ['id', 'name'],
    },
    issue: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One-line issue description' },
        category: {
          type: 'string',
          enum: ['return', 'billing', 'account', 'product', 'policy_exception', 'other'],
        },
        category_detail: { type: ['string', 'null'] },
        root_cause: {
          type: ['string', 'null'],
          description: 'Root cause if identified during investigation',
        },
      },
      required: ['summary', 'category'],
    },
    actions_taken: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          result: { type: 'string' },
          timestamp: { type: 'string' },
        },
        required: ['action', 'result'],
      },
    },
    relevant_orders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order_id: { type: 'string' },
          total: { type: 'number' },
          status: { type: 'string' },
        },
        required: ['order_id'],
      },
    },
    recommended_action: {
      type: 'string',
      description: 'What the human agent should do next',
    },
    refund_amount: {
      type: ['number', 'null'],
      description: 'Proposed refund amount if applicable',
    },
    escalation_reason: {
      type: 'string',
      enum: [
        'customer_requested',
        'policy_exception',
        'high_value_refund',
        'unable_to_resolve',
        'multiple_match',
      ],
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'urgent'],
    },
  },
  required: [
    'customer',
    'issue',
    'actions_taken',
    'recommended_action',
    'escalation_reason',
    'priority',
  ],
};
