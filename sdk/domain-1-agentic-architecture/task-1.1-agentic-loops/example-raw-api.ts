/**
 * Task 1.1 — Agentic Loop Using Raw @anthropic-ai/sdk
 *
 * Exam relevance:
 * - The agentic loop is THE foundational pattern for all Claude agents
 * - stop_reason is the ONLY reliable signal for loop control
 * - This is tested in Scenarios 1 (CSR) and 3 (Research)
 *
 * This example demonstrates a complete, working agentic loop that:
 * 1. Sends a user message to Claude with CSR tools available
 * 2. Checks stop_reason (NOT text content) to decide whether to continue
 * 3. Executes tool calls and feeds results back to Claude
 * 4. Repeats until Claude returns stop_reason === "end_turn"
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import {csrToolDefinitions, executeCsrToolRaw} from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();  // Uses ANTHROPIC_API_KEY from environment
const MODEL = 'claude-sonnet-4-20250514';

/**
 * Safety limit for maximum loop iterations.
 *
 * EXAM NOTE: This is a SAFETY NET, not a design constraint.
 * The primary exit condition is always stop_reason === "end_turn".
 * If this limit is reached, it means something unexpected happened
 * and we log a warning rather than silently truncating.
 */
const MAX_TURNS = 15;

// ─── The Agentic Loop ───────────────────────────────────────────────────────

async function runAgentLoop(userMessage: string): Promise<string | undefined> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`User: ${userMessage}`);
  console.log('='.repeat(60));

  // Initialize the conversation with the user's message
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ];

  let turnCount = 0;

  // ── The Core Loop ──────────────────────────────────────────────────────
  // EXAM KEY CONCEPT: This loop is driven by stop_reason, not by parsing
  // Claude's text output or counting iterations.
  while (true) {

    // Safety limit check — logs a warning, does NOT silently truncate
    if (++turnCount > MAX_TURNS) {
      console.warn(
        `\n[WARNING] Safety limit reached after ${MAX_TURNS} turns. ` +
        `The agent may not have completed its work. Review the conversation.`
      );
      break;
    }

    console.log(`\n--- Turn ${turnCount} ---`);

    // Send the current conversation to Claude
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: csrSystemPrompt,
      tools: csrToolDefinitions as Anthropic.Messages.Tool[],
      messages,
    });

    console.log(`stop_reason: ${response.stop_reason}`);

    // ── Decision Point: Check stop_reason ────────────────────────────────
    //
    // CORRECT: Use stop_reason as the sole loop control signal
    //
    // ┌─────────────────┬────────────────────────────────────────────────┐
    // │ stop_reason      │ Action                                        │
    // ├─────────────────┼────────────────────────────────────────────────┤
    // │ "end_turn"       │ Claude is done → extract text, exit loop      │
    // │ "tool_use"       │ Claude wants tools → execute, feed back, loop │
    // │ "max_tokens"     │ Response truncated → handle gracefully        │
    // └─────────────────┴────────────────────────────────────────────────┘

    if (response.stop_reason === 'end_turn') {
      // ── EXIT: Claude has completed its response ─────────────────────
      const textBlocks = response.content.filter(
        (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
      );
      const finalText = textBlocks.map(b => b.text).join('\n');
      console.log(`\nAgent: ${finalText}`);
      return finalText;
    }

    if (response.stop_reason === 'tool_use') {
      // ── CONTINUE: Execute tools and feed results back ───────────────

      // Step 1: Append the assistant's response (includes tool_use blocks)
      messages.push({ role: 'assistant', content: response.content });

      // Step 2: Execute each tool call and collect results
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
      );

      // if the stop reason is "tool_use", then toolUseBlocks will be non-empty and you can look through each
      for (const toolUse of toolUseBlocks) {

        console.log('RESPONSE:', toolUse)

        console.log(`  Tool call: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

        // Execute the tool using our mock backend
        const result = executeCsrToolRaw(toolUse.name, toolUse.input as Record<string, unknown>);

        console.log(`  Result: ${result.content.substring(0, 100)}...`);

        // Format as a tool_result content block
        // EXAM NOTE: tool_result must reference the tool_use id
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      // Step 3: Append tool results as a "user" message
      // EXAM NOTE: Tool results are sent as role: "user" with type: "tool_result"
      messages.push({ role: 'user', content: toolResults });

      // Loop continues — Claude will process the tool results
      continue;
    }

    // ── Handle unexpected stop_reasons ─────────────────────────────────
    if (response.stop_reason === 'max_tokens') {
      console.warn('[WARNING] Response truncated due to max_tokens');
      // In production, you might resize context or increase max_tokens
      break;
    }

    // Unknown stop_reason — fail explicitly rather than silently
    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }
}

// ─── Anti-Patterns (DO NOT USE — shown for exam study) ──────────────────────
//
// ANTI-PATTERN 1: Parsing natural language for termination
// ❌ if (response.content[0].text.includes("Here's your answer")) break;
// Why: Claude can phrase completion differently every time.
//      "Let me know if you need anything else" vs "Here are the results"
//      vs no signal phrase at all. No reliable text pattern exists.
//
// ANTI-PATTERN 2: Arbitrary iteration cap as PRIMARY exit
// ❌ for (let i = 0; i < 5; i++) { ... }
// Why: Different queries need different numbers of tool calls.
//      A cap silently drops work in progress. Use stop_reason instead.
//
// ANTI-PATTERN 3: Checking text presence/length
// ❌ if (textBlocks.length > 0 && textBlocks[0].text.length > 100) break;
// Why: Claude can return text alongside tool_use blocks ("Let me look
//      that up for you" + tool call). Text presence ≠ completion.

// ─── Run the Example ────────────────────────────────────────────────────────

const userQuery =
  "please analyze the order ORD-5001, and the user details for customerId: C-1001 associated with that order ";

runAgentLoop(userQuery).catch(console.error);
