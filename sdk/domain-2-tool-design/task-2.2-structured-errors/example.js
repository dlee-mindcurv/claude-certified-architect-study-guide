/**
 * Task 2.2 — Structured Error Handling in an Agentic Loop
 *
 * Exam relevance:
 * - MCP isError flag signals tool failure to the agent
 * - Error categories (transient/validation/business/permission) enable smart recovery
 * - isRetryable boolean prevents wasted retry attempts
 * - Structured metadata (errorCategory, message, context) lets the agent decide
 *   whether to retry, fix input, explain to user, or escalate
 *
 * This example demonstrates:
 * 1. A tool that returns structured errors with category, retryable flag, and context
 * 2. An agent loop that handles each error type differently:
 *    - transient → retry with backoff
 *    - validation → fix input and retry
 *    - business → explain to user, do not retry
 *    - permission → escalate
 * 3. The contrast between "Operation failed" and structured errors
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../../shared/tools/csr-tools.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ERROR_CATEGORIES,
} from '../../../shared/schemas/error-response.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 15;
const MAX_RETRIES = 2;

// ─── Error-Aware Tool Executor ─────────────────────────────────────────────
// Wraps the mock executor with retry logic for transient errors.

function executeToolWithRetry(toolName, toolInput) {
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    const result = executeCsrTool(toolName, toolInput);

    // If no error, return immediately
    if (!result.isError) {
      return result;
    }

    // Parse the structured error
    const error = JSON.parse(result.content);

    // Only retry transient errors
    if (error.errorCategory === ERROR_CATEGORIES.TRANSIENT && error.isRetryable) {
      attempts++;
      console.log(
        `    [RETRY ${attempts}/${MAX_RETRIES}] Transient error: ${error.message}`
      );

      if (attempts > MAX_RETRIES) {
        console.log('    [RETRY EXHAUSTED] Returning error to agent');
        return result;
      }
      // In production, add exponential backoff here
      continue;
    }

    // Non-retryable errors pass through to the agent immediately
    return result;
  }

  // Should not reach here, but safety fallback
  return createErrorResponse({
    errorCategory: ERROR_CATEGORIES.TRANSIENT,
    isRetryable: false,
    message: `Failed after ${MAX_RETRIES} retry attempts`,
  });
}

// ─── Agent Loop with Error Handling ────────────────────────────────────────

async function runAgentWithErrorHandling(userMessage) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`User: ${userMessage}`);
  console.log('='.repeat(60));

  const messages = [{ role: 'user', content: userMessage }];
  let turnCount = 0;

  const systemPrompt = `You are a customer support agent for an e-commerce company.

## Error Handling Instructions
When a tool call fails, read the error response carefully:
- errorCategory tells you WHY it failed
- isRetryable tells you whether trying again might help
- message gives you a human-readable explanation

Your recovery strategy depends on the error category:
- "transient": The system had a temporary issue. The tool executor retries automatically.
  If it still fails after retries, apologize and ask the customer to try again later.
- "validation": Your input was wrong (bad format, missing field). Fix the input and try again.
  If you cannot determine the correct input, ask the customer for clarification.
- "business": A business rule prevents this action (e.g., order not eligible for refund).
  Explain the rule to the customer clearly. Do NOT retry. Offer alternatives if possible.
- "permission": You are not authorized for this action (e.g., order belongs to different customer).
  Do NOT retry. Verify the customer's identity. If the issue persists, escalate to a human agent.

## Critical Rules
1. ALWAYS verify customer identity via get_customer BEFORE order lookups or refunds
2. Never retry a non-retryable error with the same input
3. For business rule errors, explain the policy to the customer sympathetically
4. For permission errors, verify identity before escalating`;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`  [WARNING] Safety limit reached after ${MAX_TURNS} turns`);
      break;
    }

    console.log(`\n--- Turn ${turnCount} ---`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: csrToolDefinitions,
      messages,
    });

    console.log(`  stop_reason: ${response.stop_reason}`);

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      console.log(`\n  Agent: ${text}`);
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];

      for (const block of response.content.filter((b) => b.type === 'tool_use')) {
        console.log(`  Tool call: ${block.name}(${JSON.stringify(block.input)})`);

        // Execute with automatic transient retry
        const result = executeToolWithRetry(block.name, block.input);

        // Log the result for demonstration
        if (result.isError) {
          const error = JSON.parse(result.content);
          console.log(`  ERROR [${error.errorCategory}]: ${error.message}`);
          console.log(`    isRetryable: ${error.isRetryable}`);
        } else {
          const data = JSON.parse(result.content);
          console.log(`  Success: ${JSON.stringify(data).substring(0, 80)}...`);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          // EXAM KEY: The is_error flag tells Claude this tool call failed
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }
}

// ─── Demonstration Scenarios ───────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Task 2.2: Structured Error Handling — Agent Recovery     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Scenario A: Business rule error
  // ORD-5002 is in "shipped" status, not "delivered" — refund will fail
  // with a business error that the agent should explain to the customer.
  console.log('\n\n▶ SCENARIO A: Business Rule Error (order not delivered)');
  console.log('  Expected: Agent explains that shipped orders cannot be refunded');
  await runAgentWithErrorHandling(
    'I want a refund for order ORD-5002. My email is alice@example.com'
  );

  // Scenario B: Permission error
  // Customer C-1002 (Bob) tries to access order ORD-5001 (belongs to Alice).
  // The agent should detect the mismatch and handle it appropriately.
  console.log('\n\n▶ SCENARIO B: Permission Error (wrong customer)');
  console.log('  Expected: Agent detects ownership mismatch');
  await runAgentWithErrorHandling(
    'Can you check order ORD-5001 for me? My email is bob@example.com'
  );

  // Scenario C: Validation error
  // Invalid customer ID format triggers a validation error.
  // The agent should ask for a correct identifier.
  console.log('\n\n▶ SCENARIO C: Validation Error (invalid identifier)');
  console.log('  Expected: Agent asks for a valid email or customer ID');
  await runAgentWithErrorHandling(
    'Look up my account. My customer number is 12345.'
  );

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY: How Structured Errors Enable Smart Recovery');
  console.log('='.repeat(60));
  console.log(`
  Generic error ("Operation failed"):
    → Agent has no recovery path
    → May retry indefinitely or give up immediately
    → Cannot explain the problem to the user

  Structured error ({ errorCategory, isRetryable, message }):
    → transient + isRetryable:true  → Auto-retry with backoff
    → validation + isRetryable:false → Fix input format, retry once
    → business + isRetryable:false   → Explain policy to customer
    → permission + isRetryable:false → Verify identity or escalate

  The errorCategory determines the STRATEGY.
  The isRetryable boolean prevents WASTED RETRIES.
  The message provides HUMAN-READABLE context.
  `);
}

main().catch(console.error);
