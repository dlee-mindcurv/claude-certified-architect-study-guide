/**
 * Task 1.2 — Coordinator-Subagent Pattern Using Agent SDK Concepts
 *
 * Exam relevance:
 * - Hub-and-spoke topology: coordinator manages all inter-subagent communication
 * - Task tool: how the Agent SDK invokes subagents
 * - Dynamic routing: not every query needs every subagent
 * - Iterative refinement: coordinator checks for coverage gaps
 * - Context is EXPLICIT: subagents do NOT inherit coordinator's history
 *
 * This reference implementation demonstrates:
 * 1. Coordinator AgentDefinition with Task tool calls for subagent invocation
 * 2. Subagent AgentDefinitions with restricted tools and isolated context
 * 3. Dynamic query decomposition and routing
 * 4. Parallel subagent spawning (multiple Task calls in one response)
 * 5. Coverage gap detection and iterative re-delegation
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { researchToolDefinitions, executeResearchTool } from '../../../shared/tools/research-tools.js';
import {
  researchCoordinatorPrompt,
  searchSubagentPrompt,
  synthesisSubagentPrompt,
} from '../../../shared/prompts/research-coordinator.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Subagent Definitions ───────────────────────────────────────────────────
//
// EXAM CONCEPT: Each subagent is defined with its own:
// - System prompt (instructions specific to its role)
// - Tool restrictions (allowedTools limits what it can call)
// - Isolated context (no inherited conversation history)

/**
 * EXAM CONCEPT: AgentDefinition for Subagents
 *
 * In the Agent SDK, subagents are defined as separate AgentDefinitions.
 * The coordinator invokes them via the Task tool, which:
 * 1. Creates a NEW conversation (fresh message history)
 * 2. Uses the subagent's system prompt, not the coordinator's
 * 3. Only provides the tools listed in the subagent's definition
 * 4. Returns the subagent's final response to the coordinator
 */
const searchSubagentDef = {
  name: 'search-subagent',
  model: MODEL,
  instructions: searchSubagentPrompt,
  // allowedTools restricts this subagent to web_search ONLY
  // It cannot call analyze_document or verify_fact
  tools: researchToolDefinitions
    .filter(t => t.name === 'web_search')
    .map(t => ({
      ...t,
      execute: async (input) => executeResearchTool(t.name, input).content,
    })),
};

const analysisSubagentDef = {
  name: 'analysis-subagent',
  model: MODEL,
  instructions: `You are a document analysis agent. Analyze documents and extract structured findings.
Return findings as JSON: { "documentId": "...", "findings": [...], "gaps": [...] }`,
  // Only has access to analyze_document
  tools: researchToolDefinitions
    .filter(t => t.name === 'analyze_document')
    .map(t => ({
      ...t,
      execute: async (input) => executeResearchTool(t.name, input).content,
    })),
};

const synthesisSubagentDef = {
  name: 'synthesis-subagent',
  model: MODEL,
  instructions: synthesisSubagentPrompt,
  // Has verify_fact for lightweight fact-checking during synthesis
  // Does NOT have web_search or analyze_document
  tools: researchToolDefinitions
    .filter(t => t.name === 'verify_fact')
    .map(t => ({
      ...t,
      execute: async (input) => executeResearchTool(t.name, input).content,
    })),
};

// ─── Subagent Runner (Simulates Agent SDK Task Tool) ────────────────────────
//
// EXAM CONCEPT: The Task tool in the Agent SDK spawns a subagent as an
// independent conversation. The coordinator passes context EXPLICITLY
// through the task description — the subagent does NOT see the coordinator's
// conversation history.

async function runSubagent(subagentDef, taskDescription) {
  console.log(`\n  [Subagent: ${subagentDef.name}] Starting...`);
  console.log(`  Task: ${taskDescription.substring(0, 100)}...`);

  // Fresh message history — subagent does NOT inherit coordinator's messages
  // EXAM KEY CONCEPT: This is what "isolated context" means
  const messages = [{ role: 'user', content: taskDescription }];

  const toolDefs = subagentDef.tools.map(({ execute, ...def }) => def);
  let turnCount = 0;
  const MAX_TURNS = 10;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`  [${subagentDef.name}] Safety limit reached`);
      break;
    }

    const response = await client.messages.create({
      model: subagentDef.model,
      max_tokens: 4096,
      system: subagentDef.instructions,
      tools: toolDefs,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      console.log(`  [${subagentDef.name}] Complete (${turnCount} turns)`);
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];

      for (const block of response.content.filter(b => b.type === 'tool_use')) {
        const tool = subagentDef.tools.find(t => t.name === block.name);
        const output = await tool.execute(block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: output,
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  return '[Subagent did not complete]';
}

// ─── Coordinator ────────────────────────────────────────────────────────────
//
// EXAM CONCEPT: The coordinator is the hub in hub-and-spoke. It:
// 1. Analyzes the query and decomposes into subtopics
// 2. Routes to the relevant subagents (dynamic, not always all)
// 3. Passes explicit context to each subagent
// 4. Aggregates results
// 5. Checks for coverage gaps and re-delegates if needed

async function runCoordinator(userQuery) {
  console.log('\n' + '='.repeat(60));
  console.log('Research Coordinator — Agent SDK Pattern');
  console.log('='.repeat(60));
  console.log(`\nQuery: ${userQuery}\n`);

  // ── Step 1: Decompose the query ─────────────────────────────────────────
  // The coordinator uses Claude to analyze the query and plan the research
  console.log('Phase 1: Query Decomposition');

  const decompositionResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a research coordinator. Given a research query, decompose it into specific subtopics that should be researched independently.

Return a JSON object with this structure:
{
  "subtopics": ["subtopic 1", "subtopic 2", ...],
  "needs_document_analysis": true/false,
  "document_ids": ["doc-001", ...] (if applicable),
  "routing_rationale": "why these subtopics were chosen"
}

CRITICAL: Cover ALL relevant domains, not just the obvious ones.`,
    messages: [{ role: 'user', content: userQuery }],
  });

  const decompositionText = decompositionResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Parse the decomposition (handle potential JSON in markdown code blocks)
  let decomposition;
  try {
    const jsonMatch = decompositionText.match(/\{[\s\S]*\}/);
    decomposition = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback if JSON parsing fails
    decomposition = {
      subtopics: [userQuery],
      needs_document_analysis: false,
      document_ids: [],
      routing_rationale: 'Using original query as single subtopic (parsing fallback)',
    };
  }

  console.log(`  Subtopics: ${decomposition.subtopics.join(', ')}`);
  console.log(`  Routing: ${decomposition.routing_rationale}`);

  // ── Step 2: Spawn search subagents in parallel ──────────────────────────
  //
  // EXAM CONCEPT: Parallel Task tool calls
  // In the Agent SDK, the coordinator would return multiple Task tool calls
  // in a single response. The SDK runs them in parallel.
  //
  // Here we simulate that with Promise.all().
  console.log('\nPhase 2: Parallel Search');

  const searchPromises = decomposition.subtopics.map(subtopic =>
    runSubagent(searchSubagentDef, `Research the following specific subtopic: "${subtopic}"

Search for recent, credible sources. Return structured findings with:
- Specific claims and statistics
- Source URLs and publication dates
- Confidence levels

Focus ONLY on: ${subtopic}
Do NOT research other subtopics.`)
  );

  const searchResults = await Promise.all(searchPromises);
  console.log(`\n  Search phase complete: ${searchResults.length} subagent(s) returned`);

  // ── Step 3: Document analysis (if needed) ───────────────────────────────
  //
  // EXAM CONCEPT: Dynamic routing — only invoke analysis subagent if needed
  let analysisResults = [];
  if (decomposition.needs_document_analysis && decomposition.document_ids?.length > 0) {
    console.log('\nPhase 3: Document Analysis');

    const analysisPromises = decomposition.document_ids.map(docId =>
      runSubagent(analysisSubagentDef, `Analyze document ${docId}. Extract all key findings with evidence and confidence levels.`)
    );

    analysisResults = await Promise.all(analysisPromises);
    console.log(`  Analysis phase complete: ${analysisResults.length} document(s) analyzed`);
  } else {
    console.log('\nPhase 3: Document Analysis — SKIPPED (not needed for this query)');
  }

  // ── Step 4: Synthesis ───────────────────────────────────────────────────
  //
  // EXAM CONCEPT: Explicit context passing
  // The synthesis subagent receives ALL findings from prior phases through
  // its task description. It does NOT inherit the coordinator's history.
  console.log('\nPhase 4: Synthesis');

  const synthesisContext = `Synthesize the following research findings into a comprehensive report.

## Search Findings
${searchResults.map((r, i) => `### Subtopic ${i + 1}: ${decomposition.subtopics[i]}\n${r}`).join('\n\n')}

${analysisResults.length > 0 ? `## Document Analysis Findings\n${analysisResults.join('\n\n')}` : ''}

## Requirements
- Preserve all source citations
- Present conflicting statistics from BOTH sources (do not pick one)
- Note publication dates alongside statistics
- Identify any coverage gaps`;

  const synthesisResult = await runSubagent(synthesisSubagentDef, synthesisContext);

  // ── Step 5: Coverage gap check ──────────────────────────────────────────
  //
  // EXAM CONCEPT: Iterative refinement loop
  // The coordinator reviews the synthesis for gaps and re-delegates if needed
  console.log('\nPhase 5: Coverage Gap Check');

  const gapCheckResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You are a research quality reviewer. Given a research report and the original query, identify any coverage gaps.

Return JSON: { "has_gaps": true/false, "gaps": ["gap 1", ...], "quality_score": 1-10 }`,
    messages: [{
      role: 'user',
      content: `Original query: ${userQuery}\n\nReport:\n${synthesisResult}`,
    }],
  });

  const gapText = gapCheckResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  let gapCheck;
  try {
    const jsonMatch = gapText.match(/\{[\s\S]*\}/);
    gapCheck = JSON.parse(jsonMatch[0]);
  } catch {
    gapCheck = { has_gaps: false, gaps: [], quality_score: 7 };
  }

  if (gapCheck.has_gaps && gapCheck.gaps.length > 0) {
    console.log(`  Gaps found: ${gapCheck.gaps.join(', ')}`);
    console.log('  (In production, would re-delegate to search subagents for these gaps)');
    // In a full implementation, you would loop back to Phase 2 with targeted queries
  } else {
    console.log('  No significant gaps found');
  }

  console.log(`  Quality score: ${gapCheck.quality_score}/10`);

  // ── Final Output ────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('FINAL REPORT');
  console.log('='.repeat(60));
  console.log(synthesisResult);

  return synthesisResult;
}

// ─── Run ────────────────────────────────────────────────────────────────────

runCoordinator(
  "Research the impact of AI on creative industries in 2025. " +
  "Cover visual arts, music production, and film."
).catch(console.error);
