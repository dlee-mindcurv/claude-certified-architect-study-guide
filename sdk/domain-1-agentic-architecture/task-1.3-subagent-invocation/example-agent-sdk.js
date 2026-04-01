/**
 * Task 1.3 — Subagent Invocation Using Agent SDK Patterns
 *
 * Exam relevance:
 * - AgentDefinition configuration for multiple subagent types
 * - allowedTools for scope restriction
 * - Explicit context passing (findings from prior agents injected into prompts)
 * - Parallel Task tool calls
 * - Isolation verification: subagents don't see parent context
 *
 * This example shows:
 * 1. Three distinct AgentDefinitions (search, analysis, synthesis)
 * 2. Each has a unique system prompt and tool set
 * 3. Parallel invocation of independent subagents
 * 4. Sequential invocation when there's a dependency
 * 5. Explicit context injection for downstream agents
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

// ─── AgentDefinition Configurations ─────────────────────────────────────────
//
// EXAM CONCEPT: Each AgentDefinition represents a distinct subagent type.
// The coordinator uses these definitions to spawn subagents via the Task tool.
//
// Key configuration surfaces:
// - name: unique identifier
// - model: can vary per subagent (use cheaper models for simpler tasks)
// - instructions: role-specific system prompt
// - tools: RESTRICTED to only what this subagent needs

/**
 * Search Subagent Definition
 *
 * Role: Find information via web search
 * Tools: web_search ONLY (cannot analyze documents or verify facts)
 * Context: Receives ONLY the subtopic to research
 */
const searchAgentDef = {
  name: 'search-subagent',
  model: MODEL,
  instructions: searchSubagentPrompt,

  // EXAM CONCEPT: allowedTools — this subagent can ONLY use web_search
  // It cannot call analyze_document or verify_fact, even if those tools
  // exist in the system. This enforces scope partitioning.
  allowedTools: ['web_search'],

  // Tool implementations (mapped from shared definitions)
  tools: researchToolDefinitions
    .filter(t => t.name === 'web_search')
    .map(t => ({
      ...t,
      execute: async (input) => {
        const result = executeResearchTool(t.name, input);
        return result.content;
      },
    })),
};

/**
 * Document Analysis Subagent Definition
 *
 * Role: Analyze specific documents and extract structured findings
 * Tools: analyze_document ONLY
 * Context: Receives document IDs and focus areas
 */
const analysisAgentDef = {
  name: 'analysis-subagent',
  model: MODEL,
  instructions: `You are a document analysis specialist. Your task is to analyze assigned documents
and extract structured findings.

## Instructions
- Use analyze_document to examine each assigned document
- For each finding, capture: claim, evidence, confidence, page reference
- Identify gaps where the document is silent on expected topics
- Return findings in structured JSON format

## Output Format
{
  "documentId": "doc-XXX",
  "title": "...",
  "findings": [
    { "claim": "...", "evidence": "...", "confidence": "high|medium|low", "page": N }
  ],
  "gaps": ["topics not covered"]
}`,

  allowedTools: ['analyze_document'],

  tools: researchToolDefinitions
    .filter(t => t.name === 'analyze_document')
    .map(t => ({
      ...t,
      execute: async (input) => {
        const result = executeResearchTool(t.name, input);
        return result.content;
      },
    })),
};

/**
 * Synthesis Subagent Definition
 *
 * Role: Combine findings from search and analysis into a coherent report
 * Tools: verify_fact ONLY (scoped cross-role tool for lightweight fact-checking)
 * Context: Receives ALL findings from prior agents (explicitly passed)
 */
const synthesisAgentDef = {
  name: 'synthesis-subagent',
  model: MODEL,
  instructions: synthesisSubagentPrompt,

  // EXAM CONCEPT: "Scoped cross-role tool"
  // verify_fact is a lightweight tool that lets the synthesis agent do
  // simple fact-checks without needing the full web_search capability.
  // This is more efficient than routing back to the coordinator.
  allowedTools: ['verify_fact'],

  tools: researchToolDefinitions
    .filter(t => t.name === 'verify_fact')
    .map(t => ({
      ...t,
      execute: async (input) => {
        const result = executeResearchTool(t.name, input);
        return result.content;
      },
    })),
};

// ─── Subagent Executor ──────────────────────────────────────────────────────
//
// EXAM CONCEPT: This simulates what the Agent SDK's Task tool does internally.
// When the coordinator makes a Task tool call, the SDK:
// 1. Looks up the AgentDefinition by name
// 2. Creates a NEW conversation (no inherited history)
// 3. Runs a complete agentic loop with the subagent's config
// 4. Returns the final text to the coordinator

async function invokeSubagent(agentDef, taskDescription) {
  console.log(`\n  [Task: ${agentDef.name}]`);
  console.log(`  Input: ${taskDescription.substring(0, 120)}...`);

  // EXAM KEY CONCEPT: Fresh message history = isolated context
  // The subagent does NOT see the coordinator's conversation
  const messages = [{ role: 'user', content: taskDescription }];

  const toolDefs = agentDef.tools.map(({ execute, ...def }) => def);
  let turnCount = 0;
  const maxTurns = 10;

  while (true) {
    if (++turnCount > maxTurns) {
      return '[Subagent turn limit reached]';
    }

    const response = await client.messages.create({
      model: agentDef.model,
      max_tokens: 4096,
      system: agentDef.instructions,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      console.log(`  [${agentDef.name}] Done (${turnCount} turns)`);
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];

      for (const block of response.content.filter(b => b.type === 'tool_use')) {
        const tool = agentDef.tools.find(t => t.name === block.name);

        if (!tool) {
          // EXAM CONCEPT: If a subagent tries to call a tool it doesn't have,
          // that's an architecture error. In the SDK, allowedTools prevents this.
          console.error(`  [${agentDef.name}] Attempted unauthorized tool: ${block.name}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Tool ${block.name} is not available to this agent` }),
            is_error: true,
          });
          continue;
        }

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

// ─── Demonstration: Parallel + Sequential Invocation ────────────────────────

async function demonstrateSubagentInvocation() {
  console.log('='.repeat(60));
  console.log('Task 1.3 — Subagent Invocation Patterns');
  console.log('='.repeat(60));

  // ── Pattern 1: Parallel Invocation ──────────────────────────────────────
  //
  // EXAM CONCEPT: When subtopics are independent, spawn subagents in parallel.
  // In the Agent SDK, this means making multiple Task tool calls in one
  // coordinator response. The SDK runs them concurrently.
  console.log('\n--- Pattern 1: Parallel Search Subagents ---');
  console.log('(Coordinator spawns 2 search agents simultaneously)\n');

  const [searchResult1, searchResult2] = await Promise.all([
    invokeSubagent(
      searchAgentDef,
      'Research "AI in visual arts" — search for recent sources on how AI is being used in digital art, graphic design, and image generation. Return structured findings.'
    ),
    invokeSubagent(
      searchAgentDef,
      'Research "AI in music production" — search for recent sources on AI-powered music composition, production tools, and industry impact. Return structured findings.'
    ),
  ]);

  console.log('\nSearch 1 result preview:', searchResult1.substring(0, 200));
  console.log('\nSearch 2 result preview:', searchResult2.substring(0, 200));

  // ── Pattern 2: Sequential with Explicit Context ─────────────────────────
  //
  // EXAM CONCEPT: When a downstream agent needs upstream results, invoke
  // sequentially and pass findings EXPLICITLY through the task description.
  console.log('\n--- Pattern 2: Sequential with Explicit Context ---');
  console.log('(Synthesis agent receives search findings in its prompt)\n');

  // EXAM KEY CONCEPT: Explicit context passing
  // The synthesis agent gets ALL prior findings through its task description.
  // It does NOT see the coordinator's conversation or the search subagents'
  // internal tool calls. It only sees the final outputs.
  const synthesisResult = await invokeSubagent(
    synthesisAgentDef,
    `Synthesize these research findings into a report:

## Findings from Search Agent 1: AI in Visual Arts
${searchResult1}

## Findings from Search Agent 2: AI in Music Production
${searchResult2}

## Instructions
- Cite every claim with its source
- Present conflicting data from BOTH sources
- Note publication dates
- Identify coverage gaps`
  );

  console.log('\n' + '='.repeat(60));
  console.log('SYNTHESIZED REPORT');
  console.log('='.repeat(60));
  console.log(synthesisResult);

  // ── Pattern 3: Document Analysis (Independent) ──────────────────────────
  console.log('\n--- Pattern 3: Document Analysis Subagent ---');

  const analysisResult = await invokeSubagent(
    analysisAgentDef,
    'Analyze document doc-001. Extract all key findings with evidence and confidence levels.'
  );

  console.log('\nAnalysis result preview:', analysisResult.substring(0, 200));

  return { searchResult1, searchResult2, synthesisResult, analysisResult };
}

// ─── Run ────────────────────────────────────────────────────────────────────

demonstrateSubagentInvocation().catch(console.error);
