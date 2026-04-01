/**
 * Scenario 5 (CI Pipeline): Per-File Review with Cross-File Integration
 *
 * Exam relevance: Task 1.6 -- Decompose Complex Tasks
 *
 * CI-oriented code review pipeline using query() for each decomposed task:
 *
 *   Stage 1: PER-FILE REVIEW (parallel query() calls)
 *     - Each changed file gets its own query() call
 *     - Focuses on single-file concerns: bugs, security, edge cases
 *
 *   Stage 2: CROSS-FILE INTEGRATION (sequential, depends on Stage 1)
 *     - Receives condensed per-file results
 *     - Looks for cross-cutting issues
 *
 * EXAM KEY CONCEPT:
 *   Per-file review prevents attention dilution. In a 10-file PR, sending
 *   all diffs in one prompt causes Claude to skim. Per-file passes guarantee
 *   each file receives full attention depth.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

// ─── CI Configuration ───────────────────────────────────────────────────────

const CI_CONFIG = {
  maxTurns: 1,
  blockingSeverities: ['critical', 'security'],
};

// ─── Simulated Multi-File PR ────────────────────────────────────────────────

const samplePR = {
  number: 42,
  title: 'Add user notification preferences',
  files: [
    {
      filename: 'src/models/notification-preference.js',
      status: 'added',
      diff: `
@@ -0,0 +1,20 @@
+import mongoose from 'mongoose';
+
+const notificationPreferenceSchema = new mongoose.Schema({
+  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
+  email: { type: Boolean, default: true },
+  push: { type: Boolean, default: true },
+  sms: { type: Boolean, default: false },
+  frequency: { type: String, enum: ['immediate', 'hourly', 'daily'], default: 'immediate' },
+  quietHoursStart: { type: Number, min: 0, max: 23 },
+  quietHoursEnd: { type: Number, min: 0, max: 23 },
+});
+
+// Missing: unique index on userId
+// Missing: pre-save hook to update updatedAt
+
+export default mongoose.model('NotificationPreference', notificationPreferenceSchema);`,
    },
    {
      filename: 'src/api/notification-preferences.js',
      status: 'added',
      diff: `
@@ -0,0 +1,25 @@
+import express from 'express';
+import NotificationPreference from '../models/notification-preference.js';
+import { requireAuth } from '../middleware/auth.js';
+
+const router = express.Router();
+
+router.get('/', requireAuth, async (req, res) => {
+  const prefs = await NotificationPreference.findOne({ userId: req.user.id });
+  if (!prefs) return res.json({ email: true, push: true, sms: false, frequency: 'immediate' });
+  res.json(prefs);
+});
+
+router.put('/', requireAuth, async (req, res) => {
+  // No input validation on req.body
+  const prefs = await NotificationPreference.findOneAndUpdate(
+    { userId: req.user.id },
+    req.body,  // Allows setting ANY field, including userId and _id
+    { upsert: true, new: true },
+  );
+  res.json(prefs);
+});
+
+export default router;`,
    },
    {
      filename: 'src/services/notification-dispatcher.js',
      status: 'added',
      diff: `
@@ -0,0 +1,30 @@
+import NotificationPreference from '../models/notification-preference.js';
+import { sendEmail } from './email-service.js';
+import { sendPush } from './push-service.js';
+
+export async function dispatchNotification(userId, notification) {
+  const prefs = await NotificationPreference.findOne({ userId });
+  const channels = prefs || { email: true, push: true, sms: false };
+
+  const dispatched = [];
+
+  if (channels.email) {
+    await sendEmail(userId, notification);
+    dispatched.push('email');
+  }
+
+  if (channels.push) {
+    // No quiet hours check here
+    await sendPush(userId, notification);
+    dispatched.push('push');
+  }
+
+  // No error handling -- if one channel fails, function throws
+  return { dispatched, timestamp: new Date().toISOString() };
+}`,
    },
    {
      filename: 'src/api/orders.js',
      status: 'modified',
      diff: `
@@ -45,6 +45,10 @@ router.patch('/:orderId/status', requireAuth, async (req, res) => {
   order.status = req.body.status;
   await order.save();

+  // Notify customer of status change
+  const { dispatchNotification } = await import('../services/notification-dispatcher.js');
+  await dispatchNotification(order.userId, { type: 'order_status', message: 'Status updated' });
+
   res.json(order);
 });`,
    },
  ],
};

// ─── Stage 1: Per-File Review ───────────────────────────────────────────────

const PER_FILE_PROMPT = `You are an automated code reviewer in a CI pipeline. Review the given file diff.
Focus on: bugs, security, edge cases, style, performance.
Return JSON: {
  "filename": "<file>",
  "issues": [{ "severity": "critical|high|medium|low", "category": "bug|security|edge-case|style|performance", "line": "<line>", "description": "<what>", "suggestion": "<fix>" }],
  "summary": "<one sentence>",
  "approvalStatus": "approve|request_changes|comment"
}`;

async function reviewFile(file) {
  let result = '{}';

  for await (const message of query({
    prompt: `File: ${file.filename}\nStatus: ${file.status}\n\nDiff:\n${file.diff}`,
    options: {
      systemPrompt: PER_FILE_PROMPT,
      maxTurns: CI_CONFIG.maxTurns,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
    }
  }

  try {
    return JSON.parse(result);
  } catch {
    return { filename: file.filename, issues: [], summary: result, approvalStatus: 'comment' };
  }
}

/**
 * Run per-file reviews in parallel.
 * All query() calls are independent -- Promise.all reduces wall-clock time.
 */
async function runPerFileReviews(files) {
  console.log(`\n--- Stage 1: Per-File Review (${files.length} files) ---\n`);
  const reviews = await Promise.all(files.map(reviewFile));
  for (const review of reviews) {
    console.log(`  ${review.filename}: ${review.issues?.length ?? 0} issues [${review.approvalStatus ?? 'unknown'}]`);
  }
  return reviews;
}

// ─── Stage 2: Cross-File Integration ────────────────────────────────────────

const INTEGRATION_PROMPT = `You are performing a cross-file integration review for a CI pipeline.
Look for: API consistency, data flow, missing coordination, error propagation, contract mismatches.
Return JSON: {
  "crossFileIssues": [{ "severity": "critical|high|medium|low", "filesInvolved": ["file1.js"], "description": "<what>", "suggestion": "<fix>" }],
  "overallVerdict": "approve|request_changes|block",
  "summary": "<PR summary>"
}`;

async function runIntegrationReview(perFileReviews, prMetadata) {
  console.log('\n--- Stage 2: Cross-File Integration ---\n');

  let result = '{}';

  for await (const message of query({
    prompt: `PR #${prMetadata.number}: ${prMetadata.title}\n\nPer-file review results:\n${JSON.stringify(perFileReviews, null, 2)}`,
    options: {
      systemPrompt: INTEGRATION_PROMPT,
      maxTurns: CI_CONFIG.maxTurns,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
    }
  }

  try {
    const parsed = JSON.parse(result);
    console.log(`  Cross-file issues: ${parsed.crossFileIssues?.length ?? 0}`);
    console.log(`  Verdict: ${parsed.overallVerdict}`);
    return parsed;
  } catch {
    return { crossFileIssues: [], overallVerdict: 'comment', summary: result };
  }
}

// ─── CI Pipeline Orchestrator ───────────────────────────────────────────────

async function reviewPullRequest(pr) {
  console.log(`=== CI Review: PR #${pr.number} -- ${pr.title} ===`);
  console.log(`Files changed: ${pr.files.length}`);

  const perFileReviews = await runPerFileReviews(pr.files);
  const integrationReview = await runIntegrationReview(perFileReviews, {
    number: pr.number,
    title: pr.title,
  });

  const allIssues = [
    ...perFileReviews.flatMap(r => (r.issues ?? []).map(i => ({ ...i, source: 'per-file', file: r.filename }))),
    ...(integrationReview.crossFileIssues ?? []).map(i => ({ ...i, source: 'cross-file' })),
  ];

  const blockingIssues = allIssues.filter(i =>
    CI_CONFIG.blockingSeverities.includes(i.severity) ||
    CI_CONFIG.blockingSeverities.includes(i.category)
  );

  const ciResult = {
    pr: { number: pr.number, title: pr.title },
    totalIssues: allIssues.length,
    blockingIssues: blockingIssues.length,
    shouldBlock: blockingIssues.length > 0,
    perFileReviews,
    integrationReview,
  };

  console.log(`\n=== CI Result ===`);
  console.log(`Total issues: ${ciResult.totalIssues}`);
  console.log(`Blocking issues: ${ciResult.blockingIssues}`);
  console.log(`Decision: ${ciResult.shouldBlock ? 'BLOCK MERGE' : 'ALLOW MERGE'}`);

  return ciResult;
}

// ─── PR Comment Formatter ───────────────────────────────────────────────────

function formatPRComment(ciResult) {
  const lines = [];
  lines.push(`## Automated Code Review -- PR #${ciResult.pr.number}`);
  lines.push('');
  lines.push(ciResult.shouldBlock
    ? `**Status: Changes Requested** (${ciResult.blockingIssues} blocking)`
    : `**Status: Approved** (${ciResult.totalIssues} issues, none blocking)`
  );
  lines.push('');
  lines.push('### Per-File Results');
  for (const review of ciResult.perFileReviews) {
    lines.push(`- **${review.filename}** [${review.approvalStatus}]: ${review.summary}`);
  }
  return lines.join('\n');
}

// ─── Run ────────────────────────────────────────────────────────────────────

async function main() {
  const result = await reviewPullRequest(samplePR);
  console.log('\n--- PR Comment ---\n');
  console.log(formatPRComment(result));
}

main().catch(console.error);

export { reviewFile, runPerFileReviews, runIntegrationReview, reviewPullRequest, formatPRComment, samplePR, CI_CONFIG };
