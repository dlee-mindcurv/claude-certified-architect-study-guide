/**
 * Task 5.1 — Context Preservation with Persistent Case Facts Block
 *
 * Exam relevance:
 * - Progressive summarization risks: condensing exact values into vague summaries
 * - "Lost in the middle" effect: weakened attention to mid-conversation content
 * - Tool result accumulation consuming tokens unnecessarily
 * - Case facts block pattern: structured context at the top of every prompt
 *
 * This example demonstrates:
 * 1. After each tool call, extract key facts into a structured case facts object
 * 2. Inject the case facts block at the beginning of the system prompt each turn
 * 3. Trim verbose tool outputs to only the fields needed going forward
 * 4. Place key findings summaries at the beginning with explicit section headers
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { csrToolDefinitions, executeCsrTool } from '../../../shared/tools/csr-tools.js';
import { csrSystemPrompt } from '../../../shared/prompts/csr-system-prompt.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 15;

// ─── Case Facts Data Structure ────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: This object persists outside the conversation history.
// It is rebuilt into the system prompt before each API call, ensuring critical
// facts are always at the TOP of the context (highest-attention zone).

function createEmptyCaseFacts() {
  return {
    customer: null,        // { id, name, email, tier }
    orders: [],            // [{ orderId, total, status, deliveredAt }]
    actionsTaken: [],      // ["Verified identity via email", ...]
    openIssues: [],        // ["Awaiting refund confirmation", ...]
    refunds: [],           // [{ refundId, amount, status }]
  };
}

// ─── Case Facts Rendering ─────────────────────────────────────────────────────
//
// Renders the case facts into a markdown block for injection into the system
// prompt. Uses explicit section headers so Claude can locate these facts
// reliably even in long contexts.

function renderCaseFactsBlock(caseFacts) {
  const lines = ['## Current Case Facts (verified this session)'];

  if (caseFacts.customer) {
    const c = caseFacts.customer;
    lines.push(`- **Customer:** ${c.name} (${c.id}, ${c.tier} tier, ${c.email})`);
  } else {
    lines.push('- **Customer:** Not yet identified');
  }

  if (caseFacts.orders.length > 0) {
    const orderSummaries = caseFacts.orders.map(o =>
      `${o.orderId} ($${o.total}, ${o.status}${o.deliveredAt ? `, delivered ${o.deliveredAt}` : ''})`
    );
    lines.push(`- **Orders discussed:** ${orderSummaries.join('; ')}`);
  }

  if (caseFacts.actionsTaken.length > 0) {
    lines.push(`- **Actions taken:** ${caseFacts.actionsTaken.join('; ')}`);
  }

  if (caseFacts.refunds.length > 0) {
    const refundSummaries = caseFacts.refunds.map(r =>
      `${r.refundId} ($${r.amount}, ${r.status})`
    );
    lines.push(`- **Refunds:** ${refundSummaries.join('; ')}`);
  }

  if (caseFacts.openIssues.length > 0) {
    lines.push(`- **Open issues:** ${caseFacts.openIssues.join('; ')}`);
  }

  return lines.join('\n');
}

// ─── Fact Extraction from Tool Results ────────────────────────────────────────
//
// EXAM KEY CONCEPT: After EACH tool call, we extract relevant facts into the
// case facts structure. This is not done once at the end -- it happens
// incrementally so intermediate facts (like customer tier) are available
// for subsequent decisions.

function extractFactsFromToolResult(toolName, toolInput, rawResult, caseFacts) {
  // Only process successful results
  if (rawResult.isError) {
    caseFacts.actionsTaken.push(
      `${toolName} failed: ${JSON.parse(rawResult.content).message}`
    );
    return caseFacts;
  }

  const data = JSON.parse(rawResult.content);

  switch (toolName) {
    case 'get_customer': {
      // Handle single customer match
      if (data.id) {
        caseFacts.customer = {
          id: data.id,
          name: data.name,
          email: data.email,
          tier: data.tier,
        };
        caseFacts.actionsTaken.push(
          `Verified customer: ${data.name} (${data.id}, ${data.tier} tier)`
        );
      }
      // Handle multiple matches -- note the ambiguity as an open issue
      if (data.multiple_matches) {
        caseFacts.openIssues.push(
          `Multiple customer matches found (${data.multiple_matches.length}) -- need disambiguation`
        );
        caseFacts.actionsTaken.push(
          `Customer lookup returned ${data.multiple_matches.length} matches`
        );
      }
      break;
    }

    case 'lookup_order': {
      const orderSummary = {
        orderId: data.orderId,
        total: data.total,
        status: data.status,
        deliveredAt: data.deliveredAt || null,
      };
      // Avoid duplicate entries for the same order
      const existingIdx = caseFacts.orders.findIndex(o => o.orderId === data.orderId);
      if (existingIdx >= 0) {
        caseFacts.orders[existingIdx] = orderSummary;
      } else {
        caseFacts.orders.push(orderSummary);
      }
      caseFacts.actionsTaken.push(
        `Looked up order ${data.orderId}: $${data.total}, ${data.status}`
      );
      break;
    }

    case 'process_refund': {
      caseFacts.refunds.push({
        refundId: data.refundId,
        amount: data.amount,
        status: data.status,
      });
      caseFacts.actionsTaken.push(
        `Processed refund ${data.refundId}: $${data.amount} (${data.status})`
      );
      // Remove from open issues if refund was the pending item
      caseFacts.openIssues = caseFacts.openIssues.filter(
        issue => !issue.includes('refund')
      );
      break;
    }

    case 'escalate_to_human': {
      caseFacts.actionsTaken.push(
        `Escalated to human agent: ticket ${data.ticketId} (${data.priority})`
      );
      break;
    }
  }

  return caseFacts;
}

// ─── Tool Result Trimming ─────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Verbose tool outputs waste context tokens. After extracting
// key facts, we trim the raw result to only the fields needed for Claude's
// next decision. The full data is preserved in the case facts block.

function trimToolResult(toolName, rawContent) {
  try {
    const data = JSON.parse(rawContent);

    switch (toolName) {
      case 'get_customer':
        // Keep only fields Claude needs for follow-up decisions
        if (data.multiple_matches) return rawContent; // Need full data for disambiguation
        return JSON.stringify({
          id: data.id,
          name: data.name,
          tier: data.tier,
          accountStatus: data.accountStatus,
        });

      case 'lookup_order':
        // Keep order summary but drop verbose item details if not needed
        return JSON.stringify({
          orderId: data.orderId,
          total: data.total,
          status: data.status,
          deliveredAt: data.deliveredAt,
          itemCount: data.items?.length,
        });

      case 'process_refund':
        // Keep the full refund result (it is already concise)
        return rawContent;

      case 'escalate_to_human':
        return rawContent;

      default:
        return rawContent;
    }
  } catch {
    return rawContent; // If parsing fails, return unchanged
  }
}

// ─── Build System Prompt with Case Facts ──────────────────────────────────────
//
// EXAM KEY CONCEPT: The case facts block is injected at the BEGINNING of the
// system prompt. This places it in the highest-attention zone of the context
// window, countering the "lost in the middle" effect.

function buildSystemPromptWithFacts(caseFacts) {
  const caseFactsBlock = renderCaseFactsBlock(caseFacts);
  // Case facts go FIRST, before the base system prompt
  return `${caseFactsBlock}\n\n---\n\n${csrSystemPrompt}`;
}

// ─── Agentic Loop with Context Preservation ───────────────────────────────────

async function runAgentWithCaseFacts(userMessage) {
  console.log('\n' + '='.repeat(60));
  console.log('Task 5.1: Context Preservation with Case Facts Block');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  const messages = [{ role: 'user', content: userMessage }];
  const caseFacts = createEmptyCaseFacts();
  let turnCount = 0;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      console.warn(`[SAFETY] Max turns (${MAX_TURNS}) reached.`);
      break;
    }

    // CRITICAL: Rebuild system prompt with CURRENT case facts each turn
    const systemPrompt = buildSystemPromptWithFacts(caseFacts);

    console.log(`\n--- Turn ${turnCount} ---`);
    console.log(`[Case Facts injected: ${caseFacts.actionsTaken.length} actions tracked]`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: csrToolDefinitions,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const finalText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      console.log(`\nAgent: ${finalText}`);
      console.log(`\n--- Completed in ${turnCount} turns ---`);
      console.log('\nFinal Case Facts:');
      console.log(renderCaseFactsBlock(caseFacts));
      return { text: finalText, caseFacts, turns: turnCount };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      for (const toolUse of toolUseBlocks) {
        console.log(`  Tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

        // Execute the tool
        const rawResult = executeCsrTool(toolUse.name, toolUse.input);

        // STEP 1: Extract facts into the persistent case facts block
        extractFactsFromToolResult(toolUse.name, toolUse.input, rawResult, caseFacts);

        // STEP 2: Trim the verbose tool output to save context tokens
        const trimmedContent = rawResult.isError
          ? rawResult.content
          : trimToolResult(toolUse.name, rawResult.content);

        console.log(`  Result (trimmed): ${trimmedContent.substring(0, 80)}...`);

        // Send the trimmed result back to Claude
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: trimmedContent,
          ...(rawResult.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    console.error(`Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }
}

// ─── Demonstration ────────────────────────────────────────────────────────────

async function main() {
  // Multi-step interaction that benefits from case facts preservation
  console.log('\n>>> DEMO: Case facts persist across tool calls <<<');
  await runAgentWithCaseFacts(
    "Hi, I ordered some headphones and a cable (order ORD-5001) and they arrived " +
    "damaged. My email is alice@example.com. I'd like a refund for the full order."
  );
}

main().catch(console.error);
