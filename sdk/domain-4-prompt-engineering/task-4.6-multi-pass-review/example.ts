/**
 * Task 4.6 -- Multi-Pass Review with Session Isolation
 *
 * Exam relevance:
 * - Self-review has limitations (model retains reasoning context)
 * - Independent review instances (separate query() calls) are more effective
 * - Multi-pass: per-file local + cross-file integration + verification
 * - Session isolation prevents confirmation bias
 * - Scenario 5 (CI/CD) depends on this pattern
 *
 * Uses Agent SDK query() for session isolation -- each query() call is an
 * independent session with no shared context.
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.6-multi-pass-review/example.js
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  reviewCriteriaPrompt,
  perFileReviewPrompt,
  crossFileReviewPrompt,
} from '../../../shared/prompts/review-criteria.js';

// ─── Sample PR Files ────────────────────────────────────────────────────────

const prFiles = {
  'src/api/users.js': `
import { db } from '../database.js';

export async function getUser(userId) {
  // SQL injection vulnerability
  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
  return db.query(query);
}

export async function updateUser(userId, data) {
  // Missing input validation
  await db.query('UPDATE users SET name = $1 WHERE id = $2', [data.name, userId]);
  return getUser(userId);
}

export function formatUserResponse(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    // Exposing internal field that other modules rely on being private
    _internalScore: user.score,
  };
}
`,
  'src/api/orders.js': `
import { getUser, formatUserResponse } from './users.js';

export async function getOrderWithUser(orderId) {
  const order = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

  // Uses formatUserResponse which now exposes _internalScore
  // This was a private field -- now it leaks into API responses
  const user = formatUserResponse(await getUser(order.userId));

  return {
    ...order,
    user,
    // Off-by-one: shipping estimate
    estimatedDays: order.distance / 100 + 1,
  };
}

export function calculateTotal(items) {
  let total = 0;
  // Off-by-one: starts at 1 instead of 0
  for (let i = 1; i <= items.length; i++) {
    total += items[i].price * items[i].quantity;
  }
  return total;
}
`,
  'src/utils/sanitize.js': `
// New file: input sanitization utilities

export function sanitizeInput(input) {
  // Incomplete sanitization -- only handles single quotes
  return input.replace(/'/g, "\\\\'");
}

export function sanitizeHtml(html) {
  // XSS vulnerability: only strips <script> tags, not event handlers
  return html.replace(/<script[^>]*>.*?<\\/script>/gi, '');
}
`,
};

// ─── Phase 1: Per-File Local Analysis ───────────────────────────────────────
//
// EXAM KEY CONCEPT: Each file is reviewed in a SEPARATE query() call.
// This ensures session isolation per file and enables parallelization.

async function phase1PerFileAnalysis(files: Record<string, string>) {
  console.log('Phase 1: Per-File Local Analysis');
  console.log('─'.repeat(40));

  const perFileResults: Record<string, { findings?: unknown[]; parseError?: boolean }> = {};

  // ── Review each file in a separate query() call ────────────────────
  // EXAM KEY CONCEPT: Separate query() calls = session isolation per file
  const reviewPromises = Object.entries(files).map(async ([filePath, content]) => {
    console.log(`  Reviewing: ${filePath}`);

    const prompt = `${perFileReviewPrompt}

## File: ${filePath}

\`\`\`javascript
${content}
\`\`\`

Return findings as JSON: { "findings": [...], "file": "${filePath}" }`;

    let resultText = '';
    for await (const message of query({ prompt })) {
      if (message.type === 'result' && message.subtype === 'success') {
        resultText = message.result;
      }
    }

    try {
      const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, resultText];
      const result = JSON.parse(jsonMatch[1]!.trim()) as { findings?: unknown[] };
      perFileResults[filePath] = result;
      console.log(`  Found ${result.findings?.length || 0} issues in ${filePath}`);
    } catch {
      perFileResults[filePath] = { findings: [], parseError: true };
      console.log(`  Parse error for ${filePath}`);
    }
  });

  // ── Run all file reviews in parallel ────────────────────────────
  await Promise.all(reviewPromises);

  return perFileResults;
}

// ─── Phase 2: Cross-File Integration Pass ───────────────────────────────────
//
// EXAM KEY CONCEPT: This pass receives per-file results (not raw code) and
// focuses on issues that span file boundaries.

async function phase2CrossFileAnalysis(perFileResults: Record<string, { findings?: unknown[]; parseError?: boolean }>, files: Record<string, string>) {
  console.log('\nPhase 2: Cross-File Integration Analysis');
  console.log('─'.repeat(40));

  const perFileResultsText = Object.entries(perFileResults)
    .map(([file, result]) => {
      const findings = result.findings || [];
      return `### ${file}\nFindings: ${findings.length}\n${JSON.stringify(findings, null, 2)}`;
    })
    .join('\n\n');

  const prompt_text = crossFileReviewPrompt.replace('{{per_file_results}}', perFileResultsText);

  const fileList = Object.keys(files).join('\n');

  const prompt = `${prompt_text}

## Modified Files
${fileList}

## File Contents
${Object.entries(files).map(([f, c]) => `### ${f}\n\`\`\`javascript\n${c}\n\`\`\``).join('\n\n')}

Return ONLY cross-file findings as JSON: { "cross_file_findings": [...] }`;

  let resultText = '';
  for await (const message of query({ prompt })) {
    if (message.type === 'result' && message.subtype === 'success') {
      resultText = message.result;
    }
  }

  try {
    const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, resultText];
    const result = JSON.parse(jsonMatch[1]!.trim()) as { cross_file_findings?: unknown[] };
    console.log(`  Found ${result.cross_file_findings?.length || 0} cross-file issues`);
    return result;
  } catch {
    console.log('  Parse error in cross-file analysis');
    return { cross_file_findings: [], parseError: true };
  }
}

// ─── Phase 3: Independent Verification ──────────────────────────────────────
//
// EXAM KEY CONCEPT: This verification pass is INDEPENDENT -- it has no
// access to the reasoning that produced the findings. This is the session
// isolation principle applied via separate query() calls.

async function phase3Verification(allFindings: Record<string, unknown>, files: Record<string, string>) {
  console.log('\nPhase 3: Independent Verification');
  console.log('─'.repeat(40));
  console.log('  (Separate query() call -- no shared context with Phases 1-2)');

  const findingsText = JSON.stringify(allFindings, null, 2);

  const prompt = `You are an independent code review verifier. You have NOT seen these findings before.
Your job is to verify each finding against the actual code and assign a confidence score.

## Review Findings to Verify
${findingsText}

## Source Code
${Object.entries(files).map(([f, c]) => `### ${f}\n\`\`\`javascript\n${c}\n\`\`\``).join('\n\n')}

For each finding, evaluate:
1. Is the issue real? (check the actual code)
2. Is the severity appropriate?
3. Is the description accurate?

Return JSON:
{
  "verified_findings": [
    {
      "original_finding": { ... },
      "verification_status": "confirmed" | "adjusted" | "rejected",
      "adjusted_severity": "critical" | "high" | "medium" | "low" | null,
      "confidence": 0.0-1.0,
      "verification_notes": "explanation"
    }
  ],
  "summary": {
    "confirmed": N,
    "adjusted": N,
    "rejected": N
  }
}`;

  let resultText = '';
  for await (const message of query({ prompt })) {
    if (message.type === 'result' && message.subtype === 'success') {
      resultText = message.result;
    }
  }

  try {
    const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, resultText];
    const result = JSON.parse(jsonMatch[1]!.trim()) as { verified_findings?: unknown[]; summary?: Record<string, number> };
    const summary = result.summary || {};
    console.log(
      `  Confirmed: ${summary.confirmed || 0}, Adjusted: ${summary.adjusted || 0}, Rejected: ${summary.rejected || 0}`
    );
    return result;
  } catch {
    console.log('  Parse error in verification');
    return { verified_findings: [], parseError: true };
  }
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.6 -- Multi-Pass Review with Session Isolation\n');
  console.log('Three-phase pipeline: per-file -> cross-file -> verification\n');

  // Phase 1: Per-file analysis
  const perFileResults = await phase1PerFileAnalysis(prFiles);

  // Phase 2: Cross-file integration
  const crossFileResults = await phase2CrossFileAnalysis(perFileResults, prFiles);

  // Combine all findings
  const allFindings = {
    per_file: perFileResults,
    cross_file: crossFileResults.cross_file_findings || [],
  };

  // Phase 3: Independent verification
  const verification = await phase3Verification(allFindings, prFiles);

  // ── Final Report ────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('MULTI-PASS REVIEW COMPLETE');
  console.log('='.repeat(60));

  let totalPerFile = 0;
  for (const result of Object.values(perFileResults) as Array<{ findings?: unknown[] }>) {
    totalPerFile += result.findings?.length || 0;
  }

  console.log(`
Pipeline Summary:
  Phase 1 (per-file):   ${totalPerFile} local findings
  Phase 2 (cross-file): ${crossFileResults.cross_file_findings?.length || 0} integration findings
  Phase 3 (verified):   ${verification.verified_findings?.length || 0} verified findings

Session Isolation Benefits:
  - Each file was reviewed independently (Phase 1 parallelization)
  - Cross-file pass saw the full picture (Phase 2 integration)
  - Verification was independent from generation (Phase 3 isolation)
  - No confirmation bias: verifier had no access to generation reasoning

Expected Findings for This PR:
  Per-file:
    - SQL injection in users.js (critical)
    - Off-by-one error in orders.js calculateTotal (high)
    - Incomplete HTML sanitization in sanitize.js (critical)

  Cross-file:
    - _internalScore exposure: users.js formatUserResponse leaks to orders.js API
    - sanitize.js sanitizeInput not used in users.js getUser (the SQL injection)

  Verification should:
    - Confirm security findings with high confidence
    - Confirm the off-by-one with high confidence
    - Flag the _internalScore leak as a design issue (medium/high)
`);
}

main().catch(console.error);
