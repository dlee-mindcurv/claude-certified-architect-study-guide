/**
 * Scenario 1 (CSR Agent) — Well-Crafted Tool Definitions
 *
 * Exam relevance: Task 2.1 (Tool descriptions as LLM selection mechanism)
 *
 * These definitions demonstrate the 5 components of effective descriptions:
 * 1. What the tool does (primary function)
 * 2. Input format and constraints (accepted identifiers)
 * 3. Edge cases and boundaries (what it does NOT accept)
 * 4. When to use vs. alternatives (routing guidance)
 * 5. Prerequisites (what must happen before calling)
 *
 * Compare these to the minimal descriptions in example.js to see why each
 * component matters for reliable tool selection.
 */

// ─── Tool Definitions ──────────────────────────────────────────────────────
// These are the SAME tools as shared/tools/csr-tools.js but presented here
// as a standalone reference for how to write differentiating descriptions.

export const csrToolDefinitionsAnnotated = [
  {
    name: 'get_customer',
    description:
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
      'customer for additional identifiers (email or customer ID) to ' +
      'disambiguate. ' +
      // Component 4: Boundaries and routing
      'Does NOT accept order numbers — use lookup_order for order queries.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          // Property-level description with example format
          description: 'Customer email address for lookup (e.g., alice@example.com)',
        },
        customer_id: {
          type: 'string',
          // Format constraint with example
          description: 'Customer ID in format C-XXXX (e.g., C-1001)',
        },
      },
      // Neither field is required — but at least one must be provided
      // The tool implementation validates this and returns a helpful error
      required: [],
    },

    // ── Annotation: Why this description works ──────────────────────────
    // - "email address or customer ID (format: C-XXXX)" tells Claude exactly
    //   what identifiers to extract from the user's message
    // - "Use this BEFORE any order lookups" establishes prerequisite ordering
    // - "Does NOT accept order numbers" prevents Claude from passing ORD-XXXX
    //   to this tool when the user mentions an order
    // - "If multiple customers match" prepares Claude for ambiguous results
  },

  {
    name: 'lookup_order',
    description:
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
    input_schema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'Order number in format ORD-XXXX (e.g., ORD-5001)',
        },
        customer_id: {
          type: 'string',
          description:
            'Verified customer ID from a prior get_customer call (format: C-XXXX). ' +
            'Must match the customer who placed the order.',
        },
      },
      required: ['order_id', 'customer_id'],
    },

    // ── Annotation: Why this description works ──────────────────────────
    // - "Requires a verified customer ID from a prior get_customer call"
    //   creates an explicit dependency chain: get_customer → lookup_order
    // - "will fail if the order does not belong to the specified customer"
    //   explains the consequence of skipping the prerequisite
    // - "Accepts ONLY order numbers" prevents Claude from passing emails
  },

  {
    name: 'process_refund',
    description:
      // Component 1: What it does
      'Process a refund for a specific order. ' +
      // Component 5: Prerequisites
      'Requires a verified customer ID and a valid order ID. The order ' +
      'must be in "delivered" status to be eligible for refund. ' +
      // Component 2: Capabilities
      'Supports full or partial refunds. ' +
      // Component 3: Edge cases and business rules
      'Refunds over $100 require human approval and will return a ' +
      '"pending_approval" status instead of immediate confirmation. ' +
      // Component 2 continued: Return value
      'Returns refund confirmation with refund ID, amount, and estimated ' +
      'processing time (3 days standard, 5 days if approval needed). ' +
      // Component 4: Routing
      'If the order is not delivered (e.g., still shipped or pending), ' +
      'do NOT call this tool — inform the customer of the order status instead.',
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
          description:
            'Refund amount in USD. Must not exceed the order total. ' +
            'For a full refund, pass the exact order total.',
        },
        reason: {
          type: 'string',
          description:
            'Reason for the refund (e.g., "damaged item", "wrong product", ' +
            '"customer changed mind")',
        },
      },
      required: ['order_id', 'customer_id', 'amount', 'reason'],
    },

    // ── Annotation: Why this description works ──────────────────────────
    // - "must be in delivered status" prevents calls for shipped/pending orders
    // - "Refunds over $100 require human approval" sets expectations
    // - "do NOT call this tool" for non-delivered orders gives explicit guidance
    // - The amount description clarifies "full refund = pass exact total"
  },

  {
    name: 'escalate_to_human',
    description:
      // Component 1: What it does
      'Escalate the current interaction to a human agent. ' +
      // Component 4: When to use (routing guidance)
      'Use when: (1) the customer explicitly requests a human agent ' +
      '(honor immediately — do not investigate first), (2) the issue involves ' +
      'a policy exception or gap that you cannot resolve, or (3) you cannot ' +
      'make meaningful progress after investigation. ' +
      // Component 3: When NOT to use
      'Do NOT escalate when the issue is within your capability — standard ' +
      'returns, order status checks, and simple refunds should be handled ' +
      'directly. If the customer expresses frustration but the issue is ' +
      'resolvable, resolve it first and only escalate if they insist. ' +
      // Component 2: What to include
      'Include a structured summary with customer details, issue description, ' +
      'actions already taken, and recommended next steps for the human agent.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'string',
          description: 'Customer ID if identified (format: C-XXXX). Optional if customer has not been verified.',
        },
        issue_summary: {
          type: 'string',
          description:
            'Brief description of the customer issue including what they want ' +
            'and why automated resolution was not possible.',
        },
        actions_taken: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of actions already attempted (e.g., ["Verified customer C-1001", ' +
            '"Looked up order ORD-5001", "Attempted refund — order not delivered"])',
        },
        recommended_action: {
          type: 'string',
          description:
            'Recommended next step for the human agent (e.g., "Review policy exception ' +
            'for competitor price matching")',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description:
            'Escalation priority: low (general inquiry), medium (unresolved issue), ' +
            'high (frustrated customer or policy exception), urgent (potential fraud or safety)',
        },
      },
      required: ['issue_summary', 'priority'],
    },

    // ── Annotation: Why this description works ──────────────────────────
    // - Three numbered use cases give explicit routing criteria
    // - "honor immediately" for human requests prevents unnecessary investigation
    // - "Do NOT escalate" section prevents over-escalation of solvable issues
    // - The priority enum description maps each level to a concrete scenario
  },
];

// ─── Description Quality Checklist ─────────────────────────────────────────
// Use this checklist when reviewing any tool definition:
//
// [ ] Does the description say what the tool DOES? (primary function)
// [ ] Does the description say what it ACCEPTS? (input formats with examples)
// [ ] Does the description say what it RETURNS? (output shape and fields)
// [ ] Does the description say what it does NOT do? (boundary statements)
// [ ] Does the description say WHEN to use it? (vs. alternatives)
// [ ] Does the description state PREREQUISITES? (ordering dependencies)
// [ ] Does each property have a format-specific description?
// [ ] Are edge cases documented? (multiple matches, missing data, etc.)
