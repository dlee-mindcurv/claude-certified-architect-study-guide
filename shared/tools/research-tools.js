/**
 * Mock Research Tools for Scenario 3 — Using @anthropic-ai/claude-agent-sdk
 *
 * Exports individual tool() definitions for scoped distribution to subagents:
 *   - webSearchTool: assigned to search subagent
 *   - analyzeDocumentTool: assigned to analysis subagent
 *   - verifyFactTool: cross-role tool for synthesis subagent
 *   - researchServer: bundled MCP server with all tools
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Mock Data ──────────────────────────────────────────────────────────────

const searchResults = {
  'AI creative industries': [
    { title: 'AI Transforms Visual Arts: A 2025 Analysis', url: 'https://example.com/ai-visual-arts',
      snippet: 'ML models are revolutionizing digital art creation...', publishedDate: '2025-01-15', source: 'TechReview' },
    { title: 'The Impact of AI on Music Production', url: 'https://example.com/ai-music',
      snippet: 'AI-powered tools change how musicians compose...', publishedDate: '2025-02-20', source: 'MusicTech Weekly' },
    { title: 'AI in Film: From Script to Screen', url: 'https://example.com/ai-film',
      snippet: 'Studios adopting AI for scriptwriting to VFX...', publishedDate: '2025-03-01', source: 'Entertainment Tech' },
  ],
  'renewable energy 2025': [
    { title: 'Solar Energy Reaches Record Efficiency', url: 'https://example.com/solar-2025',
      snippet: 'Perovskite cells achieve 33.7% efficiency...', publishedDate: '2025-01-10', source: 'Energy Journal' },
  ],
};

const documents = {
  'doc-001': {
    title: 'State of AI in Creative Industries 2025', author: 'Research Institute', publishedDate: '2025-02-15',
    findings: [
      { claim: 'AI art tools market grew 47% YoY in 2024', evidence: 'Market analysis of 50 platforms', confidence: 'high', page: 12 },
      { claim: 'AI-assisted music production reduced time by 35%', evidence: 'Survey of 200 producers', confidence: 'medium', page: 28 },
    ],
  },
  'doc-002': {
    title: 'Economic Impact of AI on Entertainment', author: 'Economic Research Group', publishedDate: '2025-01-30',
    findings: [
      { claim: 'AI art tools market grew 52% YoY in 2024', evidence: 'Revenue data from 75 platforms', confidence: 'high', page: 8 },
      { claim: 'Studios using AI VFX saved avg $2.3M per production', evidence: 'Case study of 12 films', confidence: 'medium', page: 22 },
    ],
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function err(category, message, isRetryable = false) {
  return { content: [{ type: 'text', text: JSON.stringify({ errorCategory: category, isRetryable, message }) }], isError: true };
}

// ─── Agent SDK tool() definitions ───────────────────────────────────────────

export const webSearchTool = tool(
  'web_search',
  'Search the web for information. Returns results with title, URL, snippet, date, source. ' +
  'Use specific queries. For broad topics, run multiple targeted searches.',
  {
    query: z.string().describe('Search query — be specific'),
    max_results: z.number().optional().describe('Max results (default 5, max 10)'),
  },
  async ({ query, max_results = 5 }) => {
    const queryLower = query.toLowerCase();
    let results = [];
    for (const [key, value] of Object.entries(searchResults)) {
      if (queryLower.includes(key.toLowerCase()) || key.toLowerCase().includes(queryLower)) {
        results = value;
        break;
      }
    }
    return ok({ query, results: results.slice(0, max_results), totalResults: results.length });
  },
);

export const analyzeDocumentTool = tool(
  'analyze_document',
  'Analyze a document by ID (doc-XXX). Returns structured findings with claim, ' +
  'evidence, confidence level, and page reference.',
  {
    document_id: z.string().describe('Document ID (format: doc-XXX)'),
    focus_areas: z.array(z.string()).optional().describe('Specific aspects to focus on'),
  },
  async ({ document_id, focus_areas }) => {
    const doc = documents[document_id];
    if (!doc) return err('validation', `Document not found: ${document_id}`);

    let findings = doc.findings;
    if (focus_areas?.length) {
      findings = findings.filter(f => focus_areas.some(a => f.claim.toLowerCase().includes(a.toLowerCase())));
    }
    return ok({
      documentId: document_id, title: doc.title, author: doc.author, publishedDate: doc.publishedDate,
      findings: findings.map(f => ({ ...f, sourceDocument: doc.title })),
    });
  },
);

export const verifyFactTool = tool(
  'verify_fact',
  'Quickly verify a factual claim (dates, stats). Returns confirmed/disputed/unverifiable ' +
  'with source. Lightweight — for complex verification, delegate to search subagent.',
  {
    claim: z.string().describe('The factual claim to verify'),
    context: z.string().optional().describe('Where this claim appeared'),
  },
  async ({ claim }) => {
    const knownFacts = [
      { pattern: /47%/, status: 'confirmed', source: 'Research Institute report, p.12' },
      { pattern: /52%/, status: 'confirmed', source: 'Economic Research Group report, p.8' },
      { pattern: /35%/, status: 'confirmed', source: 'Producer survey data' },
      { pattern: /\$2\.3M/, status: 'confirmed', source: 'Film production case study' },
    ];
    for (const f of knownFacts) {
      if (f.pattern.test(claim)) {
        return ok({ claim, verificationStatus: f.status, source: f.source, verifiedAt: new Date().toISOString() });
      }
    }
    return ok({ claim, verificationStatus: 'unverifiable', source: null, verifiedAt: new Date().toISOString() });
  },
);

// ─── Bundled MCP Server ─────────────────────────────────────────────────────

export const researchServer = createSdkMcpServer({
  name: 'research',
  version: '1.0.0',
  tools: [webSearchTool, analyzeDocumentTool, verifyFactTool],
});

// ─── Legacy exports (for raw API examples) ──────────────────────────────────

export const researchToolDefinitions = [
  { name: 'web_search', description: webSearchTool.description,
    input_schema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'number' } }, required: ['query'] } },
  { name: 'analyze_document', description: analyzeDocumentTool.description,
    input_schema: { type: 'object', properties: { document_id: { type: 'string' }, focus_areas: { type: 'array', items: { type: 'string' } } }, required: ['document_id'] } },
  { name: 'verify_fact', description: verifyFactTool.description,
    input_schema: { type: 'object', properties: { claim: { type: 'string' }, context: { type: 'string' } }, required: ['claim'] } },
];

export function executeResearchTool(toolName, toolInput) {
  const lookup = { web_search: webSearchTool, analyze_document: analyzeDocumentTool, verify_fact: verifyFactTool };
  const t = lookup[toolName];
  if (!t) return { isError: true, content: JSON.stringify({ errorCategory: 'validation', message: `Unknown: ${toolName}` }) };
  let result;
  t.handler(toolInput, {}).then(r => { result = r; });
  return { isError: result?.isError ?? false, content: result?.content?.[0]?.text ?? '{}' };
}
