/**
 * Exercise 4 — STARTER: Design and Debug a Multi-Agent Research Pipeline
 *
 * Domains: D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)
 *
 * Complete the TODOs below to build a working multi-agent research pipeline.
 * Run with: npm run exercise:4
 */

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { researchToolDefinitions, executeResearchTool } from '../../shared/tools/research-tools.js';
import {
  researchCoordinatorPrompt,
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../shared/prompts/research-coordinator.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_ITERATIONS = 10;

// ─── Step 1: Coordinator Agent ──────────────────────────────────────────────

/**
 * The coordinator orchestrates the research pipeline:
 * 1. Decomposes the topic into subtopics
 * 2. Delegates to search subagents (in parallel)
 * 3. Passes results to document analysis subagent
 * 4. Passes all findings to synthesis subagent
 * 5. Returns the final report
 *
 * @param {string} topic - The research topic
 * @returns {Promise<Object>} - Final research report
 */
async function runCoordinator(topic) {
  console.log(`\nResearch Topic: ${topic}`);
  console.log('='.repeat(60));

  // TODO 1a: Decompose the topic into subtopics.
  //
  // Call the Claude API with the coordinator prompt and ask it to decompose
  // the topic into 2-3 specific subtopics for parallel research.
  //
  // For this exercise, you can hardcode the subtopics:
  const subtopics = [
    // TODO: Decompose the topic. For example:
    // 'AI impact on visual arts and digital art creation',
    // 'AI in music production and composition',
    // 'AI in film production and VFX',
  ];

  console.log(`\nSubtopics identified: ${subtopics.length}`);
  subtopics.forEach((st, i) => console.log(`  ${i + 1}. ${st}`));

  // TODO 1b: Delegate to search subagents (Step 2 — parallel execution)
  //
  // const searchResults = await runParallelSearches(subtopics);
  const searchResults = [];

  // TODO 1c: Delegate to document analysis subagent
  //
  // const analysisResults = await runDocumentAnalysis(['doc-001', 'doc-002']);
  const analysisResults = [];

  // TODO 1d: Combine all findings and pass to synthesis subagent
  //
  // const allFindings = [...searchResults, ...analysisResults];
  // const report = await runSynthesis(topic, allFindings);
  const report = { summary: 'TODO: Implement coordinator' };

  return report;
}

// ─── Step 2: Parallel Subagent Execution ────────────────────────────────────

/**
 * Run search subagents in parallel, one per subtopic.
 *
 * @param {string[]} subtopics - Array of subtopics to research
 * @returns {Promise<Object[]>} - Array of search findings
 */
async function runParallelSearches(subtopics) {
  console.log('\nPhase 1: Parallel Web Searches');
  console.log('-'.repeat(40));

  // TODO 2: Implement parallel search execution.
  //
  // Use Promise.all() to run all searches concurrently:
  //
  // const searchPromises = subtopics.map(subtopic => runSearchSubagent(subtopic));
  // const results = await Promise.all(searchPromises);
  //
  // Each search subagent gets:
  //   - Its own system prompt (searchSubagentPrompt)
  //   - Only the web_search tool (tool scoping — not all research tools)
  //   - The specific subtopic as context
  //
  // Handle errors: if one search fails, others should still complete
  // Use Promise.allSettled() instead of Promise.all() for fault tolerance:
  //
  // const settledResults = await Promise.allSettled(searchPromises);
  // const successfulResults = settledResults
  //   .filter(r => r.status === 'fulfilled')
  //   .map(r => r.value);
  // const failedSearches = settledResults
  //   .filter(r => r.status === 'rejected')
  //   .map((r, i) => ({ subtopic: subtopics[i], error: r.reason }));

  return [];
}

/**
 * Run a single search subagent for a specific subtopic.
 *
 * @param {string} subtopic - The subtopic to research
 * @returns {Promise<Object>} - Search findings for this subtopic
 */
async function runSearchSubagent(subtopic) {
  console.log(`  Searching: ${subtopic}`);

  // TODO 2b: Implement the search subagent.
  //
  // This is an agentic loop (like Exercise 1) but with:
  //   - System prompt: searchSubagentPrompt
  //   - Tools: only web_search (filtered from researchToolDefinitions)
  //   - User message: the subtopic to research
  //
  // The subagent should:
  //   1. Run web_search with targeted queries
  //   2. Collect results
  //   3. Return structured findings
  //
  // Important context passing concept:
  //   The subagent does NOT have access to the coordinator's conversation.
  //   Everything it needs must be in its system prompt and user message.

  const searchTool = researchToolDefinitions.filter((t) => t.name === 'web_search');
  const messages = [
    {
      role: 'user',
      content: `Research the following subtopic and return structured findings:\n\n${subtopic}`,
    },
  ];

  // TODO: Implement the agentic loop for the search subagent
  // (Similar to Exercise 1's runAgentLoop but with search-specific tools)

  return {
    topic: subtopic,
    findings: [],
    gaps: [`TODO: implement search for "${subtopic}"`],
  };
}

// ─── Step 3: Structured Output with Provenance ─────────────────────────────

/**
 * Run document analysis subagent on specific documents.
 *
 * @param {string[]} documentIds - Documents to analyze
 * @returns {Promise<Object[]>} - Analysis findings with provenance
 */
async function runDocumentAnalysis(documentIds) {
  console.log('\nPhase 2: Document Analysis');
  console.log('-'.repeat(40));

  // TODO 3: Implement document analysis with provenance tracking.
  //
  // For each document:
  //   1. Call analyze_document tool
  //   2. Each finding returned should include:
  //      - claim: the specific finding
  //      - evidence: supporting detail
  //      - source: { documentId, title, author, date, page, url }
  //      - confidence: high/medium/low
  //
  // The source metadata enables downstream conflict detection
  // when the same claim appears with different values from different sources.

  const analysisFindings = [];

  for (const docId of documentIds) {
    console.log(`  Analyzing: ${docId}`);

    // TODO: Call analyze_document tool and format results with provenance
    // const result = executeResearchTool('analyze_document', { document_id: docId });
    // Parse and format each finding with full source attribution
  }

  return analysisFindings;
}

/**
 * Run synthesis subagent to combine all findings into a report.
 *
 * @param {string} topic - Original research topic
 * @param {Object[]} allFindings - Combined findings from all subagents
 * @returns {Promise<Object>} - Final synthesized report
 */
async function runSynthesis(topic, allFindings) {
  console.log('\nPhase 3: Synthesis');
  console.log('-'.repeat(40));

  // TODO 3b: Implement synthesis with conflict detection.
  //
  // The synthesis subagent receives:
  //   - System prompt: synthesisSubagentPrompt
  //   - Tools: only verify_fact (scoped cross-role tool)
  //   - User message containing ALL findings serialized as JSON
  //
  // Key context passing: The synthesis agent has NO access to previous
  // conversations. All findings must be explicitly included in its prompt.
  //
  // The synthesis should:
  //   1. Group findings by topic
  //   2. Identify conflicts (e.g., different growth percentages from different sources)
  //   3. Present both values with source attribution — NEVER arbitrarily pick one
  //   4. Note coverage gaps
  //   5. Return a structured report

  return {
    topic,
    summary: 'TODO: Implement synthesis',
    findings: allFindings,
    conflicts: [],
    gaps: [],
  };
}

// ─── Step 4: Error Propagation ──────────────────────────────────────────────

/**
 * Handle a subagent error with structured context.
 *
 * @param {string} agentType - Type of subagent that failed
 * @param {Error} error - The error that occurred
 * @param {Object} context - Additional context about the failure
 * @returns {Object} - Structured error context for the coordinator
 */
function handleSubagentError(agentType, error, context) {
  // TODO 4: Implement structured error propagation.
  //
  // Return a structured error object that the coordinator can use to:
  //   - Decide whether to retry
  //   - Try alternative approaches
  //   - Annotate the final report with coverage gaps
  //
  // Structure:
  // {
  //   failureType: 'search_timeout' | 'search_empty' | 'analysis_failed' | 'synthesis_failed',
  //   agentType: agentType,
  //   attemptedAction: context.action || 'unknown',
  //   partialResults: context.partialResults || [],
  //   alternatives: [...],  // suggested alternative approaches
  //   isRetryable: true/false,
  //   errorMessage: error.message
  // }

  return {
    failureType: 'unknown',
    agentType,
    attemptedAction: context.action || 'unknown',
    partialResults: [],
    alternatives: [],
    isRetryable: false,
    errorMessage: error.message,
  };
}

// ─── Step 5: Test Scenarios ─────────────────────────────────────────────────

const testTopics = [
  // Topic A: Has mock data available, including conflicting statistics
  'Impact of AI on creative industries in 2025',

  // Topic B: Has some mock data
  'Renewable energy trends and investment in 2025',

  // Topic C: No mock data — tests empty result handling
  'Quantum computing applications in drug discovery',
];

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Exercise 4: Multi-Agent Research Pipeline');
  console.log('Complete the TODOs in this file, then run again.\n');

  const topicIndex = parseInt(process.argv[2] || '0', 10);
  const topic = testTopics[topicIndex];

  if (!topic) {
    console.log(`Invalid topic index. Choose 0-${testTopics.length - 1}`);
    testTopics.forEach((t, i) => console.log(`  ${i}: ${t}`));
    return;
  }

  try {
    const report = await runCoordinator(topic);
    console.log('\n' + '='.repeat(60));
    console.log('FINAL REPORT:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('Pipeline error:', error.message);
  }
}

main();
