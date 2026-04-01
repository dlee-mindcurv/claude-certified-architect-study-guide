/**
 * Scenario 4 (Dev Productivity): Session Management for Codebase Investigation
 *
 * Exam relevance: Task 1.7 -- Manage Session and State
 *
 * This module demonstrates session management patterns for a developer
 * productivity agent that performs ongoing codebase investigations:
 *
 *   1. Named sessions for multi-day investigations
 *   2. fork_session for comparing two testing strategies in parallel
 *   3. Structured summary injection for resuming after file changes
 *   4. Session lifecycle management (create, resume, fork, archive)
 *
 * The scenario: A developer is investigating test coverage gaps in a legacy
 * codebase and wants to compare two approaches to improving coverage --
 * integration tests vs. unit tests with mocks.
 *
 * KEY EXAM CONCEPTS:
 *   - Named sessions preserve investigation state across work sessions
 *   - fork_session enables parallel exploration from a shared baseline
 *   - Structured summaries beat stale session resumption
 *   - The decision to resume vs. start fresh depends on data freshness
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const client = new Anthropic();

// ─── Session Store ──────────────────────────────────────────────────────────

const SESSIONS_DIR = join(process.cwd(), '.sessions', 'devtools');

function ensureSessionDir() {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Persist a session to disk.
 */
function saveSession(name, data) {
  ensureSessionDir();
  const filepath = join(SESSIONS_DIR, `${name}.json`);
  writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

/**
 * Load a session from disk, or return null if not found.
 */
function loadSession(name) {
  const filepath = join(SESSIONS_DIR, `${name}.json`);
  if (!existsSync(filepath)) return null;
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

/**
 * List all saved sessions.
 */
function listSessions() {
  ensureSessionDir();
  return readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
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
//
// Manages the lifecycle of investigation sessions with awareness of data
// freshness and session health.

class InvestigationSession {
  /**
   * @param {string} name - Session name
   * @param {object} config - Configuration
   * @param {string} config.model - Claude model to use
   * @param {string} config.systemPrompt - System prompt for the investigation
   * @param {number} config.maxTurns - Safety limit on turns per session
   * @param {number} config.staleThresholdMs - Time after which session is stale
   */
  constructor(name, config = {}) {
    this.name = name;
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.maxTurns = config.maxTurns || 40;
    this.staleThresholdMs = config.staleThresholdMs || 60 * 60 * 1000; // 1 hour
    this.messages = [];
    this.metadata = {
      createdAt: new Date().toISOString(),
      status: 'active',
    };
  }

  /**
   * Start a new investigation or resume an existing one.
   *
   * Decision logic:
   * 1. If no session exists: start fresh
   * 2. If session exists and is fresh: resume
   * 3. If session exists but is stale: start fresh with summary
   * 4. If session exists but is too long: start fresh with summary
   */
  async startOrResume(initialMessage, options = {}) {
    const existing = loadSession(this.name);

    if (!existing) {
      console.log(`[INVESTIGATION] Starting new session: ${this.name}`);
      this.messages = [];
      return this.sendMessage(initialMessage);
    }

    // Evaluate session health
    const health = this.evaluateHealth(existing);
    console.log(`[INVESTIGATION] Session health: ${health.status} (${health.reason})`);

    if (health.status === 'healthy' && !options.forceFresh) {
      // Resume
      console.log(`[INVESTIGATION] Resuming session: ${this.name}`);
      this.messages = existing.messages;
      this.metadata = existing.metadata;
      return this.sendMessage(initialMessage);
    }

    // Start fresh with summary
    console.log(`[INVESTIGATION] Starting fresh with summary: ${this.name}`);
    const summary = options.summary || this.extractSummary(existing);
    this.messages = [];
    return this.sendMessage(summary + '\n\n' + initialMessage);
  }

  /**
   * Evaluate the health of an existing session.
   */
  evaluateHealth(sessionData) {
    const savedAt = new Date(sessionData.metadata?.savedAt || 0);
    const ageMs = Date.now() - savedAt.getTime();
    const turns = sessionData.messages?.length ?? 0;

    if (ageMs > this.staleThresholdMs) {
      return {
        status: 'stale',
        reason: `Session is ${Math.round(ageMs / 60000)} minutes old. Tool results may be outdated.`,
      };
    }

    if (turns > this.maxTurns) {
      return {
        status: 'overloaded',
        reason: `Session has ${turns} turns (max: ${this.maxTurns}). Context window is crowded.`,
      };
    }

    return {
      status: 'healthy',
      reason: `${Math.round(ageMs / 60000)} min old, ${turns} turns.`,
    };
  }

  /**
   * Extract a structured summary from a session for use in a fresh start.
   *
   * In production, this could use Claude itself to summarize the session.
   * Here we extract the key facts from the message history.
   */
  extractSummary(sessionData) {
    const messages = sessionData.messages || [];
    const assistantMessages = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => {
        if (Array.isArray(m.content)) {
          return m.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n');
        }
        return typeof m.content === 'string' ? m.content : '';
      });

    // Take the last few assistant messages as the summary
    const recentFindings = assistantMessages.slice(-3).join('\n\n---\n\n');

    return [
      '## Prior Investigation Summary',
      '',
      'The following is a summary of findings from a prior investigation session.',
      'Note: some details may be outdated if files have changed since then.',
      '',
      recentFindings,
      '',
      '## Continuation',
      'Please incorporate these findings into your analysis, but verify any',
      'file-specific details against the current state of the codebase.',
    ].join('\n');
  }

  /**
   * Send a message and get a response.
   */
  async sendMessage(userMessage) {
    this.messages.push({ role: 'user', content: userMessage });

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: this.systemPrompt,
      messages: this.messages,
    });

    this.messages.push({ role: 'assistant', content: response.content });
    this.save();

    return response;
  }

  /**
   * Fork this session into a new branch for parallel exploration.
   *
   * Creates a new InvestigationSession with a copy of the current
   * message history. The fork diverges independently from this point.
   */
  fork(forkName, config = {}) {
    const forked = new InvestigationSession(forkName, {
      model: this.model,
      systemPrompt: this.systemPrompt,
      ...config,
    });

    // Copy current history as the fork's baseline
    forked.messages = [...this.messages];
    forked.metadata = {
      ...this.metadata,
      createdAt: new Date().toISOString(),
      forkedFrom: this.name,
      forkPoint: this.messages.length,
      status: 'active',
    };

    forked.save();
    console.log(`[INVESTIGATION] Forked "${this.name}" -> "${forkName}" at turn ${this.messages.length}`);
    return forked;
  }

  /**
   * Save the current session state.
   */
  save() {
    this.metadata.savedAt = new Date().toISOString();
    this.metadata.turnCount = this.messages.length;
    saveSession(this.name, {
      messages: this.messages,
      metadata: this.metadata,
    });
  }

  /**
   * Archive the session (mark as completed, keep for reference).
   */
  archive(findings = '') {
    this.metadata.status = 'archived';
    this.metadata.archivedAt = new Date().toISOString();
    this.metadata.finalFindings = findings;
    this.save();
    console.log(`[INVESTIGATION] Archived session: ${this.name}`);
  }
}

// ─── Default System Prompt for Dev Productivity ─────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a developer productivity agent helping investigate and improve a codebase.

Your capabilities:
- Analyze code structure and architecture
- Identify test coverage gaps
- Suggest testing strategies
- Compare implementation approaches
- Provide actionable refactoring recommendations

When investigating:
1. Start with the high-level structure
2. Identify the most impactful areas
3. Provide specific, actionable recommendations with code examples
4. Track what you have and have not examined

Always maintain a running summary of your findings so far.`;

// ─── Demo: Testing Strategy Comparison with fork_session ────────────────────

/**
 * Demonstrate using fork_session to compare two testing strategies:
 *   Branch A: Integration tests (test the full API endpoint)
 *   Branch B: Unit tests with mocks (test individual functions)
 */
async function demoTestingStrategyComparison() {
  console.log('=== Dev Productivity: Testing Strategy Comparison ===\n');

  // Phase 1: Baseline investigation
  console.log('--- Phase 1: Baseline Investigation ---\n');

  const baseline = new InvestigationSession('test-coverage-baseline', {
    staleThresholdMs: 5 * 60 * 1000, // 5 minutes for demo
  });

  await baseline.startOrResume(
    'I need to improve test coverage for our order processing module. ' +
    'Currently we have these files with no tests:\n\n' +
    '- src/services/order-service.js (280 lines, core business logic)\n' +
    '- src/services/payment-service.js (350 lines, Stripe integration)\n' +
    '- src/utils/helpers.js (400 lines, utility functions)\n\n' +
    'Please analyze these coverage gaps and identify the highest-priority ' +
    'targets for new tests.'
  );

  // Phase 2: Fork to explore two strategies
  console.log('\n--- Phase 2: Fork for Parallel Exploration ---\n');

  // Branch A: Integration testing approach
  const branchA = baseline.fork('test-strategy-integration');
  await branchA.sendMessage(
    'Let us explore an integration testing approach for order-service.js. ' +
    'Write tests that exercise the full API endpoint (POST /api/orders) ' +
    'with a real database connection. Focus on:\n' +
    '1. Happy path: successful order creation\n' +
    '2. Validation failures\n' +
    '3. Database constraint violations\n' +
    '4. Concurrent order submission'
  );

  // Branch B: Unit testing with mocks approach
  const branchB = baseline.fork('test-strategy-unit-mocks');
  await branchB.sendMessage(
    'Let us explore a unit testing approach for order-service.js. ' +
    'Write tests that mock all external dependencies (database, payment, ' +
    'email) and test each function in isolation. Focus on:\n' +
    '1. Business logic correctness\n' +
    '2. Edge cases in calculations\n' +
    '3. Error handling paths\n' +
    '4. State transitions'
  );

  // Phase 3: Deepen each branch
  console.log('\n--- Phase 3: Deepen Each Branch ---\n');

  await branchA.sendMessage(
    'What are the tradeoffs of this integration testing approach? ' +
    'Consider: test execution time, flakiness risk, setup complexity, ' +
    'and how well it catches bugs in production.'
  );

  await branchB.sendMessage(
    'What are the tradeoffs of this unit testing approach? ' +
    'Consider: maintenance burden of mocks, risk of mocks diverging from ' +
    'reality, execution speed, and coverage of integration points.'
  );

  // Phase 4: Compare in a fresh session
  console.log('\n--- Phase 4: Compare Strategies ---\n');

  const comparison = new InvestigationSession('test-strategy-comparison');
  await comparison.sendMessage(
    'I explored two testing strategies for our order-service.js module ' +
    'and need to decide which to adopt.\n\n' +
    '## Strategy A: Integration Tests\n' +
    '- Tests the full API endpoint with real database\n' +
    '- Catches integration issues but slower to run\n' +
    '- Setup requires test database and fixtures\n\n' +
    '## Strategy B: Unit Tests with Mocks\n' +
    '- Tests each function in isolation\n' +
    '- Fast execution but mocks may diverge from reality\n' +
    '- Lower setup complexity\n\n' +
    'Which strategy should we adopt, or should we use a combination? ' +
    'Consider our constraints: small team, CI pipeline runs on every push, ' +
    'and we need to add coverage quickly.'
  );

  // Archive completed branches
  branchA.archive('Integration testing approach explored. Good for critical paths.');
  branchB.archive('Unit testing approach explored. Good for business logic coverage.');

  // Show session list
  console.log('\n--- Session Summary ---\n');
  const sessions = listSessions();
  for (const s of sessions) {
    console.log(`  ${s.name}: ${s.turns} turns, ${s.status} (saved: ${s.savedAt})`);
  }

  return { baseline, branchA, branchB, comparison };
}

// ─── Demo: Resumption with File Changes ─────────────────────────────────────

/**
 * Demonstrate the resume-vs-fresh decision when files have changed.
 */
async function demoStaleSessionHandling() {
  console.log('\n=== Stale Session Handling ===\n');

  // Simulate a session that was saved an hour ago
  const oldSession = new InvestigationSession('old-investigation', {
    staleThresholdMs: 30 * 60 * 1000, // 30 minutes
  });

  // Manually set stale metadata
  saveSession('old-investigation', {
    messages: [
      { role: 'user', content: 'Investigate the auth module.' },
      {
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'I examined src/auth.js and found it uses JWT tokens with a hardcoded secret.',
        }],
      },
    ],
    metadata: {
      savedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      turnCount: 2,
      status: 'active',
    },
  });

  // Try to resume -- should recommend fresh start
  const health = oldSession.evaluateHealth(loadSession('old-investigation'));
  console.log(`Session health: ${health.status}`);
  console.log(`Reason: ${health.reason}`);

  if (health.status !== 'healthy') {
    console.log('\nStarting fresh with structured summary instead of resuming.');
    console.log('This avoids reasoning about stale file contents.\n');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Stale session demo (no API key required)
  await demoStaleSessionHandling();

  // Show session listing
  console.log('--- All Sessions ---\n');
  for (const s of listSessions()) {
    console.log(`  ${s.name}: ${s.turns} turns [${s.status}]`);
  }

  // Full demo requires API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\nSet ANTHROPIC_API_KEY to run the full testing strategy comparison demo.\n');
    console.log('That demo would:');
    console.log('  1. Create a baseline investigation session');
    console.log('  2. Fork into two branches (integration tests vs. unit tests)');
    console.log('  3. Deepen each branch with follow-up questions');
    console.log('  4. Compare strategies in a fresh session');
    console.log('  5. Archive completed branches');
    return;
  }

  await demoTestingStrategyComparison();
}

main().catch(console.error);

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  InvestigationSession,
  saveSession,
  loadSession,
  listSessions,
  demoTestingStrategyComparison,
  demoStaleSessionHandling,
};
