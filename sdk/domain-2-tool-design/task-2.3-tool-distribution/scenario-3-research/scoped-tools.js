/**
 * Scenario 3 (Research System) — Scoped Tool Distribution
 *
 * Exam relevance: Task 2.3 (Tool distribution across multi-agent systems)
 *
 * This module defines the tool distribution for the 3-agent research system:
 *
 * 1. Search Agent: web_search only
 *    - Forced tool_choice on first turn (must search, not answer from memory)
 *    - Handles all information retrieval tasks
 *
 * 2. Analysis Agent: analyze_document only
 *    - Deep analysis of specific documents found by the search agent
 *    - Extracts structured findings with claims, evidence, and confidence
 *
 * 3. Synthesis Agent: verify_fact (cross-role tool)
 *    - Combines findings from search and analysis agents into a report
 *    - verify_fact is a lightweight cross-role tool for quick fact-checks
 *    - Complex verification routes back through the coordinator
 *
 * Tool count: 3 total, 1 per agent (in production: 4-5 per agent)
 * No tool duplication across agents
 */

import { researchToolDefinitions } from '../../../../shared/tools/research-tools.js';

// ─── Scoped Tool Sets ──────────────────────────────────────────────────────
// Filter the shared tool definitions to create scoped sets for each agent.

export const searchAgentTools = researchToolDefinitions.filter(
  (t) => t.name === 'web_search'
);

export const analysisAgentTools = researchToolDefinitions.filter(
  (t) => t.name === 'analyze_document'
);

export const synthesisAgentTools = researchToolDefinitions.filter(
  (t) => t.name === 'verify_fact'
);

// ─── Agent Configurations ──────────────────────────────────────────────────
// Complete configurations for each subagent, including system prompt,
// tool_choice strategy, and scoped tools.

export const searchAgentConfig = {
  name: 'search-agent',
  role: 'Information Retrieval',
  tools: searchAgentTools,

  // EXAM KEY: Forced tool_choice on first turn ensures the search agent
  // always searches rather than answering from training data.
  firstTurnToolChoice: { type: 'tool', name: 'web_search' },

  // Subsequent turns use auto — the agent may need another search or may
  // have enough results to return.
  subsequentToolChoice: { type: 'auto' },

  systemPrompt:
    'You are a web search research agent. Your ONLY job is to find relevant, ' +
    'credible sources on the assigned topic.\n\n' +
    '## Instructions\n' +
    '- Run targeted, specific searches (not broad generic queries)\n' +
    '- For broad topics, run multiple searches with different angles\n' +
    '- For each result, note: title, URL, key findings, publication date\n' +
    '- Return findings in structured JSON format\n\n' +
    '## Output Format\n' +
    'Return: { "topic": "...", "findings": [{ "claim": "...", "evidence": "...", ' +
    '"source_url": "...", "source_name": "...", "publication_date": "...", ' +
    '"confidence": "high|medium|low" }], "gaps": ["unfound topics"] }',

  // Validation: this agent should NEVER have analyze_document or verify_fact
  assertToolScope: () => {
    const toolNames = searchAgentTools.map((t) => t.name);
    if (toolNames.includes('analyze_document') || toolNames.includes('verify_fact')) {
      throw new Error(
        'Search agent should not have analyze_document or verify_fact tools'
      );
    }
    return true;
  },
};

export const analysisAgentConfig = {
  name: 'analysis-agent',
  role: 'Document Analysis',
  tools: analysisAgentTools,

  // Forced first turn — always analyze the assigned document
  firstTurnToolChoice: { type: 'tool', name: 'analyze_document' },
  subsequentToolChoice: { type: 'auto' },

  systemPrompt:
    'You are a document analysis agent. Your ONLY job is to analyze specific ' +
    'documents and extract structured findings.\n\n' +
    '## Instructions\n' +
    '- Analyze the document thoroughly, focusing on claims with evidence\n' +
    '- Rate each finding\'s confidence: high, medium, or low\n' +
    '- Note page references for attribution\n' +
    '- If focus_areas are specified, prioritize those topics\n\n' +
    '## Output Format\n' +
    'Return: { "documentId": "...", "findings": [{ "claim": "...", ' +
    '"evidence": "...", "confidence": "...", "page": N }] }',

  assertToolScope: () => {
    const toolNames = analysisAgentTools.map((t) => t.name);
    if (toolNames.includes('web_search') || toolNames.includes('verify_fact')) {
      throw new Error(
        'Analysis agent should not have web_search or verify_fact tools'
      );
    }
    return true;
  },
};

export const synthesisAgentConfig = {
  name: 'synthesis-agent',
  role: 'Report Synthesis',
  tools: synthesisAgentTools,

  // Auto tool_choice — synthesis may or may not need fact-checks
  firstTurnToolChoice: { type: 'auto' },
  subsequentToolChoice: { type: 'auto' },

  systemPrompt:
    'You are a research synthesis agent. Combine findings from search and ' +
    'analysis agents into a coherent, cited report.\n\n' +
    '## Instructions\n' +
    '- Preserve claim-source mappings: every claim must cite its source\n' +
    '- When sources conflict, present BOTH values with attribution\n' +
    '- Use verify_fact for quick fact-checks (dates, numbers, names)\n' +
    '- For complex verification, note "requires further investigation"\n' +
    '- Do NOT use verify_fact as a substitute for web_search\n\n' +
    '## verify_fact Usage\n' +
    'This is a LIGHTWEIGHT cross-role tool. Use it for:\n' +
    '- Confirming specific statistics mentioned in findings\n' +
    '- Checking dates and names\n' +
    '- Simple yes/no factual claims\n' +
    'Do NOT use it for: broad research questions, finding new sources, ' +
    'or complex multi-step verification.\n\n' +
    '## Report Structure\n' +
    '1. Executive Summary\n' +
    '2. Key Findings (with citations)\n' +
    '3. Conflicting Data (with source attribution)\n' +
    '4. Coverage Gaps\n' +
    '5. Sources',

  assertToolScope: () => {
    const toolNames = synthesisAgentTools.map((t) => t.name);
    if (toolNames.includes('web_search') || toolNames.includes('analyze_document')) {
      throw new Error(
        'Synthesis agent should not have web_search or analyze_document tools'
      );
    }
    return true;
  },
};

// ─── Tool Distribution Summary ─────────────────────────────────────────────

export function printToolDistribution() {
  console.log('Tool Distribution for Scenario 3 (Research System)');
  console.log('─'.repeat(55));

  const configs = [searchAgentConfig, analysisAgentConfig, synthesisAgentConfig];

  for (const config of configs) {
    const toolNames = config.tools.map((t) => t.name);
    const firstChoice =
      config.firstTurnToolChoice.type === 'tool'
        ? `forced → ${config.firstTurnToolChoice.name}`
        : 'auto';

    console.log(`\n  ${config.name} (${config.role})`);
    console.log(`    Tools: [${toolNames.join(', ')}]`);
    console.log(`    First turn: ${firstChoice}`);

    // Run scope assertion
    try {
      config.assertToolScope();
      console.log('    Scope check: PASSED');
    } catch (e) {
      console.log(`    Scope check: FAILED — ${e.message}`);
    }
  }

  // Cross-role tool explanation
  console.log('\n  Cross-role tool: verify_fact → synthesis-agent');
  console.log('    Purpose: eliminate coordinator round-trips for simple fact-checks');
  console.log('    Constraint: lightweight only; complex verification → coordinator');

  // Total tool count
  const totalUnique = new Set(
    configs.flatMap((c) => c.tools.map((t) => t.name))
  ).size;
  console.log(`\n  Total unique tools: ${totalUnique}`);
  console.log(`  Max tools per agent: ${Math.max(...configs.map((c) => c.tools.length))}`);
}

// Run if executed directly
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;
if (isDirectExecution) {
  printToolDistribution();
}
