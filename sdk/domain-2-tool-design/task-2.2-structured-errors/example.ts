/**
 * Task 2.2 — Structured Error Handling in Tools
 *
 * Exam relevance:
 * - isError flag on tool results signals failure to the agent
 * - Error categories (transient/validation/business/permission) enable smart recovery
 * - isRetryable boolean prevents wasted retry attempts
 * - Structured metadata lets the agent decide: retry, fix input, explain, or escalate
 *
 * EXAM KEY CONCEPT:
 *   Generic errors ("Operation failed") give the agent no recovery path.
 *   Structured errors ({ errorCategory, isRetryable, message }) let the agent
 *   choose the RIGHT strategy: retry transient, fix validation, explain business,
 *   escalate permission.
 *
 * This example demonstrates:
 * 1. Tools that return structured errors with category + retryable flag
 * 2. System prompt that instructs the agent HOW to handle each category
 * 3. Three scenarios: business rule, permission, and validation errors
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { csrServer } from '../../../shared/tools/csr-tools.js';

// ─── System prompt with error-handling instructions ───────────────────────
// EXAM KEY CONCEPT: The system prompt must teach the agent how to interpret
// structured error responses. Without this, even structured errors are wasted.

const SYSTEM_PROMPT = `You are a customer support agent for an e-commerce company.

## Error Handling Instructions
When a tool call fails (returns an error), read the structured response carefully:
- errorCategory tells you WHY it failed
- isRetryable tells you whether trying again might help
- message gives you a human-readable explanation

Your recovery strategy depends on the error category:
- "transient": Temporary system issue. Apologize and suggest trying again later.
- "validation": Your input was wrong (bad format, missing field). Fix input and retry.
- "business": A business rule prevents this action. Explain the rule to the customer.
  Do NOT retry. Offer alternatives if possible.
- "permission": Not authorized. Verify customer identity. If mismatch persists, escalate.

## Critical Rules
1. ALWAYS verify customer identity via get_customer BEFORE order lookups or refunds.
2. Never retry a non-retryable error with the same input.
3. For business rule errors, explain the policy sympathetically.
4. For permission errors, verify identity before escalating.`;

// ─── Run Scenario ─────────────────────────────────────────────────────────

async function runScenario(label, userMessage) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scenario: ${label}`);
  console.log(`User: "${userMessage}"`);
  console.log('='.repeat(60));

  for await (const message of query({
    prompt: userMessage,
    options: {
      system: SYSTEM_PROMPT,
      mcpServers: [csrServer],
      maxTurns: 10,
      hooks: {
        postToolUse: async ({ toolName, toolInput, toolResult }) => {
          const shortInput = JSON.stringify(toolInput).substring(0, 80);
          console.log(`  Tool: ${toolName}(${shortInput})`);

          // Log structured error details when present
          if (toolResult?.isError) {
            try {
              const parsed = JSON.parse(toolResult.content?.[0]?.text || '{}');
              console.log(`  ERROR [${parsed.errorCategory}]: ${parsed.message}`);
              console.log(`    isRetryable: ${parsed.isRetryable}`);
            } catch { /* non-JSON error */ }
          }
        },
      },
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      console.log(`\n  Agent: ${message.result.substring(0, 200)}...`);
    }
  }
}

// ─── Demonstration Scenarios ──────────────────────────────────────────────

async function main() {
  console.log('Task 2.2: Structured Error Handling — Agent Recovery\n');

  // Scenario A: Business rule error
  // ORD-5002 is "shipped" (not "delivered") so refund will fail with a
  // business error. Agent should explain the policy, not retry.
  console.log('Scenario A: Business Rule Error (order not delivered)');
  console.log('  Expected: Agent explains shipped orders cannot be refunded\n');
  await runScenario(
    'Business Rule Error',
    'I want a refund for order ORD-5002. My email is alice@example.com',
  );

  // Scenario B: Permission error
  // Bob (C-1002) tries to access Alice's order (ORD-5001).
  // Agent should detect the ownership mismatch.
  console.log('\n\nScenario B: Permission Error (wrong customer)');
  console.log('  Expected: Agent detects ownership mismatch\n');
  await runScenario(
    'Permission Error',
    'Can you check order ORD-5001 for me? My email is bob@example.com',
  );

  // Scenario C: Validation error
  // Invalid customer ID format triggers a validation error.
  console.log('\n\nScenario C: Validation Error (invalid identifier)');
  console.log('  Expected: Agent asks for a valid email or customer ID\n');
  await runScenario(
    'Validation Error',
    'Look up my account. My customer number is 12345.',
  );

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY: How Structured Errors Enable Smart Recovery');
  console.log('='.repeat(60));
  console.log(`
  Generic error ("Operation failed"):
    -> Agent has no recovery path
    -> May retry indefinitely or give up immediately

  Structured error ({ errorCategory, isRetryable, message }):
    -> transient + isRetryable:true  -> Auto-retry with backoff
    -> validation + isRetryable:false -> Fix input, try different format
    -> business   + isRetryable:false -> Explain policy to customer
    -> permission + isRetryable:false -> Verify identity or escalate

  EXAM KEY CONCEPT:
  The errorCategory determines the STRATEGY.
  The isRetryable boolean prevents WASTED RETRIES.
  The message provides HUMAN-READABLE context.
  `);
}

main().catch(console.error);
