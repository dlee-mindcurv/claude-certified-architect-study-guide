/**
 * Scenario 1: CSR Agent -- Full Agentic Loop via Agent SDK
 *
 * Exam relevance (Task 1.1):
 * - Complete single-agent agentic loop using query()
 * - Demonstrates multi-turn resolution (verify -> lookup -> refund)
 * - Uses the CSR system prompt with escalation criteria
 * - query() handles stop_reason-driven loop control internally
 *
 * EXAM KEY CONCEPT:
 *   The for-await-of loop over query() replaces the manual while(true)
 *   loop from the raw API. The SDK still uses stop_reason internally,
 *   but you configure instead of implementing.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../../shared/prompts/csr-system-prompt.js';

// ─── CSR Agent via query() ─────────────────────────────────────────────────

async function runCsrAgent(userMessage: string): Promise<string> {
  console.log('\n' + '='.repeat(60));
  console.log('CSR Agent -- Scenario 1 (Agent SDK)');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  let finalText = '';

  for await (const message of query({
    prompt: userMessage,
    options: {
      systemPrompt: csrSystemPrompt,

      // csrServer bundles: get_customer, lookup_order, process_refund, escalate_to_human
      mcpServers: {
        csr: csrServer,
      },

      // Auto-approve all CSR tools (no user confirmation needed)
      allowedTools: [
        'mcp__csr__get_customer',
        'mcp__csr__lookup_order',
        'mcp__csr__process_refund',
        'mcp__csr__escalate_to_human',
      ],

      maxTurns: 15,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  console.log(`\nAgent: ${finalText}`);
  console.log('\n--- Resolution complete ---');
  return finalText;
}

// ─── Test Cases ─────────────────────────────────────────────────────────────

async function main() {
  // Test Case 1: Standard refund flow (verify -> lookup -> refund)
  console.log('\n\n>>> TEST CASE 1: Standard Refund <<<');
  await runCsrAgent(
    "I need to return my order ORD-5001, my email is alice@example.com"
  );

  // Test Case 2: Escalation -- customer requests human agent
  console.log('\n\n>>> TEST CASE 2: Human Agent Request <<<');
  await runCsrAgent(
    "I'd like to speak with a real person please."
  );

  // Test Case 3: Policy exception -- competitor price match
  console.log('\n\n>>> TEST CASE 3: Policy Exception <<<');
  await runCsrAgent(
    "I saw this item cheaper on Amazon. Can you match their price? My email is bob@example.com"
  );
}

main().catch(console.error);
