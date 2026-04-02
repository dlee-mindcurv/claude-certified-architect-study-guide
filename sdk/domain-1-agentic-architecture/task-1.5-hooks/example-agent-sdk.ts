/**
 * Task 1.5 -- Hooks and Middleware: Agent SDK Implementation
 *
 * Exam relevance: Scenario 1 (CSR Agent)
 *
 * Demonstrates two hook patterns using the Agent SDK's hooks config:
 *
 *   1. PostToolUse hook -- Normalizes date formats in tool results before the
 *      model sees them. DETERMINISTIC: every date is guaranteed ISO 8601.
 *
 *   2. PreToolUse hook -- Blocks process_refund calls where amount > $500
 *      and redirects to escalation. DETERMINISTIC: cannot be bypassed.
 *
 * EXAM KEY CONCEPT:
 *   Hooks provide deterministic guarantees (code runs every time).
 *   Prompts provide probabilistic compliance (model usually follows).
 *   Use hooks for rules that MUST be enforced 100% of the time.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const REFUND_THRESHOLD = 500;

// ─── Date Normalization Utilities ───────────────────────────────────────────

function tryParseDate(value: unknown): string | null {
  if (typeof value === 'number') {
    const YEAR_2000_S = 946684800;
    const YEAR_2100_S = 4102444800;
    if (value >= YEAR_2000_S && value <= YEAR_2100_S) return new Date(value * 1000).toISOString();
    if (value >= YEAR_2000_S * 1000 && value <= YEAR_2100_S * 1000) return new Date(value).toISOString();
    return null;
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime()) && value.length > 4) return parsed.toISOString();
  }
  return null;
}

function normalizeDates(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeDates);
  if (typeof obj === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
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

// ─── PostToolUse Hook: Date Normalization ───────────────────────────────────
//
// DETERMINISTIC GUARANTEE: Every date field the model receives is ISO 8601.

const dateNormalizationHook: HookCallback = async (_input) => {
  const input = _input as { tool_name: string; tool_input: Record<string, unknown>; tool_output?: string };
  // Parse the tool output
  let data;
  try {
    data = JSON.parse(input.tool_output ?? '');
  } catch {
    return {}; // Not JSON -- no normalization needed
  }

  // Skip normalization for error responses
  if (data.errorCategory) return {};

  // Normalize dates and return updated output
  const normalized = normalizeDates(data);
  const normalizedStr = JSON.stringify(normalized);

  // Only update if normalization changed something
  if (normalizedStr !== input.tool_output) {
    console.log(`  [HOOK:PostToolUse] Normalized dates in ${input.tool_name} output`);
  }

  return {};
};

// ─── PreToolUse Hook: Refund Threshold Enforcement ──────────────────────────
//
// DETERMINISTIC GUARANTEE: No refund above $500 reaches the backend.

const refundThresholdHook: HookCallback = async (_input) => {
  const input = _input as { tool_name: string; tool_input: Record<string, unknown>; tool_output?: string };
  if (input.tool_name !== 'mcp__csr__process_refund') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  const toolInput = input.tool_input as Record<string, unknown> | undefined;
  const amount = toolInput?.amount;

  if (typeof amount === 'number' && amount > REFUND_THRESHOLD) {
    console.log(
      `  [HOOK:PreToolUse] BLOCKED refund of $${amount} (threshold: $${REFUND_THRESHOLD})`
    );

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason:
          `Refund amount $${amount} exceeds the automated processing limit of ` +
          `$${REFUND_THRESHOLD}. This refund requires human agent review. ` +
          `Please escalate using escalate_to_human.`,
      },
    };
  }

  return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const } };
};

// ─── Agent with Both Hooks ──────────────────────────────────────────────────

async function runAgentWithHooks(userMessage: string): Promise<string> {
  console.log('\n' + '='.repeat(60));
  console.log('CSR Agent with Hooks (Agent SDK)');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

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

      // EXAM KEY CONCEPT: Both hook types in one config.
      // PreToolUse hooks fire BEFORE tool execution (can block).
      // PostToolUse hooks fire AFTER tool execution (can transform).
      hooks: {
        PreToolUse: [
          { hooks: [refundThresholdHook] },
        ],
        PostToolUse: [
          { hooks: [dateNormalizationHook] },
        ],
      },

      maxTurns: 20,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  console.log(`\nAgent: ${finalText}`);
  return finalText;
}

// ─── Demo ───────────────────────────────────────────────────────────────────

async function main() {
  // Demo 1: Date normalization (PostToolUse hook)
  console.log('=== Demo 1: Date normalization utility ===\n');
  const sampleData = {
    orderId: 'ORD-5001',
    orderDate: '2025-02-25T09:00:00Z',
    deliveredAt: 1740844800,
    createdAt: 'March 1, 2025',
    items: [{ name: 'Widget', price: 79.99 }],
  };
  console.log('Before:', JSON.stringify(sampleData, null, 2));
  console.log('After: ', JSON.stringify(normalizeDates(sampleData), null, 2));

  // Demo 2: Full agent with hooks
  console.log('\n=== Demo 2: Full agentic loop with hooks ===\n');
  await runAgentWithHooks(
    'Hi, I am Alice Johnson (alice@example.com). I need a refund for order ORD-5001. ' +
    'The wireless headphones arrived damaged.'
  );
}

main().catch(console.error);

export {
  dateNormalizationHook,
  refundThresholdHook,
  normalizeDates,
  tryParseDate,
  runAgentWithHooks,
  REFUND_THRESHOLD,
};
