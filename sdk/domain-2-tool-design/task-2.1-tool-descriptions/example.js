/**
 * Task 2.1 — Tool Description Quality: Before vs. After
 *
 * Exam relevance:
 * - Tool descriptions are the PRIMARY mechanism Claude uses for selection
 * - Minimal descriptions cause misrouting, especially with similar tools
 * - Good descriptions include: input formats, edge cases, boundaries,
 *   when-to-use guidance, and prerequisites
 *
 * This example demonstrates:
 * 1. BEFORE: Minimal descriptions → agent confuses get_customer and lookup_order
 * 2. AFTER:  Expanded descriptions → agent correctly routes the same query
 * 3. Both tested with the SAME ambiguous query: "check my order #12345"
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { executeCsrTool } from '../../../shared/tools/csr-tools.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 10;

// ─── BEFORE: Minimal Descriptions ──────────────────────────────────────────
// These descriptions are vague and overlapping. Both "retrieve information."
// Neither specifies accepted input formats, prerequisites, or boundaries.

const minimalTools = [
  {
    name: 'get_customer',
    description: 'Retrieves customer information',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address' },
        customer_id: { type: 'string', description: 'Customer ID' },
      },
    },
  },
  {
    name: 'lookup_order',
    description: 'Retrieves order details',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
        customer_id: { type: 'string', description: 'Customer ID' },
      },
      required: ['order_id', 'customer_id'],
    },
  },
];

// ─── AFTER: Expanded Descriptions ──────────────────────────────────────────
// Each description specifies: what it does, accepted formats, prerequisites,
// boundaries, and routing guidance vs. the other tools.

const expandedTools = [
  {
    name: 'get_customer',
    description:
      'Look up a customer account by their email address or customer ID ' +
      '(format: C-XXXX). Returns customer profile including name, email, ' +
      'account tier (standard/gold/platinum), and account status. ' +
      'Use this BEFORE any order lookups or refund processing to verify ' +
      'customer identity. If multiple customers match a name, returns all ' +
      'matches -- ask for email or customer ID to disambiguate. ' +
      'Does NOT accept order numbers -- use lookup_order for order queries.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Customer email address for lookup (e.g., alice@example.com)',
        },
        customer_id: {
          type: 'string',
          description: 'Customer ID in format C-XXXX (e.g., C-1001)',
        },
      },
    },
  },
  {
    name: 'lookup_order',
    description:
      'Look up an order by its order number (format: ORD-XXXX). Returns ' +
      'order details including items, total amount, status ' +
      '(pending/shipped/delivered/cancelled), tracking info, and delivery date. ' +
      'Requires a verified customer ID from a prior get_customer call -- ' +
      'will fail if the order does not belong to the specified customer. ' +
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
          description: 'Verified customer ID from get_customer (format: C-XXXX)',
        },
      },
      required: ['order_id', 'customer_id'],
    },
  },
];

// ─── Agent Loop ────────────────────────────────────────────────────────────
// Runs a simple agentic loop and tracks which tools were called in order.

async function runWithTools(label, tools, userMessage) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${label}`);
  console.log(`User: "${userMessage}"`);
  console.log('='.repeat(60));

  const messages = [{ role: 'user', content: userMessage }];
  const toolCallLog = [];
  let turnCount = 0;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`  [WARNING] Safety limit reached after ${MAX_TURNS} turns`);
      break;
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system:
        'You are a customer support agent. Use the available tools to help customers. ' +
        'Always verify customer identity before looking up orders.',
      tools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      console.log(`\n  Final response: ${text.substring(0, 200)}...`);
      break;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];

      for (const block of response.content.filter((b) => b.type === 'tool_use')) {
        console.log(`  Turn ${turnCount}: ${block.name}(${JSON.stringify(block.input)})`);
        toolCallLog.push({ tool: block.name, input: block.input });

        const result = executeCsrTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  console.log(`\n  Tool call order: ${toolCallLog.map((c) => c.tool).join(' → ')}`);
  return toolCallLog;
}

// ─── Run Comparison ────────────────────────────────────────────────────────
// The SAME ambiguous query is tested with both tool sets.
// With minimal descriptions, the agent often calls lookup_order directly
// (which fails because no customer_id was verified).
// With expanded descriptions, the agent calls get_customer first.

async function main() {
  const ambiguousQuery =
    'Can you check my order ORD-5001? My email is alice@example.com';

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Task 2.1: Tool Description Quality — Before vs. After   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTest query: "${ambiguousQuery}"`);
  console.log('This query mentions BOTH an order number AND an email.');
  console.log('The correct sequence: get_customer(email) → lookup_order(order_id, customer_id)');

  // BEFORE: Minimal descriptions
  const minimalLog = await runWithTools(
    'BEFORE: Minimal descriptions',
    minimalTools,
    ambiguousQuery
  );

  // AFTER: Expanded descriptions
  const expandedLog = await runWithTools(
    'AFTER: Expanded descriptions',
    expandedTools,
    ambiguousQuery
  );

  // ── Analysis ──────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('ANALYSIS');
  console.log('='.repeat(60));

  const minimalFirst = minimalLog[0]?.tool || 'none';
  const expandedFirst = expandedLog[0]?.tool || 'none';

  console.log(`\n  Minimal descriptions — first tool called: ${minimalFirst}`);
  console.log(`  Expanded descriptions — first tool called: ${expandedFirst}`);

  if (expandedFirst === 'get_customer') {
    console.log('\n  RESULT: Expanded descriptions correctly routed to get_customer first.');
    console.log('  The prerequisite ("Use this BEFORE any order lookups") guided Claude');
    console.log('  to verify customer identity before looking up the order.');
  }

  if (minimalFirst === 'lookup_order') {
    console.log('\n  NOTE: Minimal descriptions may have routed directly to lookup_order.');
    console.log('  Without prerequisite guidance, Claude tried to look up the order');
    console.log('  without a verified customer ID, which would fail with a permission error.');
  }

  console.log('\n  KEY TAKEAWAY: Tool descriptions are the primary selection mechanism.');
  console.log('  Include input formats, prerequisites, boundaries, and routing guidance.');
}

main().catch(console.error);
