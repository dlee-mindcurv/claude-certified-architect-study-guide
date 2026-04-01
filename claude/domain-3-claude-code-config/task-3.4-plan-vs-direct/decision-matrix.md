# Decision Matrix: Plan Mode vs Direct Execution

## Quick Decision Flowchart

```
                        START
                          |
                          v
              Is the task well-defined?
              (clear inputs, outputs, scope)
                    /           \
                  YES            NO
                  |               |
                  v               v
          Is it a single-file    Use PLAN MODE
          or small change?       (clarify requirements
                /       \        before acting)
              YES        NO
              |           |
              v           v
        DIRECT        Are there multiple
        EXECUTION     valid approaches?
                        /       \
                      YES        NO
                      |           |
                      v           v
                  PLAN MODE    Is it high-risk?
                               (auth, payments,
                                data migration)
                                 /       \
                               YES        NO
                               |           |
                               v           v
                           PLAN MODE    DIRECT
                                        EXECUTION
```

## Decision Matrix Table

| Factor | Direct Execution | Plan Mode |
|--------|:----------------:|:---------:|
| Single file change | X | |
| Multi-file change | | X |
| Clear requirements | X | |
| Ambiguous requirements | | X |
| One obvious approach | X | |
| Multiple valid approaches | | X |
| Following existing pattern | X | |
| Introducing new pattern | | X |
| Low-risk change | X | |
| High-risk change | | X |
| Bug fix (known cause) | X | |
| Bug fix (unknown cause) | | X |
| Simple addition | X | |
| Architectural refactor | | X |
| Repetitive operation | X | |
| Cross-cutting concern | | X |

## Scoring Guide

Count the checkmarks in each column for your task. Use whichever column has more.
If it is a tie, prefer plan mode (safer for uncertain situations).

## When to Switch Modes Mid-Task

### Escalate to Plan Mode when:
- You started direct execution but discovered the change affects more files than expected
- The "simple" change has hidden dependencies
- You realize there are multiple valid approaches
- The change impacts critical paths

### Drop to Direct Execution when:
- The plan is approved and individual steps are straightforward
- Each step in the plan is a well-scoped, single-file change
- The exploration phase revealed a simpler solution than expected

## Role of the Explore Subagent

Use the Explore subagent before planning when:

| Situation | Why Explore First |
|-----------|------------------|
| Unfamiliar codebase | Understand patterns before proposing changes |
| Complex existing system | Map dependencies before planning modifications |
| Multiple potential locations | Find the right place to make changes |
| Inconsistent codebase | Understand which pattern to follow |

The Explore subagent runs in a forked context, so its search output does not consume
your main conversation's context. This makes it ideal for pre-planning investigation.

## Common Anti-Patterns

### Using Plan Mode When Direct is Better
- **Symptom:** Planning takes longer than the change itself
- **Example:** Planning how to rename a variable
- **Fix:** Just do it directly

### Using Direct Execution When Plan is Better
- **Symptom:** Multiple revisions needed, inconsistent changes, missed files
- **Example:** Directly implementing a new feature across 10 files
- **Fix:** Step back, explore, plan, then execute

### Skipping Explore When It Would Help
- **Symptom:** Plan is based on assumptions that turn out to be wrong
- **Example:** Planning a refactor without understanding the current architecture
- **Fix:** Use the Explore subagent before planning
