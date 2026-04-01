---
context: fork
allowed-tools:
  - Read
  - Grep
  - Glob
argument-hint: "Describe what aspect of the codebase you want to analyze"
---

# Codebase Analysis Skill

Analyze the codebase based on the user's request. This skill runs in a forked context
to prevent verbose search output from consuming the main conversation's context window.

## Process

1. **Discover:** Use Glob to find files matching the analysis scope
   - Identify relevant file types and directory patterns
   - Count files to gauge the scope

2. **Search:** Use Grep to find specific patterns
   - Search for imports, exports, and usage patterns
   - Identify dependencies and coupling between modules
   - Look for patterns or anti-patterns relevant to the analysis

3. **Examine:** Use Read to inspect key files
   - Read representative files to understand implementation details
   - Check configuration files for relevant settings
   - Look at test files to understand test coverage

## Output Format

Produce a structured report:

### Scope
What was analyzed (directories, file types, patterns searched).

### Findings
Organized by category:
- **Architecture:** Module boundaries, dependency direction, layering
- **Patterns:** Common patterns found, consistency across codebase
- **Issues:** Anti-patterns, inconsistencies, potential problems

### Metrics
- Total files analyzed
- Pattern frequency counts
- Dependency counts

### Recommendations
Actionable suggestions ordered by priority (high impact first).

## Constraints

- Keep the final report under 500 words
- Do not include raw search output in the report
- Focus on insights, not data dumps
- Only use the allowed tools: Read, Grep, Glob
