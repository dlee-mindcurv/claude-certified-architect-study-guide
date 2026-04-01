/**
 * Scenario 3: Research System — Subagent Configurations
 *
 * Exam relevance (Task 1.3):
 * - Complete AgentDefinition configs for a multi-agent research system
 * - Demonstrates allowedTools, explicit context patterns, and model selection
 * - Shows how to configure subagents for reuse across different coordinators
 *
 * These configurations are designed to be imported by coordinators.
 * The coordinator creates subagent instances using these definitions.
 */

import { researchToolDefinitions, executeResearchTool } from '../../../../shared/tools/research-tools.js';
import {
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../../../shared/prompts/research-coordinator.js';

// ─── Helper: Create Tool with Execute Function ──────────────────────────────

function createToolWithExecutor(toolName) {
  const toolDef = researchToolDefinitions.find(t => t.name === toolName);
  if (!toolDef) {
    throw new Error(`Unknown tool: ${toolName}. Available: ${researchToolDefinitions.map(t => t.name).join(', ')}`);
  }
  return {
    ...toolDef,
    execute: async (input) => {
      const result = executeResearchTool(toolName, input);
      if (result.isError) {
        // Propagate error information to the subagent
        throw new Error(result.content);
      }
      return result.content;
    },
  };
}

// ─── Subagent Definitions ───────────────────────────────────────────────────

/**
 * Web Search Subagent
 *
 * EXAM CONCEPT: Minimal tool set — only web_search
 *
 * This agent is responsible for:
 * - Running targeted web searches on assigned subtopics
 * - Returning structured findings with source attribution
 * - Reporting gaps when searches return no results
 *
 * It CANNOT:
 * - Analyze documents (that's the analysis subagent's job)
 * - Verify facts (that's the synthesis subagent's scoped tool)
 * - Communicate with other subagents (only the coordinator routes)
 */
export const webSearchAgentDef = {
  name: 'web-search-agent',

  // EXAM CONCEPT: Model selection per subagent
  // Search agents do relatively simple work (run queries, format results)
  // so a faster/cheaper model could be used in production
  model: 'claude-sonnet-4-20250514',

  instructions: searchSubagentPrompt,

  // EXAM CONCEPT: allowedTools restricts this agent to web_search ONLY
  allowedTools: ['web_search'],
  tools: [createToolWithExecutor('web_search')],

  // Metadata for the coordinator to use when deciding which agent to invoke
  capabilities: {
    canSearch: true,
    canAnalyzeDocuments: false,
    canVerifyFacts: false,
    parallelizable: true,  // Multiple instances can run simultaneously
  },
};

/**
 * Document Analysis Subagent
 *
 * EXAM CONCEPT: Specialized tool access for a specific role
 *
 * This agent is responsible for:
 * - Analyzing documents by ID using the analyze_document tool
 * - Extracting structured findings with evidence and confidence
 * - Identifying gaps in document coverage
 */
export const documentAnalysisAgentDef = {
  name: 'document-analysis-agent',
  model: 'claude-sonnet-4-20250514',

  instructions: `You are a document analysis specialist. Your task is to analyze assigned documents and extract structured, cited findings.

## Process
1. Use analyze_document to examine each assigned document
2. For each finding, capture:
   - The specific claim or statistic
   - Supporting evidence from the document
   - Confidence level (high/medium/low)
   - Page reference for traceability
3. Identify topics the document does NOT cover (gaps)

## Output Format
Return structured JSON:
{
  "documentId": "doc-XXX",
  "title": "Document Title",
  "findings": [
    {
      "claim": "specific claim",
      "evidence": "supporting evidence text",
      "confidence": "high",
      "page": 12,
      "sourceDocument": "Document Title"
    }
  ],
  "gaps": ["topic not covered", "another topic not covered"],
  "metadata": {
    "author": "...",
    "publishedDate": "YYYY-MM-DD"
  }
}

## Important
- Do NOT fabricate findings. Only report what the document actually contains.
- If a focus area is specified but the document doesn't cover it, list it as a gap.
- Preserve the original wording of claims as closely as possible.`,

  allowedTools: ['analyze_document'],
  tools: [createToolWithExecutor('analyze_document')],

  capabilities: {
    canSearch: false,
    canAnalyzeDocuments: true,
    canVerifyFacts: false,
    parallelizable: true,
  },
};

/**
 * Synthesis Subagent
 *
 * EXAM CONCEPT: Scoped cross-role tool
 * The synthesis agent has verify_fact — a lightweight tool that lets it
 * do simple fact-checks without needing full web_search access.
 * This is more efficient than routing every fact-check back to the coordinator.
 *
 * This agent is responsible for:
 * - Combining findings from search and analysis agents
 * - Producing a coherent, cited report
 * - Detecting and annotating conflicts between sources
 * - Using verify_fact for quick cross-checks
 */
export const synthesisAgentDef = {
  name: 'synthesis-agent',
  model: 'claude-sonnet-4-20250514',

  instructions: synthesisSubagentPrompt,

  // EXAM CONCEPT: Scoped cross-role tool
  // verify_fact is a "cross-role" tool because fact verification is
  // tangential to synthesis, but the synthesis agent needs lightweight
  // access to it. Full web_search would be overkill and scope creep.
  allowedTools: ['verify_fact'],
  tools: [createToolWithExecutor('verify_fact')],

  capabilities: {
    canSearch: false,
    canAnalyzeDocuments: false,
    canVerifyFacts: true,
    parallelizable: false,  // Synthesis must run AFTER search/analysis
  },
};

// ─── Subagent Registry ──────────────────────────────────────────────────────
//
// EXAM CONCEPT: The coordinator looks up subagent definitions from a registry
// rather than hardcoding them. This makes the system extensible.

export const subagentRegistry = {
  'web-search-agent': webSearchAgentDef,
  'document-analysis-agent': documentAnalysisAgentDef,
  'synthesis-agent': synthesisAgentDef,
};

/**
 * Get a subagent definition by name.
 * @param {string} name - Subagent name from the registry
 * @returns {Object} AgentDefinition
 */
export function getSubagentDef(name) {
  const def = subagentRegistry[name];
  if (!def) {
    throw new Error(
      `Unknown subagent: ${name}. Available: ${Object.keys(subagentRegistry).join(', ')}`
    );
  }
  return def;
}

/**
 * Get all subagent definitions that support a given capability.
 * Useful for dynamic routing.
 *
 * @param {'canSearch'|'canAnalyzeDocuments'|'canVerifyFacts'} capability
 * @returns {Object[]} Array of matching AgentDefinitions
 */
export function getSubagentsByCapability(capability) {
  return Object.values(subagentRegistry).filter(
    def => def.capabilities[capability]
  );
}

// ─── Context Template Builders ──────────────────────────────────────────────
//
// EXAM CONCEPT: Explicit context passing
// These functions help coordinators build the task descriptions that
// carry context from one phase to the next.

/**
 * Build a task description for a search subagent.
 * The subtopic and any constraints are passed EXPLICITLY.
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
 * ALL findings from prior agents are passed EXPLICITLY.
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
- When sources conflict, present BOTH values with attribution — do NOT pick one
- Note publication dates next to all statistics
- Identify coverage gaps (subtopics with no or limited findings)
- Use verify_fact for any statistics that seem questionable`;
}
