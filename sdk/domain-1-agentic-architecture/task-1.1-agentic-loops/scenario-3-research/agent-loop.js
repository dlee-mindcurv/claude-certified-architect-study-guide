/**
 * Scenario 3: Research Coordinator — Agentic Loop
 *
 * Exam relevance (Task 1.1):
 * - Demonstrates an agentic loop in a research/knowledge context
 * - Same stop_reason-driven pattern as CSR, different domain
 * - Uses research tools (web_search, analyze_document, verify_fact)
 * - Shows how the SAME loop structure works across different scenarios
 *
 * This is a single-agent research loop (not the multi-agent coordinator
 * from Task 1.2). It shows one agent using all research tools directly.
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { researchToolDefinitions, executeResearchTool } from '../../../../shared/tools/research-tools.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 20;

// ─── Research Agent System Prompt ───────────────────────────────────────────
// A simplified single-agent prompt (the full multi-agent coordinator prompt
// is in shared/prompts/research-coordinator.js and used in Task 1.2)

const researchAgentPrompt = `You are a research agent with access to web search, document analysis, and fact verification tools.

## Instructions
1. When given a research topic, search for relevant information using web_search
2. For documents found, use analyze_document to extract structured findings
3. Use verify_fact to cross-check key statistics or claims
4. Synthesize your findings into a clear, cited summary

## Quality Standards
- Every claim must cite its source
- When sources conflict, present BOTH values with attribution
- Note temporal differences (different publication dates)
- Separate well-established findings from contested ones

## Output Format
Provide a structured research summary with:
- Key findings (with citations)
- Conflicting data points (if any)
- Gaps in coverage
- List of sources consulted`;

// ─── Agentic Loop for Research Scenario ─────────────────────────────────────

async function runResearchAgent(query) {
  console.log('\n' + '='.repeat(60));
  console.log('Research Agent — Scenario 3 (Single-Agent Loop)');
  console.log('='.repeat(60));
  console.log(`\nQuery: ${query}\n`);

  const messages = [{ role: 'user', content: query }];

  const toolCallLog = [];
  let turnCount = 0;

  // ── Same core pattern as the CSR loop ───────────────────────────────────
  // EXAM KEY CONCEPT: The agentic loop structure is IDENTICAL across scenarios.
  // Only the tools, system prompt, and domain logic change.

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`[SAFETY] Max turns (${MAX_TURNS}) reached.`);
      break;
    }

    console.log(`\n--- Turn ${turnCount} ---`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: researchAgentPrompt,
      tools: researchToolDefinitions,
      messages,
    });

    // ── stop_reason-driven control (identical pattern) ────────────────────

    if (response.stop_reason === 'end_turn') {
      const finalText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      console.log(`\nResearch Report:\n${finalText}`);
      console.log(`\n--- Research complete in ${turnCount} turns ---`);
      console.log('Tool sequence:', toolCallLog.map(t => t.name).join(' → '));
      return { text: finalText, toolCalls: toolCallLog, turns: turnCount };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      for (const toolUse of toolUseBlocks) {
        console.log(`  [Turn ${turnCount}] ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

        const result = executeResearchTool(toolUse.name, toolUse.input);

        toolCallLog.push({
          name: toolUse.name,
          input: toolUse.input,
          isError: result.isError || false,
          turn: turnCount,
        });

        if (result.isError) {
          const parsed = JSON.parse(result.content);
          console.log(`    ERROR [${parsed.errorCategory}]: ${parsed.message}`);

          // EXAM NOTE: For transient errors in research, the agent should
          // try alternative queries rather than just retrying the same one.
          // This is handled by Claude's reasoning, not by loop logic.
        } else {
          console.log(`    OK: ${result.content.substring(0, 100)}...`);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    console.error(`Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

runResearchAgent(
  "Research the impact of AI on creative industries in 2025. " +
  "Include data on visual arts, music production, and film. " +
  "Cite all sources and note any conflicting statistics."
).catch(console.error);
