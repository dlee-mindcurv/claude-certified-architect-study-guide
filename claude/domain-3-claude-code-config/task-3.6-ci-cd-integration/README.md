# Task 3.6: Integrate Claude Code into CI/CD Pipelines

## Overview

Claude Code can run non-interactively in CI/CD pipelines for automated code review, test
generation, and quality checks. The exam tests your knowledge of the `-p` flag for
non-interactive mode, structured output with `--output-format json`, CLAUDE.md's role in CI,
and session isolation patterns.

## The -p Flag (Non-Interactive / Pipe Mode)

### What It Is

The `-p` (or `--print`) flag runs Claude Code in non-interactive mode. It accepts a prompt,
executes it, and outputs the result to stdout. No user interaction is needed.

### Basic Usage

```bash
claude -p "Review the changes in this PR for security issues"
```

### Key Characteristics

- Reads from stdin or accepts a prompt argument
- Outputs to stdout (for capture by CI systems)
- No interactive prompts or confirmations
- Runs to completion and exits
- Returns exit code 0 on success, non-zero on failure

## Structured Output: --output-format json

### What It Is

The `--output-format json` flag tells Claude Code to return its response as structured JSON
instead of plain text. Combined with `--json-schema`, you can enforce a specific output shape.

### Usage

```bash
claude -p "Review this code for issues" \
  --output-format json
```

### With JSON Schema

```bash
claude -p "Review this code" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"issues":{"type":"array","items":{"type":"object","properties":{"severity":{"type":"string"},"file":{"type":"string"},"line":{"type":"number"},"description":{"type":"string"}}}}}}'
```

This forces the output into a predictable structure that CI scripts can parse reliably.

### Why Structured Output Matters in CI

- CI scripts need to parse results programmatically
- JSON output can be fed into other tools (JIRA ticket creation, Slack notifications)
- Schema enforcement prevents malformed output from breaking downstream steps
- Consistent structure enables aggregation and trend analysis

## CLAUDE.md in CI Context

### How It Works

When Claude Code runs in a CI pipeline, it still loads CLAUDE.md files from the repository.
This means your project's coding standards and conventions apply to automated reviews.

### CI-Specific CLAUDE.md

You can create a CLAUDE.md (or use `.claude/rules/`) that includes CI-relevant context:

- Test runner commands and expected output format
- Review criteria specific to automated checks
- Information about test fixtures and mock data locations
- Project architecture overview for better review quality
- Known issues or areas to skip during automated review

### Best Practice

Keep CI-relevant instructions in the main project CLAUDE.md or in targeted `.claude/rules/`
files. This way the same standards apply to both interactive development and automated CI checks.

## Session Isolation: Review vs Generation

### The Problem

In CI, you might want to run multiple Claude Code tasks (review + test generation) on the
same PR. Each task should run independently so they do not interfere with each other.

### The Solution

Run each task as a separate `claude -p` invocation. Each invocation is a fresh session with
no shared state.

```bash
# Task 1: Code review
claude -p "Review the PR changes" --output-format json > review.json

# Task 2: Test generation (separate session)
claude -p "Generate tests for the changed files" --output-format json > tests.json
```

### Why Session Isolation Matters

- Review context should not influence test generation
- Each task has different success criteria
- Failures in one task should not affect the other
- Results can be processed independently

## Common CI Patterns

### 1. PR Review Bot
Run on every PR to check for issues before human review.

### 2. Test Generation
Generate tests for new or modified code, then run them.

### 3. Documentation Check
Verify that documentation is updated when APIs change.

### 4. Migration Validation
Check database migrations for correctness and reversibility.

## Exam Tips

- Know the `-p` flag and its purpose (non-interactive execution)
- Know `--output-format json` and `--json-schema` for structured output
- Understand that CLAUDE.md loads in CI just like in interactive mode
- Know that separate `-p` invocations provide session isolation
- Understand the difference between review and generation tasks in CI
- Be able to construct a basic CI workflow using Claude Code
