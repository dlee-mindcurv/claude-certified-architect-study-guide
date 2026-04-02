/**
 * Task 1.4 — Enforcement & Handoff Using Raw @anthropic-ai/sdk
 *
 * Exam relevance:
 * - Manual implementation of prerequisite checking in the agentic loop
 * - Shows the SAME enforcement logic as the Agent SDK version, but
 *   implemented directly in the while(true) loop
 * - Demonstrates that enforcement is a code-level concern, not a
 *   prompt-level concern
 *
 * Key difference from Agent SDK version:
 * - No hooks abstraction — enforcement logic is inline in the loop
 * - Prerequisite state is managed manually (Set + conditions)
 * - Handoff summaries are constructed from accumulated state
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 15;

// ─── Prerequisite Definitions ───────────────────────────────────────────────

const PREREQUISITES = {
  process_refund: ['get_customer', 'lookup_order'],
  lookup_order: ['get_customer'],
  escalate_to_human: [],
  get_customer: [],
};

// ─── Prerequisite Checker ───────────────────────────────────────────────────
//
// EXAM CONCEPT: This function is the programmatic gate.
// It runs BEFORE every tool execution and can block the call.

function checkPrerequisites(toolName: string, completedTools: Set<string>): { allowed: boolean; missing?: string[]; message?: string } {
  const required = PREREQUISITES[toolName as keyof typeof PREREQUISITES];
  if (!required) return { allowed: true };

  const missing = required.filter(req => !completedTools.has(req));

  if (missing.length > 0) {
    return {
      allowed: false,
      missing,
      message: `Cannot call ${toolName}: missing prerequisites [${missing.join(', ')}]. ` +
        `Complete these steps first, then retry.`,
    };
  }

  return { allowed: true };
}

// ─── Agentic Loop with Inline Enforcement ───────────────────────────────────

async function runEnforcedAgentRawApi(userMessage: string) {
  console.log('\n' + '='.repeat(60));
  console.log('CSR Agent — Raw API with Prerequisite Gates');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  // Enforcement state
  const completedTools = new Set<string>();
  const toolCallLog: { tool: string; blocked: boolean; reason?: string; isError?: boolean; timestamp: string }[] = [];
  let verifiedCustomerId: string | null = null;
  let turnCount = 0;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`[SAFETY] Max turns reached`);
      break;
    }

    console.log(`\n--- Turn ${turnCount} ---`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: csrSystemPrompt,
      tools: csrToolDefinitions as Anthropic.Messages.Tool[],
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      console.log(`\nAgent: ${text}`);
      console.log(`\nEnforcement summary:`);
      console.log(`  Tools completed: ${[...completedTools].join(', ')}`);
      console.log(`  Total tool calls: ${toolCallLog.length}`);
      console.log(`  Gates triggered: ${toolCallLog.filter(l => l.blocked).length}`);

      return {
        text,
        completedTools: [...completedTools],
        toolCallLog,
        verifiedCustomerId,
      };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of response.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use')) {

        // ────────────────────────────────────────────────────────────────
        // PROGRAMMATIC ENFORCEMENT (inline in the loop)
        //
        // EXAM CONCEPT: This is where enforcement happens in the raw API
        // approach. It's the same logic as the Agent SDK's PreToolUse hook,
        // but implemented directly in the loop body.
        // ────────────────────────────────────────────────────────────────

        const prereqCheck = checkPrerequisites(block.name, completedTools);

        if (!prereqCheck.allowed) {
          // ── GATE BLOCKED ────────────────────────────────────────────
          // Return an error to Claude instead of executing the tool.
          // Claude will see the error and adjust its behavior.
          console.log(`  GATE BLOCKED: ${block.name} (missing: ${prereqCheck.missing!.join(', ')})`);

          toolCallLog.push({
            tool: block.name,
            blocked: true,
            reason: prereqCheck.message,
            timestamp: new Date().toISOString(),
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({
              error: prereqCheck.message,
              missingPrerequisites: prereqCheck.missing!,
              instruction: 'Please complete the missing steps first, then retry this action.',
            }),
            is_error: true,
          });
          continue;  // Skip to next tool_use block
        }

        // ── GATE PASSED — Execute the tool ────────────────────────────
        console.log(`  Executing: ${block.name}(${JSON.stringify(block.input)})`);
        const result = executeCsrTool(block.name, block.input as Record<string, unknown>);

        // Track successful calls for prerequisite state
        if (!result.isError) {
          completedTools.add(block.name);

          // Capture customer ID for consistency checking
          if (block.name === 'get_customer') {
            try {
              const parsed = JSON.parse(result.content);
              if (parsed.id) {
                verifiedCustomerId = parsed.id;
                console.log(`    Verified customer: ${verifiedCustomerId}`);
              }
            } catch {
              // Non-critical
            }
          }
        }

        toolCallLog.push({
          tool: block.name,
          blocked: false,
          isError: result.isError || false,
          timestamp: new Date().toISOString(),
        });

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
}

// ─── Comparison: Inline vs Hook-Based Enforcement ───────────────────────────
//
// ┌─────────────────────┬───────────────────────────┬────────────────────────────┐
// │ Aspect               │ Raw API (inline)           │ Agent SDK (hooks)           │
// ├─────────────────────┼───────────────────────────┼────────────────────────────┤
// │ Where enforcement    │ Inside the while loop     │ PreToolUse hook function    │
// │ lives                │                           │                            │
// ├─────────────────────┼───────────────────────────┼────────────────────────────┤
// │ Testability          │ Must test via full loop   │ Can test hook in isolation  │
// ├─────────────────────┼───────────────────────────┼────────────────────────────┤
// │ Reusability          │ Copy-paste between agents │ Compose hooks declaratively │
// ├─────────────────────┼───────────────────────────┼────────────────────────────┤
// │ Separation of        │ Mixed with loop logic     │ Clean separation            │
// │ concerns             │                           │                            │
// ├─────────────────────┼───────────────────────────┼────────────────────────────┤
// │ Same enforcement?    │ YES — identical behavior  │ YES — identical behavior    │
// └─────────────────────┴───────────────────────────┴────────────────────────────┘
//
// EXAM KEY POINT: Both approaches achieve the same result — PROGRAMMATIC
// enforcement that cannot be bypassed by the model. The hook approach is
// cleaner but the inline approach works equally well.

// ─── Run ────────────────────────────────────────────────────────────────────

async function main() {
  // Normal flow: get_customer → lookup_order → process_refund
  // All gates should pass
  console.log('\n>>> TEST: Normal refund flow <<<');
  await runEnforcedAgentRawApi(
    "I need to return order ORD-5001, my email is alice@example.com"
  );
}

main().catch(console.error);
