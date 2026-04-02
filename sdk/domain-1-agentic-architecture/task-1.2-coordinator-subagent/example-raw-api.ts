/**
 * Task 1.2 — Coordinator-Subagent Pattern Using Raw @anthropic-ai/sdk
 *
 * Exam relevance:
 * - Same hub-and-spoke pattern as the Agent SDK version
 * - Uses NESTED agentic loops: coordinator loop contains subagent loops
 * - Demonstrates explicit context passing without SDK abstractions
 * - Shows how "Task tool" behavior is implemented manually
 *
 * Key difference from Agent SDK version:
 * - No Task tool abstraction — subagents are separate conversations
 * - The coordinator "simulates" subagent calls by running independent
 *   message conversations with different system prompts and tool sets
 * - Context passing is manual (you build the subagent's prompt yourself)
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { researchToolDefinitions, executeResearchTool } from '../../../shared/tools/research-tools.js';
import {
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../../shared/prompts/research-coordinator.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 10;

// ─── Subagent Agentic Loop ──────────────────────────────────────────────────
//
// EXAM CONCEPT: Each subagent runs its own complete agentic loop.
// It has its own:
//   - System prompt (specialized for its role)
//   - Tool set (restricted to what it needs)
//   - Message history (fresh — does NOT inherit coordinator's)
//
// This is the SAME agentic loop from Task 1.1, but used as a building block
// inside the coordinator.

async function runSubagentLoop(name: string, systemPrompt: string, allowedToolNames: string[], taskDescription: string): Promise<string> {
  console.log(`\n  [${name}] Starting subagent loop...`);

  // Filter tools to only what this subagent is allowed to use
  // EXAM CONCEPT: Tool restriction — subagents don't get all tools
  const tools = researchToolDefinitions.filter(t => allowedToolNames.includes(t.name)) as Anthropic.Messages.Tool[];

  // Fresh message history — isolated context
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: taskDescription }];
  let turnCount = 0;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`  [${name}] Safety limit reached`);
      return '[Subagent reached turn limit]';
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    // Same stop_reason-driven loop as Task 1.1
    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      console.log(`  [${name}] Complete (${turnCount} turns)`);
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of response.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use')) {
        console.log(`    [${name}] Tool: ${block.name}(${JSON.stringify(block.input).substring(0, 60)}...)`);
        const result = executeResearchTool(block.name, block.input as Record<string, unknown>);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  return '[Subagent did not complete]';
}

// ─── Coordinator (Raw API Implementation) ───────────────────────────────────
//
// EXAM CONCEPT: The coordinator is itself an agentic loop, but instead of
// calling MCP tools, it "calls" subagents by running separate conversations.
//
// In the Agent SDK, this would be Task tool calls.
// In raw API, this is manual orchestration.

async function runCoordinatorRawApi(userQuery: string): Promise<string> {
  console.log('\n' + '='.repeat(60));
  console.log('Research Coordinator — Raw API Pattern');
  console.log('='.repeat(60));
  console.log(`\nQuery: ${userQuery}\n`);

  // ── Phase 1: Decomposition ──────────────────────────────────────────────
  // The coordinator uses a one-shot Claude call (no tools) to plan
  console.log('Phase 1: Decomposition');

  const planResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `Decompose the research query into 2-4 specific, non-overlapping subtopics.
Return JSON: { "subtopics": ["..."], "needs_documents": false }
Cover ALL relevant domains, not just the obvious ones.`,
    messages: [{ role: 'user', content: userQuery }],
  });

  let plan: { subtopics: string[]; needs_documents: boolean };
  try {
    const firstBlock = planResponse.content[0];
    const text = firstBlock.type === 'text' ? firstBlock.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    plan = JSON.parse(jsonMatch![0]);
  } catch {
    plan = { subtopics: [userQuery], needs_documents: false };
  }

  console.log(`  Subtopics: ${plan.subtopics.join(', ')}`);

  // ── Phase 2: Parallel Search Subagents ──────────────────────────────────
  //
  // EXAM CONCEPT: Parallel subagent invocation
  // Each subagent gets a DIFFERENT subtopic and runs independently
  console.log('\nPhase 2: Parallel Search');

  const searchTasks = plan.subtopics.map((subtopic: string, i: number) =>
    runSubagentLoop(
      `search-${i + 1}`,
      searchSubagentPrompt,
      ['web_search'],  // Only web_search tool
      // EXAM CONCEPT: Explicit context passing — the task description IS the context
      `Research this specific subtopic: "${subtopic}"

Search for recent sources (2024-2025). For each finding, provide:
- The specific claim or statistic
- Source URL and publication date
- Confidence level (high/medium/low)

Return your findings as a structured JSON array.
Focus ONLY on "${subtopic}" — do not research other topics.`
    )
  );

  const searchResults = await Promise.all(searchTasks);

  // ── Phase 3: Synthesis Subagent ─────────────────────────────────────────
  //
  // EXAM CONCEPT: Sequential dependency — synthesis needs search results
  // This CANNOT run in parallel with search; it depends on their output.
  console.log('\nPhase 3: Synthesis');

  // Build the context for the synthesis subagent
  // EXAM CONCEPT: The coordinator EXPLICITLY passes all findings
  // The synthesis subagent has NO other way to access this data
  const allFindings = searchResults
    .map((result: string, i: number) => `### ${plan.subtopics[i]}\n${result}`)
    .join('\n\n');

  const synthesisResult = await runSubagentLoop(
    'synthesis',
    synthesisSubagentPrompt,
    ['verify_fact'],  // Only verify_fact tool (scoped cross-role tool)
    `Synthesize these research findings into a comprehensive report:

${allFindings}

Requirements:
- Cite every claim with its source
- If two sources give different numbers, present BOTH (do not pick one)
- Note publication dates next to statistics
- Identify gaps where subtopics lack coverage`
  );

  // ── Phase 4: Quality Check ──────────────────────────────────────────────
  // Coordinator evaluates the synthesis for gaps
  console.log('\nPhase 4: Quality Check');

  const qualityResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: 'Evaluate the research report for coverage gaps. Return JSON: { "gaps": [...], "score": N }',
    messages: [{
      role: 'user',
      content: `Query: ${userQuery}\n\nReport:\n${synthesisResult}`,
    }],
  });

  let quality: { gaps: string[]; score: number };
  try {
    const firstBlock = qualityResponse.content[0];
    const text = firstBlock.type === 'text' ? firstBlock.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    quality = JSON.parse(jsonMatch![0]);
  } catch {
    quality = { gaps: [], score: 7 };
  }

  console.log(`  Quality score: ${quality.score}/10`);
  if (quality.gaps.length > 0) {
    console.log(`  Gaps: ${quality.gaps.join(', ')}`);
  }

  // ── Output ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('FINAL REPORT');
  console.log('='.repeat(60));
  console.log(synthesisResult);

  return synthesisResult;
}

// ─── Comparison: Raw API vs Agent SDK for Coordinator Pattern ───────────────
//
// ┌────────────────────────┬─────────────────────────┬───────────────────────────┐
// │ Concern                 │ Raw API                  │ Agent SDK                  │
// ├────────────────────────┼─────────────────────────┼───────────────────────────┤
// │ Subagent invocation     │ Manual function call     │ Task tool call              │
// │ Context isolation       │ Fresh messages array     │ SDK creates new session     │
// │ Tool restriction        │ Filter toolDefinitions   │ allowedTools in definition  │
// │ Parallel execution      │ Promise.all()            │ Multiple Task calls at once │
// │ Error handling          │ try/catch per subagent   │ SDK error propagation       │
// │ Result aggregation      │ Manual string building   │ Task tool return values     │
// └────────────────────────┴─────────────────────────┴───────────────────────────┘

// ─── Run ────────────────────────────────────────────────────────────────────

runCoordinatorRawApi(
  "Research the impact of AI on creative industries in 2025."
).catch(console.error);
