/**
 * Mock MCP Tool Implementations for Structured Data Extraction (Scenario 6)
 *
 * These tools simulate document processing:
 * - extract_metadata: Extract document metadata (title, author, date, type)
 * - extract_data_points: Extract structured data points from document content
 *
 * Designed to demonstrate:
 * - tool_use with JSON schemas (Task 4.3)
 * - Forced tool selection patterns (Task 2.3)
 * - Validation-retry loops (Task 4.4)
 */

// ─── Sample Documents ────────────────────────────────────────────────────────

const sampleDocuments = {
  'invoice-001': {
    type: 'invoice',
    raw: `
      INVOICE #INV-2025-0042
      Date: March 15, 2025
      Due: April 14, 2025

      Bill To: Acme Corp, 123 Main St, Springfield IL 62701

      Description          Qty    Unit Price    Total
      Widget A              10      $25.00      $250.00
      Widget B               5      $42.50      $212.50
      Shipping                                   $15.00
      ──────────────────────────────────────────────────
      Subtotal                                  $477.50
      Tax (8%)                                   $38.20
      TOTAL                                     $515.70

      Payment Terms: Net 30
      Bank: First National, Routing: 071000013, Account: ****4521
    `,
  },
  'research-paper-001': {
    type: 'research_paper',
    raw: `
      Title: Effects of Urban Green Spaces on Mental Health Outcomes
      Authors: Dr. Sarah Chen, Dr. Michael Torres
      Published: Journal of Environmental Psychology, Vol 45, Issue 2, Feb 2025
      DOI: 10.1016/j.jenvp.2025.02.003

      Abstract: This study examines the correlation between access to urban green
      spaces and mental health indicators across 12 metropolitan areas. We found
      that residents within 500m of green spaces reported 23% lower anxiety scores
      (p < 0.001) and 18% lower depression scores (p < 0.01) compared to controls.

      Keywords: urban planning, mental health, green spaces, well-being

      The study surveyed approximately 15,000 participants across 12 cities.
    `,
  },
  'contract-001': {
    type: 'contract',
    raw: `
      SERVICE AGREEMENT

      Effective Date: January 1, 2025
      Parties: TechStart Inc. ("Client") and CloudServ LLC ("Provider")

      Term: 24 months from Effective Date
      Monthly Fee: $4,500/month
      SLA: 99.9% uptime guarantee

      Auto-renewal: Yes, 12-month terms unless 90-day written notice

      Governing Law: State of Delaware
      Arbitration: Required for disputes under $50,000
    `,
  },
  'receipt-missing-fields': {
    type: 'receipt',
    raw: `
      Quick Mart
      Some items purchased
      Total: $23.47
      Paid: Cash
    `,
  },
};

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const extractionToolDefinitions = [
  {
    name: 'extract_metadata',
    description:
      'Extract document metadata including title, author, date, document type, and source. ' +
      'This should be the FIRST extraction step before detailed data extraction. ' +
      'Returns structured metadata that can be used to determine which extraction schema ' +
      'to apply for detailed data points. Fields that cannot be determined from the document ' +
      'should be returned as null — do NOT fabricate values for missing fields.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Document identifier',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'extract_data_points',
    description:
      'Extract structured data points from a document based on its type. The extraction ' +
      'schema varies by document type (invoice, contract, research paper, etc.). ' +
      'Each extracted field includes a confidence score (0-1). Return null for fields ' +
      'where the information is not present in the document — never fabricate values. ' +
      'For ambiguous values, include both the extracted value and a "conflict_detected" flag.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Document identifier',
        },
        document_type: {
          type: 'string',
          enum: ['invoice', 'contract', 'research_paper', 'receipt', 'other'],
          description: 'Document type (from extract_metadata)',
        },
        fields_to_extract: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific fields to extract (optional — extracts all if omitted)',
        },
      },
      required: ['document_id', 'document_type'],
    },
  },
];

// ─── Extraction Output Schemas (for tool_use JSON validation) ────────────────

export const metadataOutputSchema = {
  type: 'object',
  properties: {
    document_id: { type: 'string' },
    title: { type: ['string', 'null'] },
    author: { type: ['string', 'null'] },
    date: { type: ['string', 'null'], description: 'ISO 8601 date' },
    document_type: {
      type: 'string',
      enum: ['invoice', 'contract', 'research_paper', 'receipt', 'letter', 'report', 'other'],
    },
    document_type_detail: {
      type: ['string', 'null'],
      description: 'Additional detail when type is "other"',
    },
    source: { type: ['string', 'null'] },
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
    vendor: { type: ['string', 'null'] },
    bill_to: { type: ['string', 'null'] },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit_price: { type: ['number', 'null'] },
          total: { type: 'number' },
        },
        required: ['description', 'total'],
      },
    },
    subtotal: { type: ['number', 'null'] },
    tax: { type: ['number', 'null'] },
    stated_total: { type: 'number' },
    calculated_total: { type: 'number' },
    conflict_detected: {
      type: 'boolean',
      description: 'True if calculated_total differs from stated_total',
    },
    currency: { type: 'string', default: 'USD' },
  },
  required: ['stated_total', 'calculated_total', 'conflict_detected'],
};

// ─── Tool Executor ───────────────────────────────────────────────────────────

export function executeExtractionTool(toolName, toolInput) {
  switch (toolName) {
    case 'extract_metadata':
      return handleExtractMetadata(toolInput);
    case 'extract_data_points':
      return handleExtractDataPoints(toolInput);
    default:
      return {
        isError: true,
        content: JSON.stringify({
          errorCategory: 'validation',
          isRetryable: false,
          message: `Unknown tool: ${toolName}`,
        }),
      };
  }
}

function handleExtractMetadata({ document_id }) {
  const doc = sampleDocuments[document_id];
  if (!doc) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'validation',
        isRetryable: false,
        message: `Document not found: ${document_id}`,
      }),
    };
  }

  return {
    content: JSON.stringify({
      document_id,
      raw_content: doc.raw,
      type_hint: doc.type,
      message: 'Use this content to extract metadata. Return structured metadata using the extract_metadata output schema.',
    }),
  };
}

function handleExtractDataPoints({ document_id, document_type, fields_to_extract }) {
  const doc = sampleDocuments[document_id];
  if (!doc) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'validation',
        isRetryable: false,
        message: `Document not found: ${document_id}`,
      }),
    };
  }

  return {
    content: JSON.stringify({
      document_id,
      document_type,
      raw_content: doc.raw,
      fields_requested: fields_to_extract || 'all',
      message: 'Extract structured data points from this content according to the document type schema.',
    }),
  };
}

// ─── Sample Documents Accessor (for batch processing exercises) ──────────────

export function getDocumentIds() {
  return Object.keys(sampleDocuments);
}

export function getDocument(documentId) {
  return sampleDocuments[documentId] || null;
}
