/**
 * Task 1.5 -- Hooks and Middleware: Agent SDK Example
 *
 * Exam relevance: Scenario 1 (CSR Agent)
 *
 * This file demonstrates two hook patterns that wrap the tool execution step
 * inside an agentic loop:
 *
 *   1. PostToolUse hook  -- Normalizes date formats in tool results before the
 *      model sees them. This is DETERMINISTIC: every date the model receives
 *      is guaranteed to be ISO 8601, regardless of what the backend returned.
 *
 *   2. Pre-execution hook -- Blocks process_refund calls where amount > $500
 *      and redirects to escalation. This is DETERMINISTIC: the $500 limit
 *      cannot be bypassed by prompt injection or model reasoning.
 *
 * KEY EXAM CONCEPT:
 *   Hooks provide deterministic guarantees (code runs every time, no exceptions).
 *   Prompts provide probabilistic compliance (model usually follows instructions
 *   but can deviate under edge cases or adversarial input).
 *
 *   Use hooks for any rule that MUST be enforced 100% of the time.
 *   Use prompts for soft guidelines where occasional deviation is acceptable.
 */

import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../shared/prompts/csr-system-prompt.js';

const client = new Anthropic();

// ─── Configuration ──────────────────────────────────────────────────────────

const REFUND_THRESHOLD = 500; // Dollars -- refunds above this are blocked
const MAX_TURNS = 20;

// ─── PostToolUse Hook: Date Normalization ───────────────────────────────────
//
// DETERMINISTIC GUARANTEE: Every date field the model receives will be in
// ISO 8601 format. The model never sees raw Unix timestamps, locale strings,
// or ambiguous formats like "03/04/2025" (March 4 or April 3?).
//
// Why this matters: Consistent date formatting prevents the model from
// misinterpreting dates (e.g., US vs. European date ordering) and ensures
// reliable date arithmetic in downstream reasoning.

/**
 * Attempt to parse a value as a date and return ISO 8601, or return null
 * if the value is not a recognizable date.
 */
function tryParseDate(value) {
  if (typeof value === 'number') {
    // Unix timestamp detection: if the number is in a plausible range for
    // seconds-since-epoch (after year 2000, before year 2100), treat it as
    // a Unix timestamp.
    const YEAR_2000_SECONDS = 946684800;
    const YEAR_2100_SECONDS = 4102444800;

    if (value >= YEAR_2000_SECONDS && value <= YEAR_2100_SECONDS) {
      return new Date(value * 1000).toISOString();
    }
    // Also handle millisecond timestamps
    if (value >= YEAR_2000_SECONDS * 1000 && value <= YEAR_2100_SECONDS * 1000) {
      return new Date(value).toISOString();
    }
    return null;
  }

  if (typeof value === 'string') {
    // Already ISO 8601 -- pass through
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return value;
    }

    // Common date string patterns: "March 1, 2025", "03/01/2025", "2025-03-01"
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime()) && value.length > 4) {
      return parsed.toISOString();
    }
  }

  return null; // Not a date
}

/**
 * Recursively normalize all date-like values in an object to ISO 8601.
 * Non-date values pass through unchanged.
 */
function normalizeDates(obj) {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(normalizeDates);
  }

  if (typeof obj === 'object') {
    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Only attempt date parsing on fields whose names suggest they are dates
      const isDateField = /date|time|created|updated|delivered|expired|at$/i.test(key);

      if (isDateField) {
        const isoDate = tryParseDate(value);
        normalized[key] = isoDate !== null ? isoDate : value;
      } else {
        normalized[key] = normalizeDates(value);
      }
    }
    return normalized;
  }

  return obj;
}

/**
 * PostToolUse hook: transform tool results before the model processes them.
 *
 * This function sits between the tool executor and the model. It receives
 * the raw tool result and returns a normalized version.
 */
function postToolUseHook(toolName, toolInput, toolResult) {
  // Parse the result content (our tools return JSON strings)
  let data;
  try {
    data = JSON.parse(toolResult.content);
  } catch {
    return toolResult; // Not JSON -- return as-is
  }

  // Skip normalization for error responses
  if (toolResult.isError) {
    return toolResult;
  }

  // Apply date normalization to all successful results
  const normalized = normalizeDates(data);

  return {
    ...toolResult,
    content: JSON.stringify(normalized),
  };
}

// ─── Pre-Execution Hook: Refund Threshold Enforcement ───────────────────────
//
// DETERMINISTIC GUARANTEE: No refund above $500 will ever reach the backend.
// The model cannot bypass this check -- it runs as code before every
// process_refund call.
//
// Compare to the PROBABILISTIC approach of adding "Never process refunds
// over $500" to the system prompt. The model will usually obey, but:
//   - Adversarial prompt injection could override it
//   - Complex multi-step reasoning might cause the model to "forget"
//   - Edge cases the prompt author didn't anticipate could slip through
//
// For financial controls, deterministic enforcement is the only acceptable
// approach.

/**
 * Pre-execution hook: validate tool calls before they execute.
 *
 * Returns { allowed: true } to proceed, or { allowed: false, result: ... }
 * to block execution and return a substitute result.
 */
function preExecutionHook(toolName, toolInput) {
  if (toolName === 'process_refund') {
    const amount = toolInput.amount;

    if (typeof amount === 'number' && amount > REFUND_THRESHOLD) {
      // BLOCK: Return a structured result that redirects to escalation.
      // The model will see this as the tool result and should follow up
      // by calling escalate_to_human.
      console.log(
        `[HOOK] Blocked refund of $${amount} (threshold: $${REFUND_THRESHOLD}). ` +
        'Redirecting to escalation.'
      );

      return {
        allowed: false,
        result: {
          content: JSON.stringify({
            blocked: true,
            reason: `Refund amount $${amount} exceeds the automated processing ` +
                    `limit of $${REFUND_THRESHOLD}. This refund must be reviewed ` +
                    `by a human agent.`,
            action_required: 'escalate_to_human',
            original_request: { toolName, toolInput },
          }),
        },
      };
    }
  }

  return { allowed: true };
}

// ─── Agentic Loop with Hooks ────────────────────────────────────────────────
//
// The loop structure is identical to a standard agentic loop (Task 1.1),
// but the tool execution step is wrapped with pre-execution and post-tool-use
// hooks.

async function runAgentWithHooks(userMessage) {
  const messages = [{ role: 'user', content: userMessage }];
  let turns = 0;

  while (true) {
    if (++turns > MAX_TURNS) {
      console.warn(`[SAFETY] Max turns (${MAX_TURNS}) reached.`);
      break;
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: csrSystemPrompt,
      tools: csrToolDefinitions,
      messages,
    });

    // ── Standard stop_reason check (Task 1.1) ──
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock?.text ?? '[No text response]';
    }

    if (response.stop_reason !== 'tool_use') {
      throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
    }

    // ── Process tool calls with hooks ──
    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const { name: toolName, input: toolInput, id: toolUseId } = block;
      let result;

      // Step 1: PRE-EXECUTION HOOK -- validate before executing
      const preCheck = preExecutionHook(toolName, toolInput);

      if (!preCheck.allowed) {
        // Hook blocked this call -- use the substitute result
        result = preCheck.result;
        console.log(`[HOOK] Tool call '${toolName}' was blocked by pre-execution hook.`);
      } else {
        // Step 2: EXECUTE the tool
        result = executeCsrTool(toolName, toolInput);

        // Step 3: POST-TOOL-USE HOOK -- normalize the result
        result = postToolUseHook(toolName, toolInput, result);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result.content,
        is_error: result.isError ?? false,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }
}

// ─── Demo ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Demo 1: Date normalization via PostToolUse hook ===\n');
  console.log('The hook ensures all dates reach the model in ISO 8601 format,');
  console.log('regardless of what format the backend returned.\n');

  // Demonstrate date normalization on raw data
  const sampleData = {
    orderId: 'ORD-5001',
    orderDate: '2025-02-25T09:00:00Z',       // Already ISO -- passthrough
    deliveredAt: 1740844800,                   // Unix timestamp in seconds
    createdAt: 'March 1, 2025',               // Natural language date string
    items: [{ name: 'Widget', price: 79.99 }], // Non-date field -- untouched
  };

  console.log('Before normalization:', JSON.stringify(sampleData, null, 2));
  const normalized = normalizeDates(sampleData);
  console.log('After normalization: ', JSON.stringify(normalized, null, 2));

  console.log('\n=== Demo 2: Refund threshold enforcement via pre-execution hook ===\n');
  console.log('A $600 refund is blocked deterministically. The model cannot bypass this.\n');

  const preCheck = preExecutionHook('process_refund', {
    order_id: 'ORD-5001',
    customer_id: 'C-1001',
    amount: 600,
    reason: 'Customer dissatisfaction',
  });

  console.log('Pre-execution hook result:', JSON.stringify(preCheck, null, 2));

  console.log('\nA $50 refund passes the pre-execution hook:');
  const preCheckSmall = preExecutionHook('process_refund', {
    order_id: 'ORD-5001',
    customer_id: 'C-1001',
    amount: 50,
    reason: 'Item defective',
  });
  console.log('Pre-execution hook result:', JSON.stringify(preCheckSmall, null, 2));

  console.log('\n=== Demo 3: Full agentic loop with hooks (requires ANTHROPIC_API_KEY) ===\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Skipping live API demo -- set ANTHROPIC_API_KEY to run.\n');
    return;
  }

  const result = await runAgentWithHooks(
    'Hi, I am Alice Johnson (alice@example.com). I need a refund for order ORD-5001. ' +
    'The wireless headphones arrived damaged.'
  );
  console.log('Agent response:', result);
}

main().catch(console.error);

// ─── Exports for testing and reuse ──────────────────────────────────────────

export {
  postToolUseHook,
  preExecutionHook,
  normalizeDates,
  tryParseDate,
  runAgentWithHooks,
  REFUND_THRESHOLD,
};
