/**
 * Scenario 4 (Dev Productivity) — MCP Server for Code Analysis
 *
 * Exam relevance: Task 2.4 (MCP integration in agent code)
 *
 * EXAM KEY CONCEPT:
 *   Use createSdkMcpServer() to define domain-specific MCP servers.
 *   Each server bundles related tools for a capability domain.
 *   The agent discovers tools as mcp__{serverName}__{toolName}.
 *
 * This module creates a dev productivity MCP server with:
 * - analyze_complexity: cyclomatic complexity analysis
 * - find_unused_exports: dead code detection
 * - suggest_refactoring: actionable refactoring suggestions
 *
 * The server is exported for use in query() options.mcpServers.
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Tool Definitions ─────────────────────────────────────────────────────

export const analyzeComplexityTool = tool(
  'analyze_complexity',
  'Analyze cyclomatic complexity of a source file or directory. Returns ' +
  'per-function scores, file average, and flags functions above threshold ' +
  '(default: 10). Use to identify overly complex functions for refactoring.',
  {
    path: z.string().describe('File or directory path relative to project root'),
    threshold: z.number().optional().describe('Complexity threshold for flagging (default: 10)'),
  },
  async ({ path, threshold = 10 }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        path,
        averageComplexity: 5.3,
        functions: [
          { name: 'processRequest', complexity: 12, flagged: true },
          { name: 'validateInput', complexity: 8, flagged: false },
          { name: 'formatResponse', complexity: 3, flagged: false },
        ],
        threshold,
        flaggedCount: 1,
        recommendation: 'processRequest exceeds complexity threshold. Consider extracting conditional branches.',
      }) }],
    };
  },
);

export const findUnusedExportsTool = tool(
  'find_unused_exports',
  'Find exported symbols (functions, classes, constants) never imported by ' +
  'any other file. Returns symbol name, file path, and export type. ' +
  'Useful for identifying dead code that can be safely removed.',
  {
    directory: z.string().optional().describe('Directory to scan (default: "src/")'),
    include_tests: z.boolean().optional().describe('Include test files in import analysis'),
  },
  async ({ directory = 'src/', include_tests = false }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        directory,
        unusedExports: [
          { symbol: 'legacyFormat', file: 'src/utils.js', type: 'function' },
          { symbol: 'DEBUG_MODE', file: 'src/config.js', type: 'constant' },
          { symbol: 'OldApiClient', file: 'src/api.js', type: 'class' },
        ],
        totalExports: 45,
        unusedCount: 3,
        recommendation: 'Consider removing unused exports to reduce bundle size.',
      }) }],
    };
  },
);

export const suggestRefactoringTool = tool(
  'suggest_refactoring',
  'Analyze a file for refactoring opportunities: long functions, deeply ' +
  'nested conditionals, duplicated logic, and parameter bloat. Returns ' +
  'specific, actionable suggestions with location and impact rating.',
  {
    file_path: z.string().describe('Source file path relative to project root'),
    focus: z.enum(['complexity', 'duplication', 'naming', 'all']).optional()
      .describe('Focus area for suggestions (default: "all")'),
  },
  async ({ file_path, focus = 'all' }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        file: file_path,
        suggestions: [
          {
            type: 'extract_function',
            location: 'line 45-78',
            description: 'Extract validation logic into a separate validateOrder function',
            impact: 'high',
          },
          {
            type: 'reduce_nesting',
            location: 'line 92-130',
            description: 'Use early returns to reduce nesting depth from 4 to 2',
            impact: 'medium',
          },
        ],
        focusArea: focus,
      }) }],
    };
  },
);

// ─── Bundled MCP Server ───────────────────────────────────────────────────
// EXAM KEY CONCEPT: createSdkMcpServer() bundles related tools into a
// namespaced MCP server. Tools become mcp__devtools__analyze_complexity, etc.

export const devtoolsServer = createSdkMcpServer({
  name: 'devtools',
  version: '1.0.0',
  tools: [analyzeComplexityTool, findUnusedExportsTool, suggestRefactoringTool],
});

// ─── Demonstration ────────────────────────────────────────────────────────

async function demonstrate(): Promise<void> {
  console.log('Scenario 4: Dev Productivity MCP Server\n');

  console.log('MCP Server: devtools (v1.0.0)');
  console.log('Tools:');
  console.log('  - mcp__devtools__analyze_complexity');
  console.log('  - mcp__devtools__find_unused_exports');
  console.log('  - mcp__devtools__suggest_refactoring\n');

  // Run agent with the devtools MCP server
  for await (const message of query({
    prompt:
      'Analyze the complexity of src/index.js, find any unused exports in ' +
      'the src/ directory, and suggest refactoring improvements for src/index.js.',
    options: {
      system:
        'You are a code quality assistant. Use the available tools to analyze ' +
        'the codebase and provide actionable improvement recommendations.',
      mcpServers: [devtoolsServer],
      maxTurns: 8,
      hooks: {
        postToolUse: async ({ toolName, toolInput }: { toolName: string; toolInput: unknown }) => {
          console.log(`  Tool: ${toolName}(${JSON.stringify(toolInput)})`);
        },
      },
    } as any,
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      console.log(`\n  Result: ${message.result.substring(0, 300)}...`);
    }
  }

  console.log(`
  EXAM KEY CONCEPT:
  - createSdkMcpServer() bundles domain tools into a namespace
  - Pass via mcpServers option in query()
  - Agent auto-discovers tools from all connected servers
  - Multiple servers can coexist (devtools + csr + research)
  - Tool names: mcp__{serverName}__{toolName} (no collisions)
  `);
}

// Run if executed directly
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;
if (isDirectExecution) {
  demonstrate().catch(console.error);
}
