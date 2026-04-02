/**
 * Task 1.2 -- Coordinator-Subagent Pattern Using Agent SDK
 *
 * Exam relevance:
 * - Hub-and-spoke topology: coordinator manages all inter-subagent communication
 * - options.agents defines subagents with their own prompts and tool restrictions
 * - Subagents do NOT inherit the coordinator's conversation history
 * - Dynamic routing: not every query needs every subagent
 *
 * EXAM KEY CONCEPT:
 *   The Agent SDK's `agents` config declares subagent definitions. The
 *   coordinator invokes them via the Task tool. Each subagent gets an
 *   isolated context (fresh message history) and restricted tool set.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../../shared/tools/research-tools.js';
import {
  researchCoordinatorPrompt,
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../../shared/prompts/research-coordinator.js';

// ─── Coordinator with Subagents ────────────────────────────────────────────

async function runCoordinator(userQuery: string): Promise<string> {
  console.log('\n' + '='.repeat(60));
  console.log('Research Coordinator -- Agent SDK Pattern');
  console.log('='.repeat(60));
  console.log(`\nQuery: ${userQuery}\n`);

  let finalText = '';

  // EXAM KEY CONCEPT: The agents config declares subagent definitions.
  // Each has its own prompt, tools, and model. The coordinator invokes
  // them via the Task tool, and the SDK handles context isolation.

  for await (const message of query({
    prompt: userQuery,
    options: {
      systemPrompt: researchCoordinatorPrompt,

      // MCP server provides all research tools
      mcpServers: {
        research: researchServer,
      },

      // EXAM KEY CONCEPT: Subagent definitions with scoped tools
      // Each subagent can only use the tools listed in its `tools` array.
      // The coordinator routes work to the appropriate subagent.
      agents: {
        'search-agent': {
          description: 'Searches the web for information on assigned subtopics.',
          prompt: searchSubagentPrompt,
          tools: ['mcp__research__web_search'],  // ONLY web search
          model: 'sonnet',
          maxTurns: 10,
        },
        'analysis-agent': {
          description: 'Analyzes specific documents and extracts structured findings.',
          prompt: `You are a document analysis specialist. Analyze documents and extract structured findings with claim, evidence, confidence, and page reference.`,
          tools: ['mcp__research__analyze_document'],  // ONLY document analysis
          model: 'sonnet',
          maxTurns: 10,
        },
        'synthesis-agent': {
          description: 'Combines findings from search and analysis into a coherent cited report.',
          prompt: synthesisSubagentPrompt,
          tools: ['mcp__research__verify_fact'],  // Scoped cross-role tool
          model: 'sonnet',
          maxTurns: 10,
        },
      },

      // Allow the coordinator to dispatch to subagents
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
  console.log('FINAL REPORT');
  console.log('='.repeat(60));
  console.log(finalText);
  return finalText;
}

// ─── Run ────────────────────────────────────────────────────────────────────

runCoordinator(
  "Research the impact of AI on creative industries in 2025. " +
  "Cover visual arts, music production, and film."
).catch(console.error);
