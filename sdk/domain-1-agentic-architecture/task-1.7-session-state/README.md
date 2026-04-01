# Task 1.7: Manage Session and State

## Exam Relevance
Tested in Scenario 4 (Dev Productivity). This task covers how to maintain,
resume, fork, and refresh context across agent sessions -- particularly
important for long-running investigations and parallel exploration.

## Core Concepts

### Named Session Resumption

Claude Code sessions can be named and resumed with `--resume <session-name>`.
A named session preserves the full conversation history, allowing the agent to
pick up exactly where it left off.

```bash
# Start a named session
claude --session "auth-investigation"

# Resume later
claude --resume "auth-investigation"
```

**When to resume:**
- The investigation is ongoing and no significant time has passed
- Tool results in the session are still fresh (files have not changed)
- You need the model to recall specific reasoning steps from earlier

**When to start fresh:**
- Significant time has passed and files may have changed
- The session context has grown large and diluted
- Tool results are stale (e.g., database state has changed)

### Stale Tool Results

A resumed session contains ALL prior tool results in its conversation history.
If those results describe file contents that have since changed, the model will
reason about outdated information. This is a critical pitfall.

**Detection strategy:** When resuming a session, inject a user message that
summarizes what has changed since the session was last active:

```
"Since our last session, the following files were modified:
- src/auth.js: Added rate limiting (commit abc123)
- src/middleware/session.js: Fixed token refresh bug (commit def456)
Please factor these changes into your analysis."
```

This approach is more reliable than hoping the model will notice stale data
on its own.

### fork_session: Parallel Exploration

`fork_session` creates a new session that branches from a shared baseline.
Both the original and forked sessions share the same history up to the fork
point, then diverge independently.

```
Original session: A -> B -> C -> D -> E
                              \
Forked session:                -> F -> G -> H
```

**Use cases:**
- **Compare approaches:** Fork before choosing between two refactoring
  strategies. Explore each in its own branch, then compare results.
- **Parallel investigation:** Fork to investigate two hypotheses about a bug
  simultaneously.
- **Safe experimentation:** Fork before making destructive changes. If the
  experiment fails, the original session is intact.

### Resume vs. Fresh Start: Decision Framework

| Condition | Action | Reason |
|-----------|--------|--------|
| Files unchanged, context fresh | Resume | Full history available |
| Files changed, context valuable | Fresh + structured summary | Avoids stale data while preserving key findings |
| Context window nearly full | Fresh + summary | Prevents degraded performance from context pressure |
| Need to explore alternatives | fork_session | Parallel branches from shared baseline |
| Investigation complete, new task | Fresh | Clean slate, no irrelevant context |

### Structured Summary Injection

When starting fresh with prior context, inject a structured summary as the
first user message. This gives the model the essential facts without the
noise of a full conversation history.

```
"I previously investigated the auth system and found:
- Session tokens are stored in Redis with a 24h TTL
- Token refresh is handled by middleware/session.js
- There is a race condition when two requests refresh simultaneously
- The refresh logic does not use atomic Redis operations

Key files:
- src/middleware/session.js (token refresh, line 45-80)
- src/services/redis-client.js (connection pooling)
- tests/auth.test.js (existing tests, no concurrent refresh test)

Continue from here: write a fix for the race condition."
```

This summary is more effective than resuming a stale session because:
1. It contains only verified, current facts
2. It omits irrelevant exploration dead-ends
3. It fits in a fraction of the context window
4. The model can verify facts against current file contents

## Anti-Patterns

**1. Resuming sessions with stale tool results**
The model will reason about file contents that no longer exist, leading to
incorrect analysis and suggestions that break the current codebase.

**2. Resuming overly long sessions**
Sessions with 50+ turns accumulate noise. The model's attention is spread
across the entire history, diluting focus on the current task. Start fresh
with a summary instead.

**3. Forking without a clear purpose**
`fork_session` is useful for parallel comparison, not for "just in case."
Each fork consumes resources and creates a branch that must eventually be
reconciled or discarded.

**4. Starting fresh without a summary**
If prior context is valuable, discarding it entirely wastes work. Always
inject a structured summary of key findings when starting fresh.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Reference implementations for resume, fork, and summary patterns |
| `exercise.md` | Hands-on exercise for session management |
| `scenario-4-devtools/session-mgmt.js` | Dev productivity session management with fork_session |
