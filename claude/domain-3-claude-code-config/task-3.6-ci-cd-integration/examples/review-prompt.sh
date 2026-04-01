#!/bin/bash
# review-prompt.sh
#
# Demonstrates using Claude Code's -p flag with --output-format json
# for automated code review in CI pipelines.
#
# Usage:
#   ./review-prompt.sh                    # Review changes vs main branch
#   ./review-prompt.sh feature/my-branch  # Review changes vs specified branch

set -euo pipefail

# Configuration
BASE_BRANCH="${1:-main}"
OUTPUT_FILE="review-results.json"

echo "=== Claude Code CI Review ==="
echo "Comparing HEAD against: origin/${BASE_BRANCH}"

# Ensure we have the base branch
git fetch origin "${BASE_BRANCH}" --quiet

# Get the diff
DIFF=$(git diff "origin/${BASE_BRANCH}...HEAD")

if [ -z "$DIFF" ]; then
  echo "No changes detected. Exiting."
  echo '{"summary": "No changes to review", "issues": [], "recommendation": "approve"}' > "$OUTPUT_FILE"
  exit 0
fi

# Count changed files for context
CHANGED_FILES=$(git diff --name-only "origin/${BASE_BRANCH}...HEAD")
FILE_COUNT=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')
echo "Files changed: ${FILE_COUNT}"
echo "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  /'

# Run Claude Code in non-interactive mode with structured JSON output
echo ""
echo "Running Claude Code review..."

claude -p "Review the following code changes for a pull request.

Changed files:
${CHANGED_FILES}

Diff:
${DIFF}

Provide a thorough review focusing on:
1. Security vulnerabilities
2. Performance issues
3. Correctness and potential bugs
4. Adherence to coding standards
5. Test coverage for new code paths" \
  --output-format json \
  --json-schema '{
    "type": "object",
    "properties": {
      "summary": {
        "type": "string"
      },
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": {
              "type": "string",
              "enum": ["critical", "warning", "suggestion"]
            },
            "file": { "type": "string" },
            "line": { "type": "number" },
            "description": { "type": "string" },
            "suggestion": { "type": "string" }
          },
          "required": ["severity", "file", "description"]
        }
      },
      "recommendation": {
        "type": "string",
        "enum": ["approve", "request_changes"]
      }
    },
    "required": ["summary", "issues", "recommendation"]
  }' > "$OUTPUT_FILE"

echo ""
echo "Review complete. Results saved to ${OUTPUT_FILE}"

# Parse and display summary
echo ""
echo "=== Review Summary ==="
jq -r '.summary' "$OUTPUT_FILE"

echo ""
echo "=== Issue Counts ==="
echo "Critical: $(jq '[.issues[] | select(.severity == "critical")] | length' "$OUTPUT_FILE")"
echo "Warning:  $(jq '[.issues[] | select(.severity == "warning")] | length' "$OUTPUT_FILE")"
echo "Suggestion: $(jq '[.issues[] | select(.severity == "suggestion")] | length' "$OUTPUT_FILE")"

echo ""
echo "Recommendation: $(jq -r '.recommendation' "$OUTPUT_FILE")"

# Exit with error if there are critical issues
CRITICAL_COUNT=$(jq '[.issues[] | select(.severity == "critical")] | length' "$OUTPUT_FILE")
if [ "$CRITICAL_COUNT" -gt 0 ]; then
  echo ""
  echo "FAILED: ${CRITICAL_COUNT} critical issue(s) found."
  exit 1
fi

echo ""
echo "PASSED: No critical issues found."
exit 0
