/**
 * Scenario 1: CSR Agent — Full Agentic Loop
 *
 * Exam relevance (Task 1.1):
 * - Complete single-agent agentic loop with all 4 CSR tools
 * - Demonstrates multi-turn resolution (verify → lookup → refund)
 * - Uses the CSR system prompt with escalation criteria
 * - stop_reason-driven loop control
 *
 * This scenario tests the agent's ability to:
 * 1. Follow the required workflow (verify customer FIRST)
 * 2. Handle multi-step tool chains (get_customer → lookup_order → process_refund)
 * 3. Decide between autonomous resolution and escalation
 * 4. Handle tool errors (transient failures, permission errors)
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../../shared/prompts/csr-system-prompt.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 15;

// ─── Agentic Loop for CSR Scenario ──────────────────────────────────────────

async function runCsrAgent(userMessage) {
  console.log('\n' + '='.repeat(60));
  console.log('CSR Agent — Scenario 1');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  const messages = [{ role: 'user', content: userMessage }];

  // Track tool calls for observability (useful for Task 1.4 enforcement)
  const toolCallLog = [];
  let turnCount = 0;

  while (true) {
    // Safety limit — logs a warning, does not silently truncate
    if (++turnCount > MAX_TURNS) {
      console.warn(
        `[SAFETY] Max turns (${MAX_TURNS}) reached. Agent may not have completed resolution.`
      );
      break;
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: csrSystemPrompt,
      tools: csrToolDefinitions,
      messages,
    });

    // ── stop_reason-driven control flow ───────────────────────────────────

    if (response.stop_reason === 'end_turn') {
      // Claude has finished — extract the final response for the customer
      const finalText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      console.log(`\nAgent: ${finalText}`);
      console.log(`\n--- Resolution complete in ${turnCount} turns ---`);
      console.log('Tool call sequence:', toolCallLog.map(t => t.name).join(' → '));
      return { text: finalText, toolCalls: toolCallLog, turns: turnCount };
    }

    if (response.stop_reason === 'tool_use') {
      // Append the assistant message (contains tool_use blocks)
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool call
      const toolResults = [];
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      for (const toolUse of toolUseBlocks) {
        console.log(`  [Turn ${turnCount}] ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

        // Execute the tool
        const result = executeCsrTool(toolUse.name, toolUse.input);

        // Log for observability
        toolCallLog.push({
          name: toolUse.name,
          input: toolUse.input,
          isError: result.isError || false,
          turn: turnCount,
        });

        // Parse result for display
        const parsed = JSON.parse(result.content);
        if (result.isError) {
          console.log(`    ERROR [${parsed.errorCategory}]: ${parsed.message}`);
        } else {
          console.log(`    OK: ${result.content.substring(0, 80)}...`);
        }

        // Format tool result for the API
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      // Send tool results back to Claude
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop_reason
    console.error(`Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }
}

// ─── Test Cases ─────────────────────────────────────────────────────────────

async function main() {
  // Test Case 1: Standard refund flow (verify → lookup → refund)
  // Expected: 3-4 tool calls, autonomous resolution
  console.log('\n\n>>> TEST CASE 1: Standard Refund <<<');
  await runCsrAgent(
    "I need to return my order ORD-5001, my email is alice@example.com"
  );

  // Test Case 2: Escalation — customer requests human agent
  // Expected: 0-1 tool calls, immediate escalation
  console.log('\n\n>>> TEST CASE 2: Human Agent Request <<<');
  await runCsrAgent(
    "I'd like to speak with a real person please."
  );

  // Test Case 3: Policy exception — competitor price match
  // Expected: escalation (policy gap, not a tool error)
  console.log('\n\n>>> TEST CASE 3: Policy Exception <<<');
  await runCsrAgent(
    "I saw this item cheaper on Amazon. Can you match their price? My email is bob@example.com"
  );
}

main().catch(console.error);
