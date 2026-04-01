# Exercise: MCP Server Configuration

## Objective

Configure shared (project-level) and personal (user-level) MCP servers, and verify
that both are available simultaneously in Claude Code.

## Part 1: Configure a Project-Level MCP Server

### Step 1: Create .mcp.json

Create a `.mcp.json` file in your project root with a GitHub MCP server:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Step 2: Set the environment variable

Ensure `GITHUB_TOKEN` is set in your environment:

```bash
export GITHUB_TOKEN="your-github-token-here"
```

Or add it to your `.env.local` file (which should be in `.gitignore`).

### Step 3: Verify in Claude Code

Open Claude Code in the project directory. The GitHub MCP server should start
automatically. You can verify by asking Claude to use a GitHub tool:

> "List the open issues on this repository using the GitHub MCP server."

## Part 2: Configure a User-Level MCP Server

### Step 1: Edit ~/.claude.json

Add a personal MCP server to your user-level config:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname/Documents"],
      "env": {}
    }
  }
}
```

### Step 2: Verify in Claude Code

Both the project-level GitHub server and your personal filesystem server should be
available. Verify:

> "What MCP servers are currently connected?"

You should see both `github` (from `.mcp.json`) and `filesystem` (from `~/.claude.json`).

## Part 3: Multi-Server Usage

### Step 1: Use tools from different servers in one conversation

Try a task that uses both servers:

> "Find the latest open issue from GitHub, then read the project roadmap file
> from my Documents folder."

Claude should use the GitHub MCP to find issues and the filesystem MCP to read the file,
demonstrating simultaneous multi-server access.

## Part 4: Environment Variable Expansion

### Step 1: Understand the flow

1. `.mcp.json` contains `"GITHUB_TOKEN": "${GITHUB_TOKEN}"`
2. When the MCP server starts, `${GITHUB_TOKEN}` is replaced with the actual value
   from your environment
3. The actual token is NEVER stored in `.mcp.json`
4. `.mcp.json` is safe to commit to version control

### Step 2: Test missing variable

Temporarily unset your `GITHUB_TOKEN`:

```bash
unset GITHUB_TOKEN
```

Restart Claude Code. The GitHub MCP server should fail to start because the required
environment variable is missing. This confirms that expansion happens at startup time.

### Step 3: Restore and verify

Set the variable again and restart. The server should connect successfully.

## Part 5: Thought Questions

1. **A teammate wants to add a personal Notion MCP server. Where should they configure it?**
   In `~/.claude.json` -- user-level config, not in `.mcp.json`.

2. **The team wants everyone to have access to the project database via MCP. Where does this go?**
   In `.mcp.json` at the project root, with `${DATABASE_URL}` for the connection string.

3. **How do you keep API tokens out of version control while using .mcp.json?**
   Use `${VAR_NAME}` environment variable expansion. Store actual values in `.env.local`
   or shell profiles.

4. **Can Claude use a GitHub tool and a Jira tool in the same prompt?**
   Yes. Multiple MCP servers run simultaneously, and Claude can use tools from any of them
   in a single conversation.

## Key Takeaways

- `.mcp.json` is for team-shared MCP servers (version controlled)
- `~/.claude.json` is for personal MCP servers (not version controlled)
- `${VAR_NAME}` keeps secrets out of committed files
- Multiple MCP servers run simultaneously
- MCP resources provide read-only data; MCP tools perform actions
