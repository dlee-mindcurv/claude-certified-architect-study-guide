/**
 * Scenario 4: Dev Productivity Coordinator
 *
 * Exam relevance (Task 1.2):
 * - Coordinator pattern applied to developer tooling
 * - Demonstrates dynamic routing: code exploration only when needed
 * - Shows how coordinator topology adapts to different domains
 * - Covers scope partitioning for dev tasks
 *
 * This coordinator manages:
 * - Codebase exploration subagent (reads files, searches code)
 * - Task planning subagent (breaks down dev tasks)
 * - The coordinator decides which subagent(s) are needed per query
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 10;

// ─── Mock Dev Tools ─────────────────────────────────────────────────────────
// In a real system, these would be MCP tools connecting to actual dev infrastructure

const devToolDefinitions = [
  {
    name: 'search_codebase',
    description: 'Search the codebase for files matching a pattern or containing specific text.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (filename pattern or text content)' },
        file_type: { type: 'string', description: 'Filter by file extension (e.g., "js", "py")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file in the codebase.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a given path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (default: project root)' },
      },
      required: [],
    },
  },
];

function executeDevTool(toolName, toolInput) {
  // Mock implementations
  switch (toolName) {
    case 'search_codebase':
      return {
        content: JSON.stringify({
          query: toolInput.query,
          results: [
            { path: 'src/index.js', matches: 3, preview: 'import { createApp } from...' },
            { path: 'src/utils/helpers.js', matches: 1, preview: 'export function formatDate...' },
          ],
        }),
      };
    case 'read_file':
      return {
        content: JSON.stringify({
          path: toolInput.path,
          content: `// ${toolInput.path}\nexport function main() {\n  console.log("Hello");\n}\n`,
          lines: 4,
        }),
      };
    case 'list_directory':
      return {
        content: JSON.stringify({
          path: toolInput.path || '.',
          entries: [
            { name: 'src/', type: 'directory' },
            { name: 'tests/', type: 'directory' },
            { name: 'package.json', type: 'file' },
            { name: 'README.md', type: 'file' },
          ],
        }),
      };
    default:
      return { isError: true, content: JSON.stringify({ message: `Unknown tool: ${toolName}` }) };
  }
}

// ─── Subagent Definitions ───────────────────────────────────────────────────

const codeExplorationSubagent = {
  name: 'code-explorer',
  systemPrompt: `You are a codebase exploration agent. Your job is to navigate and understand code structure.

Given a task, use the available tools to:
1. Search for relevant files
2. Read file contents to understand implementation
3. List directories to understand project structure

Return a structured summary of what you found:
- Key files and their purposes
- Relevant code patterns
- Dependencies and relationships between components`,
  allowedTools: ['search_codebase', 'read_file', 'list_directory'],
};

const taskPlanningSubagent = {
  name: 'task-planner',
  systemPrompt: `You are a development task planning agent. Given a feature request or bug report,
break it down into actionable development tasks.

For each task:
- Description of what needs to be done
- Which files are likely involved (if codebase context is provided)
- Estimated complexity (low/medium/high)
- Dependencies on other tasks

Return a structured task list in priority order.`,
  allowedTools: [],  // Planning subagent uses no tools — pure reasoning
};

// ─── Subagent Runner ────────────────────────────────────────────────────────

async function runDevSubagent(subagentConfig, taskDescription) {
  console.log(`\n  [${subagentConfig.name}] Starting...`);

  const tools = devToolDefinitions.filter(t =>
    subagentConfig.allowedTools.includes(t.name)
  );

  const messages = [{ role: 'user', content: taskDescription }];
  let turnCount = 0;

  while (true) {
    if (++turnCount > MAX_TURNS) {
      return { success: false, result: '[Turn limit reached]' };
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: subagentConfig.systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      console.log(`  [${subagentConfig.name}] Complete (${turnCount} turns)`);
      return { success: true, result: text };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];

      for (const block of response.content.filter(b => b.type === 'tool_use')) {
        console.log(`    [${subagentConfig.name}] Tool: ${block.name}`);
        const result = executeDevTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  return { success: false, result: '[Subagent did not complete]' };
}

// ─── Dev Productivity Coordinator ───────────────────────────────────────────

export async function runDevCoordinator(userQuery) {
  console.log('\n' + '='.repeat(60));
  console.log('Dev Productivity Coordinator — Scenario 4');
  console.log('='.repeat(60));
  console.log(`\nQuery: ${userQuery}\n`);

  // ── Step 1: Classify the query and plan routing ─────────────────────────
  //
  // EXAM CONCEPT: Dynamic routing — not every query needs every subagent
  //
  // Query types:
  // - "explore": needs code exploration only
  // - "plan": needs task planning only
  // - "full": needs code exploration THEN task planning (sequential dependency)
  console.log('Step 1: Query Classification');

  const classification = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: `Classify this dev query. Return ONLY JSON:
{ "type": "explore" | "plan" | "full", "rationale": "..." }

- "explore": user wants to understand existing code (no task breakdown needed)
- "plan": user wants a task breakdown (no code exploration needed, e.g., greenfield)
- "full": user needs code exploration BEFORE task planning (e.g., modifying existing code)`,
    messages: [{ role: 'user', content: userQuery }],
  });

  let queryType;
  try {
    const text = classification.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    queryType = JSON.parse(match[0]);
  } catch {
    queryType = { type: 'full', rationale: 'Defaulting to full pipeline' };
  }

  console.log(`  Type: ${queryType.type} — ${queryType.rationale}`);

  // ── Step 2: Execute subagents based on routing ──────────────────────────
  let codeContext = null;
  let taskPlan = null;

  if (queryType.type === 'explore' || queryType.type === 'full') {
    console.log('\nStep 2a: Code Exploration');
    const exploration = await runDevSubagent(
      codeExplorationSubagent,
      `Explore the codebase to understand: ${userQuery}

Search for relevant files, read their contents, and provide a summary of:
- Project structure
- Key files related to the query
- Current implementation patterns`
    );
    codeContext = exploration.result;
  }

  if (queryType.type === 'plan' || queryType.type === 'full') {
    console.log('\nStep 2b: Task Planning');

    // EXAM CONCEPT: Explicit context passing
    // If code exploration ran first, its results are passed explicitly
    const planningContext = codeContext
      ? `## Codebase Context (from exploration)\n${codeContext}\n\n## Task\n${userQuery}`
      : userQuery;

    const planning = await runDevSubagent(
      taskPlanningSubagent,
      `Create a development task plan for: ${planningContext}`
    );
    taskPlan = planning.result;
  }

  // ── Step 3: Combine results ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('RESULT');
  console.log('='.repeat(60));

  if (codeContext && taskPlan) {
    console.log('\n## Codebase Analysis\n');
    console.log(codeContext);
    console.log('\n## Development Plan\n');
    console.log(taskPlan);
  } else if (codeContext) {
    console.log('\n## Codebase Analysis\n');
    console.log(codeContext);
  } else if (taskPlan) {
    console.log('\n## Development Plan\n');
    console.log(taskPlan);
  }

  return { codeContext, taskPlan, queryType: queryType.type };
}

// ─── Run ────────────────────────────────────────────────────────────────────

runDevCoordinator(
  "I need to add a new API endpoint for user preferences. " +
  "First help me understand the existing API structure, then create a task plan."
).catch(console.error);
