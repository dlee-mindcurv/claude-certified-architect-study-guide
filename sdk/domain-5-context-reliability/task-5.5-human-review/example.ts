/**
 * Task 5.5 -- Human Review Routing with Field-Level Confidence (Agent SDK)
 *
 * Exam relevance:
 * - Aggregate accuracy masking segment-level issues
 * - Field-level confidence scores for routing decisions
 * - Stratified random sampling by document type and field
 * - Confidence calibration with labeled validation sets
 * - Accuracy analysis by segment before automating
 *
 * EXAM KEY CONCEPT:
 *   Each extracted field carries its own confidence score. A document-level
 *   confidence of 0.90 might hide a 0.50 on the "vendor" field. Routing
 *   decisions must be per-FIELD, not per-document. Always analyze accuracy
 *   by segment before deciding to automate.
 *
 * This example uses raw @anthropic-ai/sdk to show the confidence-routing
 * pattern explicitly, since the concept is about routing logic around
 * extraction results rather than agent orchestration.
 */

import Anthropic from '@anthropic-ai/sdk';
import { extractionToolDefinitions, executeExtractionTool } from '../../../shared/tools/extraction-tools.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Simulated Extraction Results with Field-Level Confidence ────────────────
//
// EXAM KEY CONCEPT: Each extracted field carries its own confidence score.
// A high document-level confidence can mask a low field-level confidence.

const simulatedExtractions = {
  'invoice-001': {
    documentId: 'invoice-001',
    documentType: 'invoice',
    fields: {
      invoice_number: { value: 'INV-2025-0042', confidence: 0.99, source: 'Header line 1' },
      date: { value: '2025-03-15', confidence: 0.97, source: 'Header line 2' },
      vendor: { value: null, confidence: 0.0, source: null, note: 'No vendor name found' },
      stated_total: { value: 515.70, confidence: 0.98, source: 'TOTAL line' },
      calculated_total: { value: 515.70, confidence: 0.99, source: 'Sum of line items' },
    },
  },
  'contract-001': {
    documentId: 'contract-001',
    documentType: 'contract',
    fields: {
      parties: { value: 'TechStart Inc. and CloudServ LLC', confidence: 0.95, source: 'Parties section' },
      effective_date: { value: '2025-01-01', confidence: 0.97, source: 'Effective Date line' },
      term: { value: '24 months', confidence: 0.72, source: 'Term line -- ambiguous with auto-renewal' },
      auto_renewal: { value: true, confidence: 0.65, source: 'Auto-renewal paragraph -- complex conditions' },
      governing_law: { value: 'Delaware', confidence: 0.98, source: 'Governing Law line' },
    },
  },
};

// ─── Routing Logic ────────────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Routing decisions are based on calibrated thresholds,
// not arbitrary cutoffs. Each reason for routing is explicit and logged.

const ROUTING_THRESHOLDS = {
  default: 0.80,
  financial: 0.95,
  required_field: 0.90,
};

function routeExtraction(extraction) {
  const decision = {
    documentId: extraction.documentId,
    documentType: extraction.documentType,
    route: 'auto_accept',
    reasons: [],
    fieldsForReview: [],
    fieldsAccepted: [],
  };

  const financialFields = ['total', 'stated_total', 'calculated_total', 'monthly_fee'];
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
      decision.reasons.push(`${fieldName}: confidence ${fieldData.confidence} below threshold ${threshold}`);
      decision.fieldsForReview.push({ field: fieldName, value: fieldData.value, confidence: fieldData.confidence, reason: 'low_confidence' });
      continue;
    }

    // Check: Missing required field
    if (requiredFields.includes(fieldName) && fieldData.value === null) {
      decision.route = 'human_review';
      decision.reasons.push(`${fieldName}: required field is missing`);
      decision.fieldsForReview.push({ field: fieldName, value: null, confidence: fieldData.confidence, reason: 'missing_required' });
      continue;
    }

    // Check: Ambiguous source
    if (fieldData.source && fieldData.source.includes('ambiguous')) {
      decision.route = 'human_review';
      decision.reasons.push(`${fieldName}: ambiguous source`);
      decision.fieldsForReview.push({ field: fieldName, value: fieldData.value, confidence: fieldData.confidence, reason: 'ambiguous_source' });
      continue;
    }

    decision.fieldsAccepted.push({ field: fieldName, value: fieldData.value, confidence: fieldData.confidence });
  }

  // Cross-field consistency check
  if (extraction.fields.stated_total && extraction.fields.calculated_total) {
    const stated = extraction.fields.stated_total.value;
    const calculated = extraction.fields.calculated_total.value;
    if (stated !== null && calculated !== null && stated !== calculated) {
      decision.route = 'human_review';
      decision.reasons.push(`Total mismatch: stated $${stated} vs calculated $${calculated}`);
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
// combination gets enough samples. Pure random sampling over-represents
// high-volume types.

function generateSamplingPlan(extractions, samplesPerStratum = 50) {
  const strata = new Map();

  for (const extraction of extractions) {
    for (const [fieldName, fieldData] of Object.entries(extraction.fields)) {
      const key = `${extraction.documentType}:${fieldName}`;
      if (!strata.has(key)) {
        strata.set(key, { documentType: extraction.documentType, field: fieldName, totalCount: 0, documents: [] });
      }
      const stratum = strata.get(key);
      stratum.totalCount++;
      stratum.documents.push({ documentId: extraction.documentId, value: fieldData.value, confidence: fieldData.confidence });
    }
  }

  for (const stratum of strata.values()) {
    stratum.sampleSize = Math.min(samplesPerStratum, stratum.totalCount);
  }

  return { strata: Array.from(strata.values()), totalStrata: strata.size };
}

// ─── Segment Accuracy Analysis ──────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Before automating any segment, measure its specific error
// rate. Only automate segments that meet the acceptable threshold.

function analyzeSegmentAccuracy(samplingPlan) {
  const simulatedErrorRates = {
    'invoice:invoice_number': 0.01, 'invoice:date': 0.03, 'invoice:vendor': 0.45,
    'invoice:stated_total': 0.02, 'invoice:calculated_total': 0.01,
    'contract:parties': 0.04, 'contract:effective_date': 0.03,
    'contract:term': 0.16, 'contract:auto_renewal': 0.22, 'contract:governing_law': 0.02,
  };

  const AUTOMATION_THRESHOLD = 0.05;

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

// ─── Main ─────────────────────────────────────────────────────────────────────

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
      decision.reasons.forEach(r => console.log(`    - ${r}`));
    }
    console.log(`  Fields accepted: ${decision.fieldsAccepted.length}, for review: ${decision.fieldsForReview.length}`);
  }

  const autoAccepted = allDecisions.filter(d => d.route === 'auto_accept').length;
  const humanReview = allDecisions.filter(d => d.route === 'human_review').length;
  console.log(`\n  Summary: ${autoAccepted} auto-accepted, ${humanReview} routed to human review`);

  // Phase 2: Stratified sampling
  console.log('\n--- Phase 2: Stratified Sampling Plan ---');
  const samplingPlan = generateSamplingPlan(Object.values(simulatedExtractions));
  console.log(`  Total strata: ${samplingPlan.totalStrata}`);

  // Phase 3: Segment accuracy
  console.log('\n--- Phase 3: Segment-Level Accuracy ---');
  const segmentResults = analyzeSegmentAccuracy(samplingPlan);

  const automatable = segmentResults.filter(s => s.meetsThreshold);
  const needsReview = segmentResults.filter(s => !s.meetsThreshold);

  console.log(`\n  Automatable (<=5% error): ${automatable.length}`);
  automatable.forEach(s => console.log(`    + ${s.documentType}:${s.field} -- ${(s.errorRate * 100).toFixed(0)}% error`));

  console.log(`\n  Needs review (>5% error): ${needsReview.length}`);
  needsReview.forEach(s => console.log(`    ! ${s.documentType}:${s.field} -- ${(s.errorRate * 100).toFixed(0)}% error`));

  console.log('\n  TAKEAWAY: Aggregate accuracy hides segment-level problems.');
  console.log('  Always analyze by segment before deciding to automate.');
}

main().catch(console.error);
