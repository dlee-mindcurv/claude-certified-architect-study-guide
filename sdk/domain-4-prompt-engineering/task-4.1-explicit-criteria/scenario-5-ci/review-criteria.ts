/**
 * Scenario 5 (CI/CD) -- Full Review Criteria Implementation
 *
 * Exam relevance:
 * - Task 4.1: Explicit criteria with severity levels and skip rules
 * - detected_pattern enables per-category false positive tracking
 * - SKIP_PATTERNS allows temporarily disabling high false-positive categories
 * - Confidence threshold filters low-confidence findings
 *
 * This module defines the complete review criteria configuration for a CI/CD
 * pipeline. Uses Agent SDK query() with explicit review criteria in the prompt.
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.1-explicit-criteria/scenario-5-ci/review-criteria.js
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { reviewCriteriaPrompt } from '../../../../shared/prompts/review-criteria.js';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ReviewFinding {
  detected_pattern: string;
  confidence: number;
  issue: string;
  [key: string]: unknown;
}

interface ReviewResult {
  findings: ReviewFinding[];
  summary: Record<string, unknown>;
}

interface FeedbackRecord {
  detected_pattern: string;
  is_false_positive: boolean;
}

interface PatternStats {
  total: number;
  false_positives: number;
}

// ─── Severity Definitions ───────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Each severity level has an explicit definition,
// a merge-blocking policy, and concrete examples. This replaces vague
// instructions like "be conservative" with measurable criteria.

const SEVERITY_DEFINITIONS = {
  critical: {
    description: 'Security vulnerabilities or data loss risks',
    mergePolicy: 'BLOCKS merge -- must be fixed before approval',
    examples: [
      'SQL injection via string concatenation',
      'XSS from unescaped user input in HTML',
      'Hardcoded credentials or API keys',
      'Path traversal in file operations',
    ],
  },
  high: {
    description: 'Bugs that will cause runtime errors in production',
    mergePolicy: 'Should fix before merge -- reviewer marks "request changes"',
    examples: [
      'Null/undefined access without guards',
      'Off-by-one errors in loops or array access',
      'Race conditions from missing await',
      'Type mismatches causing runtime errors',
    ],
  },
  medium: {
    description: 'Logic issues or missing edge cases',
    mergePolicy: 'Recommend fixing -- reviewer leaves comment',
    examples: [
      'Conditions that are always true/false',
      'Missing error handling on API calls',
      'Dead code paths',
    ],
  },
  low: {
    description: 'Code quality suggestions',
    mergePolicy: 'Optional, informational only -- no merge impact',
    examples: [
      'Opportunity to use more descriptive variable names in complex logic',
      'Potential performance improvement in hot paths',
    ],
  },
};

// ─── Skip Rules ─────────────────────────────────────────────────────────────

const SKIP_RULES = [
  'Minor style preferences (semicolons, trailing commas, bracket placement)',
  'Local variable naming that is clear in context',
  'Import ordering',
  'Missing JSDoc on internal (non-exported) functions',
  'Using "any" in TypeScript for quick prototyping (unless in shared types)',
  'Console.log statements in test files',
  'TODO comments (tracked separately in issue tracker)',
];

// ─── Suppressed Patterns ────────────────────────────────────────────────────

const SUPPRESSED_PATTERNS: string[] = [
  // 'unused-import',      // Example: suppressed due to 45% FP rate in week 3
  // 'generic-naming',     // Example: suppressed due to 38% FP rate in week 5
];

// ─── Confidence Threshold ───────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.8;

// ─── Review Pipeline ────────────────────────────────────────────────────────

/**
 * Run a code review with explicit criteria against the provided diff.
 * Uses Agent SDK query() with the review criteria prompt as context.
 *
 * @param {string} codeDiff - The code changes to review
 * @returns {object} Filtered findings with false positive tracking metadata
 */
async function reviewWithExplicitCriteria(codeDiff: string) {
  console.log('Running review with explicit criteria...\n');

  // ── Step 1: Send code through the review criteria prompt via query() ──
  const prompt = `${reviewCriteriaPrompt}\n\n## Code to Review\n\n\`\`\`\n${codeDiff}\n\`\`\``;

  let rawText = '';
  for await (const message of query({ prompt })) {
    if (message.type === 'result' && message.subtype === 'success') {
      rawText = message.result;
    }
  }

  // ── Step 2: Parse the structured JSON output ────────────────────────
  let reviewResult: ReviewResult;
  try {
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawText];
    reviewResult = JSON.parse(jsonMatch[1]!.trim()) as ReviewResult;
  } catch (parseError) {
    console.error('Failed to parse review output as JSON:', (parseError as Error).message);
    console.log('Raw output:', rawText);
    return { findings: [], summary: null, parseError: true };
  }

  // ── Step 3: Filter by confidence threshold ──────────────────────────
  const confidentFindings = reviewResult.findings.filter((f: ReviewFinding) => {
    if (f.confidence < CONFIDENCE_THRESHOLD) {
      console.log(
        `  [FILTERED] Low confidence (${f.confidence}): ${f.detected_pattern} -- ${f.issue}`
      );
      return false;
    }
    return true;
  });

  // ── Step 4: Filter suppressed patterns ──────────────────────────────
  const activeFindings = confidentFindings.filter((f: ReviewFinding) => {
    if (SUPPRESSED_PATTERNS.includes(f.detected_pattern)) {
      console.log(
        `  [SUPPRESSED] Pattern "${f.detected_pattern}" is temporarily disabled`
      );
      return false;
    }
    return true;
  });

  // ── Step 5: Build tracking metadata ─────────────────────────────────
  const patternCounts: Record<string, number> = {};
  for (const finding of activeFindings) {
    const pattern = finding.detected_pattern || 'unknown';
    patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
  }

  const result = {
    findings: activeFindings,
    summary: {
      ...reviewResult.summary,
      total_after_filtering: activeFindings.length,
      total_before_filtering: reviewResult.findings.length,
      suppressed_count: confidentFindings.length - activeFindings.length,
      low_confidence_count: reviewResult.findings.length - confidentFindings.length,
    },
    pattern_tracking: patternCounts,
    severity_definitions: SEVERITY_DEFINITIONS,
  };

  return result;
}

/**
 * Track false positive rates over time per detected_pattern.
 *
 * EXAM KEY CONCEPT: This function takes human feedback (which findings were
 * false positives) and computes per-pattern FP rates. Patterns exceeding
 * the threshold are candidates for suppression.
 */
function analyzeFalsePositiveRates(feedbackRecords: FeedbackRecord[], threshold = 0.3) {
  const patternStats: Record<string, PatternStats> = {};

  for (const record of feedbackRecords) {
    const pattern = record.detected_pattern;
    if (!patternStats[pattern]) {
      patternStats[pattern] = { total: 0, false_positives: 0 };
    }
    patternStats[pattern].total++;
    if (record.is_false_positive) {
      patternStats[pattern].false_positives++;
    }
  }

  const analysis: Record<string, { total: number; false_positives: number; fp_rate: number; status: string }> = {};
  const suppressionCandidates: string[] = [];

  for (const [pattern, stats] of Object.entries(patternStats)) {
    const fpRate = stats.false_positives / stats.total;
    analysis[pattern] = {
      total: stats.total,
      false_positives: stats.false_positives,
      fp_rate: Math.round(fpRate * 100) / 100,
      status: fpRate > threshold ? 'SUPPRESS_CANDIDATE' : 'OK',
    };
    if (fpRate > threshold) {
      suppressionCandidates.push(pattern);
    }
  }

  return {
    per_pattern: analysis,
    suppression_candidates: suppressionCandidates,
    recommendation:
      suppressionCandidates.length > 0
        ? `Consider suppressing: ${suppressionCandidates.join(', ')}`
        : 'All patterns within acceptable FP rate',
  };
}

// ─── Demo Execution ─────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.1 / Scenario 5 -- CI Review with Explicit Criteria\n');

  const sampleDiff = `
// File: src/api/users.js

export async function getActiveUsers(teamId) {
  // SQL injection: string concatenation in query
  const query = \`SELECT * FROM users WHERE team_id = '\${teamId}'\`;
  const users = await db.query(query);

  // Null access: filter could return empty array
  const admin = users.filter(u => u.role === 'admin')[0].name;

  return { admin, users };
}

export function renderProfile(user) {
  // XSS: unescaped user input in HTML
  return \`<div class="profile">\${user.bio}</div>\`;
}

// Style issues below (should NOT be flagged):
// - lodash imported but unused
import _ from 'lodash';

// - Non-standard import ordering
import { db } from '../database.js';
import express from 'express';
`;

  // ── Run the review ──────────────────────────────────────────────────
  const result = await reviewWithExplicitCriteria(sampleDiff);

  console.log('\n--- Review Results ---');
  console.log(JSON.stringify(result, null, 2));

  // ── Demonstrate false positive tracking ─────────────────────────────
  console.log('\n--- False Positive Rate Analysis (simulated feedback) ---');

  const simulatedFeedback = [
    { detected_pattern: 'sql-injection', is_false_positive: false },
    { detected_pattern: 'sql-injection', is_false_positive: false },
    { detected_pattern: 'null-access-without-guard', is_false_positive: false },
    { detected_pattern: 'null-access-without-guard', is_false_positive: true },
    { detected_pattern: 'xss-unescaped-input', is_false_positive: false },
    { detected_pattern: 'unused-import', is_false_positive: true },
    { detected_pattern: 'unused-import', is_false_positive: true },
    { detected_pattern: 'unused-import', is_false_positive: false },
  ];

  const fpAnalysis = analyzeFalsePositiveRates(simulatedFeedback);
  console.log(JSON.stringify(fpAnalysis, null, 2));
}

main().catch(console.error);
