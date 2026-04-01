# Exercise: Confidence-Based Routing and Stratified Sampling

## Objective

Implement a complete extraction quality control pipeline with field-level
confidence routing, stratified sampling, and segment-level accuracy analysis.

## Setup

Use the shared extraction tools:
```js
import {
  extractionToolDefinitions,
  executeExtractionTool,
  getDocumentIds,
  getDocument,
} from '../../../shared/tools/extraction-tools.js';
```

## Part 1: Build the Confidence Routing Module

Create a module that routes individual extractions to either "auto_accept" or
"human_review" based on field-level analysis.

### Routing Rules

Implement these routing checks (in priority order):

1. **Missing required field**: If a required field has `null` value, route to
   human review regardless of confidence score.

2. **Low confidence on financial field**: If a financial field (total, amount,
   fee, price) has confidence below 0.95, route to human review.

3. **Low confidence on other field**: If any other field has confidence below
   0.80, route to human review.

4. **Cross-field inconsistency**: If `stated_total` and `calculated_total`
   differ, route to human review.

5. **Ambiguous source**: If the source annotation contains "ambiguous" or
   "multiple possible values", route to human review.

### Required Fields by Document Type

```js
const REQUIRED_FIELDS = {
  invoice: ['invoice_number', 'stated_total', 'date'],
  contract: ['parties', 'effective_date', 'term'],
  research_paper: ['title', 'authors'],
  receipt: ['total'],
};
```

### Output Format

The routing decision should include:
```js
{
  documentId: string,
  documentType: string,
  route: 'auto_accept' | 'human_review',
  reasons: string[],         // Why this was routed
  fieldsForReview: [{        // Fields that triggered review
    field: string,
    value: any,
    confidence: number,
    reason: 'low_confidence' | 'missing_required' | 'ambiguous_source' | 'cross_field_mismatch',
  }],
  fieldsAccepted: [{         // Fields that passed all checks
    field: string,
    value: any,
    confidence: number,
  }],
}
```

## Part 2: Build the Stratified Sampler

Create a module that generates a sampling plan for measuring accuracy.

### Stratum Definition

A stratum is a unique combination of `documentType + field`. For example:
- `invoice:total`
- `invoice:date`
- `contract:term`
- `receipt:vendor`

### Sampling Plan

For each stratum, determine:
1. Total document count in that stratum
2. Sample size (min of target sample size and total count)
3. Expected precision of the error rate estimate

### Implementation

```js
function generateSamplingPlan(extractions, samplesPerStratum = 50) {
  // Group extractions by documentType + field
  // Calculate sample sizes
  // Return sampling plan
}
```

### Precision Calculation

The margin of error for a sample proportion is approximately:
```
margin = 1.96 * sqrt(p * (1-p) / n)
```
Where `p` is the observed error rate and `n` is the sample size.

With 50 samples and a 5% error rate: margin = 1.96 * sqrt(0.05 * 0.95 / 50) = 6%
With 200 samples and a 5% error rate: margin = 1.96 * sqrt(0.05 * 0.95 / 200) = 3%

Include this margin in the sampling plan output.

## Part 3: Simulate Accuracy Measurement

Create a simulated labeled validation set:

1. Generate 20 extraction results with known ground truth
2. Introduce known errors:
   - Invoice totals: 2% error rate (e.g., 1 of 50 is wrong)
   - Contract terms: 15% error rate
   - Receipt vendors: 40% error rate
3. Run your routing logic on the simulated extractions
4. Compare routing decisions against ground truth

### Metrics to Calculate

For each stratum:
```
True Positive:  Correctly routed to human review (was actually wrong)
False Positive: Incorrectly routed to human review (was actually right)
True Negative:  Correctly auto-accepted (was actually right)
False Negative:  Incorrectly auto-accepted (was actually wrong)
```

Calculate:
- **Recall**: TP / (TP + FN) -- What fraction of errors did we catch?
- **Precision**: TP / (TP + FP) -- What fraction of reviews found real errors?
- **Automation rate**: TN / (TN + FP) -- What fraction went through without review?

## Part 4: Build the Automation Decision Report

Create a report that recommends which segments to automate:

```markdown
## Automation Readiness Report

### Ready for Automation (error rate < 5%)
| Segment | Error Rate | Confidence | Recommendation |
|---------|-----------|------------|----------------|
| invoice:total | 2% | High | Automate |
| invoice:date | 3% | High | Automate |

### Requires Human Review (error rate >= 5%)
| Segment | Error Rate | Confidence | Recommendation |
|---------|-----------|------------|----------------|
| contract:term | 15% | Medium | Review all |
| receipt:vendor | 40% | Low | Review all |

### Aggregate vs. Segment Analysis
- Aggregate accuracy: 95.2%
- Segments meeting threshold: 15/22 (68%)
- Segments failing threshold: 7/22 (32%)
- RISK: Aggregate accuracy is misleading — 32% of segments have
  unacceptable error rates
```

## Part 5: Confidence Calibration Curve

Create a calibration analysis:

1. Group all field extractions by confidence bucket (0.0-0.1, 0.1-0.2, ..., 0.9-1.0)
2. For each bucket, calculate the actual accuracy (from your labeled data)
3. Plot or tabulate the calibration curve:

```
Confidence Bucket | Count | Actual Accuracy | Calibrated?
──────────────────┼───────┼─────────────────┼────────────
0.90 - 1.00       | 120   | 97%             | Yes (within 5%)
0.80 - 0.89       | 45    | 85%             | Yes (within 5%)
0.70 - 0.79       | 30    | 68%             | Slightly over-confident
0.60 - 0.69       | 15    | 45%             | Over-confident
0.00 - 0.59       | 10    | 20%             | Over-confident
```

4. If the model is over-confident in a bucket, adjust your routing thresholds
   upward for fields that commonly fall in that bucket.

## Evaluation Criteria

Your solution should demonstrate:

- [ ] Field-level (not document-level) confidence routing
- [ ] Different thresholds for financial vs. non-financial fields
- [ ] Stratified sampling by document type AND field
- [ ] Segment-level accuracy measurement
- [ ] Aggregate vs. segment accuracy comparison
- [ ] Automation readiness report with clear recommendations
- [ ] (Bonus) Confidence calibration analysis

## Deliverables

1. `confidence-router.js` -- Field-level routing with all 5 check types
2. `stratified-sampler.js` -- Sampling plan generator
3. `accuracy-analyzer.js` -- Simulated accuracy measurement
4. `automation-report.js` -- Readiness report with segment analysis
5. (Bonus) `calibration.js` -- Confidence calibration curve
