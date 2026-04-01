/**
 * Exercise 1 — STARTER: Build a Multi-Tool Agent with Escalation Logic
 *
 * Domains: D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)
 *
 * Complete the TODOs below to build a working customer support agent.
 * Run with: npm run exercise:1
 */

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { csrToolDefinitions, executeCsrTool } from '../../shared/tools/csr-tools.js';
import { createErrorResponse } from '../../shared/schemas/error-response.js';
import { csrSystemPrompt } from '../../shared/prompts/csr-system-prompt.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_ITERATIONS = 15;
const REFUND_ESCALATION_THRESHOLD = 100; // dollars

// ─── Step 1: Tool Definitions ───────────────────────────────────────────────
// The tool definitions are imported from shared/tools/csr-tools.js.
// Review csrToolDefinitions — note how descriptions disambiguate similar tools:
//   - get_customer vs lookup_order (both look things up)
//   - process_refund vs escalate_to_human (both resolve issues)
//
// TODO 1: Examine the tool definitions. For learning purposes, write a brief
// comment below explaining WHY each of these description techniques matters:
//
// a) "Does NOT accept order numbers — use lookup_order for order queries."
//    Why does this negative instruction help?
//    YOUR ANSWER:
//
// b) "Requires a verified customer ID from a prior get_customer call"
//    Why state preconditions in the description?
//    YOUR ANSWER:
//
// c) The input_schema uses format hints like "format: C-XXXX"
//    Why include format examples?
//    YOUR ANSWER:

// ─── Step 2: Agentic Loop ──────────────────────────────────────────────────

/**
 * Run the agentic loop: send messages to Claude, handle tool calls, repeat.
 *
 * @param {string} userMessage - The customer's message
 * @returns {Promise<string>} - The agent's final text response
 */
async function runAgentLoop(userMessage) {
  const messages = [{ role: 'user', content: userMessage }];
  let iterations = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Customer: ${userMessage}`);
  console.log('='.repeat(60));

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`\n--- Iteration ${iterations} ---`);

    // TODO 2a: Call the Claude API with:
    //   - model: MODEL
    //   - max_tokens: 4096
    //   - system: csrSystemPrompt
    //   - tools: csrToolDefinitions
    //   - messages: messages
    //
    // const response = ???

    // TODO 2b: Check the stop_reason.
    // If stop_reason === 'end_turn':
    //   - Extract the text content from response.content
    //   - Log it and return it
    //
    // If stop_reason === 'tool_use':
    //   - Push the assistant's response onto messages
    //   - Process each tool_use block (see Step 3 and 4 below)
    //   - Push tool results back onto messages
    //   - Continue the loop
    //
    // Hint: response.content is an array of content blocks.
    //   Text blocks have type === 'text'
    //   Tool use blocks have type === 'tool_use' with .name, .input, .id

    break; // Remove this once you implement the loop
  }

  if (iterations >= MAX_ITERATIONS) {
    console.log('Max iterations reached — forcing end.');
    return 'I apologize, but I was unable to complete your request. Let me connect you with a human agent.';
  }
}

// ─── Step 3: Error Response Handling ────────────────────────────────────────

/**
 * Execute a tool call and return the result formatted for the messages array.
 *
 * @param {string} toolName - The tool to execute
 * @param {Object} toolInput - The tool's input parameters
 * @returns {Object} - Tool result with { type, tool_use_id, content }
 */
function executeToolWithErrorHandling(toolName, toolInput, toolUseId) {
  console.log(`  Tool: ${toolName}(${JSON.stringify(toolInput)})`);

  // TODO 3: Execute the tool and handle errors.
  //
  // 1. Call executeCsrTool(toolName, toolInput)
  // 2. Check if result.isError is true
  //    - If yes, parse the error JSON from result.content
  //    - Log the errorCategory and whether it's retryable
  //    - Return the error as a tool_result (the model will decide what to do)
  // 3. If no error, log the result and return it
  //
  // Return format:
  // {
  //   type: 'tool_result',
  //   tool_use_id: toolUseId,
  //   content: result.content,        // string
  //   is_error: result.isError || false
  // }

  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: JSON.stringify({ message: 'TODO: implement tool execution' }),
    is_error: false,
  };
}

// ─── Step 4: Escalation Hook ────────────────────────────────────────────────

/**
 * Pre-execution hook that checks if a refund should be blocked and escalated.
 *
 * @param {string} toolName - The tool about to be executed
 * @param {Object} toolInput - The tool's input parameters
 * @returns {Object|null} - Blocked response if threshold exceeded, null otherwise
 */
function checkEscalationHook(toolName, toolInput) {
  // TODO 4: Implement the escalation hook.
  //
  // If toolName === 'process_refund' AND toolInput.amount > REFUND_ESCALATION_THRESHOLD:
  //   1. Log that the refund was blocked
  //   2. Return a structured error response using createErrorResponse:
  //      {
  //        errorCategory: 'business',
  //        isRetryable: false,
  //        message: `Refund of $${toolInput.amount} exceeds the $${REFUND_ESCALATION_THRESHOLD} auto-approval threshold. This refund requires human approval. Please escalate to a human agent with the refund details.`,
  //        context: { blocked_amount: toolInput.amount, threshold: REFUND_ESCALATION_THRESHOLD }
  //      }
  //   3. Format it as a tool_result (caller will set tool_use_id)
  //
  // Otherwise return null (allow the tool to execute normally)

  return null;
}

// ─── Step 5: Test Scenarios ─────────────────────────────────────────────────

const testScenarios = [
  // Scenario A: Simple order status check
  'Hi, my email is alice@example.com. Can you check the status of order ORD-5002?',

  // Scenario B: Refund under threshold (should process directly)
  "I'm customer C-1002 and I want a refund for order ORD-5003. The keyboard arrived with a broken spacebar. Refund amount: $50.",

  // Scenario C: Refund over threshold (should trigger escalation hook)
  "I'm customer C-1001 and I need a full refund of $105.97 for order ORD-5001. The headphones stopped working.",

  // Scenario D: Multi-concern message
  "I'm alice@example.com. I need a refund for the damaged headphones in order ORD-5001 (refund $79.99), and also can you check where my order ORD-5002 is?",

  // Scenario E: Ambiguous customer (multiple matches by name)
  'Hi, my name is Alice Johnson. I need help with my recent order.',
];

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Exercise 1: Multi-Tool Agent with Escalation Logic');
  console.log('Complete the TODOs in this file, then run again.\n');

  // Run one scenario at a time for testing. Change the index to test others.
  const scenarioIndex = 0;
  const scenario = testScenarios[scenarioIndex];

  try {
    const result = await runAgentLoop(scenario);
    console.log(`\n${'='.repeat(60)}`);
    console.log('Agent final response:');
    console.log(result);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
