# Task 1.1: Design and Implement Agentic Loops

## Exam Relevance
Tested in Scenarios 1 (CSR Agent) and 3 (Research Coordinator).

## The Agentic Loop Lifecycle

An agentic loop is the core execution pattern for any Claude-based agent. The
loop is driven entirely by the API's `stop_reason` field -- not by parsing
the model's text output.

### Lifecycle Steps

```
1. Send request to Claude API (messages + tools + system prompt)
2. Receive response
3. Inspect response.stop_reason:
   a. "tool_use"  --> Execute each tool_use block, append results, LOOP back to step 1
   b. "end_turn"  --> Present the final text response to the user, EXIT loop
   c. "max_tokens" --> Handle truncation (resize context or warn), EXIT or LOOP
4. (If looping) Append the assistant message and all tool results to messages
5. Send the updated messages back to Claude
```

### Why stop_reason Is the Only Reliable Signal

Claude's `stop_reason` is a structured, machine-readable field set by the API
itself. It tells you exactly what happened:

- `"tool_use"` -- Claude wants to call one or more tools. You MUST execute them
  and return results before Claude can continue reasoning.
- `"end_turn"` -- Claude has finished its response. The final text block(s)
  contain the answer for the user.
- `"max_tokens"` -- The response was truncated because it hit the token limit.

### Anti-Patterns (What NOT to Do)

These patterns appear on the exam as distractors. Know why each fails:

**1. Parsing natural language for termination signals**
```js
// WRONG: Fragile, language-dependent, easily broken by rephrasing
if (response.content[0].text.includes("I'm done") ||
    response.content[0].text.includes("Here's your answer")) {
  break;
}
```
Why it fails: Claude might phrase its completion differently every time. It might
say "Here are the results" or "I've completed the analysis" or use no signal
phrase at all. There is no reliable text pattern for "I am finished."

**2. Arbitrary iteration caps as the primary exit condition**
```js
// WRONG: Silently truncates work in progress
for (let i = 0; i < 5; i++) {
  const response = await client.messages.create(...);
  // What if Claude needed 6 tool calls to resolve the issue?
}
```
Why it fails: Different queries require different numbers of tool calls. A simple
order lookup might need 2 calls; a complex refund with disambiguation might need
6+. A hard cap silently drops work in progress.

**3. Checking text content for completion**
```js
// WRONG: Claude might include partial text alongside tool_use
const textBlocks = response.content.filter(b => b.type === "text");
if (textBlocks.length > 0 && textBlocks[0].text.length > 100) {
  break; // Assumes long text = final answer
}
```
Why it fails: Claude can return text blocks alongside tool_use blocks (e.g.,
"Let me look that up for you" + tool call). The presence of text does NOT mean
the response is complete.

### Correct Pattern

```js
while (true) {
  const response = await client.messages.create({ ... });

  if (response.stop_reason === "end_turn") {
    // Claude is done -- extract and present the final text
    return extractText(response);
  }

  if (response.stop_reason === "tool_use") {
    // Execute tools, append results, continue loop
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await executeTools(response.content);
    messages.push({ role: "user", content: toolResults });
    continue;
  }

  // Handle unexpected stop_reasons (max_tokens, etc.)
  throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
}
```

### Safety Limits (Done Right)

A max_turns limit is acceptable as a SAFETY mechanism, but it must:
1. Log a warning when triggered (not fail silently)
2. Be set high enough that legitimate workflows complete
3. Never be the primary exit condition

```js
const MAX_TURNS = 20; // Safety net, not a design constraint
let turns = 0;

while (true) {
  if (++turns > MAX_TURNS) {
    console.warn(`Safety limit reached after ${MAX_TURNS} turns`);
    break; // Log and break -- don't silently return partial work
  }

  const response = await client.messages.create({ ... });
  if (response.stop_reason === "end_turn") break;
  // ... handle tool_use ...
}
```

## Files in This Directory

| File | Description |
|------|-------------|
| `example-raw-api.js` | Complete agentic loop using @anthropic-ai/sdk |
| `example-agent-sdk.js` | Same pattern using Agent SDK conceptual approach |
| `exercise.md` | Hands-on exercise |
| `scenario-1-csr/agent-loop.js` | CSR scenario agentic loop |
| `scenario-3-research/agent-loop.js` | Research scenario agentic loop |
