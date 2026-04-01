# Exercise: Build a Minimal Agentic Loop

## Objective

Build a minimal agentic loop that uses two tools (`get_customer` and
`lookup_order`) and correctly handles both `stop_reason` values (`tool_use` and
`end_turn`).

## Requirements

### Part 1: Core Loop (Required)

1. Create a new file `my-agent-loop.js` in this directory.
2. Import the Anthropic SDK and the CSR tools from `shared/tools/csr-tools.js`.
3. Implement an agentic loop that:
   - Sends a user message to Claude with `get_customer` and `lookup_order` as
     available tools (filter `csrToolDefinitions` to just these two).
   - Checks `response.stop_reason` to decide whether to continue.
   - If `"tool_use"`: executes each tool call, appends the assistant message and
     tool results to the conversation, and loops.
   - If `"end_turn"`: prints the final text response and exits.
4. Test with this message:
   `"What's the status of order ORD-5001? My email is alice@example.com"`

### Part 2: Safety Limit (Bonus)

Add a `max_turns` safety limit that:
- Is set to a reasonable value (e.g., 10).
- Logs a `console.warn()` message when triggered.
- Does NOT silently truncate -- the warning must be visible.
- Is NOT the primary exit condition (stop_reason remains primary).

## Verification Checklist

Run your solution and verify:

- [ ] The agent calls `get_customer` first (with the email).
- [ ] The agent calls `lookup_order` second (with the order ID and customer ID).
- [ ] The agent returns a natural-language response with the order status.
- [ ] The loop exits because `stop_reason === "end_turn"`, not because of a
      counter or text parsing.
- [ ] If you set `max_turns = 1`, the warning fires and the loop exits early.

## Anti-Pattern Check

Review your code and confirm you did NOT:

- [ ] Parse the assistant's text to decide whether to continue looping.
- [ ] Use `for (let i = 0; i < N; i++)` as the primary loop structure.
- [ ] Check `response.content[0].text.length` to determine completion.
- [ ] Hardcode the number of expected tool calls.

## Expected Flow

```
Turn 1:
  → Claude calls get_customer({ email: "alice@example.com" })
  ← Returns customer C-1001 (Alice Johnson, gold tier)

Turn 2:
  → Claude calls lookup_order({ order_id: "ORD-5001", customer_id: "C-1001" })
  ← Returns order details (delivered, $105.97)

Turn 3:
  → Claude responds with stop_reason: "end_turn"
  ← "Your order ORD-5001 has been delivered on March 1st..."
```

## Hints

- `csrToolDefinitions` is an array. Use `.filter()` to select only the tools you
  need.
- Tool results must reference the `tool_use_id` from the corresponding
  `tool_use` block.
- Tool results are sent as `role: "user"` messages with `type: "tool_result"`
  content blocks.
