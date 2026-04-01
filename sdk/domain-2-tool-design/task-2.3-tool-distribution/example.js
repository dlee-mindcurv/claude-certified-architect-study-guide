/**
 * Task 2.3 — Tool Distribution Across Agents
 *
 * Exam relevance:
 * - Too many tools (18+) degrade selection reliability
 * - Scoped tool access (4-5 per agent) improves accuracy
 * - Cross-role tools (verify_fact) eliminate coordinator round-trips
 * - The agents config in query() options controls tool distribution
 *
 * EXAM KEY CONCEPT:
 *   Use the `agents` option in query() to define subagents with scoped
 *   tool sets. Each agent gets ONLY its relevant tools via its own
 *   mcpServers or tools array. This prevents misrouting.
 *
 * This example demonstrates:
 * 1. Three subagent definitions, each with only their relevant tools
 * 2. Synthesis agent gets a cross-role verify_fact tool
 * 3. Comparison: scoped tools vs. giving all tools to one agent
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import {
  researchServer,
  webSearchTool,
  analyzeDocumentTool,
  verifyFactTool,
} from '../../../shared/tools/research-tools.js';

// ─── Scoped MCP Servers (one per agent role) ──────────────────────────────
// EXAM KEY CONCEPT: Each subagent gets its OWN MCP server with ONLY its
// relevant tools. This keeps each agent focused on 1-2 tools, not 18+.

const searchServer = createSdkMcpServer({
  name: 'search',
  version: '1.0.0',
  tools: [webSearchTool],     // Search agent: web_search only
});

const analysisServer = createSdkMcpServer({
  name: 'analysis',
  version: '1.0.0',
  tools: [analyzeDocumentTool],  // Analysis agent: analyze_document only
});

const synthesisServer = createSdkMcpServer({
  name: 'synthesis',
  version: '1.0.0',
  tools: [verifyFactTool],     // Synthesis agent: verify_fact (cross-role)
});

// ─── Agent Definitions ────────────────────────────────────────────────────
// EXAM KEY CONCEPT: The `agents` config in query() options defines
// subagents with scoped tools. The coordinator delegates to them by name.

const searchAgent = {
  description: 'Finds information via web search. Returns structured findings.',
  prompt:
    'You are a web search agent. Use web_search to find sources on the topic. ' +
    'Return findings as JSON with claims, evidence, and source URLs.',
  tools: ['mcp__search__web_search'],  // Scoped to search only
  maxTurns: 3,
};

const analysisAgent = {
  description: 'Analyzes documents in depth. Extracts claims with evidence and confidence.',
  prompt:
    'You are a document analysis agent. Use analyze_document to extract structured ' +
    'findings with claim, evidence, confidence, and page reference.',
  tools: ['mcp__analysis__analyze_document'],  // Scoped to analysis only
  maxTurns: 3,
};

const synthesisAgent = {
  description: 'Combines findings into a report. Has verify_fact for quick checks.',
  prompt:
    'You are a synthesis agent. Combine findings into a report. ' +
    'Use verify_fact for quick fact-checks (dates, stats). ' +
    'For complex verification, note "requires further investigation."',
  tools: ['mcp__synthesis__verify_fact'],  // Cross-role tool
  maxTurns: 3,
};

// ─── Run: Scoped Tools (Correct Pattern) ──────────────────────────────────

async function runScopedDemo() {
  console.log('=== SCOPED TOOLS (correct pattern) ===\n');
  console.log('Each subagent gets ONLY its relevant tools:');
  console.log('  search-agent:    [web_search]');
  console.log('  analysis-agent:  [analyze_document]');
  console.log('  synthesis-agent: [verify_fact]  (cross-role)\n');

  for await (const message of query({
    prompt:
      'Research "AI impact on creative industries in 2025". ' +
      'First search for sources, then analyze document doc-001, ' +
      'then synthesize findings and verify the claim that ' +
      '"AI art tools market grew 47% year-over-year in 2024".',
    options: {
      mcpServers: [searchServer, analysisServer, synthesisServer],
      agents: {
        'search-agent': searchAgent,
        'analysis-agent': analysisAgent,
        'synthesis-agent': synthesisAgent,
      },
      maxTurns: 10,
      hooks: {
        postToolUse: async ({ toolName, toolInput }) => {
          console.log(`  Tool: ${toolName}(${JSON.stringify(toolInput).substring(0, 60)})`);
        },
      },
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      console.log(`\n  Result: ${message.result.substring(0, 200)}...`);
    }
  }
}

// ─── Run: All Tools (Anti-Pattern) ────────────────────────────────────────

async function runAllToolsDemo() {
  console.log('\n\n=== ALL TOOLS (anti-pattern) ===\n');
  console.log('Giving ALL 3 tools to a single agent. It may call');
  console.log('analyze_document or verify_fact instead of searching first.\n');

  for await (const message of query({
    prompt: 'Search for information about AI impact on creative industries in 2025.',
    options: {
      // Anti-pattern: one server with ALL tools, no scoping
      mcpServers: [researchServer],
      maxTurns: 5,
      hooks: {
        postToolUse: async ({ toolName }) => {
          console.log(`  Tool: ${toolName}`);
        },
      },
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      console.log(`\n  Result: ${message.result.substring(0, 200)}...`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Task 2.3: Tool Distribution — Scoped vs. All Tools\n');

  await runScopedDemo();
  await runAllToolsDemo();

  console.log('\n' + '='.repeat(60));
  console.log('KEY TAKEAWAYS (exam)');
  console.log('='.repeat(60));
  console.log(`
  1. Scope each agent to 4-5 tools max for reliable selection
  2. Use separate MCP servers per agent role (createSdkMcpServer)
  3. Use agents config in query() options for subagent definitions
  4. Cross-role tools (verify_fact) eliminate coordinator round-trips
  5. All-tools pattern (18+ tools) increases misrouting risk
  6. Each agent's tools array restricts which tools it can call
  `);
}

main().catch(console.error);
