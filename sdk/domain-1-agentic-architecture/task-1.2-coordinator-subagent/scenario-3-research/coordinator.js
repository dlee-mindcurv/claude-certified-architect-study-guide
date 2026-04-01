/**
 * Scenario 3: Full Research Coordinator via Agent SDK
 *
 * Exam relevance (Task 1.2):
 * - Production-grade coordinator with search, analysis, and synthesis subagents
 * - Demonstrates ALL coordinator responsibilities:
 *   1. Query decomposition covering ALL relevant domains
 *   2. Dynamic routing (not every query needs every subagent)
 *   3. Parallel subagent execution (SDK handles concurrency)
 *   4. Explicit context passing (subagents get context via prompt only)
 *   5. Scoped tool distribution per subagent
 *
 * EXAM KEY CONCEPT:
 *   The coordinator is the hub in hub-and-spoke. Subagents NEVER communicate
 *   directly -- all information flows through the coordinator. Each subagent
 *   has isolated context and restricted tools via the agents config.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../../../shared/tools/research-tools.js';
import {
  researchCoordinatorPrompt,
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../../../shared/prompts/research-coordinator.js';

// ─── Research Coordinator ───────────────────────────────────────────────────

export async function runResearchCoordinator(userQuery) {
  console.log('\n' + '='.repeat(70));
  console.log('  RESEARCH COORDINATOR -- Scenario 3 (Agent SDK)');
  console.log('='.repeat(70));
  console.log(`\nQuery: ${userQuery}\n`);

  const startTime = Date.now();
  let finalText = '';

  for await (const message of query({
    prompt: userQuery,
    options: {
      systemPrompt: researchCoordinatorPrompt,

      mcpServers: {
        research: researchServer,
      },

      // EXAM KEY CONCEPT: Each subagent has scoped tools.
      // - search-agent: ONLY web_search (cannot analyze docs or verify facts)
      // - analysis-agent: ONLY analyze_document
      // - synthesis-agent: ONLY verify_fact (scoped cross-role tool)
      agents: {
        'search-agent': {
          description: 'Searches the web for information on a specific subtopic. Assign distinct subtopics to avoid duplication.',
          prompt: searchSubagentPrompt,
          tools: ['mcp__research__web_search'],
          model: 'sonnet',
          maxTurns: 10,
        },
        'analysis-agent': {
          description: 'Analyzes a specific document by ID and extracts structured findings with evidence and confidence levels.',
          prompt: `You are a document analysis specialist. Use analyze_document to examine assigned documents. Extract all key findings with claim, evidence, confidence level, and page reference. Return findings as structured data.`,
          tools: ['mcp__research__analyze_document'],
          model: 'sonnet',
          maxTurns: 10,
        },
        'synthesis-agent': {
          description: 'Combines findings from search and analysis into a coherent, cited report. Has verify_fact for lightweight fact-checking.',
          prompt: synthesisSubagentPrompt,
          tools: ['mcp__research__verify_fact'],
          model: 'sonnet',
          maxTurns: 10,
        },
      },

      allowedTools: [
        'mcp__research__web_search',
        'mcp__research__analyze_document',
        'mcp__research__verify_fact',
      ],

      maxTurns: 30,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  FINAL REPORT (completed in ${elapsed}s)`);
  console.log('='.repeat(70));
  console.log(finalText);

  return { report: finalText, elapsed };
}

// ─── Run ────────────────────────────────────────────────────────────────────

runResearchCoordinator(
  "Research the impact of AI on creative industries in 2025. " +
  "Cover visual arts, music, and film production. " +
  "Include data from doc-001 if available."
).catch(console.error);
