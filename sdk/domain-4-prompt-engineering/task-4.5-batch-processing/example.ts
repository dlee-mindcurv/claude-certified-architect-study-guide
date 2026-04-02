/**
 * Task 4.5 -- Message Batches API for Cost-Efficient Bulk Processing
 *
 * Exam relevance:
 * - Message Batches API: 50% cost savings, up to 24-hour processing
 * - No guaranteed latency SLA -- appropriate for non-blocking workloads
 * - custom_id for correlating results to source documents
 * - Batch API does NOT support multi-turn tool calling
 * - SLA calculation: pipeline_window + 24_hours = total guarantee
 * - Handle failures by resubmitting only failed documents
 *
 * This MUST use @anthropic-ai/sdk since the batch API is not in the Agent SDK.
 * Uses client.messages.batches.create() for batch submission.
 *
 * Run: node sdk/domain-4-prompt-engineering/task-4.5-batch-processing/example.js
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches.js';
import { documentExtractionTool } from '../../../shared/schemas/extraction-output.js';
import { getDocumentIds, getDocument } from '../../../shared/tools/extraction-tools.js';

// ─── Types ─────────────────────────────────────────────────────────────────

interface BatchRequest {
  custom_id: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
}

interface ExtractionData {
  document_type?: string;
  date?: string | null;
  monetary_values?: Array<{ conflict_detected?: boolean; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface SucceededResult {
  custom_id: string;
  extraction: ExtractionData | null;
  retried?: boolean;
  error?: string;
}

interface FailedResult {
  custom_id: string;
  error: unknown;
}

interface BatchResults {
  succeeded: SucceededResult[];
  failed: FailedResult[];
  expired: Array<{ custom_id: string }>;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Step 1: Build Batch Requests ───────────────────────────────────────────
//
// EXAM KEY CONCEPT: Each batch request includes:
// - custom_id: Correlation key returned in results (your document identifier)
// - params: Standard messages.create parameters (model, max_tokens, messages, tools)

function buildBatchRequests(documentIds: string[]): BatchRequest[] {
  console.log('Building batch requests...\n');

  const requests: BatchRequest[] = [];

  for (const docId of documentIds) {
    const doc = getDocument(docId);
    if (!doc) continue;

    // EXAM NOTE: custom_id must be unique within the batch
    const request: BatchRequest = {
      custom_id: `extract-${docId}`,
      params: {
        model: MODEL,
        max_tokens: 2048,
        // ── Forced tool selection works in batch ────────────────────
        tools: [documentExtractionTool as Anthropic.Tool],
        tool_choice: { type: 'tool' as const, name: 'extract_document_info' },
        messages: [
          {
            role: 'user',
            content: `Extract structured information from this document. The document_id is "${docId}".
Return null for fields not present in the source. Compare calculated and stated totals.

Document:
${doc.raw}`,
          },
        ],
      },
    };

    requests.push(request);
    console.log(`  Request: ${request.custom_id}`);
  }

  return requests;
}

// ─── Step 2: Submit Batch ───────────────────────────────────────────────────

async function submitBatch(requests: BatchRequest[]) {
  console.log(`\nSubmitting batch with ${requests.length} requests...`);

  // ── EXAM KEY CONCEPT: message_batches.create ──────────────────────
  const batch = await client.messages.batches.create({
    requests,
  });

  console.log(`  Batch ID: ${batch.id}`);
  console.log(`  Status: ${batch.processing_status}`);
  console.log(`  Created: ${batch.created_at}`);

  return batch;
}

// ─── Step 3: Poll for Completion ────────────────────────────────────────────

async function pollBatchCompletion(batchId: string, intervalMs = 5000, maxWaitMs = 300000) {
  console.log(`\nPolling batch ${batchId} for completion...`);

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const batch = await client.messages.batches.retrieve(batchId);

    console.log(
      `  Status: ${batch.processing_status} ` +
      `(${batch.request_counts.succeeded} succeeded, ` +
      `${batch.request_counts.errored} errored, ` +
      `${batch.request_counts.processing} processing)`
    );

    if (batch.processing_status === 'ended') {
      console.log('  Batch complete!');
      return batch;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.log('  Polling timeout reached');
  return null;
}

// ─── Step 4: Process Results ────────────────────────────────────────────────

async function processResults(batchId: string): Promise<BatchResults> {
  console.log(`\nProcessing results for batch ${batchId}...`);

  const results: BatchResults = {
    succeeded: [],
    failed: [],
    expired: [],
  };

  // EXAM NOTE: Results are streamed via an async iterator
  const decoder = await client.messages.batches.results(batchId);
  for await (const result of decoder) {
    const customId = result.custom_id;

    if (result.result.type === 'succeeded') {
      const message = result.result.message;
      const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

      results.succeeded.push({
        custom_id: customId,
        extraction: toolUse ? (toolUse.input as ExtractionData) : null,
      });
      console.log(`  SUCCESS: ${customId}`);

    } else if (result.result.type === 'errored') {
      results.failed.push({
        custom_id: customId,
        error: result.result.error,
      });
      console.log(`  ERRORED: ${customId} -- ${result.result.error?.error?.message || 'unknown error'}`);

    } else if (result.result.type === 'expired') {
      results.expired.push({ custom_id: customId });
      console.log(`  EXPIRED: ${customId}`);

    } else if (result.result.type === 'canceled') {
      console.log(`  CANCELED: ${customId}`);
    }
  }

  return results;
}

// ─── Step 5: Resubmit Failed Items ─────────────────────────────────────────
//
// EXAM KEY CONCEPT: Resubmit ONLY the failed items, not the entire batch.
// For small numbers of failures, use the real-time API instead of a new batch.

async function resubmitFailures(failedItems: Array<FailedResult | { custom_id: string }>, originalRequests: BatchRequest[]) {
  if (failedItems.length === 0) {
    console.log('\nNo failures to resubmit.');
    return [];
  }

  console.log(`\nResubmitting ${failedItems.length} failed items...`);

  const failedIds = new Set(failedItems.map((f) => f.custom_id));

  // For small numbers, use real-time API
  if (failedItems.length <= 3) {
    console.log('  Using real-time API for small number of failures');

    const retryResults: SucceededResult[] = [];
    for (const item of failedItems) {
      const originalRequest = originalRequests.find((r) => r.custom_id === item.custom_id);
      if (!originalRequest) continue;

      try {
        const response = await client.messages.create(originalRequest.params);
        const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        retryResults.push({
          custom_id: item.custom_id,
          extraction: toolUse ? (toolUse.input as ExtractionData) : null,
          retried: true,
        });
        console.log(`  Retry SUCCESS: ${item.custom_id}`);
      } catch (err) {
        console.log(`  Retry FAILED: ${item.custom_id} -- ${(err as Error).message}`);
        retryResults.push({
          custom_id: item.custom_id,
          extraction: null,
          error: (err as Error).message,
          retried: true,
        });
      }
    }
    return retryResults;
  }

  // For many failures, submit a new batch
  console.log('  Submitting new batch for failures');
  const retryRequests = originalRequests.filter((r) => failedIds.has(r.custom_id));
  const retryBatch = await submitBatch(retryRequests);
  const retryBatchResult = await pollBatchCompletion(retryBatch.id);
  if (retryBatchResult) {
    return processResults(retryBatch.id);
  }
  return [];
}

// ─── SLA Calculation ────────────────────────────────────────────────────────

function calculateSLA() {
  console.log('\n' + '='.repeat(60));
  console.log('SLA CALCULATION');
  console.log('='.repeat(60));

  const processingWindowHours = 4;
  const batchMaxHours = 24;
  const safetyMarginHours = 2;

  const totalSLAHours = processingWindowHours + batchMaxHours + safetyMarginHours;

  console.log(`
  Pipeline processing window:  ${processingWindowHours} hours
  Batch API max latency:       ${batchMaxHours} hours (no guaranteed SLA)
  Safety margin:               ${safetyMarginHours} hours
  ─────────────────────────────────────
  Total pipeline guarantee:    ${totalSLAHours} hours

  EXAM KEY CONCEPT: The Batch API has NO guaranteed latency SLA.
  Results can take up to 24 hours. When calculating pipeline SLAs,
  add the 24-hour maximum to any other processing time.

  Example exam question:
  "A batch extraction pipeline has a 4-hour data processing window.
   What is the maximum end-to-end time guarantee?"
  Answer: 4 + 24 = 28 hours minimum (round to 30 for safety margin)
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Task 4.5 -- Message Batches API\n');
  console.log('Demonstrating batch submission, polling, and failure handling.\n');

  const documentIds = getDocumentIds();
  const requests = buildBatchRequests(documentIds);

  const batch = await submitBatch(requests);
  const completedBatch = await pollBatchCompletion(batch.id);

  if (completedBatch) {
    const results = await processResults(batch.id);

    console.log(`\n--- Results Summary ---`);
    console.log(`  Succeeded: ${results.succeeded.length}`);
    console.log(`  Failed: ${results.failed.length}`);
    console.log(`  Expired: ${results.expired.length}`);

    const allFailed = [...results.failed, ...results.expired];
    if (allFailed.length > 0) {
      await resubmitFailures(allFailed, requests);
    }

    for (const result of results.succeeded) {
      console.log(`\n  ${result.custom_id}:`);
      if (result.extraction) {
        console.log(`    type: ${result.extraction.document_type}`);
        console.log(`    date: ${result.extraction.date}`);
        const conflicts = (result.extraction.monetary_values || [])
          .filter(mv => mv.conflict_detected);
        if (conflicts.length > 0) {
          console.log(`    conflicts: ${conflicts.length}`);
        }
      }
    }
  }

  calculateSLA();

  console.log('\n' + '='.repeat(60));
  console.log('KEY TAKEAWAYS');
  console.log('='.repeat(60));
  console.log(`
1. 50% COST SAVINGS: Batch API is half the price of real-time API.

2. NO LATENCY SLA: Up to 24 hours. Use for non-blocking workloads only.

3. custom_id: Your correlation key -- returned unchanged in results.

4. NO MULTI-TURN: Each request is a single API call. Cannot do
   agentic loops or multi-step tool calling within a batch.

5. FAILURE HANDLING: Resubmit only failed items, not the entire batch.
   For small failures, use real-time API instead.

6. SLA MATH: pipeline_window + 24_hours + safety_margin = guarantee
`);
}

main().catch(console.error);
