/**
 * Scenario 4 (Dev Productivity): Session Management via Agent SDK
 *
 * Exam relevance: Task 1.7 -- Manage Session and State
 *
 * Demonstrates session management for a developer productivity agent:
 *
 *   1. Named sessions for multi-day investigations
 *   2. fork_session for comparing two testing strategies in parallel
 *   3. Structured summary injection for resuming after file changes
 *   4. Session lifecycle management (create, resume, fork, archive)
 *
 * EXAM KEY CONCEPTS:
 *   - Named sessions preserve investigation state across work sessions
 *   - fork_session enables parallel exploration from a shared baseline
 *   - Structured summaries beat stale session resumption
 *   - The decision to resume vs. start fresh depends on data freshness
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

// ─── Session Store ──────────────────────────────────────────────────────────

const SESSIONS_DIR = join(process.cwd(), '.sessions', 'devtools');

function ensureSessionDir() {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
}

function saveSession(name, data) {
  ensureSessionDir();
  writeFileSync(join(SESSIONS_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

function loadSession(name) {
  const filepath = join(SESSIONS_DIR, `${name}.json`);
  if (!existsSync(filepath)) return null;
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

function listSessions() {
  ensureSessionDir();
  return readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8'));
      return {
        name: basename(f, '.json'),
        turns: data.messages?.length ?? 0,
        savedAt: data.metadata?.savedAt ?? 'unknown',
        status: data.metadata?.status ?? 'active',
      };
    });
}

// ─── Investigation Session Manager ──────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a developer productivity agent helping investigate and improve a codebase.
When investigating:
1. Start with the high-level structure
2. Identify the most impactful areas
3. Provide specific, actionable recommendations
4. Track what you have and have not examined

Always maintain a running summary of your findings.`;

class InvestigationSession {
  constructor(name, config = {}) {
    this.name = name;
    this.systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.maxTurns = config.maxTurns || 40;
    this.staleThresholdMs = config.staleThresholdMs || 60 * 60 * 1000;
    this.messages = [];
    this.metadata = { createdAt: new Date().toISOString(), status: 'active' };
  }

  /**
   * Start or resume an investigation session.
   *
   * Decision logic:
   * 1. No session exists: start fresh
   * 2. Session exists and is fresh: resume
   * 3. Session exists but is stale/overloaded: start fresh with summary
   */
  async startOrResume(initialMessage, options = {}) {
    const existing = loadSession(this.name);

    if (!existing) {
      console.log(`[INVESTIGATION] Starting new session: ${this.name}`);
      this.messages = [];
      return this.sendMessage(initialMessage);
    }

    const health = this.evaluateHealth(existing);
    console.log(`[INVESTIGATION] Session health: ${health.status} (${health.reason})`);

    if (health.status === 'healthy' && !options.forceFresh) {
      console.log(`[INVESTIGATION] Resuming session: ${this.name}`);
      this.messages = existing.messages;
      this.metadata = existing.metadata;
      return this.sendMessage(initialMessage);
    }

    console.log(`[INVESTIGATION] Starting fresh with summary: ${this.name}`);
    const summary = options.summary || this.extractSummary(existing);
    this.messages = [];
    return this.sendMessage(summary + '\n\n' + initialMessage);
  }

  evaluateHealth(sessionData) {
    const savedAt = new Date(sessionData.metadata?.savedAt || 0);
    const ageMs = Date.now() - savedAt.getTime();
    const turns = sessionData.messages?.length ?? 0;

    if (ageMs > this.staleThresholdMs) {
      return { status: 'stale', reason: `${Math.round(ageMs / 60000)} min old. Tool results may be outdated.` };
    }
    if (turns > this.maxTurns) {
      return { status: 'overloaded', reason: `${turns} turns (max: ${this.maxTurns}). Context crowded.` };
    }
    return { status: 'healthy', reason: `${Math.round(ageMs / 60000)} min old, ${turns} turns.` };
  }

  extractSummary(sessionData) {
    const messages = sessionData.messages || [];
    const assistantMessages = messages
      .filter(m => m.role === 'assistant')
      .map(m => (typeof m.content === 'string') ? m.content : '');
    const recentFindings = assistantMessages.slice(-3).join('\n\n---\n\n');

    return [
      '## Prior Investigation Summary',
      '',
      recentFindings,
      '',
      '## Continuation',
      'Incorporate these findings but verify file-specific details.',
    ].join('\n');
  }

  async sendMessage(userMessage) {
    this.messages.push({ role: 'user', content: userMessage });

    let responseText = '';
    for await (const message of query({
      prompt: userMessage,
      options: {
        systemPrompt: this.systemPrompt,
        maxTurns: 1,
      },
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        responseText = message.result;
      }
    }

    this.messages.push({ role: 'assistant', content: responseText });
    this.save();
    return responseText;
  }

  /**
   * Fork this session into a new branch for parallel exploration.
   */
  fork(forkName, config = {}) {
    const forked = new InvestigationSession(forkName, {
      systemPrompt: this.systemPrompt,
      ...config,
    });
    forked.messages = [...this.messages];
    forked.metadata = {
      ...this.metadata,
      createdAt: new Date().toISOString(),
      forkedFrom: this.name,
      forkPoint: this.messages.length,
      status: 'active',
    };
    forked.save();
    console.log(`[INVESTIGATION] Forked "${this.name}" -> "${forkName}"`);
    return forked;
  }

  save() {
    this.metadata.savedAt = new Date().toISOString();
    this.metadata.turnCount = this.messages.length;
    saveSession(this.name, { messages: this.messages, metadata: this.metadata });
  }

  archive(findings = '') {
    this.metadata.status = 'archived';
    this.metadata.archivedAt = new Date().toISOString();
    this.metadata.finalFindings = findings;
    this.save();
    console.log(`[INVESTIGATION] Archived session: ${this.name}`);
  }
}

// ─── Demo: Testing Strategy Comparison ──────────────────────────────────────

async function demoTestingStrategyComparison() {
  console.log('=== Dev Productivity: Testing Strategy Comparison ===\n');

  // Phase 1: Baseline investigation
  console.log('--- Phase 1: Baseline Investigation ---\n');
  const baseline = new InvestigationSession('test-coverage-baseline', {
    staleThresholdMs: 5 * 60 * 1000,
  });

  await baseline.startOrResume(
    'I need to improve test coverage for our order processing module. ' +
    'Currently untested: order-service.js (280 lines), payment-service.js (350 lines), helpers.js (400 lines). ' +
    'Analyze these coverage gaps and identify highest-priority targets.'
  );

  // Phase 2: Fork to explore two strategies
  console.log('\n--- Phase 2: Fork for Parallel Exploration ---\n');

  const branchA = baseline.fork('test-strategy-integration');
  await branchA.sendMessage(
    'Explore an integration testing approach for order-service.js. ' +
    'Write tests that exercise the full API endpoint with a real database.'
  );

  const branchB = baseline.fork('test-strategy-unit-mocks');
  await branchB.sendMessage(
    'Explore a unit testing approach for order-service.js. ' +
    'Mock all external dependencies and test each function in isolation.'
  );

  // Phase 3: Compare
  console.log('\n--- Phase 3: Compare Strategies ---\n');

  const comparison = new InvestigationSession('test-strategy-comparison');
  await comparison.sendMessage(
    'I explored two testing strategies and need to decide:\n\n' +
    '## Strategy A: Integration Tests\n- Full API endpoint testing with real DB\n\n' +
    '## Strategy B: Unit Tests with Mocks\n- Isolated function testing\n\n' +
    'Which should we adopt for a small team with CI on every push?'
  );

  branchA.archive('Integration testing approach explored.');
  branchB.archive('Unit testing approach explored.');

  console.log('\n--- Session Summary ---\n');
  for (const s of listSessions()) {
    console.log(`  ${s.name}: ${s.turns} turns [${s.status}]`);
  }
}

// ─── Demo: Stale Session Handling ───────────────────────────────────────────

async function demoStaleSessionHandling() {
  console.log('\n=== Stale Session Handling ===\n');

  const oldSession = new InvestigationSession('old-investigation', {
    staleThresholdMs: 30 * 60 * 1000,
  });

  // Simulate a 2-hour-old session
  saveSession('old-investigation', {
    messages: [
      { role: 'user', content: 'Investigate the auth module.' },
      { role: 'assistant', content: 'Found JWT tokens with hardcoded secret in src/auth.js.' },
    ],
    metadata: {
      savedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      turnCount: 2,
      status: 'active',
    },
  });

  const health = oldSession.evaluateHealth(loadSession('old-investigation'));
  console.log(`Session health: ${health.status}`);
  console.log(`Reason: ${health.reason}`);

  if (health.status !== 'healthy') {
    console.log('\nRecommendation: Start fresh with structured summary.\n');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await demoStaleSessionHandling();

  console.log('--- All Sessions ---\n');
  for (const s of listSessions()) {
    console.log(`  ${s.name}: ${s.turns} turns [${s.status}]`);
  }

  await demoTestingStrategyComparison();
}

main().catch(console.error);

export {
  InvestigationSession,
  saveSession,
  loadSession,
  listSessions,
  demoTestingStrategyComparison,
  demoStaleSessionHandling,
};
