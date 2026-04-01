/**
 * Mock MCP Tool Implementations for Multi-Agent Research System (Scenario 3)
 *
 * These tools simulate research capabilities:
 * - web_search: Search the web for information on a topic
 * - analyze_document: Analyze a document and extract key findings
 * - verify_fact: Quick fact verification (scoped cross-role tool)
 *
 * Designed to demonstrate tool distribution patterns (Task 2.3):
 * - web_search: assigned to search subagent
 * - analyze_document: assigned to document analysis subagent
 * - verify_fact: scoped cross-role tool for synthesis subagent
 */

// ─── Mock Research Data ──────────────────────────────────────────────────────

const searchResults = {
  'AI creative industries': [
    {
      title: 'AI Transforms Visual Arts: A 2025 Analysis',
      url: 'https://example.com/ai-visual-arts',
      snippet: 'Machine learning models are revolutionizing digital art creation...',
      publishedDate: '2025-01-15',
      source: 'TechReview',
    },
    {
      title: 'The Impact of AI on Music Production',
      url: 'https://example.com/ai-music',
      snippet: 'AI-powered tools are changing how musicians compose and produce...',
      publishedDate: '2025-02-20',
      source: 'MusicTech Weekly',
    },
    {
      title: 'AI in Film Production: From Script to Screen',
      url: 'https://example.com/ai-film',
      snippet: 'Studios are adopting AI tools for everything from scriptwriting to VFX...',
      publishedDate: '2025-03-01',
      source: 'Entertainment Tech',
    },
  ],
  'renewable energy 2025': [
    {
      title: 'Solar Energy Reaches Record Efficiency',
      url: 'https://example.com/solar-2025',
      snippet: 'New perovskite cells achieve 33.7% efficiency in lab tests...',
      publishedDate: '2025-01-10',
      source: 'Energy Journal',
    },
    {
      title: 'Wind Power Investment Trends',
      url: 'https://example.com/wind-investment',
      snippet: 'Global wind power investment reached $180B in 2024...',
      publishedDate: '2025-02-05',
      source: 'Clean Energy Report',
    },
  ],
};

const documents = {
  'doc-001': {
    title: 'State of AI in Creative Industries 2025',
    author: 'Research Institute',
    publishedDate: '2025-02-15',
    findings: [
      {
        claim: 'AI art tools market grew 47% year-over-year in 2024',
        evidence: 'Based on market analysis of 50 major AI art platforms',
        confidence: 'high',
        page: 12,
      },
      {
        claim: 'AI-assisted music production reduced average production time by 35%',
        evidence: 'Survey of 200 music producers across 15 countries',
        confidence: 'medium',
        page: 28,
      },
      {
        claim: '60% of professional writers have used AI tools at least once',
        evidence: 'Annual survey of Writers Guild members',
        confidence: 'high',
        page: 45,
      },
    ],
  },
  'doc-002': {
    title: 'Economic Impact of AI on Entertainment',
    author: 'Economic Research Group',
    publishedDate: '2025-01-30',
    findings: [
      {
        claim: 'AI art tools market grew 52% year-over-year in 2024',
        evidence: 'Analysis of revenue data from 75 AI art platforms',
        confidence: 'high',
        page: 8,
      },
      {
        claim: 'Studios using AI VFX tools saved an average of $2.3M per production',
        evidence: 'Case study of 12 major film productions in 2024',
        confidence: 'medium',
        page: 22,
      },
    ],
  },
};

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const researchToolDefinitions = [
  {
    name: 'web_search',
    description:
      'Search the web for information on a given topic. Returns a list of search results ' +
      'with titles, URLs, snippets, publication dates, and source names. Use specific, ' +
      'targeted queries for best results. Returns up to 10 results per query. ' +
      'For broad topics, run multiple searches with different angle-specific queries ' +
      'rather than one generic search.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — be specific and targeted',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyze_document',
    description:
      'Analyze a document by its ID and extract structured findings. Each finding includes ' +
      'a claim, supporting evidence, confidence level (high/medium/low), and page reference. ' +
      'Use this for in-depth analysis of specific documents found via web_search. ' +
      'Accepts document IDs in the format doc-XXX.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Document identifier (format: doc-XXX)',
        },
        focus_areas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific aspects to focus the analysis on',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'verify_fact',
    description:
      'Quickly verify a specific factual claim (dates, names, statistics). Returns ' +
      'verification status (confirmed/disputed/unverifiable) with source attribution. ' +
      'This is a lightweight tool designed for simple fact-checks during synthesis — ' +
      'for complex verification requiring deep research, delegate to the coordinator ' +
      'to invoke the web search subagent instead.',
    input_schema: {
      type: 'object',
      properties: {
        claim: {
          type: 'string',
          description: 'The specific factual claim to verify',
        },
        context: {
          type: 'string',
          description: 'Additional context about where this claim appeared',
        },
      },
      required: ['claim'],
    },
  },
];

// ─── Tool Executor ───────────────────────────────────────────────────────────

export function executeResearchTool(toolName, toolInput) {
  switch (toolName) {
    case 'web_search':
      return handleWebSearch(toolInput);
    case 'analyze_document':
      return handleAnalyzeDocument(toolInput);
    case 'verify_fact':
      return handleVerifyFact(toolInput);
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

function handleWebSearch({ query, max_results = 5 }) {
  // Simulate timeout (5% chance)
  if (Math.random() < 0.05) {
    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'transient',
        isRetryable: true,
        message: 'Search service timed out after 30s',
        attempted_query: query,
        partial_results: [],
        alternative_approaches: [
          'Retry with a more specific query',
          'Try breaking the query into sub-queries',
        ],
      }),
    };
  }

  // Find matching results by keyword overlap
  const queryLower = query.toLowerCase();
  let results = [];
  for (const [key, value] of Object.entries(searchResults)) {
    if (queryLower.includes(key.toLowerCase()) || key.toLowerCase().includes(queryLower)) {
      results = value;
      break;
    }
  }

  // Return empty results (valid, not an error)
  if (results.length === 0) {
    return {
      content: JSON.stringify({
        query,
        results: [],
        totalResults: 0,
        message: 'No results found for this query',
      }),
    };
  }

  return {
    content: JSON.stringify({
      query,
      results: results.slice(0, max_results),
      totalResults: results.length,
    }),
  };
}

function handleAnalyzeDocument({ document_id, focus_areas }) {
  const doc = documents[document_id];
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

  let findings = doc.findings;
  if (focus_areas && focus_areas.length > 0) {
    findings = findings.filter((f) =>
      focus_areas.some((area) => f.claim.toLowerCase().includes(area.toLowerCase()))
    );
  }

  return {
    content: JSON.stringify({
      documentId: document_id,
      title: doc.title,
      author: doc.author,
      publishedDate: doc.publishedDate,
      findings: findings.map((f) => ({
        ...f,
        sourceDocument: doc.title,
        sourceUrl: `https://example.com/docs/${document_id}`,
      })),
    }),
  };
}

function handleVerifyFact({ claim, context }) {
  // Simple mock verification based on known data
  const knownFacts = [
    { pattern: /47%/, status: 'confirmed', source: 'Research Institute report, p.12' },
    { pattern: /52%/, status: 'confirmed', source: 'Economic Research Group report, p.8' },
    { pattern: /35%/, status: 'confirmed', source: 'Producer survey data' },
    { pattern: /60%/, status: 'confirmed', source: 'Writers Guild annual survey' },
    { pattern: /\$2\.3M/, status: 'confirmed', source: 'Film production case study' },
  ];

  for (const fact of knownFacts) {
    if (fact.pattern.test(claim)) {
      return {
        content: JSON.stringify({
          claim,
          verificationStatus: fact.status,
          source: fact.source,
          verifiedAt: new Date().toISOString(),
        }),
      };
    }
  }

  return {
    content: JSON.stringify({
      claim,
      verificationStatus: 'unverifiable',
      source: null,
      note: 'Could not verify this claim with available data. Consider delegating to web search for deeper investigation.',
      verifiedAt: new Date().toISOString(),
    }),
  };
}
