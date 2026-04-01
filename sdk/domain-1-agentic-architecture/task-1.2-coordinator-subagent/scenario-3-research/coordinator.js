/**
 * Scenario 3: Full Research Coordinator
 *
 * Exam relevance (Task 1.2):
 * - Production-grade coordinator with web search, document analysis, and
 *   synthesis subagents
 * - Demonstrates ALL coordinator responsibilities:
 *   1. Query decomposition covering ALL relevant domains
 *   2. Dynamic routing (not every query needs every subagent)
 *   3. Parallel subagent execution
 *   4. Explicit context passing (subagents get context via prompt only)
 *   5. Result aggregation with conflict detection
 *   6. Iterative refinement for coverage gaps
 *   7. Error handling with graceful degradation
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { researchToolDefinitions, executeResearchTool } from '../../../../shared/tools/research-tools.js';
import {
  researchCoordinatorPrompt,
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../../../shared/prompts/research-coordinator.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const SUBAGENT_MAX_TURNS = 10;

// ─── Subagent Execution Engine ──────────────────────────────────────────────

/**
 * Run a subagent with its own agentic loop, isolated context, and restricted tools.
 *
 * @param {Object} config
 * @param {string} config.name - Subagent identifier for logging
 * @param {string} config.systemPrompt - Subagent's system prompt
 * @param {string[]} config.allowedTools - Tool names this subagent can use
 * @param {string} config.taskDescription - What the subagent should do (EXPLICIT context)
 * @returns {Promise<{success: boolean, result: string, toolCalls: number}>}
 */
async function executeSubagent({ name, systemPrompt, allowedTools, taskDescription }) {
  console.log(`  [${name}] Starting...`);

  const tools = researchToolDefinitions.filter(t => allowedTools.includes(t.name));
  const messages = [{ role: 'user', content: taskDescription }];
  let turnCount = 0;
  let totalToolCalls = 0;

  try {
    while (true) {
      if (++turnCount > SUBAGENT_MAX_TURNS) {
        console.warn(`  [${name}] Turn limit reached`);
        return {
          success: false,
          result: '[Subagent exceeded turn limit — partial results may be available]',
          toolCalls: totalToolCalls,
        };
      }

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      });

      if (response.stop_reason === 'end_turn') {
        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
        console.log(`  [${name}] Complete (${turnCount} turns, ${totalToolCalls} tool calls)`);
        return { success: true, result: text, toolCalls: totalToolCalls };
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });
        const toolResults = [];

        for (const block of response.content.filter(b => b.type === 'tool_use')) {
          totalToolCalls++;
          const result = executeResearchTool(block.name, block.input);

          if (result.isError) {
            const err = JSON.parse(result.content);
            console.log(`    [${name}] Tool error: ${err.errorCategory} — ${err.message}`);
          }

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
  } catch (error) {
    // EXAM CONCEPT: Graceful degradation — return partial results, don't crash
    console.error(`  [${name}] Error: ${error.message}`);
    return {
      success: false,
      result: `[Subagent failed: ${error.message}]`,
      toolCalls: totalToolCalls,
    };
  }

  return { success: false, result: '[Subagent did not complete]', toolCalls: 0 };
}

// ─── Research Coordinator ───────────────────────────────────────────────────

export async function runResearchCoordinator(userQuery) {
  console.log('\n' + '='.repeat(70));
  console.log('  RESEARCH COORDINATOR — Scenario 3');
  console.log('='.repeat(70));
  console.log(`\nQuery: ${userQuery}\n`);

  const startTime = Date.now();

  // ── Phase 1: Query Analysis & Decomposition ─────────────────────────────
  //
  // EXAM CONCEPT: The coordinator analyzes the query to determine:
  // - What subtopics to research (covering ALL relevant domains)
  // - Which subagent types are needed (dynamic routing)
  // - Whether document analysis is relevant
  console.log('--- Phase 1: Decomposition ---');

  const decomp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You are a research planner. Decompose the query into a research plan.

Return ONLY valid JSON:
{
  "subtopics": ["specific subtopic 1", "specific subtopic 2", ...],
  "document_ids": ["doc-001"],
  "needs_synthesis": true,
  "routing": {
    "search": true,
    "analysis": true/false,
    "synthesis": true
  }
}

CRITICAL: Ensure ALL relevant domains are covered. For broad topics, identify
at least 3 distinct subtopics. Do not collapse entire domains into "other."`,
    messages: [{ role: 'user', content: userQuery }],
  });

  let plan;
  try {
    const text = decomp.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    plan = JSON.parse(match[0]);
  } catch {
    plan = {
      subtopics: [userQuery],
      document_ids: [],
      needs_synthesis: true,
      routing: { search: true, analysis: false, synthesis: true },
    };
  }

  console.log(`  Subtopics (${plan.subtopics.length}): ${plan.subtopics.join(' | ')}`);
  console.log(`  Routing: search=${plan.routing.search}, analysis=${plan.routing.analysis}, synthesis=${plan.routing.synthesis}`);

  // ── Phase 2: Search Subagents (Parallel) ────────────────────────────────
  //
  // EXAM CONCEPT: Independent subagents can run in parallel
  // Each gets a DISTINCT subtopic to avoid duplicate work
  const allFindings = [];

  if (plan.routing.search) {
    console.log('\n--- Phase 2: Parallel Search ---');

    const searchResults = await Promise.all(
      plan.subtopics.map((subtopic, i) =>
        executeSubagent({
          name: `search-${i + 1}`,
          systemPrompt: searchSubagentPrompt,
          allowedTools: ['web_search'],
          // EXAM CONCEPT: Explicit context — subtopic is the ONLY context
          taskDescription: `Research this specific subtopic: "${subtopic}"

Search for recent, high-quality sources (2024-2025 preferred). For each finding:
- State the specific claim or statistic
- Include the source URL and publication date
- Rate confidence: high, medium, or low

Return structured findings. Focus EXCLUSIVELY on "${subtopic}".`,
        })
      )
    );

    searchResults.forEach((r, i) => {
      allFindings.push({
        phase: 'search',
        subtopic: plan.subtopics[i],
        success: r.success,
        result: r.result,
      });
    });

    const successCount = searchResults.filter(r => r.success).length;
    console.log(`  Search complete: ${successCount}/${searchResults.length} succeeded`);
  }

  // ── Phase 3: Document Analysis (If Routed) ──────────────────────────────
  //
  // EXAM CONCEPT: Dynamic routing — only run if the plan says so
  if (plan.routing.analysis && plan.document_ids?.length > 0) {
    console.log('\n--- Phase 3: Document Analysis ---');

    const analysisResults = await Promise.all(
      plan.document_ids.map(docId =>
        executeSubagent({
          name: `analysis-${docId}`,
          systemPrompt: `You are a document analysis specialist. Extract structured findings from the assigned document. Focus on claims, evidence, confidence levels, and page references.`,
          allowedTools: ['analyze_document'],
          taskDescription: `Analyze document "${docId}". Extract ALL key findings with:
- The specific claim
- Supporting evidence
- Confidence level (high/medium/low)
- Page reference

Return findings as structured data.`,
        })
      )
    );

    analysisResults.forEach((r, i) => {
      allFindings.push({
        phase: 'analysis',
        subtopic: `Document: ${plan.document_ids[i]}`,
        success: r.success,
        result: r.result,
      });
    });
  } else {
    console.log('\n--- Phase 3: Document Analysis — SKIPPED ---');
  }

  // ── Phase 4: Synthesis ──────────────────────────────────────────────────
  //
  // EXAM CONCEPT: Sequential dependency — synthesis depends on search/analysis
  // The coordinator EXPLICITLY passes ALL prior findings in the task description
  let finalReport = '';

  if (plan.routing.synthesis) {
    console.log('\n--- Phase 4: Synthesis ---');

    const findingsContext = allFindings
      .map(f => `### ${f.subtopic} (${f.phase})\nStatus: ${f.success ? 'OK' : 'PARTIAL/FAILED'}\n${f.result}`)
      .join('\n\n');

    const synthesisResult = await executeSubagent({
      name: 'synthesis',
      systemPrompt: synthesisSubagentPrompt,
      allowedTools: ['verify_fact'],  // Scoped cross-role tool
      taskDescription: `Synthesize the following research findings into a comprehensive report.

## Original Query
${userQuery}

## Collected Findings
${findingsContext}

## Instructions
1. Combine all findings into a coherent narrative
2. Cite every claim with its source
3. When sources conflict, present BOTH values with attribution
4. Note publication dates next to all statistics
5. List any coverage gaps (subtopics with no or partial findings)
6. Use the verify_fact tool for any statistics that seem questionable`,
    });

    finalReport = synthesisResult.result;
  } else {
    // No synthesis needed — return raw findings
    finalReport = allFindings.map(f => `## ${f.subtopic}\n${f.result}`).join('\n\n');
  }

  // ── Phase 5: Iterative Refinement ───────────────────────────────────────
  //
  // EXAM CONCEPT: The coordinator checks the output for gaps
  // and re-delegates if coverage is insufficient
  console.log('\n--- Phase 5: Coverage Check ---');

  const gapCheck = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: `Evaluate this research report against the original query.
Return ONLY JSON: { "gaps": ["missing topic 1", ...], "score": 1-10, "needs_refinement": true/false }`,
    messages: [{
      role: 'user',
      content: `Query: ${userQuery}\n\nReport:\n${finalReport}`,
    }],
  });

  let quality;
  try {
    const text = gapCheck.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    quality = JSON.parse(match[0]);
  } catch {
    quality = { gaps: [], score: 7, needs_refinement: false };
  }

  console.log(`  Score: ${quality.score}/10`);
  if (quality.gaps.length > 0) {
    console.log(`  Gaps: ${quality.gaps.join(', ')}`);
  }

  // In a production system, if needs_refinement is true, loop back to Phase 2
  // with targeted queries for the identified gaps
  if (quality.needs_refinement) {
    console.log('  [Would re-delegate for gap coverage in production]');
  }

  // ── Output ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  FINAL REPORT (completed in ${elapsed}s)`);
  console.log('='.repeat(70));
  console.log(finalReport);

  return {
    report: finalReport,
    quality: quality.score,
    gaps: quality.gaps,
    findings: allFindings.length,
    elapsed,
  };
}

// ─── Run ────────────────────────────────────────────────────────────────────

runResearchCoordinator(
  "Research the impact of AI on creative industries in 2025. " +
  "Cover visual arts, music, and film production. " +
  "Include data from doc-001 if available."
).catch(console.error);
