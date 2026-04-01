/**
 * Scenario 6: Extraction Confidence Routing — Complete Implementation
 *
 * Exam relevance (Task 5.5):
 * - Field-level confidence scores for routing decisions
 * - Stratified sampling by document type and field
 * - Segment-level accuracy analysis (not aggregate)
 * - Confidence calibration against labeled validation data
 * - Automation readiness decisions per segment
 *
 * This module provides:
 * 1. Confidence-based routing logic for extraction results
 * 2. Stratified sampling plan generator
 * 3. Segment accuracy analyzer
 * 4. Automation readiness report builder
 */

import { extractionToolDefinitions, executeExtractionTool, getDocumentIds } from '../../../../shared/tools/extraction-tools.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Routing thresholds — these should be calibrated against labeled data.
 *
 * EXAM KEY CONCEPT: Raw model confidence scores are not automatically
 * calibrated. These thresholds only become meaningful after comparing
 * model confidence against actual accuracy on a labeled validation set.
 */
export const ROUTING_CONFIG = {
  thresholds: {
    financial: 0.95,    // Financial fields need highest confidence
    required: 0.90,     // Required fields need elevated confidence
    standard: 0.80,     // Standard fields
  },
  requiredFields: {
    invoice: ['invoice_number', 'stated_total', 'date'],
    contract: ['parties', 'effective_date', 'term'],
    research_paper: ['title', 'authors'],
    receipt: ['total'],
  },
  financialFields: [
    'total', 'stated_total', 'calculated_total',
    'subtotal', 'tax', 'monthly_fee', 'amount',
    'unit_price', 'line_total',
  ],
  automationThreshold: 0.05,  // 5% max acceptable error rate per segment
};

// ─── Routing Engine ──────────────────────────────────────────────────────────

export const ROUTING_REASONS = {
  LOW_CONFIDENCE: 'low_confidence',
  MISSING_REQUIRED: 'missing_required',
  AMBIGUOUS_SOURCE: 'ambiguous_source',
  CROSS_FIELD_MISMATCH: 'cross_field_mismatch',
  NULL_VALUE_LOW_CONFIDENCE: 'null_value_low_confidence',
};

/**
 * Route an extraction to auto-accept or human review based on field-level
 * confidence analysis.
 *
 * EXAM KEY CONCEPT: Routing is per-FIELD, not per-document. A document
 * might have 8 fields where 7 pass and 1 fails. The whole document goes
 * to review, but the reviewer knows exactly which field to check.
 *
 * @param {object} extraction - Extraction result with field-level confidence
 * @returns {object} Routing decision
 */
export function routeExtraction(extraction) {
  const decision = {
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
    const checks = [];

    // Check 1: Missing required field
    if (required.includes(fieldName) && fieldData.value === null) {
      checks.push({
        reason: ROUTING_REASONS.MISSING_REQUIRED,
        detail: `Required field "${fieldName}" is missing`,
      });
    }

    // Check 2: Low confidence (threshold depends on field type)
    const threshold = getThreshold(fieldName, required);
    if (fieldData.confidence < threshold && fieldData.value !== null) {
      checks.push({
        reason: ROUTING_REASONS.LOW_CONFIDENCE,
        detail: `"${fieldName}" confidence ${fieldData.confidence.toFixed(2)} below threshold ${threshold}`,
      });
    }

    // Check 3: Null value with low confidence (field might exist but extraction failed)
    if (fieldData.value === null && fieldData.confidence > 0 && fieldData.confidence < 0.50) {
      checks.push({
        reason: ROUTING_REASONS.NULL_VALUE_LOW_CONFIDENCE,
        detail: `"${fieldName}" is null but confidence ${fieldData.confidence.toFixed(2)} suggests data may exist`,
      });
    }

    // Check 4: Ambiguous source
    if (fieldData.source && (
      fieldData.source.includes('ambiguous') ||
      fieldData.source.includes('multiple possible') ||
      fieldData.source.includes('complex conditions')
    )) {
      checks.push({
        reason: ROUTING_REASONS.AMBIGUOUS_SOURCE,
        detail: `"${fieldName}" has ambiguous source: "${fieldData.source}"`,
      });
    }

    if (checks.length > 0) {
      decision.route = 'human_review';
      for (const check of checks) {
        decision.reasons.push(check.detail);
        decision.fieldsForReview.push({
          field: fieldName,
          value: fieldData.value,
          confidence: fieldData.confidence,
          reason: check.reason,
          source: fieldData.source,
        });
      }
    } else {
      decision.fieldsAccepted.push({
        field: fieldName,
        value: fieldData.value,
        confidence: fieldData.confidence,
      });
    }
  }

  // Check 5: Cross-field consistency (totals)
  const crossFieldIssue = checkCrossFieldConsistency(extraction.fields);
  if (crossFieldIssue) {
    decision.route = 'human_review';
    decision.reasons.push(crossFieldIssue.detail);
    decision.fieldsForReview.push({
      field: 'cross_validation',
      value: crossFieldIssue.values,
      confidence: 0,
      reason: ROUTING_REASONS.CROSS_FIELD_MISMATCH,
    });
  }

  // Set priority based on severity
  if (decision.fieldsForReview.some(f => f.reason === ROUTING_REASONS.MISSING_REQUIRED)) {
    decision.reviewPriority = 'high';
  } else if (decision.fieldsForReview.some(f => f.reason === ROUTING_REASONS.CROSS_FIELD_MISMATCH)) {
    decision.reviewPriority = 'high';
  } else if (decision.fieldsForReview.length >= 3) {
    decision.reviewPriority = 'high';
  }

  return decision;
}

function getThreshold(fieldName, requiredFields) {
  if (ROUTING_CONFIG.financialFields.includes(fieldName)) {
    return ROUTING_CONFIG.thresholds.financial;
  }
  if (requiredFields.includes(fieldName)) {
    return ROUTING_CONFIG.thresholds.required;
  }
  return ROUTING_CONFIG.thresholds.standard;
}

function checkCrossFieldConsistency(fields) {
  if (fields.stated_total && fields.calculated_total) {
    const stated = fields.stated_total.value;
    const calculated = fields.calculated_total.value;
    if (stated !== null && calculated !== null && Math.abs(stated - calculated) > 0.01) {
      return {
        detail: `Total mismatch: stated $${stated} vs calculated $${calculated}`,
        values: { stated, calculated, difference: Math.abs(stated - calculated) },
      };
    }
  }
  return null;
}

// ─── Stratified Sampling ─────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Sample by document_type + field, not randomly. This
// ensures rare but high-risk segments get adequate sample sizes.

/**
 * A stratum is one segment to sample: a unique documentType + field combination.
 */
export class Stratum {
  constructor(documentType, field) {
    this.documentType = documentType;
    this.field = field;
    this.key = `${documentType}:${field}`;
    this.documents = [];
    this.sampleSize = 0;
  }

  addDocument(docId, value, confidence) {
    this.documents.push({ docId, value, confidence });
  }

  get totalCount() {
    return this.documents.length;
  }
}

/**
 * Generate a stratified sampling plan from extraction results.
 *
 * @param {Array} extractions - Extraction results with field-level data
 * @param {number} targetPerStratum - Target sample size per stratum
 * @returns {object} Sampling plan
 */
export function generateSamplingPlan(extractions, targetPerStratum = 50) {
  const strata = new Map();

  for (const extraction of extractions) {
    for (const [fieldName, fieldData] of Object.entries(extraction.fields)) {
      const key = `${extraction.documentType}:${fieldName}`;

      if (!strata.has(key)) {
        strata.set(key, new Stratum(extraction.documentType, fieldName));
      }

      strata.get(key).addDocument(
        extraction.documentId,
        fieldData.value,
        fieldData.confidence
      );
    }
  }

  // Calculate sample sizes
  for (const stratum of strata.values()) {
    stratum.sampleSize = Math.min(targetPerStratum, stratum.totalCount);
  }

  const strataArray = Array.from(strata.values());

  return {
    strata: strataArray,
    totalStrata: strataArray.length,
    totalSamples: strataArray.reduce((sum, s) => sum + s.sampleSize, 0),
    totalDocuments: extractions.length,
  };
}

// ─── Segment Accuracy Analyzer ──────────────────────────────────────────────

/**
 * Analyze accuracy per segment using labeled validation data.
 *
 * @param {object} samplingPlan - From generateSamplingPlan
 * @param {object} groundTruth - Map of documentId -> field -> correct value
 * @returns {Array} Segment analysis results
 */
export function analyzeSegmentAccuracy(samplingPlan, groundTruth = {}) {
  return samplingPlan.strata.map(stratum => {
    // Compare extraction values against ground truth
    let correct = 0;
    let incorrect = 0;
    let unverifiable = 0;

    for (const doc of stratum.documents) {
      const truth = groundTruth[doc.docId]?.[stratum.field];
      if (truth === undefined) {
        unverifiable++;
      } else if (doc.value === truth) {
        correct++;
      } else {
        incorrect++;
      }
    }

    const verified = correct + incorrect;
    const errorRate = verified > 0 ? incorrect / verified : null;
    const marginOfError = verified > 0
      ? 1.96 * Math.sqrt((errorRate * (1 - errorRate)) / verified)
      : null;

    return {
      key: stratum.key,
      documentType: stratum.documentType,
      field: stratum.field,
      totalCount: stratum.totalCount,
      sampleSize: stratum.sampleSize,
      correct,
      incorrect,
      unverifiable,
      errorRate,
      marginOfError,
      meetsThreshold: errorRate !== null && errorRate <= ROUTING_CONFIG.automationThreshold,
      recommendation: getAutomationRecommendation(errorRate, stratum.totalCount),
    };
  });
}

function getAutomationRecommendation(errorRate, volume) {
  if (errorRate === null) return 'INSUFFICIENT DATA: Need labeled validation data';
  if (errorRate <= 0.02) return 'AUTOMATE: Very low error rate';
  if (errorRate <= ROUTING_CONFIG.automationThreshold) return 'AUTOMATE: Within acceptable threshold';
  if (errorRate <= 0.15) return 'PARTIAL AUTOMATION: Auto-accept high-confidence, review rest';
  return 'HUMAN REVIEW: Error rate too high for automation';
}

// ─── Automation Readiness Report ─────────────────────────────────────────────

/**
 * Build a formatted automation readiness report.
 *
 * EXAM KEY CONCEPT: The report shows segment-level metrics alongside the
 * aggregate, making it clear when aggregate accuracy is misleading.
 */
export function buildAutomationReport(segmentResults) {
  const lines = ['# Automation Readiness Report', ''];

  // Aggregate stats
  const totalSegments = segmentResults.length;
  const automatable = segmentResults.filter(s => s.meetsThreshold);
  const needsReview = segmentResults.filter(s => !s.meetsThreshold && s.errorRate !== null);
  const noData = segmentResults.filter(s => s.errorRate === null);

  const avgErrorRate = segmentResults
    .filter(s => s.errorRate !== null)
    .reduce((sum, s) => sum + s.errorRate, 0) / (totalSegments - noData.length || 1);

  lines.push('## Summary');
  lines.push(`- Total segments: ${totalSegments}`);
  lines.push(`- Aggregate accuracy: ${((1 - avgErrorRate) * 100).toFixed(1)}%`);
  lines.push(`- Segments ready for automation: ${automatable.length}/${totalSegments}`);
  lines.push(`- Segments needing review: ${needsReview.length}/${totalSegments}`);
  lines.push(`- Segments with insufficient data: ${noData.length}/${totalSegments}`);
  lines.push('');

  // Ready for automation
  if (automatable.length > 0) {
    lines.push('## Ready for Automation');
    lines.push('| Segment | Error Rate | Volume | Recommendation |');
    lines.push('|---------|-----------|--------|----------------|');
    for (const seg of automatable) {
      lines.push(`| ${seg.key} | ${(seg.errorRate * 100).toFixed(1)}% | ${seg.totalCount} | ${seg.recommendation} |`);
    }
    lines.push('');
  }

  // Needs human review
  if (needsReview.length > 0) {
    lines.push('## Requires Human Review');
    lines.push('| Segment | Error Rate | Volume | Recommendation |');
    lines.push('|---------|-----------|--------|----------------|');
    for (const seg of needsReview) {
      lines.push(`| ${seg.key} | ${(seg.errorRate * 100).toFixed(1)}% | ${seg.totalCount} | ${seg.recommendation} |`);
    }
    lines.push('');
  }

  // Warning about aggregate accuracy
  if (needsReview.length > 0) {
    lines.push('## WARNING: Aggregate Accuracy Is Misleading');
    lines.push('');
    lines.push(`The aggregate accuracy of ${((1 - avgErrorRate) * 100).toFixed(1)}% masks the fact that`);
    lines.push(`${needsReview.length} out of ${totalSegments} segments have unacceptable error rates.`);
    lines.push('');
    if (needsReview.length > 0) {
      const worst = needsReview.sort((a, b) => b.errorRate - a.errorRate)[0];
      lines.push(`Worst segment: ${worst.key} with ${(worst.errorRate * 100).toFixed(0)}% error rate.`);
    }
    lines.push('');
    lines.push('Always analyze accuracy per segment before making automation decisions.');
  }

  return lines.join('\n');
}

// ─── Confidence Calibration ─────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: Calibration compares model confidence to actual accuracy.
// Without calibration, a "0.85 confidence" is just a number -- it might mean
// 70% actual accuracy or 95% actual accuracy depending on the model.

/**
 * Build a confidence calibration table.
 *
 * @param {Array} extractions - Extraction results
 * @param {object} groundTruth - Known correct values
 * @returns {Array} Calibration buckets
 */
export function buildCalibrationTable(extractions, groundTruth = {}) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${(i * 0.1).toFixed(1)}-${((i + 1) * 0.1).toFixed(1)}`,
    lower: i * 0.1,
    upper: (i + 1) * 0.1,
    count: 0,
    correct: 0,
    actualAccuracy: null,
    calibrated: null, // 'yes' | 'over-confident' | 'under-confident'
  }));

  for (const extraction of extractions) {
    for (const [field, data] of Object.entries(extraction.fields)) {
      const bucketIdx = Math.min(Math.floor(data.confidence * 10), 9);
      buckets[bucketIdx].count++;

      const truth = groundTruth[extraction.documentId]?.[field];
      if (truth !== undefined) {
        if (data.value === truth) buckets[bucketIdx].correct++;
      }
    }
  }

  // Calculate actual accuracy and calibration status
  for (const bucket of buckets) {
    if (bucket.count > 0 && bucket.correct >= 0) {
      bucket.actualAccuracy = bucket.correct / bucket.count;
      const expectedAccuracy = (bucket.lower + bucket.upper) / 2;
      const diff = bucket.actualAccuracy - expectedAccuracy;
      if (Math.abs(diff) <= 0.05) {
        bucket.calibrated = 'yes';
      } else if (diff < -0.05) {
        bucket.calibrated = 'over-confident';
      } else {
        bucket.calibrated = 'under-confident';
      }
    }
  }

  return buckets.filter(b => b.count > 0);
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Scenario 6: Extraction Confidence Routing');
  console.log('='.repeat(60));

  // Simulated extractions
  const extractions = [
    {
      documentId: 'inv-001',
      documentType: 'invoice',
      fields: {
        invoice_number: { value: 'INV-001', confidence: 0.99, source: 'Header' },
        stated_total: { value: 515.70, confidence: 0.98, source: 'Total line' },
        date: { value: '2025-03-15', confidence: 0.97, source: 'Date line' },
        vendor: { value: null, confidence: 0.0, source: null },
      },
    },
    {
      documentId: 'con-001',
      documentType: 'contract',
      fields: {
        parties: { value: 'TechStart and CloudServ', confidence: 0.95, source: 'Parties' },
        effective_date: { value: '2025-01-01', confidence: 0.97, source: 'Date line' },
        term: { value: '24 months', confidence: 0.72, source: 'Term line — ambiguous with renewal' },
        auto_renewal: { value: true, confidence: 0.65, source: 'complex conditions paragraph' },
      },
    },
  ];

  // Route each extraction
  console.log('\n--- Routing Decisions ---');
  for (const ext of extractions) {
    const decision = routeExtraction(ext);
    console.log(`\n  ${ext.documentId}: ${decision.route} (${decision.reviewPriority} priority)`);
    if (decision.reasons.length > 0) {
      decision.reasons.forEach(r => console.log(`    - ${r}`));
    }
  }

  // Generate sampling plan
  console.log('\n--- Sampling Plan ---');
  const plan = generateSamplingPlan(extractions, 50);
  console.log(`  Strata: ${plan.totalStrata}, Total samples: ${plan.totalSamples}`);

  console.log('\n  Done. See buildAutomationReport() for full readiness analysis.');
}

main().catch(console.error);
