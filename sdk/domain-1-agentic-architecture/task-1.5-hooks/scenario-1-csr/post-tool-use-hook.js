/**
 * Scenario 1 (CSR Agent): Full PostToolUse Hook Implementation
 *
 * Exam relevance: Task 1.5 -- Hooks and Middleware
 *
 * This module implements a comprehensive PostToolUse hook for the CSR agent
 * that applies four normalizations to tool results before the model sees them:
 *
 *   1. Date normalization   -- Any format --> ISO 8601
 *   2. Currency normalization -- "$79.99" string --> number 79.99
 *   3. Status code normalization -- numeric codes --> human-readable strings
 *   4. Refund threshold enforcement -- $500 limit, redirect to escalation
 *
 * All four are DETERMINISTIC: they run as code on every tool result, and the
 * model has no ability to skip or override them.
 *
 * Import path (from this file's location):
 *   import { ... } from '../../../shared/tools/csr-tools.js';
 */

import { executeCsrTool } from '../../../shared/tools/csr-tools.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const REFUND_THRESHOLD = 500;

const STATUS_CODE_MAP = {
  0: 'unknown',
  1: 'pending',
  2: 'processing',
  3: 'shipped',
  4: 'delivered',
  5: 'cancelled',
  6: 'returned',
  7: 'refunded',
  100: 'pending_approval',
  101: 'approved',
  102: 'rejected',
};

// ─── Date Normalization ─────────────────────────────────────────────────────
//
// Converts Unix timestamps, natural language dates, and locale-formatted
// strings into ISO 8601. This prevents the model from misinterpreting
// ambiguous date formats (e.g., MM/DD vs DD/MM).

/**
 * Try to interpret a value as a date. Returns ISO 8601 string or null.
 */
function tryParseDate(value) {
  // Handle Unix timestamps (seconds since epoch)
  if (typeof value === 'number') {
    const YEAR_2000_S = 946684800;
    const YEAR_2100_S = 4102444800;

    // Seconds-precision timestamp
    if (value >= YEAR_2000_S && value <= YEAR_2100_S) {
      return new Date(value * 1000).toISOString();
    }
    // Milliseconds-precision timestamp
    if (value >= YEAR_2000_S * 1000 && value <= YEAR_2100_S * 1000) {
      return new Date(value).toISOString();
    }
    return null;
  }

  if (typeof value === 'string') {
    // Already ISO 8601 -- pass through unchanged
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return value;
    }

    // Attempt to parse common date string formats
    // Minimum length check avoids false positives on short numeric strings
    if (value.length >= 8) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return null;
}

/**
 * Detect whether a key name suggests the value is a date.
 */
function isDateFieldName(key) {
  return /date|time|created|updated|delivered|expired|At$|_at$/i.test(key);
}

// ─── Currency Normalization ─────────────────────────────────────────────────
//
// Converts currency strings like "$79.99", "USD 79.99", or "79.99 USD" into
// numeric values. This ensures the model can perform reliable arithmetic
// (comparing refund amounts to order totals, calculating partial refunds).

/**
 * Try to extract a numeric value from a currency string.
 * Returns a number or null if the value is not a currency string.
 */
function tryParseCurrency(value) {
  if (typeof value === 'number') return null; // Already numeric -- no change needed
  if (typeof value !== 'string') return null;

  // Match patterns like "$79.99", "USD 79.99", "79.99 USD", "$1,234.56"
  const match = value.match(/^\$?\s*([\d,]+\.?\d*)\s*(USD)?$|^USD\s*([\d,]+\.?\d*)$/i);
  if (match) {
    const numStr = (match[1] || match[3]).replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!isNaN(num)) return num;
  }

  return null;
}

/**
 * Detect whether a key name suggests the value is a monetary amount.
 */
function isCurrencyFieldName(key) {
  return /price|amount|total|cost|fee|charge|balance|refund/i.test(key);
}

// ─── Status Code Normalization ──────────────────────────────────────────────
//
// Maps internal numeric status codes to human-readable strings. This allows
// the model to reason about statuses naturally ("the order is delivered")
// instead of trying to interpret opaque codes (status: 4).

/**
 * Detect whether a key name suggests the value is a status code.
 */
function isStatusFieldName(key) {
  return /status|state/i.test(key);
}

/**
 * Map a numeric status code to a human-readable string.
 * Returns the mapped string or null if the value is not a known code.
 */
function tryMapStatusCode(value) {
  if (typeof value === 'number' && STATUS_CODE_MAP[value] !== undefined) {
    return STATUS_CODE_MAP[value];
  }
  return null;
}

// ─── Recursive Normalization Engine ─────────────────────────────────────────

/**
 * Recursively walk an object and apply all normalizations.
 *
 * The order of normalization matters:
 *   1. Date fields -- checked first because date fields might also match
 *      currency patterns (unlikely but defensive)
 *   2. Currency fields -- convert string amounts to numbers
 *   3. Status fields -- map numeric codes to strings
 *   4. Recurse into nested objects and arrays
 */
function normalizeData(obj) {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(normalizeData);
  }

  if (typeof obj === 'object') {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
      // Date normalization
      if (isDateFieldName(key)) {
        const isoDate = tryParseDate(value);
        if (isoDate !== null) {
          result[key] = isoDate;
          continue;
        }
      }

      // Currency normalization
      if (isCurrencyFieldName(key)) {
        const numericAmount = tryParseCurrency(value);
        if (numericAmount !== null) {
          result[key] = numericAmount;
          continue;
        }
      }

      // Status code normalization
      if (isStatusFieldName(key)) {
        const readableStatus = tryMapStatusCode(value);
        if (readableStatus !== null) {
          result[key] = readableStatus;
          continue;
        }
      }

      // Recurse into nested structures
      result[key] = normalizeData(value);
    }

    return result;
  }

  return obj;
}

// ─── PostToolUse Hook ───────────────────────────────────────────────────────

/**
 * PostToolUse hook: normalize tool results before the model processes them.
 *
 * Applies date, currency, and status normalizations to successful tool results.
 * Error responses pass through unchanged (normalizing error messages could
 * corrupt diagnostic information).
 *
 * @param {string} toolName - The tool that was executed
 * @param {object} toolInput - The input that was passed to the tool
 * @param {object} toolResult - The raw result from the tool executor
 * @returns {object} Normalized tool result
 */
export function postToolUseHook(toolName, toolInput, toolResult) {
  // Skip normalization for error responses.
  // Rationale: error messages may contain date-like or currency-like strings
  // that should not be transformed (e.g., "Order ORD-5001 total is $105.97").
  if (toolResult.isError) {
    return toolResult;
  }

  let data;
  try {
    data = JSON.parse(toolResult.content);
  } catch {
    // Non-JSON content -- return unchanged
    return toolResult;
  }

  const normalized = normalizeData(data);

  return {
    ...toolResult,
    content: JSON.stringify(normalized),
  };
}

// ─── Pre-Execution Hook: Refund Threshold Enforcement ───────────────────────
//
// DETERMINISTIC GUARANTEE: Any process_refund call with amount > $500 is
// blocked and redirected to escalation. The model receives a structured
// response explaining the block and suggesting escalation.

/**
 * Pre-execution hook: enforce refund threshold.
 *
 * @param {string} toolName - The tool being called
 * @param {object} toolInput - The tool input from the model
 * @param {object} [options] - Configuration options
 * @param {number} [options.refundThreshold] - Max automated refund (default: 500)
 * @returns {{ allowed: boolean, result?: object }}
 */
export function preExecutionHook(toolName, toolInput, options = {}) {
  const threshold = options.refundThreshold ?? REFUND_THRESHOLD;

  if (toolName === 'process_refund') {
    const amount = toolInput.amount;

    if (typeof amount === 'number' && amount > threshold) {
      console.log(
        `[HOOK:PRE-EXEC] BLOCKED process_refund: $${amount} exceeds ` +
        `threshold $${threshold}. Redirecting to escalation.`
      );

      return {
        allowed: false,
        result: {
          content: JSON.stringify({
            blocked: true,
            reason:
              `Refund amount $${amount.toFixed(2)} exceeds the automated ` +
              `processing limit of $${threshold.toFixed(2)}. This refund ` +
              `requires human agent review and approval.`,
            action_required: 'escalate_to_human',
            threshold,
            requested_amount: amount,
            original_request: {
              tool: toolName,
              input: toolInput,
            },
          }),
        },
      };
    }
  }

  return { allowed: true };
}

// ─── Integrated Tool Executor with Hooks ────────────────────────────────────

/**
 * Execute a tool call with pre-execution and post-tool-use hooks applied.
 *
 * This function replaces direct calls to executeCsrTool in the agentic loop.
 * It wraps the execution step with both hooks:
 *
 *   1. Pre-execution hook checks compliance rules
 *   2. Tool executes (if allowed)
 *   3. PostToolUse hook normalizes the result
 *
 * @param {string} toolName - Tool to execute
 * @param {object} toolInput - Tool input from the model
 * @param {object} [hookOptions] - Options for hooks (e.g., refundThreshold)
 * @returns {object} The final tool result (normalized or blocked)
 */
export function executeWithHooks(toolName, toolInput, hookOptions = {}) {
  // Step 1: Pre-execution validation
  const preCheck = preExecutionHook(toolName, toolInput, hookOptions);

  if (!preCheck.allowed) {
    // Blocked -- return the substitute result without executing the tool
    return preCheck.result;
  }

  // Step 2: Execute the tool
  const rawResult = executeCsrTool(toolName, toolInput);

  // Step 3: Post-tool-use normalization
  const normalizedResult = postToolUseHook(toolName, toolInput, rawResult);

  return normalizedResult;
}

// ─── Demo / Self-Test ───────────────────────────────────────────────────────

function demo() {
  console.log('=== PostToolUse Hook: Date Normalization ===\n');

  const customerResult = executeCsrTool('get_customer', { customer_id: 'C-1001' });
  console.log('Raw customer result:');
  console.log(customerResult.content);

  const normalizedCustomer = postToolUseHook('get_customer', { customer_id: 'C-1001' }, customerResult);
  console.log('\nNormalized customer result:');
  console.log(normalizedCustomer.content);

  console.log('\n=== PostToolUse Hook: Currency Normalization ===\n');

  // Simulate a result with currency strings
  const mockResult = {
    content: JSON.stringify({
      orderId: 'ORD-5001',
      total: '$105.97',
      items: [
        { name: 'Wireless Headphones', price: '$79.99' },
        { name: 'USB-C Cable', price: '$12.99' },
      ],
      deliveredAt: 1740844800,
      status: 4,
    }),
  };

  const normalizedOrder = postToolUseHook('lookup_order', {}, mockResult);
  console.log('Raw mock order:');
  console.log(mockResult.content);
  console.log('\nNormalized (dates + currencies + status):');
  console.log(JSON.stringify(JSON.parse(normalizedOrder.content), null, 2));

  console.log('\n=== Pre-Execution Hook: Refund Threshold ===\n');

  // Case 1: Within threshold
  const allowed = preExecutionHook('process_refund', { amount: 50 });
  console.log('$50 refund:', allowed);

  // Case 2: Exceeds threshold
  const blocked = preExecutionHook('process_refund', { amount: 600 });
  console.log('\n$600 refund:', JSON.stringify(blocked, null, 2));

  // Case 3: Custom threshold
  const customBlocked = preExecutionHook('process_refund', { amount: 200 }, { refundThreshold: 100 });
  console.log('\n$200 refund with $100 threshold:', JSON.stringify(customBlocked, null, 2));

  console.log('\n=== Integrated Execution with Both Hooks ===\n');

  // Execute a lookup through the full hook pipeline
  const result = executeWithHooks('get_customer', { customer_id: 'C-1001' });
  console.log('Customer via executeWithHooks:');
  console.log(JSON.stringify(JSON.parse(result.content), null, 2));
}

// Run demo when executed directly
const isMainModule = process.argv[1]?.endsWith('post-tool-use-hook.js');
if (isMainModule) {
  demo();
}
