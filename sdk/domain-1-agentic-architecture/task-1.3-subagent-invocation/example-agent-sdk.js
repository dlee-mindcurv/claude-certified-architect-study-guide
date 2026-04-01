/**
 * Task 1.3 -- Subagent Invocation Using Agent SDK
 *
 * Exam relevance:
 * - agents config restricts tools per subagent via the `tools` array
 * - Subagents get isolated context (fresh message history)
 * - Parallel invocation: independent subagents run concurrently
 * - Sequential invocation: downstream agents receive upstream results explicitly
 *
 * EXAM KEY CONCEPT:
 *   Each subagent definition in the agents config acts as a scope boundary.
 *   A search subagent with tools: ['mcp__research__web_search'] CANNOT
 *   call analyze_document, even though the MCP server provides it. The SDK
 *   enforces this restriction.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../../shared/tools/research-tools.js';
import {
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../../shared/prompts/research-coordinator.js';

// ─── Coordinator that Demonstrates Subagent Invocation ─────────────────────

async function demonstrateSubagentInvocation() {
  console.log('='.repeat(60));
  console.log('Task 1.3 -- Subagent Invocation Patterns (Agent SDK)');
  console.log('='.repeat(60));

  let finalText = '';

  // EXAM KEY CONCEPT: The coordinator prompt instructs the model to use
  // subagents for different phases. The agents config enforces tool scoping.

  for await (const message of query({
    prompt: `Research AI in creative industries. Follow these steps:

1. Use the search-agent to research "AI in visual arts" (search subtopic 1)
2. Use the search-agent to research "AI in music production" (search subtopic 2)
3. Use the analysis-agent to analyze document doc-001
4. Use the synthesis-agent to combine ALL findings into a cited report

Pass search and analysis findings EXPLICITLY to the synthesis agent.`,
    options: {
      systemPrompt: `You are a research coordinator. Delegate work to specialized subagents:
- search-agent: for web searches on specific subtopics
- analysis-agent: for analyzing documents by ID
- synthesis-agent: for combining findings into a report

CRITICAL: Pass findings EXPLICITLY to downstream agents. They do NOT see your conversation.`,

      mcpServers: {
        research: researchServer,
      },

      // EXAM KEY CONCEPT: Each subagent has a RESTRICTED tool set.
      // search-agent: ONLY web_search
      // analysis-agent: ONLY analyze_document
      // synthesis-agent: ONLY verify_fact (scoped cross-role tool)
      agents: {
        'search-agent': {
          description: 'Searches the web for information on a specific subtopic.',
          prompt: searchSubagentPrompt,
          tools: ['mcp__research__web_search'],
          model: 'sonnet',
          maxTurns: 10,
        },
        'analysis-agent': {
          description: 'Analyzes a document by ID and extracts structured findings.',
          prompt: `You are a document analysis specialist. Use analyze_document to examine assigned documents. Extract findings with claim, evidence, confidence, and page reference.`,
          tools: ['mcp__research__analyze_document'],
          model: 'sonnet',
          maxTurns: 10,
        },
        'synthesis-agent': {
          description: 'Combines findings into a coherent report. Has verify_fact for quick fact-checks.',
          prompt: synthesisSubagentPrompt,
          // EXAM KEY CONCEPT: "Scoped cross-role tool"
          // verify_fact lets synthesis do lightweight fact-checks without
          // needing full web_search access. More efficient than routing
          // every check back to the coordinator.
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

  console.log('\n' + '='.repeat(60));
  console.log('SYNTHESIZED REPORT');
  console.log('='.repeat(60));
  console.log(finalText);

  return finalText;
}

// ─── Run ────────────────────────────────────────────────────────────────────

demonstrateSubagentInvocation().catch(console.error);
