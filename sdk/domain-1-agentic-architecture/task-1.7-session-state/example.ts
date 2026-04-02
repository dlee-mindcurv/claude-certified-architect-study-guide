/**
 * Task 1.7 -- Session and State Management via Agent SDK
 *
 * Exam relevance: Scenario 4 (Dev Productivity)
 *
 * Demonstrates four session management patterns:
 *
 *   1. Named session resumption (multi-turn conversations via query())
 *   2. fork_session for parallel exploration branches
 *   3. Structured summary injection for fresh sessions with prior context
 *   4. Decision logic: resume vs. fresh start
 *
 * EXAM KEY CONCEPTS:
 *   - Resume when tool results are still fresh
 *   - Start fresh + summary when files have changed (stale tool results)
 *   - fork_session for comparing two approaches from a shared baseline
 *   - Structured summaries preserve essential context in minimal tokens
 *
 * NOTE: These patterns model what Claude Code's --resume and fork_session
 * do under the hood. The Agent SDK's query() is used for each turn.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionMessage {
  role: string;
  content: string;
}

interface SessionMetadata {
  savedAt?: string;
  turnCount?: number;
  startedWithSummary?: boolean;
  forkedFrom?: string;
  forkPoint?: number;
  [key: string]: unknown;
}

interface SessionData {
  name: string;
  messages: SessionMessage[];
  metadata: SessionMetadata;
}

interface StructuredFindings {
  keyFacts?: string[];
  filesExamined?: { path: string; notes: string }[];
  openQuestions?: string[];
  changedSinceLastSession?: { file: string; description: string }[];
  currentTask?: string;
}

// ─── Session Storage ────────────────────────────────────────────────────────

const SESSION_DIR = join(process.cwd(), '.sessions');

function saveSession(sessionName: string, messages: SessionMessage[], metadata: SessionMetadata = {}): string {
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

function loadSession(sessionName: string): SessionData | null {
  const path = join(SESSION_DIR, `${sessionName}.json`);
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, 'utf-8')) as SessionData;
  console.log(`[SESSION] Loaded "${sessionName}" (${data.messages.length} messages)`);
  return data;
}

// ─── Pattern 1: Named Session with query() ──────────────────────────────────
//
// Each call to query() is one turn. Session state is managed externally
// by saving/loading the conversation messages array.

async function startOrResumeSession(sessionName: string, userMessage: string, options: { forceNew?: boolean } = {}) {
  const existing = loadSession(sessionName);

  let sessionMessages: SessionMessage[];

  if (existing && !options.forceNew) {
    console.log(`[SESSION] Resuming "${sessionName}"`);
    sessionMessages = existing.messages;
  } else {
    console.log(`[SESSION] Starting new session "${sessionName}"`);
    sessionMessages = [];
  }

  // Add new user message
  sessionMessages.push({ role: 'user', content: userMessage });

  // Run a single turn via query()
  let responseText = '';
  for await (const message of query({
    prompt: userMessage,
    options: { maxTurns: 1 },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      responseText = message.result;
    }
  }

  // Record the response
  sessionMessages.push({ role: 'assistant', content: responseText });

  // Persist
  saveSession(sessionName, sessionMessages);

  return {
    response: responseText,
    messages: sessionMessages,
    isResumed: !!existing && !options.forceNew,
  };
}

// ─── Pattern 2: fork_session ────────────────────────────────────────────────
//
// Fork creates a new session branching from an existing one.
// Both share history up to the fork point, then diverge.

async function forkSession(parentSessionName: string, forkName: string, forkMessage: string) {
  const parent = loadSession(parentSessionName);
  if (!parent) {
    throw new Error(`Cannot fork: session "${parentSessionName}" not found`);
  }

  console.log(`[SESSION] Forking "${parentSessionName}" -> "${forkName}"`);

  // Copy parent history
  const forkedMessages = [...parent.messages];
  forkedMessages.push({ role: 'user', content: forkMessage });

  let responseText = '';
  for await (const message of query({
    prompt: forkMessage,
    options: { maxTurns: 1 },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      responseText = message.result;
    }
  }

  forkedMessages.push({ role: 'assistant', content: responseText });

  saveSession(forkName, forkedMessages, {
    forkedFrom: parentSessionName,
    forkPoint: parent.messages.length,
  });

  return { response: responseText, messages: forkedMessages };
}

// ─── Pattern 3: Structured Summary Injection ────────────────────────────────
//
// When starting fresh (stale tool results), inject a structured summary
// of key findings as the first message.

function createStructuredSummary(findings: StructuredFindings): string {
  const sections = ['## Prior Investigation Summary', ''];

  if (findings.keyFacts && findings.keyFacts.length > 0) {
    sections.push('### Verified Facts');
    for (const fact of findings.keyFacts) sections.push(`- ${fact}`);
    sections.push('');
  }

  if (findings.filesExamined && findings.filesExamined.length > 0) {
    sections.push('### Key Files');
    for (const file of findings.filesExamined) sections.push(`- \`${file.path}\`: ${file.notes}`);
    sections.push('');
  }

  if (findings.openQuestions && findings.openQuestions.length > 0) {
    sections.push('### Open Questions');
    for (const q of findings.openQuestions) sections.push(`- ${q}`);
    sections.push('');
  }

  if (findings.changedSinceLastSession && findings.changedSinceLastSession.length > 0) {
    sections.push('### Changes Since Last Session');
    for (const c of findings.changedSinceLastSession) sections.push(`- \`${c.file}\`: ${c.description}`);
    sections.push('');
  }

  sections.push('### Current Task');
  sections.push(findings.currentTask || 'Continue the investigation.');

  return sections.join('\n');
}

async function startFreshWithSummary(sessionName: string, findings: StructuredFindings) {
  const summary = createStructuredSummary(findings);
  console.log(`[SESSION] Starting fresh "${sessionName}" with prior context`);

  let responseText = '';
  for await (const message of query({
    prompt: summary,
    options: { maxTurns: 1 },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      responseText = message.result;
    }
  }

  const messages = [
    { role: 'user', content: summary },
    { role: 'assistant', content: responseText },
  ];
  saveSession(sessionName, messages, { startedWithSummary: true });

  return { response: responseText, messages, summary };
}

// ─── Pattern 4: Resume vs. Fresh Decision Logic ────────────────────────────

function shouldResumeOrStartFresh(sessionName: string, options: { staleThresholdMs?: number; maxTurns?: number } = {}): { action: string; reason: string } {
  const { staleThresholdMs = 60 * 60 * 1000, maxTurns = 40 } = options;

  const session = loadSession(sessionName);
  if (!session) {
    return { action: 'fresh', reason: 'No existing session found.' };
  }

  const savedAt = new Date(session.metadata.savedAt ?? '');
  const ageMs = Date.now() - savedAt.getTime();

  if (ageMs > staleThresholdMs) {
    return {
      action: 'fresh',
      reason: `Session is ${Math.round(ageMs / 60000)} minutes old. Tool results may be stale.`,
    };
  }

  if ((session.metadata.turnCount ?? 0) > maxTurns) {
    return {
      action: 'fresh',
      reason: `Session has ${session.metadata.turnCount} turns (threshold: ${maxTurns}). Context window crowded.`,
    };
  }

  return {
    action: 'resume',
    reason: `Session is ${Math.round(ageMs / 60000)} minutes old with ${session.metadata.turnCount} turns. Safe to resume.`,
  };
}

// ─── Demo ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Task 1.7: Session and State Management (Agent SDK) ===\n');

  // Demo 1: Decision logic (no API key required for this part)
  console.log('--- Demo 1: Resume vs. Fresh Decision Logic ---\n');

  saveSession('demo-investigation', [
    { role: 'user', content: 'Investigate the auth system' },
    { role: 'assistant', content: 'I will examine the auth module...' },
  ]);

  const decision = shouldResumeOrStartFresh('demo-investigation');
  console.log(`Decision: ${decision.action}`);
  console.log(`Reason: ${decision.reason}\n`);

  // Demo 2: Structured summary
  console.log('--- Demo 2: Structured Summary ---\n');

  const summary = createStructuredSummary({
    keyFacts: [
      'Session tokens stored in Redis with 24h TTL',
      'Race condition in token refresh',
    ],
    filesExamined: [
      { path: 'src/middleware/session.js', notes: 'Token refresh logic, lines 45-80' },
    ],
    openQuestions: [
      'Does Redis support atomic compare-and-swap for token refresh?',
    ],
    changedSinceLastSession: [
      { file: 'src/middleware/session.js', description: 'Added logging' },
    ],
    currentTask: 'Fix the token refresh race condition.',
  });

  console.log(summary);

  // Demo 3: Full flow (requires API)
  console.log('\n--- Demo 3: Named Session + Fork ---\n');

  const session1 = await startOrResumeSession(
    'auth-investigation',
    'I need to investigate a race condition in our token refresh system.'
  );
  console.log('Response preview:', session1.response.substring(0, 200));

  const session2 = await startOrResumeSession(
    'auth-investigation',
    'The Redis operations are not atomic. What are my options?'
  );
  console.log('Resumed:', session2.isResumed);

  const fork = await forkSession(
    'auth-investigation',
    'approach-A',
    'Explore using Redis WATCH/MULTI for optimistic locking.'
  );
  console.log('Fork response preview:', fork.response.substring(0, 200));
}

main().catch(console.error);

export {
  saveSession,
  loadSession,
  startOrResumeSession,
  forkSession,
  createStructuredSummary,
  startFreshWithSummary,
  shouldResumeOrStartFresh,
};
