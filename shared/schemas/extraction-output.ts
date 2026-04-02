/**
 * JSON Schemas for Structured Data Extraction (Scenario 6)
 *
 * Exam relevance: Task 4.3 (Enforce structured output using tool_use and JSON schemas)
 *
 * Key design principles:
 * - Required fields: only what MUST be present for downstream processing
 * - Optional/nullable fields: information that may not exist in source documents
 * - Enum with "other" + detail: extensible categorization
 * - conflict_detected: self-correction validation (calculated vs stated values)
 * - confidence scores: enable human review routing (Task 5.5)
 */

/**
 * Schema for the extract_document_info tool — used with tool_use for guaranteed
 * schema-compliant structured output. Note: tool_use eliminates JSON syntax errors
 * but does NOT prevent semantic errors (values in wrong fields, fabricated data).
 */
export const documentExtractionTool = {
  name: 'extract_document_info',
  description:
    'Extract structured information from a document. Returns data conforming to a strict ' +
    'JSON schema. Fields not found in the source document MUST be null — never fabricate values. ' +
    'Include confidence scores for each extracted field to enable downstream quality routing.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string' },
      document_type: {
        type: 'string',
        enum: ['invoice', 'contract', 'research_paper', 'receipt', 'letter', 'report', 'other'],
        description: 'Primary document category',
      },
      document_type_detail: {
        type: ['string', 'null'],
        description: 'Additional detail when document_type is "other" or for sub-categorization',
      },
      title: { type: ['string', 'null'] },
      author: { type: ['string', 'null'] },
      date: {
        type: ['string', 'null'],
        description: 'Document date in ISO 8601 format (YYYY-MM-DD)',
      },
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: {
              type: 'string',
              enum: ['vendor', 'client', 'author', 'recipient', 'party', 'other'],
            },
            role_detail: { type: ['string', 'null'] },
          },
          required: ['name', 'role'],
        },
        description: 'Named entities found in the document',
      },
      monetary_values: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'What this amount represents' },
            stated_value: { type: 'number', description: 'Value as stated in document' },
            calculated_value: {
              type: ['number', 'null'],
              description: 'Independently calculated value (for validation)',
            },
            currency: { type: 'string', default: 'USD' },
            conflict_detected: {
              type: 'boolean',
              description: 'True if stated and calculated values differ',
            },
          },
          required: ['label', 'stated_value', 'conflict_detected'],
        },
      },
      key_dates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            date: { type: 'string', description: 'ISO 8601 date' },
          },
          required: ['label', 'date'],
        },
      },
      field_confidence: {
        type: 'object',
        description: 'Confidence scores (0-1) for each extracted field',
        additionalProperties: { type: 'number', minimum: 0, maximum: 1 },
      },
      extraction_notes: {
        type: ['string', 'null'],
        description: 'Notes about extraction quality, ambiguities, or missing information',
      },
    },
    required: ['document_id', 'document_type', 'field_confidence'],
  },
};

/**
 * Schema for batch processing results — used with custom_id for correlation (Task 4.5)
 */
export const batchResultSchema = {
  type: 'object',
  properties: {
    custom_id: { type: 'string', description: 'Matches the batch request custom_id' },
    document_id: { type: 'string' },
    status: {
      type: 'string',
      enum: ['success', 'partial', 'failed'],
    },
    extraction: {
      type: ['object', 'null'],
      description: 'The extraction result (null if failed)',
    },
    error: {
      type: ['object', 'null'],
      properties: {
        errorCategory: { type: 'string' },
        isRetryable: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  },
  required: ['custom_id', 'document_id', 'status'],
};
