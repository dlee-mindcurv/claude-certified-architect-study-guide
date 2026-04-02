/**
 * Mock Extraction Tools for Scenario 6 — Using @anthropic-ai/claude-agent-sdk
 *
 * Exports:
 *   - extractMetadataTool, extractDataPointsTool: individual tool() definitions
 *   - extractionServer: bundled MCP server
 *   - Output schemas for validation (metadataOutputSchema, invoiceOutputSchema)
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Sample Documents ───────────────────────────────────────────────────────

const sampleDocuments = {
  'invoice-001': {
    type: 'invoice',
    raw: `INVOICE #INV-2025-0042
Date: March 15, 2025 | Due: April 14, 2025
Bill To: Acme Corp, 123 Main St, Springfield IL 62701
  Widget A    x10  $25.00  = $250.00
  Widget B     x5  $42.50  = $212.50
  Shipping                  =  $15.00
  Subtotal: $477.50 | Tax (8%): $38.20 | TOTAL: $515.70
Payment Terms: Net 30`,
  },
  'research-paper-001': {
    type: 'research_paper',
    raw: `Title: Effects of Urban Green Spaces on Mental Health Outcomes
Authors: Dr. Sarah Chen, Dr. Michael Torres
Published: Journal of Environmental Psychology, Vol 45, Feb 2025
DOI: 10.1016/j.jenvp.2025.02.003
Abstract: Residents within 500m of green spaces reported 23% lower anxiety
(p < 0.001) and 18% lower depression (p < 0.01). N=15,000 across 12 cities.`,
  },
  'contract-001': {
    type: 'contract',
    raw: `SERVICE AGREEMENT
Effective: January 1, 2025
Parties: TechStart Inc. ("Client") and CloudServ LLC ("Provider")
Term: 24 months | Fee: $4,500/month | SLA: 99.9% uptime
Auto-renewal: Yes, 12-month terms unless 90-day written notice
Governing Law: State of Delaware`,
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function err(category, message) {
  return { content: [{ type: 'text', text: JSON.stringify({ errorCategory: category, isRetryable: false, message }) }], isError: true };
}

// ─── Agent SDK tool() definitions ───────────────────────────────────────────

export const extractMetadataTool = tool(
  'extract_metadata',
  'Extract document metadata (title, author, date, type). Call FIRST before ' +
  'detailed extraction. Return null for fields not found — never fabricate.',
  {
    document_id: z.string().describe('Document identifier'),
  },
  async ({ document_id }) => {
    const doc = sampleDocuments[document_id];
    if (!doc) return err('validation', `Document not found: ${document_id}`);
    return ok({ document_id, raw_content: doc.raw, type_hint: doc.type });
  },
);

export const extractDataPointsTool = tool(
  'extract_data_points',
  'Extract structured data from a document by type. Each field gets a confidence ' +
  'score (0-1). Return null for missing fields, never fabricate.',
  {
    document_id: z.string().describe('Document identifier'),
    document_type: z.enum(['invoice', 'contract', 'research_paper', 'receipt', 'other']).describe('Type from extract_metadata'),
    fields_to_extract: z.array(z.string()).optional().describe('Specific fields (all if omitted)'),
  },
  async ({ document_id, document_type, fields_to_extract }) => {
    const doc = sampleDocuments[document_id];
    if (!doc) return err('validation', `Document not found: ${document_id}`);
    return ok({ document_id, document_type, raw_content: doc.raw, fields_requested: fields_to_extract || 'all' });
  },
);

// ─── Bundled MCP Server ─────────────────────────────────────────────────────

export const extractionServer = createSdkMcpServer({
  name: 'extraction',
  version: '1.0.0',
  tools: [extractMetadataTool, extractDataPointsTool],
});

// ─── Output Schemas (for validation in Task 4.3/4.4) ───────────────────────

export const metadataOutputSchema = {
  type: 'object',
  properties: {
    document_id: { type: 'string' },
    title: { type: ['string', 'null'] },
    author: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    document_type: { type: 'string', enum: ['invoice', 'contract', 'research_paper', 'receipt', 'other'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['document_id', 'document_type', 'confidence'],
};

export const invoiceOutputSchema = {
  type: 'object',
  properties: {
    invoice_number: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    due_date: { type: ['string', 'null'] },
    line_items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, total: { type: 'number' } }, required: ['description', 'total'] } },
    stated_total: { type: 'number' },
    calculated_total: { type: 'number' },
    conflict_detected: { type: 'boolean' },
  },
  required: ['stated_total', 'calculated_total', 'conflict_detected'],
};

// ─── Accessors ──────────────────────────────────────────────────────────────

export function getDocumentIds() { return Object.keys(sampleDocuments); }
export function getDocument(id) { return sampleDocuments[id] || null; }

// ─── Legacy exports ─────────────────────────────────────────────────────────

export const extractionToolDefinitions = [
  { name: 'extract_metadata', description: extractMetadataTool.description,
    input_schema: { type: 'object', properties: { document_id: { type: 'string' } }, required: ['document_id'] } },
  { name: 'extract_data_points', description: extractDataPointsTool.description,
    input_schema: { type: 'object', properties: { document_id: { type: 'string' }, document_type: { type: 'string' }, fields_to_extract: { type: 'array', items: { type: 'string' } } }, required: ['document_id', 'document_type'] } },
];

export function executeExtractionTool(toolName, toolInput) {
  const lookup = { extract_metadata: extractMetadataTool, extract_data_points: extractDataPointsTool };
  const t = lookup[toolName];
  if (!t) return { isError: true, content: JSON.stringify({ errorCategory: 'validation', message: `Unknown: ${toolName}` }) };
  let result;
  t.handler(toolInput, {}).then(r => { result = r; });
  return { isError: result?.isError ?? false, content: result?.content?.[0]?.text ?? '{}' };
}
