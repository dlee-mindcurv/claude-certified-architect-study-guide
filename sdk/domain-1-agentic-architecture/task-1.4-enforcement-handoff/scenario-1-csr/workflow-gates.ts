/**
 * Scenario 1: CSR Workflow with Prerequisite Gates via Agent SDK Hooks
 *
 * Exam relevance (Task 1.4):
 * - Full production-grade CSR agent with programmatic enforcement
 * - PreToolUse hook: process_refund requires get_customer + lookup_order
 * - PostToolUse hook: tracks state and captures verified customer ID
 * - Structured handoff summary for escalation
 *
 * EXAM KEY CONCEPT:
 *   The hooks object in query() options provides lifecycle callbacks.
 *   PreToolUse can return permissionDecision: 'deny' to block a tool call.
 *   This is programmatic enforcement -- the model cannot bypass it.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../../shared/prompts/csr-system-prompt.js';

// ─── Workflow Gate Engine ───────────────────────────────────────────────────

class WorkflowGateEngine {
  constructor() {
    this.completedTools = new Set();
    this.verifiedCustomerId = null;
    this.verifiedCustomerData = null;
    this.toolCallLog = [];
    this.gateBlockLog = [];
  }

  // EXAM CONCEPT: Declarative prerequisite map
  static GATES = {
    mcp__csr__get_customer: { requires: [] },
    mcp__csr__lookup_order: { requires: ['mcp__csr__get_customer'] },
    mcp__csr__process_refund: { requires: ['mcp__csr__get_customer', 'mcp__csr__lookup_order'] },
    mcp__csr__escalate_to_human: { requires: [] },
  };

  /**
   * PreToolUse hook callback.
   * Returns HookJSONOutput with permissionDecision 'allow' or 'deny'.
   */
  createPreToolUseHook() {
    return async (input) => {
      const toolName = input.tool_name;
      const gate = WorkflowGateEngine.GATES[toolName];

      if (!gate) {
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
      }

      const missing = gate.requires.filter(req => !this.completedTools.has(req));

      if (missing.length > 0) {
        this.gateBlockLog.push({ toolName, missing, timestamp: new Date().toISOString() });
        console.log(`  [GATE BLOCKED] ${toolName} -- missing: ${missing.join(', ')}`);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `PREREQUISITE GATE: Cannot call ${toolName}. Missing: ${missing.join(', ')}. Complete these first.`,
          },
        };
      }

      // Customer ID consistency
      if (this.verifiedCustomerId && input.tool_input?.customer_id &&
          input.tool_input.customer_id !== this.verifiedCustomerId) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `CONSISTENCY GATE: Expected customer ${this.verifiedCustomerId}, got ${input.tool_input.customer_id}.`,
          },
        };
      }

      console.log(`  [GATE PASSED] ${toolName}`);
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
    };
  }

  /**
   * PostToolUse hook callback.
   * Tracks successful tool calls for prerequisite state.
   */
  createPostToolUseHook() {
    return async (input) => {
      const toolName = input.tool_name;

      let isError = false;
      try {
        const output = JSON.parse(input.tool_output);
        isError = !!output.errorCategory;
      } catch { /* non-JSON */ }

      if (!isError) {
        this.completedTools.add(toolName);

        if (toolName === 'mcp__csr__get_customer') {
          try {
            const data = JSON.parse(input.tool_output);
            if (data.id) {
              this.verifiedCustomerId = data.id;
              this.verifiedCustomerData = data;
            }
          } catch { /* non-critical */ }
        }
      }

      this.toolCallLog.push({
        tool: toolName,
        success: !isError,
        timestamp: new Date().toISOString(),
      });

      return {};
    };
  }

  /**
   * Generate a structured handoff summary for escalation.
   *
   * EXAM CONCEPT: Structured handoff preserves context for the receiving agent.
   */
  generateHandoffSummary() {
    return {
      handoff: { type: 'escalation_to_human', generatedAt: new Date().toISOString() },
      customer: this.verifiedCustomerData
        ? {
            id: this.verifiedCustomerData.id,
            name: this.verifiedCustomerData.name,
            email: this.verifiedCustomerData.email,
            tier: this.verifiedCustomerData.tier,
            verified: true,
          }
        : { id: 'unknown', verified: false },
      agentActions: {
        toolsCompleted: [...this.completedTools],
        gateBlocks: this.gateBlockLog.length,
        totalToolCalls: this.toolCallLog.length,
      },
      auditTrail: this.toolCallLog,
    };
  }
}

// ─── CSR Agent with Full Enforcement ────────────────────────────────────────

export async function runCsrAgentWithGates(userMessage) {
  console.log('\n' + '='.repeat(70));
  console.log('  CSR AGENT -- Full Workflow with Prerequisite Gates');
  console.log('='.repeat(70));
  console.log(`\nCustomer: ${userMessage}\n`);

  const gates = new WorkflowGateEngine();
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

      // EXAM KEY CONCEPT: Hook callbacks bound to the gate engine instance
      hooks: {
        PreToolUse: [
          { hooks: [gates.createPreToolUseHook()] },
        ],
        PostToolUse: [
          { hooks: [gates.createPostToolUseHook()] },
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

  // Print enforcement summary
  console.log(`\n--- Enforcement Summary ---`);
  console.log(`  Tools completed: [${[...gates.completedTools].join(', ')}]`);
  console.log(`  Gate blocks: ${gates.gateBlockLog.length}`);

  // Generate handoff if escalation occurred
  if (gates.completedTools.has('mcp__csr__escalate_to_human')) {
    console.log('\n--- Structured Handoff Summary ---');
    console.log(JSON.stringify(gates.generateHandoffSummary(), null, 2));
  }

  return { text: finalText, gates };
}

// ─── Test Cases ─────────────────────────────────────────────────────────────

async function main() {
  // Test 1: Normal refund flow (all gates pass)
  console.log('\n\n' + '#'.repeat(70));
  console.log('  TEST 1: Normal Refund Flow');
  console.log('#'.repeat(70));
  await runCsrAgentWithGates(
    "I need a refund for order ORD-5001. My email is alice@example.com"
  );

  // Test 2: Escalation with structured handoff
  console.log('\n\n' + '#'.repeat(70));
  console.log('  TEST 2: Escalation (Policy Exception)');
  console.log('#'.repeat(70));
  await runCsrAgentWithGates(
    "I found this item for less on another website. Can you match their price? " +
    "My email is bob@example.com"
  );

  // Test 3: Immediate escalation (no prerequisites needed)
  console.log('\n\n' + '#'.repeat(70));
  console.log('  TEST 3: Customer Requests Human Agent');
  console.log('#'.repeat(70));
  await runCsrAgentWithGates(
    "I want to talk to a real person."
  );
}

main().catch(console.error);
