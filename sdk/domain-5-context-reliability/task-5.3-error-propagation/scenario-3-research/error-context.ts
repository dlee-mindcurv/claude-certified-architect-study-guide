/**
 * Scenario 3: Research System Error Propagation -- Agent SDK Implementation
 *
 * Exam relevance (Task 5.3):
 * - Structured error context from subagents to coordinator
 * - Coordinator recovery strategies based on failure type
 * - Distinguishing empty results from service failures
 * - Coverage annotations in the final synthesized report
 *
 * EXAM KEY CONCEPT:
 *   Structured errors carry enough context for the coordinator to make an
 *   intelligent recovery decision. Generic "error: true" is never enough.
 *   Empty results (search completed, nothing found) are fundamentally
 *   different from service failures (search did not complete).
 *
 * This module provides error context factories, recovery logic, and
 * coverage annotation builders. Uses query() for retry subagents.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../../../shared/tools/research-tools.js';

// ─── Error Context Factory ───────────────────────────────────────────────────

export const FAILURE_TYPES = {
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  ACCESS_DENIED: 'access_denied',
  INVALID_QUERY: 'invalid_query',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  PARTIAL_FAILURE: 'partial_failure',
} as const;

type FailureType = typeof FAILURE_TYPES[keyof typeof FAILURE_TYPES];

interface PartialResult {
  claim: string;
  source_name?: string;
  confidence?: string;
  _partialResult?: boolean;
  _recoveryNote?: string;
  _recoveredVia?: string;
}

interface SubagentError {
  isError: true;
  subagentId: string;
  failureType: FailureType;
  attemptedQuery: string;
  partialResults: PartialResult[];
  partialResultCount: number;
  alternatives: string[];
  timestamp: string;
  recovery?: RecoveryExecutionResult;
}

interface ValidEmptyResult {
  isError: false;
  subagentId: string;
  query: string;
  results: never[];
  totalResults: 0;
  message: string;
  coverageImplication: string;
}

interface SuccessResult {
  isError: false;
  topic: string;
  findings: PartialResult[];
  totalResults: number;
  results?: PartialResult[];
  query?: string;
}

type SubagentResult = SubagentError | ValidEmptyResult | SuccessResult;

interface RecoveryPlan {
  strategy: string;
  shouldRetry: boolean;
  usePartials: boolean;
  coverageNote: string;
}

interface RecoveryExecutionResult {
  findings: PartialResult[];
  coverageNote: string;
  recoveredSuccessfully: boolean;
}

/**
 * EXAM KEY CONCEPT: Structured errors carry enough context for the coordinator
 * to make an intelligent recovery decision.
 */
export function createSubagentError({ failureType, attemptedQuery, partialResults = [], alternatives = [], subagentId = 'unknown' }: { failureType: FailureType; attemptedQuery: string; partialResults?: PartialResult[]; alternatives?: string[]; subagentId?: string }): SubagentError {
  return {
    isError: true,
    subagentId,
    failureType,
    attemptedQuery,
    partialResults,
    partialResultCount: partialResults.length,
    alternatives,
    timestamp: new Date().toISOString(),
  };
}

/**
 * EXAM KEY CONCEPT: Empty results mean the search completed successfully
 * but found nothing. This is a coverage gap about the TOPIC, not a failure
 * of the SYSTEM.
 *
 * Coverage gap (empty results): "No published sources exist on this topic"
 * Service failure (error):       "We could not search for this topic"
 */
export function createValidEmptyResult({ query: queryStr, subagentId = 'unknown' }: { query: string; subagentId?: string }): ValidEmptyResult {
  return {
    isError: false,
    subagentId,
    query: queryStr,
    results: [],
    totalResults: 0,
    message: `Search completed successfully. No results found for: "${queryStr}"`,
    coverageImplication: 'Topic lacks published coverage in searched sources',
  };
}

// ─── Coordinator Recovery Logic ──────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The coordinator inspects the structured error and chooses
// a recovery strategy. It does NOT suppress errors or terminate.

export function planRecovery(errorContext: SubagentError): RecoveryPlan {
  const { failureType, attemptedQuery, partialResults } = errorContext;

  switch (failureType) {
    case FAILURE_TYPES.TIMEOUT:
      if (partialResults.length > 0) {
        return {
          strategy: 'use_partial_results',
          shouldRetry: true,
          usePartials: true,
          coverageNote: `Partial coverage for "${attemptedQuery}": timed out after ${partialResults.length} result(s).`,
        };
      }
      return {
        strategy: 'retry_then_gap',
        shouldRetry: true,
        usePartials: false,
        coverageNote: `Coverage gap for "${attemptedQuery}": search timed out with no results.`,
      };

    case FAILURE_TYPES.RATE_LIMIT:
      return {
        strategy: 'deferred_retry',
        shouldRetry: true,
        usePartials: partialResults.length > 0,
        coverageNote: `Deferred coverage for "${attemptedQuery}": rate limited.`,
      };

    case FAILURE_TYPES.ACCESS_DENIED:
      return {
        strategy: 'alternative_source',
        shouldRetry: false,
        usePartials: false,
        coverageNote: `Coverage gap for "${attemptedQuery}": access denied.`,
      };

    case FAILURE_TYPES.INVALID_QUERY:
      return {
        strategy: 'rephrase_and_retry',
        shouldRetry: true,
        usePartials: false,
        coverageNote: `Coverage gap for "${attemptedQuery}": query was malformed.`,
      };

    case FAILURE_TYPES.SERVICE_UNAVAILABLE:
      return {
        strategy: 'mark_gap',
        shouldRetry: false,
        usePartials: partialResults.length > 0,
        coverageNote: `Coverage gap for "${attemptedQuery}": service unavailable.`,
      };

    default:
      return {
        strategy: 'unknown_error',
        shouldRetry: false,
        usePartials: partialResults.length > 0,
        coverageNote: `Coverage gap for "${attemptedQuery}": ${failureType}.`,
      };
  }
}

// ─── Recovery Executor ───────────────────────────────────────────────────────

/**
 * Execute the recovery plan. Uses query() for retry subagents.
 */
export async function executeRecovery(errorContext: SubagentError, recoveryPlan: RecoveryPlan): Promise<RecoveryExecutionResult> {
  const result: RecoveryExecutionResult = {
    findings: [],
    coverageNote: recoveryPlan.coverageNote,
    recoveredSuccessfully: false,
  };

  // Use partial results if available
  if (recoveryPlan.usePartials && errorContext.partialResults.length > 0) {
    result.findings.push(...errorContext.partialResults.map((r: PartialResult) => ({
      ...r, _partialResult: true, _recoveryNote: 'Obtained before subagent failure',
    })));
  }

  // Attempt retry via query() subagent
  if (recoveryPlan.shouldRetry) {
    const retryQuery = errorContext.attemptedQuery;
    console.log(`  [Recovery] Retrying: "${retryQuery}"`);

    try {
      for await (const message of query({
        prompt: `Search for: "${retryQuery}". Return findings with source attribution.`,
        options: {
          systemPrompt: 'You are a research retry subagent. Search for the topic and return key findings.',
          mcpServers: { research: researchServer },
          allowedTools: ['mcp__research__web_search'],
          maxTurns: 2,
        },
      })) {
        if (message.type === 'result' && message.subtype === 'success') {
          result.findings.push({
            claim: message.result,
            confidence: 'medium',
            _recoveredVia: 'retry',
          });
          result.recoveredSuccessfully = true;
          result.coverageNote = `Recovered after retry: "${retryQuery}"`;
        }
      }
    } catch {
      console.log(`  [Recovery] Retry also failed for "${retryQuery}"`);
    }
  }

  return result;
}

// ─── Coverage Annotation Builder ─────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: The final report must distinguish between:
 * 1. Well-supported topics (multiple independent sources)
 * 2. Error-caused gaps (service failures)
 * 3. Topic-caused gaps (no published sources exist)
 * 4. Partial coverage (some results obtained before failure)
 */

interface CoverageAnnotations {
  wellSupported: Array<{ topic: string; findingCount: number }>;
  errorGaps: Array<{ topic: string; note: string; failureType: string }>;
  topicGaps: Array<{ topic: string; note: string }>;
  partialCoverage: Array<{ topic: string; findingCount: number; note: string; failureType: string }>;
}

export function buildCoverageAnnotations(subagentResults: SubagentResult[]): CoverageAnnotations {
  const annotations: CoverageAnnotations = {
    wellSupported: [],
    errorGaps: [],
    topicGaps: [],
    partialCoverage: [],
  };

  for (const result of subagentResults) {
    if (result.isError) {
      const errorResult = result as SubagentError;
      if (errorResult.recovery?.findings?.length && errorResult.recovery.findings.length > 0) {
        annotations.partialCoverage.push({
          topic: errorResult.attemptedQuery,
          findingCount: errorResult.recovery.findings.length,
          note: errorResult.recovery.coverageNote,
          failureType: errorResult.failureType,
        });
      } else {
        annotations.errorGaps.push({
          topic: errorResult.attemptedQuery,
          note: errorResult.recovery?.coverageNote || `Search failed: ${errorResult.failureType}`,
          failureType: errorResult.failureType,
        });
      }
    } else if (result.totalResults === 0) {
      annotations.topicGaps.push({
        topic: (result as ValidEmptyResult).query,
        note: 'No published sources found. Topic lacks coverage.',
      });
    } else {
      const successResult = result as SuccessResult;
      const count = successResult.findings?.length || successResult.results?.length || 0;
      if (count >= 2) {
        annotations.wellSupported.push({
          topic: successResult.topic || (successResult as unknown as ValidEmptyResult).query,
          findingCount: count,
        });
      }
    }
  }

  return annotations;
}

/**
 * Render coverage annotations as markdown.
 */
export function renderCoverageSection(annotations: CoverageAnnotations): string {
  const lines: string[] = ['## Coverage Assessment'];

  if (annotations.wellSupported.length > 0) {
    lines.push('', '### Well-Supported Topics');
    for (const item of annotations.wellSupported) {
      lines.push(`- **${item.topic}**: ${item.findingCount} findings`);
    }
  }

  if (annotations.partialCoverage.length > 0) {
    lines.push('', '### Partial Coverage (incomplete due to errors)');
    for (const item of annotations.partialCoverage) {
      lines.push(`- **${item.topic}**: ${item.findingCount} results recovered`);
      lines.push(`  - Note: ${item.note}`);
    }
  }

  if (annotations.errorGaps.length > 0) {
    lines.push('', '### Service Failure Gaps');
    for (const item of annotations.errorGaps) {
      lines.push(`- **${item.topic}**: Could not be researched (${item.failureType})`);
    }
  }

  if (annotations.topicGaps.length > 0) {
    lines.push('', '### Topic Gaps (no published sources)');
    for (const item of annotations.topicGaps) {
      lines.push(`- **${item.topic}**: ${item.note}`);
    }
  }

  return lines.join('\n');
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Scenario 3: Research Error Propagation Pipeline');
  console.log('='.repeat(60));

  // Simulate subagent results with different failure modes
  const subagentResults: SubagentResult[] = [
    { isError: false, topic: 'AI creative industries', findings: [
      { claim: 'AI tools are transforming visual arts', source_name: 'TechReview' },
      { claim: 'Studios adopt AI for VFX and scripting', source_name: 'Entertainment Tech' },
    ], totalResults: 2 } as SuccessResult,
    createSubagentError({
      failureType: FAILURE_TYPES.TIMEOUT,
      attemptedQuery: 'AI music production 2025',
      partialResults: [{ claim: 'AI reduced production time by 35%', source_name: 'MusicTech Weekly' }],
      subagentId: 'search-music',
    }),
    createValidEmptyResult({ query: 'quantum computing in agriculture', subagentId: 'search-quantum' }),
  ];

  // Run recovery for errors
  for (const result of subagentResults) {
    if (result.isError) {
      const errorResult = result as SubagentError;
      const plan = planRecovery(errorResult);
      console.log(`\n  Strategy: ${plan.strategy}`);
      errorResult.recovery = await executeRecovery(errorResult, plan);
    }
  }

  // Build coverage annotations
  const annotations = buildCoverageAnnotations(subagentResults);
  console.log('\n' + renderCoverageSection(annotations));
}

main().catch(console.error);
