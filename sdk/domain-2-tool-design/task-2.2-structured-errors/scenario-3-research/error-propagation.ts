/**
 * Scenario 3 (Research System) — Error Propagation from Subagent to Coordinator
 *
 * Exam relevance: Task 2.2 (Structured error responses), Task 5.3 (Error propagation)
 *
 * EXAM KEY CONCEPT:
 *   In multi-agent architectures, tool errors in subagents must propagate UP
 *   to the coordinator with structured context for routing decisions.
 *   The coordinator never sees raw tool errors — it receives a structured
 *   summary that includes: which subagent failed, what was attempted,
 *   partial results, and suggested alternatives.
 *
 * This enables the coordinator to:
 * 1. Retry the same subagent for transient failures
 * 2. Reassign the task to a different subagent
 * 3. Proceed with partial results and annotate coverage gaps
 * 4. Report the failure in the final output
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Types ───────────────────────────────────────────────────────────────

interface PropagatedErrorInput {
  subagentId: string;
  taskDescription: string;
  errorCategory: string;
  isRetryable: boolean;
  message: string;
  partialResults?: string[];
}

interface Alternative {
  approach: string;
  description: string;
  confidence: string;
}

interface PropagatedError {
  errorCategory: string;
  isRetryable: boolean;
  message: string;
  subagentId: string;
  subagentTask: string;
  partialResults: string[];
  partialResultCount: number;
  alternatives: Alternative[];
  failedAt: string;
}

// ─── Subagent Error Context Builder ───────────────────────────────────────
// Wraps raw tool errors with subagent-level context for the coordinator.

/**
 * Build a propagated error with subagent context.
 *
 * EXAM KEY CONCEPT: Raw tool errors ("Search timed out") are not enough
 * for the coordinator. It needs: which subagent, what task, partial
 * results, and suggested recovery approaches.
 */
export function buildPropagatedError({
  subagentId,
  taskDescription,
  errorCategory,
  isRetryable,
  message,
  partialResults = [],
}: PropagatedErrorInput): PropagatedError {
  const alternatives = buildAlternatives(errorCategory, subagentId);

  return {
    errorCategory,
    isRetryable,
    message,
    subagentId,
    subagentTask: taskDescription,
    partialResults,
    partialResultCount: partialResults.length,
    alternatives,
    failedAt: new Date().toISOString(),
  };
}

// ─── Recovery Alternative Builder ─────────────────────────────────────────

function buildAlternatives(errorCategory: string, subagentId: string): Alternative[] {
  const alternatives: Alternative[] = [];

  switch (errorCategory) {
    case 'transient':
      alternatives.push(
        { approach: 'retry_same_subagent', description: `Retry ${subagentId} after a brief delay`, confidence: 'high' },
        { approach: 'retry_different_query', description: 'Try a more specific query', confidence: 'medium' },
      );
      break;
    case 'validation':
      alternatives.push(
        { approach: 'search_for_document', description: 'Use web_search to find available documents', confidence: 'high' },
      );
      break;
    case 'business':
      alternatives.push(
        { approach: 'proceed_with_partial', description: 'Continue with available results, note gap', confidence: 'high' },
      );
      break;
    default:
      alternatives.push(
        { approach: 'escalate_to_coordinator', description: 'Return to coordinator for manual handling', confidence: 'low' },
      );
  }

  return alternatives;
}

// ─── Coordinator Error Handler ────────────────────────────────────────────

/**
 * Handle an error propagated from a subagent.
 *
 * EXAM KEY CONCEPT: The coordinator decision tree:
 * - transient + attempts < max -> retry same subagent
 * - validation + high-confidence alternative -> reassign task
 * - all others -> proceed with partial results, note coverage gap
 */
export function handlePropagatedError(propagatedError: PropagatedError, attemptNumber = 1) {
  const maxAttempts = 3;

  if (propagatedError.errorCategory === 'transient' && attemptNumber < maxAttempts) {
    return {
      action: 'retry',
      subagentId: propagatedError.subagentId,
      task: propagatedError.subagentTask,
      delay: Math.pow(2, attemptNumber) * 1000,
      reason: `Transient failure (attempt ${attemptNumber}/${maxAttempts}): ${propagatedError.message}`,
    };
  }

  if (propagatedError.errorCategory === 'validation') {
    const alt = propagatedError.alternatives?.find((a: Alternative) => a.confidence === 'high');
    if (alt) {
      return {
        action: 'reassign',
        approach: alt.approach,
        description: alt.description,
        reason: `Validation error: ${propagatedError.message}`,
      };
    }
  }

  // Exhausted retries or non-recoverable -> proceed with partial results
  return {
    action: 'proceed_with_partial',
    partialResults: propagatedError.partialResults || [],
    coverageGap: {
      task: propagatedError.subagentTask,
      reason: propagatedError.message,
      category: propagatedError.errorCategory,
    },
    reason:
      propagatedError.errorCategory === 'transient'
        ? `Transient failure persisted after ${maxAttempts} attempts`
        : `Non-recoverable ${propagatedError.errorCategory} error: ${propagatedError.message}`,
  };
}

// ─── MCP Tool: report_subagent_error ──────────────────────────────────────
// A coordinator-level tool that subagents call to propagate errors upward.

export const reportSubagentErrorTool = tool(
  'report_subagent_error',
  'Report a structured error from a subagent to the coordinator. ' +
  'Include the subagent ID, what task failed, error category, and any partial results. ' +
  'The coordinator uses this to decide: retry, reassign, or proceed with gaps.',
  {
    subagent_id: z.string().describe('Which subagent encountered the error'),
    task_description: z.string().describe('What the subagent was trying to do'),
    error_category: z.enum(['transient', 'validation', 'business', 'permission']).describe('Error type'),
    is_retryable: z.boolean().describe('Whether retrying might succeed'),
    message: z.string().describe('Human-readable error description'),
    partial_results: z.array(z.string()).optional().describe('Any results gathered before failure'),
  },
  async ({ subagent_id, task_description, error_category, is_retryable, message, partial_results }) => {
    const propagated = buildPropagatedError({
      subagentId: subagent_id,
      taskDescription: task_description,
      errorCategory: error_category,
      isRetryable: is_retryable,
      message,
      partialResults: partial_results || [],
    });

    const decision = handlePropagatedError(propagated, 1);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ propagatedError: propagated, coordinatorDecision: decision }) }],
    };
  },
);

export const errorPropagationServer = createSdkMcpServer({
  name: 'error-propagation',
  version: '1.0.0',
  tools: [reportSubagentErrorTool],
});

// ─── Demonstration ────────────────────────────────────────────────────────

function demonstrate() {
  console.log('Task 2.2 Scenario 3: Error Propagation in Multi-Agent Research\n');

  // Simulate: search subagent times out
  console.log('--- Scenario: Search subagent times out ---\n');
  const transientError = buildPropagatedError({
    subagentId: 'search-agent-1',
    taskDescription: 'Search for AI impact on visual arts',
    errorCategory: 'transient',
    isRetryable: true,
    message: 'Search service timed out after 30s',
    partialResults: [],
  });
  console.log('Propagated error:', JSON.stringify(transientError, null, 2));

  console.log('\nCoordinator decision (attempt 1):');
  console.log(JSON.stringify(handlePropagatedError(transientError, 1), null, 2));

  console.log('\nCoordinator decision (attempt 3 - exhausted):');
  console.log(JSON.stringify(handlePropagatedError(transientError, 3), null, 2));

  // Simulate: analysis subagent - document not found
  console.log('\n--- Scenario: Analysis subagent — document not found ---\n');
  const validationError = buildPropagatedError({
    subagentId: 'analysis-agent-1',
    taskDescription: 'Analyze report on AI in music production',
    errorCategory: 'validation',
    isRetryable: false,
    message: 'Document not found: doc-999',
  });
  console.log('Propagated error:', JSON.stringify(validationError, null, 2));
  console.log('\nCoordinator decision:');
  console.log(JSON.stringify(handlePropagatedError(validationError, 1), null, 2));
}

// Run if executed directly
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;
if (isDirectExecution) {
  demonstrate();
}
