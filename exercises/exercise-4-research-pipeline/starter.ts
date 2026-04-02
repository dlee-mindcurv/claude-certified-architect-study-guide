/**
 * Exercise 4 — STARTER: Multi-Agent Research Pipeline
 *
 * Domains: D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)
 *
 * Uses @anthropic-ai/claude-agent-sdk query() with agents config
 * to create a coordinator-subagent research pipeline.
 *
 * Run with: npm run exercise:4
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer, webSearchTool, analyzeDocumentTool, verifyFactTool } from '../../shared/tools/research-tools.js';

// ─── Step 1: Define Subagents ──────────────────────────────────────────────
//
// EXAM KEY CONCEPT (Task 1.2): Coordinator-subagent topology.
// The coordinator manages ALL inter-subagent communication.
// Each subagent has isolated context and restricted tools.
//
// In the Agent SDK, subagents are defined via options.agents.
// The coordinator invokes them via the Agent tool.

// TODO 1: Define the subagent configurations:
const subagents = {
  // 'search-agent': {
  //   description: 'Searches the web for information on specific topics',
  //   prompt: 'You are a research search agent. Search for information using web_search. Return structured findings with sources.',
  //   tools: ['mcp__research__web_search'],  // <-- scoped to search only
  // },
  //
  // 'analysis-agent': {
  //   description: 'Analyzes documents and extracts key findings',
  //   prompt: 'You are a document analysis agent. Analyze documents using analyze_document.',
  //   tools: ['mcp__research__analyze_document'],
  // },
  //
  // 'synthesis-agent': {
  //   description: 'Synthesizes findings into a cohesive report with fact verification',
  //   prompt: 'You are a synthesis agent. Combine findings and verify facts. Preserve all source citations.',
  //   tools: ['mcp__research__verify_fact'],
  // },
};

// ─── Step 2: Run Coordinator ───────────────────────────────────────────────
//
// EXAM KEY CONCEPT (Task 1.3): The coordinator uses the Agent tool to
// invoke subagents. It passes context EXPLICITLY — subagents don't
// inherit the coordinator's conversation history.

async function runResearch(topic) {
  console.log(`\nResearch Topic: ${topic}\n`);

  // TODO 2: Call query() with:
  //   prompt: the research topic with instructions to decompose, delegate, synthesize
  //   options:
  //     mcpServers: { research: researchServer }
  //     agents: subagents (from Step 1)
  //     allowedTools: ['Agent', plus all research MCP tools]
  //     permissionMode: 'bypassPermissions'
  //     maxTurns: 30
  //
  // The coordinator should:
  //   1. Decompose the topic into subtopics
  //   2. Delegate to search-agent for each subtopic
  //   3. Pass results to synthesis-agent
  //   4. Return the final report
  //
  // Iterate messages to find the final result:
  //   for await (const message of query({ prompt, options })) {
  //     if (message.type === 'result' && message.subtype === 'success') {
  //       return message.result;
  //     }
  //   }

  return 'TODO: implement coordinator';
}

// ─── Step 3: Error Handling ────────────────────────────────────────────────
//
// EXAM KEY CONCEPT (Task 5.3): When a subagent fails, the coordinator
// should receive structured error context and decide whether to retry
// with a different approach or report partial results.
//
// TODO 3: Add a PostToolUse hook that logs subagent results and errors:
//   hooks: {
//     PostToolUse: [{
//       matcher: 'Agent',
//       hooks: [async (input, id, { signal }) => {
//         console.log(`Subagent completed: ${input.tool_output?.slice(0, 100)}`);
//         return {};
//       }]
//     }]
//   }

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Exercise 4: Multi-Agent Research Pipeline');
  console.log('Complete the TODOs, then run again.\n');

  const topic = process.argv[2] || 'Impact of AI on creative industries in 2025';
  const result = await runResearch(topic);

  console.log('\n' + '='.repeat(60));
  console.log('RESEARCH REPORT:');
  console.log('='.repeat(60));
  console.log(result);
}

main().catch(console.error);
