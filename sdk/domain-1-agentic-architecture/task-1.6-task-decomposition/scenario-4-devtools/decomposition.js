/**
 * Scenario 4 (Dev Productivity): Adaptive Decomposition for Legacy Codebase Exploration
 *
 * Exam relevance: Task 1.6 -- Decompose Complex Tasks
 *
 * This module implements a three-phase adaptive decomposition strategy for
 * exploring an unfamiliar legacy codebase:
 *
 *   Phase 1: MAP STRUCTURE
 *     - Scan directory tree, identify entry points, read manifests
 *     - Output: structural overview with file roles and dependency hints
 *
 *   Phase 2: IDENTIFY HIGH-IMPACT AREAS
 *     - Analyze the structural overview to find high-fan-in modules,
 *       untested code, large files, and complexity hotspots
 *     - Output: prioritized investigation targets
 *
 *   Phase 3: CREATE PRIORITIZED INVESTIGATION PLAN
 *     - Deep-dive into each target, adapting the plan as new findings emerge
 *     - Output: ranked technical debt report with actionable recommendations
 *
 * KEY EXAM CONCEPT:
 *   Adaptive decomposition discovers the task structure at runtime. You cannot
 *   predict which files to investigate until Phase 1 maps the codebase.
 *   Compare this to a fixed pipeline (Task 1.6 example.js) where the stages
 *   are predetermined.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// ─── Simulated Codebase Data ────────────────────────────────────────────────
//
// In production, these would come from filesystem reads (fs.readdir, fs.readFile)
// or Git commands. We simulate them here for self-contained demonstration.

const MOCK_DIRECTORY_TREE = `
legacy-ecommerce/
  package.json
  server.js                  (entry point, 450 lines)
  config/
    database.js              (DB connection setup)
    constants.js             (magic numbers, feature flags)
  src/
    routes/
      orders.js              (180 lines, Express routes)
      customers.js           (120 lines, Express routes)
      payments.js            (310 lines, Express routes)
      admin.js               (90 lines, Express routes)
    middleware/
      auth.js                (60 lines)
      error-handler.js       (40 lines)
    models/
      order.js               (Mongoose model, 200 lines)
      customer.js            (Mongoose model, 80 lines)
      payment.js             (Mongoose model, 150 lines)
    services/
      order-service.js       (280 lines, business logic)
      payment-service.js     (350 lines, business logic)
      email-service.js       (100 lines)
      legacy-billing.js      (500 lines, "DO NOT TOUCH" comment at top)
    utils/
      helpers.js             (400 lines, miscellaneous functions)
      date-utils.js          (60 lines)
      validators.js          (90 lines)
  tests/
    orders.test.js           (covers routes/orders.js)
    customers.test.js        (covers routes/customers.js)
    (no tests for payments, services, or utils)
`.trim();

const MOCK_PACKAGE_JSON = JSON.stringify({
  name: 'legacy-ecommerce',
  version: '1.0.0',
  dependencies: {
    express: '^4.17.1',
    mongoose: '^5.13.0',      // Outdated major version
    'body-parser': '^1.19.0', // Deprecated, built into Express 4.16+
    moment: '^2.29.1',        // Deprecated, should use date-fns or native
    lodash: '^4.17.21',
    stripe: '^8.0.0',         // Very outdated
  },
}, null, 2);

const MOCK_SERVER_JS_SNIPPET = `
// server.js (first 30 lines)
const express = require('express');
const bodyParser = require('body-parser'); // deprecated
const mongoose = require('mongoose');
const { DB_URI } = require('./config/database');

const app = express();
app.use(bodyParser.json()); // should use express.json()

// Global error handling -- catches nothing meaningful
process.on('uncaughtException', (err) => {
  console.log('Error:', err.message); // logs to stdout, not stderr
  // Does not exit process -- leaves app in unknown state
});

// Routes
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/customers', require('./src/routes/customers'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/admin', require('./src/routes/admin'));

mongoose.connect(DB_URI); // no error handling, no connection options
app.listen(3000);         // hardcoded port, no callback
`;

// ─── Phase 1: Map Structure ─────────────────────────────────────────────────

const SURVEY_PROMPT = `You are a senior developer analyzing an unfamiliar legacy codebase.
Given the directory tree and package.json, create a structural overview:

1. **Entry points:** Which files start the application?
2. **Dependency concerns:** Any outdated or deprecated packages?
3. **Architecture pattern:** What pattern does this codebase follow (MVC, layered, etc.)?
4. **High-fan-in candidates:** Which modules are likely imported by many others?
5. **Test coverage gaps:** Which areas have no tests?
6. **Red flags:** Any immediate concerns (large files, "DO NOT TOUCH" comments, etc.)?

Return a structured JSON response:
{
  "entryPoints": ["file1.js"],
  "dependencyConcerns": [{ "package": "...", "issue": "..." }],
  "architecture": "...",
  "highFanInModules": ["file1.js", "file2.js"],
  "untested": ["dir1/", "dir2/"],
  "redFlags": [{ "file": "...", "concern": "..." }],
  "investigationCandidates": ["file1.js", "file2.js", "file3.js"]
}`;

/**
 * Phase 1: Survey the codebase structure.
 *
 * This phase reads only metadata (directory tree, package.json) to form
 * a high-level understanding. It does NOT read individual source files yet.
 */
async function mapStructure() {
  console.log('Phase 1: Mapping codebase structure...\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SURVEY_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          'Directory tree:',
          MOCK_DIRECTORY_TREE,
          '',
          'package.json:',
          MOCK_PACKAGE_JSON,
        ].join('\n'),
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

  try {
    const survey = JSON.parse(text);
    console.log('  Entry points:', survey.entryPoints);
    console.log('  High-fan-in:', survey.highFanInModules);
    console.log('  Untested:', survey.untested);
    console.log('  Red flags:', survey.redFlags?.length ?? 0);
    return survey;
  } catch {
    console.log('  (Could not parse structured response, using raw text)');
    return { raw: text, investigationCandidates: [] };
  }
}

// ─── Phase 2: Identify High-Impact Areas ────────────────────────────────────

const PRIORITIZE_PROMPT = `You are a senior developer prioritizing technical debt investigation.
Given the codebase survey and a code snippet from the entry point, rank the
top 5 investigation targets by likely impact. For each target, explain:

1. Why it should be investigated (risk, complexity, dependency count)
2. What specific questions to answer during investigation
3. Expected difficulty of remediation (low/medium/high)

Return a structured JSON response:
{
  "targets": [
    {
      "file": "path/to/file.js",
      "priority": 1,
      "reason": "...",
      "questions": ["question1", "question2"],
      "estimatedDifficulty": "low|medium|high"
    }
  ],
  "investigationOrder": ["file1.js", "file2.js", "..."],
  "rationale": "..."
}`;

/**
 * Phase 2: Prioritize investigation targets.
 *
 * Uses the Phase 1 survey results plus a code snippet to rank targets.
 * This phase makes the ADAPTIVE decision: which files to read next.
 */
async function identifyHighImpactAreas(surveyResults) {
  console.log('\nPhase 2: Identifying high-impact areas...\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: PRIORITIZE_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          'Codebase survey:',
          JSON.stringify(surveyResults, null, 2),
          '',
          'Entry point snippet (server.js):',
          MOCK_SERVER_JS_SNIPPET,
        ].join('\n'),
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

  try {
    const plan = JSON.parse(text);
    console.log('  Investigation order:');
    for (const target of plan.targets ?? []) {
      console.log(`    ${target.priority}. ${target.file} (${target.estimatedDifficulty}) -- ${target.reason}`);
    }
    return plan;
  } catch {
    console.log('  (Could not parse structured response, using raw text)');
    return { targets: [], raw: text };
  }
}

// ─── Phase 3: Prioritized Investigation ─────────────────────────────────────

const INVESTIGATE_PROMPT = `You are investigating a specific file in a legacy codebase for technical debt.
Analyze the code for:
1. Code quality issues (duplication, complexity, unclear naming)
2. Security vulnerabilities
3. Performance problems
4. Maintainability concerns
5. Missing error handling

Also note if this investigation reveals NEW areas that should be investigated
(files referenced but not yet examined).

Return a structured JSON response:
{
  "file": "...",
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "quality|security|performance|maintainability|error-handling",
      "description": "...",
      "lineRange": "approx lines",
      "recommendation": "..."
    }
  ],
  "newTargets": ["newly-discovered-file.js"],
  "refactoringEffort": "hours|days|weeks",
  "summary": "..."
}`;

/**
 * Phase 3: Investigate each target in priority order.
 *
 * This is the ADAPTIVE part: the investigation may discover new targets
 * not identified in Phase 2. When it does, they are added to the queue.
 *
 * In production, this would read actual file contents from disk. Here we
 * simulate with mock content.
 */
async function investigateTargets(plan) {
  console.log('\nPhase 3: Investigating targets...\n');

  const targets = (plan.targets ?? []).map((t) => t.file);
  const investigated = new Set();
  const allFindings = [];

  // Process targets in order, allowing new targets to be added
  const queue = [...targets];

  while (queue.length > 0 && investigated.size < 8) {
    const target = queue.shift();

    if (investigated.has(target)) continue;
    investigated.add(target);

    console.log(`  Investigating: ${target}`);

    // In production: const content = fs.readFileSync(target, 'utf-8');
    // Here we use a mock snippet based on what we know about the file
    const mockContent = getMockFileContent(target);

    if (!mockContent) {
      console.log(`    (No mock content available, skipping)`);
      continue;
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: INVESTIGATE_PROMPT,
      messages: [
        {
          role: 'user',
          content: `File: ${target}\n\nContent:\n${mockContent}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

    try {
      const finding = JSON.parse(text);
      allFindings.push(finding);

      const issueCount = finding.issues?.length ?? 0;
      console.log(`    Found ${issueCount} issues (effort: ${finding.refactoringEffort})`);

      // ADAPTIVE: Add newly discovered targets to the queue
      if (finding.newTargets?.length > 0) {
        for (const newTarget of finding.newTargets) {
          if (!investigated.has(newTarget) && !queue.includes(newTarget)) {
            console.log(`    --> Discovered new target: ${newTarget}`);
            queue.push(newTarget);
          }
        }
      }
    } catch {
      allFindings.push({ file: target, issues: [], raw: text });
    }
  }

  return allFindings;
}

/**
 * Mock file content provider. In production, replace with fs.readFileSync.
 */
function getMockFileContent(filepath) {
  const mocks = {
    'src/services/legacy-billing.js': `
// DO NOT TOUCH -- this handles all billing logic
// Last modified: 2019-03-15 by someone who no longer works here
// TODO: rewrite this entire module (added 2020-01-01)

const moment = require('moment');
const _ = require('lodash');

function calculateBilling(customer, orders) {
  var total = 0;  // var instead of const/let
  for (var i = 0; i < orders.length; i++) {
    var order = orders[i];
    // Magic number: 0.08 is tax rate, hardcoded
    total += order.amount * 1.08;
    // No null check on order.amount
  }
  // Floating point arithmetic on currency -- use integer cents instead
  return total;
}

// ... 450 more lines of similar quality
module.exports = { calculateBilling };`,

    'src/utils/helpers.js': `
// helpers.js -- 400 lines of utility functions
const moment = require('moment');

function formatDate(date) { return moment(date).format('MM/DD/YYYY'); }
function formatDateLong(date) { return moment(date).format('MMMM Do, YYYY'); }
function formatDateTime(date) { return moment(date).format('MM/DD/YYYY HH:mm'); }
// ... 20 more moment wrappers that could be 1 function with a format param

function isValidEmail(email) {
  return email.includes('@');  // Minimal validation
}

function sanitizeInput(input) {
  return input.replace(/</g, '');  // Incomplete XSS prevention
}

// ... 300 more lines, no clear organization`,

    'src/services/payment-service.js': `
const stripe = require('stripe')('sk_live_HARDCODED_KEY');  // SECRET IN CODE
const Order = require('../models/order');
const { calculateBilling } = require('./legacy-billing');

async function processPayment(orderId, paymentMethod) {
  const order = await Order.findById(orderId);
  const amount = calculateBilling(order.customer, [order]);

  // No idempotency key -- double-charge risk on retry
  const charge = await stripe.charges.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    source: paymentMethod,
  });

  // No error handling around stripe call
  order.paymentId = charge.id;
  order.status = 'paid';
  await order.save();
  return charge;
}

module.exports = { processPayment };`,

    'server.js': MOCK_SERVER_JS_SNIPPET,
  };

  return mocks[filepath] ?? null;
}

// ─── Full Pipeline ──────────────────────────────────────────────────────────

/**
 * Run the complete three-phase adaptive decomposition.
 */
async function exploreCodebase() {
  console.log('=== Adaptive Decomposition: Legacy Codebase Exploration ===\n');

  // Phase 1: Survey
  const survey = await mapStructure();

  // Phase 2: Prioritize (depends on Phase 1)
  const plan = await identifyHighImpactAreas(survey);

  // Phase 3: Investigate (depends on Phase 2, adapts during execution)
  const findings = await investigateTargets(plan);

  // Synthesize final report
  console.log('\n=== Final Technical Debt Report ===\n');
  console.log(`Files investigated: ${findings.length}`);

  const criticalIssues = findings.flatMap((f) =>
    (f.issues ?? []).filter((i) => i.severity === 'critical')
  );
  console.log(`Critical issues: ${criticalIssues.length}`);

  return { survey, plan, findings };
}

// ─── Demo ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Set ANTHROPIC_API_KEY to run this example.\n');
    console.log('This example demonstrates adaptive decomposition:');
    console.log('  Phase 1: Map codebase structure from directory tree + package.json');
    console.log('  Phase 2: Identify high-impact investigation targets');
    console.log('  Phase 3: Deep-dive into each target, discovering new targets adaptively\n');
    console.log('Expected investigation targets (in approximate priority order):');
    console.log('  1. src/services/payment-service.js -- hardcoded secret, no error handling');
    console.log('  2. src/services/legacy-billing.js  -- 500-line "DO NOT TOUCH" module');
    console.log('  3. src/utils/helpers.js             -- 400-line grab bag, incomplete sanitization');
    console.log('  4. server.js                        -- poor error handling, deprecated patterns');
    return;
  }

  const report = await exploreCodebase();
  console.log('\nFull report:', JSON.stringify(report, null, 2));
}

main().catch(console.error);

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  mapStructure,
  identifyHighImpactAreas,
  investigateTargets,
  exploreCodebase,
};
