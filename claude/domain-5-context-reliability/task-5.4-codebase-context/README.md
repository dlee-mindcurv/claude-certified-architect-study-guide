# Task 5.4: Codebase Context Management

## Overview

When working with large codebases, managing context is critical. Claude Code has a finite
context window, and long sessions involving extensive file reading and searching can exhaust
it. This task covers techniques for efficient context management: subagent delegation,
scratchpad files, the /compact command, and structured state persistence.

## The Context Challenge

In a large codebase exploration:
- Each file read consumes context tokens
- Each Grep/Glob result adds to the context
- Intermediate reasoning and tool outputs accumulate
- Eventually, important earlier context may be evicted or the session becomes slow

Effective context management preserves room for the most important information.

## Technique 1: Subagent Delegation

### What It Is

A subagent is a forked execution context that performs a task independently and returns
only a summary to the main conversation. This is the same mechanism used by skills with
`context: fork` and the Explore subagent.

### How It Works

1. The main conversation delegates a task to a subagent
2. The subagent performs extensive searching, reading, and analysis
3. All intermediate output stays in the subagent's context (not the main context)
4. Only the final summary/result returns to the main conversation

### When to Use

- Exploring unfamiliar parts of a codebase
- Running analysis that requires reading many files
- Any task that produces verbose intermediate output
- When you need to preserve main context for ongoing work

### Example

> "Use a subagent to explore the authentication module and summarize how it works.
> I need to keep my context free for the refactoring task I am working on."

The subagent reads 15 files, runs 10 Grep searches, and produces a 200-word summary.
Only the summary enters the main context.

## Technique 2: Scratchpad Files

### What It Is

A scratchpad file is a temporary file used to persist structured state between interactions
or across context compaction. Instead of relying on conversation memory, you write findings
to a file that can be re-read later.

### How It Works

1. As you discover information, write it to a scratchpad file (e.g., `SCRATCHPAD.md`)
2. The scratchpad persists on disk regardless of context state
3. After compaction or in a new session, read the scratchpad to restore context
4. Update the scratchpad as findings evolve

### Example Scratchpad Content

```markdown
# Exploration Scratchpad

## Authentication Flow
- Entry point: src/middleware/auth.ts
- JWT verification in: src/services/token-service.ts
- User lookup: src/services/user-service.ts:findByToken()
- Session storage: Redis (configured in src/config/redis.ts)

## Key Findings
- Token refresh logic has a race condition (token-service.ts:89)
- No rate limiting on the refresh endpoint
- Session expiry is hardcoded to 24h (should be configurable)

## Files Still to Examine
- src/handlers/auth-handler.ts (login/logout flow)
- tests/auth-integration.test.ts (test coverage)

## Decisions Made
- Will use sliding window for token refresh
- Will add rate limiting as a separate middleware
```

### When to Use

- Long exploration sessions that may need compaction
- Multi-day tasks where you resume in new sessions
- Complex investigations with many findings to track
- Any time you need durable state beyond the conversation

## Technique 3: /compact

### What It Is

The `/compact` command compresses the conversation history, removing verbose tool outputs
while preserving key information. This frees up context space for continued work.

### When to Use

- When the conversation is getting long and you need more context room
- After completing a phase of work (exploration done, starting implementation)
- When Claude mentions context is getting large
- Before starting a complex new task in the same session

### What Gets Compacted

- Verbose Grep/Glob results are summarized
- Intermediate file read contents are removed (only findings preserved)
- Step-by-step reasoning is condensed
- Key decisions and findings are preserved

### Best Practice

Before using /compact, write important findings to a scratchpad file. This ensures nothing
critical is lost during compaction.

**Workflow:**
1. Write findings to SCRATCHPAD.md
2. Run /compact
3. Read SCRATCHPAD.md to restore essential context
4. Continue work with a fresh, focused context

## Technique 4: Structured State Persistence

### What It Is

Instead of keeping everything in conversation context, maintain structured state in files
that represent your current understanding. This is an extension of the scratchpad concept.

### Patterns

**Architecture Map:**
```markdown
# Architecture Map

## Module Dependency Graph
api-handler --> auth-service --> user-service --> database
api-handler --> validation-service
auth-service --> token-service --> redis
```

**Task Progress:**
```markdown
# Refactoring Progress

## Completed
- [x] Extract auth middleware from monolith
- [x] Create token-service.ts
- [x] Add unit tests for token-service

## In Progress
- [ ] Migrate session storage from memory to Redis

## Blocked
- [ ] Rate limiting (waiting for Redis config)
```

**Decision Log:**
```markdown
# Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Use JWT over sessions | Stateless, scales horizontally | 2024-01-15 |
| Redis for token store | Shared across instances | 2024-01-15 |
| Sliding window refresh | Better UX than hard expiry | 2024-01-16 |
```

## Combining Techniques

The most effective approach combines all four techniques:

1. **Delegate exploration** to subagents (preserve main context)
2. **Write findings** to scratchpad files (persist state)
3. **Compact** when context is full (free up space)
4. **Read scratchpad** after compaction (restore essential context)

```
Explore (subagent) --> Record (scratchpad) --> Compact --> Restore (read scratchpad)
     |                                                          |
     v                                                          v
  Summary enters                                         Continue work with
  main context                                           fresh context + findings
```

## Exam Tips

- Know that subagents (context: fork) prevent verbose output from consuming main context
- Understand scratchpad files as persistent state that survives compaction
- Know when to use /compact and what it preserves vs removes
- Understand the workflow: explore, record, compact, restore
- Be able to recommend the right technique for a given scenario
