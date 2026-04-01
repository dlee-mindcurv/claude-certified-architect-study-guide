# Task 2.4: MCP Server Integration and Scoping

## Overview

The Model Context Protocol (MCP) extends Claude Code with external tools and data sources.
MCP servers can be configured at two levels: project-scoped (shared with the team) and
user-scoped (personal). Understanding scoping, environment variable expansion, multi-server
access, and MCP resources is exam-critical.

## MCP Configuration Scoping

### Project-Level: `.mcp.json`

- **Location:** `<project-root>/.mcp.json`
- **Shared via version control:** Yes -- committed to the repository
- **Use cases:** Team-shared tools (GitHub, Jira, database access, custom APIs)
- **Applies to:** Everyone who clones the repository

### User-Level: `~/.claude.json`

- **Location:** `~/.claude.json` (in the `mcpServers` section)
- **Shared via version control:** No -- personal configuration
- **Use cases:** Personal tools, experimental servers, individual API access
- **Applies to:** Only this user, across all projects

### Precedence

Both project-level and user-level MCP servers are available simultaneously. If both
define a server with the same name, the project-level configuration takes precedence
when working within that project.

## .mcp.json Format

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Fields

| Field | Description |
|-------|-------------|
| `command` | The executable to run the MCP server |
| `args` | Arguments passed to the command |
| `env` | Environment variables for the server process |

## Environment Variable Expansion

MCP configs support `${VAR_NAME}` syntax for environment variable expansion:

```json
{
  "env": {
    "GITHUB_TOKEN": "${GITHUB_TOKEN}",
    "JIRA_API_TOKEN": "${JIRA_API_TOKEN}",
    "DATABASE_URL": "${DATABASE_URL}"
  }
}
```

**Key points:**
- Variables are expanded at server startup time
- The actual values are NOT stored in `.mcp.json` (safe to commit)
- Developers set these variables in their local environment (`.env.local`, shell profile)
- Missing variables cause the server to fail to start

## Multi-Server Simultaneous Access

Claude Code can connect to multiple MCP servers at the same time:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    },
    "jira": {
      "command": "npx",
      "args": ["-y", "mcp-server-jira"],
      "env": { "JIRA_API_TOKEN": "${JIRA_API_TOKEN}" }
    },
    "database": {
      "command": "npx",
      "args": ["-y", "mcp-server-postgres"],
      "env": { "DATABASE_URL": "${DATABASE_URL}" }
    }
  }
}
```

When multiple servers are active:
- Claude sees all tools from all servers
- Tools are namespaced by server (e.g., `github.create_issue`, `jira.get_ticket`)
- Claude can use tools from different servers in the same conversation
- Each server runs as an independent process

## MCP Resources

MCP servers can expose **resources** -- read-only content catalogs that Claude can access.
Resources are different from tools:

| Aspect | Tools | Resources |
|--------|-------|-----------|
| Purpose | Perform actions | Provide data |
| Direction | Claude calls them | Claude reads them |
| Examples | Create issue, run query | File listing, schema docs |
| Side effects | Yes (may modify state) | No (read-only) |

Resources are useful for providing Claude with context about available data, schemas,
or documentation without requiring a tool invocation.

## Exam Tips

- Know the two scoping levels: `.mcp.json` (project) and `~/.claude.json` (user)
- Understand that `${VAR_NAME}` syntax keeps secrets out of committed files
- Know that multiple MCP servers can run simultaneously
- Understand the difference between MCP tools (actions) and resources (data)
- Know that project-level config is version-controlled; user-level is not
- Be able to configure a basic MCP server in `.mcp.json`
