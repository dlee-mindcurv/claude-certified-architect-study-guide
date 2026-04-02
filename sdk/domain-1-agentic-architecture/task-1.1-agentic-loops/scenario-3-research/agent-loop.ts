/**
 * Scenario 3: Research Agent -- Single-Agent Agentic Loop via Agent SDK
 *
 * Exam relevance (Task 1.1):
 * - Demonstrates an agentic loop in a research/knowledge context
 * - Same query() pattern as the CSR scenario, different domain
 * - Uses research tools (web_search, analyze_document, verify_fact)
 *
 * EXAM KEY CONCEPT:
 *   The agentic loop structure is IDENTICAL across scenarios. Only the
 *   tools, system prompt, and domain logic change. query() abstracts
 *   the loop the same way regardless of domain.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../../../shared/tools/research-tools.js';

// ─── Research Agent System Prompt ───────────────────────────────────────────

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

// ─── Research Agent via query() ─────────────────────────────────────────────

async function runResearchAgent(researchQuery: string): Promise<string> {
  console.log('\n' + '='.repeat(60));
  console.log('Research Agent -- Scenario 3 (Agent SDK)');
  console.log('='.repeat(60));
  console.log(`\nQuery: ${researchQuery}\n`);

  let finalText = '';

  // EXAM KEY CONCEPT: Same query() pattern as CSR, different tools and prompt
  for await (const message of query({
    prompt: researchQuery,
    options: {
      systemPrompt: researchAgentPrompt,

      // researchServer bundles: web_search, analyze_document, verify_fact
      mcpServers: {
        research: researchServer,
      },

      allowedTools: [
        'mcp__research__web_search',
        'mcp__research__analyze_document',
        'mcp__research__verify_fact',
      ],

      maxTurns: 20,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  console.log(`\nResearch Report:\n${finalText}`);
  console.log('\n--- Research complete ---');
  return finalText;
}

// ─── Run ────────────────────────────────────────────────────────────────────

runResearchAgent(
  "Research the impact of AI on creative industries in 2025. " +
  "Include data on visual arts, music production, and film. " +
  "Cite all sources and note any conflicting statistics."
).catch(console.error);
