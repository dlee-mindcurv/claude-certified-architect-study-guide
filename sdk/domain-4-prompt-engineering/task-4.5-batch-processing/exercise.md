# Exercise: Submit a Batch, Handle Failures, Calculate SLA

## Objective

Build a complete batch processing pipeline that submits extraction requests,
handles mixed success/failure results, and calculates the end-to-end SLA.

## Part 1: Build and Submit a Batch (20 minutes)

Using the sample documents from `shared/tools/extraction-tools.js`:

1. Build batch requests for all documents with:
   - Unique `custom_id` for each (include document ID and timestamp)
   - Forced tool selection (`tool_choice: { type: "tool", name: "..." }`)
   - Appropriate max_tokens

2. Submit the batch using `client.messages.batches.create()`

3. Poll for completion using `client.messages.batches.retrieve()`
   - Poll every 10 seconds
   - Set a maximum wait time of 5 minutes for this exercise
   - Log status updates at each poll

## Part 2: Process Results (15 minutes)

When the batch completes:

1. Iterate over results using `client.messages.batches.results()`

2. Classify each result:
   - `succeeded`: Extract the tool_use output and store it
   - `errored`: Log the error and add to retry queue
   - `expired`: Add to retry queue
   - `canceled`: Log and skip

3. For succeeded results, validate the extraction:
   - Check that document_type is valid
   - Check that conflict_detected is consistent with stated/calculated values
   - Flag any extractions with low confidence scores

## Part 3: Handle Failures (15 minutes)

Implement failure handling:

1. For 1-3 failures: Resubmit via real-time API (faster than a new batch)
2. For 4+ failures: Submit a new batch with only the failed items

Track the retry results separately and merge with the original batch results.

## Part 4: SLA Calculation (10 minutes)

Answer these SLA questions:

1. **Basic calculation:**
   Your pipeline has a 2-hour data preparation step followed by a batch
   extraction step. What is the maximum end-to-end guarantee?

   ```
   Answer: ___ hours
   Show your work: ___
   ```

2. **With retry:**
   Same pipeline, but failures are resubmitted as a second batch.
   What is the new maximum guarantee?

   ```
   Answer: ___ hours
   Show your work: ___
   ```

3. **Hybrid approach:**
   You submit a batch but also need 5 documents processed urgently
   via the real-time API. The real-time API takes ~30 seconds per document.
   What are the SLA implications?

   ```
   Batch SLA: ___ hours
   Real-time SLA: ___ minutes
   Overall pipeline SLA: ___
   ```

4. **Design decision:**
   A CI/CD pipeline runs code review on PR submission. The developer is
   waiting for the review to complete before merging. Should you use the
   Batch API?

   ```
   Answer: ___
   Why: ___
   ```

## Part 5: Cost Analysis (10 minutes)

Calculate the cost comparison:

1. Assume 1,000 documents at ~2,000 input tokens and ~1,000 output tokens each.

2. Calculate the total cost using:
   - Real-time API pricing
   - Batch API pricing (50% discount)

3. Calculate the break-even point: at what volume does the batch cost
   savings justify the development effort of building the batch pipeline?

## Success Criteria

- [ ] Batch requests built with unique custom_id for each document
- [ ] Batch submitted and polled to completion
- [ ] Results classified by type (succeeded, errored, expired)
- [ ] Failures resubmitted (real-time for small count, batch for large)
- [ ] SLA calculations correct for all four scenarios
- [ ] Cost comparison shows concrete savings numbers
- [ ] Design decision correctly identifies Batch API as inappropriate for
      blocking CI/CD (developer is waiting)

## Exam Tip

The exam frequently tests the Batch API's limitations:

1. **No latency SLA.** Any pipeline that includes a batch step must account
   for up to 24 hours of processing time. "Most batches complete in 1-2
   hours" is true but is NOT an SLA guarantee.

2. **No multi-turn.** Agentic loops (check stop_reason, execute tools,
   continue) are NOT possible within a batch. Each request is a single
   API call.

3. **Not for blocking workflows.** If a human or system is actively waiting
   for the result (CI/CD merge, customer support, real-time dashboards),
   the Batch API is the wrong choice regardless of cost savings.

4. **custom_id is your responsibility.** The API returns it unchanged but
   does not enforce uniqueness. Duplicate custom_ids will cause correlation
   bugs in your result processing.
