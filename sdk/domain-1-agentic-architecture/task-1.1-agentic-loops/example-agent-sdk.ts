/**
 * Task 1.1 -- Agentic Loop Using @anthropic-ai/claude-agent-sdk
 *
 * Exam relevance:
 * - The Agent SDK abstracts the raw agentic loop into query()
 * - query() returns an AsyncGenerator of SDKMessage objects
 * - The SDK manages stop_reason checks, tool dispatch, and message history
 * - You configure: tools (via MCP servers), system prompt, hooks
 *
 * EXAM KEY CONCEPT:
 *   query() handles the while(true) loop internally. You iterate messages
 *   and extract the final result. The same stop_reason-driven loop from
 *   the raw API is happening under the hood.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';

// ─── Running the Agent with query() ───────────────────────────────────────

async function runCsrAgent(userMessage: string): Promise<string> {
  console.log(`\nUser: ${userMessage}\n`);

  // EXAM KEY CONCEPT: query() replaces the manual while(true) loop.
  // It yields SDKMessage objects as the agent works through tool calls.
  // When the agent finishes, a message with type 'result' and
  // subtype 'success' contains the final text.

  let finalText = '';

  for await (const message of query({
    prompt: userMessage,
    options: {
      // System prompt configures agent behavior
      systemPrompt: csrSystemPrompt,

      // MCP servers provide tools — csrServer bundles all CSR tools
      // Tool names become: mcp__csr__get_customer, mcp__csr__lookup_order, etc.
      mcpServers: {
        csr: csrServer,
      },

      // Allow all CSR tools to run without user confirmation
      allowedTools: [
        'mcp__csr__get_customer',
        'mcp__csr__lookup_order',
        'mcp__csr__process_refund',
        'mcp__csr__escalate_to_human',
      ],

      // Safety limit on turns
      maxTurns: 15,
    },
  })) {
    // EXAM KEY CONCEPT: The message stream includes tool calls, results,
    // and the final answer. Check for the 'result' type to get the output.
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  console.log(`Agent: ${finalText}`);
  return finalText;
}

// ─── Comparison: Raw API vs Agent SDK ─────────────────────────────────────
//
// ┌──────────────────────┬──────────────────────┬────────────────────────────┐
// │ Concern               │ Raw API               │ Agent SDK                  │
// ├──────────────────────┼──────────────────────┼────────────────────────────┤
// │ Agentic loop          │ You write while(true) │ query() manages internally │
// │ stop_reason check     │ You implement it      │ SDK does it automatically  │
// │ Tool execution        │ You dispatch manually  │ SDK calls MCP tools        │
// │ Message accumulation  │ You push to array     │ SDK manages the array      │
// │ Hooks/middleware       │ You add if/else       │ Declarative hook config    │
// │ System prompt          │ messages.create param │ options.systemPrompt       │
// └──────────────────────┴──────────────────────┴────────────────────────────┘
//
// EXAM KEY POINT: Both approaches use the SAME underlying pattern.
// The Agent SDK is syntactic sugar over the raw API loop.

// ─── Run ────────────────────────────────────────────────────────────────────

// SDK
runCsrAgent(
  "I need to return my order ORD-5001, my email is alice@example.com"
).catch(console.error);
