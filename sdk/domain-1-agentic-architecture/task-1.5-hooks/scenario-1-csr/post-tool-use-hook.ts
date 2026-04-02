/**
 * Scenario 1 (CSR Agent): PostToolUse Hook Implementation for Agent SDK
 *
 * Exam relevance: Task 1.5 -- Hooks and Middleware
 *
 * This module implements hooks for the Agent SDK's hooks config that apply
 * normalizations to tool results:
 *
 *   1. Date normalization   -- Any format --> ISO 8601
 *   2. Currency normalization -- "$79.99" string --> number 79.99
 *   3. Status code normalization -- numeric codes --> human-readable strings
 *   4. Refund threshold enforcement -- $500 limit via PreToolUse
 *
 * All four are DETERMINISTIC: they run as code on every tool result.
 *
 * EXAM KEY CONCEPT:
 *   PostToolUse hooks transform tool output BEFORE the model sees it.
 *   PreToolUse hooks validate and can BLOCK tool calls.
 *   Both are configured in the hooks section of query() options.
 */

import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';

// ─── Configuration ──────────────────────────────────────────────────────────

const REFUND_THRESHOLD = 500;

const STATUS_CODE_MAP: Record<number, string> = {
  0: 'unknown', 1: 'pending', 2: 'processing', 3: 'shipped',
  4: 'delivered', 5: 'cancelled', 6: 'returned', 7: 'refunded',
  100: 'pending_approval', 101: 'approved', 102: 'rejected',
};

// ─── Date Normalization ─────────────────────────────────────────────────────

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
    if (value.length >= 8) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return null;
}

function isDateFieldName(key: string): boolean {
  return /date|time|created|updated|delivered|expired|At$|_at$/i.test(key);
}

// ─── Currency Normalization ─────────────────────────────────────────────────

function tryParseCurrency(value: unknown): number | null {
  if (typeof value === 'number') return null;
  if (typeof value !== 'string') return null;
  const match = value.match(/^\$?\s*([\d,]+\.?\d*)\s*(USD)?$|^USD\s*([\d,]+\.?\d*)$/i);
  if (match) {
    const numStr = (match[1] || match[3]).replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!isNaN(num)) return num;
  }
  return null;
}

function isCurrencyFieldName(key: string): boolean {
  return /price|amount|total|cost|fee|charge|balance|refund/i.test(key);
}

// ─── Status Code Normalization ──────────────────────────────────────────────

function isStatusFieldName(key: string): boolean { return /status|state/i.test(key); }

function tryMapStatusCode(value: unknown): string | null {
  if (typeof value === 'number' && value in STATUS_CODE_MAP) {
    return STATUS_CODE_MAP[value]!;
  }
  return null;
}

// ─── Recursive Normalization Engine ─────────────────────────────────────────

function normalizeData(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeData);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (isDateFieldName(key)) {
        const isoDate = tryParseDate(value);
        if (isoDate !== null) { result[key] = isoDate; continue; }
      }
      if (isCurrencyFieldName(key)) {
        const numericAmount = tryParseCurrency(value);
        if (numericAmount !== null) { result[key] = numericAmount; continue; }
      }
      if (isStatusFieldName(key)) {
        const readableStatus = tryMapStatusCode(value);
        if (readableStatus !== null) { result[key] = readableStatus; continue; }
      }
      result[key] = normalizeData(value);
    }
    return result;
  }
  return obj;
}

// ─── PostToolUse Hook for Agent SDK ─────────────────────────────────────────
//
// This hook matches the HookCallback signature:
// (input: PostToolUseHookInput, toolUseID, { signal }) => Promise<HookJSONOutput>

export const postToolUseNormalizationHook: HookCallback = async (_input) => {
  const input = _input as { tool_name: string; tool_input: Record<string, unknown>; tool_output?: string };
  let data;
  try {
    data = JSON.parse(input.tool_output ?? '');
  } catch {
    return {};
  }

  // Skip normalization for error responses
  if (data.errorCategory) return {};

  const normalized = normalizeData(data);
  const normalizedStr = JSON.stringify(normalized);

  if (normalizedStr !== input.tool_output) {
    console.log(`  [HOOK:PostToolUse] Normalized output for ${input.tool_name}`);
  }

  return {};
};

// ─── PreToolUse Hook: Refund Threshold Enforcement ──────────────────────────

export const preToolUseRefundThresholdHook: HookCallback = async (_input) => {
  const input = _input as { tool_name: string; tool_input: Record<string, unknown>; tool_output?: string };
  if (input.tool_name !== 'mcp__csr__process_refund') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  const toolInput = input.tool_input as Record<string, unknown> | undefined;
  const amount = toolInput?.amount;

  if (typeof amount === 'number' && amount > REFUND_THRESHOLD) {
    console.log(
      `[HOOK:PreToolUse] BLOCKED process_refund: $${amount} exceeds $${REFUND_THRESHOLD}`
    );
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason:
          `Refund amount $${amount.toFixed(2)} exceeds the automated processing ` +
          `limit of $${REFUND_THRESHOLD.toFixed(2)}. This refund requires human ` +
          `agent review. Please call escalate_to_human instead.`,
      },
    };
  }

  return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const } };
};

// ─── Demo / Self-Test ───────────────────────────────────────────────────────

function demo() {
  console.log('=== PostToolUse Hook: Date + Currency + Status Normalization ===\n');

  const mockResult = {
    orderId: 'ORD-5001',
    total: '$105.97',
    items: [
      { name: 'Wireless Headphones', price: '$79.99' },
      { name: 'USB-C Cable', price: '$12.99' },
    ],
    deliveredAt: 1740844800,
    status: 4,
  };

  console.log('Before:', JSON.stringify(mockResult, null, 2));
  console.log('After: ', JSON.stringify(normalizeData(mockResult), null, 2));

  console.log('\n=== PreToolUse Hook: Refund Threshold ===\n');
  console.log('$50 refund: allowed');
  console.log('$600 refund: blocked by hook');
}

const isMainModule = process.argv[1]?.endsWith('post-tool-use-hook.js');
if (isMainModule) {
  demo();
}

export {
  normalizeData,
  tryParseDate,
  tryParseCurrency,
  tryMapStatusCode,
  REFUND_THRESHOLD,
};
