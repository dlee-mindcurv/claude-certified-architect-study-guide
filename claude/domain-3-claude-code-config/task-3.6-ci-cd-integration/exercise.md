# Exercise: CI/CD Integration with Claude Code

## Objective

Create a CI pipeline that uses Claude Code for automated code review with structured output.

## Part 1: Create a Review Prompt Script

### Step 1: Write the review script

Create a shell script `review.sh` that:
1. Gets the diff of changed files
2. Passes it to Claude Code with `-p` flag
3. Uses `--output-format json` for structured output
4. Captures the result

```bash
#!/bin/bash
set -euo pipefail

# Get the diff of changes
DIFF=$(git diff origin/main...HEAD)

# Run Claude Code review with structured output
claude -p "Review the following code changes for issues:

$DIFF

Focus on: security, performance, correctness, and style." \
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
  }'
```

### Step 2: Test the script locally

1. Make some changes on a branch
2. Run `bash review.sh`
3. Verify the output is valid JSON matching the schema
4. Check that the review findings are relevant

## Part 2: Create a GitHub Action

### Step 1: Write the workflow file

Create `.github/workflows/claude-review.yml`:

```yaml
name: Claude Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run Code Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          DIFF=$(git diff origin/${{ github.base_ref }}...HEAD)
          claude -p "Review these changes: $DIFF" \
            --output-format json > review.json

      - name: Process Review Results
        run: |
          # Parse and display results
          cat review.json | jq '.issues[] | "\(.severity): \(.file) - \(.description)"'
```

### Step 2: Verify the configuration

- [ ] The workflow triggers on PR events
- [ ] The checkout step fetches full history (`fetch-depth: 0`)
- [ ] The API key is stored as a repository secret
- [ ] The review output is captured as JSON
- [ ] Results are processed and displayed

## Part 3: Add Session Isolation

### Step 1: Separate review and test generation

Add a second job for test generation that runs independently:

```yaml
  test-generation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code
      - name: Generate Tests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          CHANGED_FILES=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)
          claude -p "Generate tests for these files: $CHANGED_FILES" \
            --output-format json > tests.json
```

### Verification

- [ ] Review and test generation run in separate jobs (session isolation)
- [ ] Each job uses a fresh `claude -p` invocation
- [ ] Results are captured independently
- [ ] Failure in one job does not affect the other

## Part 4: Thought Questions

1. **Why use `--output-format json` instead of plain text in CI?**
   JSON can be parsed programmatically by downstream tools. Plain text requires
   fragile regex parsing.

2. **What role does CLAUDE.md play in CI?**
   It provides the same coding standards and project context that developers use
   interactively. This ensures automated reviews apply the same criteria as manual ones.

3. **Why separate review and test generation into different sessions?**
   Session isolation prevents one task's context from influencing another. Each task
   has different objectives and should run independently.

4. **How does `--json-schema` improve reliability?**
   It forces the output into a predictable structure. Without it, the JSON shape might
   vary between runs, breaking downstream parsing scripts.

## Key Takeaways

- `-p` flag enables non-interactive CI execution
- `--output-format json` + `--json-schema` ensures parseable, predictable output
- Separate `claude -p` invocations provide session isolation
- CLAUDE.md conventions apply in CI the same as in interactive use
- Store API keys as CI secrets, never in config files
