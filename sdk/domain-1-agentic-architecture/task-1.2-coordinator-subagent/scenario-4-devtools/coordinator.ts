/**
 * Scenario 4: Dev Productivity Coordinator via Agent SDK
 *
 * Exam relevance (Task 1.2):
 * - Coordinator pattern applied to developer tooling
 * - Dynamic routing: code exploration only when needed
 * - Shows how coordinator topology adapts to different domains
 * - Scope partitioning for dev tasks
 *
 * EXAM KEY CONCEPT:
 *   Not every query needs every subagent. The coordinator dynamically
 *   routes to code-explorer and/or task-planner based on the query type.
 *   The task-planner has NO tools -- it is pure reasoning.
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── Mock Dev Tools as MCP Server ──────────────────────────────────────────

const searchCodebaseTool = tool(
  'search_codebase',
  'Search the codebase for files matching a pattern or containing specific text.',
  {
    query: z.string().describe('Search query (filename pattern or text content)'),
    file_type: z.string().optional().describe('Filter by file extension (e.g., "js", "py")'),
  },
  async ({ query: searchQuery }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        query: searchQuery,
        results: [
          { path: 'src/index.js', matches: 3, preview: 'import { createApp } from...' },
          { path: 'src/utils/helpers.js', matches: 1, preview: 'export function formatDate...' },
        ],
      }) }],
    };
  },
);

const readFileTool = tool(
  'read_file',
  'Read the contents of a file in the codebase.',
  {
    path: z.string().describe('File path relative to project root'),
  },
  async ({ path }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        path,
        content: `// ${path}\nexport function main() {\n  console.log("Hello");\n}\n`,
        lines: 4,
      }) }],
    };
  },
);

const listDirectoryTool = tool(
  'list_directory',
  'List files and directories at a given path.',
  {
    path: z.string().optional().describe('Directory path (default: project root)'),
  },
  async ({ path }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        path: path || '.',
        entries: [
          { name: 'src/', type: 'directory' },
          { name: 'tests/', type: 'directory' },
          { name: 'package.json', type: 'file' },
          { name: 'README.md', type: 'file' },
        ],
      }) }],
    };
  },
);

const devServer = createSdkMcpServer({
  name: 'devtools',
  version: '1.0.0',
  tools: [searchCodebaseTool, readFileTool, listDirectoryTool],
});

// ─── Dev Productivity Coordinator ───────────────────────────────────────────

export async function runDevCoordinator(userQuery: string): Promise<string> {
  console.log('\n' + '='.repeat(60));
  console.log('Dev Productivity Coordinator -- Scenario 4 (Agent SDK)');
  console.log('='.repeat(60));
  console.log(`\nQuery: ${userQuery}\n`);

  let finalText = '';

  for await (const message of query({
    prompt: userQuery,
    options: {
      systemPrompt: `You are a developer productivity coordinator. Analyze the query and delegate to the appropriate subagent(s):

- Use "code-explorer" when the user wants to understand existing code
- Use "task-planner" when the user wants a task breakdown
- Use BOTH when the user needs code understanding BEFORE task planning

The code-explorer has tools to search, read files, and list directories.
The task-planner has NO tools -- it uses pure reasoning to create plans.

When using both, pass code-explorer findings EXPLICITLY to task-planner.`,

      mcpServers: {
        devtools: devServer,
      },

      // EXAM KEY CONCEPT: Subagent definitions with different capabilities.
      // code-explorer has tools; task-planner has none (pure reasoning).
      agents: {
        'code-explorer': {
          description: 'Navigates and explores the codebase to understand structure, find files, and read implementations.',
          prompt: `You are a codebase exploration agent. Use the available tools to:
1. Search for relevant files
2. Read file contents to understand implementation
3. List directories to understand project structure

Return a structured summary of what you found.`,
          tools: [
            'mcp__devtools__search_codebase',
            'mcp__devtools__read_file',
            'mcp__devtools__list_directory',
          ],
          model: 'sonnet',
          maxTurns: 10,
        },
        'task-planner': {
          description: 'Creates development task plans from feature requests or bug reports. Uses pure reasoning (no tools).',
          prompt: `You are a development task planning agent. Break down requests into actionable tasks with:
- Description of what needs to be done
- Which files are likely involved
- Estimated complexity (low/medium/high)
- Dependencies on other tasks

Return a structured task list in priority order.`,
          // EXAM KEY CONCEPT: No tools -- pure reasoning subagent
          tools: [],
          model: 'sonnet',
          maxTurns: 5,
        },
      },

      allowedTools: [
        'mcp__devtools__search_codebase',
        'mcp__devtools__read_file',
        'mcp__devtools__list_directory',
      ],

      maxTurns: 20,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESULT');
  console.log('='.repeat(60));
  console.log(finalText);

  return finalText;
}

// ─── Run ────────────────────────────────────────────────────────────────────

runDevCoordinator(
  "I need to add a new API endpoint for user preferences. " +
  "First help me understand the existing API structure, then create a task plan."
).catch(console.error);
