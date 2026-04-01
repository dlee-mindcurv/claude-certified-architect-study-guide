/**
 * Scenario 4 (Dev Productivity) — MCP Client for Code Analysis
 *
 * Exam relevance: Task 2.4 (MCP client integration in agent code)
 *
 * This module demonstrates how an agent SDK connects to an MCP server
 * that provides code analysis tools. The pattern is:
 *
 * 1. Initialize MCP client at startup
 * 2. Connect to the code analysis server via stdio transport
 * 3. Discover available tools dynamically
 * 4. Convert tool definitions to Anthropic API format
 * 5. Provide a unified tool executor that routes calls to MCP
 *
 * In production, you would use the official MCP client SDK. This module
 * uses a mock implementation that demonstrates the same API surface
 * and integration patterns.
 */

import {
  createErrorResponse,
  createSuccessResponse,
  ERROR_CATEGORIES,
} from '../../../../shared/schemas/error-response.js';

// ─── Mock Code Analysis MCP Server ─────────────────────────────────────────
// Simulates an MCP server that analyzes code quality and dependencies.

const codeAnalysisServer = {
  name: 'code-analysis',
  transport: 'stdio',

  // tools/list response
  tools: [
    {
      name: 'analyze_complexity',
      description:
        'Analyze the cyclomatic complexity of a source file or directory. Returns ' +
        'per-function complexity scores, the file average, and flags functions above ' +
        'the threshold (default: 10). Accepts relative paths from the project root. ' +
        'Use this to identify overly complex functions that should be refactored.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'File or directory path relative to project root (e.g., "src/utils.js" or "src/")',
          },
          threshold: {
            type: 'number',
            description: 'Complexity threshold for flagging (default: 10)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'find_unused_exports',
      description:
        'Find exported symbols (functions, classes, constants) that are never imported ' +
        'by any other file in the project. Returns the symbol name, file path, and ' +
        'export type. Useful for identifying dead code that can be safely removed.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Directory to scan (default: "src/")',
          },
          include_tests: {
            type: 'boolean',
            description: 'Include test files in import analysis (default: false)',
          },
        },
      },
    },
    {
      name: 'suggest_refactoring',
      description:
        'Analyze a file for common refactoring opportunities: long functions, ' +
        'deeply nested conditionals, duplicated logic, and parameter bloat. ' +
        'Returns specific, actionable suggestions with before/after examples.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Source file path relative to project root',
          },
          focus: {
            type: 'string',
            enum: ['complexity', 'duplication', 'naming', 'all'],
            description: 'Focus area for refactoring suggestions (default: "all")',
          },
        },
        required: ['file_path'],
      },
    },
  ],

  // resources/list response
  resources: [
    {
      uri: 'project://file-tree',
      name: 'Project File Tree',
      description: 'Complete directory structure of the project',
      mimeType: 'application/json',
    },
    {
      uri: 'project://quality-report',
      name: 'Quality Report',
      description: 'Latest code quality metrics for the entire project',
      mimeType: 'application/json',
    },
  ],
};

// ─── Mock MCP Client ───────────────────────────────────────────────────────

class DevToolsMcpClient {
  constructor() {
    this.connected = false;
    this.server = null;
  }

  /**
   * Connect to the code analysis MCP server.
   *
   * In production:
   * - Spawns the server as a child process
   * - Establishes MCP protocol handshake over stdin/stdout
   * - Negotiates capabilities
   *
   * @param {string} transport - 'stdio' or 'sse'
   * @param {Object} config - Server configuration
   */
  async connect(transport, config) {
    if (transport !== 'stdio') {
      throw new Error(`Unsupported transport: ${transport}. Use 'stdio' or 'sse'.`);
    }

    console.log(`[MCP] Connecting to ${config.command} ${config.args.join(' ')}`);
    console.log(`[MCP] Environment: ${JSON.stringify(config.env || {})}`);

    // Simulate connection and handshake
    this.server = codeAnalysisServer;
    this.connected = true;

    console.log('[MCP] Connection established');
    console.log(`[MCP] Server: ${this.server.name}`);
    console.log(`[MCP] Tools: ${this.server.tools.length}`);
    console.log(`[MCP] Resources: ${this.server.resources.length}`);

    return this;
  }

  /**
   * List available tools from the connected server.
   *
   * MCP protocol: tools/list
   * Returns tool definitions in MCP format (inputSchema, not input_schema).
   */
  async listTools() {
    this._assertConnected();
    return { tools: this.server.tools };
  }

  /**
   * Call a tool on the connected server.
   *
   * MCP protocol: tools/call
   * Returns tool result in MCP format (content array or isError).
   */
  async callTool(name, args) {
    this._assertConnected();

    // Validate tool exists
    const tool = this.server.tools.find((t) => t.name === name);
    if (!tool) {
      return createErrorResponse({
        errorCategory: ERROR_CATEGORIES.VALIDATION,
        isRetryable: false,
        message: `Unknown tool: ${name}. Available: ${this.server.tools.map((t) => t.name).join(', ')}`,
      });
    }

    // Mock implementations
    return this._executeTool(name, args);
  }

  /**
   * List available resources.
   *
   * MCP protocol: resources/list
   */
  async listResources() {
    this._assertConnected();
    return { resources: this.server.resources };
  }

  /**
   * Read a resource by URI.
   *
   * MCP protocol: resources/read
   */
  async readResource(uri) {
    this._assertConnected();

    const resource = this.server.resources.find((r) => r.uri === uri);
    if (!resource) {
      return createErrorResponse({
        errorCategory: ERROR_CATEGORIES.VALIDATION,
        isRetryable: false,
        message: `Resource not found: ${uri}`,
      });
    }

    // Mock resource content
    if (uri === 'project://file-tree') {
      return createSuccessResponse({
        uri,
        mimeType: resource.mimeType,
        content: {
          root: 'my-project',
          directories: ['src', 'tests', 'config'],
          files: {
            'src/': ['index.js', 'utils.js', 'api.js', 'middleware.js'],
            'tests/': ['index.test.js', 'utils.test.js'],
            'config/': ['default.json', 'production.json'],
          },
        },
      });
    }

    if (uri === 'project://quality-report') {
      return createSuccessResponse({
        uri,
        mimeType: resource.mimeType,
        content: {
          timestamp: new Date().toISOString(),
          overallScore: 82,
          metrics: {
            complexity: { average: 5.3, max: 18, threshold: 10 },
            coverage: { line: 74, branch: 62 },
            unusedExports: 4,
            duplicateBlocks: 7,
          },
        },
      });
    }

    return createSuccessResponse({ uri, content: null });
  }

  /**
   * Convert MCP tool definitions to Anthropic API format.
   *
   * MCP uses 'inputSchema'; the Anthropic API uses 'input_schema'.
   * This conversion is necessary when passing discovered tools to
   * the Claude API.
   */
  toAnthropicFormat(mcpTools) {
    return mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  // ── Internal ───────────────────────────────────────────────────────────

  _assertConnected() {
    if (!this.connected) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
  }

  _executeTool(name, args) {
    switch (name) {
      case 'analyze_complexity':
        return createSuccessResponse({
          path: args.path,
          averageComplexity: 5.3,
          functions: [
            { name: 'processRequest', complexity: 12, flagged: true },
            { name: 'validateInput', complexity: 8, flagged: false },
            { name: 'formatResponse', complexity: 3, flagged: false },
          ],
          threshold: args.threshold || 10,
          flaggedCount: 1,
          recommendation: 'processRequest exceeds complexity threshold. Consider extracting conditional branches.',
        });

      case 'find_unused_exports':
        return createSuccessResponse({
          directory: args.directory || 'src/',
          unusedExports: [
            { symbol: 'legacyFormat', file: 'src/utils.js', type: 'function' },
            { symbol: 'DEBUG_MODE', file: 'src/config.js', type: 'constant' },
            { symbol: 'OldApiClient', file: 'src/api.js', type: 'class' },
          ],
          totalExports: 45,
          unusedCount: 3,
          recommendation: 'Consider removing unused exports to reduce bundle size.',
        });

      case 'suggest_refactoring':
        return createSuccessResponse({
          file: args.file_path,
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
          focusArea: args.focus || 'all',
        });

      default:
        return createErrorResponse({
          errorCategory: ERROR_CATEGORIES.VALIDATION,
          isRetryable: false,
          message: `Unknown tool: ${name}`,
        });
    }
  }
}

// ─── Integration Helper ────────────────────────────────────────────────────
// Creates a fully configured MCP client for the dev productivity scenario.

/**
 * Initialize the MCP client for the developer productivity agent.
 *
 * This is the entry point that an agent would call at startup:
 * 1. Connect to the code analysis server
 * 2. Discover available tools
 * 3. Load project context from resources
 * 4. Return everything the agent needs to start
 *
 * @returns {Object} { tools, executeTool, projectContext }
 */
export async function initializeDevToolsMcp() {
  const mcpClient = new DevToolsMcpClient();

  // Step 1: Connect
  await mcpClient.connect('stdio', {
    command: 'node',
    args: ['./tools/code-analysis-server.js'],
    env: { PROJECT_ROOT: process.cwd() },
  });

  // Step 2: Discover tools
  const { tools: mcpTools } = await mcpClient.listTools();
  const anthropicTools = mcpClient.toAnthropicFormat(mcpTools);

  // Step 3: Load project context
  const fileTree = await mcpClient.readResource('project://file-tree');
  const qualityReport = await mcpClient.readResource('project://quality-report');

  const projectContext = {
    fileTree: JSON.parse(fileTree.content),
    qualityReport: JSON.parse(qualityReport.content),
  };

  // Step 4: Create tool executor
  async function executeTool(name, input) {
    return mcpClient.callTool(name, input);
  }

  return {
    tools: anthropicTools,
    executeTool,
    projectContext,
    mcpClient, // Expose for resource reading during the session
  };
}

// ─── Demonstration ─────────────────────────────────────────────────────────

export async function demonstrateMcpClient() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Scenario 4: Dev Productivity MCP Client                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const { tools, executeTool, projectContext } = await initializeDevToolsMcp();

  console.log(`\nDiscovered ${tools.length} tools:`);
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description.substring(0, 60)}...`);
  }

  console.log('\nProject context loaded:');
  console.log(`  File tree root: ${projectContext.fileTree.root}`);
  console.log(`  Quality score: ${projectContext.qualityReport.content.overallScore}/100`);

  console.log('\nTesting tool calls:\n');

  // Test each tool
  const complexityResult = await executeTool('analyze_complexity', {
    path: 'src/index.js',
  });
  console.log(
    `  analyze_complexity: ${JSON.parse(complexityResult.content).flaggedCount} flagged functions`
  );

  const unusedResult = await executeTool('find_unused_exports', {
    directory: 'src/',
  });
  console.log(
    `  find_unused_exports: ${JSON.parse(unusedResult.content).unusedCount} unused exports`
  );

  const refactorResult = await executeTool('suggest_refactoring', {
    file_path: 'src/index.js',
    focus: 'complexity',
  });
  console.log(
    `  suggest_refactoring: ${JSON.parse(refactorResult.content).suggestions.length} suggestions`
  );
}

// Run if executed directly
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;
if (isDirectExecution) {
  demonstrateMcpClient().catch(console.error);
}
