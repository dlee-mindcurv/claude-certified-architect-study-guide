# Task 2.1: Write Effective Tool Descriptions

## Exam Relevance
Tested in Scenario 1 (CSR Agent). Maps to Skill S1.

## Tool Descriptions Are the Primary Selection Mechanism

When Claude receives a list of tools, the `description` field is the primary
information it uses to decide which tool to call. The input schema provides
structural constraints, but the description provides semantic guidance: when to
use this tool, what it does, what it does NOT do, and how it relates to other
available tools.

### Why Minimal Descriptions Fail

Consider two tools with minimal descriptions:

```js
{ name: 'get_customer', description: 'Retrieves customer information' }
{ name: 'lookup_order',  description: 'Retrieves order details' }
```

When a user says "check my order #12345," Claude must decide between these tools.
Both "retrieve information" -- one about customers, one about orders. But:

- Does `get_customer` accept order numbers? The description does not say.
- Does `lookup_order` require a customer ID first? The description does not say.
- Can `get_customer` look up by order number? Unclear.

With minimal descriptions, Claude may call `get_customer` with an order number,
or call `lookup_order` without the required customer ID. Both fail, wasting
tokens and degrading the user experience.

### What Good Descriptions Include

Effective tool descriptions contain five components:

1. **What the tool does** (primary function)
2. **Input format and constraints** (accepted identifiers, formats)
3. **Edge cases and boundaries** (what it does NOT accept, common confusions)
4. **When to use vs. alternatives** (explicit routing guidance)
5. **Prerequisites** (what must happen before calling this tool)

### Example: Before and After

**BEFORE (ambiguous):**
```js
{
  name: 'get_customer',
  description: 'Retrieves customer information'
}
```

**AFTER (differentiated):**
```js
{
  name: 'get_customer',
  description:
    'Look up a customer account by their email address or customer ID ' +
    '(format: C-XXXX). Returns customer profile including name, email, ' +
    'account tier, and status. Use this BEFORE any order lookups or ' +
    'refund processing to verify customer identity. Does NOT accept ' +
    'order numbers — use lookup_order for order queries.'
}
```

The "after" version tells Claude:
- What identifiers it accepts (email or C-XXXX)
- What it returns (profile with tier and status)
- When to call it (before order lookups, before refunds)
- What it does NOT do (does not accept order numbers)
- What to use instead (lookup_order for orders)

### Ambiguous Descriptions Cause Misrouting

When two tools have overlapping descriptions, Claude may:

1. **Call the wrong tool** -- sending an order number to `get_customer`
2. **Skip prerequisite tools** -- calling `lookup_order` before verifying the
   customer, causing a permission error
3. **Attempt both tools** -- wasting tokens by trying each tool until one works

The fix is to make boundaries explicit. If `get_customer` does NOT accept order
numbers, say so. If `lookup_order` requires a prior `get_customer` call, say so.

### System Prompt Wording Can Override Descriptions

The system prompt can reinforce or override tool selection behavior:

```
## Available Tools
- get_customer: ALWAYS call this first to verify identity
- lookup_order: Requires verified customer ID from get_customer
```

This system-level guidance creates a workflow ordering that complements the tool
descriptions. However, tool descriptions remain the primary mechanism -- system
prompt overrides should reinforce descriptions, not contradict them.

### Property-Level Descriptions Matter Too

Beyond the top-level `description`, each input property should have its own
description that specifies format constraints and valid values:

```js
properties: {
  customer_id: {
    type: 'string',
    description: 'Customer ID in format C-XXXX (e.g., C-1001)'
  },
  email: {
    type: 'string',
    description: 'Customer email address for lookup (e.g., user@example.com)'
  }
}
```

These per-property descriptions help Claude format inputs correctly and reduce
validation errors from malformed identifiers.

## Anti-Patterns

**1. Single-sentence descriptions**
```js
description: 'Gets customer data'
```
Too vague -- does not explain what identifiers it accepts, what it returns, or
when to use it.

**2. Identical phrasing across tools**
```js
// Tool 1: 'Retrieves information about a customer'
// Tool 2: 'Retrieves information about an order'
```
The only differentiator is "customer" vs "order" -- not enough for reliable
routing when queries mention both.

**3. Missing boundary statements**
```js
description: 'Look up customer by email or ID'
// Missing: "Does NOT accept order numbers"
```
Without explicit boundaries, Claude may try passing any identifier format.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Before/after comparison with ambiguous query test |
| `exercise.md` | Rewrite 4 ambiguous tool descriptions |
| `scenario-1-csr/tool-definitions.js` | Full CSR tool definitions with well-crafted descriptions |
