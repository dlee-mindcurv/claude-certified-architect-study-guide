/**
 * Exercise 4 — SOLUTION: Multi-Agent Research Pipeline
 *
 * Domains: D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)
 *
 * Uses @anthropic-ai/claude-agent-sdk query() with agents config
 * to create a coordinator-subagent research system.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../shared/tools/research-tools.js';

// ─── Subagent Definitions (Task 1.2, 1.3, 2.3) ────────────────────────────
//
// Each subagent has:
//   - description: tells the coordinator WHEN to use this agent
//   - prompt: the agent's system instructions
//   - tools: scoped tool access (not all tools)

const subagents = {
  'search-agent': {
    description: 'Searches the web for information on a specific topic. Use for gathering initial research data.',
    prompt: `You are a web research agent. Use web_search to find information.
Return structured findings with:
- Specific claims and statistics
- Source URLs and publication dates
- Confidence levels
Focus ONLY on the topic you are given.`,
    tools: ['mcp__research__web_search'],
  },

  'analysis-agent': {
    description: 'Analyzes documents by ID and extracts structured findings. Use when you have specific document IDs.',
    prompt: `You are a document analysis agent. Use analyze_document to examine documents.
Return findings as structured data with claims, evidence, and confidence levels.`,
    tools: ['mcp__research__analyze_document'],
  },

  'synthesis-agent': {
    description: 'Combines research findings into a cohesive report. Use after all research is gathered.',
    prompt: `You are a research synthesis agent. Combine findings into a clear report.
Rules:
- Preserve ALL source citations
- Present conflicting statistics from BOTH sources (do not pick one)
- Note publication dates alongside statistics
- Use verify_fact for key claims
- Identify any coverage gaps`,
    tools: ['mcp__research__verify_fact'],
  },
};

// ─── PostToolUse Hook: Log Subagent Results ────────────────────────────────

async function logSubagentHook(input, toolUseID, { signal }) {
  if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'Agent') {
    const preview = (input.tool_output || '').slice(0, 150);
    console.log(`  [Subagent result] ${preview}...`);
  }
  return {};
}

// ─── Run Coordinator ───────────────────────────────────────────────────────

async function runResearch(topic) {
  console.log(`\nResearch Topic: ${topic}\n`);

  const coordinatorPrompt = `Research the following topic: "${topic}"

You are a research coordinator. Follow these steps:
1. Decompose the topic into 2-3 specific subtopics
2. Use the search-agent for EACH subtopic (invoke Agent tool with description of what to search)
3. Use the synthesis-agent to combine ALL findings into a final report
4. Return the synthesized report as your final response

IMPORTANT: Pass explicit context to each subagent — they cannot see your conversation history.`;

  for await (const message of query({
    prompt: coordinatorPrompt,
    options: {
      mcpServers: { research: researchServer },
      agents: subagents,

      // Coordinator needs Agent tool to invoke subagents + direct MCP tool access
      allowedTools: [
        'Agent',
        'mcp__research__web_search',
        'mcp__research__analyze_document',
        'mcp__research__verify_fact',
      ],

      hooks: {
        PostToolUse: [{ matcher: 'Agent', hooks: [logSubagentHook] }],
      },

      permissionMode: 'bypassPermissions',
      maxTurns: 30,
    },
  })) {
    // Log progress
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'tool_use' && block.name === 'Agent') {
          console.log(`  Invoking subagent: ${block.input?.description?.slice(0, 80)}`);
        }
      }
    }

    if (message.type === 'result' && message.subtype === 'success') {
      return message.result;
    }
  }

  return '[Research did not complete]';
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Exercise 4 — SOLUTION: Multi-Agent Research Pipeline\n');

  const topic = process.argv[2] || 'Impact of AI on creative industries in 2025';
  const result = await runResearch(topic);

  console.log('\n' + '='.repeat(60));
  console.log('RESEARCH REPORT:');
  console.log('='.repeat(60));
  console.log(result);
}

main().catch(console.error);
