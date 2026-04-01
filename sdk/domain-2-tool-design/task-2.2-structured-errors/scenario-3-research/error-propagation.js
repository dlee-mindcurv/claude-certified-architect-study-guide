/**
 * Scenario 3 (Research System) — Error Propagation from Subagent to Coordinator
 *
 * Exam relevance: Task 2.2 (Structured error responses), Task 5.3 (Error propagation)
 *
 * In a multi-agent architecture, tool errors in subagents must propagate up
 * to the coordinator with enough structured context for routing decisions.
 * The coordinator never sees raw tool errors — it receives a structured
 * summary from the subagent that includes:
 *
 * - failureType: maps to errorCategory but at the subagent level
 * - attemptedTask: what the subagent was trying to do
 * - partialResults: anything found before the failure
 * - alternatives: suggested recovery approaches
 * - subagentId: which subagent failed (for targeted retry)
 *
 * This enables the coordinator to:
 * 1. Retry the same subagent for transient failures
 * 2. Reassign the task to a different subagent
 * 3. Proceed with partial results and annotate coverage gaps
 * 4. Report the failure in the final output
 */

import {
  createErrorResponse,
  createSuccessResponse,
  ERROR_CATEGORIES,
} from '../../../../shared/schemas/error-response.js';
import { executeResearchTool } from '../../../../shared/tools/research-tools.js';

// ─── Subagent Error Context Builder ────────────────────────────────────────
// Wraps raw tool errors with subagent-level context for the coordinator.

/**
 * Execute a research tool and wrap errors with subagent context.
 *
 * When a tool fails inside a subagent, the raw error (e.g., "Search timed out")
 * is not enough for the coordinator. The coordinator needs to know:
 * - Which subagent failed
 * - What task it was working on
 * - What partial results exist
 * - What the coordinator should do next
 *
 * @param {string} subagentId - Identifier for the subagent (e.g., 'search-agent-1')
 * @param {string} taskDescription - What the subagent was assigned to do
 * @param {string} toolName - The tool being called
 * @param {Object} toolInput - The tool input parameters
 * @param {Array} priorResults - Results from earlier tool calls in this subagent's session
 * @returns {Object} Success result or error with propagation context
 */
export function executeWithPropagation(
  subagentId,
  taskDescription,
  toolName,
  toolInput,
  priorResults = []
) {
  const result = executeResearchTool(toolName, toolInput);

  // Success — return the result with attribution metadata
  if (!result.isError) {
    return {
      ...result,
      _meta: {
        subagentId,
        taskDescription,
        toolName,
        executedAt: new Date().toISOString(),
      },
    };
  }

  // Error — wrap with propagation context for the coordinator
  const rawError = JSON.parse(result.content);

  return createErrorResponse({
    errorCategory: rawError.errorCategory,
    isRetryable: rawError.isRetryable,
    message: rawError.message,
    context: {
      // Subagent identification
      subagentId,
      subagentTask: taskDescription,

      // What was attempted
      failedTool: toolName,
      failedInput: toolInput,

      // Partial work before the failure
      partialResults: priorResults,
      partialResultCount: priorResults.length,

      // Recovery guidance for the coordinator
      alternatives: buildAlternatives(rawError, toolName, toolInput),

      // Timing
      failedAt: new Date().toISOString(),
    },
  });
}

// ─── Recovery Alternative Builder ──────────────────────────────────────────
// Generates suggested recovery approaches based on the error type and tool.

function buildAlternatives(error, toolName, toolInput) {
  const alternatives = [];

  switch (error.errorCategory) {
    case ERROR_CATEGORIES.TRANSIENT:
      alternatives.push({
        approach: 'retry_same_subagent',
        description: `Retry ${toolName} with the same input after a brief delay`,
        confidence: 'high',
      });
      alternatives.push({
        approach: 'retry_different_query',
        description: 'Try a more specific or differently-worded query',
        confidence: 'medium',
      });
      break;

    case ERROR_CATEGORIES.VALIDATION:
      if (toolName === 'analyze_document') {
        alternatives.push({
          approach: 'search_for_document',
          description:
            `Document ${toolInput.document_id} not found. ` +
            'Use web_search to find available documents on this topic.',
          confidence: 'high',
        });
      }
      if (toolName === 'web_search') {
        alternatives.push({
          approach: 'rephrase_query',
          description: 'Rephrase the search query with different keywords',
          confidence: 'medium',
        });
      }
      break;

    case ERROR_CATEGORIES.BUSINESS:
      alternatives.push({
        approach: 'proceed_with_partial',
        description: 'Continue with available results and note the coverage gap',
        confidence: 'high',
      });
      break;

    default:
      alternatives.push({
        approach: 'escalate_to_coordinator',
        description: 'Return error to coordinator for manual handling',
        confidence: 'low',
      });
  }

  return alternatives;
}

// ─── Coordinator Error Handler ─────────────────────────────────────────────
// Processes propagated errors and decides on recovery actions.

/**
 * Handle an error propagated from a subagent.
 *
 * The coordinator receives structured error context and decides:
 * 1. Should the subagent retry?
 * 2. Should a different subagent handle this?
 * 3. Should we proceed with partial results?
 * 4. Should we report the gap in the final output?
 *
 * @param {Object} propagatedError - Error with subagent context
 * @param {number} attemptNumber - How many times this task has been attempted
 * @returns {Object} Recovery decision for the coordinator
 */
export function handlePropagatedError(propagatedError, attemptNumber = 1) {
  const error = JSON.parse(propagatedError.content);
  const maxAttempts = 3;

  // Decision tree based on error category and attempt count
  if (error.errorCategory === ERROR_CATEGORIES.TRANSIENT && attemptNumber < maxAttempts) {
    return {
      action: 'retry',
      subagentId: error.subagentId,
      task: error.subagentTask,
      delay: Math.pow(2, attemptNumber) * 1000, // Exponential backoff
      reason: `Transient failure (attempt ${attemptNumber}/${maxAttempts}): ${error.message}`,
    };
  }

  if (error.errorCategory === ERROR_CATEGORIES.VALIDATION) {
    const alternative = error.alternatives?.find(
      (a) => a.confidence === 'high'
    );
    if (alternative) {
      return {
        action: 'reassign',
        approach: alternative.approach,
        description: alternative.description,
        reason: `Validation error: ${error.message}`,
      };
    }
  }

  // For all other cases (exhausted retries, business errors, etc.)
  return {
    action: 'proceed_with_partial',
    partialResults: error.partialResults || [],
    coverageGap: {
      task: error.subagentTask,
      reason: error.message,
      category: error.errorCategory,
    },
    reason:
      error.errorCategory === ERROR_CATEGORIES.TRANSIENT
        ? `Transient failure persisted after ${maxAttempts} attempts`
        : `Non-recoverable ${error.errorCategory} error: ${error.message}`,
  };
}

// ─── Demonstration ─────────────────────────────────────────────────────────

export function demonstrateErrorPropagation() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Scenario 3: Error Propagation in Multi-Agent Research    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Simulate a search subagent encountering a transient error
  console.log('--- Scenario: Search subagent times out ---\n');

  // Force a transient error for demonstration
  const errorResult = createErrorResponse({
    errorCategory: ERROR_CATEGORIES.TRANSIENT,
    isRetryable: true,
    message: 'Search service timed out after 30s',
    context: {
      subagentId: 'search-agent-1',
      subagentTask: 'Search for AI impact on visual arts',
      failedTool: 'web_search',
      failedInput: { query: 'AI visual arts 2025' },
      partialResults: [],
      partialResultCount: 0,
      alternatives: [
        {
          approach: 'retry_same_subagent',
          description: 'Retry web_search with the same input after a brief delay',
          confidence: 'high',
        },
        {
          approach: 'retry_different_query',
          description: 'Try a more specific query',
          confidence: 'medium',
        },
      ],
      failedAt: new Date().toISOString(),
    },
  });

  console.log('Propagated error from subagent:');
  console.log(JSON.stringify(JSON.parse(errorResult.content), null, 2));

  // Coordinator handles the error
  console.log('\n--- Coordinator decision (attempt 1) ---\n');
  const decision1 = handlePropagatedError(errorResult, 1);
  console.log(JSON.stringify(decision1, null, 2));

  console.log('\n--- Coordinator decision (attempt 3 — exhausted) ---\n');
  const decision3 = handlePropagatedError(errorResult, 3);
  console.log(JSON.stringify(decision3, null, 2));

  // Simulate a validation error (document not found)
  console.log('\n--- Scenario: Analysis subagent — document not found ---\n');

  const validationError = executeWithPropagation(
    'analysis-agent-1',
    'Analyze report on AI in music production',
    'analyze_document',
    { document_id: 'doc-999' },
    [] // no prior results
  );

  if (validationError.isError) {
    console.log('Propagated error:');
    console.log(JSON.stringify(JSON.parse(validationError.content), null, 2));

    const decision = handlePropagatedError(validationError, 1);
    console.log('\nCoordinator decision:');
    console.log(JSON.stringify(decision, null, 2));
  }
}

// Run demonstration if executed directly
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;
if (isDirectExecution) {
  demonstrateErrorPropagation();
}
