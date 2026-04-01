/**
 * Scenario 3: Research System Error Propagation
 *
 * Exam relevance (Task 5.3):
 * - Structured error context from subagents to coordinator
 * - Coordinator recovery strategies based on failure type
 * - Distinguishing empty results from service failures
 * - Coverage annotations in the final synthesized report
 *
 * This module provides:
 * 1. Error context factories for each failure type
 * 2. Recovery decision logic for the coordinator
 * 3. Coverage annotation builder for final reports
 * 4. Full research pipeline with graceful error handling
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { researchToolDefinitions, executeResearchTool } from '../../../../shared/tools/research-tools.js';
import { researchCoordinatorPrompt, synthesisSubagentPrompt } from '../../../../shared/prompts/research-coordinator.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 10;

// ─── Error Context Factory ───────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Structured errors carry enough context for the coordinator
// to make an intelligent recovery decision. Generic "error: true" is never enough.

export const FAILURE_TYPES = {
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  ACCESS_DENIED: 'access_denied',
  INVALID_QUERY: 'invalid_query',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  PARTIAL_FAILURE: 'partial_failure',
};

/**
 * Create a structured error context for a subagent failure.
 *
 * @param {object} params
 * @param {string} params.failureType - One of FAILURE_TYPES
 * @param {string} params.attemptedQuery - The exact query that failed
 * @param {Array} params.partialResults - Any results obtained before failure
 * @param {Array} params.alternatives - Suggested recovery actions
 * @param {string} params.subagentId - Identifier for the failing subagent
 * @returns {object} Structured error context
 */
export function createSubagentError({
  failureType,
  attemptedQuery,
  partialResults = [],
  alternatives = [],
  subagentId = 'unknown',
}) {
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
 * Create a valid empty result (explicitly NOT an error).
 *
 * EXAM KEY CONCEPT: Empty results mean the search completed successfully
 * but found nothing. This is a coverage gap about the TOPIC, not a failure
 * of the SYSTEM. The coordinator should annotate this differently.
 *
 * Coverage gap (empty results): "No published sources exist on this topic"
 * Service failure (error):       "We could not search for this topic"
 */
export function createValidEmptyResult({ query, subagentId = 'unknown' }) {
  return {
    isError: false,
    subagentId,
    query,
    results: [],
    totalResults: 0,
    message: `Search completed successfully. No results found for: "${query}"`,
    coverageImplication: 'Topic lacks published coverage in searched sources',
  };
}

// ─── Coordinator Recovery Logic ──────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The coordinator inspects the structured error and chooses
// a recovery strategy. It does NOT suppress errors (pretend they didn't happen)
// or terminate (give up on the whole report).

/**
 * Determine recovery strategy for a subagent error.
 *
 * @param {object} errorContext - Structured error from createSubagentError
 * @returns {object} Recovery plan with strategy, actions, and coverage note
 */
export function planRecovery(errorContext) {
  const { failureType, attemptedQuery, partialResults, alternatives } = errorContext;

  switch (failureType) {
    case FAILURE_TYPES.TIMEOUT: {
      if (partialResults.length > 0) {
        return {
          strategy: 'use_partial_results',
          shouldRetry: true,
          usePartials: true,
          coverageNote: buildCoverageNote('partial', attemptedQuery, partialResults.length),
          explanation: `Search timed out but ${partialResults.length} partial results are available. ` +
            'Using these while attempting recovery for remaining results.',
        };
      }
      return {
        strategy: 'retry_then_gap',
        shouldRetry: true,
        usePartials: false,
        coverageNote: buildCoverageNote('timeout', attemptedQuery, 0),
        explanation: 'Search timed out with no partial results. Will retry once.',
      };
    }

    case FAILURE_TYPES.RATE_LIMIT: {
      return {
        strategy: 'deferred_retry',
        shouldRetry: true,
        usePartials: partialResults.length > 0,
        retryDelay: 5000, // milliseconds
        coverageNote: buildCoverageNote('rate_limit', attemptedQuery, partialResults.length),
        explanation: 'Rate limited. Deferring retry with backoff.',
      };
    }

    case FAILURE_TYPES.ACCESS_DENIED: {
      return {
        strategy: 'alternative_source',
        shouldRetry: false,
        usePartials: false,
        suggestedAlternatives: alternatives,
        coverageNote: buildCoverageNote('access_denied', attemptedQuery, 0),
        explanation: 'Access denied. Attempting alternative data sources if available.',
      };
    }

    case FAILURE_TYPES.INVALID_QUERY: {
      return {
        strategy: 'rephrase_and_retry',
        shouldRetry: true,
        usePartials: false,
        suggestedRephrasing: alternatives.length > 0
          ? alternatives[0]
          : `Try broader terms for: "${attemptedQuery}"`,
        coverageNote: buildCoverageNote('invalid_query', attemptedQuery, 0),
        explanation: 'Query was malformed. Will rephrase and retry.',
      };
    }

    case FAILURE_TYPES.SERVICE_UNAVAILABLE: {
      return {
        strategy: 'mark_gap',
        shouldRetry: false,
        usePartials: partialResults.length > 0,
        coverageNote: buildCoverageNote('unavailable', attemptedQuery, partialResults.length),
        explanation: 'Service is down. Marking as coverage gap and proceeding.',
      };
    }

    case FAILURE_TYPES.PARTIAL_FAILURE: {
      return {
        strategy: 'use_partial_results',
        shouldRetry: true,
        usePartials: true,
        coverageNote: buildCoverageNote('partial', attemptedQuery, partialResults.length),
        explanation: `Partial failure. Using ${partialResults.length} available results.`,
      };
    }

    default: {
      return {
        strategy: 'unknown_error',
        shouldRetry: false,
        usePartials: partialResults.length > 0,
        coverageNote: buildCoverageNote('unknown', attemptedQuery, partialResults.length),
        explanation: `Unknown failure type: ${failureType}. Marking as gap.`,
      };
    }
  }
}

function buildCoverageNote(type, query, partialCount) {
  const notes = {
    partial: `Partial coverage for "${query}": search timed out after ${partialCount} result(s). Topic may be underrepresented in the report.`,
    timeout: `Coverage gap for "${query}": search timed out with no results. This topic could not be researched.`,
    rate_limit: `Deferred coverage for "${query}": rate limited during search. ${partialCount > 0 ? `${partialCount} partial result(s) available.` : 'No results yet.'}`,
    access_denied: `Coverage gap for "${query}": access denied to data source. Alternative sources needed.`,
    invalid_query: `Coverage gap for "${query}": search query was malformed. Rephrasing needed.`,
    unavailable: `Coverage gap for "${query}": data source unavailable. ${partialCount > 0 ? `${partialCount} partial result(s) from before failure.` : 'No results available.'}`,
    unknown: `Coverage gap for "${query}": unexpected error. ${partialCount > 0 ? `${partialCount} partial result(s) available.` : 'No results.'}`,
  };
  return notes[type] || `Coverage gap for "${query}": ${type}`;
}

// ─── Recovery Executor ───────────────────────────────────────────────────────

/**
 * Execute the recovery plan for a failed subagent.
 *
 * @param {object} errorContext - Original structured error
 * @param {object} recoveryPlan - Plan from planRecovery()
 * @returns {object} Recovery result with findings and coverage note
 */
export async function executeRecovery(errorContext, recoveryPlan) {
  const result = {
    findings: [],
    coverageNote: recoveryPlan.coverageNote,
    recoveredSuccessfully: false,
  };

  // Use partial results if available
  if (recoveryPlan.usePartials && errorContext.partialResults.length > 0) {
    result.findings.push(...errorContext.partialResults.map(r => ({
      ...r,
      _partialResult: true,
      _recoveryNote: 'Obtained before subagent failure',
    })));
  }

  // Attempt retry if the plan calls for it
  if (recoveryPlan.shouldRetry) {
    const retryQuery = recoveryPlan.suggestedRephrasing || errorContext.attemptedQuery;

    // Optional delay for rate limiting
    if (recoveryPlan.retryDelay) {
      console.log(`  [Recovery] Waiting ${recoveryPlan.retryDelay}ms before retry...`);
      // In a real system: await new Promise(r => setTimeout(r, recoveryPlan.retryDelay));
    }

    console.log(`  [Recovery] Retrying: "${retryQuery}"`);
    const retryResult = executeResearchTool('web_search', { query: retryQuery, max_results: 5 });

    if (!retryResult.isError) {
      const parsed = JSON.parse(retryResult.content);
      if (parsed.results && parsed.results.length > 0) {
        result.findings.push(...parsed.results.map(r => ({
          claim: r.snippet,
          source_url: r.url,
          source_name: r.source,
          publication_date: r.publishedDate,
          confidence: 'medium',
          _recoveredVia: 'retry',
        })));
        result.recoveredSuccessfully = true;
        result.coverageNote = `Recovered after retry: "${retryQuery}" returned ${parsed.results.length} results.`;
      }
    }
  }

  // Try alternative sources if specified
  if (recoveryPlan.suggestedAlternatives && !result.recoveredSuccessfully) {
    for (const alt of recoveryPlan.suggestedAlternatives) {
      console.log(`  [Recovery] Trying alternative: ${alt}`);
      // In a real system, parse and execute the alternative approach
    }
  }

  return result;
}

// ─── Coverage Annotation Builder ─────────────────────────────────────────────

/**
 * Build coverage annotations from all subagent results.
 *
 * EXAM KEY CONCEPT: The final report must distinguish between:
 * 1. Well-supported topics (multiple independent sources)
 * 2. Error-caused gaps (service failures)
 * 3. Topic-caused gaps (no published sources exist)
 * 4. Partial coverage (some results obtained before failure)
 */
export function buildCoverageAnnotations(subagentResults) {
  const annotations = {
    wellSupported: [],
    errorGaps: [],
    topicGaps: [],
    partialCoverage: [],
  };

  for (const result of subagentResults) {
    if (result.isError) {
      // Service failure
      if (result.recovery?.findings?.length > 0) {
        annotations.partialCoverage.push({
          topic: result.attemptedQuery,
          findingCount: result.recovery.findings.length,
          note: result.recovery.coverageNote,
          failureType: result.failureType,
        });
      } else {
        annotations.errorGaps.push({
          topic: result.attemptedQuery,
          note: result.recovery?.coverageNote || `Search failed: ${result.failureType}`,
          failureType: result.failureType,
        });
      }
    } else if (result.totalResults === 0) {
      // Valid empty result -- topic gap
      annotations.topicGaps.push({
        topic: result.query,
        note: `No published sources found. Topic lacks coverage in searched sources.`,
      });
    } else {
      // Success
      const findingCount = result.findings?.length || result.results?.length || 0;
      if (findingCount >= 2) {
        annotations.wellSupported.push({
          topic: result.topic || result.query,
          findingCount,
          sourceCount: findingCount, // Each finding is from a unique source
        });
      }
    }
  }

  return annotations;
}

/**
 * Render coverage annotations as a markdown section.
 */
export function renderCoverageSection(annotations) {
  const lines = ['## Coverage Assessment'];

  if (annotations.wellSupported.length > 0) {
    lines.push('', '### Well-Supported Topics');
    for (const item of annotations.wellSupported) {
      lines.push(`- **${item.topic}**: ${item.findingCount} findings from ${item.sourceCount} sources`);
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
      lines.push(`  - Note: ${item.note}`);
    }
  }

  if (annotations.topicGaps.length > 0) {
    lines.push('', '### Topic Gaps (no published sources)');
    for (const item of annotations.topicGaps) {
      lines.push(`- **${item.topic}**: ${item.note}`);
    }
  }

  if (
    annotations.wellSupported.length === 0 &&
    annotations.partialCoverage.length === 0 &&
    annotations.errorGaps.length === 0 &&
    annotations.topicGaps.length === 0
  ) {
    lines.push('', 'No coverage data available.');
  }

  return lines.join('\n');
}

// ─── Full Research Pipeline with Error Handling ──────────────────────────────

async function runResearchPipeline(topics) {
  console.log('='.repeat(60));
  console.log('Scenario 3: Research Error Propagation Pipeline');
  console.log('='.repeat(60));

  const subagentResults = [];

  // Phase 1: Execute all subagent searches
  console.log('\n--- Phase 1: Subagent execution ---');

  for (const topic of topics) {
    console.log(`\n  Searching: "${topic}"`);
    const toolResult = executeResearchTool('web_search', { query: topic, max_results: 5 });

    if (toolResult.isError) {
      const errorData = JSON.parse(toolResult.content);

      // Build structured error context
      const errorContext = createSubagentError({
        failureType: errorData.errorCategory === 'transient' ? FAILURE_TYPES.TIMEOUT : FAILURE_TYPES.SERVICE_UNAVAILABLE,
        attemptedQuery: errorData.attempted_query || topic,
        partialResults: errorData.partial_results || [],
        alternatives: errorData.alternative_approaches || [],
        subagentId: `search-${topic.replace(/\s+/g, '-')}`,
      });

      console.log(`  ERROR: ${errorContext.failureType} on "${topic}"`);

      // Phase 2: Coordinator recovery
      console.log('\n--- Phase 2: Recovery ---');
      const plan = planRecovery(errorContext);
      console.log(`  Strategy: ${plan.strategy}`);
      console.log(`  Explanation: ${plan.explanation}`);

      const recovery = await executeRecovery(errorContext, plan);
      errorContext.recovery = recovery;

      subagentResults.push(errorContext);
    } else {
      const parsed = JSON.parse(toolResult.content);

      if (parsed.totalResults === 0) {
        console.log(`  Empty result (valid): no sources for "${topic}"`);
        subagentResults.push(createValidEmptyResult({ query: topic }));
      } else {
        console.log(`  Success: ${parsed.results.length} results`);
        subagentResults.push({
          isError: false,
          topic,
          findings: parsed.results.map(r => ({
            claim: r.snippet,
            source_url: r.url,
            source_name: r.source,
            publication_date: r.publishedDate,
            confidence: 'medium',
          })),
          totalResults: parsed.totalResults,
        });
      }
    }
  }

  // Phase 3: Build coverage annotations
  console.log('\n--- Phase 3: Coverage analysis ---');
  const annotations = buildCoverageAnnotations(subagentResults);
  const coverageSection = renderCoverageSection(annotations);

  console.log('\n' + coverageSection);

  return { subagentResults, annotations, coverageSection };
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

async function main() {
  await runResearchPipeline([
    'AI creative industries',
    'renewable energy 2025',
    'quantum computing in agriculture',
  ]);
}

main().catch(console.error);
