/**
 * Task 1.4 — Enforcement & Handoff Using Agent SDK Hook Patterns
 *
 * Exam relevance:
 * - Programmatic enforcement vs. prompt-based guidance
 * - PreToolUse hook blocks tool calls that violate prerequisites
 * - Structured handoff summaries for escalation
 * - The hook approach is declarative and testable
 *
 * This example demonstrates:
 * 1. A PreToolUse hook that blocks process_refund until prerequisites are met
 * 2. A PostToolUse hook that tracks completed tool calls for prerequisite state
 * 3. Structured handoff summary generation when escalating to a human
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Prerequisite Gate Configuration ────────────────────────────────────────
//
// EXAM CONCEPT: Programmatic enforcement
// These gates are enforced in CODE, not just in the prompt.
// Even if the model "decides" to skip verification, the gate blocks it.

const PREREQUISITE_GATES = {
  process_refund: {
    requires: ['get_customer', 'lookup_order'],
    errorMessage:
      'BLOCKED: Cannot process refund. You must first call get_customer to verify ' +
      'the customer identity, then call lookup_order to verify the order. ' +
      'Please complete these steps first.',
  },
  lookup_order: {
    requires: ['get_customer'],
    errorMessage:
      'BLOCKED: Cannot look up order without first verifying customer identity. ' +
      'Call get_customer with the customer email or ID first.',
  },
  escalate_to_human: {
    requires: [],  // No prerequisites — agent can always escalate
    errorMessage: null,
  },
  get_customer: {
    requires: [],  // No prerequisites — this is the first step
    errorMessage: null,
  },
};

// ─── Hook-Based Enforcement ─────────────────────────────────────────────────
//
// EXAM CONCEPT: In the Agent SDK, hooks fire at lifecycle points.
// PreToolUse fires BEFORE the tool executes — it can BLOCK the call.
// PostToolUse fires AFTER — it can log, validate, or modify the result.

/**
 * Create an enforcement-aware agent definition with hooks.
 *
 * The key insight: the hooks maintain a `completedTools` set that tracks
 * which tools have been called successfully. The PreToolUse hook checks
 * this set against the prerequisite gates.
 */
function createEnforcedAgentDefinition() {
  // State for prerequisite tracking (lives for the duration of one conversation)
  const completedTools = new Set();
  const toolCallLog = [];
  let verifiedCustomerId = null;

  return {
    name: 'csr-agent-enforced',
    model: MODEL,
    instructions: csrSystemPrompt,
    tools: csrToolDefinitions,

    hooks: {
      /**
       * PreToolUse Hook — Fires BEFORE each tool execution
       *
       * EXAM CONCEPT: This is where programmatic enforcement happens.
       * If the prerequisites are not met, we BLOCK the tool call by
       * returning an error result instead of executing the tool.
       *
       * @param {Object} params
       * @param {string} params.toolName - The tool being called
       * @param {Object} params.toolInput - The tool's input parameters
       * @returns {Object|null} - Return an error to block, or null to proceed
       */
      preToolUse: ({ toolName, toolInput }) => {
        console.log(`  [Hook:PreToolUse] Checking prerequisites for: ${toolName}`);

        const gate = PREREQUISITE_GATES[toolName];
        if (!gate) {
          console.log(`    No gate configured for ${toolName} — allowing`);
          return null;  // No gate = allow
        }

        // Check if all required tools have been completed
        const missingPrereqs = gate.requires.filter(req => !completedTools.has(req));

        if (missingPrereqs.length > 0) {
          console.log(`    BLOCKED: Missing prerequisites: ${missingPrereqs.join(', ')}`);

          // EXAM CONCEPT: Return a structured error that tells Claude
          // what it needs to do before retrying this tool call
          return {
            blocked: true,
            error: gate.errorMessage,
            missingPrerequisites: missingPrereqs,
          };
        }

        // Additional enforcement: verify customer_id consistency
        if (toolName === 'lookup_order' || toolName === 'process_refund') {
          if (verifiedCustomerId && toolInput.customer_id !== verifiedCustomerId) {
            console.log(`    BLOCKED: customer_id mismatch (expected ${verifiedCustomerId})`);
            return {
              blocked: true,
              error: `Customer ID mismatch. Verified customer is ${verifiedCustomerId}, but tool was called with ${toolInput.customer_id}.`,
            };
          }
        }

        console.log(`    Prerequisites met — allowing`);
        return null;  // All checks passed
      },

      /**
       * PostToolUse Hook — Fires AFTER each tool execution
       *
       * EXAM CONCEPT: Track successful tool calls for prerequisite state.
       * Also captures customer ID from get_customer for consistency checks.
       */
      postToolUse: ({ toolName, toolInput, toolOutput, isError }) => {
        // Only track successful calls
        if (!isError) {
          completedTools.add(toolName);
          console.log(`  [Hook:PostToolUse] ${toolName} succeeded — added to completed set`);

          // Capture verified customer ID for consistency enforcement
          if (toolName === 'get_customer') {
            try {
              const result = JSON.parse(toolOutput);
              if (result.id) {
                verifiedCustomerId = result.id;
                console.log(`    Verified customer ID: ${verifiedCustomerId}`);
              }
            } catch {
              // Non-critical — log and continue
            }
          }
        }

        // Log every tool call for audit trail
        toolCallLog.push({
          toolName,
          input: toolInput,
          isError,
          timestamp: new Date().toISOString(),
          prerequisitesMet: true,  // If we got here, preToolUse passed
        });
      },
    },

    // Expose state for testing and handoff generation
    getState: () => ({
      completedTools: [...completedTools],
      verifiedCustomerId,
      toolCallLog,
    }),
  };
}

// ─── Structured Handoff Summary Generator ───────────────────────────────────
//
// EXAM CONCEPT: When escalating, produce a STRUCTURED summary, not just
// unstructured text. This preserves context for the receiving agent.

function generateHandoffSummary(agentState, escalationResult) {
  const state = agentState.getState();

  return {
    handoffType: 'escalation_to_human',
    timestamp: new Date().toISOString(),
    customer: {
      id: state.verifiedCustomerId || 'unverified',
      verified: state.completedTools.includes('get_customer'),
    },
    agentActions: {
      toolsCompleted: state.completedTools,
      totalToolCalls: state.toolCallLog.length,
      log: state.toolCallLog.map(entry => ({
        tool: entry.toolName,
        success: !entry.isError,
        time: entry.timestamp,
      })),
    },
    escalation: escalationResult,
    context: {
      prerequisiteState: Object.entries(PREREQUISITE_GATES).map(([tool, gate]) => ({
        tool,
        prerequisites: gate.requires,
        satisfied: gate.requires.every(req => state.completedTools.includes(req)),
      })),
    },
  };
}

// ─── Agentic Loop with Enforcement ──────────────────────────────────────────

async function runEnforcedAgent(userMessage) {
  console.log('\n' + '='.repeat(60));
  console.log('CSR Agent with Programmatic Enforcement');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  const agentDef = createEnforcedAgentDefinition();
  const messages = [{ role: 'user', content: userMessage }];
  let turnCount = 0;
  const MAX_TURNS = 15;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`[SAFETY] Max turns reached`);
      break;
    }

    console.log(`\n--- Turn ${turnCount} ---`);

    const response = await client.messages.create({
      model: agentDef.model,
      max_tokens: 4096,
      system: agentDef.instructions,
      tools: agentDef.tools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      console.log(`\nAgent: ${text}`);

      // Generate handoff summary if escalation was part of the flow
      const state = agentDef.getState();
      if (state.completedTools.includes('escalate_to_human')) {
        const lastEscalation = state.toolCallLog
          .filter(l => l.toolName === 'escalate_to_human')
          .pop();
        console.log('\n--- Handoff Summary ---');
        console.log(JSON.stringify(
          generateHandoffSummary(agentDef, lastEscalation),
          null,
          2
        ));
      }

      return text;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];

      for (const block of response.content.filter(b => b.type === 'tool_use')) {
        // ── PreToolUse Hook ─────────────────────────────────────────────
        const preCheck = agentDef.hooks.preToolUse({
          toolName: block.name,
          toolInput: block.input,
        });

        if (preCheck?.blocked) {
          // GATE BLOCKED — return error to Claude instead of executing
          console.log(`  GATE BLOCKED: ${block.name}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({
              error: preCheck.error,
              missingPrerequisites: preCheck.missingPrerequisites,
              instruction: 'Complete the missing prerequisites first, then retry.',
            }),
            is_error: true,
          });
          continue;
        }

        // ── Execute Tool ────────────────────────────────────────────────
        console.log(`  Executing: ${block.name}(${JSON.stringify(block.input)})`);
        const result = executeCsrTool(block.name, block.input);

        // ── PostToolUse Hook ────────────────────────────────────────────
        agentDef.hooks.postToolUse({
          toolName: block.name,
          toolInput: block.input,
          toolOutput: result.content,
          isError: result.isError || false,
        });

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

    break;
  }
}

// ─── Test Cases ─────────────────────────────────────────────────────────────

async function main() {
  // Test 1: Normal flow — should pass all gates
  console.log('\n>>> TEST 1: Normal refund flow (should pass all gates) <<<');
  await runEnforcedAgent(
    "I need to return my order ORD-5001, my email is alice@example.com"
  );

  // Test 2: Escalation — generates structured handoff
  console.log('\n\n>>> TEST 2: Escalation with handoff summary <<<');
  await runEnforcedAgent(
    "I saw this item cheaper on Amazon. Can you price match? My email is bob@example.com"
  );
}

main().catch(console.error);
