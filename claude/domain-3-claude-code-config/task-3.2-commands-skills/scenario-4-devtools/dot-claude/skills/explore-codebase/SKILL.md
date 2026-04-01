---
context: fork
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
argument-hint: "What do you want to understand about this codebase?"
---

# Codebase Exploration Skill -- Developer Productivity Scenario

This skill is designed for developers who are onboarding to a new codebase or exploring
unfamiliar areas. It runs in a forked context so the extensive file reading and searching
does not consume the main conversation's context.

## Process

1. **Map the structure:** Use Glob to understand the project layout
   - Find top-level directories and key configuration files
   - Identify the package manager, framework, and build tools
   - Locate entry points (main files, index files, app routers)

2. **Trace the flow:** Based on the user's question, trace the relevant code path
   - Find the entry point for the feature or module in question
   - Follow imports to understand the dependency chain
   - Identify the key files involved in the flow

3. **Understand patterns:** Use Grep to find recurring patterns
   - How are errors handled?
   - How is state managed?
   - What patterns are used for data fetching?
   - How are tests structured?

4. **Read key files:** Use Read to examine the most important files
   - Configuration files (tsconfig, package.json, etc.)
   - Core modules and shared utilities
   - The specific files relevant to the user's question

## Output

Provide a clear, concise explanation that answers the user's question:

### Architecture Overview
Brief description of the relevant architecture (2-3 sentences).

### Key Files
List the most important files and their roles (5-10 files max).

### How It Works
Step-by-step explanation of the code flow relevant to the question.

### Related Patterns
Other patterns in the codebase that are related or similar.

### Gotchas
Non-obvious things to watch out for when working in this area.

## Guidelines

- Prioritize clarity over completeness
- Use concrete file paths and function names
- Explain the "why" behind architectural decisions when apparent
- Keep the final answer under 800 words
- Do not dump raw file contents; synthesize and explain
