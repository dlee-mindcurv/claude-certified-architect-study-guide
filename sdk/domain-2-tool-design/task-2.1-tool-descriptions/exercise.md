# Exercise: Eliminate Ambiguity from Tool Descriptions

## Objective

You are given 4 tools with ambiguous, overlapping descriptions. Rewrite each
description so that Claude can reliably select the correct tool for any user
query -- without guessing or trial-and-error.

## The Problem

An e-commerce support agent has these 4 tools, but customers frequently get
routed to the wrong one:

```js
const tools = [
  {
    name: 'search_products',
    description: 'Search for products in the catalog',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', description: 'Product category' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product_details',
    description: 'Get details about a product',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'check_inventory',
    description: 'Check product availability',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID' },
        store_id: { type: 'string', description: 'Store location' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'track_shipment',
    description: 'Track a shipment',
    input_schema: {
      type: 'object',
      properties: {
        tracking_number: { type: 'string', description: 'Tracking number' },
        order_id: { type: 'string', description: 'Order ID' },
      },
    },
  },
];
```

## Misrouting Examples

These user queries currently cause misrouting:

1. **"Do you have the blue wireless headphones in stock?"**
   - Agent calls `search_products` instead of `check_inventory`
   - Why: Both descriptions involve "products" -- no guidance on when stock
     questions should go to `check_inventory`

2. **"Tell me more about product P-1234"**
   - Agent sometimes calls `search_products` with query "P-1234"
   - Why: "Get details" and "search" overlap; no guidance that product IDs
     go to `get_product_details`

3. **"Where's my order ORD-7890?"**
   - Agent calls `get_product_details` or `check_inventory`
   - Why: "Track a shipment" does not mention orders; the user said "order"
     not "shipment"

4. **"Is the MacBook Pro available at the downtown store?"**
   - Agent calls `search_products` instead of `check_inventory`
   - Why: No guidance that store-specific availability queries need
     `check_inventory`

## Your Task

Rewrite the `description` field for each of the 4 tools. Your descriptions must:

1. **Specify accepted input formats** (e.g., "Product ID in format P-XXXX")
2. **Include boundary statements** (e.g., "Does NOT check inventory levels")
3. **Provide routing guidance** (e.g., "Use this for browsing; for stock
   availability, use check_inventory instead")
4. **State prerequisites** if any tool must be called first
5. **Clarify overlapping concepts** (e.g., "order" vs "shipment" vs "tracking")

Also rewrite the per-property `description` fields where helpful.

## Verification

After rewriting, evaluate your descriptions against each of the 4 misrouting
examples above. For each query:

- [ ] Which tool would Claude call with your new descriptions?
- [ ] Does the description explicitly guide Claude away from the wrong tool?
- [ ] Are there any remaining ambiguities between tools?

## Bonus Challenge

Write a system prompt section (3-5 lines) that reinforces the routing logic
from your tool descriptions. The system prompt should complement, not
contradict, the tool descriptions.

## Expected Outcomes

After completing this exercise, you should understand:

- Why minimal tool descriptions cause misrouting
- How to write boundary statements that prevent overlap
- How input format specifications reduce validation errors
- How system prompt wording reinforces tool descriptions
- The five components of an effective description: function, format,
  boundaries, routing guidance, prerequisites

## Solution Checklist

Your rewritten descriptions should pass these checks:

- [ ] `search_products`: Says it is for browsing/discovering, NOT for stock checks
- [ ] `get_product_details`: Says it accepts product IDs (P-XXXX), returns
      specs/pricing/reviews, NOT inventory
- [ ] `check_inventory`: Says it checks stock at specific stores, accepts
      product ID + optional store, explicitly different from search
- [ ] `track_shipment`: Says it accepts tracking numbers OR order IDs
      (ORD-XXXX), handles "where is my order" queries
