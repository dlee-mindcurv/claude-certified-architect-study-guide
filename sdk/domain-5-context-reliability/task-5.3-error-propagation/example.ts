/**
 * Task 5.3 -- Error Propagation with Structured Context (Agent SDK)
 *
 * Exam relevance:
 * - Subagents return structured error context, not generic status codes
 * - Coordinator makes intelligent recovery decisions based on error type
 * - Distinguishing empty results (valid) from errors (service failure)
 * - Coverage annotations in final output marking gaps from failed subagents
 *
 * EXAM KEY CONCEPT:
 *   Every subagent failure returns a structured object with four fields:
 *   failureType, attemptedQuery, partialResults, alternatives. This enables
 *   the coordinator to make intelligent recovery decisions. An empty result
 *   set is VALID (search completed, nothing found) -- fundamentally different
 *   from a timeout or service error.
 *
 * Uses query() with agents for coordinator + subagent pattern.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../../shared/tools/research-tools.js';
import { researchCoordinatorPrompt } from '../../../shared/prompts/research-coordinator.js';

// ─── Structured Error Types ──────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Every subagent failure returns a structured object.
// Generic "error: true" is never enough.

interface PartialResult {
  claim: string;
  source_url?: string;
  source_name?: string;
  publication_date?: string;
  confidence?: string;
  snippet?: string;
}

interface ErrorContext {
  isError: true;
  failureType: string;
  attemptedQuery: string;
  partialResults: PartialResult[];
  alternatives: string[];
  timestamp: string;
  recovery?: RecoveryResult;
}

interface EmptyResult {
  isError: false;
  query: string;
  results: never[];
  totalResults: 0;
  message: string;
}

interface SuccessResult {
  isError: false;
  topic: string;
  findings: PartialResult[];
  totalResults: number;
}

type SubagentResult = ErrorContext | EmptyResult | SuccessResult;

interface RecoveryResult {
  recovered: boolean;
  strategy: string;
  results: PartialResult[];
  coverageNote: string;
}

function createErrorContext({ failureType, attemptedQuery, partialResults = [], alternatives = [] }: { failureType: string; attemptedQuery: string; partialResults?: PartialResult[]; alternatives?: string[] }): ErrorContext {
  return {
    isError: true,
    failureType,        // timeout | rate_limit | access_denied | service_unavailable
    attemptedQuery,
    partialResults,
    alternatives,
    timestamp: new Date().toISOString(),
  };
}

/**
 * EXAM KEY CONCEPT: An empty result set is a valid outcome -- the search
 * completed successfully but found nothing. This is fundamentally different
 * from a timeout or service error.
 */
function createEmptyResult(queryStr: string): EmptyResult {
  return {
    isError: false,
    query: queryStr,
    results: [],
    totalResults: 0,
    message: `No results found for: ${queryStr}`,
  };
}

// ─── Simulated Subagent Execution ────────────────────────────────────────────

async function executeSearchSubagent(topic: string): Promise<SubagentResult> {
  console.log(`\n  [Subagent] Searching: "${topic}"`);

  // Simulate timeout with partial results
  if (topic.toLowerCase().includes('music')) {
    console.log(`  [Subagent] TIMEOUT on "${topic}" -- returning partial results`);
    return createErrorContext({
      failureType: 'timeout',
      attemptedQuery: topic,
      partialResults: [{
        claim: 'AI-assisted music production reduced average production time by 35%',
        source_url: 'https://example.com/ai-music',
        source_name: 'MusicTech Weekly',
        publication_date: '2025-02-20',
        confidence: 'medium',
      }],
      alternatives: ['Retry with narrower query: "AI music composition tools 2025"'],
    });
  }

  // Simulate valid empty results (not an error)
  if (topic.toLowerCase().includes('quantum') || topic.toLowerCase().includes('agriculture')) {
    console.log(`  [Subagent] No results found for "${topic}" (valid empty result)`);
    return createEmptyResult(topic);
  }

  // Simulate success using query() as a real subagent
  const findings: PartialResult[] = [];

  for await (const message of query({
    prompt: `Search for: "${topic}". Return key findings with sources.`,
    options: {
      systemPrompt: 'You are a research subagent. Use web_search to find information, then summarize findings with source attribution.',
      mcpServers: { research: researchServer },
      allowedTools: ['mcp__research__web_search'],
      maxTurns: 3,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      findings.push({ claim: message.result, source_name: 'search subagent', confidence: 'medium' });
    }
  }

  return { isError: false, topic, findings, totalResults: findings.length };
}

// ─── Coordinator Recovery Logic ───────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The coordinator inspects the structured error context
// and makes an intelligent recovery decision -- not a blanket retry or fail.

async function coordinatorRecovery(errorContext: ErrorContext): Promise<RecoveryResult> {
  console.log(`\n  [Coordinator] Handling ${errorContext.failureType} error`);
  console.log(`  [Coordinator] Partial results: ${errorContext.partialResults.length}`);

  switch (errorContext.failureType) {
    case 'timeout': {
      if (errorContext.partialResults.length > 0) {
        console.log(`  [Coordinator] Using ${errorContext.partialResults.length} partial results`);
        return {
          recovered: true,
          strategy: 'partial_results_with_gap',
          results: errorContext.partialResults,
          coverageNote: `Partial coverage: search timed out after ${errorContext.partialResults.length} results. Topic may be underrepresented.`,
        };
      }
      return {
        recovered: false,
        strategy: 'retry_failed',
        results: [],
        coverageNote: `Coverage gap: search for "${errorContext.attemptedQuery}" failed. Topic not covered.`,
      };
    }

    case 'rate_limit':
      return {
        recovered: false,
        strategy: 'deferred',
        results: [],
        coverageNote: `Coverage gap: rate limited on "${errorContext.attemptedQuery}".`,
      };

    case 'access_denied':
      return {
        recovered: false,
        strategy: 'access_denied',
        results: [],
        coverageNote: `Coverage gap: access denied for "${errorContext.attemptedQuery}".`,
      };

    default:
      return {
        recovered: false,
        strategy: 'unrecoverable',
        results: [],
        coverageNote: `Coverage gap: ${errorContext.failureType} on "${errorContext.attemptedQuery}".`,
      };
  }
}

// ─── Build Final Report with Coverage Annotations ────────────────────────────
//
// EXAM KEY CONCEPT: The final report explicitly annotates what was well-covered
// and what has gaps. This prevents the reader from assuming comprehensive
// coverage when parts of the research failed.

interface Report {
  findings: PartialResult[];
  coverageAnnotations: { wellSupported: string[]; gaps: string[] };
}

function buildReportWithCoverage(allResults: SubagentResult[]): Report {
  const report: Report = {
    findings: [],
    coverageAnnotations: { wellSupported: [], gaps: [] },
  };

  for (const result of allResults) {
    if (result.isError) {
      const errorResult = result as ErrorContext;
      if (errorResult.recovery?.recovered) {
        report.findings.push(...errorResult.recovery.results);
        if (errorResult.recovery.coverageNote) {
          report.coverageAnnotations.gaps.push(errorResult.recovery.coverageNote);
        }
      } else {
        report.coverageAnnotations.gaps.push(
          errorResult.recovery?.coverageNote || `Failed: ${errorResult.attemptedQuery}`
        );
      }
    } else if ('totalResults' in result && result.totalResults === 0) {
      // Valid empty result -- topic gap (not an error)
      report.coverageAnnotations.gaps.push(
        `No sources found for: "${(result as EmptyResult).query}". Topic lacks published coverage.`
      );
    } else {
      const successResult = result as SuccessResult;
      report.findings.push(...(successResult.findings || []));
      if ((successResult.findings || []).length >= 2) {
        report.coverageAnnotations.wellSupported.push(
          `${successResult.topic}: ${successResult.findings.length} sources found`
        );
      }
    }
  }

  return report;
}

// ─── Main: Orchestrate Research with Error Handling ──────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Task 5.3: Error Propagation with Structured Context');
  console.log('='.repeat(60));

  const topics = [
    'AI creative industries',           // Will succeed
    'AI music production 2025',         // Will timeout with partial results
    'quantum computing agriculture',    // Will return valid empty results
  ];

  console.log('\n--- Phase 1: Execute subagent searches ---');
  const allResults: SubagentResult[] = [];

  for (const topic of topics) {
    const result = await executeSearchSubagent(topic);

    if (result.isError) {
      console.log(`\n--- Phase 2: Coordinator recovery for "${topic}" ---`);
      (result as ErrorContext).recovery = await coordinatorRecovery(result as ErrorContext);
    }

    allResults.push(result);
  }

  console.log('\n--- Phase 3: Build report with coverage annotations ---');
  const report = buildReportWithCoverage(allResults);

  console.log('\n' + '='.repeat(60));
  console.log('FINAL REPORT');
  console.log('='.repeat(60));

  console.log('\n## Findings');
  for (const finding of report.findings) {
    console.log(`  - ${finding.claim || finding.snippet}`);
    if (finding.source_name) console.log(`    Source: ${finding.source_name}`);
  }

  console.log('\n## Coverage Gaps');
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
  console.log('\nTimeout error (failure):');
  console.log('  Query: "AI music production 2025"');
  console.log('  Meaning: Search did not complete; sources may exist');
  console.log('  Action: Use partial results, retry, note as incomplete coverage');
}

main().catch(console.error);
