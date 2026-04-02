/**
 * Scenario 4 (Dev Productivity): Adaptive Decomposition via Agent SDK
 *
 * Exam relevance: Task 1.6 -- Decompose Complex Tasks
 *
 * Three-phase adaptive decomposition for exploring a legacy codebase:
 *
 *   Phase 1: MAP STRUCTURE -- Scan directory tree, identify entry points
 *   Phase 2: IDENTIFY HIGH-IMPACT AREAS -- Rank investigation targets
 *   Phase 3: INVESTIGATE -- Deep-dive into each target, discover new ones
 *
 * EXAM KEY CONCEPT:
 *   Adaptive decomposition discovers the task structure at runtime. You
 *   cannot predict which files to investigate until Phase 1 maps the
 *   codebase. Compare to a fixed pipeline where stages are predetermined.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SurveyResult {
  entryPoints?: string[];
  redFlags?: { file: string; concern: string }[];
  investigationCandidates?: string[];
  raw?: string;
  [key: string]: unknown;
}

interface InvestigationTarget {
  file: string;
  priority: number;
  reason: string;
  estimatedDifficulty: string;
}

interface InvestigationPlan {
  targets: InvestigationTarget[];
  investigationOrder?: string[];
  rationale?: string;
  raw?: string;
}

interface InvestigationIssue {
  severity: string;
  category: string;
  description: string;
  recommendation: string;
}

interface InvestigationFinding {
  file: string;
  issues: InvestigationIssue[];
  newTargets?: string[];
  refactoringEffort?: string;
  summary?: string;
  raw?: string;
}

// ─── Simulated Codebase Data ────────────────────────────────────────────────

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
    mongoose: '^5.13.0',
    'body-parser': '^1.19.0',
    moment: '^2.29.1',
    lodash: '^4.17.21',
    stripe: '^8.0.0',
  },
}, null, 2);

const MOCK_SERVER_JS_SNIPPET = `
// server.js (first 30 lines)
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { DB_URI } = require('./config/database');

const app = express();
app.use(bodyParser.json());

process.on('uncaughtException', (err) => {
  console.log('Error:', err.message);
});

app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/customers', require('./src/routes/customers'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/admin', require('./src/routes/admin'));

mongoose.connect(DB_URI);
app.listen(3000);
`;

// ─── Phase 1: Map Structure ─────────────────────────────────────────────────

async function mapStructure(): Promise<SurveyResult> {
  console.log('Phase 1: Mapping codebase structure...\n');

  let result = '{}';

  for await (const message of query({
    prompt: `Directory tree:\n${MOCK_DIRECTORY_TREE}\n\npackage.json:\n${MOCK_PACKAGE_JSON}`,
    options: {
      systemPrompt: `You are a senior developer analyzing an unfamiliar legacy codebase.
Given the directory tree and package.json, create a structural overview.
Return JSON: {
  "entryPoints": ["file1.js"],
  "dependencyConcerns": [{ "package": "...", "issue": "..." }],
  "architecture": "...",
  "highFanInModules": ["file1.js"],
  "untested": ["dir1/"],
  "redFlags": [{ "file": "...", "concern": "..." }],
  "investigationCandidates": ["file1.js", "file2.js"]
}`,
      maxTurns: 1,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
    }
  }

  try {
    const survey = JSON.parse(result);
    console.log('  Entry points:', survey.entryPoints);
    console.log('  Red flags:', survey.redFlags?.length ?? 0);
    return survey;
  } catch {
    return { raw: result, investigationCandidates: [] };
  }
}

// ─── Phase 2: Identify High-Impact Areas ────────────────────────────────────

async function identifyHighImpactAreas(surveyResults: SurveyResult): Promise<InvestigationPlan> {
  console.log('\nPhase 2: Identifying high-impact areas...\n');

  let result = '{}';

  for await (const message of query({
    prompt: `Codebase survey:\n${JSON.stringify(surveyResults, null, 2)}\n\nEntry point snippet (server.js):\n${MOCK_SERVER_JS_SNIPPET}`,
    options: {
      systemPrompt: `You are a senior developer prioritizing technical debt investigation.
Rank the top 5 investigation targets by impact. Return JSON: {
  "targets": [{ "file": "...", "priority": 1, "reason": "...", "estimatedDifficulty": "low|medium|high" }],
  "investigationOrder": ["file1.js", "file2.js"],
  "rationale": "..."
}`,
      maxTurns: 1,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
    }
  }

  try {
    const plan = JSON.parse(result);
    for (const target of plan.targets ?? []) {
      console.log(`    ${target.priority}. ${target.file} (${target.estimatedDifficulty})`);
    }
    return plan;
  } catch {
    return { targets: [], raw: result };
  }
}

// ─── Phase 3: Investigate Targets ───────────────────────────────────────────

const MOCK_FILE_CONTENTS: Record<string, string> = {
  'src/services/legacy-billing.js': `// DO NOT TOUCH -- this handles all billing logic
// Last modified: 2019-03-15
const moment = require('moment');
function calculateBilling(customer, orders) {
  var total = 0;
  for (var i = 0; i < orders.length; i++) {
    total += orders[i].amount * 1.08; // hardcoded tax rate
  }
  return total; // floating point on currency
}
module.exports = { calculateBilling };`,

  'src/services/payment-service.js': `const stripe = require('stripe')('sk_live_HARDCODED_KEY');
async function processPayment(orderId, paymentMethod) {
  const order = await Order.findById(orderId);
  const charge = await stripe.charges.create({
    amount: Math.round(order.amount * 100),
    currency: 'usd',
    source: paymentMethod,
  }); // no idempotency key, no error handling
  return charge;
}
module.exports = { processPayment };`,
};

async function investigateTargets(plan: InvestigationPlan): Promise<InvestigationFinding[]> {
  console.log('\nPhase 3: Investigating targets...\n');

  const targets = (plan.targets ?? []).map(t => t.file);
  const investigated = new Set<string>();
  const allFindings: InvestigationFinding[] = [];
  const queue = [...targets];

  // EXAM KEY CONCEPT: Adaptive -- new targets discovered during investigation
  while (queue.length > 0 && investigated.size < 8) {
    const target = queue.shift()!;
    if (investigated.has(target)) continue;
    investigated.add(target);

    const mockContent = MOCK_FILE_CONTENTS[target];
    if (!mockContent) {
      console.log(`  Skipping ${target} (no mock content)`);
      continue;
    }

    console.log(`  Investigating: ${target}`);

    let result = '{}';
    for await (const message of query({
      prompt: `File: ${target}\n\nContent:\n${mockContent}`,
      options: {
        systemPrompt: `You are investigating a file for technical debt. Analyze for code quality, security, performance, and maintainability. Return JSON: {
  "file": "...",
  "issues": [{ "severity": "critical|high|medium|low", "category": "...", "description": "...", "recommendation": "..." }],
  "newTargets": ["newly-discovered-file.js"],
  "refactoringEffort": "hours|days|weeks",
  "summary": "..."
}`,
        maxTurns: 1,
      },
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result;
      }
    }

    try {
      const finding = JSON.parse(result);
      allFindings.push(finding);
      console.log(`    Found ${finding.issues?.length ?? 0} issues`);

      // ADAPTIVE: Add newly discovered targets
      if (finding.newTargets?.length > 0) {
        for (const newTarget of finding.newTargets) {
          if (!investigated.has(newTarget) && !queue.includes(newTarget)) {
            console.log(`    --> Discovered new target: ${newTarget}`);
            queue.push(newTarget);
          }
        }
      }
    } catch {
      allFindings.push({ file: target, issues: [], raw: result });
    }
  }

  return allFindings;
}

// ─── Full Pipeline ──────────────────────────────────────────────────────────

async function exploreCodebase() {
  console.log('=== Adaptive Decomposition: Legacy Codebase Exploration ===\n');

  const survey = await mapStructure();
  const plan = await identifyHighImpactAreas(survey);
  const findings = await investigateTargets(plan);

  console.log('\n=== Final Technical Debt Report ===');
  console.log(`Files investigated: ${findings.length}`);

  const criticalIssues = findings.flatMap(f =>
    (f.issues ?? []).filter(i => i.severity === 'critical')
  );
  console.log(`Critical issues: ${criticalIssues.length}`);

  return { survey, plan, findings };
}

// ─── Run ────────────────────────────────────────────────────────────────────

async function main() {
  const report = await exploreCodebase();
  console.log('\nReport summary:', JSON.stringify(report, null, 2));
}

main().catch(console.error);

export { mapStructure, identifyHighImpactAreas, investigateTargets, exploreCodebase };
