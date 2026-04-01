/**
 * Scenario 3: Research System Provenance — Claim-Source Mapping Implementation
 *
 * Exam relevance (Task 5.6):
 * - Structured claim-source mappings from subagents through synthesis
 * - Conflict detection and preservation (never average or arbitrarily resolve)
 * - Temporal context (publication dates alongside statistics)
 * - Coverage annotations marking well-supported vs gap areas
 * - Content type rendering (tables for data, prose for qualitative)
 *
 * This module provides:
 * 1. Claim-source data structures
 * 2. Conflict detection across multiple sources
 * 3. Provenance-preserving synthesis
 * 4. Report rendering with attribution, conflicts, and coverage
 */

import { researchToolDefinitions, executeResearchTool } from '../../../../shared/tools/research-tools.js';
import { researchCoordinatorPrompt, synthesisSubagentPrompt } from '../../../../shared/prompts/research-coordinator.js';

// ─── Data Structures ─────────────────────────────────────────────────────────

/**
 * Create a structured claim with full source attribution.
 *
 * EXAM KEY CONCEPT: This is the atomic unit of provenance tracking.
 * Every factual assertion in the system carries its source metadata.
 * This mapping must survive through all processing steps, including
 * synthesis and summarization.
 */
export function createClaim({
  claim,
  evidence,
  sourceUrl,
  sourceName,
  publicationDate,
  confidence,
  page = null,
  methodology = null,
}) {
  return Object.freeze({
    claim,
    evidence,
    source: Object.freeze({
      url: sourceUrl,
      name: sourceName,
      publicationDate,
      page,
    }),
    confidence,
    methodology,
    id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
}

/**
 * Create a findings container for a subagent's output.
 */
export function createFindings({ topic, findings, gaps = [], subagentId }) {
  return {
    topic,
    findings,
    gaps,
    subagentId,
    collectedAt: new Date().toISOString(),
    findingCount: findings.length,
  };
}

// ─── Conflict Detection ──────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Conflicts are detected automatically by comparing claims
// from different sources that address the same metric with different values.
// When detected, BOTH values are preserved — never averaged or resolved.

/**
 * Detect conflicts across all subagent findings.
 *
 * @param {Array} allFindings - Array of findings containers
 * @returns {Array} Detected conflicts
 */
export function detectConflicts(allFindings) {
  const conflicts = [];
  const allClaims = allFindings.flatMap(f => f.findings);

  // Index claims by extracted numeric values for comparison
  const numericClaims = allClaims
    .map(claim => ({
      claim,
      numbers: extractNumbers(claim.claim),
      keywords: extractKeywords(claim.claim),
    }))
    .filter(c => c.numbers.length > 0);

  // Compare each pair
  for (let i = 0; i < numericClaims.length; i++) {
    for (let j = i + 1; j < numericClaims.length; j++) {
      const a = numericClaims[i];
      const b = numericClaims[j];

      // Skip same source
      if (a.claim.source.name === b.claim.source.name) continue;

      // Check if claims are about the same topic
      const sharedKeywords = a.keywords.filter(k => b.keywords.includes(k));
      if (sharedKeywords.length < 3) continue;

      // Check if they have different numbers
      const numbersMatch = a.numbers.some(na =>
        b.numbers.some(nb => na === nb)
      );

      if (!numbersMatch && a.numbers.length > 0 && b.numbers.length > 0) {
        conflicts.push(createConflict(a.claim, b.claim, sharedKeywords));
      }
    }
  }

  return deduplicateConflicts(conflicts);
}

function extractNumbers(text) {
  const matches = text.match(/(\d+\.?\d*%|\$[\d,.]+[MBK]?|\d{2,})/g) || [];
  return matches;
}

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function createConflict(claimA, claimB, sharedKeywords) {
  return {
    id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metric: sharedKeywords.slice(0, 5).join(' '),
    claimA: {
      value: extractNumbers(claimA.claim)[0],
      fullClaim: claimA.claim,
      source: claimA.source,
      evidence: claimA.evidence,
      methodology: claimA.methodology,
    },
    claimB: {
      value: extractNumbers(claimB.claim)[0],
      fullClaim: claimB.claim,
      source: claimB.source,
      evidence: claimB.evidence,
      methodology: claimB.methodology,
    },
    explanation: inferConflictExplanation(claimA, claimB),
    resolution: 'NONE — both values preserved with full attribution',
  };
}

function inferConflictExplanation(claimA, claimB) {
  const explanations = [];

  // Check methodology differences
  if (claimA.evidence !== claimB.evidence) {
    explanations.push(`Different methodologies: "${claimA.evidence}" vs "${claimB.evidence}"`);
  }

  // Check temporal differences
  const dateA = claimA.source.publicationDate;
  const dateB = claimB.source.publicationDate;
  if (dateA && dateB && dateA !== dateB) {
    const daysDiff = Math.abs(new Date(dateA) - new Date(dateB)) / (1000 * 60 * 60 * 24);
    if (daysDiff > 90) {
      explanations.push(
        `Significant temporal gap: ${dateA} vs ${dateB} (${Math.round(daysDiff)} days apart). Values may reflect different measurement periods.`
      );
    } else {
      explanations.push(`Published ${Math.round(daysDiff)} days apart (${dateA} vs ${dateB})`);
    }
  }

  return explanations.length > 0
    ? explanations.join('. ')
    : 'Reason for discrepancy not determined from available metadata.';
}

function deduplicateConflicts(conflicts) {
  const seen = new Set();
  return conflicts.filter(c => {
    const key = [c.claimA.value, c.claimB.value].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Provenance-Preserving Synthesis ─────────────────────────────────────────

/**
 * Synthesize findings from multiple subagents while preserving all provenance.
 *
 * EXAM KEY CONCEPT: This function represents the correct synthesis pattern.
 * Every claim in the output is traceable to its original source.
 * Conflicts are flagged, not resolved.
 * Coverage gaps are annotated.
 *
 * @param {Array} allFindings - Findings from all subagents
 * @param {string} reportTitle - Title for the report
 * @returns {object} Synthesized report with full provenance
 */
export function synthesizeWithProvenance(allFindings, reportTitle = 'Research Synthesis') {
  const allClaims = allFindings.flatMap(f => f.findings);
  const conflicts = detectConflicts(allFindings);
  const coverage = assessCoverage(allFindings);
  const sources = collectUniqueSources(allClaims);

  // Group non-conflicting claims by topic
  const conflictClaimIds = new Set();
  for (const conflict of conflicts) {
    // Mark claims involved in conflicts so they appear in the conflicts section
    // rather than the findings section
    conflictClaimIds.add(conflict.claimA.fullClaim);
    conflictClaimIds.add(conflict.claimB.fullClaim);
  }

  const regularFindings = allClaims.filter(c => !conflictClaimIds.has(c.claim));

  return {
    title: reportTitle,
    generatedAt: new Date().toISOString(),
    statistics: {
      totalClaims: allClaims.length,
      totalSources: sources.length,
      conflictsDetected: conflicts.length,
      coverageGaps: coverage.filter(c => c.level === 'gap').length,
    },

    // Section 1: Key findings (non-conflicting, with attribution)
    findings: regularFindings.map(claim => ({
      claim: claim.claim,
      source: claim.source.name,
      sourceUrl: claim.source.url,
      publicationDate: claim.source.publicationDate,
      page: claim.source.page,
      confidence: claim.confidence,
      evidence: claim.evidence,
    })),

    // Section 2: Conflicting data (both values preserved)
    conflicts: conflicts.map(c => ({
      metric: c.metric,
      values: [
        {
          value: c.claimA.value,
          source: c.claimA.source.name,
          sourceUrl: c.claimA.source.url,
          publishedDate: c.claimA.source.publicationDate,
          claim: c.claimA.fullClaim,
          evidence: c.claimA.evidence,
        },
        {
          value: c.claimB.value,
          source: c.claimB.source.name,
          sourceUrl: c.claimB.source.url,
          publishedDate: c.claimB.source.publicationDate,
          claim: c.claimB.fullClaim,
          evidence: c.claimB.evidence,
        },
      ],
      explanation: c.explanation,
      resolution: c.resolution,
    })),

    // Section 3: Coverage
    coverage,

    // Section 4: Sources
    sources,
  };
}

// ─── Coverage Assessment ─────────────────────────────────────────────────────

function assessCoverage(allFindings) {
  const topicMap = new Map();

  for (const finding of allFindings) {
    if (!topicMap.has(finding.topic)) {
      topicMap.set(finding.topic, {
        sources: new Set(),
        claimCount: 0,
        gaps: [],
      });
    }
    const entry = topicMap.get(finding.topic);
    entry.sources.add(finding.subagentId || 'unknown');
    entry.claimCount += finding.findings.length;
    entry.gaps.push(...(finding.gaps || []));
  }

  return Array.from(topicMap.entries()).map(([topic, data]) => {
    let level;
    if (data.claimCount === 0) level = 'gap';
    else if (data.sources.size >= 2) level = 'well-supported';
    else level = 'single-source';

    return {
      topic,
      level,
      sourceCount: data.sources.size,
      claimCount: data.claimCount,
      gaps: data.gaps,
    };
  });
}

function collectUniqueSources(claims) {
  const seen = new Map();

  for (const claim of claims) {
    const key = claim.source.url || claim.source.name;
    if (!seen.has(key)) {
      seen.set(key, {
        name: claim.source.name,
        url: claim.source.url,
        publicationDate: claim.source.publicationDate,
      });
    }
  }

  return Array.from(seen.values());
}

// ─── Report Renderer ─────────────────────────────────────────────────────────

/**
 * Render the synthesized report as formatted markdown.
 *
 * Content type rendering:
 * - Quantitative findings: bullet list with source citations
 * - Conflicting data: side-by-side comparison with attribution
 * - Coverage: annotated list with level indicators
 * - Sources: full attribution with dates
 */
export function renderReport(report) {
  const lines = [];

  lines.push(`# ${report.title}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Claims: ${report.statistics.totalClaims} | Sources: ${report.statistics.totalSources} | Conflicts: ${report.statistics.conflictsDetected}`);
  lines.push('');

  // Key Findings
  lines.push('## Key Findings');
  lines.push('');
  for (const f of report.findings) {
    lines.push(`- **${f.claim}**`);
    lines.push(`  *${f.source}* (${f.publicationDate}${f.page ? `, p.${f.page}` : ''}) [${f.confidence} confidence]`);
    if (f.evidence) {
      lines.push(`  Evidence: ${f.evidence}`);
    }
  }
  lines.push('');

  // Conflicting Data
  if (report.conflicts.length > 0) {
    lines.push('## Conflicting Data');
    lines.push('');
    lines.push('The following claims address the same metric but report different values.');
    lines.push('Both values are presented with full attribution for the reader to assess.');
    lines.push('');

    for (const conflict of report.conflicts) {
      lines.push(`### ${conflict.metric}`);
      lines.push('');
      lines.push('| Value | Source | Published | Evidence |');
      lines.push('|-------|--------|-----------|----------|');
      for (const val of conflict.values) {
        lines.push(`| ${val.value} | ${val.source} | ${val.publishedDate} | ${val.evidence || 'N/A'} |`);
      }
      lines.push('');
      lines.push(`**Possible explanation:** ${conflict.explanation}`);
      lines.push(`**Resolution:** ${conflict.resolution}`);
      lines.push('');
    }
  }

  // Coverage
  lines.push('## Coverage Assessment');
  lines.push('');
  for (const topic of report.coverage) {
    const icon = { 'well-supported': '+', 'single-source': '~', gap: '!' }[topic.level];
    lines.push(`${icon} **${topic.topic}**: ${topic.level}`);
    lines.push(`  ${topic.sourceCount} source(s), ${topic.claimCount} claim(s)`);
    if (topic.gaps.length > 0) {
      lines.push(`  Gaps: ${topic.gaps.join(', ')}`);
    }
  }
  lines.push('');

  // Sources
  lines.push('## Sources');
  lines.push('');
  for (const source of report.sources) {
    lines.push(`- **${source.name}**: ${source.url} (published ${source.publicationDate})`);
  }

  return lines.join('\n');
}

// ─── Anti-Pattern Demonstration ──────────────────────────────────────────────

/**
 * Demonstrate what BAD synthesis looks like (for exam study).
 *
 * EXAM KEY CONCEPT: These anti-patterns destroy provenance and create
 * unverifiable or fabricated claims.
 */
export function demonstrateAntiPatterns() {
  return {
    averaging: {
      bad: 'AI art tools market grew approximately 50% in 2024.',
      problem: 'Averages 47% and 52%, creating a fabricated number neither source reported.',
      fix: 'Present both: "47% (Research Institute) to 52% (Economic Research Group)"',
    },
    droppingAttribution: {
      bad: 'The AI art tools market experienced significant growth in 2024.',
      problem: 'Loses the specific number (47% or 52%), the source, and the methodology.',
      fix: 'Keep the number and source: "grew 47% (Research Institute, Feb 2025)"',
    },
    arbitrarySelection: {
      bad: 'AI art tools market grew 52% in 2024 (Economic Research Group).',
      problem: 'Picks the higher number without acknowledging the lower one.',
      fix: 'Present both values and note the discrepancy.',
    },
    droppingDates: {
      bad: 'Solar cell efficiency reached 33.7% in lab tests.',
      problem: 'Without the date, the reader cannot assess recency or compare with older data.',
      fix: 'Include the date: "33.7% in lab tests (Energy Journal, Jan 2025)"',
    },
  };
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Scenario 3: Research Provenance — Claim-Source Mapping');
  console.log('='.repeat(60));

  // Create findings from two analysis subagents with a known conflict
  const findings = [
    createFindings({
      topic: 'AI in Creative Industries',
      subagentId: 'doc-analysis-1',
      findings: [
        createClaim({
          claim: 'AI art tools market grew 47% year-over-year in 2024',
          evidence: 'Market analysis of 50 major AI art platforms',
          sourceUrl: 'https://example.com/docs/doc-001',
          sourceName: 'Research Institute',
          publicationDate: '2025-02-15',
          confidence: 'high',
          page: 12,
        }),
        createClaim({
          claim: 'AI-assisted music production reduced average production time by 35%',
          evidence: 'Survey of 200 music producers across 15 countries',
          sourceUrl: 'https://example.com/docs/doc-001',
          sourceName: 'Research Institute',
          publicationDate: '2025-02-15',
          confidence: 'medium',
          page: 28,
        }),
      ],
    }),
    createFindings({
      topic: 'AI in Creative Industries',
      subagentId: 'doc-analysis-2',
      findings: [
        createClaim({
          claim: 'AI art tools market grew 52% year-over-year in 2024',
          evidence: 'Revenue data analysis from 75 AI art platforms',
          sourceUrl: 'https://example.com/docs/doc-002',
          sourceName: 'Economic Research Group',
          publicationDate: '2025-01-30',
          confidence: 'high',
          page: 8,
        }),
        createClaim({
          claim: 'Studios using AI VFX tools saved an average of $2.3M per production',
          evidence: 'Case study of 12 major film productions',
          sourceUrl: 'https://example.com/docs/doc-002',
          sourceName: 'Economic Research Group',
          publicationDate: '2025-01-30',
          confidence: 'medium',
          page: 22,
        }),
      ],
    }),
  ];

  // Synthesize
  const report = synthesizeWithProvenance(findings, 'AI in Creative Industries: Research Report');
  const rendered = renderReport(report);

  console.log('\n' + rendered);

  // Show anti-patterns
  console.log('\n' + '='.repeat(60));
  console.log('ANTI-PATTERNS (for exam reference)');
  console.log('='.repeat(60));
  const antiPatterns = demonstrateAntiPatterns();
  for (const [name, pattern] of Object.entries(antiPatterns)) {
    console.log(`\n  ${name}:`);
    console.log(`    BAD:     ${pattern.bad}`);
    console.log(`    PROBLEM: ${pattern.problem}`);
    console.log(`    FIX:     ${pattern.fix}`);
  }
}

main().catch(console.error);
