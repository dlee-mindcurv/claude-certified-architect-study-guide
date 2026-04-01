/**
 * Scenario 5 (CI Pipeline): Per-File Review with Cross-File Integration
 *
 * Exam relevance: Task 1.6 -- Decompose Complex Tasks
 *
 * This module implements a CI-oriented code review pipeline that integrates
 * into a pull request workflow. It uses a fixed sequential pipeline (prompt
 * chain) with two stages:
 *
 *   Stage 1: PER-FILE REVIEW (parallel)
 *     - Each changed file gets its own API call
 *     - Focuses on single-file concerns: logic errors, style, edge cases
 *     - Files are reviewed in parallel for minimal latency
 *
 *   Stage 2: CROSS-FILE INTEGRATION (sequential, depends on Stage 1)
 *     - Receives condensed per-file results
 *     - Looks for cross-cutting issues: API consistency, shared state,
 *       import chains, breaking changes
 *
 * The output is structured for posting as PR review comments.
 *
 * KEY EXAM CONCEPT:
 *   Per-file review prevents attention dilution. In a 10-file PR, sending
 *   all diffs in one prompt causes Claude to focus on the most prominent
 *   changes and skim the rest. Per-file passes guarantee each file receives
 *   full attention depth. The integration pass then works on condensed
 *   summaries rather than raw diffs.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// ─── CI Configuration ───────────────────────────────────────────────────────

/**
 * Configuration for the CI review pipeline.
 * In production, these values come from the CI environment.
 */
const CI_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxTokensPerFile: 1024,
  maxTokensIntegration: 2048,
  // Files larger than this threshold are split into chunks
  maxDiffLinesPerChunk: 500,
  // Severity levels that block merge
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
@@ -0,0 +1,35 @@
+import mongoose from 'mongoose';
+
+const notificationPreferenceSchema = new mongoose.Schema({
+  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
+  email: { type: Boolean, default: true },
+  push: { type: Boolean, default: true },
+  sms: { type: Boolean, default: false },
+  frequency: {
+    type: String,
+    enum: ['immediate', 'hourly', 'daily'],
+    default: 'immediate',
+  },
+  quietHoursStart: { type: Number, min: 0, max: 23 },
+  quietHoursEnd: { type: Number, min: 0, max: 23 },
+  createdAt: { type: Date, default: Date.now },
+  updatedAt: { type: Date, default: Date.now },
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
@@ -0,0 +1,45 @@
+import express from 'express';
+import NotificationPreference from '../models/notification-preference.js';
+import { requireAuth } from '../middleware/auth.js';
+
+const router = express.Router();
+
+router.get('/', requireAuth, async (req, res) => {
+  const prefs = await NotificationPreference.findOne({ userId: req.user.id });
+  if (!prefs) {
+    return res.json({ email: true, push: true, sms: false, frequency: 'immediate' });
+  }
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
+router.delete('/', requireAuth, async (req, res) => {
+  await NotificationPreference.deleteOne({ userId: req.user.id });
+  res.status(204).send();
+});
+
+export default router;`,
    },
    {
      filename: 'src/services/notification-dispatcher.js',
      status: 'added',
      diff: `
@@ -0,0 +1,55 @@
+import NotificationPreference from '../models/notification-preference.js';
+import { sendEmail } from './email-service.js';
+import { sendPush } from './push-service.js';
+import { sendSMS } from './sms-service.js';
+
+export async function dispatchNotification(userId, notification) {
+  const prefs = await NotificationPreference.findOne({ userId });
+
+  // Default to all channels if no preferences set
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
+    // No quiet hours check here -- should respect quietHoursStart/End
+    await sendPush(userId, notification);
+    dispatched.push('push');
+  }
+
+  if (channels.sms) {
+    await sendSMS(userId, notification);
+    dispatched.push('sms');
+  }
+
+  // No error handling -- if one channel fails, the others still send,
+  // but the function throws and the caller may think nothing was sent
+
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
+  await dispatchNotification(order.userId, {
+    type: 'order_status',
+    message: \`Your order \${order._id} is now \${req.body.status}\`,
+  });
+
   res.json(order);
 });`,
    },
  ],
};

// ─── Stage 1: Per-File Review ───────────────────────────────────────────────

const PER_FILE_PROMPT = `You are an automated code reviewer in a CI pipeline. Review the given file diff.

Focus on:
1. **Bugs:** Logic errors, null/undefined risks, race conditions
2. **Security:** Input validation gaps, injection risks, auth bypasses
3. **Edge cases:** Missing error handling, boundary conditions
4. **Style:** Naming, consistency with surrounding code patterns
5. **Performance:** N+1 queries, unnecessary allocations, missing indices

Return JSON:
{
  "filename": "<file>",
  "status": "<added|modified|deleted>",
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "bug|security|edge-case|style|performance",
      "line": "<approximate line or range>",
      "description": "<what's wrong>",
      "suggestion": "<how to fix>"
    }
  ],
  "summary": "<one sentence>",
  "approvalStatus": "approve|request_changes|comment"
}`;

/**
 * Review a single file.
 *
 * Each file gets its own API call with ONLY that file's diff. This prevents
 * attention dilution: the model's full capacity is applied to this one file.
 */
async function reviewFile(file) {
  const response = await client.messages.create({
    model: CI_CONFIG.model,
    max_tokens: CI_CONFIG.maxTokensPerFile,
    system: PER_FILE_PROMPT,
    messages: [
      {
        role: 'user',
        content:
          `File: ${file.filename}\n` +
          `Status: ${file.status}\n\n` +
          `Diff:\n${file.diff}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

  try {
    return JSON.parse(text);
  } catch {
    return {
      filename: file.filename,
      issues: [],
      summary: text,
      approvalStatus: 'comment',
      parseError: true,
    };
  }
}

/**
 * Run per-file reviews in parallel.
 *
 * All files are reviewed concurrently. Each call is independent, so
 * parallelism reduces total wall-clock time from O(n * latency) to
 * O(latency) (bounded by the slowest single review).
 */
async function runPerFileReviews(files) {
  console.log(`\n--- Stage 1: Per-File Review (${files.length} files) ---\n`);

  const reviews = await Promise.all(files.map(reviewFile));

  for (const review of reviews) {
    const issueCount = review.issues?.length ?? 0;
    const status = review.approvalStatus ?? 'unknown';
    console.log(`  ${review.filename}: ${issueCount} issues [${status}]`);
  }

  return reviews;
}

// ─── Stage 2: Cross-File Integration ────────────────────────────────────────

const INTEGRATION_PROMPT = `You are performing a cross-file integration review for a CI pipeline.
You have per-file review results. Now look for issues that span multiple files:

1. **API consistency:** Do related endpoints follow the same patterns?
2. **Data flow:** Is data passed correctly between modules (models, services, routes)?
3. **Missing coordination:** Should a change in one file have a corresponding change elsewhere?
4. **Error propagation:** Do errors flow correctly across module boundaries?
5. **Schema/contract mismatches:** Do callers pass what callees expect?

Return JSON:
{
  "crossFileIssues": [
    {
      "severity": "critical|high|medium|low",
      "category": "consistency|data-flow|coordination|error-propagation|contract",
      "filesInvolved": ["file1.js", "file2.js"],
      "description": "<what's wrong>",
      "suggestion": "<how to fix>"
    }
  ],
  "overallVerdict": "approve|request_changes|block",
  "blockingIssues": ["<list of issues that must be fixed before merge>"],
  "summary": "<PR-level summary>"
}`;

/**
 * Cross-file integration review.
 *
 * Receives condensed per-file results (summaries and issue lists), not raw
 * diffs. This keeps the context focused on cross-cutting concerns.
 */
async function runIntegrationReview(perFileReviews, prMetadata) {
  console.log('\n--- Stage 2: Cross-File Integration ---\n');

  const response = await client.messages.create({
    model: CI_CONFIG.model,
    max_tokens: CI_CONFIG.maxTokensIntegration,
    system: INTEGRATION_PROMPT,
    messages: [
      {
        role: 'user',
        content:
          `PR #${prMetadata.number}: ${prMetadata.title}\n\n` +
          `Per-file review results:\n` +
          JSON.stringify(perFileReviews, null, 2),
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

  try {
    const result = JSON.parse(text);
    console.log(`  Cross-file issues: ${result.crossFileIssues?.length ?? 0}`);
    console.log(`  Verdict: ${result.overallVerdict}`);
    return result;
  } catch {
    return {
      crossFileIssues: [],
      overallVerdict: 'comment',
      summary: text,
    };
  }
}

// ─── CI Pipeline Orchestrator ───────────────────────────────────────────────

/**
 * Run the complete CI review pipeline for a pull request.
 *
 * Returns a structured review result suitable for posting to the PR.
 */
async function reviewPullRequest(pr) {
  console.log(`=== CI Review: PR #${pr.number} -- ${pr.title} ===`);
  console.log(`Files changed: ${pr.files.length}`);

  // Stage 1: Per-file reviews (parallel)
  const perFileReviews = await runPerFileReviews(pr.files);

  // Stage 2: Cross-file integration (depends on Stage 1)
  const integrationReview = await runIntegrationReview(perFileReviews, {
    number: pr.number,
    title: pr.title,
  });

  // Aggregate results for CI decision
  const allIssues = [
    ...perFileReviews.flatMap((r) => (r.issues ?? []).map((i) => ({
      ...i,
      source: 'per-file',
      file: r.filename,
    }))),
    ...(integrationReview.crossFileIssues ?? []).map((i) => ({
      ...i,
      source: 'cross-file',
    })),
  ];

  const blockingIssues = allIssues.filter((i) =>
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
    allIssues,
  };

  console.log(`\n=== CI Result ===`);
  console.log(`Total issues: ${ciResult.totalIssues}`);
  console.log(`Blocking issues: ${ciResult.blockingIssues}`);
  console.log(`Decision: ${ciResult.shouldBlock ? 'BLOCK MERGE' : 'ALLOW MERGE'}`);

  return ciResult;
}

// ─── PR Comment Formatter ───────────────────────────────────────────────────

/**
 * Format the review result as a Markdown comment for posting to the PR.
 */
function formatPRComment(ciResult) {
  const lines = [];

  lines.push(`## Automated Code Review -- PR #${ciResult.pr.number}`);
  lines.push('');

  if (ciResult.shouldBlock) {
    lines.push('**Status: Changes Requested**');
    lines.push(`Found ${ciResult.blockingIssues} blocking issue(s) that must be resolved before merge.`);
  } else {
    lines.push('**Status: Approved**');
    lines.push(`Found ${ciResult.totalIssues} issue(s), none blocking.`);
  }

  lines.push('');
  lines.push('### Per-File Results');
  lines.push('');

  for (const review of ciResult.perFileReviews) {
    const icon = review.approvalStatus === 'approve' ? 'pass' : 'warn';
    lines.push(`- **${review.filename}** [${icon}]: ${review.summary}`);
  }

  if (ciResult.integrationReview.crossFileIssues?.length > 0) {
    lines.push('');
    lines.push('### Cross-File Issues');
    lines.push('');
    for (const issue of ciResult.integrationReview.crossFileIssues) {
      lines.push(`- **[${issue.severity}]** ${issue.description}`);
      lines.push(`  Files: ${issue.filesInvolved?.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ─── Demo ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Set ANTHROPIC_API_KEY to run this example.\n');
    console.log('This CI pipeline reviews a PR with 4 files using two stages:');
    console.log('  Stage 1: Per-file review (4 parallel API calls)');
    console.log('  Stage 2: Cross-file integration (1 API call)\n');
    console.log('Expected per-file findings:');
    console.log('  - notification-preference.js: Missing unique index on userId, no updatedAt hook');
    console.log('  - notification-preferences.js: No input validation, mass assignment vulnerability');
    console.log('  - notification-dispatcher.js: No quiet hours check, poor error handling');
    console.log('  - orders.js: Dynamic import in request handler, no error handling on dispatch\n');
    console.log('Expected cross-file finding:');
    console.log('  - Dispatcher does not check quiet hours despite model defining them');
    console.log('  - Orders.js dispatches notifications but does not handle dispatch failures');
    return;
  }

  const result = await reviewPullRequest(samplePR);
  console.log('\n--- PR Comment ---\n');
  console.log(formatPRComment(result));
}

main().catch(console.error);

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  reviewFile,
  runPerFileReviews,
  runIntegrationReview,
  reviewPullRequest,
  formatPRComment,
  samplePR,
  CI_CONFIG,
};
