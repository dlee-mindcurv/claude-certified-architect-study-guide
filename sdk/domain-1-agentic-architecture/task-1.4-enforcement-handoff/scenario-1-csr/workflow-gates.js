/**
 * Scenario 1: CSR Workflow with Prerequisite Gates and Escalation Handoff
 *
 * Exam relevance (Task 1.4):
 * - Full production-grade CSR agent with programmatic enforcement
 * - Prerequisite gates: process_refund requires get_customer + lookup_order
 * - Customer ID consistency enforcement
 * - Structured handoff summary for escalation
 * - Audit trail of all gate checks and tool calls
 *
 * This is the most complete CSR implementation, combining:
 * - Task 1.1: Agentic loop (stop_reason-driven)
 * - Task 1.4: Prerequisite gates and handoff
 * - The system prompt from shared/prompts/csr-system-prompt.js
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../../shared/prompts/csr-system-prompt.js';
import { createErrorResponse } from '../../../../shared/schemas/error-response.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 15;

// ─── Workflow Gate Engine ───────────────────────────────────────────────────
//
// EXAM CONCEPT: Programmatic enforcement engine
// This class encapsulates all prerequisite checking, state tracking,
// and handoff generation for the CSR workflow.

class WorkflowGateEngine {
  constructor() {
    this.completedTools = new Set();
    this.verifiedCustomerId = null;
    this.verifiedCustomerData = null;
    this.toolCallLog = [];
    this.gateBlockLog = [];
    this.ordersLookedUp = [];
  }

  /**
   * Gate configuration — defines which tools require which prerequisites.
   *
   * EXAM CONCEPT: This is a declarative prerequisite map.
   * Adding a new tool with prerequisites is a single config change.
   */
  static GATES = {
    get_customer: {
      requires: [],
      description: 'Customer verification (no prerequisites)',
    },
    lookup_order: {
      requires: ['get_customer'],
      description: 'Order lookup (requires customer verification)',
    },
    process_refund: {
      requires: ['get_customer', 'lookup_order'],
      description: 'Refund processing (requires customer and order verification)',
    },
    escalate_to_human: {
      requires: [],
      description: 'Escalation (no prerequisites — always allowed)',
    },
  };

  /**
   * Check if a tool call is allowed given the current state.
   *
   * @param {string} toolName
   * @param {Object} toolInput
   * @returns {{ allowed: boolean, error?: string, missing?: string[] }}
   */
  checkGate(toolName, toolInput) {
    const gate = WorkflowGateEngine.GATES[toolName];

    // Unknown tool — allow (or block, depending on policy)
    if (!gate) {
      return { allowed: true };
    }

    // Check prerequisites
    const missing = gate.requires.filter(req => !this.completedTools.has(req));

    if (missing.length > 0) {
      const block = {
        allowed: false,
        missing,
        error: `PREREQUISITE GATE: Cannot call ${toolName}. ` +
          `Missing required steps: ${missing.join(', ')}. ` +
          `${this._getGuidance(missing)}`,
      };

      this.gateBlockLog.push({
        toolName,
        missing,
        timestamp: new Date().toISOString(),
      });

      return block;
    }

    // Customer ID consistency check
    if (this.verifiedCustomerId &&
        toolInput.customer_id &&
        toolInput.customer_id !== this.verifiedCustomerId) {
      return {
        allowed: false,
        error: `CONSISTENCY GATE: Customer ID mismatch. ` +
          `Verified customer is ${this.verifiedCustomerId}, but ${toolName} ` +
          `was called with ${toolInput.customer_id}. Use the verified ID.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a successful tool execution.
   */
  recordSuccess(toolName, toolInput, toolOutput) {
    this.completedTools.add(toolName);

    // Capture customer data for handoff
    if (toolName === 'get_customer') {
      try {
        const data = JSON.parse(toolOutput);
        if (data.id) {
          this.verifiedCustomerId = data.id;
          this.verifiedCustomerData = data;
        }
      } catch { /* non-critical */ }
    }

    // Track orders for handoff
    if (toolName === 'lookup_order') {
      try {
        const order = JSON.parse(toolOutput);
        this.ordersLookedUp.push(order);
      } catch { /* non-critical */ }
    }

    this.toolCallLog.push({
      tool: toolName,
      input: toolInput,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Record a failed tool execution.
   * EXAM NOTE: Failed tools do NOT count as completed prerequisites.
   */
  recordFailure(toolName, toolInput, errorContent) {
    // Deliberately NOT adding to completedTools
    this.toolCallLog.push({
      tool: toolName,
      input: toolInput,
      success: false,
      error: errorContent,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Generate a structured handoff summary for escalation.
   *
   * EXAM CONCEPT: Structured handoff preserves context for the receiving agent.
   * Every field is machine-parsable and auditable.
   */
  generateHandoffSummary(escalationInput) {
    return {
      handoff: {
        type: 'escalation_to_human',
        generatedAt: new Date().toISOString(),
      },
      customer: this.verifiedCustomerData
        ? {
            id: this.verifiedCustomerData.id,
            name: this.verifiedCustomerData.name,
            email: this.verifiedCustomerData.email,
            tier: this.verifiedCustomerData.tier,
            verified: true,
          }
        : {
            id: escalationInput?.customer_id || 'unknown',
            verified: false,
          },
      issue: {
        summary: escalationInput?.issue_summary || 'No summary provided',
        priority: escalationInput?.priority || 'medium',
      },
      agentActions: {
        toolsCompleted: [...this.completedTools],
        actionsTaken: escalationInput?.actions_taken || [],
        gateBlocks: this.gateBlockLog.length,
        totalToolCalls: this.toolCallLog.length,
      },
      recommendation: {
        action: escalationInput?.recommended_action || 'Review and resolve',
      },
      orders: this.ordersLookedUp.map(o => ({
        id: o.orderId,
        status: o.status,
        total: o.total,
      })),
      auditTrail: this.toolCallLog,
    };
  }

  /**
   * Helper: Generate guidance for missing prerequisites.
   */
  _getGuidance(missing) {
    const guidance = [];
    if (missing.includes('get_customer')) {
      guidance.push('Call get_customer with the customer email or ID to verify identity.');
    }
    if (missing.includes('lookup_order')) {
      guidance.push('Call lookup_order with the order ID and verified customer ID.');
    }
    return guidance.join(' ');
  }
}

// ─── CSR Agent with Full Enforcement ────────────────────────────────────────

export async function runCsrAgentWithGates(userMessage) {
  console.log('\n' + '='.repeat(70));
  console.log('  CSR AGENT — Full Workflow with Prerequisite Gates');
  console.log('='.repeat(70));
  console.log(`\nCustomer: ${userMessage}\n`);

  const gates = new WorkflowGateEngine();
  const messages = [{ role: 'user', content: userMessage }];
  let turnCount = 0;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`[SAFETY] Max turns (${MAX_TURNS}) reached`);
      break;
    }

    console.log(`\n--- Turn ${turnCount} ---`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: csrSystemPrompt,
      tools: csrToolDefinitions,
      messages,
    });

    // ── stop_reason check (Task 1.1) ──────────────────────────────────────

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      console.log(`\nAgent: ${text}`);

      // Print enforcement summary
      console.log(`\n--- Enforcement Summary ---`);
      console.log(`  Tools completed: [${[...gates.completedTools].join(', ')}]`);
      console.log(`  Gate blocks: ${gates.gateBlockLog.length}`);
      console.log(`  Total turns: ${turnCount}`);

      // Generate handoff if escalation occurred
      if (gates.completedTools.has('escalate_to_human')) {
        const lastEscalation = gates.toolCallLog
          .filter(l => l.tool === 'escalate_to_human' && l.success)
          .pop();

        console.log('\n--- Structured Handoff Summary ---');
        const handoff = gates.generateHandoffSummary(lastEscalation?.input);
        console.log(JSON.stringify(handoff, null, 2));
      }

      return {
        text,
        enforcement: {
          completedTools: [...gates.completedTools],
          gateBlocks: gates.gateBlockLog,
          toolCallLog: gates.toolCallLog,
        },
      };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];

      for (const block of response.content.filter(b => b.type === 'tool_use')) {

        // ── PREREQUISITE GATE CHECK ─────────────────────────────────────
        //
        // EXAM CONCEPT: This runs BEFORE every tool execution.
        // It is programmatic enforcement — the model cannot bypass it.
        const gateResult = gates.checkGate(block.name, block.input);

        if (!gateResult.allowed) {
          console.log(`  [GATE BLOCKED] ${block.name}`);
          console.log(`    Missing: ${gateResult.missing?.join(', ') || 'N/A'}`);
          console.log(`    Message: ${gateResult.error}`);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({
              gateBocked: true,
              error: gateResult.error,
              missingPrerequisites: gateResult.missing,
              instruction: 'Complete the listed prerequisites first, then retry.',
            }),
            is_error: true,
          });
          continue;
        }

        // ── EXECUTE TOOL ────────────────────────────────────────────────
        console.log(`  [EXECUTING] ${block.name}(${JSON.stringify(block.input)})`);
        const result = executeCsrTool(block.name, block.input);

        if (result.isError) {
          const parsed = JSON.parse(result.content);
          console.log(`    [ERROR] ${parsed.errorCategory}: ${parsed.message}`);
          gates.recordFailure(block.name, block.input, parsed.message);
        } else {
          console.log(`    [OK] ${result.content.substring(0, 80)}...`);
          gates.recordSuccess(block.name, block.input, result.content);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    console.error(`Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }
}

// ─── Test Cases ─────────────────────────────────────────────────────────────

async function main() {
  // Test 1: Normal refund flow
  // Expected: get_customer → lookup_order → process_refund (all gates pass)
  console.log('\n\n' + '#'.repeat(70));
  console.log('  TEST 1: Normal Refund Flow');
  console.log('#'.repeat(70));
  await runCsrAgentWithGates(
    "I need a refund for order ORD-5001. My email is alice@example.com"
  );

  // Test 2: Escalation with structured handoff
  // Expected: Escalation with full handoff summary
  console.log('\n\n' + '#'.repeat(70));
  console.log('  TEST 2: Escalation (Policy Exception)');
  console.log('#'.repeat(70));
  await runCsrAgentWithGates(
    "I found this item for less on another website. Can you match their price? " +
    "My email is bob@example.com"
  );

  // Test 3: Immediate escalation (customer request)
  // Expected: escalate_to_human called immediately (no prerequisites needed)
  console.log('\n\n' + '#'.repeat(70));
  console.log('  TEST 3: Customer Requests Human Agent');
  console.log('#'.repeat(70));
  await runCsrAgentWithGates(
    "I want to talk to a real person."
  );
}

main().catch(console.error);
