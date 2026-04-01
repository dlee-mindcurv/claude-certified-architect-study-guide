/**
 * Exercise 1 — SOLUTION: Build a Multi-Tool Agent with Escalation Logic
 *
 * Domains: D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)
 *
 * This is the complete working implementation.
 * Run with: node exercises/exercise-1-multi-tool-agent/solution.js
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
//
// The tool definitions in csrToolDefinitions use these key disambiguation techniques:
//
// a) Negative instructions ("Does NOT accept order numbers"):
//    Prevents the model from sending the wrong input type to a tool when two tools
//    handle similar entities. Without this, the model might try to pass an order ID
//    to get_customer.
//
// b) Precondition statements ("Requires a verified customer ID from get_customer"):
//    Establishes execution order — the model learns it must call get_customer first.
//    This prevents authorization errors from calling lookup_order without a valid
//    customer_id.
//
// c) Format examples ("format: C-XXXX"):
//    Reduces validation errors by showing the expected input pattern. The model can
//    extract and format IDs correctly from natural language.

// ─── Step 2: Agentic Loop ──────────────────────────────────────────────────

/**
 * Run the agentic loop: send messages to Claude, handle tool calls, repeat.
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

    // Step 2a: Call the Claude API
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: csrSystemPrompt,
      tools: csrToolDefinitions,
      messages,
    });

    console.log(`  stop_reason: ${response.stop_reason}`);

    // Step 2b: Check stop_reason
    if (response.stop_reason === 'end_turn') {
      // Extract text content from the response
      const textBlocks = response.content.filter((block) => block.type === 'text');
      const finalResponse = textBlocks.map((b) => b.text).join('\n');
      console.log(`  Agent says: ${finalResponse.substring(0, 200)}...`);
      return finalResponse;
    }

    if (response.stop_reason === 'tool_use') {
      // Push the assistant's full response (including tool_use blocks) onto messages
      messages.push({ role: 'assistant', content: response.content });

      // Process each tool_use block
      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const result = executeToolWithErrorHandling(toolUse.name, toolUse.input, toolUse.id);
        toolResults.push(result);
      }

      // Push all tool results back as a single user message
      messages.push({ role: 'user', content: toolResults });
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.log('Max iterations reached — forcing end.');
    return 'I apologize, but I was unable to complete your request. Let me connect you with a human agent.';
  }
}

// ─── Step 3: Error Response Handling ────────────────────────────────────────

/**
 * Execute a tool call and return the result formatted for the messages array.
 */
function executeToolWithErrorHandling(toolName, toolInput, toolUseId) {
  console.log(`  Tool: ${toolName}(${JSON.stringify(toolInput)})`);

  // Step 4: Check escalation hook BEFORE executing
  const blocked = checkEscalationHook(toolName, toolInput);
  if (blocked) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: blocked.content,
      is_error: true,
    };
  }

  // Step 3: Execute the tool
  const result = executeCsrTool(toolName, toolInput);

  if (result.isError) {
    const errorData = JSON.parse(result.content);
    console.log(`  ERROR [${errorData.errorCategory}] retryable=${errorData.isRetryable}: ${errorData.message}`);
  } else {
    const data = JSON.parse(result.content);
    console.log(`  Result: ${JSON.stringify(data).substring(0, 150)}...`);
  }

  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: result.content,
    is_error: result.isError || false,
  };
}

// ─── Step 4: Escalation Hook ────────────────────────────────────────────────

/**
 * Pre-execution hook that checks if a refund should be blocked and escalated.
 */
function checkEscalationHook(toolName, toolInput) {
  if (toolName === 'process_refund' && toolInput.amount > REFUND_ESCALATION_THRESHOLD) {
    console.log(`  HOOK: Blocking refund of $${toolInput.amount} (threshold: $${REFUND_ESCALATION_THRESHOLD})`);

    return createErrorResponse({
      errorCategory: 'business',
      isRetryable: false,
      message:
        `Refund of $${toolInput.amount} exceeds the $${REFUND_ESCALATION_THRESHOLD} ` +
        `auto-approval threshold. This refund requires human approval. ` +
        `Please escalate to a human agent with the refund details.`,
      context: {
        blocked_amount: toolInput.amount,
        threshold: REFUND_ESCALATION_THRESHOLD,
        required_action: 'escalate_to_human',
      },
    });
  }

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
  console.log('Exercise 1 — SOLUTION: Multi-Tool Agent with Escalation Logic\n');

  // Run one scenario at a time. Change the index to test different scenarios.
  const scenarioIndex = parseInt(process.argv[2] || '0', 10);
  const scenario = testScenarios[scenarioIndex];

  if (!scenario) {
    console.log(`Invalid scenario index. Choose 0-${testScenarios.length - 1}`);
    console.log(testScenarios.map((s, i) => `  ${i}: ${s.substring(0, 60)}...`).join('\n'));
    return;
  }

  try {
    const result = await runAgentLoop(scenario);
    console.log(`\n${'='.repeat(60)}`);
    console.log('FINAL AGENT RESPONSE:');
    console.log('='.repeat(60));
    console.log(result);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.status === 401) {
      console.error('Check your ANTHROPIC_API_KEY in .env');
    }
  }
}

main();
