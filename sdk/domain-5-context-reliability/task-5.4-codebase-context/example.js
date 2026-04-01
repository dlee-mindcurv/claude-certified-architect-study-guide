/**
 * Task 5.4 -- Codebase Context Management with Scratchpad Pattern (Agent SDK)
 *
 * Exam relevance:
 * - Context degradation in extended sessions
 * - Scratchpad file pattern for persistent key findings
 * - Subagent delegation for focused investigation
 * - /compact usage for context reduction
 *
 * EXAM KEY CONCEPT:
 *   The scratchpad is a persistent FILE that survives beyond the context window.
 *   Key findings are written to it after each investigation phase. When /compact
 *   is used or context fills up, the scratchpad provides a reliable source of
 *   truth for previous discoveries. This is implemented via a custom tool that
 *   writes to disk.
 *
 * Uses query() with a custom scratchpad tool via tool() + createSdkMcpServer().
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRATCHPAD_DIR = join(__dirname, '.claude');
const SCRATCHPAD_PATH = join(SCRATCHPAD_DIR, 'scratchpad.md');

// ─── Scratchpad Tools ────────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The scratchpad tool writes findings to a FILE on disk.
// This file survives context compaction because it exists outside the
// conversation history. The agent can read it back after /compact.

const writeScratchpadTool = tool({
  name: 'write_scratchpad',
  description: 'Write findings to the persistent scratchpad file. Use this to record key discoveries that must survive context compaction. The scratchpad persists on disk.',
  schema: z.object({
    section: z.string().describe('Section header (e.g., "Architecture", "Callers", "Test Coverage")'),
    content: z.string().describe('Structured findings to record under this section'),
  }),
  run: async ({ section, content }) => {
    if (!existsSync(SCRATCHPAD_DIR)) mkdirSync(SCRATCHPAD_DIR, { recursive: true });

    const entry = `\n## ${section}\nUpdated: ${new Date().toISOString()}\n\n${content}\n\n---\n`;
    const existing = existsSync(SCRATCHPAD_PATH) ? readFileSync(SCRATCHPAD_PATH, 'utf-8') : '# Investigation Scratchpad\n';
    writeFileSync(SCRATCHPAD_PATH, existing + entry, 'utf-8');

    return `Written to scratchpad: ${section} (${content.length} chars)`;
  },
});

const readScratchpadTool = tool({
  name: 'read_scratchpad',
  description: 'Read the persistent scratchpad file to recover findings from previous investigation phases. Use this after context compaction or session restart.',
  schema: z.object({}),
  run: async () => {
    if (!existsSync(SCRATCHPAD_PATH)) {
      return 'Scratchpad is empty. No previous findings recorded.';
    }
    return readFileSync(SCRATCHPAD_PATH, 'utf-8');
  },
});

// Bundle tools into an MCP server
const scratchpadServer = createSdkMcpServer({
  name: 'scratchpad',
  tools: [writeScratchpadTool, readScratchpadTool],
});

// ─── Investigation Subagent ─────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Each subagent gets a FOCUSED context (only relevant files)
// and returns a STRUCTURED SUMMARY. The main agent's context stays clean.

async function investigateWithSubagent(question, context) {
  console.log(`\n  [Subagent] Investigating: "${question}"`);

  let result = '';

  for await (const message of query({
    prompt: `${question}\n\nContext:\n${context}`,
    options: {
      systemPrompt: 'You are a code investigation subagent. Analyze the provided context and return structured findings. Be specific about file names, function names, and issues.',
      maxTurns: 1,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
    }
  }

  return result;
}

// ─── Main: Coordinated Investigation with Scratchpad ─────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Task 5.4: Codebase Context Management with Scratchpad');
  console.log('='.repeat(60));

  // Simulated codebase context for investigation
  const authCode = `
// src/auth/validate.js
export function validateToken(token) {
  const decoded = jwt.verify(token, SECRET);
  // BUG: No check for token expiration
  return { userId: decoded.sub, roles: decoded.roles };
}

// src/auth/refresh.js - depends on validateToken
// src/middleware/auth.js - wraps validateToken for Express
// test/auth/validate.test.js - tests valid token + invalid signature, MISSING expired token test
  `.trim();

  // Phase 1: Use the main agent with scratchpad tool to investigate and record
  console.log('\n--- Phase 1: Investigation with scratchpad recording ---');

  for await (const message of query({
    prompt: `Investigate this authentication code for bugs and test gaps.
After each finding, write it to the scratchpad for persistence.

Code to investigate:
${authCode}

Steps:
1. Analyze the architecture and identify the bug
2. Write your architecture findings to the scratchpad
3. Identify what tests are missing
4. Write test coverage findings to the scratchpad
5. Summarize next steps`,
    options: {
      systemPrompt: `You are a code investigation coordinator. Use the scratchpad tools to persist your key findings.
The scratchpad survives context compaction -- always write important discoveries there.
Be specific: name files, functions, and line-level issues.`,
      mcpServers: { scratchpad: scratchpadServer },
      allowedTools: [
        'mcp__scratchpad__write_scratchpad',
        'mcp__scratchpad__read_scratchpad',
      ],
      maxTurns: 10,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      console.log(`\nAgent summary: ${message.result}`);
    }
  }

  // Phase 2: Simulate context compaction -- start fresh, read scratchpad
  console.log('\n--- Phase 2: After context compaction -- recovering from scratchpad ---');

  for await (const message of query({
    prompt: 'Read the scratchpad to recover previous findings, then list the next implementation steps.',
    options: {
      systemPrompt: 'You are resuming an investigation after context compaction. Read the scratchpad to recover your previous findings.',
      mcpServers: { scratchpad: scratchpadServer },
      allowedTools: [
        'mcp__scratchpad__read_scratchpad',
      ],
      maxTurns: 3,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      console.log(`\nRecovered plan: ${message.result}`);
    }
  }

  console.log('\nContext management notes:');
  console.log('  - Scratchpad persists findings across /compact or session restart');
  console.log('  - Subagent delegation keeps main context focused');
  console.log(`  - Scratchpad file: ${SCRATCHPAD_PATH}`);
}

main().catch(console.error);
