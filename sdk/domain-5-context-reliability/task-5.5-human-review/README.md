# Task 5.5: Route Extractions to Human Review Based on Confidence

## Exam Relevance
Tested in Scenario 6 (Data Extraction). Assessed skill: S6.

## The Problem: Aggregate Accuracy Masks Segment-Level Issues

An extraction pipeline might report 95% accuracy overall, but this aggregate
metric can hide critical segment-level problems:

```
Document Type     | Field    | Accuracy | Volume
─────────────────┼──────────┼──────────┼────────
Invoice           | Total    | 99%      | 10,000
Invoice           | Date     | 98%      | 10,000
Contract          | Term     | 85%      | 500
Receipt (minimal) | Vendor   | 60%      | 200
─────────────────┴──────────┴──────────┴────────
Aggregate accuracy: 95.2%
```

The 95.2% aggregate looks good, but:
- Receipts with minimal data have only 60% accuracy on vendor extraction
- Contracts have 85% accuracy on term extraction
- These segments are where automation is most dangerous

**Without segment-level analysis, you would not know that 40% of receipt
vendor extractions are wrong.**

## The Solution: Multi-Layer Quality Controls

### 1. Field-Level Confidence Scores

Each extracted field carries its own confidence score, not just the document:

```json
{
  "document_id": "invoice-001",
  "extractions": {
    "invoice_number": { "value": "INV-2025-0042", "confidence": 0.99 },
    "total": { "value": 515.70, "confidence": 0.97 },
    "vendor": { "value": null, "confidence": 0.0, "note": "Not found in document" },
    "due_date": { "value": "2025-04-14", "confidence": 0.85 }
  }
}
```

### 2. Confidence Calibration with Labeled Validation Sets

Raw confidence scores from a model are NOT automatically calibrated. A model
reporting "0.85 confidence" does not necessarily mean it is right 85% of the time.

**Calibration process:**
1. Create a labeled validation set (100+ documents with human-verified extractions)
2. Run the extraction pipeline on the validation set
3. Compare model confidence to actual accuracy at each confidence level
4. Build a calibration curve mapping model confidence to true accuracy

```
Model Confidence | Actual Accuracy | Calibrated?
─────────────────┼─────────────────┼────────────
0.95+            | 97%             | Yes (close)
0.85-0.94        | 88%             | Yes (close)
0.70-0.84        | 71%             | Yes (close)
0.50-0.69        | 52%             | Yes (close)
< 0.50           | 30%             | Under-confident
```

Without this calibration, confidence thresholds for routing decisions are
meaningless numbers.

### 3. Routing Logic: When to Send to Human Review

Route to human review when:

- **Low confidence**: Field confidence below the calibrated threshold
  (e.g., < 0.80 after calibration)
- **Ambiguous source**: Multiple possible values found in the document
  (e.g., two different dates that could be the "due date")
- **Missing required field**: A required field could not be extracted
- **Cross-field inconsistency**: Extracted values are internally inconsistent
  (e.g., line items do not sum to stated total)

### 4. Stratified Random Sampling

To measure error rates accurately, sample by document type AND field:

```
Stratum: Invoice + Total       → Sample 50, find 1 error  → 2% error rate
Stratum: Invoice + Date        → Sample 50, find 2 errors → 4% error rate
Stratum: Contract + Term       → Sample 50, find 8 errors → 16% error rate
Stratum: Receipt + Vendor      → Sample 50, find 20 errors → 40% error rate
```

**Why stratified, not random?**
- Pure random sampling over-represents high-volume document types (invoices)
- Under-represents rare but high-risk types (contracts, minimal receipts)
- Stratified sampling ensures each segment gets enough samples to measure
  its error rate

### 5. Accuracy Analysis by Segment Before Automating

Before fully automating a document type + field combination:

1. Run stratified sampling to measure the segment error rate
2. Compare to the acceptable error threshold for that field type
3. Only automate segments that meet the threshold
4. Keep human review for segments that do not

```
Segment               | Error Rate | Threshold | Automate?
──────────────────────┼────────────┼───────────┼──────────
Invoice + Total       | 2%         | 5%        | Yes
Invoice + Date        | 4%         | 5%        | Yes
Contract + Term       | 16%        | 5%        | No
Receipt + Vendor      | 40%        | 10%       | No
```

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Extraction pipeline with confidence routing and sampling |
| `exercise.md` | Implement confidence routing and stratified sampling |
| `scenario-6-extraction/confidence-routing.js` | Full routing implementation |
