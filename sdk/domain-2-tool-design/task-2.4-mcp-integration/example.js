/**
 * Task 2.4 — MCP Client Integration Reference
 *
 * Exam relevance:
 * - MCP is the standard protocol for tool integration
 * - SDK code configures MCP client connections programmatically
 * - Tools are discovered dynamically from MCP servers at startup
 * - MCP resources provide content catalogs for agent context
 *
 * This is a REFERENCE implementation showing the conceptual pattern for
 * MCP client integration in SDK agent code. It uses mock implementations
 * since a real MCP server is not included in this project, but the
 * pattern and API surface match the real MCP client SDK.
 *
 * The key concepts demonstrated:
 * 1. Connecting to MCP servers via stdio transport
 * 2. Discovering tools dynamically from servers
 * 3. Merging MCP tools with local tool definitions
 * 4. Routing tool calls to the correct handler
 * 5. Reading MCP resources for agent context
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Mock MCP Client ───────────────────────────────────────────────────────
// Simulates an MCP client that connects to servers and discovers tools.
// In production, use the official MCP client SDK.

class MockMcpClient {
  constructor() {
    this.servers = new Map();
    this.allTools = [];
  }

  /**
   * Connect to an MCP server via stdio transport.
   *
   * In production, this spawns the server as a subprocess and establishes
   * communication over stdin/stdout using the MCP protocol.
   */
  async connect(transport, config) {
    const serverName = config.args?.[0] || 'unknown-server';
    console.log(`  [MCP] Connecting to server via ${transport}: ${serverName}`);

    // Simulate server startup and handshake
    const server = {
      name: serverName,
      transport,
      config,
      connected: true,
      tools: [],
      resources: [],
    };

    // Simulate tool discovery (tools/list)
    server.tools = await this._discoverTools(serverName);
    server.resources = await this._discoverResources(serverName);

    this.servers.set(serverName, server);
    this.allTools.push(...server.tools);

    console.log(
      `  [MCP] Connected. Discovered ${server.tools.length} tools, ` +
        `${server.resources.length} resources`
    );

    return server;
  }

  /**
   * Discover tools from a connected MCP server.
   *
   * Equivalent to: mcpClient.request('tools/list')
   */
  async _discoverTools(serverName) {
    // Mock: return tools based on server name
    if (serverName.includes('code-analysis')) {
      return [
        {
          name: 'analyze_code_quality',
          description:
            'Analyze code quality for a file or directory. Returns metrics including ' +
            'cyclomatic complexity, code duplication, test coverage, and lint issues. ' +
            'Accepts a file path or directory path relative to project root.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File or directory path' },
              include_metrics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Metrics to include: complexity, duplication, coverage, lint',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'find_dependencies',
          description:
            'Find all import/require dependencies for a file. Returns a dependency ' +
            'graph showing direct and transitive dependencies. Useful for understanding ' +
            'impact of changes.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Source file path' },
              depth: {
                type: 'number',
                description: 'Maximum depth for transitive dependencies (default: 3)',
              },
            },
            required: ['file_path'],
          },
        },
      ];
    }

    return [];
  }

  /**
   * Discover resources from a connected MCP server.
   *
   * Equivalent to: mcpClient.request('resources/list')
   */
  async _discoverResources(serverName) {
    if (serverName.includes('code-analysis')) {
      return [
        {
          uri: 'project://file-tree',
          name: 'Project File Tree',
          description: 'Complete file tree of the project',
          mimeType: 'application/json',
        },
        {
          uri: 'project://dependency-graph',
          name: 'Dependency Graph',
          description: 'Full dependency graph for the project',
          mimeType: 'application/json',
        },
      ];
    }
    return [];
  }

  /**
   * Execute a tool call via MCP.
   *
   * Equivalent to: mcpClient.request('tools/call', { name, arguments })
   */
  async callTool(name, args) {
    console.log(`  [MCP] Calling tool: ${name}(${JSON.stringify(args).substring(0, 60)})`);

    // Mock implementation — in production, this sends the call to the MCP server
    if (name === 'analyze_code_quality') {
      return {
        content: JSON.stringify({
          path: args.path,
          metrics: {
            complexity: { average: 4.2, max: 12, files_above_threshold: 2 },
            duplication: { percentage: 3.1, duplicate_blocks: 5 },
            coverage: { line: 78.5, branch: 65.2 },
            lint: { errors: 0, warnings: 8 },
          },
          summary: 'Code quality is generally good. Two files have high complexity.',
        }),
      };
    }

    if (name === 'find_dependencies') {
      return {
        content: JSON.stringify({
          file: args.file_path,
          directDependencies: ['./utils.js', './config.js', 'express'],
          transitiveDependencies: {
            './utils.js': ['lodash', './helpers.js'],
            './config.js': ['dotenv'],
          },
          totalDependencies: 6,
        }),
      };
    }

    return {
      isError: true,
      content: JSON.stringify({
        errorCategory: 'validation',
        isRetryable: false,
        message: `Unknown MCP tool: ${name}`,
      }),
    };
  }

  /**
   * Read a resource from an MCP server.
   *
   * Equivalent to: mcpClient.request('resources/read', { uri })
   */
  async readResource(uri) {
    console.log(`  [MCP] Reading resource: ${uri}`);

    if (uri === 'project://file-tree') {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              root: 'my-project',
              children: [
                { name: 'src', type: 'directory', children: ['index.js', 'utils.js', 'config.js'] },
                { name: 'tests', type: 'directory', children: ['index.test.js'] },
                { name: 'package.json', type: 'file' },
              ],
            }),
          },
        ],
      };
    }

    return { contents: [] };
  }

  /**
   * Get all discovered tools from all connected servers.
   */
  getDiscoveredTools() {
    return this.allTools;
  }

  /**
   * Convert MCP tool format to Anthropic API tool format.
   *
   * MCP uses 'inputSchema'; the Anthropic API uses 'input_schema'.
   */
  toAnthropicToolFormat(mcpTools) {
    return mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }
}

// ─── Agent with MCP Integration ────────────────────────────────────────────

async function runAgentWithMcp() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Task 2.4: MCP Client Integration Reference              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Initialize MCP Client and Connect to Servers ──────────────
  console.log('Step 1: Connect to MCP servers\n');

  const mcpClient = new MockMcpClient();

  // Connect to the code analysis MCP server
  await mcpClient.connect('stdio', {
    command: 'node',
    args: ['./tools/code-analysis-server.js'],
    env: { PROJECT_ROOT: '.' },
  });

  // ── Step 2: Discover Tools ────────────────────────────────────────────
  console.log('\nStep 2: Discover tools from MCP servers\n');

  const mcpTools = mcpClient.getDiscoveredTools();
  console.log(`  Discovered ${mcpTools.length} MCP tools:`);
  for (const tool of mcpTools) {
    console.log(`    - ${tool.name}: ${tool.description.substring(0, 60)}...`);
  }

  // Convert to Anthropic API format
  const anthropicTools = mcpClient.toAnthropicToolFormat(mcpTools);

  // ── Step 3: Optionally Read Resources for Context ─────────────────────
  console.log('\nStep 3: Read MCP resources for agent context\n');

  const fileTree = await mcpClient.readResource('project://file-tree');
  console.log(`  File tree: ${JSON.stringify(JSON.parse(fileTree.contents[0].text).root)}`);

  // ── Step 4: Run Agent with MCP Tools ──────────────────────────────────
  console.log('\nStep 4: Run agent with discovered MCP tools\n');

  const systemPrompt =
    'You are a code analysis assistant. Use the available tools to analyze ' +
    'code quality and dependencies. Provide actionable recommendations.\n\n' +
    `Project context:\n${fileTree.contents[0].text}`;

  const messages = [
    {
      role: 'user',
      content: 'Analyze the code quality of src/index.js and show its dependencies.',
    },
  ];

  let turnCount = 0;
  const MAX_TURNS = 10;

  while (true) {
    if (++turnCount > MAX_TURNS) break;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: anthropicTools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      console.log(`  Agent response: ${text.substring(0, 200)}...`);
      break;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const results = [];

      for (const block of response.content.filter((b) => b.type === 'tool_use')) {
        // Route tool call to MCP server
        const result = await mcpClient.callTool(block.name, block.input);

        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: results });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('MCP Integration Pattern Summary');
  console.log('='.repeat(60));
  console.log(`
  1. CONNECT: Initialize MCP client and connect to servers at startup
     mcpClient.connect('stdio', { command: 'node', args: ['./server.js'] })

  2. DISCOVER: Get available tools from all connected servers
     mcpClient.request('tools/list') → tool definitions

  3. CONVERT: Transform MCP tool format to Anthropic API format
     MCP: inputSchema → Anthropic: input_schema

  4. CONTEXT: Read MCP resources for additional agent context
     mcpClient.request('resources/read', { uri: '...' })

  5. ROUTE: During the agentic loop, route tool calls to MCP servers
     mcpClient.request('tools/call', { name, arguments })

  Key exam concepts:
  - MCP clients connect to servers via stdio or SSE transport
  - Tools are discovered dynamically, not hardcoded
  - MCP resources provide passive content (docs, file trees)
  - Tool format conversion may be needed (inputSchema → input_schema)
  - Handle MCP server failures gracefully (reduced capabilities)
  `);
}

runAgentWithMcp().catch(console.error);
