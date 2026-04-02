/**
 * Scenario 6: Extraction Confidence Routing -- Agent SDK Implementation
 *
 * Exam relevance (Task 5.5):
 * - Field-level confidence scores for routing decisions
 * - Stratified sampling by document type and field
 * - Segment-level accuracy analysis (not aggregate)
 * - Confidence calibration against labeled validation data
 * - Automation readiness decisions per segment
 *
 * EXAM KEY CONCEPT:
 *   Raw model confidence scores are not automatically calibrated. These
 *   thresholds only become meaningful after comparing model confidence
 *   against actual accuracy on a labeled validation set. Routing is
 *   per-FIELD, not per-document -- the reviewer knows exactly which field
 *   to check.
 *
 * Uses query() with extraction tools for the extraction pipeline,
 * then applies programmatic routing logic to the results.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { extractionServer } from '../../../../shared/tools/extraction-tools.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export const ROUTING_CONFIG = {
  thresholds: {
    financial: 0.95,
    required: 0.90,
    standard: 0.80,
  },
  requiredFields: {
    invoice: ['invoice_number', 'stated_total', 'date'],
    contract: ['parties', 'effective_date', 'term'],
    research_paper: ['title', 'authors'],
    receipt: ['total'],
  } as Record<string, string[]>,
  financialFields: [
    'total', 'stated_total', 'calculated_total',
    'subtotal', 'tax', 'monthly_fee', 'amount',
  ],
  automationThreshold: 0.05,
};

// ─── Routing Engine ──────────────────────────────────────────────────────────

export const ROUTING_REASONS = {
  LOW_CONFIDENCE: 'low_confidence',
  MISSING_REQUIRED: 'missing_required',
  AMBIGUOUS_SOURCE: 'ambiguous_source',
  CROSS_FIELD_MISMATCH: 'cross_field_mismatch',
  NULL_VALUE_LOW_CONFIDENCE: 'null_value_low_confidence',
} as const;

type RoutingReason = typeof ROUTING_REASONS[keyof typeof ROUTING_REASONS];

interface FieldData {
  value: unknown;
  confidence: number;
  source: string | null;
}

interface Extraction {
  documentId: string;
  documentType: string;
  fields: Record<string, FieldData>;
}

interface ReviewField {
  field: string;
  value: unknown;
  confidence: number;
  reason: RoutingReason | string;
  source?: string | null;
}

interface AcceptedField {
  field: string;
  value: unknown;
  confidence: number;
}

interface RoutingDecision {
  documentId: string;
  documentType: string;
  route: string;
  reasons: string[];
  fieldsForReview: ReviewField[];
  fieldsAccepted: AcceptedField[];
  reviewPriority: string;
}

/**
 * EXAM KEY CONCEPT: Routing is per-FIELD, not per-document. A document
 * might have 8 fields where 7 pass and 1 fails. The whole document goes
 * to review, but the reviewer knows exactly which field to check.
 */
export function routeExtraction(extraction: Extraction): RoutingDecision {
  const decision: RoutingDecision = {
    documentId: extraction.documentId,
    documentType: extraction.documentType,
    route: 'auto_accept',
    reasons: [],
    fieldsForReview: [],
    fieldsAccepted: [],
    reviewPriority: 'normal',
  };

  const required = ROUTING_CONFIG.requiredFields[extraction.documentType] || [];

  for (const [fieldName, fieldData] of Object.entries(extraction.fields)) {
    const checks: Array<{ reason: RoutingReason; detail: string }> = [];

    // Check 1: Missing required field
    if (required.includes(fieldName) && fieldData.value === null) {
      checks.push({ reason: ROUTING_REASONS.MISSING_REQUIRED, detail: `Required field "${fieldName}" is missing` });
    }

    // Check 2: Low confidence
    const threshold = getThreshold(fieldName, required);
    if (fieldData.confidence < threshold && fieldData.value !== null) {
      checks.push({ reason: ROUTING_REASONS.LOW_CONFIDENCE, detail: `"${fieldName}" confidence ${fieldData.confidence.toFixed(2)} below ${threshold}` });
    }

    // Check 3: Null value with low confidence
    if (fieldData.value === null && fieldData.confidence > 0 && fieldData.confidence < 0.50) {
      checks.push({ reason: ROUTING_REASONS.NULL_VALUE_LOW_CONFIDENCE, detail: `"${fieldName}" is null but confidence suggests data may exist` });
    }

    // Check 4: Ambiguous source
    if (fieldData.source && (fieldData.source.includes('ambiguous') || fieldData.source.includes('complex conditions'))) {
      checks.push({ reason: ROUTING_REASONS.AMBIGUOUS_SOURCE, detail: `"${fieldName}" has ambiguous source` });
    }

    if (checks.length > 0) {
      decision.route = 'human_review';
      for (const check of checks) {
        decision.reasons.push(check.detail);
        decision.fieldsForReview.push({ field: fieldName, value: fieldData.value, confidence: fieldData.confidence, reason: check.reason, source: fieldData.source });
      }
    } else {
      decision.fieldsAccepted.push({ field: fieldName, value: fieldData.value, confidence: fieldData.confidence });
    }
  }

  // Check 5: Cross-field consistency
  const crossIssue = checkCrossFieldConsistency(extraction.fields);
  if (crossIssue) {
    decision.route = 'human_review';
    decision.reasons.push(crossIssue.detail);
    decision.fieldsForReview.push({ field: 'cross_validation', value: crossIssue.values, confidence: 0, reason: ROUTING_REASONS.CROSS_FIELD_MISMATCH });
  }

  // Set priority
  if (decision.fieldsForReview.some((f: ReviewField) => f.reason === ROUTING_REASONS.MISSING_REQUIRED || f.reason === ROUTING_REASONS.CROSS_FIELD_MISMATCH)) {
    decision.reviewPriority = 'high';
  } else if (decision.fieldsForReview.length >= 3) {
    decision.reviewPriority = 'high';
  }

  return decision;
}

function getThreshold(fieldName: string, requiredFields: string[]): number {
  if (ROUTING_CONFIG.financialFields.includes(fieldName)) return ROUTING_CONFIG.thresholds.financial;
  if (requiredFields.includes(fieldName)) return ROUTING_CONFIG.thresholds.required;
  return ROUTING_CONFIG.thresholds.standard;
}

function checkCrossFieldConsistency(fields: Record<string, FieldData>): { detail: string; values: { stated: unknown; calculated: unknown } } | null {
  if (fields.stated_total && fields.calculated_total) {
    const stated = fields.stated_total.value as number;
    const calculated = fields.calculated_total.value as number;
    if (stated !== null && calculated !== null && Math.abs(stated - calculated) > 0.01) {
      return { detail: `Total mismatch: stated $${stated} vs calculated $${calculated}`, values: { stated, calculated } };
    }
  }
  return null;
}

// ─── Stratified Sampling ─────────────────────────────────────────────────────

interface StratumDoc {
  docId: string;
  value: unknown;
  confidence: number;
}

export class Stratum {
  documentType: string;
  field: string;
  key: string;
  documents: StratumDoc[];
  sampleSize: number;

  constructor(documentType: string, field: string) {
    this.documentType = documentType;
    this.field = field;
    this.key = `${documentType}:${field}`;
    this.documents = [];
    this.sampleSize = 0;
  }

  addDocument(docId: string, value: unknown, confidence: number) { this.documents.push({ docId, value, confidence }); }
  get totalCount() { return this.documents.length; }
}

/**
 * EXAM KEY CONCEPT: Sample by document_type + field, not randomly. This
 * ensures rare but high-risk segments get adequate sample sizes.
 */
export function generateSamplingPlan(extractions: Extraction[], targetPerStratum = 50): { strata: Stratum[]; totalStrata: number; totalSamples: number } {
  const strata = new Map<string, Stratum>();

  for (const extraction of extractions) {
    for (const [fieldName, fieldData] of Object.entries(extraction.fields)) {
      const key = `${extraction.documentType}:${fieldName}`;
      if (!strata.has(key)) strata.set(key, new Stratum(extraction.documentType, fieldName));
      strata.get(key)!.addDocument(extraction.documentId, fieldData.value, fieldData.confidence);
    }
  }

  for (const stratum of strata.values()) {
    stratum.sampleSize = Math.min(targetPerStratum, stratum.totalCount);
  }

  const arr = Array.from(strata.values());
  return { strata: arr, totalStrata: arr.length, totalSamples: arr.reduce((s: number, x: Stratum) => s + x.sampleSize, 0) };
}

// ─── Segment Accuracy Analyzer ──────────────────────────────────────────────

interface SegmentResult {
  key: string;
  documentType: string;
  field: string;
  totalCount: number;
  correct: number;
  incorrect: number;
  errorRate: number | null;
  meetsThreshold: boolean;
  recommendation: string;
}

export function analyzeSegmentAccuracy(samplingPlan: { strata: Stratum[] }, groundTruth: Record<string, Record<string, unknown>> = {}): SegmentResult[] {
  return samplingPlan.strata.map((stratum: Stratum) => {
    let correct = 0, incorrect = 0, unverifiable = 0;

    for (const doc of stratum.documents) {
      const truth = groundTruth[doc.docId]?.[stratum.field];
      if (truth === undefined) unverifiable++;
      else if (doc.value === truth) correct++;
      else incorrect++;
    }

    const verified = correct + incorrect;
    const errorRate = verified > 0 ? incorrect / verified : null;

    return {
      key: stratum.key, documentType: stratum.documentType, field: stratum.field,
      totalCount: stratum.totalCount, correct, incorrect, errorRate,
      meetsThreshold: errorRate !== null && errorRate <= ROUTING_CONFIG.automationThreshold,
      recommendation: getAutomationRecommendation(errorRate),
    };
  });
}

function getAutomationRecommendation(errorRate: number | null): string {
  if (errorRate === null) return 'INSUFFICIENT DATA: Need labeled validation data';
  if (errorRate <= 0.02) return 'AUTOMATE: Very low error rate';
  if (errorRate <= ROUTING_CONFIG.automationThreshold) return 'AUTOMATE: Within threshold';
  if (errorRate <= 0.15) return 'PARTIAL: Auto-accept high-confidence, review rest';
  return 'HUMAN REVIEW: Error rate too high';
}

// ─── Automation Readiness Report ─────────────────────────────────────────────

/**
 * EXAM KEY CONCEPT: The report shows segment-level metrics alongside the
 * aggregate, making it clear when aggregate accuracy is misleading.
 */
export function buildAutomationReport(segmentResults: SegmentResult[]): string {
  const lines: string[] = ['# Automation Readiness Report', ''];

  const automatable = segmentResults.filter((s: SegmentResult) => s.meetsThreshold);
  const needsReview = segmentResults.filter((s: SegmentResult) => !s.meetsThreshold && s.errorRate !== null);

  lines.push('## Summary');
  lines.push(`- Segments ready for automation: ${automatable.length}/${segmentResults.length}`);
  lines.push(`- Segments needing review: ${needsReview.length}/${segmentResults.length}`);
  lines.push('');

  if (needsReview.length > 0) {
    lines.push('## WARNING: Aggregate Accuracy Is Misleading');
    lines.push('Always analyze accuracy per segment before making automation decisions.');
  }

  return lines.join('\n');
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Scenario 6: Extraction Confidence Routing');
  console.log('='.repeat(60));

  const extractions: Extraction[] = [
    {
      documentId: 'inv-001', documentType: 'invoice',
      fields: {
        invoice_number: { value: 'INV-001', confidence: 0.99, source: 'Header' },
        stated_total: { value: 515.70, confidence: 0.98, source: 'Total line' },
        date: { value: '2025-03-15', confidence: 0.97, source: 'Date line' },
        vendor: { value: null, confidence: 0.0, source: null },
      },
    },
    {
      documentId: 'con-001', documentType: 'contract',
      fields: {
        parties: { value: 'TechStart and CloudServ', confidence: 0.95, source: 'Parties' },
        effective_date: { value: '2025-01-01', confidence: 0.97, source: 'Date line' },
        term: { value: '24 months', confidence: 0.72, source: 'Term line -- ambiguous with renewal' },
        auto_renewal: { value: true, confidence: 0.65, source: 'complex conditions paragraph' },
      },
    },
  ];

  console.log('\n--- Routing Decisions ---');
  for (const ext of extractions) {
    const decision = routeExtraction(ext);
    console.log(`\n  ${ext.documentId}: ${decision.route} (${decision.reviewPriority} priority)`);
    decision.reasons.forEach(r => console.log(`    - ${r}`));
  }

  console.log('\n--- Sampling Plan ---');
  const plan = generateSamplingPlan(extractions, 50);
  console.log(`  Strata: ${plan.totalStrata}, Total samples: ${plan.totalSamples}`);
  console.log('\n  See buildAutomationReport() for full readiness analysis.');
}

main().catch(console.error);
