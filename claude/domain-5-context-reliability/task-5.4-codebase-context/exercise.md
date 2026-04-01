# Exercise: Codebase Context Management

## Objective

Practice managing context during a large codebase exploration using subagent delegation,
scratchpad files, and the /compact command.

## Part 1: Subagent Delegation

### Scenario

You are working on a refactoring task and need to understand the database access patterns
in the codebase without consuming your main context.

### Step 1: Delegate exploration to a subagent

Ask Claude Code to use a forked context for exploration:

> "Using a subagent (forked context), explore the database access patterns in this codebase.
> Find all files that interact with the database, identify the query patterns used, and
> report back a summary. Do not show me the intermediate search results."

### Step 2: Observe the result

The subagent should:
- Search for database-related imports and patterns
- Read key data access files
- Return only a concise summary (not the raw search output)

### Step 3: Verify context preservation

Your main conversation should contain:
- The subagent's summary (compact)
- NOT the intermediate Grep/Glob/Read output (that stayed in the fork)
- Plenty of remaining context for your refactoring work

## Part 2: Scratchpad File Pattern

### Step 1: Create a scratchpad

As you work through a complex exploration, create a file to track your findings:

> "Create a file called SCRATCHPAD.md and write our findings about the database
> access patterns there."

Example content to write:

```markdown
# Database Access Exploration

## Data Access Layer
- Location: src/db/
- Pattern: Repository pattern with typed queries
- ORM: Prisma (schema in prisma/schema.prisma)

## Key Files
- src/db/user-repository.ts -- User CRUD operations
- src/db/order-repository.ts -- Order queries with joins
- src/db/connection.ts -- Connection pool configuration

## Patterns Found
- All queries use Prisma client (no raw SQL)
- Transactions use prisma.$transaction()
- Soft deletes via deletedAt field
- Pagination via cursor-based pagination

## Issues Identified
- No query timeout configuration
- Connection pool size hardcoded (should be env var)
- Missing indexes on frequently queried fields

## Next Steps
- Check if migrations handle index creation
- Review the Prisma schema for missing relations
```

### Step 2: Continue working

Do more exploration, ask questions, make changes. Let the context grow.

### Step 3: Compact and restore

When context gets large:

1. Update SCRATCHPAD.md with any new findings
2. Run `/compact` to compress the conversation
3. Immediately read SCRATCHPAD.md:
   > "Read SCRATCHPAD.md to restore our exploration context."
4. Continue work with fresh context and all findings intact

## Part 3: Structured State Persistence

### Step 1: Create a decision log

For architectural decisions made during your work:

```markdown
# Decisions Log

| # | Decision | Options Considered | Rationale | Status |
|---|----------|-------------------|-----------|--------|
| 1 | Use cursor pagination | Cursor vs offset | Better for large datasets | Decided |
| 2 | Add Redis caching | Redis vs in-memory | Need shared cache across instances | Decided |
| 3 | Query timeout strategy | Per-query vs global | TBD - need to check Prisma support | Open |
```

### Step 2: Create a progress tracker

```markdown
# Refactoring Progress

## Phase 1: Analysis (COMPLETE)
- [x] Map database access patterns
- [x] Identify performance issues
- [x] Review existing indexes

## Phase 2: Quick Wins (IN PROGRESS)
- [x] Add connection pool size env var
- [ ] Add query timeouts
- [ ] Add missing indexes (users.email, orders.userId)

## Phase 3: Architecture Changes (PENDING)
- [ ] Implement cursor-based pagination
- [ ] Add Redis caching layer
- [ ] Extract query builders for complex joins
```

### Step 3: Use these files across sessions

In a new session or after compaction:

> "Read SCRATCHPAD.md, decisions.md, and progress.md to restore my working context
> for the database refactoring project."

Claude now has all the essential context without re-exploring the codebase.

## Part 4: Combined Workflow Practice

Execute this complete workflow:

1. **Start:** Identify a complex area of your codebase to explore
2. **Delegate:** Use a subagent to do the initial exploration
3. **Record:** Write findings to SCRATCHPAD.md
4. **Work:** Make some changes based on findings
5. **Record:** Update SCRATCHPAD.md with new findings and decisions
6. **Compact:** Run /compact when context is getting large
7. **Restore:** Read SCRATCHPAD.md to get back on track
8. **Continue:** Resume work with a fresh context and all findings

## Verification Checklist

- [ ] Subagent returned only a summary, not raw search output
- [ ] Scratchpad file contains structured, useful findings
- [ ] /compact freed up context space
- [ ] Reading the scratchpad after compaction restored working context
- [ ] You could continue working effectively after the compact+restore cycle

## Key Takeaways

- Subagents prevent exploration from consuming your working context
- Scratchpad files persist state across compaction and sessions
- /compact is a tool, not a loss -- plan for it by writing findings to files first
- Structured state (decisions, progress, findings) is more useful than unstructured notes
- The explore-record-compact-restore cycle is a repeatable pattern for long sessions
