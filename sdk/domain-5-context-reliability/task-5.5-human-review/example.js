/**
 * Task 5.5 — Human Review Routing with Field-Level Confidence
 *
 * Exam relevance:
 * - Aggregate accuracy masking segment-level issues
 * - Field-level confidence scores for routing decisions
 * - Stratified random sampling by document type and field
 * - Confidence calibration with labeled validation sets
 * - Accuracy analysis by segment before automating
 *
 * This example demonstrates:
 * 1. Extraction pipeline that outputs field-level confidence scores
 * 2. Routing logic: low confidence or ambiguous source -> human review queue
 * 3. Stratified sampling: sample by document type and field for error rates
 * 4. Accuracy analysis by segment before deciding to automate
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { extractionToolDefinitions, executeExtractionTool, getDocumentIds } from '../../../shared/tools/extraction-tools.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Field-Level Confidence Extraction ───────────────────────────────────────
//
// EXAM KEY CONCEPT: Each extracted field carries its own confidence score.
// A document-level confidence is too coarse -- a 0.90 document confidence
// might hide a 0.50 confidence on the "vendor" field.

/**
 * Simulated extraction results with field-level confidence.
 * In production, these come from the Claude API via structured output.
 */
const simulatedExtractions = {
  'invoice-001': {
    documentId: 'invoice-001',
    documentType: 'invoice',
    fields: {
      invoice_number: { value: 'INV-2025-0042', confidence: 0.99, source: 'Header line 1' },
      date: { value: '2025-03-15', confidence: 0.97, source: 'Header line 2' },
      due_date: { value: '2025-04-14', confidence: 0.95, source: 'Header line 3' },
      vendor: { value: null, confidence: 0.0, source: null, note: 'No vendor name found' },
      bill_to: { value: 'Acme Corp', confidence: 0.92, source: 'Bill To section' },
      stated_total: { value: 515.70, confidence: 0.98, source: 'TOTAL line' },
      calculated_total: { value: 515.70, confidence: 0.99, source: 'Sum of line items' },
      conflict_detected: { value: false, confidence: 1.0, source: 'Cross-validation' },
    },
  },
  'research-paper-001': {
    documentId: 'research-paper-001',
    documentType: 'research_paper',
    fields: {
      title: { value: 'Effects of Urban Green Spaces on Mental Health Outcomes', confidence: 0.99, source: 'Title line' },
      authors: { value: 'Dr. Sarah Chen, Dr. Michael Torres', confidence: 0.97, source: 'Author line' },
      journal: { value: 'Journal of Environmental Psychology', confidence: 0.95, source: 'Published line' },
      doi: { value: '10.1016/j.jenvp.2025.02.003', confidence: 0.99, source: 'DOI line' },
      sample_size: { value: 15000, confidence: 0.85, source: 'Body text — "approximately 15,000"' },
      key_finding: { value: '23% lower anxiety scores', confidence: 0.88, source: 'Abstract' },
    },
  },
  'contract-001': {
    documentId: 'contract-001',
    documentType: 'contract',
    fields: {
      parties: { value: 'TechStart Inc. and CloudServ LLC', confidence: 0.95, source: 'Parties section' },
      effective_date: { value: '2025-01-01', confidence: 0.97, source: 'Effective Date line' },
      term: { value: '24 months', confidence: 0.72, source: 'Term line — ambiguous with auto-renewal' },
      monthly_fee: { value: 4500, confidence: 0.93, source: 'Monthly Fee line' },
      sla: { value: '99.9% uptime', confidence: 0.90, source: 'SLA line' },
      auto_renewal: { value: true, confidence: 0.65, source: 'Auto-renewal paragraph — complex conditions' },
      governing_law: { value: 'Delaware', confidence: 0.98, source: 'Governing Law line' },
    },
  },
  'receipt-missing-fields': {
    documentId: 'receipt-missing-fields',
    documentType: 'receipt',
    fields: {
      vendor: { value: 'Quick Mart', confidence: 0.75, source: 'Header — minimal format' },
      date: { value: null, confidence: 0.0, source: null, note: 'No date found' },
      total: { value: 23.47, confidence: 0.90, source: 'Total line' },
      items: { value: null, confidence: 0.10, source: '"Some items purchased" — no detail' },
      payment_method: { value: 'Cash', confidence: 0.85, source: 'Paid line' },
    },
  },
};

// ─── Routing Logic ────────────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Routing decisions are based on calibrated thresholds,
// not arbitrary cutoffs. Each reason for routing is explicit and logged.

const ROUTING_THRESHOLDS = {
  default: 0.80,          // Fields below this confidence go to human review
  financial: 0.95,        // Financial fields need higher confidence
  required_field: 0.90,   // Required fields need higher confidence
};

/**
 * Determine whether an extraction should be auto-accepted or routed to
 * human review.
 *
 * @param {object} extraction - The field-level extraction result
 * @returns {object} Routing decision with reasons
 */
function routeExtraction(extraction) {
  const decision = {
    documentId: extraction.documentId,
    documentType: extraction.documentType,
    route: 'auto_accept', // default; may be changed to 'human_review'
    reasons: [],
    fieldsForReview: [],
    fieldsAccepted: [],
  };

  const financialFields = ['total', 'stated_total', 'calculated_total', 'monthly_fee', 'amount'];
  const requiredFields = getRequiredFields(extraction.documentType);

  for (const [fieldName, fieldData] of Object.entries(extraction.fields)) {
    const threshold = financialFields.includes(fieldName)
      ? ROUTING_THRESHOLDS.financial
      : requiredFields.includes(fieldName)
        ? ROUTING_THRESHOLDS.required_field
        : ROUTING_THRESHOLDS.default;

    // Check: Low confidence
    if (fieldData.confidence < threshold) {
      decision.route = 'human_review';
      decision.reasons.push(
        `${fieldName}: confidence ${fieldData.confidence} below threshold ${threshold}`
      );
      decision.fieldsForReview.push({
        field: fieldName,
        value: fieldData.value,
        confidence: fieldData.confidence,
        reason: 'low_confidence',
        threshold,
      });
      continue;
    }

    // Check: Missing required field
    if (requiredFields.includes(fieldName) && fieldData.value === null) {
      decision.route = 'human_review';
      decision.reasons.push(`${fieldName}: required field is missing`);
      decision.fieldsForReview.push({
        field: fieldName,
        value: null,
        confidence: fieldData.confidence,
        reason: 'missing_required',
      });
      continue;
    }

    // Check: Ambiguous source
    if (fieldData.source && fieldData.source.includes('ambiguous')) {
      decision.route = 'human_review';
      decision.reasons.push(`${fieldName}: ambiguous source — "${fieldData.source}"`);
      decision.fieldsForReview.push({
        field: fieldName,
        value: fieldData.value,
        confidence: fieldData.confidence,
        reason: 'ambiguous_source',
      });
      continue;
    }

    // Field passes all checks
    decision.fieldsAccepted.push({
      field: fieldName,
      value: fieldData.value,
      confidence: fieldData.confidence,
    });
  }

  // Check: Cross-field consistency
  if (extraction.fields.stated_total && extraction.fields.calculated_total) {
    const stated = extraction.fields.stated_total.value;
    const calculated = extraction.fields.calculated_total.value;
    if (stated !== null && calculated !== null && stated !== calculated) {
      decision.route = 'human_review';
      decision.reasons.push(
        `Total mismatch: stated $${stated} vs calculated $${calculated}`
      );
    }
  }

  return decision;
}

function getRequiredFields(documentType) {
  const required = {
    invoice: ['invoice_number', 'stated_total', 'date'],
    contract: ['parties', 'effective_date', 'term'],
    research_paper: ['title', 'authors'],
    receipt: ['total'],
  };
  return required[documentType] || [];
}

// ─── Stratified Sampling ─────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Stratified sampling ensures each document_type + field
// combination gets enough samples to measure its error rate. Pure random
// sampling over-represents high-volume types.

/**
 * Generate a stratified sampling plan.
 *
 * @param {Array} extractions - All extraction results
 * @param {number} samplesPerStratum - How many to sample per segment
 * @returns {object} Sampling plan with strata definitions
 */
function generateSamplingPlan(extractions, samplesPerStratum = 50) {
  // Build strata: unique combinations of documentType + field
  const strata = new Map();

  for (const extraction of extractions) {
    for (const [fieldName, fieldData] of Object.entries(extraction.fields)) {
      const stratumKey = `${extraction.documentType}:${fieldName}`;

      if (!strata.has(stratumKey)) {
        strata.set(stratumKey, {
          documentType: extraction.documentType,
          field: fieldName,
          totalCount: 0,
          sampleSize: 0,
          documents: [],
        });
      }

      const stratum = strata.get(stratumKey);
      stratum.totalCount++;
      stratum.documents.push({
        documentId: extraction.documentId,
        value: fieldData.value,
        confidence: fieldData.confidence,
      });
    }
  }

  // Determine sample size per stratum
  for (const stratum of strata.values()) {
    stratum.sampleSize = Math.min(samplesPerStratum, stratum.totalCount);
  }

  return {
    strata: Array.from(strata.values()),
    totalStrata: strata.size,
    totalSamples: Array.from(strata.values()).reduce((sum, s) => sum + s.sampleSize, 0),
  };
}

// ─── Accuracy Analysis by Segment ────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Before automating any segment, measure its specific error
// rate. Only automate segments that meet the acceptable threshold.

/**
 * Simulated accuracy analysis results (in production, these come from
 * comparing extraction outputs against human-verified ground truth).
 */
function analyzeSegmentAccuracy(samplingPlan) {
  // Simulated error rates per stratum
  const simulatedErrorRates = {
    'invoice:invoice_number': 0.01,
    'invoice:date': 0.03,
    'invoice:due_date': 0.04,
    'invoice:vendor': 0.45,
    'invoice:bill_to': 0.05,
    'invoice:stated_total': 0.02,
    'invoice:calculated_total': 0.01,
    'invoice:conflict_detected': 0.02,
    'research_paper:title': 0.01,
    'research_paper:authors': 0.02,
    'research_paper:journal': 0.03,
    'research_paper:doi': 0.01,
    'research_paper:sample_size': 0.12,
    'research_paper:key_finding': 0.08,
    'contract:parties': 0.04,
    'contract:effective_date': 0.03,
    'contract:term': 0.16,
    'contract:monthly_fee': 0.05,
    'contract:sla': 0.07,
    'contract:auto_renewal': 0.22,
    'contract:governing_law': 0.02,
    'receipt:vendor': 0.40,
    'receipt:date': 0.50,
    'receipt:total': 0.08,
    'receipt:items': 0.55,
    'receipt:payment_method': 0.10,
  };

  const AUTOMATION_THRESHOLD = 0.05; // 5% maximum acceptable error rate

  return samplingPlan.strata.map(stratum => {
    const key = `${stratum.documentType}:${stratum.field}`;
    const errorRate = simulatedErrorRates[key] || 0.10;
    return {
      ...stratum,
      errorRate,
      meetsThreshold: errorRate <= AUTOMATION_THRESHOLD,
      recommendation: errorRate <= AUTOMATION_THRESHOLD
        ? 'AUTOMATE: Error rate within acceptable threshold'
        : `HUMAN REVIEW: Error rate ${(errorRate * 100).toFixed(0)}% exceeds ${(AUTOMATION_THRESHOLD * 100).toFixed(0)}% threshold`,
    };
  });
}

// ─── Main: Full Pipeline Demonstration ───────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Task 5.5: Human Review Routing with Confidence Scoring');
  console.log('='.repeat(60));

  // Phase 1: Route individual extractions
  console.log('\n--- Phase 1: Route Extractions ---');

  const allDecisions = [];
  for (const [docId, extraction] of Object.entries(simulatedExtractions)) {
    const decision = routeExtraction(extraction);
    allDecisions.push(decision);

    console.log(`\n  Document: ${docId} (${extraction.documentType})`);
    console.log(`  Route: ${decision.route}`);
    if (decision.reasons.length > 0) {
      console.log(`  Reasons:`);
      decision.reasons.forEach(r => console.log(`    - ${r}`));
    }
    console.log(`  Fields accepted: ${decision.fieldsAccepted.length}`);
    console.log(`  Fields for review: ${decision.fieldsForReview.length}`);
  }

  // Summary
  const autoAccepted = allDecisions.filter(d => d.route === 'auto_accept').length;
  const humanReview = allDecisions.filter(d => d.route === 'human_review').length;
  console.log(`\n  Summary: ${autoAccepted} auto-accepted, ${humanReview} routed to human review`);

  // Phase 2: Stratified sampling plan
  console.log('\n--- Phase 2: Stratified Sampling Plan ---');

  const extractions = Object.values(simulatedExtractions);
  const samplingPlan = generateSamplingPlan(extractions, 50);

  console.log(`  Total strata: ${samplingPlan.totalStrata}`);
  console.log(`  Total samples needed: ${samplingPlan.totalSamples}`);
  console.log('\n  Strata:');
  for (const stratum of samplingPlan.strata) {
    console.log(`    ${stratum.documentType}:${stratum.field} — ${stratum.totalCount} docs, sample ${stratum.sampleSize}`);
  }

  // Phase 3: Accuracy analysis by segment
  console.log('\n--- Phase 3: Segment-Level Accuracy Analysis ---');

  const segmentResults = analyzeSegmentAccuracy(samplingPlan);

  console.log('\n  Segments meeting automation threshold (<=5% error):');
  const automatable = segmentResults.filter(s => s.meetsThreshold);
  for (const seg of automatable) {
    console.log(`    + ${seg.documentType}:${seg.field} — ${(seg.errorRate * 100).toFixed(0)}% error`);
  }

  console.log('\n  Segments requiring human review (>5% error):');
  const needsReview = segmentResults.filter(s => !s.meetsThreshold);
  for (const seg of needsReview) {
    console.log(`    ! ${seg.documentType}:${seg.field} — ${(seg.errorRate * 100).toFixed(0)}% error`);
  }

  // Phase 4: Show why aggregate accuracy is misleading
  console.log('\n--- Phase 4: Aggregate vs. Segment Accuracy ---');

  const totalFields = segmentResults.length;
  const totalErrors = segmentResults.reduce((sum, s) => sum + s.errorRate, 0);
  const aggregateAccuracy = (1 - totalErrors / totalFields) * 100;

  console.log(`\n  Aggregate accuracy: ${aggregateAccuracy.toFixed(1)}%`);
  console.log(`  Segments above threshold: ${automatable.length}/${totalFields}`);
  console.log(`  Segments below threshold: ${needsReview.length}/${totalFields}`);
  console.log(`\n  Worst segment: ${needsReview[needsReview.length - 1]?.documentType}:${needsReview[needsReview.length - 1]?.field} at ${((needsReview[needsReview.length - 1]?.errorRate || 0) * 100).toFixed(0)}% error`);
  console.log('\n  TAKEAWAY: The aggregate accuracy hides segment-level problems.');
  console.log('  Always analyze by segment before deciding to automate.');
}

main().catch(console.error);
