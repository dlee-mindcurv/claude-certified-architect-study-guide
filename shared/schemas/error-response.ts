/**
 * Standardized MCP Error Response Schema
 *
 * Exam relevance: Task 2.2 (Structured error responses for MCP tools)
 *
 * Key concepts:
 * - isError flag signals tool failure to the agent
 * - errorCategory enables appropriate recovery (retry transient, explain business, re-auth permission)
 * - isRetryable prevents wasted retry attempts on non-retryable errors
 * - Human-readable message lets the agent communicate clearly to users
 */

/**
 * Create a structured error response for MCP tool failures
 * @param {Object} params
 * @param {'transient'|'validation'|'business'|'permission'} params.errorCategory
 * @param {boolean} params.isRetryable
 * @param {string} params.message - Human-readable error description
 * @param {Object} [params.context] - Additional context for recovery
 * @returns {Object} MCP-formatted error response with isError: true
 */
export function createErrorResponse({ errorCategory, isRetryable, message, context = {} }: {
  errorCategory: 'transient' | 'validation' | 'business' | 'permission';
  isRetryable: boolean;
  message: string;
  context?: Record<string, unknown>;
}) {
  return {
    isError: true,
    content: JSON.stringify({
      errorCategory,
      isRetryable,
      message,
      ...context,
    }),
  };
}

/**
 * Create a successful tool response
 * @param {Object} data - The response data
 * @returns {Object} MCP-formatted success response
 */
export function createSuccessResponse(data: unknown) {
  return {
    content: JSON.stringify(data),
  };
}

/**
 * Error category descriptions for agent decision-making:
 *
 * transient:   Temporary failures (timeouts, rate limits, service unavailability)
 *              → Agent should retry with backoff
 *
 * validation:  Invalid input (wrong format, missing required fields)
 *              → Agent should fix input and retry
 *
 * business:    Business rule violations (policy limits, eligibility checks)
 *              → Agent should NOT retry — explain to user, possibly escalate
 *
 * permission:  Authorization failures (wrong customer, insufficient access)
 *              → Agent should NOT retry — verify identity or escalate
 */
export const ERROR_CATEGORIES = {
  TRANSIENT: 'transient',
  VALIDATION: 'validation',
  BUSINESS: 'business',
  PERMISSION: 'permission',
};
