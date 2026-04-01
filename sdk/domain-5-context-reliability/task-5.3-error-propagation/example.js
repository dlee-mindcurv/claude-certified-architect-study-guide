/**
 * Task 5.3 — Error Propagation with Structured Context
 *
 * Exam relevance:
 * - Subagents return structured error context, not generic status codes
 * - Coordinator makes intelligent recovery decisions based on error type
 * - Distinguishing empty results (valid) from errors (service failure)
 * - Coverage annotations in final output marking gaps from failed subagents
 *
 * This example demonstrates:
 * 1. Subagent that returns structured error on timeout
 * 2. Coordinator that receives error and makes intelligent recovery
 * 3. Difference between empty results vs. error
 * 4. Final output with coverage annotations
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { researchToolDefinitions, executeResearchTool } from '../../../shared/tools/research-tools.js';
import { researchCoordinatorPrompt, synthesisSubagentPrompt } from '../../../shared/prompts/research-coordinator.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 10;

// ─── Structured Error Types ──────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Every subagent failure returns a structured object with
// four fields: failureType, attemptedQuery, partialResults, alternatives.
// This enables the coordinator to make intelligent recovery decisions.

/**
 * Create a structured error context object.
 * This is what subagents return when they encounter failures.
 */
function createErrorContext({ failureType, attemptedQuery, partialResults = [], alternatives = [] }) {
  return {
    isError: true,
    failureType,        // timeout | rate_limit | access_denied | invalid_query | service_unavailable
    attemptedQuery,     // The exact query that failed
    partialResults,     // Any results obtained before the failure
    alternatives,       // Suggested recovery actions
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a valid empty result (NOT an error).
 *
 * EXAM KEY CONCEPT: An empty result set is a valid outcome -- it means the
 * search completed successfully but found nothing. This is fundamentally
 * different from a timeout or service error.
 */
function createEmptyResult(query) {
  return {
    isError: false,
    query,
    results: [],
    totalResults: 0,
    message: `No results found for: ${query}`,
    // This is a COVERAGE GAP (topic not covered), not a FAILURE (service down)
  };
}

// ─── Simulated Subagent Execution ─────────────────────────────────────────────
//
// Simulates three research subagents with different failure modes:
// - Subagent A: Succeeds normally (AI in visual arts)
// - Subagent B: Times out with partial results (AI in music)
// - Subagent C: Returns valid empty results (AI in quantum agriculture)

async function executeSearchSubagent(topic) {
  console.log(`\n  [Subagent] Searching: "${topic}"`);

  // Simulate Subagent B: Timeout with partial results
  if (topic.toLowerCase().includes('music')) {
    console.log(`  [Subagent] TIMEOUT on "${topic}" -- returning partial results`);
    return createErrorContext({
      failureType: 'timeout',
      attemptedQuery: topic,
      partialResults: [
        {
          claim: 'AI-assisted music production reduced average production time by 35%',
          source_url: 'https://example.com/ai-music',
          source_name: 'MusicTech Weekly',
          publication_date: '2025-02-20',
          confidence: 'medium',
        },
      ],
      alternatives: [
        'Retry with narrower query: "AI music composition tools 2025"',
        'Try alternative source: analyze_document for doc-001',
      ],
    });
  }

  // Simulate Subagent C: Valid empty results (not an error)
  if (topic.toLowerCase().includes('quantum') || topic.toLowerCase().includes('agriculture')) {
    console.log(`  [Subagent] No results found for "${topic}" (valid empty result)`);
    return createEmptyResult(topic);
  }

  // Simulate Subagent A: Success
  const result = executeResearchTool('web_search', { query: topic, max_results: 3 });
  if (result.isError) {
    const parsed = JSON.parse(result.content);
    return createErrorContext({
      failureType: parsed.errorCategory === 'transient' ? 'timeout' : 'service_unavailable',
      attemptedQuery: topic,
      partialResults: [],
      alternatives: parsed.alternative_approaches || ['Retry the search'],
    });
  }

  const parsed = JSON.parse(result.content);
  console.log(`  [Subagent] Found ${parsed.results.length} results for "${topic}"`);

  return {
    isError: false,
    topic,
    findings: parsed.results.map(r => ({
      claim: r.snippet,
      source_url: r.url,
      source_name: r.source,
      publication_date: r.publishedDate,
      confidence: 'medium',
    })),
  };
}

// ─── Coordinator Recovery Logic ───────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The coordinator inspects the structured error context
// and makes an intelligent recovery decision -- not a blanket retry or fail.

async function coordinatorRecovery(errorContext) {
  console.log(`\n  [Coordinator] Handling ${errorContext.failureType} error`);
  console.log(`  [Coordinator] Query: "${errorContext.attemptedQuery}"`);
  console.log(`  [Coordinator] Partial results: ${errorContext.partialResults.length}`);

  switch (errorContext.failureType) {
    case 'timeout': {
      // Use partial results if available, attempt recovery for the rest
      if (errorContext.partialResults.length > 0) {
        console.log(`  [Coordinator] Using ${errorContext.partialResults.length} partial results`);

        // Try one alternative if available
        if (errorContext.alternatives.length > 0) {
          console.log(`  [Coordinator] Trying alternative: ${errorContext.alternatives[0]}`);
          // In a real system, this would invoke a new subagent with the alternative query
        }

        return {
          recovered: true,
          strategy: 'partial_results_with_gap',
          results: errorContext.partialResults,
          coverageNote: `Partial coverage: search timed out after ${errorContext.partialResults.length} results. Topic may be underrepresented.`,
        };
      }

      // No partial results -- retry once
      console.log(`  [Coordinator] No partial results. Retrying...`);
      const retryResult = await executeSearchSubagent(errorContext.attemptedQuery);
      if (!retryResult.isError) {
        return { recovered: true, strategy: 'retry_success', results: retryResult.findings || [] };
      }

      return {
        recovered: false,
        strategy: 'retry_failed',
        results: [],
        coverageNote: `Coverage gap: search for "${errorContext.attemptedQuery}" failed after retry. Topic not covered.`,
      };
    }

    case 'rate_limit': {
      // Wait and retry (in production, use exponential backoff)
      console.log(`  [Coordinator] Rate limited. Would wait and retry.`);
      return {
        recovered: false,
        strategy: 'deferred',
        results: [],
        coverageNote: `Coverage gap: rate limited on "${errorContext.attemptedQuery}". Consider retrying later.`,
      };
    }

    case 'access_denied': {
      console.log(`  [Coordinator] Access denied. Trying alternatives.`);
      return {
        recovered: false,
        strategy: 'access_denied',
        results: [],
        coverageNote: `Coverage gap: access denied for "${errorContext.attemptedQuery}". Alternative sources needed.`,
      };
    }

    default: {
      return {
        recovered: false,
        strategy: 'unrecoverable',
        results: [],
        coverageNote: `Coverage gap: ${errorContext.failureType} on "${errorContext.attemptedQuery}".`,
      };
    }
  }
}

// ─── Build Final Report with Coverage Annotations ─────────────────────────────
//
// EXAM KEY CONCEPT: The final report explicitly annotates what was well-covered
// and what has gaps. This prevents the reader from assuming comprehensive coverage
// when parts of the research failed.

function buildReportWithCoverage(allResults) {
  const report = {
    findings: [],
    coverageAnnotations: {
      wellSupported: [],
      gaps: [],
    },
  };

  for (const result of allResults) {
    if (result.isError) {
      // This was an error -- check if coordinator recovered
      if (result.recovery) {
        if (result.recovery.recovered) {
          report.findings.push(...result.recovery.results);
          if (result.recovery.coverageNote) {
            report.coverageAnnotations.gaps.push(result.recovery.coverageNote);
          }
        } else {
          report.coverageAnnotations.gaps.push(
            result.recovery.coverageNote || `Failed: ${result.attemptedQuery}`
          );
        }
      }
    } else if (result.totalResults === 0) {
      // Valid empty result -- note as a topic gap (not an error)
      report.coverageAnnotations.gaps.push(
        `No sources found for: "${result.query}". Topic appears to lack published coverage.`
      );
    } else {
      // Successful results
      const findings = result.findings || [];
      report.findings.push(...findings);
      if (findings.length >= 2) {
        report.coverageAnnotations.wellSupported.push(
          `${result.topic}: ${findings.length} sources found`
        );
      }
    }
  }

  return report;
}

// ─── Main: Orchestrate Research with Error Handling ───────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Task 5.3: Error Propagation with Structured Context');
  console.log('='.repeat(60));

  // Define research topics (some will succeed, some will fail)
  const topics = [
    'AI creative industries',      // Will succeed
    'AI music production 2025',    // Will timeout with partial results
    'quantum computing agriculture', // Will return valid empty results
  ];

  console.log('\n--- Phase 1: Execute subagent searches ---');
  const allResults = [];

  for (const topic of topics) {
    const result = await executeSearchSubagent(topic);

    if (result.isError) {
      // Coordinator attempts recovery
      console.log(`\n--- Phase 2: Coordinator recovery for "${topic}" ---`);
      const recovery = await coordinatorRecovery(result);
      result.recovery = recovery;
    }

    allResults.push(result);
  }

  // Build final report with coverage annotations
  console.log('\n--- Phase 3: Build report with coverage annotations ---');
  const report = buildReportWithCoverage(allResults);

  console.log('\n' + '='.repeat(60));
  console.log('FINAL REPORT');
  console.log('='.repeat(60));

  console.log('\n## Findings');
  for (const finding of report.findings) {
    console.log(`  - ${finding.claim || finding.snippet}`);
    console.log(`    Source: ${finding.source_name || finding.source_url} (${finding.publication_date})`);
  }

  console.log('\n## Coverage');

  console.log('\n### Well-Supported Topics');
  if (report.coverageAnnotations.wellSupported.length === 0) {
    console.log('  (none met the threshold of 2+ sources)');
  }
  for (const item of report.coverageAnnotations.wellSupported) {
    console.log(`  + ${item}`);
  }

  console.log('\n### Coverage Gaps');
  if (report.coverageAnnotations.gaps.length === 0) {
    console.log('  (no gaps detected)');
  }
  for (const gap of report.coverageAnnotations.gaps) {
    console.log(`  ! ${gap}`);
  }

  // Demonstrate the key distinction
  console.log('\n' + '='.repeat(60));
  console.log('KEY DISTINCTION: Empty Results vs. Errors');
  console.log('='.repeat(60));
  console.log('\nEmpty results (valid):');
  console.log('  Query: "quantum computing agriculture"');
  console.log('  Meaning: Search completed, no sources exist on this topic');
  console.log('  Action: Note as coverage gap (topic lacks published research)');
  console.log('\nTimeout error (failure):');
  console.log('  Query: "AI music production 2025"');
  console.log('  Meaning: Search did not complete; sources may exist');
  console.log('  Action: Use partial results, retry, note as incomplete coverage');
}

main().catch(console.error);
