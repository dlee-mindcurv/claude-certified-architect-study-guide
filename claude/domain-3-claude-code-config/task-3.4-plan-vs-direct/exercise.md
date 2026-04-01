# Exercise: Plan Mode vs Direct Execution

## Objective

Practice classifying tasks as plan-mode or direct-execution candidates, then execute
one example of each.

## Part 1: Classify These Tasks

For each task description, decide: **Plan Mode** or **Direct Execution**? Explain why.

### Task 1
> "Add a `lastLogin` timestamp field to the User model and update the login handler
> to set it on successful authentication."

**Answer:** Direct Execution
**Why:** Well-scoped change with clear requirements. The model and handler are identified.
The change is straightforward -- add a field and update one code path.

### Task 2
> "Refactor the notification system to support multiple delivery channels (email, SMS,
> push) instead of just email."

**Answer:** Plan Mode
**Why:** Complex, multi-file change with architectural implications. Multiple valid
approaches exist (strategy pattern, plugin system, event-driven). Requires understanding
the current notification system before designing the refactor.

### Task 3
> "Fix the bug where the search API returns 500 when the query string contains
> special characters."

**Answer:** Direct Execution
**Why:** Bug fix with a clear symptom. The location (search API) and trigger (special
characters) are identified. The solution likely involves input sanitization or encoding.

### Task 4
> "Implement caching for our most expensive database queries to improve API response times."

**Answer:** Plan Mode
**Why:** Multiple valid approaches (Redis, in-memory, CDN). Requires identifying which
queries to cache, choosing cache invalidation strategies, and deciding where to add
caching layers. Multiple files affected.

### Task 5
> "Update the copyright year in the footer component from 2025 to 2026."

**Answer:** Direct Execution
**Why:** Trivial, single-file change with zero ambiguity. No planning needed.

## Part 2: Execute a Direct Task

Try this in Claude Code:

```
Add a `updatedAt: Date` field to the User interface in src/types/user.ts
and add a JSDoc comment explaining it tracks the last profile modification time.
```

Observe:
- Claude immediately reads the file and makes the change
- No plan is proposed first
- The change is fast and focused

## Part 3: Execute a Plan-Mode Task

Try this in Claude Code (use shift+tab to toggle plan mode, or phrase your prompt
to request planning):

```
I need to add pagination to all our list API endpoints. Before making any changes,
explore the current endpoint patterns and propose a plan for implementing consistent
pagination across all of them.
```

Observe:
- Claude first explores the codebase to understand existing patterns
- A plan is proposed with specific files and changes
- You review the plan before any code is modified
- The plan may identify shared utilities to create

## Part 4: Reflection

After completing Parts 2 and 3, answer:

1. How did the direct execution feel compared to plan mode?
2. What would have happened if you used direct execution for the pagination task?
3. What would have happened if you used plan mode for the updatedAt field change?
4. In what situation might you start with direct execution and switch to plan mode?

### Expected Reflections

1. Direct was faster but plan mode produced a more thoughtful approach
2. Without planning, Claude might have implemented inconsistent pagination across endpoints
3. Plan mode would have added unnecessary overhead for a trivial change
4. When a "simple" change turns out to be more complex than expected (e.g., the field
   change requires updating serialization, validation, and migration code)

## Key Takeaways

- Match the execution mode to the task complexity
- Plan mode catches architectural issues before code is written
- Direct execution is faster but assumes the path is clear
- You can always escalate from direct to plan mode if complexity emerges
- The Explore subagent is useful for understanding before planning
