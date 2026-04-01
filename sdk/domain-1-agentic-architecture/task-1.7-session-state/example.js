/**
 * Task 1.7 -- Session and State Management: Reference Implementation
 *
 * Exam relevance: Scenario 4 (Dev Productivity)
 *
 * This file demonstrates four session management patterns:
 *
 *   1. Named session resumption (--resume conceptual pattern)
 *   2. fork_session for parallel exploration branches
 *   3. Structured summary injection for fresh sessions with prior context
 *   4. Decision logic: resume vs. fresh start
 *
 * NOTE: Claude Code's --resume and fork_session are CLI/runtime features.
 * This file shows the UNDERLYING API PATTERNS that implement them. In
 * production, you would use the CLI directly. Here we model the mechanics
 * with @anthropic-ai/sdk to illustrate what happens under the hood.
 *
 * KEY EXAM CONCEPTS:
 *   - Resume when tool results are still fresh
 *   - Start fresh + summary when files have changed (stale tool results)
 *   - fork_session for comparing two approaches from a shared baseline
 *   - Structured summaries preserve essential context in minimal tokens
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const client = new Anthropic();

// ─── Session Storage ────────────────────────────────────────────────────────
//
// In Claude Code, sessions are managed by the runtime. Here we model the
// storage layer to show how session data flows.

const SESSION_DIR = join(process.cwd(), '.sessions');

/**
 * Save a session's conversation history to disk.
 *
 * This is conceptually what happens when Claude Code persists a named session.
 * The full message array is stored, including all tool_use and tool_result
 * blocks.
 */
function saveSession(sessionName, messages, metadata = {}) {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }

  const sessionData = {
    name: sessionName,
    messages,
    metadata: {
      ...metadata,
      savedAt: new Date().toISOString(),
      turnCount: messages.length,
    },
  };

  const path = join(SESSION_DIR, `${sessionName}.json`);
  writeFileSync(path, JSON.stringify(sessionData, null, 2));
  console.log(`[SESSION] Saved "${sessionName}" (${messages.length} messages)`);
  return path;
}

/**
 * Load a session's conversation history from disk.
 *
 * This is conceptually what --resume does: load the full message array and
 * continue the conversation from where it left off.
 */
function loadSession(sessionName) {
  const path = join(SESSION_DIR, `${sessionName}.json`);

  if (!existsSync(path)) {
    return null;
  }

  const data = JSON.parse(readFileSync(path, 'utf-8'));
  console.log(`[SESSION] Loaded "${sessionName}" (${data.messages.length} messages, saved at ${data.metadata.savedAt})`);
  return data;
}

// ─── Pattern 1: Named Session Resumption ────────────────────────────────────
//
// CLI equivalent:
//   claude --session "my-investigation"    # start
//   claude --resume "my-investigation"     # resume
//
// When resumed, the full conversation history is loaded. The model sees all
// prior messages, tool calls, and tool results.

/**
 * Start or resume a named session.
 *
 * If the session exists, loads its history and continues.
 * If not, creates a new session with the given initial message.
 */
async function startOrResumeSession(sessionName, userMessage, options = {}) {
  const existing = loadSession(sessionName);

  let messages;

  if (existing && !options.forceNew) {
    console.log(`[SESSION] Resuming "${sessionName}"`);
    messages = existing.messages;

    // Append the new user message to the existing history
    messages.push({ role: 'user', content: userMessage });
  } else {
    console.log(`[SESSION] Starting new session "${sessionName}"`);
    messages = [{ role: 'user', content: userMessage }];
  }

  // Make the API call with the (possibly resumed) history
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages,
  });

  // Append the assistant's response
  messages.push({ role: 'assistant', content: response.content });

  // Save the updated session
  saveSession(sessionName, messages);

  return {
    response,
    messages,
    isResumed: !!existing && !options.forceNew,
  };
}

// ─── Pattern 2: fork_session ────────────────────────────────────────────────
//
// fork_session creates a new session branching from an existing one.
// Both sessions share history up to the fork point, then diverge.
//
// Use case: Explore two alternative approaches to a problem. Each branch
// gets its own independent conversation, but both start from the same
// baseline of findings.

/**
 * Fork a session at its current point.
 *
 * Creates a new session with a copy of the parent's message history.
 * The forked session diverges independently from this point.
 *
 * @param {string} parentSessionName - Session to fork from
 * @param {string} forkName - Name for the new forked session
 * @param {string} forkMessage - Initial message for the forked branch
 * @returns {object} The forked session's first response
 */
async function forkSession(parentSessionName, forkName, forkMessage) {
  const parent = loadSession(parentSessionName);

  if (!parent) {
    throw new Error(`Cannot fork: session "${parentSessionName}" not found`);
  }

  console.log(`[SESSION] Forking "${parentSessionName}" -> "${forkName}"`);
  console.log(`  Baseline: ${parent.messages.length} messages from parent`);

  // Copy the parent's history up to the fork point
  const forkedMessages = [...parent.messages];

  // Add the fork-specific message
  forkedMessages.push({ role: 'user', content: forkMessage });

  // Make the API call on the forked branch
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: forkedMessages,
  });

  forkedMessages.push({ role: 'assistant', content: response.content });

  // Save as a new independent session
  saveSession(forkName, forkedMessages, {
    forkedFrom: parentSessionName,
    forkPoint: parent.messages.length,
  });

  return {
    response,
    messages: forkedMessages,
    parentSession: parentSessionName,
    forkPoint: parent.messages.length,
  };
}

// ─── Pattern 3: Structured Summary Injection ────────────────────────────────
//
// When starting fresh (because tool results are stale), inject a structured
// summary of key findings as the first message. This preserves essential
// context without carrying stale data.

/**
 * Create a structured summary from a session's findings.
 *
 * In production, this summary would be written by the developer or extracted
 * from the session's key conclusions. Here we show the format and intent.
 */
function createStructuredSummary(findings) {
  const sections = [];

  sections.push('## Prior Investigation Summary');
  sections.push('');

  if (findings.keyFacts?.length > 0) {
    sections.push('### Verified Facts');
    for (const fact of findings.keyFacts) {
      sections.push(`- ${fact}`);
    }
    sections.push('');
  }

  if (findings.filesExamined?.length > 0) {
    sections.push('### Key Files');
    for (const file of findings.filesExamined) {
      sections.push(`- \`${file.path}\`: ${file.notes}`);
    }
    sections.push('');
  }

  if (findings.openQuestions?.length > 0) {
    sections.push('### Open Questions');
    for (const question of findings.openQuestions) {
      sections.push(`- ${question}`);
    }
    sections.push('');
  }

  if (findings.changedSinceLastSession?.length > 0) {
    sections.push('### Changes Since Last Session');
    sections.push('The following files changed since the prior investigation:');
    for (const change of findings.changedSinceLastSession) {
      sections.push(`- \`${change.file}\`: ${change.description}`);
    }
    sections.push('');
  }

  sections.push('### Current Task');
  sections.push(findings.currentTask || 'Continue the investigation.');

  return sections.join('\n');
}

/**
 * Start a fresh session with context from a prior investigation.
 *
 * This is the recommended approach when:
 * - Files have changed since the last session (stale tool results)
 * - The prior session's context window is nearly full
 * - You want to focus on a specific follow-up task
 */
async function startFreshWithSummary(sessionName, findings) {
  const summary = createStructuredSummary(findings);

  console.log(`[SESSION] Starting fresh session "${sessionName}" with prior context`);
  console.log(`  Summary length: ${summary.length} characters`);

  const messages = [{ role: 'user', content: summary }];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages,
  });

  messages.push({ role: 'assistant', content: response.content });
  saveSession(sessionName, messages, { startedWithSummary: true });

  return { response, messages, summary };
}

// ─── Pattern 4: Resume vs. Fresh Decision Logic ────────────────────────────
//
// Automated decision logic for whether to resume or start fresh.

/**
 * Determine whether to resume an existing session or start fresh.
 *
 * Decision factors:
 * 1. Does the session exist?
 * 2. How old is it? (Stale threshold: 1 hour by default)
 * 3. Have relevant files changed since the session was saved?
 * 4. How large is the session? (Turn threshold: 40 by default)
 *
 * @param {string} sessionName - Session to evaluate
 * @param {object} options - Decision parameters
 * @param {string[]} options.watchFiles - Files to check for changes
 * @param {number} options.staleThresholdMs - Max age before considered stale
 * @param {number} options.maxTurns - Max turns before recommending fresh start
 * @returns {{ action: 'resume'|'fresh', reason: string }}
 */
function shouldResumeOrStartFresh(sessionName, options = {}) {
  const {
    staleThresholdMs = 60 * 60 * 1000, // 1 hour
    maxTurns = 40,
  } = options;

  const session = loadSession(sessionName);

  // No existing session -- must start fresh
  if (!session) {
    return { action: 'fresh', reason: 'No existing session found.' };
  }

  // Check age
  const savedAt = new Date(session.metadata.savedAt);
  const ageMs = Date.now() - savedAt.getTime();

  if (ageMs > staleThresholdMs) {
    return {
      action: 'fresh',
      reason: `Session is ${Math.round(ageMs / 60000)} minutes old. ` +
              `Tool results may be stale. Start fresh with a summary of key findings.`,
    };
  }

  // Check turn count
  if (session.metadata.turnCount > maxTurns) {
    return {
      action: 'fresh',
      reason: `Session has ${session.metadata.turnCount} turns (threshold: ${maxTurns}). ` +
              `Context window is likely crowded. Start fresh with a summary.`,
    };
  }

  // Session is recent and manageable -- resume
  return {
    action: 'resume',
    reason: `Session is ${Math.round(ageMs / 60000)} minutes old with ` +
            `${session.metadata.turnCount} turns. Safe to resume.`,
  };
}

// ─── Demo ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Task 1.7: Session and State Management ===\n');

  // Demo 1: Decision logic (no API key required)
  console.log('--- Demo 1: Resume vs. Fresh Decision Logic ---\n');

  // Simulate a saved session
  saveSession('demo-investigation', [
    { role: 'user', content: 'Investigate the auth system' },
    { role: 'assistant', content: [{ type: 'text', text: 'I will examine the auth module...' }] },
  ]);

  const decision = shouldResumeOrStartFresh('demo-investigation');
  console.log(`Decision: ${decision.action}`);
  console.log(`Reason: ${decision.reason}\n`);

  // Demo 2: Structured summary
  console.log('--- Demo 2: Structured Summary ---\n');

  const summary = createStructuredSummary({
    keyFacts: [
      'Session tokens stored in Redis with 24h TTL',
      'Token refresh handled by middleware/session.js',
      'Race condition exists when concurrent requests refresh tokens',
    ],
    filesExamined: [
      { path: 'src/middleware/session.js', notes: 'Token refresh logic, lines 45-80' },
      { path: 'src/services/redis-client.js', notes: 'Connection pooling configuration' },
    ],
    openQuestions: [
      'Does Redis support atomic compare-and-swap for token refresh?',
      'What is the actual concurrency level during peak traffic?',
    ],
    changedSinceLastSession: [
      { file: 'src/middleware/session.js', description: 'Added logging (commit abc123)' },
    ],
    currentTask: 'Implement a fix for the token refresh race condition using Redis WATCH/MULTI.',
  });

  console.log(summary);

  // Demo 3: Full flow (requires API key)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n--- Skipping live API demos (set ANTHROPIC_API_KEY to run) ---\n');
    console.log('With an API key, this example would demonstrate:');
    console.log('  1. Starting a named session with an investigation task');
    console.log('  2. Resuming the session to continue work');
    console.log('  3. Forking the session to explore two approaches in parallel');
    console.log('  4. Starting fresh with a structured summary when data is stale');
    return;
  }

  // Start a session
  console.log('\n--- Demo 3: Named Session ---\n');
  const session1 = await startOrResumeSession(
    'auth-investigation',
    'I need to investigate a race condition in our token refresh system. ' +
    'Where should I start looking?'
  );
  console.log('Response:', session1.response.content[0]?.text?.substring(0, 200) + '...');

  // Resume the session
  console.log('\n--- Demo 4: Resume Session ---\n');
  const session2 = await startOrResumeSession(
    'auth-investigation',
    'I found that middleware/session.js handles token refresh. The Redis ' +
    'operations are not atomic. What are my options for fixing this?'
  );
  console.log('Resumed:', session2.isResumed);
  console.log('Response:', session2.response.content[0]?.text?.substring(0, 200) + '...');

  // Fork to explore two approaches
  console.log('\n--- Demo 5: fork_session ---\n');
  const fork1 = await forkSession(
    'auth-investigation',
    'auth-approach-A',
    'Let us explore Approach A: Use Redis WATCH/MULTI for optimistic locking on token refresh.'
  );
  console.log('Fork A response:', fork1.response.content[0]?.text?.substring(0, 200) + '...');

  const fork2 = await forkSession(
    'auth-investigation',
    'auth-approach-B',
    'Let us explore Approach B: Use a distributed lock (Redlock) to serialize token refresh operations.'
  );
  console.log('Fork B response:', fork2.response.content[0]?.text?.substring(0, 200) + '...');

  // Start fresh with summary (simulating stale data scenario)
  console.log('\n--- Demo 6: Fresh Start with Summary ---\n');
  const fresh = await startFreshWithSummary('auth-investigation-v2', {
    keyFacts: [
      'Race condition confirmed in middleware/session.js',
      'Two approaches evaluated: WATCH/MULTI vs Redlock',
      'WATCH/MULTI is simpler but fails under high contention',
    ],
    filesExamined: [
      { path: 'src/middleware/session.js', notes: 'Lines 45-80, token refresh' },
    ],
    changedSinceLastSession: [
      { file: 'src/middleware/session.js', description: 'Added retry logic (new commit)' },
    ],
    currentTask: 'Implement the Redlock approach given the new retry logic.',
  });
  console.log('Fresh response:', fresh.response.content[0]?.text?.substring(0, 200) + '...');
}

main().catch(console.error);

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  saveSession,
  loadSession,
  startOrResumeSession,
  forkSession,
  createStructuredSummary,
  startFreshWithSummary,
  shouldResumeOrStartFresh,
};
