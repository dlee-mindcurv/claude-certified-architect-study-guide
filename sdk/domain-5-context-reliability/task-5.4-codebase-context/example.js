/**
 * Task 5.4 — Codebase Context Management with Subagent Delegation and Scratchpad
 *
 * Exam relevance:
 * - Context degradation in extended sessions
 * - Subagent delegation for focused investigation
 * - Scratchpad file pattern for persistent key findings
 * - Structured state exports for crash recovery
 * - /compact usage for context reduction
 *
 * This example demonstrates:
 * 1. Spawning subagents for specific investigation questions
 * 2. Main agent maintains high-level coordination
 * 3. Scratchpad file: write key findings, reference in subsequent queries
 * 4. Structured state exports for crash recovery
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 10;

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Simulated Codebase ──────────────────────────────────────────────────────
//
// Instead of reading a real codebase, we simulate file contents that a
// subagent would encounter. In production, subagents would use file-reading
// tools (Read, Bash, Glob, Grep) to explore the actual codebase.

const simulatedCodebase = {
  'src/auth/validate.js': {
    content: `export function validateToken(token) {
  const decoded = jwt.verify(token, SECRET);
  // BUG: No check for token expiration
  return { userId: decoded.sub, roles: decoded.roles };
}`,
    exports: ['validateToken'],
    imports: ['jwt'],
  },
  'src/auth/refresh.js': {
    content: `export function refreshToken(oldToken) {
  const decoded = validateToken(oldToken);
  return jwt.sign({ sub: decoded.userId, roles: decoded.roles }, SECRET, { expiresIn: '1h' });
}`,
    exports: ['refreshToken'],
    imports: ['validateToken', 'jwt'],
  },
  'src/middleware/auth.js': {
    content: `export function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = validateToken(token);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}`,
    exports: ['authMiddleware'],
    imports: ['validateToken'],
  },
  'src/routes/api.js': {
    content: `router.get('/profile', authMiddleware, getProfile);
router.post('/settings', authMiddleware, updateSettings);
router.get('/admin/users', authMiddleware, adminOnly, listUsers);`,
    exports: ['router'],
    imports: ['authMiddleware'],
  },
  'test/auth/validate.test.js': {
    content: `describe('validateToken', () => {
  it('should decode a valid token', () => { /* ... */ });
  it('should throw on invalid signature', () => { /* ... */ });
  // MISSING: No test for expired tokens
});`,
    exports: [],
    imports: ['validateToken'],
  },
};

// ─── Subagent Simulation ─────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Each subagent gets a FOCUSED context (only the files
// relevant to its question) and returns a STRUCTURED SUMMARY (not raw file
// contents). This keeps the main agent's context clean and focused.

async function executeInvestigationSubagent(question, relevantFiles) {
  console.log(`\n  [Subagent] Investigating: "${question}"`);
  console.log(`  [Subagent] Reading ${relevantFiles.length} files`);

  // In production, this would be a real Claude API call with the files
  // as context. Here we simulate the structured response.

  switch (true) {
    case question.includes('architecture'): {
      return {
        question,
        summary: 'Auth module follows a layered architecture: validate.js (core token validation) -> refresh.js (token renewal) -> middleware/auth.js (Express middleware) -> routes/api.js (protected endpoints).',
        keyFiles: relevantFiles,
        findings: [
          { file: 'src/auth/validate.js', finding: 'Core validation function. Uses jwt.verify() but does NOT check token expiration.' },
          { file: 'src/auth/refresh.js', finding: 'Token refresh depends on validateToken. If validate passes expired tokens, refresh will also accept them.' },
          { file: 'src/middleware/auth.js', finding: 'Express middleware wraps validateToken. Catches errors but error messages are generic (just "Unauthorized").' },
        ],
        concerns: ['No expiration check in validateToken', 'Generic error messages hide root cause'],
      };
    }

    case question.includes('callers') || question.includes('validateToken'): {
      return {
        question,
        summary: 'validateToken is called from 3 locations: refresh.js (token renewal), auth.js middleware (request authentication), and validate.test.js (tests).',
        callers: [
          { file: 'src/auth/refresh.js', function: 'refreshToken', lineContext: 'Decodes old token to create new one' },
          { file: 'src/middleware/auth.js', function: 'authMiddleware', lineContext: 'Validates token on every protected request' },
          { file: 'test/auth/validate.test.js', function: 'describe block', lineContext: 'Unit tests for validateToken' },
        ],
        callerCount: 3,
      };
    }

    case question.includes('test') || question.includes('coverage'): {
      return {
        question,
        summary: 'Test coverage is partial. validate.test.js has tests for valid tokens and invalid signatures, but NO test for expired tokens. No tests exist for refresh.js or auth.js middleware.',
        testFiles: ['test/auth/validate.test.js'],
        coveredScenarios: ['Valid token decoding', 'Invalid signature rejection'],
        missingScenarios: ['Expired token handling', 'refresh.js behavior', 'Middleware error responses'],
        coverageEstimate: '40% (2 of 5 critical scenarios)',
      };
    }

    default: {
      return {
        question,
        summary: 'Could not determine a specific investigation path for this question.',
        findings: [],
      };
    }
  }
}

// ─── Scratchpad File Management ──────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The scratchpad is a persistent file that survives beyond
// the context window. Key findings are written to it after each investigation
// phase and read back before subsequent phases.

const SCRATCHPAD_DIR = join(__dirname, '.claude');
const SCRATCHPAD_PATH = join(SCRATCHPAD_DIR, 'scratchpad.md');

function ensureScratchpadDir() {
  if (!existsSync(SCRATCHPAD_DIR)) {
    mkdirSync(SCRATCHPAD_DIR, { recursive: true });
  }
}

function writeScratchpad(content) {
  ensureScratchpadDir();
  writeFileSync(SCRATCHPAD_PATH, content, 'utf-8');
  console.log(`  [Scratchpad] Written to ${SCRATCHPAD_PATH}`);
}

function readScratchpad() {
  if (!existsSync(SCRATCHPAD_PATH)) {
    return null;
  }
  const content = readFileSync(SCRATCHPAD_PATH, 'utf-8');
  console.log(`  [Scratchpad] Read from ${SCRATCHPAD_PATH} (${content.length} chars)`);
  return content;
}

function renderScratchpadContent(findings) {
  const lines = [
    '# Investigation Scratchpad',
    `Updated: ${new Date().toISOString()}`,
    '',
  ];

  if (findings.task) {
    lines.push(`## Task: ${findings.task}`, '');
  }

  if (findings.phase) {
    lines.push(`## Current Phase: ${findings.phase}`, '');
  }

  if (findings.architecture) {
    lines.push('## Architecture', findings.architecture.summary, '');
    if (findings.architecture.concerns?.length > 0) {
      lines.push('### Concerns');
      findings.architecture.concerns.forEach(c => lines.push(`- ${c}`));
      lines.push('');
    }
  }

  if (findings.callers) {
    lines.push('## Function Callers');
    lines.push(findings.callers.summary, '');
    if (findings.callers.callers) {
      findings.callers.callers.forEach(c =>
        lines.push(`- ${c.file}: ${c.function} (${c.lineContext})`)
      );
      lines.push('');
    }
  }

  if (findings.tests) {
    lines.push('## Test Coverage');
    lines.push(findings.tests.summary, '');
    if (findings.tests.missingScenarios) {
      lines.push('### Missing Test Scenarios');
      findings.tests.missingScenarios.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }
  }

  if (findings.actionsCompleted?.length > 0) {
    lines.push('## Actions Completed');
    findings.actionsCompleted.forEach(a => lines.push(`- ${a}`));
    lines.push('');
  }

  if (findings.nextSteps?.length > 0) {
    lines.push('## Next Steps');
    findings.nextSteps.forEach(s => lines.push(`- [ ] ${s}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Structured State Export for Crash Recovery ──────────────────────────────
//
// EXAM KEY CONCEPT: Write structured state to a file so that if the session
// is interrupted, a new session can resume without repeating the investigation.

const STATE_PATH = join(SCRATCHPAD_DIR, 'state.json');

function exportState(state) {
  ensureScratchpadDir();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  console.log(`  [State] Exported to ${STATE_PATH}`);
}

function importState() {
  if (!existsSync(STATE_PATH)) return null;
  const raw = readFileSync(STATE_PATH, 'utf-8');
  console.log(`  [State] Imported from ${STATE_PATH}`);
  return JSON.parse(raw);
}

// ─── Main: Coordinated Investigation with Scratchpad ─────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Task 5.4: Codebase Context Management');
  console.log('='.repeat(60));

  // Track all findings for the scratchpad
  const allFindings = {
    task: 'Fix authentication timeout bug',
    phase: 'investigation',
    actionsCompleted: [],
    nextSteps: [],
  };

  // Check for existing state (crash recovery)
  const existingState = importState();
  if (existingState) {
    console.log('\n  [Resume] Found existing state. Resuming from:', existingState.phase);
    // In a real system, skip completed phases
  }

  // ── Phase 1: Architecture Investigation ────────────────────────────────────
  console.log('\n--- Phase 1: Architecture Investigation ---');

  const archResult = await executeInvestigationSubagent(
    'What is the architecture of the auth module?',
    ['src/auth/validate.js', 'src/auth/refresh.js', 'src/middleware/auth.js']
  );

  allFindings.architecture = archResult;
  allFindings.actionsCompleted.push('Investigated auth module architecture');
  console.log(`  Summary: ${archResult.summary}`);

  // Write findings to scratchpad after phase 1
  writeScratchpad(renderScratchpadContent(allFindings));
  exportState({ ...allFindings, phase: 'caller_analysis' });

  // ── Phase 2: Caller Analysis ───────────────────────────────────────────────
  console.log('\n--- Phase 2: Caller Analysis ---');

  // Read scratchpad to refresh context (simulates what happens after /compact)
  const scratchpadContent = readScratchpad();
  console.log(`  [Context] Scratchpad available: ${scratchpadContent ? 'yes' : 'no'}`);

  const callerResult = await executeInvestigationSubagent(
    'What functions call validateToken?',
    ['src/auth/refresh.js', 'src/middleware/auth.js', 'test/auth/validate.test.js']
  );

  allFindings.callers = callerResult;
  allFindings.actionsCompleted.push('Identified all callers of validateToken');
  console.log(`  Summary: ${callerResult.summary}`);

  // Update scratchpad with new findings
  writeScratchpad(renderScratchpadContent(allFindings));
  exportState({ ...allFindings, phase: 'test_coverage' });

  // ── Phase 3: Test Coverage Analysis ────────────────────────────────────────
  console.log('\n--- Phase 3: Test Coverage Analysis ---');

  const testResult = await executeInvestigationSubagent(
    'What is the test coverage for auth functions?',
    ['test/auth/validate.test.js']
  );

  allFindings.tests = testResult;
  allFindings.actionsCompleted.push('Analyzed test coverage');
  allFindings.phase = 'implementation';
  allFindings.nextSteps = [
    'Add expiration check in validateToken()',
    'Update error handling in authMiddleware',
    'Add expired token test case',
    'Add refresh.js test coverage',
  ];
  console.log(`  Summary: ${testResult.summary}`);

  // Final scratchpad update before implementation phase
  writeScratchpad(renderScratchpadContent(allFindings));
  exportState({ ...allFindings, phase: 'implementation' });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('Investigation Complete — Ready for Implementation');
  console.log('='.repeat(60));

  console.log('\nKey Findings (from scratchpad):');
  console.log(`  Architecture: ${allFindings.architecture.summary}`);
  console.log(`  Callers: ${allFindings.callers.summary}`);
  console.log(`  Tests: ${allFindings.tests.summary}`);

  console.log('\nNext Steps:');
  allFindings.nextSteps.forEach(s => console.log(`  - ${s}`));

  console.log('\nContext management notes:');
  console.log('  - 3 subagent delegations kept main context focused');
  console.log('  - Scratchpad preserves findings across /compact or session restart');
  console.log('  - State export enables crash recovery from any phase');
  console.log(`  - Scratchpad: ${SCRATCHPAD_PATH}`);
  console.log(`  - State: ${STATE_PATH}`);
}

main().catch(console.error);
