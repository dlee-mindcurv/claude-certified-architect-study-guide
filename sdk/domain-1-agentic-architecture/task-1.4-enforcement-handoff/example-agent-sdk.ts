/**
 * Task 1.4 -- Enforcement and Handoff Using Agent SDK Hooks
 *
 * Exam relevance:
 * - Programmatic enforcement vs. prompt-based guidance
 * - PreToolUse hook blocks tool calls that violate prerequisites
 * - PostToolUse hook tracks completed tools for prerequisite state
 * - Structured handoff summaries for escalation
 *
 * EXAM KEY CONCEPT:
 *   Hooks provide DETERMINISTIC enforcement. Even if the model "decides"
 *   to skip verification, the PreToolUse hook blocks the call in code.
 *   This is stronger than prompt-based rules which are probabilistic.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';

// ─── Prerequisite Gate State ───────────────────────────────────────────────
// Track which tools have been called successfully in this conversation.

const completedTools = new Set();
let verifiedCustomerId = null;

// ─── PreToolUse Hook: Prerequisite Gate ─────────────────────────────────────
//
// EXAM CONCEPT: This hook fires BEFORE each tool execution.
// If prerequisites are not met, it returns a 'deny' permission decision,
// which blocks the tool call and returns an error to Claude.

async function prerequisiteGateHook(input) {
  const toolName = input.tool_name;

  // Define prerequisite requirements
  const gates = {
    mcp__csr__process_refund: {
      requires: ['mcp__csr__get_customer', 'mcp__csr__lookup_order'],
      errorMessage: 'Cannot process refund without first verifying customer (get_customer) and order (lookup_order).',
    },
    mcp__csr__lookup_order: {
      requires: ['mcp__csr__get_customer'],
      errorMessage: 'Cannot look up order without first verifying customer identity via get_customer.',
    },
  };

  const gate = gates[toolName];
  if (!gate) {
    // No gate configured -- allow
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  const missing = gate.requires.filter(req => !completedTools.has(req));

  if (missing.length > 0) {
    console.log(`  [GATE BLOCKED] ${toolName} -- missing: ${missing.join(', ')}`);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `PREREQUISITE GATE: ${gate.errorMessage} Missing steps: ${missing.join(', ')}. Complete these first.`,
      },
    };
  }

  // Additional: customer_id consistency check
  if (verifiedCustomerId && input.tool_input?.customer_id && input.tool_input.customer_id !== verifiedCustomerId) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `CONSISTENCY GATE: Customer ID mismatch. Verified: ${verifiedCustomerId}, received: ${input.tool_input.customer_id}.`,
      },
    };
  }

  console.log(`  [GATE PASSED] ${toolName}`);
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
}

// ─── PostToolUse Hook: Track Completed Tools ────────────────────────────────

async function trackCompletedToolsHook(input) {
  const toolName = input.tool_name;

  // Parse output to check for errors
  let isError = false;
  try {
    const output = JSON.parse(input.tool_output);
    isError = !!output.errorCategory;
  } catch { /* non-JSON output */ }

  if (!isError) {
    completedTools.add(toolName);
    console.log(`  [TRACKED] ${toolName} completed successfully`);

    // Capture verified customer ID for consistency checks
    if (toolName === 'mcp__csr__get_customer') {
      try {
        const result = JSON.parse(input.tool_output);
        if (result.id) {
          verifiedCustomerId = result.id;
          console.log(`  [VERIFIED] Customer ID: ${verifiedCustomerId}`);
        }
      } catch { /* non-critical */ }
    }
  }

  return {};
}

// ─── Run Agent with Enforcement Hooks ───────────────────────────────────────

async function runEnforcedAgent(userMessage) {
  console.log('\n' + '='.repeat(60));
  console.log('CSR Agent with Programmatic Enforcement (Agent SDK)');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  // Reset state for each conversation
  completedTools.clear();
  verifiedCustomerId = null;

  let finalText = '';

  for await (const message of query({
    prompt: userMessage,
    options: {
      systemPrompt: csrSystemPrompt,

      mcpServers: {
        csr: csrServer,
      },

      allowedTools: [
        'mcp__csr__get_customer',
        'mcp__csr__lookup_order',
        'mcp__csr__process_refund',
        'mcp__csr__escalate_to_human',
      ],

      // EXAM KEY CONCEPT: Hooks provide deterministic enforcement.
      // PreToolUse fires BEFORE tool execution -- can block it.
      // PostToolUse fires AFTER -- tracks state for prerequisites.
      hooks: {
        PreToolUse: [
          { hooks: [prerequisiteGateHook] },
        ],
        PostToolUse: [
          { hooks: [trackCompletedToolsHook] },
        ],
      },

      maxTurns: 15,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  console.log(`\nAgent: ${finalText}`);
  console.log(`\n--- Enforcement Summary ---`);
  console.log(`  Tools completed: [${[...completedTools].join(', ')}]`);
  return finalText;
}

// ─── Test Cases ─────────────────────────────────────────────────────────────

async function main() {
  // Test 1: Normal flow -- should pass all gates
  console.log('\n>>> TEST 1: Normal refund flow (should pass all gates) <<<');
  await runEnforcedAgent(
    "I need to return my order ORD-5001, my email is alice@example.com"
  );

  // Test 2: Escalation -- generates structured handoff
  console.log('\n\n>>> TEST 2: Escalation with handoff <<<');
  await runEnforcedAgent(
    "I saw this item cheaper on Amazon. Can you price match? My email is bob@example.com"
  );
}

main().catch(console.error);
