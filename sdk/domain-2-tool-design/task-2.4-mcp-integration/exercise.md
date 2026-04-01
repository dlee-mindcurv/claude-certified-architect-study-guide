# Exercise: Configure MCP Integration in SDK and Claude Code

## Objective

Configure MCP tool integration in two contexts: (1) programmatic MCP client
setup in SDK agent code, and (2) declarative MCP server configuration in
Claude Code's settings file. Understand the differences and when to use each.

## Part 1: SDK-Side MCP Client

You are building a developer productivity agent that connects to two MCP
servers:

1. **Code Analysis Server** -- Analyzes code quality, finds dependencies
2. **Git Server** -- Provides git history, diff, and blame information

### Task 1A: Write the Connection Code

Complete this initialization function:

```js
async function initializeMcpClients() {
  const mcpClient = new McpClient();

  // Connect to code analysis server via stdio
  // Command: npx @anthropic/code-analysis-server
  // Environment: PROJECT_ROOT should be set to current directory
  await mcpClient.connect(???, {
    command: ???,
    args: ???,
    env: ???,
  });

  // Connect to git server via stdio
  // Command: node ./tools/git-mcp-server.js
  // Environment: REPO_PATH should be set to current directory
  await mcpClient.connect(???, {
    command: ???,
    args: ???,
    env: ???,
  });

  return mcpClient;
}
```

### Task 1B: Tool Discovery and Merging

After connecting, write code that:
1. Discovers tools from both MCP servers
2. Converts them to Anthropic API format (`inputSchema` to `input_schema`)
3. Merges them with a local `explain_code` tool you defined inline
4. Creates a tool executor that routes calls correctly

```js
async function setupTools(mcpClient) {
  // 1. Discover tools
  const mcpTools = ???;

  // 2. Convert format
  const anthropicMcpTools = ???;

  // 3. Define local tool
  const localTools = [{
    name: 'explain_code',
    description: 'Explain what a code snippet does in plain English',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code snippet to explain' },
        language: { type: 'string', description: 'Programming language' },
      },
      required: ['code'],
    },
  }];

  // 4. Merge
  const allTools = ???;

  // 5. Route tool calls
  async function executeTool(name, input) {
    // How do you know if this is an MCP tool or a local tool?
    ???
  }

  return { tools: allTools, executeTool };
}
```

### Questions

1. What happens if the code analysis server fails to start?
2. How should your agent handle the case where one MCP server is unavailable
   but the other works?
3. Why is format conversion (`inputSchema` to `input_schema`) necessary?

## Part 2: Claude Code MCP Configuration

### Task 2A: Project Settings

Write a `.claude/settings.json` file that configures the same two MCP servers
for Claude Code:

```json
{
  "mcpServers": {
    ???
  }
}
```

### Task 2B: User-Level Settings

Now configure a personal MCP server (a notes/memory server) in the user-level
settings file. Where does this file live?

```json
// File: ???
{
  "mcpServers": {
    "memory": {
      ???
    }
  }
}
```

### Questions

1. If the same server name appears in both project and user settings, which
   takes precedence?
2. How does Claude Code discover the tools from these servers?
3. Can you use environment variables in the `env` section? How?

## Part 3: MCP Resources

### Task 3A: Resource Discovery

Your code analysis server exposes these resources:
- `project://file-tree` -- Complete project file structure
- `project://dependency-graph` -- Dependency relationships
- `project://test-coverage` -- Test coverage report

Write SDK code that:
1. Lists available resources from the server
2. Reads the file tree resource
3. Includes the file tree in the agent's system prompt as context

```js
async function loadProjectContext(mcpClient) {
  // 1. List resources
  const resources = ???;

  // 2. Read file tree
  const fileTree = ???;

  // 3. Build system prompt with context
  const systemPrompt = ???;

  return systemPrompt;
}
```

### Task 3B: Resource vs. Tool

For each of the following, decide whether it should be an MCP resource or an
MCP tool. Explain why.

| Capability | Resource or Tool? | Why? |
|------------|-------------------|------|
| Read the project README | ??? | ??? |
| Run linting on a file | ??? | ??? |
| Get the git commit log | ??? | ??? |
| Read API documentation | ??? | ??? |
| Execute a database query | ??? | ??? |
| View project configuration | ??? | ??? |

## Verification Checklist

### SDK Integration
- [ ] MCP client connects to both servers at startup
- [ ] Tools are discovered dynamically from both servers
- [ ] MCP tool format is converted to Anthropic API format
- [ ] Local tools are merged with MCP tools
- [ ] Tool executor routes calls to the correct handler
- [ ] Connection failures are handled gracefully

### Claude Code Configuration
- [ ] `.claude/settings.json` has correct server configurations
- [ ] Server commands and arguments are correct
- [ ] Environment variables are set appropriately
- [ ] User-level settings file is in the correct location

### MCP Resources
- [ ] Resources are discovered from connected servers
- [ ] Resource content is loaded and used as agent context
- [ ] Resources are correctly classified (passive content vs. actions)

## Expected Outcomes

After completing this exercise, you should understand:

- How MCP clients connect to servers (stdio and SSE transport)
- How tools are discovered dynamically at startup
- The format difference between MCP and Anthropic API tool definitions
- How to merge MCP tools with locally defined tools
- How Claude Code configures MCP servers declaratively
- The difference between MCP resources (passive content) and tools (actions)
- How to handle MCP server failures gracefully
