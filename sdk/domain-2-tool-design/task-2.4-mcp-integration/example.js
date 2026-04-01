/**
 * Task 2.4 — MCP Integration with createSdkMcpServer
 *
 * Exam relevance:
 * - MCP is the standard protocol for tool integration
 * - createSdkMcpServer() bundles tool() definitions into an MCP server
 * - mcpServers option in query() connects servers to the agent
 * - Tools are auto-named: mcp__{serverName}__{toolName}
 *
 * EXAM KEY CONCEPT:
 *   The Agent SDK pattern for MCP:
 *   1. Define tools with tool() (name, description, schema, handler)
 *   2. Bundle into a server with createSdkMcpServer({ name, version, tools })
 *   3. Pass to query() via options.mcpServers
 *   4. Agent calls tools as mcp__{serverName}__{toolName}
 *
 * This example demonstrates:
 * 1. Creating a custom MCP server with tool()
 * 2. Passing it to query() via mcpServers option
 * 3. Agent discovering and using the tools automatically
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Step 1: Define tools with tool() ─────────────────────────────────────

const analyzeCodeQuality = tool(
  'analyze_code_quality',
  'Analyze code quality for a file or directory. Returns metrics: cyclomatic ' +
  'complexity, code duplication, test coverage, and lint issues. ' +
  'Accepts a file path relative to project root.',
  {
    path: z.string().describe('File or directory path relative to project root'),
    include_metrics: z.array(z.string()).optional()
      .describe('Metrics to include: complexity, duplication, coverage, lint'),
  },
  async ({ path, include_metrics }) => {
    // Mock implementation
    return {
      content: [{ type: 'text', text: JSON.stringify({
        path,
        metrics: {
          complexity: { average: 4.2, max: 12, filesAboveThreshold: 2 },
          duplication: { percentage: 3.1, duplicateBlocks: 5 },
          coverage: { line: 78.5, branch: 65.2 },
          lint: { errors: 0, warnings: 8 },
        },
        summary: 'Code quality is generally good. Two files have high complexity.',
      }) }],
    };
  },
);

const findDependencies = tool(
  'find_dependencies',
  'Find all import/require dependencies for a file. Returns a dependency ' +
  'graph showing direct and transitive dependencies. Useful for understanding ' +
  'the impact of changes.',
  {
    file_path: z.string().describe('Source file path relative to project root'),
    depth: z.number().optional().describe('Max depth for transitive deps (default: 3)'),
  },
  async ({ file_path, depth = 3 }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        file: file_path,
        directDependencies: ['./utils.js', './config.js', 'express'],
        transitiveDependencies: {
          './utils.js': ['lodash', './helpers.js'],
          './config.js': [],
        },
        totalDependencies: 5,
      }) }],
    };
  },
);

// ─── Step 2: Bundle into an MCP server ────────────────────────────────────
// EXAM KEY CONCEPT: createSdkMcpServer() wraps tool() definitions into
// an MCP-compatible server. Tools become mcp__code-analysis__analyze_code_quality.

const codeAnalysisServer = createSdkMcpServer({
  name: 'code-analysis',
  version: '1.0.0',
  tools: [analyzeCodeQuality, findDependencies],
});

// ─── Step 3: Run agent with mcpServers option ─────────────────────────────

async function main() {
  console.log('Task 2.4: MCP Integration with createSdkMcpServer\n');

  console.log('Step 1: Defined tools with tool()');
  console.log('  - analyze_code_quality');
  console.log('  - find_dependencies\n');

  console.log('Step 2: Bundled into createSdkMcpServer({ name: "code-analysis" })');
  console.log('  Tools become: mcp__code-analysis__analyze_code_quality');
  console.log('                mcp__code-analysis__find_dependencies\n');

  console.log('Step 3: Passing to query() via options.mcpServers\n');

  // EXAM KEY CONCEPT: mcpServers option connects MCP servers to the agent.
  // The agent discovers tools automatically from all connected servers.
  for await (const message of query({
    prompt:
      'Analyze the code quality of src/index.js and show its dependencies.',
    options: {
      system:
        'You are a code analysis assistant. Use the available tools to analyze ' +
        'code quality and dependencies. Provide actionable recommendations.',
      mcpServers: [codeAnalysisServer],   // Connect the MCP server
      maxTurns: 6,
      hooks: {
        postToolUse: async ({ toolName, toolInput, toolResult }) => {
          console.log(`  Tool call: ${toolName}`);
          console.log(`    Input: ${JSON.stringify(toolInput)}`);
        },
      },
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      console.log(`\n  Agent response: ${message.result.substring(0, 300)}...`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('MCP Integration Pattern (exam summary)');
  console.log('='.repeat(60));
  console.log(`
  1. DEFINE:  tool('name', 'description', schema, handler)
  2. BUNDLE:  createSdkMcpServer({ name, version, tools: [...] })
  3. CONNECT: query({ options: { mcpServers: [server] } })
  4. NAMING:  Tools auto-named mcp__{serverName}__{toolName}
  5. MULTI:   Multiple servers can be passed to mcpServers array

  Key exam concepts:
  - createSdkMcpServer() is the SDK way to create MCP servers
  - tool() uses Zod schemas for input validation
  - mcpServers option replaces manual MCP client setup
  - Multiple servers = multiple tool namespaces (no collisions)
  - Agent discovers tools from all connected servers automatically
  `);
}

main().catch(console.error);
