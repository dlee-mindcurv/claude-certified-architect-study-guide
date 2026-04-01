# Task 4.5: Design Batch Processing Pipelines

## Exam Relevance
Tested in Scenario 5 (CI/CD Review) and Scenario 6 (Data Extraction).

## Message Batches API Overview

The Message Batches API allows you to submit up to 10,000 requests in a single
batch, with two key tradeoffs:

| Feature | Real-time API | Message Batches API |
|---------|---------------|---------------------|
| Cost | Full price | 50% discount |
| Latency | Seconds | Up to 24 hours |
| SLA | Latency guarantees | No latency SLA |
| Use case | Interactive, blocking | Background, non-blocking |

### When to Use Batch Processing

**Good fit:**
- Overnight report generation
- Bulk document extraction (hundreds or thousands of documents)
- Code review of an entire repository (not blocking a PR)
- Data enrichment pipelines
- Any workload where results can wait hours

**Poor fit:**
- CI/CD pipeline blocking a merge (developer is waiting)
- Interactive customer support (customer is waiting)
- Real-time extraction where results feed into the next step
- Any workload requiring multi-turn tool calling

### Key Limitation: No Multi-Turn Tool Calling

The Batch API processes each request as a single API call. It does NOT support
multi-turn conversations or agentic loops. If your extraction requires:

1. Send document -> get metadata
2. Use metadata to decide extraction approach
3. Send targeted extraction request

Then the Batch API can only handle step 1 OR step 3, not the full pipeline.

Workaround: Submit batch for step 1 (metadata), process results, then submit
a second batch for step 3 (detailed extraction).

## custom_id for Correlation

Each batch request includes a `custom_id` string that is returned unchanged
in the result. This is your correlation key for matching results back to
source documents.

```js
{
  custom_id: "doc-invoice-001",  // Returned in the result
  params: {
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{ role: "user", content: "..." }]
  }
}
```

### custom_id Best Practices

- Include the document type and ID for easy debugging
- Keep it unique across the batch
- Include a batch timestamp if you submit multiple batches
- Example: `"extract-v2-invoice-001-20250401T120000Z"`

## SLA Calculation

The Batch API has no guaranteed latency SLA -- results can take up to 24 hours.
If your pipeline has a 4-hour processing window and uses the Batch API:

```
Pipeline guarantee = processing_window + batch_sla
                   = 4 hours + 24 hours
                   = 28 hours (worst case, rounded up to 30 hours for safety)
```

For exam purposes: if asked about the SLA for a pipeline that includes a
batch step, add the batch API's 24-hour maximum to any other processing time.

In practice, most batches complete much faster (often within 1-2 hours), but
you cannot guarantee this for SLA calculations.

## Handling Batch Failures

Not all requests in a batch may succeed. The result for each request includes
a `result.type` field:

- `"succeeded"` -- extraction completed successfully
- `"errored"` -- an API error occurred (rate limit, server error)
- `"expired"` -- the request timed out within the batch window
- `"canceled"` -- the batch was canceled before this request was processed

For errored/expired requests, resubmit ONLY the failed items in a new batch
or via the real-time API (for small numbers of failures).

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Batch submission, polling, and failure handling |
| `exercise.md` | Submit a batch, handle failures, calculate SLA |
| `scenario-6-extraction/batch-pipeline.js` | Full batch extraction pipeline |
