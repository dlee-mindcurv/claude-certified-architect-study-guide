#!/bin/bash
# review-and-test.sh
#
# Scenario 5: CI pipeline script that runs both code review and test generation
# using Claude Code in non-interactive mode.
#
# Each mode runs as a separate claude -p invocation for session isolation.
#
# Usage:
#   ./review-and-test.sh review           # Run code review only
#   ./review-and-test.sh generate-tests   # Run test generation only
#   ./review-and-test.sh all              # Run both sequentially

set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-main}"

# ──────────────────────────────────────────────
# Helper Functions
# ──────────────────────────────────────────────

get_diff() {
  git fetch origin "${BASE_BRANCH}" --quiet 2>/dev/null || true
  git diff "origin/${BASE_BRANCH}...HEAD"
}

get_changed_files() {
  git fetch origin "${BASE_BRANCH}" --quiet 2>/dev/null || true
  git diff --name-only "origin/${BASE_BRANCH}...HEAD"
}

# ──────────────────────────────────────────────
# Mode: Code Review
# ──────────────────────────────────────────────

run_review() {
  echo "=== Claude Code: Automated Code Review ==="

  DIFF=$(get_diff)
  if [ -z "$DIFF" ]; then
    echo "No changes to review."
    echo '{"summary":"No changes","issues":[],"recommendation":"approve"}' > review-results.json
    return 0
  fi

  CHANGED=$(get_changed_files)
  echo "Reviewing $(echo "$CHANGED" | wc -l | tr -d ' ') changed files..."

  # Session 1: Code Review (isolated)
  # CLAUDE.md in the repo provides project context automatically
  claude -p "Review these pull request changes.

Changed files:
${CHANGED}

Diff:
${DIFF}

Apply the project's coding standards from CLAUDE.md. Focus on:
1. Security vulnerabilities (critical)
2. Performance regressions (warning)
3. Correctness and logic errors (critical/warning)
4. Missing error handling (warning)
5. Style and convention issues (suggestion)
6. Missing tests for new code paths (warning)" \
    --output-format json \
    --json-schema '{
      "type": "object",
      "properties": {
        "summary": { "type": "string" },
        "issues": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "severity": { "type": "string", "enum": ["critical", "warning", "suggestion"] },
              "file": { "type": "string" },
              "line": { "type": "number" },
              "description": { "type": "string" },
              "suggestion": { "type": "string" }
            },
            "required": ["severity", "file", "description"]
          }
        },
        "recommendation": { "type": "string", "enum": ["approve", "request_changes"] }
      },
      "required": ["summary", "issues", "recommendation"]
    }' > review-results.json

  echo ""
  echo "Review complete."
  echo "Summary: $(jq -r '.summary' review-results.json)"
  echo "Critical: $(jq '[.issues[] | select(.severity == "critical")] | length' review-results.json)"
  echo "Warning: $(jq '[.issues[] | select(.severity == "warning")] | length' review-results.json)"
  echo "Suggestion: $(jq '[.issues[] | select(.severity == "suggestion")] | length' review-results.json)"
  echo "Recommendation: $(jq -r '.recommendation' review-results.json)"
}

# ──────────────────────────────────────────────
# Mode: Test Generation
# ──────────────────────────────────────────────

run_generate_tests() {
  echo "=== Claude Code: Test Generation ==="

  CHANGED=$(get_changed_files)

  # Filter to only source files (exclude tests, configs, docs)
  SOURCE_FILES=$(echo "$CHANGED" | grep -E '\.(ts|tsx|js|jsx)$' | grep -v '\.test\.' | grep -v '\.spec\.' | grep -v '\.config\.' || true)

  if [ -z "$SOURCE_FILES" ]; then
    echo "No source files changed. Skipping test generation."
    echo '{"generated":[],"summary":"No source files to generate tests for"}' > test-results.json
    return 0
  fi

  echo "Generating tests for $(echo "$SOURCE_FILES" | wc -l | tr -d ' ') source files..."

  # Session 2: Test Generation (isolated from review session)
  # This is a completely separate claude -p invocation
  claude -p "Generate unit tests for these changed source files:

${SOURCE_FILES}

For each file:
1. Read the source file to understand the implementation
2. Generate a comprehensive test file following the project's testing conventions from CLAUDE.md
3. Place test files adjacent to source files with .test.ts suffix

Include tests for:
- Happy path
- Edge cases (null, empty, boundary values)
- Error cases

Use the project's testing framework (Vitest) with describe/it blocks." \
    --output-format json \
    --json-schema '{
      "type": "object",
      "properties": {
        "generated": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "sourceFile": { "type": "string" },
              "testFile": { "type": "string" },
              "testCount": { "type": "number" },
              "coverage": { "type": "string" }
            },
            "required": ["sourceFile", "testFile", "testCount"]
          }
        },
        "summary": { "type": "string" }
      },
      "required": ["generated", "summary"]
    }' > test-results.json

  echo ""
  echo "Test generation complete."
  echo "Summary: $(jq -r '.summary' test-results.json)"
  echo "Files generated: $(jq '.generated | length' test-results.json)"
}

# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

MODE="${1:-all}"

case "$MODE" in
  review)
    run_review
    ;;
  generate-tests)
    run_generate_tests
    ;;
  all)
    run_review
    echo ""
    echo "────────────────────────────────"
    echo ""
    run_generate_tests
    ;;
  *)
    echo "Usage: $0 {review|generate-tests|all}"
    exit 1
    ;;
esac

echo ""
echo "=== Done ==="
