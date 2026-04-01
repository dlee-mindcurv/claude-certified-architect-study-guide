# Exercise: Commands and Skills

## Objective

Create a project-scoped review command and a forked skill. Verify the skill runs in
isolation and does not pollute the main conversation context.

## Part 1: Create a /review Command

### Step 1: Create the command file

Create `.claude/commands/review.md` in your project with the following content:

```markdown
Perform a thorough code review of the staged changes (use `git diff --cached`).

Check for:
1. **Correctness:** Logic errors, off-by-one errors, null/undefined handling
2. **Security:** SQL injection, XSS, hardcoded secrets, insecure defaults
3. **Performance:** N+1 queries, unnecessary re-renders, missing indexes
4. **Style:** Naming conventions, code organization, dead code
5. **Testing:** Are new code paths tested? Are edge cases covered?

For each finding, provide:
- Severity: Critical / Warning / Suggestion
- File and line number
- Description of the issue
- Suggested fix

End with a summary: total findings by severity and an overall recommendation
(Approve / Request Changes).
```

### Step 2: Test the command

1. Stage some changes with `git add`
2. Type `/review` in Claude Code
3. Verify the review checklist is applied consistently

## Part 2: Create a Forked Skill

### Step 1: Create the skill directory and SKILL.md

Create `.claude/skills/codebase-analysis/SKILL.md`:

```yaml
---
context: fork
allowed-tools:
  - Read
  - Grep
  - Glob
argument-hint: "Describe what aspect of the codebase to analyze"
---
```

```markdown
Analyze the codebase based on the user's request. Follow these steps:

1. Use Glob to find relevant files matching the analysis scope
2. Use Grep to search for specific patterns, imports, or usage
3. Use Read to examine key files in detail

Produce a structured analysis report with:
- **Scope:** What was analyzed
- **Findings:** Key observations organized by category
- **Metrics:** File counts, pattern frequencies, dependency counts
- **Recommendations:** Actionable suggestions based on findings

Keep the final report concise (under 500 words). The intermediate search
results should not be included in the report.
```

### Step 2: Test the skill

1. Invoke the skill: type the skill name and provide an argument like
   "Analyze the error handling patterns in this codebase"
2. Observe that the skill runs and returns a summary report
3. Check the main conversation: intermediate Grep/Glob results should NOT
   appear because `context: fork` isolates them

## Part 3: Verify Isolation

### Test: Compare forked vs non-forked behavior

1. **Without fork:** Temporarily remove `context: fork` from the SKILL.md frontmatter.
   Run the analysis skill. Notice that all Grep results, file contents, and intermediate
   output appear in the main conversation.

2. **With fork:** Restore `context: fork`. Run the same analysis. Notice that only the
   final summary report appears in the main conversation.

### Why this matters

In a long coding session, context is precious. Forked skills prevent diagnostic or
analysis tasks from consuming context that should be reserved for your primary work.

## Verification Checklist

- [ ] `/review` command exists in `.claude/commands/review.md`
- [ ] Command produces consistent review output when invoked
- [ ] Skill exists in `.claude/skills/codebase-analysis/SKILL.md`
- [ ] Skill has `context: fork` in frontmatter
- [ ] Skill only uses allowed tools (Read, Grep, Glob)
- [ ] Main conversation shows only the final report, not intermediate output
- [ ] `$ARGUMENTS` or `argument-hint` allows dynamic input

## Key Takeaways

- Commands are simple prompt templates; skills add execution control
- `context: fork` isolates verbose output from the main conversation
- `allowed-tools` restricts what a skill can do, limiting blast radius
- Project-scoped commands/skills are shared; user-scoped are personal
