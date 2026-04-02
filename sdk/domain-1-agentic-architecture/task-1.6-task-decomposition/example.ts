/**
 * Task 1.6 -- Task Decomposition: Per-File Review Pipeline via Agent SDK
 *
 * Exam relevance: Scenarios 4 (Dev Productivity), 5 (CI Pipeline)
 *
 * Demonstrates a fixed sequential pipeline (prompt chain) for code review:
 *
 *   Stage 1: Per-file analysis (parallel)
 *     - Each changed file is reviewed individually via its own query() call
 *     - Each query sees ONLY that file's diff, not the entire changeset
 *     - This prevents attention dilution across files
 *
 *   Stage 2: Cross-file integration (sequential)
 *     - All per-file results are collected and sent together
 *     - Looks for cross-cutting concerns: API consistency, shared state, etc.
 *     - Operates on condensed summaries, not raw diffs
 *
 * EXAM KEY CONCEPT:
 *   Splitting a large code review into per-file analysis avoids attention
 *   dilution. When all files are sent in one prompt, Claude focuses on the
 *   most salient changes. Per-file passes ensure every file gets full depth.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

// ─── Sample Code Change (Multi-File PR) ─────────────────────────────────────

const pullRequestFiles = [
  {
    filename: 'src/api/orders.js',
    diff: `
@@ -15,6 +15,12 @@ export async function getOrder(orderId) {
+  // NEW: Add caching layer
+  const cached = orderCache.get(orderId);
+  if (cached) return cached;
+
   const order = await db.orders.findById(orderId);
+  orderCache.set(orderId, order);  // Cache for 5 min
   return order;
 }

@@ -30,3 +36,8 @@ export async function updateOrderStatus(orderId, status) {
   const order = await db.orders.findById(orderId);
   order.status = status;
+  order.updatedAt = Date.now();
   await order.save();
+
+  // BUG: Cache not invalidated after status update
+  // orderCache.delete(orderId);  <-- missing!
   return order;
 }`,
  },
  {
    filename: 'src/api/refunds.js',
    diff: `
@@ -8,6 +8,10 @@ export async function processRefund(orderId, amount) {
   const order = await getOrder(orderId);
+
+  if (amount > order.total) {
+    throw new ValidationError('Refund exceeds order total');
+  }
+
-  const refund = await payments.refund(order.paymentId, amount);
+  const refund = await payments.refund(order.paymentId, amount, {
+    idempotencyKey: \`refund-\${orderId}-\${Date.now()}\`,
+  });
   return refund;
 }`,
  },
  {
    filename: 'src/utils/cache.js',
    diff: `
@@ -0,0 +1,25 @@
+// NEW FILE: Simple in-memory cache with TTL
+const caches = new Map();
+
+export function createCache(name, ttlMs = 300000) {
+  const store = new Map();
+  caches.set(name, store);
+
+  return {
+    get(key) {
+      const entry = store.get(key);
+      if (!entry) return null;
+      if (Date.now() - entry.timestamp > ttlMs) {
+        store.delete(key);
+        return null;
+      }
+      return entry.value;
+    },
+    set(key, value) {
+      store.set(key, { value, timestamp: Date.now() });
+    },
+    delete(key) {
+      store.delete(key);
+    },
+  };
+}`,
  },
];

// ─── Stage 1: Per-File Analysis ─────────────────────────────────────────────

const PER_FILE_SYSTEM_PROMPT = `You are a senior code reviewer. Analyze the given file diff for:
1. Logic errors and bugs
2. Edge cases not handled
3. Naming and style issues
4. Security concerns
5. Performance implications

Return a structured JSON object:
{
  "filename": "<the file>",
  "issues": [
    {
      "severity": "critical|warning|suggestion",
      "line_context": "<relevant code snippet>",
      "description": "<what's wrong>",
      "suggestion": "<how to fix it>"
    }
  ],
  "summary": "<one-line summary of the file's changes>"
}

Be thorough. If there are no issues, return an empty issues array.`;

/**
 * Analyze a single file using query().
 * Each file gets its own call so Claude applies full attention to it.
 */
async function analyzeFile(file) {
  let result = '{}';

  for await (const message of query({
    prompt: `Review this file change:\n\nFile: ${file.filename}\n\nDiff:\n${file.diff}`,
    options: {
      systemPrompt: PER_FILE_SYSTEM_PROMPT,
      maxTurns: 1,  // Single-turn: no tools needed
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
    }
  }

  try {
    return JSON.parse(result);
  } catch {
    return { filename: file.filename, issues: [], summary: result, parseError: true };
  }
}

/**
 * Run per-file analysis for all files in parallel.
 * Each call is independent, so parallelism reduces total latency.
 */
async function runPerFileAnalysis(files) {
  console.log(`Stage 1: Analyzing ${files.length} files individually...\n`);
  const results = await Promise.all(files.map(analyzeFile));
  for (const result of results) {
    const issueCount = result.issues?.length ?? 0;
    console.log(`  ${result.filename}: ${issueCount} issue(s) found`);
  }
  return results;
}

// ─── Stage 2: Cross-File Integration ────────────────────────────────────────

const CROSS_FILE_SYSTEM_PROMPT = `You are a senior code reviewer performing a cross-file integration review.
Look for cross-cutting concerns:
1. API consistency
2. Shared state management (caches, databases)
3. Import chains and missing imports
4. Breaking changes across files
5. Missing coordination between related changes

Return JSON:
{
  "cross_file_issues": [
    {
      "severity": "critical|warning|suggestion",
      "files_involved": ["file1.js", "file2.js"],
      "description": "<what's wrong>",
      "suggestion": "<how to fix it>"
    }
  ],
  "overall_assessment": "<pass|needs_changes|block>",
  "summary": "<overall PR summary>"
}`;

async function runCrossFileIntegration(perFileResults) {
  console.log('\nStage 2: Cross-file integration analysis...\n');

  let result = '{}';

  for await (const message of query({
    prompt:
      'Here are the per-file review results for this PR:\n\n' +
      JSON.stringify(perFileResults, null, 2) +
      '\n\nNow perform the cross-file integration review.',
    options: {
      systemPrompt: CROSS_FILE_SYSTEM_PROMPT,
      maxTurns: 1,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
    }
  }

  try {
    return JSON.parse(result);
  } catch {
    return { cross_file_issues: [], overall_assessment: 'unknown', summary: result };
  }
}

// ─── Pipeline Orchestrator ──────────────────────────────────────────────────

async function reviewPullRequest(files) {
  console.log(`=== Code Review Pipeline: ${files.length} files ===\n`);

  // Stage 1: Per-file analysis (parallel)
  const perFileResults = await runPerFileAnalysis(files);

  // Stage 2: Cross-file integration (depends on Stage 1)
  const integrationResult = await runCrossFileIntegration(perFileResults);

  return {
    perFileResults,
    integrationResult,
    totalIssues:
      perFileResults.reduce((sum, r) => sum + (r.issues?.length ?? 0), 0) +
      (integrationResult.cross_file_issues?.length ?? 0),
  };
}

// ─── Run ────────────────────────────────────────────────────────────────────

async function main() {
  const result = await reviewPullRequest(pullRequestFiles);
  console.log('\n=== Final Review Results ===\n');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);

export {
  analyzeFile,
  runPerFileAnalysis,
  runCrossFileIntegration,
  reviewPullRequest,
  pullRequestFiles,
};
