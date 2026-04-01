/**
 * Scenario 3: Research Provenance -- Claim-Source Mapping (Agent SDK)
 *
 * Exam relevance (Task 5.6):
 * - Structured claim-source mappings from subagents through synthesis
 * - Conflict detection and preservation (never average or resolve)
 * - Temporal context (publication dates alongside statistics)
 * - Coverage annotations marking well-supported vs gap areas
 *
 * EXAM KEY CONCEPT:
 *   This is the atomic unit of provenance tracking: every factual assertion
 *   carries its source metadata. This mapping must survive through ALL
 *   processing steps, including synthesis and summarization. Conflicts are
 *   flagged, not resolved. Coverage gaps are annotated.
 *
 * This module provides claim-source data structures, conflict detection,
 * provenance-preserving synthesis, and report rendering. Uses query() for
 * the synthesis subagent step.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../../../shared/tools/research-tools.js';

// ─── Data Structures ─────────────────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: This is the atomic unit of provenance tracking.
 * Every factual assertion carries its source metadata.
 */
export function createClaim({ claim, evidence, sourceUrl, sourceName, publicationDate, confidence, page = null, methodology = null }) {
  return Object.freeze({
    claim, evidence,
    source: Object.freeze({ url: sourceUrl, name: sourceName, publicationDate, page }),
    confidence, methodology,
    id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
}

export function createFindings({ topic, findings, gaps = [], subagentId }) {
  return { topic, findings, gaps, subagentId, collectedAt: new Date().toISOString(), findingCount: findings.length };
}

// ─── Conflict Detection ──────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Conflicts are detected automatically by comparing claims
// from different sources. When detected, BOTH values are preserved.

export function detectConflicts(allFindings) {
  const conflicts = [];
  const allClaims = allFindings.flatMap(f => f.findings);

  const numericClaims = allClaims
    .map(claim => ({ claim, numbers: extractNumbers(claim.claim), keywords: extractKeywords(claim.claim) }))
    .filter(c => c.numbers.length > 0);

  for (let i = 0; i < numericClaims.length; i++) {
    for (let j = i + 1; j < numericClaims.length; j++) {
      const a = numericClaims[i];
      const b = numericClaims[j];

      if (a.claim.source.name === b.claim.source.name) continue;

      const sharedKeywords = a.keywords.filter(k => b.keywords.includes(k));
      if (sharedKeywords.length < 3) continue;

      const numbersMatch = a.numbers.some(na => b.numbers.some(nb => na === nb));
      if (!numbersMatch) {
        conflicts.push(createConflict(a.claim, b.claim, sharedKeywords));
      }
    }
  }

  return deduplicateConflicts(conflicts);
}

function extractNumbers(text) {
  return text.match(/(\d+\.?\d*%|\$[\d,.]+[MBK]?|\d{2,})/g) || [];
}

function extractKeywords(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
}

function createConflict(claimA, claimB, sharedKeywords) {
  return {
    id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metric: sharedKeywords.slice(0, 5).join(' '),
    claimA: { value: extractNumbers(claimA.claim)[0], fullClaim: claimA.claim, source: claimA.source, evidence: claimA.evidence },
    claimB: { value: extractNumbers(claimB.claim)[0], fullClaim: claimB.claim, source: claimB.source, evidence: claimB.evidence },
    explanation: inferConflictExplanation(claimA, claimB),
    resolution: 'NONE -- both values preserved with full attribution',
  };
}

function inferConflictExplanation(claimA, claimB) {
  const explanations = [];
  if (claimA.evidence !== claimB.evidence) {
    explanations.push(`Different methodologies: "${claimA.evidence}" vs "${claimB.evidence}"`);
  }
  const dateA = claimA.source.publicationDate;
  const dateB = claimB.source.publicationDate;
  if (dateA && dateB && dateA !== dateB) {
    explanations.push(`Different publication dates: ${dateA} vs ${dateB}`);
  }
  return explanations.length > 0 ? explanations.join('. ') : 'Reason not determined from available metadata.';
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

// ─── Provenance-Preserving Synthesis ────��────────────────────────────────────

/**
 * EXAM KEY CONCEPT: Every claim in the output is traceable to its original
 * source. Conflicts are flagged, not resolved. Coverage gaps are annotated.
 */
export function synthesizeWithProvenance(allFindings, reportTitle = 'Research Synthesis') {
  const allClaims = allFindings.flatMap(f => f.findings);
  const conflicts = detectConflicts(allFindings);
  const coverage = assessCoverage(allFindings);
  const sources = collectUniqueSources(allClaims);

  const conflictClaimIds = new Set();
  for (const conflict of conflicts) {
    conflictClaimIds.add(conflict.claimA.fullClaim);
    conflictClaimIds.add(conflict.claimB.fullClaim);
  }

  const regularFindings = allClaims.filter(c => !conflictClaimIds.has(c.claim));

  return {
    title: reportTitle,
    generatedAt: new Date().toISOString(),
    statistics: { totalClaims: allClaims.length, totalSources: sources.length, conflictsDetected: conflicts.length },
    findings: regularFindings.map(c => ({
      claim: c.claim, source: c.source.name, sourceUrl: c.source.url,
      publicationDate: c.source.publicationDate, page: c.source.page,
      confidence: c.confidence, evidence: c.evidence,
    })),
    conflicts: conflicts.map(c => ({
      metric: c.metric,
      values: [
        { value: c.claimA.value, source: c.claimA.source.name, publishedDate: c.claimA.source.publicationDate, claim: c.claimA.fullClaim, evidence: c.claimA.evidence },
        { value: c.claimB.value, source: c.claimB.source.name, publishedDate: c.claimB.source.publicationDate, claim: c.claimB.fullClaim, evidence: c.claimB.evidence },
      ],
      explanation: c.explanation,
      resolution: c.resolution,
    })),
    coverage,
    sources,
  };
}

// ─── Coverage Assessment ─────────────────────────────────────────────────────

function assessCoverage(allFindings) {
  const topicMap = new Map();

  for (const finding of allFindings) {
    if (!topicMap.has(finding.topic)) topicMap.set(finding.topic, { sources: new Set(), claimCount: 0, gaps: [] });
    const entry = topicMap.get(finding.topic);
    entry.sources.add(finding.subagentId || 'unknown');
    entry.claimCount += finding.findings.length;
    entry.gaps.push(...(finding.gaps || []));
  }

  return Array.from(topicMap.entries()).map(([topic, data]) => ({
    topic,
    level: data.claimCount === 0 ? 'gap' : data.sources.size >= 2 ? 'well-supported' : 'single-source',
    sourceCount: data.sources.size,
    claimCount: data.claimCount,
    gaps: data.gaps,
  }));
}

function collectUniqueSources(claims) {
  const seen = new Map();
  for (const claim of claims) {
    const key = claim.source.url || claim.source.name;
    if (!seen.has(key)) {
      seen.set(key, { name: claim.source.name, url: claim.source.url, publicationDate: claim.source.publicationDate });
    }
  }
  return Array.from(seen.values());
}

// ─── Report Renderer ─────────────────────────────────────────────────────────

export function renderReport(report) {
  const lines = [];
  lines.push(`# ${report.title}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Claims: ${report.statistics.totalClaims} | Sources: ${report.statistics.totalSources} | Conflicts: ${report.statistics.conflictsDetected}`);
  lines.push('');

  lines.push('## Key Findings', '');
  for (const f of report.findings) {
    lines.push(`- **${f.claim}**`);
    lines.push(`  *${f.source}* (${f.publicationDate}${f.page ? `, p.${f.page}` : ''}) [${f.confidence}]`);
  }
  lines.push('');

  if (report.conflicts.length > 0) {
    lines.push('## Conflicting Data', '');
    for (const conflict of report.conflicts) {
      lines.push(`### ${conflict.metric}`, '');
      lines.push('| Value | Source | Published | Evidence |');
      lines.push('|-------|--------|-----------|----------|');
      for (const val of conflict.values) {
        lines.push(`| ${val.value} | ${val.source} | ${val.publishedDate} | ${val.evidence || 'N/A'} |`);
      }
      lines.push('', `**Explanation:** ${conflict.explanation}`, `**Resolution:** ${conflict.resolution}`, '');
    }
  }

  lines.push('## Coverage', '');
  for (const topic of report.coverage) {
    const icon = { 'well-supported': '+', 'single-source': '~', gap: '!' }[topic.level];
    lines.push(`${icon} **${topic.topic}**: ${topic.level} (${topic.sourceCount} source(s), ${topic.claimCount} claim(s))`);
  }
  lines.push('');

  lines.push('## Sources', '');
  for (const source of report.sources) {
    lines.push(`- **${source.name}**: ${source.url} (published ${source.publicationDate})`);
  }

  return lines.join('\n');
}

// ─── Anti-Pattern Demonstration ─────────���────────────────────────────────────

/**
 * EXAM KEY CONCEPT: These anti-patterns destroy provenance and create
 * unverifiable or fabricated claims.
 */
export function demonstrateAntiPatterns() {
  return {
    averaging: { bad: 'AI art tools market grew approximately 50% in 2024.', problem: 'Averages 47% and 52%, creating a fabricated number.', fix: 'Present both with attribution.' },
    droppingAttribution: { bad: 'The AI art tools market experienced significant growth.', problem: 'Loses the specific number and source.', fix: 'Keep number and source.' },
    arbitrarySelection: { bad: 'AI art tools market grew 52% in 2024.', problem: 'Picks the higher number without acknowledging the other.', fix: 'Present both and note discrepancy.' },
    droppingDates: { bad: 'Solar cell efficiency reached 33.7%.', problem: 'Without date, reader cannot assess recency.', fix: 'Include date: "33.7% (Energy Journal, Jan 2025)"' },
  };
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Scenario 3: Research Provenance -- Claim-Source Mapping');
  console.log('='.repeat(60));

  const findings = [
    createFindings({
      topic: 'AI in Creative Industries', subagentId: 'doc-analysis-1',
      findings: [
        createClaim({ claim: 'AI art tools market grew 47% year-over-year in 2024', evidence: 'Market analysis of 50 platforms', sourceUrl: 'https://example.com/docs/doc-001', sourceName: 'Research Institute', publicationDate: '2025-02-15', confidence: 'high', page: 12 }),
        createClaim({ claim: 'AI-assisted music production reduced production time by 35%', evidence: 'Survey of 200 producers', sourceUrl: 'https://example.com/docs/doc-001', sourceName: 'Research Institute', publicationDate: '2025-02-15', confidence: 'medium', page: 28 }),
      ],
    }),
    createFindings({
      topic: 'AI in Creative Industries', subagentId: 'doc-analysis-2',
      findings: [
        createClaim({ claim: 'AI art tools market grew 52% year-over-year in 2024', evidence: 'Revenue data from 75 platforms', sourceUrl: 'https://example.com/docs/doc-002', sourceName: 'Economic Research Group', publicationDate: '2025-01-30', confidence: 'high', page: 8 }),
        createClaim({ claim: 'Studios using AI VFX tools saved an average of $2.3M per production', evidence: 'Case study of 12 productions', sourceUrl: 'https://example.com/docs/doc-002', sourceName: 'Economic Research Group', publicationDate: '2025-01-30', confidence: 'medium', page: 22 }),
      ],
    }),
  ];

  const report = synthesizeWithProvenance(findings, 'AI in Creative Industries: Research Report');
  console.log('\n' + renderReport(report));

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
