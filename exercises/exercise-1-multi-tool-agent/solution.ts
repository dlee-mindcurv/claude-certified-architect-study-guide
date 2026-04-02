/**
 * Exercise 1 — SOLUTION: Multi-Tool Agent with Escalation Logic
 *
 * Domains: D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)
 *
 * Uses @anthropic-ai/claude-agent-sdk query() with mock CSR MCP tools
 * and a PreToolUse hook for deterministic refund threshold enforcement.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../shared/tools/csr-tools.js';

const REFUND_THRESHOLD = 100;

// ─── PreToolUse Hook: Refund Threshold ─────────────────────────────────────
//
// EXAM KEY CONCEPT: Hooks are deterministic — the model CANNOT bypass them.
// This is unlike prompt instructions which are probabilistic.

const refundGuardHook: HookCallback = async (_input) => {
  const input = _input as { tool_input?: { amount?: number }; [key: string]: unknown };
  const amount = input.tool_input?.amount;
  if (typeof amount === 'number' && amount > REFUND_THRESHOLD) {
    console.log(`  [HOOK] Blocked refund $${amount} (limit: $${REFUND_THRESHOLD})`);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Refund of $${amount} exceeds the $${REFUND_THRESHOLD} auto-approval limit. ` +
          `Please escalate to a human agent.`,
      },
    };
  }
  return {}; // allow
};

// ─── Run Agent ─────────────────────────────────────────────────────────────

async function runAgent(userMessage: string) {
  console.log(`\nCustomer: ${userMessage}\n`);

  for await (const message of query({
    prompt: userMessage,
    options: {
      // Provide the CSR MCP server with all 4 tools
      mcpServers: { csr: csrServer },

      // Auto-allow all CSR tools (no permission prompts)
      allowedTools: [
        'mcp__csr__get_customer',
        'mcp__csr__lookup_order',
        'mcp__csr__process_refund',
        'mcp__csr__escalate_to_human',
      ],

      // Hooks for deterministic enforcement
      hooks: {
        PreToolUse: [{
          matcher: 'mcp__csr__process_refund',
          hooks: [refundGuardHook],
        }],
      },

      permissionMode: 'bypassPermissions',
      maxTurns: 15,
    },
  })) {
    // Log assistant messages for visibility
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          console.log(`  Tool call: ${block.name}(${JSON.stringify(block.input).slice(0, 80)})`);
        }
      }
    }

    // Return the final result
    if (message.type === 'result' && message.subtype === 'success') {
      return message.result;
    }
  }

  return '[Agent did not produce a result]';
}

// ─── Test Scenarios ────────────────────────────────────────────────────────

const scenarios = [
  // A: Simple order status check
  'Hi, my email is alice@example.com. Can you check the status of order ORD-5002?',
  // B: Refund under threshold (processes directly)
  "I'm customer C-1002 and I want a $50 refund for order ORD-5003. Broken spacebar.",
  // C: Refund over threshold (hook blocks, agent should escalate)
  "I'm customer C-1001, refund $105.97 for order ORD-5001. Headphones stopped working.",
  // D: Multi-concern
  "I'm alice@example.com. Refund $79.99 for damaged headphones in ORD-5001, and check ORD-5002 status.",
];

async function main() {
  console.log('Exercise 1 — SOLUTION: Multi-Tool Agent with Escalation Logic\n');
  const idx = parseInt(process.argv[2] || '0', 10);
  const scenario = scenarios[idx] || scenarios[0];

  const result = await runAgent(scenario);
  console.log('\n' + '='.repeat(60));
  console.log('FINAL RESPONSE:');
  console.log('='.repeat(60));
  console.log(result);
}

main().catch(console.error);
