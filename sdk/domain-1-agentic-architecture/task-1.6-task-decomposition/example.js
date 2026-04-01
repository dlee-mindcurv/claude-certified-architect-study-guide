/**
 * Task 1.6 -- Task Decomposition: Prompt Chain Example
 *
 * Exam relevance: Scenarios 4 (Dev Productivity), 5 (CI Pipeline)
 *
 * Demonstrates a fixed sequential pipeline (prompt chain) for code review:
 *
 *   Stage 1: Per-file analysis
 *     - Each changed file is reviewed individually in its own API call
 *     - Claude sees ONLY that file's diff, not the entire changeset
 *     - This prevents attention dilution across files
 *
 *   Stage 2: Cross-file integration
 *     - All per-file results are collected and sent together
 *     - Claude looks for cross-cutting concerns: API consistency, shared
 *       state mutations, import chains, breaking changes
 *     - The model operates on condensed summaries, not raw diffs
 *
 * KEY EXAM CONCEPT:
 *   Splitting a large code review into per-file analysis avoids attention
 *   dilution. When all files are sent in one prompt, Claude focuses on the
 *   most salient changes and skims the rest. Per-file passes ensure every
 *   file gets full attention depth.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// ─── Sample Code Change (Multi-File PR) ─────────────────────────────────────

/**
 * Simulates a multi-file pull request. In production, these diffs would come
 * from the Git provider's API (GitHub, GitLab, etc.).
 */
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
//
// Each file gets its own API call. The model sees ONLY that file's diff,
// which keeps the context focused and prevents attention dilution.

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
 * Stage 1: Analyze a single file in isolation.
 *
 * By sending only one file per call, Claude applies its full attention to
 * that file's changes. Compare this to sending all 3 files together, where
 * the cache.js (new file) would likely dominate attention at the expense
 * of the subtle cache invalidation bug in orders.js.
 */
async function analyzeFile(file) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: PER_FILE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Review this file change:\n\nFile: ${file.filename}\n\nDiff:\n${file.diff}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

  // Parse the structured review (with fallback for non-JSON responses)
  try {
    return JSON.parse(text);
  } catch {
    return { filename: file.filename, issues: [], summary: text, parseError: true };
  }
}

/**
 * Run per-file analysis for all files in the PR.
 *
 * Files are analyzed in parallel -- each call is independent, so there is
 * no need to serialize them. This also reduces total latency.
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
//
// The integration pass receives the condensed per-file results (NOT the raw
// diffs). It looks for issues that only emerge when considering multiple
// files together.

const CROSS_FILE_SYSTEM_PROMPT = `You are a senior code reviewer performing a cross-file integration review.
You have already received per-file reviews. Now look for cross-cutting concerns:

1. API consistency: Are related endpoints using consistent patterns?
2. Shared state: Are caches, databases, or global state managed consistently?
3. Import chains: Are there circular dependencies or missing imports?
4. Breaking changes: Could changes in one file break callers in another?
5. Missing coordination: Should changes in one file have corresponding changes elsewhere?

Return a structured JSON object:
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

/**
 * Stage 2: Cross-file integration analysis.
 *
 * This stage operates on the condensed per-file results. The model sees
 * summaries and issue lists rather than raw diffs, which keeps the context
 * focused on cross-cutting concerns.
 */
async function runCrossFileIntegration(perFileResults) {
  console.log('\nStage 2: Cross-file integration analysis...\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: CROSS_FILE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content:
          'Here are the per-file review results for this PR:\n\n' +
          JSON.stringify(perFileResults, null, 2) +
          '\n\nNow perform the cross-file integration review.',
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

  try {
    return JSON.parse(text);
  } catch {
    return { cross_file_issues: [], overall_assessment: 'unknown', summary: text };
  }
}

// ─── Pipeline Orchestrator ──────────────────────────────────────────────────

/**
 * Run the complete two-stage review pipeline.
 *
 * This is the prompt chain: Stage 1 (per-file) feeds into Stage 2 (cross-file).
 * The structure is fixed at design time -- every PR goes through both stages.
 */
async function reviewPullRequest(files) {
  console.log(`=== Code Review Pipeline: ${files.length} files ===\n`);

  // Stage 1: Per-file analysis (parallel)
  const perFileResults = await runPerFileAnalysis(files);

  // Stage 2: Cross-file integration (depends on Stage 1 output)
  const integrationResult = await runCrossFileIntegration(perFileResults);

  // Combine results
  return {
    perFileResults,
    integrationResult,
    totalIssues:
      perFileResults.reduce((sum, r) => sum + (r.issues?.length ?? 0), 0) +
      (integrationResult.cross_file_issues?.length ?? 0),
  };
}

// ─── Demo ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Set ANTHROPIC_API_KEY to run this example.\n');
    console.log('This example demonstrates a two-stage prompt chain:');
    console.log('  Stage 1: Per-file review (one API call per file)');
    console.log('  Stage 2: Cross-file integration (one API call with all summaries)\n');
    console.log('Sample files that would be reviewed:');
    for (const file of pullRequestFiles) {
      console.log(`  - ${file.filename}`);
    }
    console.log('\nExpected cross-file finding:');
    console.log('  The cache in orders.js is not invalidated when updateOrderStatus');
    console.log('  modifies an order. The refunds.js file calls getOrder(), which will');
    console.log('  return stale cached data after a status update.');
    return;
  }

  const result = await reviewPullRequest(pullRequestFiles);
  console.log('\n=== Final Review Results ===\n');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  analyzeFile,
  runPerFileAnalysis,
  runCrossFileIntegration,
  reviewPullRequest,
  pullRequestFiles,
};
