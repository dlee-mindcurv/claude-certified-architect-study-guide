/**
 * Scenario 6 (Data Extraction) -- Full Batch Extraction Pipeline
 *
 * Exam relevance:
 * - Task 4.5: Message Batches API for bulk extraction
 * - 50% cost savings, up to 24-hour processing, no latency SLA
 * - custom_id for result correlation
 * - Batch does NOT support multi-turn tool calling
 * - Failure handling: resubmit only failed documents
 * - SLA: pipeline_window + 24h batch_max = total guarantee
 *
 * This module implements the complete batch extraction pipeline:
 * 1. Build extraction requests for all documents
 * 2. Submit as a single batch
 * 3. Poll for completion
 * 4. Process and validate results
 * 5. Resubmit failures
 * 6. Generate pipeline report with SLA analysis
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.5-batch-processing/scenario-6-extraction/batch-pipeline.js
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { documentExtractionTool } from '../../../../shared/schemas/extraction-output.js';
import { getDocumentIds, getDocument } from '../../../../shared/tools/extraction-tools.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_WAIT_MS = 300000; // 5 minutes for demo; production would be longer
const REALTIME_RETRY_THRESHOLD = 3; // Use real-time API if <= this many failures

// ─── Phase 1: Build Batch Requests ──────────────────────────────────────────

/**
 * Build batch requests for all documents in the extraction pipeline.
 *
 * EXAM KEY CONCEPT: Each request has a custom_id that is returned in results.
 * This is the ONLY way to correlate batch results to source documents.
 * The API does not enforce uniqueness -- that is your responsibility.
 */
function buildBatchRequests() {
  const documentIds = getDocumentIds();
  const batchTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const requests = [];

  for (const docId of documentIds) {
    const doc = getDocument(docId);
    if (!doc) continue;

    requests.push({
      // ── custom_id: includes doc ID, type hint, and timestamp ────
      custom_id: `extract-${docId}-${batchTimestamp}`,
      params: {
        model: MODEL,
        max_tokens: 2048,
        // ── Forced tool selection: guaranteed structured output ────
        // EXAM NOTE: tool_choice and tools ARE supported in batch
        tools: [documentExtractionTool],
        tool_choice: { type: 'tool', name: 'extract_document_info' },
        messages: [
          {
            role: 'user',
            content: `You are extracting structured data from documents. The document_id is "${docId}".

Rules:
- Return null for fields not present in the source document
- Never fabricate values -- if information is absent, use null
- For monetary values, calculate totals independently and compare to stated values
- Set conflict_detected: true if stated and calculated values differ
- Include confidence scores (0-1) for each extracted field

Document to extract:
${doc.raw}`,
          },
        ],
      },
    });
  }

  return requests;
}

// ─── Phase 2: Submit Batch ──────────────────────────────────────────────────

async function submitBatch(requests) {
  console.log(`Submitting batch of ${requests.length} extraction requests...\n`);

  const batch = await client.messages.batches.create({ requests });

  console.log(`  Batch ID:  ${batch.id}`);
  console.log(`  Status:    ${batch.processing_status}`);
  console.log(`  Created:   ${batch.created_at}`);
  console.log(`  Requests:  ${requests.length}`);

  return batch;
}

// ─── Phase 3: Poll for Completion ───────────────────────────────────────────

async function waitForCompletion(batchId) {
  console.log(`\nWaiting for batch ${batchId}...\n`);
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < MAX_POLL_WAIT_MS) {
    const batch = await client.messages.batches.retrieve(batchId);
    const counts = batch.request_counts;
    const statusLine =
      `processing=${counts.processing} succeeded=${counts.succeeded} ` +
      `errored=${counts.errored} expired=${counts.expired} canceled=${counts.canceled}`;

    if (statusLine !== lastStatus) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  [${elapsed}s] ${batch.processing_status}: ${statusLine}`);
      lastStatus = statusLine;
    }

    if (batch.processing_status === 'ended') {
      return {
        batch,
        elapsedMs: Date.now() - startTime,
        counts,
      };
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log('  Polling timeout -- batch may still be processing');
  return null;
}

// ─── Phase 4: Process Results ───────────────────────────────────────────────

async function collectResults(batchId) {
  console.log(`\nCollecting results for batch ${batchId}...\n`);

  const succeeded = [];
  const failed = [];
  const expired = [];

  for await (const result of client.messages.batches.results(batchId)) {
    const customId = result.custom_id;
    // Extract the document ID from custom_id
    const docIdMatch = customId.match(/^extract-(.+?)-\d{4}/);
    const docId = docIdMatch ? docIdMatch[1] : customId;

    switch (result.result.type) {
      case 'succeeded': {
        const message = result.result.message;
        const toolUse = message.content.find(b => b.type === 'tool_use');
        const extraction = toolUse ? toolUse.input : null;

        // ── Basic validation ────────────────────────────────────────
        const validationIssues = [];
        if (extraction) {
          if (!extraction.document_type) validationIssues.push('missing document_type');
          if (!extraction.field_confidence) validationIssues.push('missing field_confidence');

          // Check conflict detection
          if (extraction.monetary_values) {
            for (const mv of extraction.monetary_values) {
              if (mv.stated_value != null && mv.calculated_value != null) {
                const diff = Math.abs(mv.stated_value - mv.calculated_value);
                if (diff > 0.01 && !mv.conflict_detected) {
                  validationIssues.push(`undetected conflict in ${mv.label}`);
                }
              }
            }
          }
        }

        succeeded.push({
          custom_id: customId,
          document_id: docId,
          extraction,
          validation_issues: validationIssues,
          status: validationIssues.length === 0 ? 'clean' : 'has_issues',
        });

        const statusIcon = validationIssues.length === 0 ? 'CLEAN' : 'ISSUES';
        console.log(`  [${statusIcon}] ${docId}: type=${extraction?.document_type || 'unknown'}`);
        break;
      }

      case 'errored':
        failed.push({
          custom_id: customId,
          document_id: docId,
          error: result.result.error,
        });
        console.log(`  [ERROR] ${docId}: ${result.result.error?.message || 'unknown'}`);
        break;

      case 'expired':
        expired.push({ custom_id: customId, document_id: docId });
        console.log(`  [EXPIRED] ${docId}`);
        break;

      case 'canceled':
        console.log(`  [CANCELED] ${docId}`);
        break;
    }
  }

  return { succeeded, failed, expired };
}

// ─── Phase 5: Resubmit Failures ────────────────────────────────────────────

/**
 * Resubmit failed extractions.
 *
 * EXAM KEY CONCEPT: Resubmit ONLY the failed items.
 * - For small failure counts: use real-time API (no batch overhead)
 * - For large failure counts: submit a new batch
 */
async function resubmitFailures(failedItems, originalRequests) {
  if (failedItems.length === 0) return [];

  console.log(`\nResubmitting ${failedItems.length} failed items...`);

  const failedCustomIds = new Set(failedItems.map(f => f.custom_id));
  const failedRequests = originalRequests.filter(r => failedCustomIds.has(r.custom_id));

  if (failedItems.length <= REALTIME_RETRY_THRESHOLD) {
    // ── Real-time retry for small failure counts ──────────────────
    console.log('  Using real-time API (small failure count)\n');
    const retryResults = [];

    for (const req of failedRequests) {
      try {
        const response = await client.messages.create(req.params);
        const toolUse = response.content.find(b => b.type === 'tool_use');
        retryResults.push({
          custom_id: req.custom_id,
          extraction: toolUse ? toolUse.input : null,
          retry_method: 'realtime',
          status: 'success',
        });
        console.log(`  Retry OK: ${req.custom_id}`);
      } catch (err) {
        retryResults.push({
          custom_id: req.custom_id,
          extraction: null,
          retry_method: 'realtime',
          status: 'failed',
          error: err.message,
        });
        console.log(`  Retry FAILED: ${req.custom_id}`);
      }
    }
    return retryResults;
  }

  // ── Batch retry for large failure counts ────────────────────────
  console.log('  Submitting retry batch\n');
  const retryBatch = await submitBatch(failedRequests);
  const completion = await waitForCompletion(retryBatch.id);
  if (completion) {
    const retryResults = await collectResults(retryBatch.id);
    return retryResults.succeeded.map(r => ({
      ...r,
      retry_method: 'batch',
    }));
  }
  return [];
}

// ─── Phase 6: Pipeline Report ───────────────────────────────────────────────

function generateReport(results, elapsedMs, retryResults) {
  console.log('\n' + '='.repeat(60));
  console.log('BATCH EXTRACTION PIPELINE REPORT');
  console.log('='.repeat(60));

  const totalDocs = results.succeeded.length + results.failed.length + results.expired.length;
  const cleanExtractions = results.succeeded.filter(r => r.status === 'clean').length;
  const issueExtractions = results.succeeded.filter(r => r.status === 'has_issues').length;

  console.log(`
Documents processed:     ${totalDocs}
Succeeded (clean):       ${cleanExtractions}
Succeeded (with issues): ${issueExtractions}
Failed:                  ${results.failed.length}
Expired:                 ${results.expired.length}
Retried:                 ${retryResults.length}
Processing time:         ${Math.round(elapsedMs / 1000)}s
`);

  // ── Conflict Detection Summary ──────────────────────────────────
  const conflictsFound = results.succeeded
    .filter(r => r.extraction?.monetary_values?.some(mv => mv.conflict_detected))
    .map(r => ({
      document_id: r.document_id,
      conflicts: r.extraction.monetary_values
        .filter(mv => mv.conflict_detected)
        .map(mv => `${mv.label}: stated=$${mv.stated_value}, calc=$${mv.calculated_value}`),
    }));

  if (conflictsFound.length > 0) {
    console.log('Monetary Conflicts Detected:');
    for (const c of conflictsFound) {
      console.log(`  ${c.document_id}: ${c.conflicts.join('; ')}`);
    }
    console.log();
  }

  // ── SLA Analysis ────────────────────────────────────────────────
  console.log('SLA Analysis:');
  const batchMaxHours = 24;
  const processingWindowHours = 4; // Assumed pipeline window

  console.log(`  Actual processing time:      ${Math.round(elapsedMs / 1000 / 60)} minutes`);
  console.log(`  Batch API max latency:       ${batchMaxHours} hours`);
  console.log(`  Pipeline processing window:  ${processingWindowHours} hours`);
  console.log(`  Total SLA guarantee:         ${processingWindowHours + batchMaxHours} hours`);
  console.log(`  With safety margin:          ${processingWindowHours + batchMaxHours + 2} hours`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.5 / Scenario 6 -- Full Batch Extraction Pipeline\n');

  // Phase 1: Build requests
  console.log('Phase 1: Building batch requests...');
  const requests = buildBatchRequests();
  console.log(`  Built ${requests.length} requests\n`);

  // Phase 2: Submit
  console.log('Phase 2: Submitting batch...');
  const batch = await submitBatch(requests);

  // Phase 3: Poll
  console.log('\nPhase 3: Polling for completion...');
  const completion = await waitForCompletion(batch.id);

  if (!completion) {
    console.log('Batch did not complete within timeout. Exiting.');
    return;
  }

  // Phase 4: Collect results
  console.log('\nPhase 4: Processing results...');
  const results = await collectResults(batch.id);

  // Phase 5: Resubmit failures
  console.log('\nPhase 5: Handling failures...');
  const allFailed = [...results.failed, ...results.expired];
  const retryResults = await resubmitFailures(allFailed, requests);

  // Phase 6: Report
  generateReport(results, completion.elapsedMs, retryResults);

  console.log(`
KEY PIPELINE DESIGN DECISIONS:
1. FORCED TOOL_USE in batch requests guarantees structured output.
2. custom_id includes doc ID and timestamp for unique correlation.
3. Small failure counts use real-time API (faster than new batch).
4. Validation runs on batch results, not in-batch (no multi-turn).
5. Conflicts are detected within extraction (self-correction, Task 4.4).
6. SLA accounts for 24-hour batch max, not typical 1-2 hour completion.
`);
}

main().catch(console.error);
