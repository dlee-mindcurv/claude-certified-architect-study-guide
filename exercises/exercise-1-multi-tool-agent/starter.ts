/**
 * Exercise 1 — STARTER: Build a Multi-Tool Agent with Escalation Logic
 *
 * Domains: D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)
 *
 * Uses @anthropic-ai/claude-agent-sdk's query() with mock MCP tools.
 * Run with: npm run exercise:1
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../shared/tools/csr-tools.js';

// ─── Step 1: Understand Tool Descriptions ──────────────────────────────────
//
// The CSR tools are defined in shared/tools/csr-tools.js using the Agent SDK's
// tool() function with zod schemas. They're bundled into csrServer via
// createSdkMcpServer().
//
// When we pass csrServer as an MCP server, tool names become:
//   mcp__csr__get_customer, mcp__csr__lookup_order, etc.
//
// TODO 1: Review the tool descriptions in csr-tools.js and answer:
//
// a) Why does get_customer say "Does NOT accept order numbers"?
//    YOUR ANSWER:
//
// b) Why does lookup_order say "Requires a verified customer_id"?
//    YOUR ANSWER:

// ─── Step 2: Run the Agent with query() ────────────────────────────────────
//
// EXAM KEY CONCEPT: With the Agent SDK, you do NOT write an agentic loop.
// query() handles the loop internally (send → check stop_reason → execute
// tools → loop). You iterate over the output messages.

async function runAgent(userMessage: string) {
  console.log(`\nCustomer: ${userMessage}\n`);

  // TODO 2: Call query() with:
  //   prompt: userMessage
  //   options:
  //     mcpServers: { csr: csrServer }
  //     allowedTools: all 4 CSR tools (mcp__csr__get_customer, etc.)
  //     permissionMode: 'bypassPermissions'
  //     maxTurns: 15
  //
  // Then iterate the result with for-await-of:
  //   for await (const message of query({ prompt, options })) {
  //     if (message.type === 'result' && message.subtype === 'success') {
  //       return message.result;
  //     }
  //   }
  //
  // Hint: The Agent SDK's query() returns an AsyncGenerator<SDKMessage>.
  // The final result message has type='result' and subtype='success'.

  return 'TODO: implement query() call';
}

// ─── Step 3: Add a PreToolUse Hook for Escalation ──────────────────────────
//
// EXAM KEY CONCEPT: Hooks provide DETERMINISTIC enforcement. The model
// cannot bypass a hook — it runs as code before every tool call.
//
// In the Agent SDK, hooks are passed via options.hooks:
//   hooks: {
//     PreToolUse: [{ matcher: 'mcp__csr__process_refund', hooks: [myHookFn] }]
//   }

const REFUND_THRESHOLD = 100;

// TODO 3: Write a PreToolUse hook function that:
//   - Checks if tool_input.amount > REFUND_THRESHOLD
//   - If yes, returns: {
//       hookSpecificOutput: {
//         hookEventName: 'PreToolUse',
//         permissionDecision: 'deny',
//         permissionDecisionReason: `Refund $${amount} exceeds $${REFUND_THRESHOLD} limit`
//       }
//     }
//   - If no, returns: {} (allow)
//
// async function refundGuardHook(input, toolUseID, { signal }) {
//   // ...
// }

// TODO 4: Add the hook to your query() options from Step 2:
//   hooks: {
//     PreToolUse: [{
//       matcher: 'mcp__csr__process_refund',
//       hooks: [refundGuardHook]
//     }]
//   }

// ─── Test Scenarios ────────────────────────────────────────────────────────

const scenarios = [
  'Hi, my email is alice@example.com. Can you check the status of order ORD-5002?',
  "I'm customer C-1002 and I want a $50 refund for order ORD-5003. Broken spacebar.",
  "I'm customer C-1001, refund $105.97 for order ORD-5001. Headphones stopped working.",
];

async function main() {
  console.log('Exercise 1: Multi-Tool Agent with Escalation Logic');
  console.log('Complete the TODOs, then run again.\n');

  const idx = parseInt(process.argv[2] || '0', 10);
  const result = await runAgent(scenarios[idx] || scenarios[0]);
  console.log('\n--- Final Response ---');
  console.log(result);
}

main().catch(console.error);
