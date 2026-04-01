/**
 * Exercise 4 — SOLUTION: Design and Debug a Multi-Agent Research Pipeline
 *
 * Domains: D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)
 *
 * Complete working implementation of the multi-agent research pipeline.
 * Run with: node exercises/exercise-4-research-pipeline/solution.js
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

async function runCoordinator(topic) {
  console.log(`\nResearch Topic: ${topic}`);
  console.log('='.repeat(60));

  // Step 1a: Decompose the topic into subtopics using the coordinator
  const subtopics = await decomposeTopicWithModel(topic);

  console.log(`\nSubtopics identified: ${subtopics.length}`);
  subtopics.forEach((st, i) => console.log(`  ${i + 1}. ${st}`));

  // Step 1b: Run parallel web searches (Step 2)
  const { results: searchResults, errors: searchErrors } = await runParallelSearches(subtopics);

  // Step 1c: Analyze available documents
  const documentIds = ['doc-001', 'doc-002']; // Known documents in mock data
  const analysisResults = await runDocumentAnalysis(documentIds);

  // Step 1d: Combine all findings and synthesize
  const allFindings = [...searchResults, ...analysisResults];

  console.log(`\nTotal findings collected: ${allFindings.length}`);
  console.log(`Search errors: ${searchErrors.length}`);

  // Step 1e: Synthesize into final report
  const report = await runSynthesis(topic, allFindings, searchErrors);

  return report;
}

/**
 * Use the model to decompose a research topic into subtopics.
 */
async function decomposeTopicWithModel(topic) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      'You are a research planner. Decompose the given topic into 2-3 specific, ' +
      'non-overlapping subtopics for parallel research. Return ONLY a JSON array ' +
      'of strings. Example: ["subtopic 1", "subtopic 2", "subtopic 3"]',
    messages: [{ role: 'user', content: `Decompose this research topic: ${topic}` }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text || '[]';

  // Extract JSON array from the response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Fallback to manual decomposition
    }
  }

  // Fallback if model response is not parseable
  return [`${topic} — overview and trends`, `${topic} — market data and statistics`];
}

// ─── Step 2: Parallel Subagent Execution ────────────────────────────────────

async function runParallelSearches(subtopics) {
  console.log('\nPhase 1: Parallel Web Searches');
  console.log('-'.repeat(40));

  // Use Promise.allSettled for fault tolerance — if one search fails,
  // others still complete
  const searchPromises = subtopics.map((subtopic) => runSearchSubagent(subtopic));
  const settledResults = await Promise.allSettled(searchPromises);

  const results = [];
  const errors = [];

  settledResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      results.push(...(result.value.findings || []));
      if (result.value.gaps?.length > 0) {
        console.log(`  Gaps for "${subtopics[i]}": ${result.value.gaps.join(', ')}`);
      }
    } else {
      const errorContext = handleSubagentError('search', result.reason, {
        action: `web_search for "${subtopics[i]}"`,
        partialResults: [],
      });
      errors.push(errorContext);
      console.log(`  FAILED: ${subtopics[i]} — ${result.reason.message}`);
    }
  });

  console.log(`  Search phase complete: ${results.length} findings, ${errors.length} errors`);
  return { results, errors };
}

async function runSearchSubagent(subtopic) {
  console.log(`  Searching: ${subtopic}`);

  // Tool scoping: the search subagent only gets web_search
  const searchTool = researchToolDefinitions.filter((t) => t.name === 'web_search');

  const messages = [
    {
      role: 'user',
      content:
        `Research the following subtopic and return structured findings. ` +
        `Run targeted searches and collect results.\n\nSubtopic: ${subtopic}`,
    },
  ];

  // Agentic loop for the search subagent
  let iterations = 0;
  const collectedFindings = [];

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: searchSubagentPrompt,
      tools: searchTool,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      // Agent is done — extract any final text findings
      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock) {
        // Try to parse structured findings from the response
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.findings) {
              collectedFindings.push(...parsed.findings);
            }
          } catch {
            // Not parseable JSON, that's fine
          }
        }
      }
      break;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content.filter((b) => b.type === 'tool_use')) {
        console.log(`    web_search("${block.input.query}")`);
        const result = executeResearchTool(block.name, block.input);

        if (!result.isError) {
          const data = JSON.parse(result.content);
          // Collect findings with provenance from search results
          for (const searchResult of data.results || []) {
            collectedFindings.push({
              claim: searchResult.snippet,
              evidence: searchResult.title,
              source_url: searchResult.url,
              source_name: searchResult.source,
              publication_date: searchResult.publishedDate,
              confidence: 'medium',
            });
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError || false,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  return {
    topic: subtopic,
    findings: collectedFindings,
    gaps: collectedFindings.length === 0 ? [`No results found for "${subtopic}"`] : [],
  };
}

// ─── Step 3: Structured Output with Provenance ─────────────────────────────

async function runDocumentAnalysis(documentIds) {
  console.log('\nPhase 2: Document Analysis');
  console.log('-'.repeat(40));

  const analysisFindings = [];

  for (const docId of documentIds) {
    console.log(`  Analyzing: ${docId}`);

    const result = executeResearchTool('analyze_document', { document_id: docId });

    if (result.isError) {
      const errorData = JSON.parse(result.content);
      console.log(`    ERROR: ${errorData.message}`);
      continue;
    }

    const data = JSON.parse(result.content);

    // Format each finding with full provenance metadata (Step 3)
    for (const finding of data.findings || []) {
      analysisFindings.push({
        claim: finding.claim,
        evidence: finding.evidence,
        source_url: finding.sourceUrl,
        source_name: data.title,
        source_author: data.author,
        publication_date: data.publishedDate,
        source_page: finding.page,
        confidence: finding.confidence,
        // Provenance: exactly where this claim came from
        provenance: {
          documentId: data.documentId,
          documentTitle: data.title,
          author: data.author,
          page: finding.page,
          url: finding.sourceUrl,
          retrievedAt: new Date().toISOString(),
        },
      });
    }

    console.log(`    Found ${data.findings?.length || 0} findings`);
  }

  return analysisFindings;
}

async function runSynthesis(topic, allFindings, searchErrors) {
  console.log('\nPhase 3: Synthesis');
  console.log('-'.repeat(40));

  // Detect conflicts before synthesis
  const conflicts = detectConflicts(allFindings);
  if (conflicts.length > 0) {
    console.log(`  Detected ${conflicts.length} conflicting claims`);
  }

  // Tool scoping: synthesis agent only gets verify_fact
  const verifyTool = researchToolDefinitions.filter((t) => t.name === 'verify_fact');

  // Key context passing: ALL findings must be serialized into the prompt
  // The synthesis agent has NO access to previous conversations
  const findingsJson = JSON.stringify(allFindings, null, 2);
  const conflictsJson = JSON.stringify(conflicts, null, 2);
  const errorsJson = JSON.stringify(searchErrors, null, 2);

  const messages = [
    {
      role: 'user',
      content:
        `Synthesize these research findings into a comprehensive report on: "${topic}"\n\n` +
        `## Collected Findings\n${findingsJson}\n\n` +
        `## Detected Conflicts\n${conflictsJson}\n\n` +
        `## Search Errors / Coverage Gaps\n${errorsJson}\n\n` +
        `Instructions:\n` +
        `- Present both values when sources conflict — do NOT pick one arbitrarily\n` +
        `- Note temporal differences (different publication dates) that may explain discrepancies\n` +
        `- List coverage gaps from failed searches\n` +
        `- Use verify_fact for any quick fact-checks needed\n` +
        `- Return a structured report with: summary, key findings, conflicts, gaps, sources`,
    },
  ];

  // Run the synthesis subagent with its own agentic loop
  let iterations = 0;
  let reportText = '';

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: synthesisSubagentPrompt,
      tools: verifyTool,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      reportText = textBlock?.text || '';
      break;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content.filter((b) => b.type === 'tool_use')) {
        console.log(`    verify_fact("${block.input.claim?.substring(0, 60)}...")`);
        const result = executeResearchTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError || false,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  return {
    topic,
    report: reportText,
    structuredData: {
      totalFindings: allFindings.length,
      conflicts,
      coverageGaps: searchErrors.map((e) => e.attemptedAction),
      sources: [
        ...new Set(allFindings.map((f) => f.source_name).filter(Boolean)),
      ],
    },
  };
}

// ─── Conflict Detection ─────────────────────────────────────────────────────

/**
 * Detect conflicting claims across findings from different sources.
 */
function detectConflicts(findings) {
  const conflicts = [];

  // Group findings by claim similarity (simplified: look for overlapping keywords)
  // In production, you'd use semantic similarity or entity extraction
  const claimGroups = new Map();

  for (const finding of findings) {
    // Extract key numbers/percentages from claims
    const numbers = finding.claim.match(/\d+\.?\d*%/g) || [];
    const keywords = finding.claim
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Create a rough topic key from the main keywords
    const topicKey = keywords.slice(0, 5).sort().join('-');

    if (!claimGroups.has(topicKey)) {
      claimGroups.set(topicKey, []);
    }
    claimGroups.get(topicKey).push({ ...finding, extractedNumbers: numbers });
  }

  // Check each group for conflicting numbers
  for (const [topicKey, group] of claimGroups) {
    if (group.length < 2) continue;

    // Check if different sources report different numbers for similar claims
    const numberSets = group.map((f) => f.extractedNumbers).filter((n) => n.length > 0);

    if (numberSets.length >= 2) {
      const allNumbers = new Set(numberSets.flat());
      if (allNumbers.size > numberSets.length) {
        // Different numbers detected — potential conflict
        conflicts.push({
          topic: topicKey,
          claims: group.map((f) => ({
            claim: f.claim,
            source: f.source_name,
            date: f.publication_date,
            numbers: f.extractedNumbers,
          })),
          note: 'Different sources report different values. Review methodological differences.',
        });
      }
    }
  }

  return conflicts;
}

// ─── Step 4: Error Propagation ──────────────────────────────────────────────

function handleSubagentError(agentType, error, context) {
  // Classify the error type
  let failureType = 'unknown';
  let isRetryable = false;
  const alternatives = [];

  if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
    failureType = 'search_timeout';
    isRetryable = true;
    alternatives.push('Retry with the same query', 'Try a more specific query');
  } else if (error.message?.includes('No results') || error.message?.includes('empty')) {
    failureType = 'search_empty';
    isRetryable = false;
    alternatives.push(
      'Try alternative query phrasing',
      'Search different source types',
      'Broaden the search scope'
    );
  } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
    failureType = 'rate_limited';
    isRetryable = true;
    alternatives.push('Wait and retry', 'Reduce parallel request count');
  } else if (error.message?.includes('auth') || error.message?.includes('401')) {
    failureType = 'auth_failure';
    isRetryable = false;
    alternatives.push('Check API credentials', 'Verify API key has correct permissions');
  } else {
    failureType = `${agentType}_failed`;
    isRetryable = false;
    alternatives.push('Review error details and retry manually');
  }

  return {
    failureType,
    agentType,
    attemptedAction: context.action || 'unknown',
    partialResults: context.partialResults || [],
    alternatives,
    isRetryable,
    errorMessage: error.message,
    timestamp: new Date().toISOString(),
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
  console.log('Exercise 4 — SOLUTION: Multi-Agent Research Pipeline\n');

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

    if (report.report) {
      console.log('\n--- Report Text ---');
      console.log(report.report);
    }

    console.log('\n--- Structured Metadata ---');
    console.log(JSON.stringify(report.structuredData, null, 2));
  } catch (error) {
    console.error('Pipeline error:', error.message);
    if (error.status === 401) {
      console.error('Check your ANTHROPIC_API_KEY in .env');
    }
  }
}

main();
