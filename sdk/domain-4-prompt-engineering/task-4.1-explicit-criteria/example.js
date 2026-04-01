/**
 * Task 4.1 -- Explicit Criteria vs. Vague Instructions
 *
 * Exam relevance:
 * - Vague instructions ("be conservative") produce inconsistent results
 * - Explicit criteria with severity levels, concrete examples, and skip rules
 *   produce measurable, auditable output
 * - The detected_pattern field enables false positive tracking per category
 * - Scenario 5 (CI/CD) depends heavily on this pattern
 *
 * This example sends the SAME code snippet through two different prompts:
 * 1. A vague prompt ("be conservative")
 * 2. An explicit criteria prompt (from shared/prompts/review-criteria.js)
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.1-explicit-criteria/example.js
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { reviewCriteriaPrompt } from '../../../shared/prompts/review-criteria.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Sample Code to Review ──────────────────────────────────────────────────

const sampleCode = `
// File: src/api/users.js

import { db } from '../database.js';
import _ from 'lodash';

export async function getActiveUsers(teamId) {
  // Fetch users for the team
  const query = \`SELECT * FROM users WHERE team_id = '\${teamId}' AND active = true\`;
  const users = await db.query(query);

  // Get the first admin
  const admin = users.filter(u => u.role === 'admin')[0].name;

  // Process user data
  const processed = users.map(user => {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      lastLogin: user.last_login,
    };
  });

  return { admin, users: processed };
}

export function formatUserList(users) {
  let html = '<div class="user-list">';
  for (const user of users) {
    html += \`<div class="user">\${user.name} - \${user.email}</div>\`;
  }
  html += '</div>';
  return html;
}
`;

// ─── Approach 1: Vague Prompt ───────────────────────────────────────────────

const vaguePrompt = `Review this code and report any issues you find. Be conservative.
Only flag things that really matter. Use your best judgment.

\`\`\`javascript
${sampleCode}
\`\`\`

Return your findings as JSON.`;

// ─── Approach 2: Explicit Criteria Prompt ───────────────────────────────────

const explicitPrompt = `${reviewCriteriaPrompt}

## Code to Review

\`\`\`javascript
${sampleCode}
\`\`\``;

// ─── Run Both Approaches ────────────────────────────────────────────────────

async function runReview(label, prompt) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Review approach: ${label}`);
  console.log('='.repeat(60));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  console.log(text);
  return text;
}

async function main() {
  console.log('Task 4.1 -- Comparing Vague vs. Explicit Review Criteria\n');
  console.log('The same code snippet is sent through two different prompts.');
  console.log('Observe the differences in consistency, actionability, and structure.\n');

  // ── Run the vague review ────────────────────────────────────────────────
  const vagueResult = await runReview('VAGUE ("be conservative")', vaguePrompt);

  // ── Run the explicit review ─────────────────────────────────────────────
  const explicitResult = await runReview('EXPLICIT (categorical criteria)', explicitPrompt);

  // ── Analysis ────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('ANALYSIS: What to Observe');
  console.log('='.repeat(60));
  console.log(`
Key differences to look for:

1. CONSISTENCY: Run this script multiple times. The explicit criteria prompt
   will produce findings in the same categories each time. The vague prompt
   will vary significantly between runs.

2. ACTIONABILITY: The explicit prompt produces structured JSON with severity
   levels, detected_pattern fields, and specific line references. The vague
   prompt may produce prose or inconsistently structured output.

3. FALSE POSITIVE CONTROL: The explicit prompt has SKIP rules that prevent
   flagging import ordering, style preferences, and missing JSDoc. The vague
   prompt will often flag these low-value issues.

4. DETECTED PATTERNS: The explicit prompt's output includes detected_pattern
   fields like "sql-injection" and "null-access-without-guard" that enable
   systematic false positive tracking:

   Expected findings for this code:
   - SQL injection via string concatenation (critical, sql-injection)
   - Null/undefined access on .filter()[0].name (high, null-access-without-guard)
   - XSS via unescaped user input in HTML (critical, xss-unescaped-input)

5. SKIP COMPLIANCE: The explicit prompt should NOT flag:
   - The unused lodash import (import ordering / style)
   - Missing JSDoc comments
   - Variable naming preferences
  `);
}

main().catch(console.error);
