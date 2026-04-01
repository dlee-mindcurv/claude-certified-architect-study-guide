# Exercise 1: Build a Multi-Tool Agent with Escalation Logic

**Domains reinforced:** D1 (Agentic Architecture), D2 (Tool Design), D5 (Context Management)

## Objective

Practice designing an agentic loop with tool integration, structured error handling,
and escalation patterns. You will build a customer support agent that uses MCP tools
to resolve issues autonomously while knowing when to escalate.

## Prerequisites

- `npm install` from the project root
- `ANTHROPIC_API_KEY` in `.env` (copy from `.env.example`)

## Steps

### Step 1: Define 3-4 MCP tools with detailed descriptions

Write tool descriptions that disambiguate between similar tools. The shared tools
already include `get_customer` and `lookup_order` (both deal with looking things up)
and `process_refund` and `escalate_to_human` (both resolve issues). Your descriptions
must help the model pick the correct tool without guessing.

Key principles:
- State what the tool does AND what it does NOT do
- Specify required preconditions (e.g., "requires verified customer ID from get_customer")
- Describe input formats (e.g., "format: C-XXXX")
- Explain output semantics so the model can interpret results correctly

### Step 2: Implement the agentic loop

Build a loop that calls the Claude API and checks `stop_reason`:
- `"tool_use"` — extract tool name and input, execute the tool, feed the result back
- `"end_turn"` — the model is done; extract the final text response
- Track iteration count and enforce a maximum to prevent runaway loops

### Step 3: Add structured error responses

When a tool returns `isError: true`, the response includes:
- `errorCategory`: transient, validation, business, permission
- `isRetryable`: whether the agent should retry
- `message`: human-readable description

Feed errors back as tool results so the model can decide the appropriate recovery
strategy (retry, fix input, explain to user, or escalate).

### Step 4: Implement a hook that blocks operations above a threshold

Add a pre-execution hook that intercepts `process_refund` calls. If the refund
amount exceeds a threshold (e.g., $100), the hook should:
- Block the refund from executing
- Return a structured response redirecting to escalation
- The model should then call `escalate_to_human` with appropriate context

### Step 5: Test with multi-concern messages

Test the agent with messages that contain multiple issues in a single request:
- "I need a refund for order ORD-5001 and also want to check on order ORD-5002"
- The agent should handle both concerns sequentially

## Running

```bash
# Run the starter (has TODOs to complete)
npm run exercise:1

# Run the solution
node exercises/exercise-1-multi-tool-agent/solution.js
```

## Key Exam Concepts Practiced

- **Task 1.1**: Agentic loop with stop_reason handling
- **Task 2.1**: Tool descriptions that disambiguate similar tools
- **Task 2.2**: Structured error responses with errorCategory and isRetryable
- **Task 1.4**: Enforcement hooks that redirect to escalation
- **Task 5.1**: Context management across multi-turn tool interactions
