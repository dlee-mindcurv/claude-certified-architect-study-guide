/**
 * Task 5.6 — Information Provenance and Source Attribution
 *
 * Exam relevance:
 * - Source attribution loss during summarization
 * - Structured claim-source mappings through synthesis
 * - Handling conflicting statistics: present both with attribution
 * - Temporal context (publication dates) to prevent confusion
 * - Coverage annotations for well-supported vs gap areas
 *
 * This example demonstrates:
 * 1. Subagent output with structured claim-source mappings
 * 2. Synthesis that preserves attribution
 * 3. Conflicting statistics handled correctly (both values preserved)
 * 4. Publication dates included to prevent temporal confusion
 * 5. Coverage annotations marking well-supported vs gap areas
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { researchToolDefinitions, executeResearchTool } from '../../../shared/tools/research-tools.js';
import { researchCoordinatorPrompt, synthesisSubagentPrompt } from '../../../shared/prompts/research-coordinator.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Structured Claim-Source Mapping ─────────────────────────────────────────
//
// EXAM KEY CONCEPT: Every factual claim carries its source. This mapping
// must survive through the synthesis step. The synthesis agent receives
// these mappings and is required to preserve them in its output.

/**
 * Create a claim-source mapping.
 * This is the fundamental unit of provenance tracking.
 */
function createClaim({ claim, evidence, sourceUrl, sourceName, publicationDate, confidence, page = null }) {
  return {
    claim,
    evidence,
    source: {
      url: sourceUrl,
      name: sourceName,
      publicationDate,
      page,
    },
    confidence,
    addedAt: new Date().toISOString(),
  };
}

// ─── Simulated Subagent Findings ─────────────────────────────────────────────
//
// These represent structured outputs from search and analysis subagents.
// Note: doc-001 and doc-002 report DIFFERENT growth rates for AI art tools.
// This is an intentional conflict that the synthesis must preserve.

const subagentFindings = {
  searchAgent: {
    topic: 'AI in creative industries',
    findings: [
      createClaim({
        claim: 'Machine learning models are revolutionizing digital art creation',
        evidence: 'Analysis of industry trends in visual arts',
        sourceUrl: 'https://example.com/ai-visual-arts',
        sourceName: 'TechReview',
        publicationDate: '2025-01-15',
        confidence: 'medium',
      }),
      createClaim({
        claim: 'AI-powered tools are changing how musicians compose and produce',
        evidence: 'Survey of music production workflows',
        sourceUrl: 'https://example.com/ai-music',
        sourceName: 'MusicTech Weekly',
        publicationDate: '2025-02-20',
        confidence: 'medium',
      }),
      createClaim({
        claim: 'Studios are adopting AI tools for everything from scriptwriting to VFX',
        evidence: 'Industry survey of film production companies',
        sourceUrl: 'https://example.com/ai-film',
        sourceName: 'Entertainment Tech',
        publicationDate: '2025-03-01',
        confidence: 'medium',
      }),
    ],
    gaps: [],
  },

  analysisAgent1: {
    topic: 'AI Creative Industries - Document Analysis (doc-001)',
    findings: [
      createClaim({
        claim: 'AI art tools market grew 47% year-over-year in 2024',
        evidence: 'Based on market analysis of 50 major AI art platforms',
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
      createClaim({
        claim: '60% of professional writers have used AI tools at least once',
        evidence: 'Annual survey of Writers Guild members',
        sourceUrl: 'https://example.com/docs/doc-001',
        sourceName: 'Research Institute',
        publicationDate: '2025-02-15',
        confidence: 'high',
        page: 45,
      }),
    ],
    gaps: [],
  },

  analysisAgent2: {
    topic: 'AI Creative Industries - Document Analysis (doc-002)',
    findings: [
      createClaim({
        // CONFLICT: Different growth rate from a different source
        claim: 'AI art tools market grew 52% year-over-year in 2024',
        evidence: 'Analysis of revenue data from 75 AI art platforms',
        sourceUrl: 'https://example.com/docs/doc-002',
        sourceName: 'Economic Research Group',
        publicationDate: '2025-01-30',
        confidence: 'high',
        page: 8,
      }),
      createClaim({
        claim: 'Studios using AI VFX tools saved an average of $2.3M per production',
        evidence: 'Case study of 12 major film productions in 2024',
        sourceUrl: 'https://example.com/docs/doc-002',
        sourceName: 'Economic Research Group',
        publicationDate: '2025-01-30',
        confidence: 'medium',
        page: 22,
      }),
    ],
    gaps: [],
  },
};

// ─── Conflict Detection ──────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: When two sources report different values for the same
// metric, the synthesis must present BOTH values with attribution. It must
// NOT average them, pick one, or synthesize a compromise value.

/**
 * Detect conflicting claims across multiple subagent findings.
 *
 * A conflict occurs when two claims address the same metric but report
 * different values from different sources.
 */
function detectConflicts(allFindings) {
  const conflicts = [];
  const allClaims = allFindings.flatMap(f => f.findings);

  // Compare each pair of claims
  for (let i = 0; i < allClaims.length; i++) {
    for (let j = i + 1; j < allClaims.length; j++) {
      const a = allClaims[i];
      const b = allClaims[j];

      // Skip claims from the same source
      if (a.source.name === b.source.name) continue;

      // Check if claims address the same topic with different numbers
      const conflict = checkForConflict(a, b);
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}

function checkForConflict(claimA, claimB) {
  // Extract numbers from claims
  const numbersA = claimA.claim.match(/(\d+\.?\d*%|\$[\d,.]+[MBK]?)/g) || [];
  const numbersB = claimB.claim.match(/(\d+\.?\d*%|\$[\d,.]+[MBK]?)/g) || [];

  if (numbersA.length === 0 || numbersB.length === 0) return null;

  // Check if claims are about the same topic (simple keyword overlap)
  const wordsA = new Set(claimA.claim.toLowerCase().split(/\s+/));
  const wordsB = new Set(claimB.claim.toLowerCase().split(/\s+/));
  const overlap = [...wordsA].filter(w => wordsB.has(w) && w.length > 3);

  // If significant keyword overlap but different numbers, flag as conflict
  if (overlap.length >= 3) {
    const numberA = numbersA[0];
    const numberB = numbersB[0];
    if (numberA !== numberB) {
      return {
        metric: overlap.join(' '),
        valueA: { value: numberA, source: claimA.source, claim: claimA.claim },
        valueB: { value: numberB, source: claimB.source, claim: claimB.claim },
        possibleExplanation: inferExplanation(claimA, claimB),
      };
    }
  }

  return null;
}

function inferExplanation(claimA, claimB) {
  const explanations = [];

  // Check for methodology differences
  if (claimA.evidence !== claimB.evidence) {
    explanations.push(`Different methodologies: "${claimA.evidence}" vs "${claimB.evidence}"`);
  }

  // Check for temporal differences
  if (claimA.source.publicationDate !== claimB.source.publicationDate) {
    explanations.push(
      `Different publication dates: ${claimA.source.publicationDate} vs ${claimB.source.publicationDate}`
    );
  }

  return explanations.length > 0
    ? explanations.join('. ')
    : 'No obvious explanation for the discrepancy';
}

// ─── Synthesis with Provenance Preservation ──────────────────────────────────

/**
 * Synthesize findings from multiple subagents while preserving provenance.
 *
 * EXAM KEY CONCEPT: This function demonstrates the correct synthesis pattern:
 * 1. Preserve all claim-source mappings
 * 2. Detect and flag conflicting claims
 * 3. Include temporal context for all statistics
 * 4. Annotate coverage levels
 */
function synthesizeWithProvenance(allFindings) {
  // Collect all unique findings
  const allClaims = allFindings.flatMap(f => f.findings);
  const allGaps = allFindings.flatMap(f => f.gaps || []);

  // Detect conflicts
  const conflicts = detectConflicts(allFindings);

  // Group claims by topic for coverage assessment
  const topicCoverage = assessCoverage(allFindings);

  // Build the synthesized report
  const report = {
    title: 'AI in Creative Industries: Research Synthesis',
    generatedAt: new Date().toISOString(),

    // All claims with preserved source attribution
    findings: allClaims.map(claim => ({
      claim: claim.claim,
      source: claim.source.name,
      sourceUrl: claim.source.url,
      publicationDate: claim.source.publicationDate,
      page: claim.source.page,
      confidence: claim.confidence,
      evidence: claim.evidence,
    })),

    // Conflicting claims flagged with both values
    conflicts: conflicts.map(c => ({
      metric: c.metric,
      values: [
        {
          value: c.valueA.value,
          source: c.valueA.source.name,
          claim: c.valueA.claim,
          publishedDate: c.valueA.source.publicationDate,
        },
        {
          value: c.valueB.value,
          source: c.valueB.source.name,
          claim: c.valueB.claim,
          publishedDate: c.valueB.source.publicationDate,
        },
      ],
      possibleExplanation: c.possibleExplanation,
      resolution: 'NONE — both values preserved with attribution',
    })),

    // Coverage annotations
    coverage: topicCoverage,

    // Sources section with full attribution
    sources: getUniqueSourceList(allClaims),
  };

  return report;
}

function assessCoverage(allFindings) {
  const topics = {};

  for (const agentFindings of allFindings) {
    const topic = agentFindings.topic;
    if (!topics[topic]) {
      topics[topic] = { sourceCount: 0, claimCount: 0, gaps: [] };
    }
    topics[topic].sourceCount++;
    topics[topic].claimCount += agentFindings.findings.length;
    topics[topic].gaps.push(...(agentFindings.gaps || []));
  }

  return Object.entries(topics).map(([topic, data]) => ({
    topic,
    level: data.sourceCount >= 2 ? 'well-supported' : 'single-source',
    sourceCount: data.sourceCount,
    claimCount: data.claimCount,
    gaps: data.gaps,
  }));
}

function getUniqueSourceList(claims) {
  const seen = new Set();
  const sources = [];

  for (const claim of claims) {
    const key = `${claim.source.name}|${claim.source.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({
        name: claim.source.name,
        url: claim.source.url,
        publicationDate: claim.source.publicationDate,
      });
    }
  }

  return sources;
}

// ─── Report Renderer ─────────────────────────────────────────────────────────

function renderReport(report) {
  const lines = [`# ${report.title}`, `Generated: ${report.generatedAt}`, ''];

  // Key Findings (with citations)
  lines.push('## Key Findings');
  for (const finding of report.findings) {
    lines.push(`- ${finding.claim}`);
    lines.push(`  Source: ${finding.source} (${finding.publicationDate}${finding.page ? `, p.${finding.page}` : ''}) [${finding.confidence}]`);
  }
  lines.push('');

  // Conflicting Data
  if (report.conflicts.length > 0) {
    lines.push('## Conflicting Data');
    for (const conflict of report.conflicts) {
      lines.push(`### ${conflict.metric}`);
      for (const val of conflict.values) {
        lines.push(`- **${val.value}**: ${val.source} (${val.publishedDate})`);
        lines.push(`  Claim: "${val.claim}"`);
      }
      lines.push(`- Possible explanation: ${conflict.possibleExplanation}`);
      lines.push(`- Resolution: ${conflict.resolution}`);
      lines.push('');
    }
  }

  // Coverage
  lines.push('## Coverage');
  for (const topic of report.coverage) {
    const icon = topic.level === 'well-supported' ? '+' : '~';
    lines.push(`${icon} **${topic.topic}**: ${topic.level} (${topic.sourceCount} sources, ${topic.claimCount} claims)`);
    if (topic.gaps.length > 0) {
      lines.push(`  Gaps: ${topic.gaps.join(', ')}`);
    }
  }
  lines.push('');

  // Sources
  lines.push('## Sources');
  for (const source of report.sources) {
    lines.push(`- ${source.name}: ${source.url} (published ${source.publicationDate})`);
  }

  return lines.join('\n');
}

// ─── Main: Demonstrate Provenance-Preserving Synthesis ───────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Task 5.6: Information Provenance Through Synthesis');
  console.log('='.repeat(60));

  // Phase 1: Collect subagent findings
  console.log('\n--- Phase 1: Subagent Findings ---');
  const allFindings = Object.values(subagentFindings);

  for (const agentResult of allFindings) {
    console.log(`\n  Agent: ${agentResult.topic}`);
    console.log(`  Findings: ${agentResult.findings.length}`);
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
    console.log(`    Explanation: ${c.possibleExplanation}`);
  }

  // Phase 3: Synthesize with provenance
  console.log('\n--- Phase 3: Synthesis with Provenance ---');
  const report = synthesizeWithProvenance(allFindings);
  const renderedReport = renderReport(report);

  console.log('\n' + '='.repeat(60));
  console.log('SYNTHESIZED REPORT');
  console.log('='.repeat(60));
  console.log(renderedReport);

  // Phase 4: Demonstrate the anti-pattern
  console.log('\n' + '='.repeat(60));
  console.log('ANTI-PATTERN: What Bad Synthesis Looks Like');
  console.log('='.repeat(60));
  console.log('\n  BAD: "AI art tools market grew approximately 50% in 2024."');
  console.log('  - Averages two different values (47% and 52%)');
  console.log('  - Loses both source attributions');
  console.log('  - Creates a fabricated number neither source reported');
  console.log('  - Reader cannot verify the claim');
  console.log('\n  GOOD: "AI art tools market grew 47% (Research Institute, Feb 2025,');
  console.log('  50-platform analysis) to 52% (Economic Research Group, Jan 2025,');
  console.log('  75-platform analysis). The difference may reflect different sample sizes."');
  console.log('  - Both values preserved');
  console.log('  - Both sources attributed');
  console.log('  - Methodology difference noted');
  console.log('  - Reader can assess both claims');
}

main().catch(console.error);
