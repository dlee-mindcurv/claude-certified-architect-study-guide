# Domain 3: Claude Code Configuration and Workflow Optimization

## Exam Weight: 20%

Domain 3 focuses on configuring Claude Code for effective development workflows. This includes
understanding the CLAUDE.md hierarchy, creating reusable commands and skills, applying path-specific
rules, choosing between plan mode and direct execution, iterative refinement techniques, and
integrating Claude Code into CI/CD pipelines.

## Task Statements

| Task | Description |
|------|-------------|
| **3.1** | Configure the CLAUDE.md hierarchy to provide layered context (user, project, directory levels) |
| **3.2** | Create and manage commands (slash commands) and skills for repeatable workflows |
| **3.3** | Apply path-specific rules using `.claude/rules/` with glob patterns |
| **3.4** | Determine when to use plan mode versus direct execution |
| **3.5** | Apply iterative refinement techniques (input/output examples, test-driven iteration, interview pattern) |
| **3.6** | Integrate Claude Code into CI/CD pipelines using non-interactive mode and structured output |

## Primary Scenario Coverage

This domain primarily covers the following certification scenarios:

- **Scenario 2 (Code Generation):** Tasks 3.1, 3.2, 3.3, 3.5 -- Configuring Claude Code for
  consistent, high-quality code generation across a team.
- **Scenario 4 (Developer Productivity):** Tasks 3.2, 3.4 -- Creating reusable commands and skills
  that accelerate daily development workflows.
- **Scenario 5 (CI/CD Integration):** Task 3.6 -- Running Claude Code in automated pipelines for
  code review, test generation, and quality checks.

## Study Approach

Each task directory contains:
- `README.md` -- Concept explanation and exam-relevant details
- `exercise.md` -- Hands-on practice exercise
- `examples/` -- Working configuration examples you can copy and adapt
- `scenario-*` -- Scenario-specific examples mapped to certification scenarios

Start with Task 3.1 (CLAUDE.md hierarchy) as it is foundational to all other tasks in this domain.
