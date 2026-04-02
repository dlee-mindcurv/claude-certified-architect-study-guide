/**
 * Task 5.1 -- Context Preservation with Case Facts Block (Agent SDK)
 *
 * Exam relevance:
 * - Progressive summarization risks: condensing exact values into vague summaries
 * - "Lost in the middle" effect: weakened attention to mid-conversation content
 * - Case facts block pattern: structured context injected at the TOP of every prompt
 * - Tool result accumulation consuming tokens unnecessarily
 *
 * EXAM KEY CONCEPT:
 *   The case facts block is a structured object maintained OUTSIDE the conversation.
 *   Before each turn, it is rendered into the system prompt at the BEGINNING
 *   (highest-attention zone), ensuring critical facts survive context compaction.
 *
 * This example uses the raw @anthropic-ai/sdk to show the case-facts injection
 * pattern explicitly, since the concept is about prompt construction per turn.
 */

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

interface CaseFactsCustomer {
  id: string;
  name: string;
  email: string;
  tier: string;
}

interface CaseFactsOrder {
  orderId: string;
  total: number;
  status: string;
  deliveredAt: string | null;
}

interface CaseFactsRefund {
  refundId: string;
  amount: number;
  status: string;
}

interface CaseFacts {
  customer: CaseFactsCustomer | null;
  orders: CaseFactsOrder[];
  actionsTaken: string[];
  openIssues: string[];
  refunds: CaseFactsRefund[];
}

function createEmptyCaseFacts(): CaseFacts {
  return {
    customer: null,        // { id, name, email, tier }
    orders: [],            // [{ orderId, total, status, deliveredAt }]
    actionsTaken: [],      // ["Verified identity via email", ...]
    openIssues: [],        // ["Awaiting refund confirmation", ...]
    refunds: [],           // [{ refundId, amount, status }]
  };
}

// ─── Case Facts Rendering ─────────────────────────────────────────────────────

function renderCaseFactsBlock(caseFacts: CaseFacts): string {
  const lines: string[] = ['## Current Case Facts (verified this session)'];

  if (caseFacts.customer) {
    const c = caseFacts.customer;
    lines.push(`- **Customer:** ${c.name} (${c.id}, ${c.tier} tier, ${c.email})`);
  } else {
    lines.push('- **Customer:** Not yet identified');
  }

  if (caseFacts.orders.length > 0) {
    const orderSummaries = caseFacts.orders.map((o: CaseFactsOrder) =>
      `${o.orderId} ($${o.total}, ${o.status}${o.deliveredAt ? `, delivered ${o.deliveredAt}` : ''})`
    );
    lines.push(`- **Orders discussed:** ${orderSummaries.join('; ')}`);
  }

  if (caseFacts.actionsTaken.length > 0) {
    lines.push(`- **Actions taken:** ${caseFacts.actionsTaken.join('; ')}`);
  }

  if (caseFacts.refunds.length > 0) {
    const refundSummaries = caseFacts.refunds.map((r: CaseFactsRefund) =>
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
// case facts structure. This happens incrementally so intermediate facts (like
// customer tier) are available for subsequent decisions.

function extractFactsFromToolResult(toolName: string, rawResult: { isError: boolean; content: string }, caseFacts: CaseFacts): CaseFacts {
  if (rawResult.isError) {
    caseFacts.actionsTaken.push(
      `${toolName} failed: ${JSON.parse(rawResult.content).message}`
    );
    return caseFacts;
  }

  const data = JSON.parse(rawResult.content);

  switch (toolName) {
    case 'get_customer':
      if (data.id) {
        caseFacts.customer = { id: data.id, name: data.name, email: data.email, tier: data.tier };
        caseFacts.actionsTaken.push(`Verified customer: ${data.name} (${data.id}, ${data.tier} tier)`);
      }
      if (data.multiple_matches) {
        caseFacts.openIssues.push(`Multiple customer matches (${data.multiple_matches.length}) -- need disambiguation`);
      }
      break;

    case 'lookup_order': {
      const existing = caseFacts.orders.findIndex((o: CaseFactsOrder) => o.orderId === data.orderId);
      const summary: CaseFactsOrder = { orderId: data.orderId, total: data.total, status: data.status, deliveredAt: data.deliveredAt || null };
      if (existing >= 0) caseFacts.orders[existing] = summary;
      else caseFacts.orders.push(summary);
      caseFacts.actionsTaken.push(`Looked up order ${data.orderId}: $${data.total}, ${data.status}`);
      break;
    }

    case 'process_refund':
      caseFacts.refunds.push({ refundId: data.refundId, amount: data.amount, status: data.status });
      caseFacts.actionsTaken.push(`Processed refund ${data.refundId}: $${data.amount} (${data.status})`);
      caseFacts.openIssues = caseFacts.openIssues.filter((i: string) => !i.includes('refund'));
      break;

    case 'escalate_to_human':
      caseFacts.actionsTaken.push(`Escalated to human: ticket ${data.ticketId} (${data.priority})`);
      break;
  }

  return caseFacts;
}

// ─── Tool Result Trimming ─────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: After extracting facts, trim verbose tool outputs to only
// the fields needed for Claude's next decision. Full data is preserved in the
// case facts block above.

function trimToolResult(toolName: string, rawContent: string): string {
  try {
    const data = JSON.parse(rawContent);
    switch (toolName) {
      case 'get_customer':
        if (data.multiple_matches) return rawContent;
        return JSON.stringify({ id: data.id, name: data.name, tier: data.tier, accountStatus: data.accountStatus });
      case 'lookup_order':
        return JSON.stringify({ orderId: data.orderId, total: data.total, status: data.status, deliveredAt: data.deliveredAt, itemCount: data.items?.length });
      default:
        return rawContent;
    }
  } catch {
    return rawContent;
  }
}

// ─── Build System Prompt with Case Facts ──────────────────────────────────────
//
// EXAM KEY CONCEPT: Case facts go FIRST, before the base system prompt, placing
// them in the highest-attention zone and countering "lost in the middle."

function buildSystemPromptWithFacts(caseFacts: CaseFacts): string {
  return `${renderCaseFactsBlock(caseFacts)}\n\n---\n\n${csrSystemPrompt}`;
}

// ─── Agentic Loop with Context Preservation ───────────────────────────────────

async function runAgentWithCaseFacts(userMessage: string) {
  console.log('\n' + '='.repeat(60));
  console.log('Task 5.1: Context Preservation with Case Facts Block');
  console.log('='.repeat(60));
  console.log(`\nCustomer: ${userMessage}\n`);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];
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
      tools: csrToolDefinitions as Anthropic.Messages.Tool[],
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const finalText = response.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map(b => b.text).join('\n');
      console.log(`\nAgent: ${finalText}`);
      console.log(`\n--- Completed in ${turnCount} turns ---`);
      console.log('\nFinal Case Facts:');
      console.log(renderCaseFactsBlock(caseFacts));
      return { text: finalText, caseFacts, turns: turnCount };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
      );
      for (const toolUse of toolBlocks) {
        console.log(`  Tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

        const rawResult = executeCsrTool(toolUse.name, toolUse.input as Record<string, unknown>);

        // STEP 1: Extract facts into the persistent case facts block
        extractFactsFromToolResult(toolUse.name, rawResult, caseFacts);

        // STEP 2: Trim the verbose tool output to save context tokens
        const trimmedContent = rawResult.isError
          ? rawResult.content
          : trimToolResult(toolUse.name, rawResult.content);

        console.log(`  Result (trimmed): ${trimmedContent.substring(0, 80)}...`);

        toolResults.push({
          type: 'tool_result' as const,
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
  console.log('\n>>> DEMO: Case facts persist across tool calls <<<');
  await runAgentWithCaseFacts(
    "Hi, I ordered some headphones and a cable (order ORD-5001) and they arrived " +
    "damaged. My email is alice@example.com. I'd like a refund for the full order."
  );
}

main().catch(console.error);
