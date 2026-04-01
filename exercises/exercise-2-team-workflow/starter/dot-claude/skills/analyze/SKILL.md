---
# TODO Step 3: Add skill frontmatter
# Add the following YAML keys:
#   context: fork       — runs in a branched conversation, does not pollute main thread
#   allowed-tools:      — restrict which tools this skill can use
#     - Read
#     - Glob
#     - Grep
#   description: "Analyze code for patterns, complexity, and potential issues"
---

<!-- TODO Step 3: Write the skill prompt below.

This skill should instruct Claude to:
1. Accept a file path or directory as the argument ($ARGUMENTS)
2. Read the specified files
3. Analyze for:
   - Code complexity (deeply nested logic, long functions)
   - Error handling coverage
   - Naming consistency
   - Potential performance issues
4. Output a structured report with:
   - Summary of findings
   - List of issues with severity (high/medium/low)
   - Recommendations for improvement

Note: Because context is "fork", this analysis runs in isolation and
does not modify the main conversation context. The user sees the result
but the main thread stays clean. -->
