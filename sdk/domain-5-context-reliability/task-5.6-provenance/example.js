/**
 * Task 5.6 -- Information Provenance and Source Attribution (Agent SDK)
 *
 * Exam relevance:
 * - Source attribution loss during summarization
 * - Structured claim-source mappings through synthesis
 * - Handling conflicting statistics: present both with attribution
 * - Temporal context (publication dates) to prevent confusion
 * - Coverage annotations for well-supported vs gap areas
 *
 * EXAM KEY CONCEPT:
 *   Every factual claim carries its source. This mapping must survive through
 *   the synthesis step. When two sources report different values for the same
 *   metric, the synthesis must present BOTH values with attribution. It must
 *   NOT average them, pick one, or synthesize a compromise value.
 *
 * Uses query() with a synthesis-focused agent that preserves provenance.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { researchServer } from '../../../shared/tools/research-tools.js';
import { researchCoordinatorPrompt } from '../../../shared/prompts/research-coordinator.js';

// ─── Structured Claim-Source Mapping ─────────────────────────────────────────
//
// EXAM KEY CONCEPT: Every factual claim carries its source. This is the
// fundamental unit of provenance tracking.

function createClaim({ claim, evidence, sourceUrl, sourceName, publicationDate, confidence, page = null }) {
  return {
    claim, evidence,
    source: { url: sourceUrl, name: sourceName, publicationDate, page },
    confidence,
    addedAt: new Date().toISOString(),
  };
}

// ─── Simulated Subagent Findings ─────────────────────────────────────────────
//
// Note: doc-001 and doc-002 report DIFFERENT growth rates for AI art tools.
// This is an intentional conflict that the synthesis must preserve.

const subagentFindings = {
  searchAgent: {
    topic: 'AI in creative industries',
    findings: [
      createClaim({ claim: 'ML models are revolutionizing digital art creation', evidence: 'Industry trends analysis', sourceUrl: 'https://example.com/ai-visual-arts', sourceName: 'TechReview', publicationDate: '2025-01-15', confidence: 'medium' }),
      createClaim({ claim: 'AI-powered tools are changing how musicians compose and produce', evidence: 'Music production workflow survey', sourceUrl: 'https://example.com/ai-music', sourceName: 'MusicTech Weekly', publicationDate: '2025-02-20', confidence: 'medium' }),
      createClaim({ claim: 'Studios are adopting AI tools for scriptwriting to VFX', evidence: 'Film production company survey', sourceUrl: 'https://example.com/ai-film', sourceName: 'Entertainment Tech', publicationDate: '2025-03-01', confidence: 'medium' }),
    ],
  },
  analysisAgent1: {
    topic: 'AI Creative Industries - Document Analysis (doc-001)',
    findings: [
      createClaim({ claim: 'AI art tools market grew 47% year-over-year in 2024', evidence: 'Market analysis of 50 major AI art platforms', sourceUrl: 'https://example.com/docs/doc-001', sourceName: 'Research Institute', publicationDate: '2025-02-15', confidence: 'high', page: 12 }),
      createClaim({ claim: 'AI-assisted music production reduced average production time by 35%', evidence: 'Survey of 200 music producers across 15 countries', sourceUrl: 'https://example.com/docs/doc-001', sourceName: 'Research Institute', publicationDate: '2025-02-15', confidence: 'medium', page: 28 }),
    ],
  },
  analysisAgent2: {
    topic: 'AI Creative Industries - Document Analysis (doc-002)',
    findings: [
      // CONFLICT: Different growth rate from a different source
      createClaim({ claim: 'AI art tools market grew 52% year-over-year in 2024', evidence: 'Revenue data from 75 AI art platforms', sourceUrl: 'https://example.com/docs/doc-002', sourceName: 'Economic Research Group', publicationDate: '2025-01-30', confidence: 'high', page: 8 }),
      createClaim({ claim: 'Studios using AI VFX tools saved an average of $2.3M per production', evidence: 'Case study of 12 major film productions', sourceUrl: 'https://example.com/docs/doc-002', sourceName: 'Economic Research Group', publicationDate: '2025-01-30', confidence: 'medium', page: 22 }),
    ],
  },
};

// ─── Conflict Detection ──────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: When two sources report different values for the same
// metric, present BOTH with attribution. Do NOT average, pick one, or
// synthesize a compromise.

function detectConflicts(allFindings) {
  const conflicts = [];
  const allClaims = allFindings.flatMap(f => f.findings);

  for (let i = 0; i < allClaims.length; i++) {
    for (let j = i + 1; j < allClaims.length; j++) {
      const a = allClaims[i];
      const b = allClaims[j];

      if (a.source.name === b.source.name) continue;

      const conflict = checkForConflict(a, b);
      if (conflict) conflicts.push(conflict);
    }
  }

  return conflicts;
}

function checkForConflict(claimA, claimB) {
  const numbersA = claimA.claim.match(/(\d+\.?\d*%|\$[\d,.]+[MBK]?)/g) || [];
  const numbersB = claimB.claim.match(/(\d+\.?\d*%|\$[\d,.]+[MBK]?)/g) || [];

  if (numbersA.length === 0 || numbersB.length === 0) return null;

  const wordsA = new Set(claimA.claim.toLowerCase().split(/\s+/));
  const wordsB = new Set(claimB.claim.toLowerCase().split(/\s+/));
  const overlap = [...wordsA].filter(w => wordsB.has(w) && w.length > 3);

  if (overlap.length >= 3 && numbersA[0] !== numbersB[0]) {
    return {
      metric: overlap.join(' '),
      valueA: { value: numbersA[0], source: claimA.source, claim: claimA.claim },
      valueB: { value: numbersB[0], source: claimB.source, claim: claimB.claim },
      possibleExplanation: claimA.evidence !== claimB.evidence
        ? `Different methodologies: "${claimA.evidence}" vs "${claimB.evidence}"`
        : 'Reason for discrepancy not determined',
    };
  }

  return null;
}

// ─── Synthesis with Provenance Preservation ──────────────────────────────────

function synthesizeWithProvenance(allFindings) {
  const allClaims = allFindings.flatMap(f => f.findings);
  const conflicts = detectConflicts(allFindings);

  return {
    title: 'AI in Creative Industries: Research Synthesis',
    generatedAt: new Date().toISOString(),
    findings: allClaims.map(c => ({
      claim: c.claim, source: c.source.name, sourceUrl: c.source.url,
      publicationDate: c.source.publicationDate, page: c.source.page,
      confidence: c.confidence, evidence: c.evidence,
    })),
    conflicts: conflicts.map(c => ({
      metric: c.metric,
      values: [
        { value: c.valueA.value, source: c.valueA.source.name, claim: c.valueA.claim, publishedDate: c.valueA.source.publicationDate },
        { value: c.valueB.value, source: c.valueB.source.name, claim: c.valueB.claim, publishedDate: c.valueB.source.publicationDate },
      ],
      possibleExplanation: c.possibleExplanation,
      resolution: 'NONE -- both values preserved with attribution',
    })),
    sources: getUniqueSourceList(allClaims),
  };
}

function getUniqueSourceList(claims) {
  const seen = new Set();
  const sources = [];
  for (const claim of claims) {
    const key = `${claim.source.name}|${claim.source.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({ name: claim.source.name, url: claim.source.url, publicationDate: claim.source.publicationDate });
    }
  }
  return sources;
}

// ─── Report Renderer ────────��────────────────────────────────────────────────

function renderReport(report) {
  const lines = [`# ${report.title}`, `Generated: ${report.generatedAt}`, ''];

  lines.push('## Key Findings');
  for (const f of report.findings) {
    lines.push(`- ${f.claim}`);
    lines.push(`  Source: ${f.source} (${f.publicationDate}${f.page ? `, p.${f.page}` : ''}) [${f.confidence}]`);
  }
  lines.push('');

  if (report.conflicts.length > 0) {
    lines.push('## Conflicting Data');
    for (const conflict of report.conflicts) {
      lines.push(`### ${conflict.metric}`);
      for (const val of conflict.values) {
        lines.push(`- **${val.value}**: ${val.source} (${val.publishedDate})`);
      }
      lines.push(`- Explanation: ${conflict.possibleExplanation}`);
      lines.push(`- Resolution: ${conflict.resolution}`);
      lines.push('');
    }
  }

  lines.push('## Sources');
  for (const source of report.sources) {
    lines.push(`- ${source.name}: ${source.url} (published ${source.publicationDate})`);
  }

  return lines.join('\n');
}

// ─── Main ���───────────────────────────────���────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Task 5.6: Information Provenance Through Synthesis');
  console.log('='.repeat(60));

  // Phase 1: Collect subagent findings
  console.log('\n--- Phase 1: Subagent Findings ---');
  const allFindings = Object.values(subagentFindings);

  for (const agentResult of allFindings) {
    console.log(`\n  Agent: ${agentResult.topic} (${agentResult.findings.length} findings)`);
    for (const f of agentResult.findings) {
      console.log(`    - "${f.claim}" [${f.source.name}, ${f.source.publicationDate}]`);
    }
  }

  // Phase 2: Detect conflicts
  console.log('\n--- Phase 2: Conflict Detection ---');
  const conflicts = detectConflicts(allFindings);
  console.log(`  Conflicts found: ${conflicts.length}`);
  for (const c of conflicts) {
    console.log(`\n  CONFLICT: ${c.metric}`);
    console.log(`    Value A: ${c.valueA.value} (${c.valueA.source.name})`);
    console.log(`    Value B: ${c.valueB.value} (${c.valueB.source.name})`);
  }

  // Phase 3: Synthesize with provenance
  console.log('\n--- Phase 3: Synthesis with Provenance ---');
  const report = synthesizeWithProvenance(allFindings);

  console.log('\n' + '='.repeat(60));
  console.log('SYNTHESIZED REPORT');
  console.log('='.repeat(60));
  console.log(renderReport(report));

  // Anti-pattern demonstration
  console.log('\n' + '='.repeat(60));
  console.log('ANTI-PATTERN: What Bad Synthesis Looks Like');
  console.log('='.repeat(60));
  console.log('\n  BAD: "AI art tools market grew approximately 50% in 2024."');
  console.log('  - Averages two different values (47% and 52%)');
  console.log('  - Loses both source attributions');
  console.log('  - Creates a fabricated number');
  console.log('\n  GOOD: Present both values with full attribution and note the discrepancy.');
}

main().catch(console.error);
