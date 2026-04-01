/**
 * Task 2.3 — Tool Distribution Across Agents
 *
 * Exam relevance:
 * - Too many tools (18+) degrade selection reliability
 * - Scoped tool access (4-5 per agent) improves accuracy
 * - Cross-role tools (verify_fact) eliminate coordinator round-trips
 * - tool_choice forced selection ensures subagents use the right tool first
 *
 * This example demonstrates:
 * 1. Three subagent configurations, each with only their relevant tools
 * 2. Synthesis agent gets a scoped verify_fact cross-role tool
 * 3. tool_choice forced selection for the search agent's first step
 * 4. Comparison of giving all tools vs. scoped tools
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  researchToolDefinitions,
  executeResearchTool,
} from '../../../shared/tools/research-tools.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 10;

// ─── Tool Distribution ─────────────────────────────────────────────────────
// Each subagent receives ONLY its relevant tools. The research-tools.js
// exports 3 tools: web_search, analyze_document, verify_fact. In a real
// system each role would have 4-5 tools; here we demonstrate the principle.

// Search agent: finds information
const searchAgentTools = researchToolDefinitions.filter(
  (t) => t.name === 'web_search'
);

// Analysis agent: analyzes documents in depth
const analysisAgentTools = researchToolDefinitions.filter(
  (t) => t.name === 'analyze_document'
);

// Synthesis agent: combines findings + lightweight fact-checks
// verify_fact is a CROSS-ROLE tool — avoids round-trips to coordinator
const synthesisAgentTools = researchToolDefinitions.filter(
  (t) => t.name === 'verify_fact'
);

// Anti-pattern: giving ALL tools to every agent
const allTools = researchToolDefinitions;

// ─── Subagent Runner ───────────────────────────────────────────────────────
// Runs a subagent with its scoped tools and optional forced tool_choice.

async function runSubagent({
  label,
  systemPrompt,
  userMessage,
  tools,
  forcedTool = null,
}) {
  console.log(`\n  ┌── ${label} ──`);
  console.log(`  │ Tools: [${tools.map((t) => t.name).join(', ')}]`);
  if (forcedTool) {
    console.log(`  │ tool_choice: forced → ${forcedTool}`);
  }
  console.log(`  │ Task: ${userMessage.substring(0, 70)}...`);

  const messages = [{ role: 'user', content: userMessage }];
  const toolCalls = [];
  let turnCount = 0;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.log(`  │ [WARNING] Safety limit after ${MAX_TURNS} turns`);
      break;
    }

    const requestParams = {
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    };

    // Force tool_choice on the FIRST turn only
    if (turnCount === 1 && forcedTool) {
      requestParams.tool_choice = { type: 'tool', name: forcedTool };
    }
    // Subsequent turns use auto
    // (the subagent may need another call or may be done)

    const response = await client.messages.create(requestParams);

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      console.log(`  │ Result: ${text.substring(0, 100)}...`);
      console.log(`  │ Tool calls: ${toolCalls.map((c) => c.name).join(' → ')}`);
      console.log(`  └──`);
      return { text, toolCalls };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const results = [];

      for (const block of response.content.filter((b) => b.type === 'tool_use')) {
        console.log(`  │ Turn ${turnCount}: ${block.name}(${JSON.stringify(block.input).substring(0, 60)})`);
        toolCalls.push({ name: block.name, input: block.input });

        const result = executeResearchTool(block.name, block.input);
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: results });
    }
  }

  return { text: '', toolCalls };
}

// ─── Demonstration: Scoped vs. All Tools ───────────────────────────────────

async function demonstrateScopedTools() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Task 2.3: Tool Distribution — Scoped vs. All Tools      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const topic = 'AI impact on creative industries in 2025';

  // ── Part 1: Scoped Tools (Correct Pattern) ────────────────────────────
  console.log('\n═══ SCOPED TOOLS (4-5 per agent) ═══');

  // Search agent: forced to use web_search on first turn
  console.log('\n▶ Search Agent (web_search only, forced first call)');
  const searchResult = await runSubagent({
    label: 'Search Agent',
    systemPrompt:
      'You are a web search research agent. Find relevant sources on the assigned topic. ' +
      'Return structured findings with claims, evidence, and source URLs.',
    userMessage: `Search for information about: ${topic}`,
    tools: searchAgentTools,
    forcedTool: 'web_search', // Must search, cannot answer from memory
  });

  // Analysis agent: scoped to analyze_document only
  console.log('\n▶ Analysis Agent (analyze_document only)');
  const analysisResult = await runSubagent({
    label: 'Analysis Agent',
    systemPrompt:
      'You are a document analysis agent. Analyze documents and extract structured findings. ' +
      'Each finding should include a claim, evidence, confidence level, and page reference.',
    userMessage:
      'Analyze document doc-001 focusing on market growth and production efficiency.',
    tools: analysisAgentTools,
    forcedTool: 'analyze_document',
  });

  // Synthesis agent: scoped to verify_fact (cross-role tool)
  console.log('\n▶ Synthesis Agent (verify_fact cross-role tool)');
  const synthesisResult = await runSubagent({
    label: 'Synthesis Agent',
    systemPrompt:
      'You are a research synthesis agent. Combine findings into a coherent report. ' +
      'Use verify_fact for quick fact-checks. For complex verification, note it as ' +
      '"requires further investigation" rather than guessing.',
    userMessage:
      'Synthesize these findings into a report. Verify this claim: ' +
      '"AI art tools market grew 47% year-over-year in 2024"',
    tools: synthesisAgentTools,
  });

  // ── Part 2: All Tools (Anti-Pattern) ──────────────────────────────────
  console.log('\n\n═══ ALL TOOLS (anti-pattern) ═══');
  console.log(
    '\nGiving ALL 3 tools to a single search agent. The agent may call'
  );
  console.log(
    'analyze_document or verify_fact instead of searching first.\n'
  );

  const allToolsResult = await runSubagent({
    label: 'Search Agent (ALL tools)',
    systemPrompt:
      'You are a web search research agent. Find relevant sources on the assigned topic.',
    userMessage: `Search for information about: ${topic}`,
    tools: allTools,
    // No forced tool_choice — agent picks freely from all tools
  });

  // ── Analysis ──────────────────────────────────────────────────────────
  console.log('\n\n' + '='.repeat(60));
  console.log('ANALYSIS: Scoped vs. All Tools');
  console.log('='.repeat(60));

  console.log(`
  SCOPED TOOLS:
    Search agent:    [web_search] — forced first call
    Analysis agent:  [analyze_document] — forced first call
    Synthesis agent: [verify_fact] — cross-role tool for quick checks

  ALL TOOLS (anti-pattern):
    Search agent:    [web_search, analyze_document, verify_fact]
    No forced tool_choice

  Results:
    Scoped search agent first call: ${searchResult.toolCalls[0]?.name || 'none'}
    All-tools agent first call:     ${allToolsResult.toolCalls[0]?.name || 'none'}
  `);

  if (searchResult.toolCalls[0]?.name === 'web_search') {
    console.log('  Scoped agent correctly called web_search first (forced).');
  }

  if (allToolsResult.toolCalls[0]?.name !== 'web_search') {
    console.log(
      `  All-tools agent called ${allToolsResult.toolCalls[0]?.name} instead of web_search.`
    );
    console.log(
      '  This is the misrouting problem — with all tools available, the agent'
    );
    console.log('  may choose a different tool than intended for its role.');
  } else {
    console.log(
      '  All-tools agent happened to call web_search, but this is not guaranteed.'
    );
    console.log(
      '  Without forced tool_choice and scoped tools, misrouting can occur'
    );
    console.log('  non-deterministically on different runs.');
  }

  console.log(`
  KEY TAKEAWAYS:
  1. Scope each agent to 4-5 tools for reliable selection
  2. Use forced tool_choice for deterministic first-step behavior
  3. Cross-role tools (verify_fact) eliminate coordinator round-trips
  4. All-tools pattern increases misrouting risk, especially at scale
  `);
}

demonstrateScopedTools().catch(console.error);
