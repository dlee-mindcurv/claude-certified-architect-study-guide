# Task 3.4: Determine When to Use Plan Mode vs Direct Execution

## Overview

Claude Code offers two primary execution modes: **plan mode** (where Claude proposes a plan
before acting) and **direct execution** (where Claude immediately takes action). Choosing the
right mode impacts quality, speed, and developer control. The exam tests your ability to
identify which mode is appropriate for a given scenario.

## Plan Mode

### What It Is

In plan mode, Claude Code first analyzes the task, explores the codebase, and produces a
structured plan before making any changes. The developer reviews and approves the plan before
execution begins.

### When to Use Plan Mode

- **Complex, multi-file changes:** Refactoring that touches many files or modules
- **Multiple valid approaches:** When there is more than one reasonable way to implement
  something and the trade-offs should be discussed
- **Architectural decisions:** Adding new patterns, changing data flow, modifying module boundaries
- **Unfamiliar codebase areas:** When Claude needs to explore and understand before acting
- **High-risk changes:** Modifications to critical paths (authentication, payments, data migration)
- **Ambiguous requirements:** When the task description leaves room for interpretation

### Benefits

- Developer reviews the approach before any code is written
- Catches misunderstandings early (before wasted effort)
- Produces better results for complex tasks
- Documents the reasoning behind implementation choices

## Direct Execution

### What It Is

In direct execution, Claude Code immediately begins making changes without first proposing
a plan. This is the default behavior for straightforward prompts.

### When to Use Direct Execution

- **Well-scoped changes:** Single-file edits with clear requirements
- **Clear, unambiguous tasks:** "Add a `createdAt` field to the User model"
- **Repetitive operations:** Applying the same pattern across multiple files
- **Small fixes:** Bug fixes where the problem and solution are obvious
- **Following established patterns:** Adding a new endpoint that follows existing patterns

### Benefits

- Faster for simple tasks
- Less cognitive overhead for the developer
- Appropriate when the "how" is obvious from the "what"

## The Explore Subagent

Claude Code can spawn an **Explore subagent** to investigate the codebase before committing
to a plan. This is useful when:

- You need to understand the existing code before deciding on an approach
- You want to gather context without consuming the main conversation's context window
- The task requires understanding patterns across many files

The Explore subagent runs in a forked context (similar to skills with `context: fork`),
so its verbose search output does not fill the main conversation.

### Usage Pattern

1. Ask Claude to explore before planning: "Explore how authentication is implemented, then
   propose a plan for adding OAuth support"
2. The Explore subagent reads files, searches patterns, and summarizes findings
3. The summary returns to the main context
4. Claude uses the summary to create a better-informed plan

## Decision Framework

```
Is the task well-defined with clear requirements?
  |
  +-- YES --> Is it a single-file or small change?
  |             |
  |             +-- YES --> DIRECT EXECUTION
  |             |
  |             +-- NO  --> Are there multiple valid approaches?
  |                           |
  |                           +-- YES --> PLAN MODE
  |                           |
  |                           +-- NO  --> DIRECT EXECUTION
  |
  +-- NO  --> Does it require exploring unfamiliar code?
                |
                +-- YES --> EXPLORE + PLAN MODE
                |
                +-- NO  --> PLAN MODE
```

## Exam Tips

- Know the criteria for choosing plan mode vs direct execution
- Understand that plan mode adds a review step before code changes
- Know that the Explore subagent preserves main context by running in a fork
- Be able to classify example tasks as plan-mode or direct-execution candidates
- Understand that plan mode is about managing risk and complexity, not about speed
