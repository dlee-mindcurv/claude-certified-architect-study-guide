/**
 * Scenario 5 (CI/CD) -- Full Multi-Pass Review Pipeline
 *
 * Exam relevance:
 * - Task 4.6: Multi-pass review (per-file + cross-file + verification)
 * - Session isolation: verification instance is independent from generator
 * - Per-file parallelization for performance
 * - Cross-file integration for dependency/contract analysis
 * - Confidence-based filtering reduces false positives
 * - Task 4.1: Uses explicit review criteria throughout
 *
 * Uses Agent SDK query() for session isolation -- each query() call runs
 * in an independent session with no shared context.
 *
 * Pipeline architecture:
 *   Phase 1: Per-file local analysis (parallel, N query() calls)
 *   Phase 2: Cross-file integration (1 query() call)
 *   Phase 3: Independent verification (1 query() call, isolated)
 *   Phase 4: Confidence filtering and report generation
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.6-multi-pass-review/scenario-5-ci/multi-pass-review.js
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  reviewCriteriaPrompt,
  perFileReviewPrompt,
  crossFileReviewPrompt,
} from '../../../../shared/prompts/review-criteria.js';

// ─── Configuration ──────────────────────────────────────────────────────────

// Confidence threshold for surfacing findings to developers
// EXAM NOTE: Below this threshold, findings are logged but not reported
const CONFIDENCE_THRESHOLD = 0.8;

// ─── Sample PR Diff ─────────────────────────────────────────────────────────

const prFiles = {
  'src/controllers/auth.js': `
import { db } from '../database.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { createSession } from '../services/session.js';

export async function login(req, res) {
  const { email, password } = req.body;

  // SQL injection: string concatenation
  const user = await db.query(\`SELECT * FROM users WHERE email = '\${email}'\`);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Session created with user object -- includes passwordHash
  const session = await createSession(user);
  return res.json({ token: session.token, user });
}

export async function register(req, res) {
  const { email, password, name } = req.body;
  const hashed = await hashPassword(password);

  await db.query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
    [email, hashed, name]
  );

  // Returns user without looking them up -- no ID in response
  return res.status(201).json({ email, name });
}
`,
  'src/services/session.js': `
import jwt from 'jsonwebtoken';

const SECRET = 'my-secret-key-12345'; // Hardcoded secret

export async function createSession(user) {
  // Includes full user object in token -- exposes passwordHash
  const token = jwt.sign(
    { user },
    SECRET,
    { expiresIn: '24h' }
  );

  return { token, userId: user.id };
}

export function verifySession(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
`,
  'src/utils/crypto.js': `
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Utility: generate random token (not used yet)
export function generateToken(length = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
`,
};

// ─── Phase 1: Per-File Local Analysis ───────────────────────────────────────

async function runPhase1(files) {
  console.log('Phase 1: Per-File Local Analysis (parallel)');
  console.log('─'.repeat(50));

  const startTime = Date.now();
  const perFileResults = {};

  const promises = Object.entries(files).map(async ([filePath, content]) => {
    // EXAM KEY CONCEPT: Each file gets its own query() call -- session isolation
    const prompt = `${perFileReviewPrompt}

${reviewCriteriaPrompt}

## File: ${filePath}

\`\`\`javascript
${content}
\`\`\`

Return structured JSON:
{
  "file": "${filePath}",
  "findings": [
    {
      "line": <number>,
      "severity": "critical" | "high" | "medium" | "low",
      "category": "bug" | "security" | "logic",
      "issue": "<description>",
      "suggestion": "<fix>",
      "detected_pattern": "<pattern-id>",
      "confidence": <0-1>
    }
  ]
}`;

    let resultText = '';
    for await (const message of query({ prompt })) {
      if (message.type === 'result' && message.subtype === 'success') {
        resultText = message.result;
      }
    }

    try {
      const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, resultText];
      const result = JSON.parse(jsonMatch[1].trim());
      perFileResults[filePath] = result;
      console.log(`  ${filePath}: ${result.findings?.length || 0} findings`);
    } catch {
      perFileResults[filePath] = { file: filePath, findings: [], parseError: true };
      console.log(`  ${filePath}: parse error`);
    }
  });

  await Promise.all(promises);

  const elapsed = Date.now() - startTime;
  console.log(`  Phase 1 complete: ${elapsed}ms (parallel execution)\n`);

  return perFileResults;
}

// ─── Phase 2: Cross-File Integration ────────────────────────────────────────

async function runPhase2(perFileResults, files) {
  console.log('Phase 2: Cross-File Integration Analysis');
  console.log('─'.repeat(50));

  const startTime = Date.now();

  const perFileText = Object.entries(perFileResults)
    .map(([file, result]) => `### ${file}\n${JSON.stringify(result.findings || [], null, 2)}`)
    .join('\n\n');

  const prompt_text = crossFileReviewPrompt.replace('{{per_file_results}}', perFileText);

  const fileContents = Object.entries(files)
    .map(([f, c]) => `### ${f}\n\`\`\`javascript\n${c}\n\`\`\``)
    .join('\n\n');

  const prompt = `${prompt_text}

## File Contents
${fileContents}

Return ONLY cross-file findings as JSON:
{
  "cross_file_findings": [
    {
      "files_involved": ["file1.js", "file2.js"],
      "severity": "critical" | "high" | "medium" | "low",
      "category": "data-flow" | "api-contract" | "import-export" | "shared-state",
      "issue": "<description>",
      "suggestion": "<fix>",
      "detected_pattern": "<pattern-id>",
      "confidence": <0-1>
    }
  ]
}`;

  let resultText = '';
  for await (const message of query({ prompt })) {
    if (message.type === 'result' && message.subtype === 'success') {
      resultText = message.result;
    }
  }

  let crossFileFindings = [];

  try {
    const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, resultText];
    const result = JSON.parse(jsonMatch[1].trim());
    crossFileFindings = result.cross_file_findings || [];
    console.log(`  Found ${crossFileFindings.length} cross-file issues`);
  } catch {
    console.log('  Parse error in cross-file analysis');
  }

  const elapsed = Date.now() - startTime;
  console.log(`  Phase 2 complete: ${elapsed}ms\n`);

  return crossFileFindings;
}

// ─── Phase 3: Independent Verification ──────────────────────────────────────

async function runPhase3(allFindings, files) {
  console.log('Phase 3: Independent Verification (session-isolated)');
  console.log('─'.repeat(50));

  const startTime = Date.now();

  // ── EXAM KEY CONCEPT: This is a FRESH query() call ──────────────────
  // No conversation history from Phase 1 or Phase 2.
  const fileContents = Object.entries(files)
    .map(([f, c]) => `### ${f}\n\`\`\`javascript\n${c}\n\`\`\``)
    .join('\n\n');

  const prompt = `You are an independent code review verifier. You are reviewing findings
that were produced by a separate review process. You have NOT seen these before.

Your job:
1. Verify each finding against the actual code
2. Confirm, adjust severity, or reject each finding
3. Assign a confidence score (0-1) based on how certain you are

## Findings to Verify

${JSON.stringify(allFindings, null, 2)}

## Source Code

${fileContents}

## Verification Rules
- Only CONFIRM findings you can independently verify in the code
- REJECT findings where the described issue does not match the code
- ADJUST severity if the original assessment was too high or too low
- Assign confidence based on how clearly the issue is present

Return JSON:
{
  "verified_findings": [
    {
      "original_issue": "<from the finding>",
      "original_severity": "<from the finding>",
      "verification_status": "confirmed" | "adjusted" | "rejected",
      "adjusted_severity": "<new severity or null if unchanged>",
      "confidence": <0-1>,
      "verification_notes": "<explanation>"
    }
  ],
  "summary": {
    "total_reviewed": <N>,
    "confirmed": <N>,
    "adjusted": <N>,
    "rejected": <N>
  }
}`;

  let resultText = '';
  for await (const message of query({ prompt })) {
    if (message.type === 'result' && message.subtype === 'success') {
      resultText = message.result;
    }
  }

  let verification = { verified_findings: [], summary: {} };

  try {
    const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, resultText];
    verification = JSON.parse(jsonMatch[1].trim());
    const s = verification.summary || {};
    console.log(
      `  Reviewed: ${s.total_reviewed || 0}, Confirmed: ${s.confirmed || 0}, ` +
      `Adjusted: ${s.adjusted || 0}, Rejected: ${s.rejected || 0}`
    );
  } catch {
    console.log('  Parse error in verification');
  }

  const elapsed = Date.now() - startTime;
  console.log(`  Phase 3 complete: ${elapsed}ms\n`);

  return verification;
}

// ─── Phase 4: Confidence Filtering and Report ───────────────────────────────

function generateReport(perFileResults, crossFileFindings, verification) {
  console.log('Phase 4: Confidence Filtering and Report');
  console.log('─'.repeat(50));

  let totalPerFile = 0;
  for (const result of Object.values(perFileResults)) {
    totalPerFile += result.findings?.length || 0;
  }

  const highConfidence = (verification.verified_findings || []).filter(
    f => f.confidence >= CONFIDENCE_THRESHOLD
  );
  const lowConfidence = (verification.verified_findings || []).filter(
    f => f.confidence < CONFIDENCE_THRESHOLD
  );

  console.log(`
  Confidence threshold: ${CONFIDENCE_THRESHOLD}
  High confidence (surfaced): ${highConfidence.length}
  Low confidence (suppressed): ${lowConfidence.length}
`);

  const hasCritical = highConfidence.some(
    f => (f.adjusted_severity || f.original_severity) === 'critical' &&
         f.verification_status !== 'rejected'
  );

  const hasHigh = highConfidence.some(
    f => (f.adjusted_severity || f.original_severity) === 'high' &&
         f.verification_status !== 'rejected'
  );

  let recommendation;
  if (hasCritical) {
    recommendation = 'BLOCK_MERGE';
  } else if (hasHigh) {
    recommendation = 'REQUEST_CHANGES';
  } else {
    recommendation = 'APPROVED';
  }

  const report = {
    pipeline: 'multi-pass-review',
    phases: {
      phase1_per_file: { findings: totalPerFile, files_reviewed: Object.keys(perFileResults).length },
      phase2_cross_file: { findings: crossFileFindings.length },
      phase3_verification: verification.summary || {},
      phase4_filtering: {
        confidence_threshold: CONFIDENCE_THRESHOLD,
        surfaced: highConfidence.length,
        suppressed: lowConfidence.length,
      },
    },
    recommendation,
    high_confidence_findings: highConfidence,
  };

  console.log('─'.repeat(50));
  console.log(`  RECOMMENDATION: ${recommendation}`);
  console.log('─'.repeat(50));

  return report;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.6 / Scenario 5 -- Full CI Multi-Pass Review Pipeline\n');
  console.log(`PR: 3 files, auth system changes`);
  console.log(`Pipeline: per-file (parallel) -> cross-file -> verification -> filter\n`);

  const pipelineStart = Date.now();

  // Phase 1: Per-file analysis (parallel)
  const perFileResults = await runPhase1(prFiles);

  // Phase 2: Cross-file integration
  const crossFileFindings = await runPhase2(perFileResults, prFiles);

  // Combine all findings for verification
  const allFindings = {
    per_file_findings: Object.values(perFileResults)
      .flatMap(r => (r.findings || []).map(f => ({ ...f, source: 'per-file' }))),
    cross_file_findings: crossFileFindings.map(f => ({ ...f, source: 'cross-file' })),
  };

  // Phase 3: Independent verification (session-isolated)
  const verification = await runPhase3(allFindings, prFiles);

  // Phase 4: Filter and report
  const report = generateReport(perFileResults, crossFileFindings, verification);

  const pipelineElapsed = Date.now() - pipelineStart;
  console.log(`\nTotal pipeline time: ${Math.round(pipelineElapsed / 1000)}s`);
  console.log(`Total query() calls: ${Object.keys(prFiles).length + 2} (${Object.keys(prFiles).length} per-file + 1 cross-file + 1 verification)`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('EXPECTED FINDINGS FOR THIS PR');
  console.log('='.repeat(60));
  console.log(`
Per-file findings (Phase 1):
  auth.js:
    - SQL injection via string concatenation (critical)
    - User object including passwordHash returned in response (high)
  session.js:
    - Hardcoded JWT secret (critical)
    - Full user object (including passwordHash) embedded in JWT token (high)
  crypto.js:
    - generateToken uses Math.random (not cryptographically secure) (medium)

Cross-file findings (Phase 2):
  - auth.js passes full user object to session.js createSession, which
    embeds it in JWT -- passwordHash leaks through the token (critical)
  - auth.js login returns user object directly -- combined with the JWT
    leak, passwordHash is exposed in two places

Verification (Phase 3) should:
  - Confirm security findings with high confidence (>0.9)
  - Confirm the password hash leakage cross-file finding
  - Potentially reject low-confidence or duplicate findings

PIPELINE DESIGN PRINCIPLES:
  1. Per-file parallelization for performance
  2. Cross-file pass for integration issues invisible to per-file analysis
  3. Session-isolated verification for unbiased quality gate
  4. Confidence filtering to minimize false positives surfaced to developers
`);
}

main().catch(console.error);
