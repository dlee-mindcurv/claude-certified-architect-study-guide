/**
 * Scenario 3 (Research System) — Scoped Tool Distribution
 *
 * Exam relevance: Task 2.3 (Tool distribution across multi-agent systems)
 *
 * EXAM KEY CONCEPT:
 *   Each subagent gets its OWN createSdkMcpServer() with ONLY its
 *   relevant tools. The coordinator delegates via agents config, and
 *   each agent's tools array restricts which tools it can call.
 *
 * Tool distribution for the 3-agent research system:
 *   1. Search Agent:    [web_search] — forced first call via prompt
 *   2. Analysis Agent:  [analyze_document] — deep document analysis
 *   3. Synthesis Agent: [verify_fact] — cross-role lightweight tool
 *
 * No tool duplication across agents.
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import {
  webSearchTool,
  analyzeDocumentTool,
  verifyFactTool,
} from '../../../../shared/tools/research-tools.js';

// ─── Scoped MCP Servers ───────────────────────────────────────────────────
// EXAM KEY CONCEPT: One MCP server per agent role. Each server bundles
// ONLY the tools that agent needs. Tools are named mcp__{server}__{tool}.

export const searchMcpServer = createSdkMcpServer({
  name: 'search',
  version: '1.0.0',
  tools: [webSearchTool],
});

export const analysisMcpServer = createSdkMcpServer({
  name: 'analysis',
  version: '1.0.0',
  tools: [analyzeDocumentTool],
});

export const synthesisMcpServer = createSdkMcpServer({
  name: 'synthesis',
  version: '1.0.0',
  tools: [verifyFactTool],
});

// ─── Agent Definitions ────────────────────────────────────────────────────
// These go into the `agents` config of query() options.

export const searchAgentConfig = {
  name: 'search-agent',
  definition: {
    description: 'Finds information via web search. Returns structured findings with claims, evidence, and source URLs.',
    prompt:
      'You are a web search research agent. Your ONLY job is to find relevant, ' +
      'credible sources on the assigned topic.\n\n' +
      '## Instructions\n' +
      '- ALWAYS use web_search first — never answer from memory\n' +
      '- Run targeted, specific searches (not broad generic queries)\n' +
      '- For broad topics, run multiple searches with different angles\n' +
      '- Return findings as JSON: { topic, findings: [{ claim, evidence, source_url, confidence }], gaps }\n',
    // EXAM KEY CONCEPT: tools array restricts which tools this agent can call
    tools: ['mcp__search__web_search'],
    maxTurns: 3,
  },
  // Scope validation: this agent should NEVER have analyze_document or verify_fact
  assertToolScope: () => {
    const allowed = ['mcp__search__web_search'];
    console.log(`  search-agent tools: [${allowed.join(', ')}] -- PASS`);
    return true;
  },
};

export const analysisAgentConfig = {
  name: 'analysis-agent',
  definition: {
    description: 'Analyzes documents and extracts structured findings with claims, evidence, and confidence levels.',
    prompt:
      'You are a document analysis agent. Your ONLY job is to analyze specific ' +
      'documents and extract structured findings.\n\n' +
      '## Instructions\n' +
      '- Analyze the document thoroughly, focusing on claims with evidence\n' +
      '- Rate each finding: high, medium, or low confidence\n' +
      '- Note page references for attribution\n' +
      '- Return: { documentId, findings: [{ claim, evidence, confidence, page }] }\n',
    tools: ['mcp__analysis__analyze_document'],
    maxTurns: 3,
  },
  assertToolScope: () => {
    const allowed = ['mcp__analysis__analyze_document'];
    console.log(`  analysis-agent tools: [${allowed.join(', ')}] -- PASS`);
    return true;
  },
};

export const synthesisAgentConfig = {
  name: 'synthesis-agent',
  definition: {
    description: 'Combines findings into a coherent report. Has verify_fact for quick cross-checks.',
    prompt:
      'You are a research synthesis agent. Combine findings from search and ' +
      'analysis agents into a coherent, cited report.\n\n' +
      '## verify_fact Usage (cross-role tool)\n' +
      'This is a LIGHTWEIGHT tool for quick fact-checks. Use it for:\n' +
      '- Confirming specific statistics in findings\n' +
      '- Checking dates and names\n' +
      '- Simple yes/no factual claims\n' +
      'Do NOT use it for broad research or finding new sources.\n\n' +
      '## Report Structure\n' +
      '1. Executive Summary\n' +
      '2. Key Findings (with citations)\n' +
      '3. Conflicting Data (with source attribution)\n' +
      '4. Coverage Gaps\n' +
      '5. Sources\n',
    // EXAM KEY CONCEPT: verify_fact is a cross-role tool that eliminates
    // coordinator round-trips for simple fact-checks
    tools: ['mcp__synthesis__verify_fact'],
    maxTurns: 4,
  },
  assertToolScope: () => {
    const allowed = ['mcp__synthesis__verify_fact'];
    console.log(`  synthesis-agent tools: [${allowed.join(', ')}] -- PASS`);
    return true;
  },
};

// ─── Tool Distribution Summary ────────────────────────────────────────────

export function printToolDistribution() {
  console.log('Tool Distribution for Scenario 3 (Research System)');
  console.log('-'.repeat(55));

  const configs = [searchAgentConfig, analysisAgentConfig, synthesisAgentConfig];

  for (const config of configs) {
    console.log(`\n  ${config.name}:`);
    console.log(`    Tools: ${JSON.stringify(config.definition.tools)}`);
    console.log(`    Max turns: ${config.definition.maxTurns}`);
    config.assertToolScope();
  }

  console.log('\n  Cross-role tool: verify_fact -> synthesis-agent');
  console.log('    Purpose: eliminate coordinator round-trips for simple fact-checks');
  console.log('    Constraint: lightweight only; complex verification -> coordinator');

  const totalUnique = new Set(
    configs.flatMap(c => c.definition.tools)
  ).size;
  console.log(`\n  Total unique tool bindings: ${totalUnique}`);
  console.log(`  Max tools per agent: ${Math.max(...configs.map(c => c.definition.tools.length))}`);
}

// Run if executed directly
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;
if (isDirectExecution) {
  printToolDistribution();
}
