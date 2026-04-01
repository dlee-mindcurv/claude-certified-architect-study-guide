/**
 * Task 1.1 — Agentic Loop Using Claude Agent SDK (Conceptual Reference)
 *
 * Exam relevance:
 * - Understand how the Agent SDK abstracts the raw agentic loop
 * - Know the key configuration surfaces: AgentDefinition, hooks, tools
 * - Recognize that the SDK still uses stop_reason internally
 *
 * NOTE: This file is a well-documented reference implementation showing
 * Agent SDK patterns. The actual @anthropic-ai/agent-sdk package may not
 * be installed in this project. The code below illustrates the conceptual
 * API and what the SDK handles for you vs. what you configure.
 */

import 'dotenv/config';
import { csrToolDefinitions, executeCsrTool } from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';

// ─── What the Agent SDK Does for You ────────────────────────────────────────
//
// When you use the Agent SDK, you do NOT write the while(true) loop yourself.
// The SDK manages:
//   1. The agentic loop (send → check stop_reason → execute tools → loop)
//   2. Message history accumulation
//   3. Tool execution dispatch
//   4. Hook invocation at lifecycle points
//
// You configure:
//   - AgentDefinition (system prompt, model, tools, hooks)
//   - Tool implementations
//   - Hook logic (pre/post tool use, guardrails)

// ─── AgentDefinition ────────────────────────────────────────────────────────
//
// The AgentDefinition is the primary configuration object for an Agent SDK agent.
// It declares WHAT the agent can do, and the SDK handles HOW to run the loop.

/**
 * EXAM CONCEPT: AgentDefinition
 *
 * An AgentDefinition is a declarative configuration that includes:
 * - name: Identifier for the agent
 * - model: Which Claude model to use
 * - instructions: The system prompt (equivalent to the "system" parameter)
 * - tools: Array of tool definitions the agent can call
 * - hooks: Lifecycle callbacks for observability and control
 */
const csrAgentDefinition = {
  name: 'csr-agent',
  model: 'claude-sonnet-4-20250514',

  // The system prompt — same as what we'd pass to messages.create()
  instructions: csrSystemPrompt,

  // Tools available to this agent
  // EXAM NOTE: In the Agent SDK, tools are declared in the definition
  // and the SDK handles passing them to the API automatically
  tools: csrToolDefinitions.map(tool => ({
    ...tool,
    // The SDK needs an execute function for each tool
    execute: async (input) => {
      const result = executeCsrTool(tool.name, input);
      return result.content;
    },
  })),

  // ── Hooks ───────────────────────────────────────────────────────────────
  //
  // EXAM CONCEPT: Hooks are lifecycle callbacks that fire at specific points
  // in the agentic loop. They let you add observability, guardrails, and
  // enforcement WITHOUT modifying the core loop logic.
  //
  // Key hook points:
  //   - PostToolUse: Fires AFTER a tool executes, BEFORE results go to Claude
  //   - PreToolUse:  Fires BEFORE a tool executes (for validation/blocking)
  //   - OnTurnStart: Fires at the beginning of each loop iteration
  //   - OnTurnEnd:   Fires at the end of each loop iteration

  hooks: {
    /**
     * PostToolUse hook — fires after each tool execution.
     *
     * EXAM RELEVANCE (Task 1.5): This is where you implement:
     * - Logging and observability
     * - Result validation
     * - Prerequisite enforcement (Task 1.4)
     *
     * The hook receives the tool name, input, and output.
     * It can modify the output or throw to abort the loop.
     */
    postToolUse: async ({ toolName, toolInput, toolOutput }) => {
      // Log every tool call for observability
      console.log(`[Hook:PostToolUse] ${toolName}`, {
        input: toolInput,
        outputPreview: toolOutput.substring(0, 80),
      });

      // Example: Track which tools have been called for prerequisite enforcement
      // (See Task 1.4 for full implementation)
    },
  },
};

// ─── Running the Agent ──────────────────────────────────────────────────────
//
// With the Agent SDK, running an agent is a single function call.
// The SDK manages the entire agentic loop internally.

async function runWithAgentSdk(userMessage) {
  console.log(`\nUser: ${userMessage}\n`);

  // ── Conceptual SDK Usage ────────────────────────────────────────────────
  //
  // In the actual Agent SDK, you would do:
  //
  //   import { Agent } from '@anthropic-ai/agent-sdk';
  //   const agent = new Agent(csrAgentDefinition);
  //   const result = await agent.run(userMessage);
  //   console.log(result.text);
  //
  // What happens inside agent.run():
  //
  // 1. SDK creates the initial messages array: [{ role: "user", content: userMessage }]
  // 2. SDK calls client.messages.create() with the agent's model, tools, and system prompt
  // 3. SDK checks response.stop_reason:
  //    - "tool_use" → SDK executes each tool via the tool's execute() function
  //                 → SDK fires postToolUse hook for each result
  //                 → SDK appends assistant message + tool results to messages
  //                 → SDK loops back to step 2
  //    - "end_turn" → SDK extracts the final text and returns it
  // 4. SDK returns a structured result object with the final text and metadata
  //
  // EXAM KEY INSIGHT: The SDK uses the exact same stop_reason-driven loop
  // as the raw API example. It just abstracts it so you don't write it yourself.

  // ── Manual Simulation (since SDK may not be installed) ──────────────────
  // This simulates what the SDK does internally, using the raw API

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic();

  const messages = [{ role: 'user', content: userMessage }];
  let turnCount = 0;
  const MAX_TURNS = 15;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`[SDK] Safety limit reached after ${MAX_TURNS} turns`);
      break;
    }

    // Step 2: SDK calls the API
    const response = await client.messages.create({
      model: csrAgentDefinition.model,
      max_tokens: 4096,
      system: csrAgentDefinition.instructions,
      tools: csrToolDefinitions,
      messages,
    });

    // Step 3: SDK checks stop_reason (EXACTLY as in the raw API example)
    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      console.log(`Agent: ${text}`);
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content.filter(b => b.type === 'tool_use')) {
        // SDK looks up the tool's execute() function from the definition
        const toolDef = csrAgentDefinition.tools.find(t => t.name === block.name);
        const output = await toolDef.execute(block.input);

        // SDK fires the postToolUse hook
        if (csrAgentDefinition.hooks?.postToolUse) {
          await csrAgentDefinition.hooks.postToolUse({
            toolName: block.name,
            toolInput: block.input,
            toolOutput: output,
          });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: output,
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }
}

// ─── Comparison: Raw API vs Agent SDK ───────────────────────────────────────
//
// ┌──────────────────────┬──────────────────────┬────────────────────────────┐
// │ Concern               │ Raw API               │ Agent SDK                  │
// ├──────────────────────┼──────────────────────┼────────────────────────────┤
// │ Agentic loop          │ You write while(true) │ SDK manages internally     │
// │ stop_reason check     │ You implement it      │ SDK does it automatically  │
// │ Tool execution        │ You dispatch manually  │ SDK calls tool.execute()   │
// │ Message accumulation  │ You push to array     │ SDK manages the array      │
// │ Hooks/middleware       │ You add if/else       │ Declarative hook config    │
// │ System prompt          │ messages.create param │ AgentDefinition.instructions│
// │ Error handling        │ You implement         │ SDK provides defaults      │
// └──────────────────────┴──────────────────────┴────────────────────────────┘
//
// EXAM KEY POINT: Both approaches use the SAME underlying pattern.
// The Agent SDK is syntactic sugar over the raw API loop. Understanding
// the raw loop is essential even when using the SDK.

// ─── Run ────────────────────────────────────────────────────────────────────

runWithAgentSdk(
  "I need to return my order ORD-5001, my email is alice@example.com"
).catch(console.error);
