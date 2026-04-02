/**
 * Scenario 3: Research System -- Subagent Configurations for Agent SDK
 *
 * Exam relevance (Task 1.3):
 * - Reusable agent definitions for the `agents` config in query()
 * - Demonstrates tool scoping, model selection, and capability metadata
 * - Shows how to configure subagents for reuse across different coordinators
 *
 * EXAM KEY CONCEPT:
 *   These definitions are imported by coordinators and passed to
 *   query()'s options.agents. Each definition restricts which tools
 *   the subagent can access, enforcing scope partitioning.
 */

import {
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../../../shared/prompts/research-coordinator.js';

// ─── Subagent Definitions ───────────────────────────────────────────────────
//
// These objects match the AgentDefinition shape expected by options.agents.
// Each is designed to be imported and spread into a coordinator's config.

/**
 * Web Search Subagent
 *
 * EXAM CONCEPT: Minimal tool set -- only web_search
 *
 * This agent:
 * - Runs targeted web searches on assigned subtopics
 * - Returns structured findings with source attribution
 * - Reports gaps when searches return no results
 *
 * It CANNOT:
 * - Analyze documents (analysis-agent's job)
 * - Verify facts (synthesis-agent's scoped tool)
 * - Communicate with other subagents (only the coordinator routes)
 */
export const webSearchAgentDef = {
  description: 'Searches the web for information on a specific subtopic. Assign distinct subtopics to avoid duplication.',
  prompt: searchSubagentPrompt,

  // EXAM CONCEPT: Tool restriction enforced by the SDK
  tools: ['mcp__research__web_search'],

  // EXAM CONCEPT: Model selection per subagent
  // Search agents do simple work -- a faster model could be used in production
  model: 'sonnet',
  maxTurns: 10,
};

/**
 * Document Analysis Subagent
 *
 * EXAM CONCEPT: Specialized tool access for a specific role
 */
export const documentAnalysisAgentDef = {
  description: 'Analyzes a specific document by ID and extracts structured findings with evidence and confidence levels.',
  prompt: `You are a document analysis specialist. Your task is to analyze assigned documents and extract structured, cited findings.

## Process
1. Use analyze_document to examine each assigned document
2. For each finding, capture:
   - The specific claim or statistic
   - Supporting evidence from the document
   - Confidence level (high/medium/low)
   - Page reference for traceability
3. Identify topics the document does NOT cover (gaps)

## Output Format
Return structured JSON with documentId, title, findings array, and gaps array.

## Important
- Do NOT fabricate findings. Only report what the document actually contains.
- Preserve the original wording of claims as closely as possible.`,

  tools: ['mcp__research__analyze_document'],
  model: 'sonnet',
  maxTurns: 10,
};

/**
 * Synthesis Subagent
 *
 * EXAM CONCEPT: Scoped cross-role tool
 * verify_fact is a lightweight tool that lets the synthesis agent do
 * simple fact-checks without needing full web_search access.
 */
export const synthesisAgentDef = {
  description: 'Combines findings from search and analysis into a coherent, cited report. Has verify_fact for quick fact-checks.',
  prompt: synthesisSubagentPrompt,

  // EXAM CONCEPT: Scoped cross-role tool
  // verify_fact is tangential to synthesis, but the agent needs lightweight
  // access. Full web_search would be overkill and scope creep.
  tools: ['mcp__research__verify_fact'],
  model: 'sonnet',
  maxTurns: 10,
};

// ─── Subagent Registry ──────────────────────────────────────────────────────
//
// EXAM CONCEPT: The coordinator looks up subagent definitions from a registry.
// This makes the system extensible -- adding a new subagent type is a single
// addition to this object.

export const subagentRegistry = {
  'search-agent': webSearchAgentDef,
  'analysis-agent': documentAnalysisAgentDef,
  'synthesis-agent': synthesisAgentDef,
};

/**
 * Build the agents config for query() from the registry.
 * Useful when a coordinator wants all available subagents.
 *
 * @returns {Record<string, AgentDefinition>} agents config for query()
 */
export function buildAgentsConfig() {
  return { ...subagentRegistry };
}

// ─── Context Template Builders ──────────────────────────────────────────────
//
// EXAM CONCEPT: Explicit context passing
// These functions help coordinators build the task descriptions that
// carry context from one phase to the next.

/**
 * Build a task description for a search subagent.
 *
 * @param {string} subtopic - What to research
 * @param {string[]} [avoidDuplicating] - Topics already covered by other agents
 * @returns {string} Complete task description
 */
export function buildSearchTaskDescription(subtopic, avoidDuplicating = []) {
  let description = `Research this specific subtopic: "${subtopic}"

Search for recent, credible sources (2024-2025 preferred). For each finding:
- State the specific claim or statistic
- Include the source URL and publication date
- Rate confidence: high, medium, or low

Return your findings as structured JSON.
Focus EXCLUSIVELY on "${subtopic}".`;

  if (avoidDuplicating.length > 0) {
    description += `\n\nThe following topics are already being researched by other agents. Do NOT duplicate their work:\n${avoidDuplicating.map(t => `- ${t}`).join('\n')}`;
  }

  return description;
}

/**
 * Build a task description for the synthesis subagent.
 *
 * @param {string} originalQuery - The user's original research query
 * @param {Object[]} findings - Array of { subtopic, source, result } objects
 * @returns {string} Complete task description with full context
 */
export function buildSynthesisTaskDescription(originalQuery, findings) {
  const findingsText = findings
    .map(f => `### ${f.subtopic} (from ${f.source})\n${f.result}`)
    .join('\n\n');

  return `Synthesize the following research findings into a comprehensive report.

## Original Query
${originalQuery}

## Collected Findings
${findingsText}

## Requirements
- Cite every claim with its source
- When sources conflict, present BOTH values with attribution
- Note publication dates next to all statistics
- Identify coverage gaps`;
}
