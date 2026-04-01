# Task 2.4: Configure MCP Integration

## Exam Relevance
Tested in Scenario 4 (Developer Productivity). Maps to Skill S4.

## What Is MCP?

The Model Context Protocol (MCP) is an open standard that defines how AI
agents discover and invoke tools from external servers. Instead of hardcoding
tool definitions in your agent code, MCP lets agents dynamically discover
available tools from any MCP-compliant server.

### MCP Architecture

```
┌─────────────┐         ┌─────────────────┐
│ Agent (SDK)  │ ──MCP── │ MCP Server      │
│              │         │ (tool provider)  │
│ MCP Client   │         │                 │
│ connects to  │         │ Exposes:        │
│ server at    │         │ - tools/list    │
│ startup      │         │ - tools/call    │
│              │         │ - resources/*   │
└─────────────┘         └─────────────────┘
```

The MCP client (in the agent code) connects to one or more MCP servers at
startup. Each server exposes its tools through standardized endpoints:

- **tools/list** -- Returns available tool definitions (name, description,
  input schema)
- **tools/call** -- Executes a tool with given inputs and returns results
- **resources/list** -- Returns available resources (content catalogs, files)
- **resources/read** -- Reads a specific resource by URI

### MCP in SDK Code vs. Claude Code

MCP integration works in two contexts:

**SDK (Agent Code):**
Configure MCP client connections programmatically. The agent discovers tools
from MCP servers at startup and includes them in API requests.

```js
// Conceptual: SDK-side MCP client setup
const mcpClient = new McpClient();
await mcpClient.connect('stdio', {
  command: 'node',
  args: ['./my-mcp-server.js'],
});

// Discover tools dynamically
const { tools } = await mcpClient.request('tools/list');
// tools is an array of { name, description, inputSchema }
```

**Claude Code:**
Configure MCP servers in `.claude/settings.json`. Claude Code discovers and
connects to servers automatically.

```json
{
  "mcpServers": {
    "code-analysis": {
      "command": "node",
      "args": ["./tools/code-analysis-server.js"],
      "env": { "PROJECT_ROOT": "." }
    }
  }
}
```

### MCP Resources

MCP resources provide a content catalog that agents can browse and read.
Unlike tools (which execute actions), resources are passive content:

```js
// List available resources
const { resources } = await mcpClient.request('resources/list');
// [{ uri: 'file:///docs/api.md', name: 'API Documentation', mimeType: 'text/markdown' }]

// Read a specific resource
const { contents } = await mcpClient.request('resources/read', {
  uri: 'file:///docs/api.md',
});
```

Resources are useful for:
- Exposing documentation to the agent
- Providing configuration files
- Sharing project context (file trees, dependency graphs)

## MCP Server Transport Types

MCP supports two transport mechanisms:

### stdio Transport
The MCP server runs as a subprocess. Communication happens over stdin/stdout.

```js
// SDK: Connect via stdio
await mcpClient.connect('stdio', {
  command: 'node',
  args: ['./my-server.js'],
  env: { API_KEY: process.env.API_KEY },
});
```

```json
// Claude Code: .claude/settings.json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["./my-server.js"]
    }
  }
}
```

**Best for:** Local tools, project-specific servers, development workflows.

### SSE Transport (Server-Sent Events)
The MCP server runs as a remote HTTP server. Communication happens over HTTP
with SSE for streaming.

```js
// SDK: Connect via SSE
await mcpClient.connect('sse', {
  url: 'http://localhost:3001/mcp',
});
```

**Best for:** Shared servers, remote services, team-wide tools.

## SDK-Side MCP Client Integration

When building agents with the Anthropic SDK, the MCP integration pattern is:

1. **Initialize MCP client** at agent startup
2. **Discover tools** from connected MCP servers
3. **Merge with local tools** to create the complete tool set
4. **Route tool calls** to the appropriate handler (MCP server or local)

```js
// Conceptual pattern for SDK-side MCP integration
async function initializeAgent() {
  // 1. Connect to MCP servers
  const mcpClient = new McpClient();
  await mcpClient.connect('stdio', { command: 'node', args: ['./server.js'] });

  // 2. Discover tools from MCP servers
  const { tools: mcpTools } = await mcpClient.request('tools/list');

  // 3. Merge with any locally defined tools
  const allTools = [...localToolDefinitions, ...mcpTools];

  // 4. Create tool executor that routes appropriately
  function executeTool(name, input) {
    if (mcpTools.find(t => t.name === name)) {
      return mcpClient.request('tools/call', { name, arguments: input });
    }
    return executeLocalTool(name, input);
  }

  return { tools: allTools, executeTool };
}
```

## Claude Code MCP Configuration

In Claude Code, MCP servers are configured in settings files at three levels:

1. **Project level:** `.claude/settings.json` -- per-project servers
2. **User level:** `~/.claude/settings.json` -- personal servers
3. **Enterprise level:** managed by organization policies

```json
{
  "mcpServers": {
    "code-analysis": {
      "command": "npx",
      "args": ["-y", "@anthropic/code-analysis-server"],
      "env": {
        "PROJECT_ROOT": "."
      }
    },
    "database": {
      "command": "node",
      "args": ["./tools/db-server.js"],
      "env": {
        "DB_CONNECTION": "${DB_URL}"
      }
    }
  }
}
```

Claude Code will:
- Start each server as a subprocess at session launch
- Discover tools from each server via `tools/list`
- Add discovered tools to Claude's available tool set
- Route tool calls to the appropriate server

## Anti-Patterns

**1. Hardcoding tool definitions instead of using MCP discovery**
```js
// WRONG: Hardcoded tools that drift from server implementation
const tools = [{ name: 'analyze_code', description: 'old description...' }];
```
Use `tools/list` so definitions stay synchronized with the server.

**2. Not handling MCP server startup failures**
```js
// WRONG: No error handling for server connection
await mcpClient.connect('stdio', { command: './broken-server.js' });
```
Always handle connection failures gracefully. The agent should work with
reduced capabilities if an MCP server is unavailable.

**3. Mixing MCP and non-MCP tools without proper routing**
```js
// WRONG: All tool calls go to MCP server, even local tools
const result = await mcpClient.request('tools/call', { name: toolName, ... });
```
Check whether the tool is MCP-managed or local before routing.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Reference MCP client setup pattern |
| `exercise.md` | Configure MCP in both SDK and Claude Code |
| `scenario-4-devtools/mcp-client.js` | Dev productivity MCP client |

See also: `claude/domain-2-tool-design/task-2.4-mcp-integration/` for Claude
Code native MCP configuration examples.
