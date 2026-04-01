# Exercise: Codebase Exploration with Subagent Delegation and Scratchpad

## Objective

Explore a codebase using the subagent delegation pattern and scratchpad files.
Demonstrate that subagent delegation keeps the main agent's context focused,
and that scratchpad files preserve key findings across context reductions.

## Setup

This exercise uses simulated codebase exploration. In production, subagents
would use tools like Read, Bash, Glob, and Grep to explore real files.

## Part 1: Design the Subagent Delegation Plan

Given the task "Fix a bug where expired authentication tokens are accepted,"
design a subagent delegation plan with 4 investigation phases:

### Phase 1: Architecture Discovery
**Question:** "What is the structure of the authentication module?"
**Expected output:** Module dependency graph, key functions, file list

### Phase 2: Bug Localization
**Question:** "Where does token validation occur, and does it check expiration?"
**Expected output:** Specific file and function, the exact gap identified

### Phase 3: Impact Analysis
**Question:** "What other functions call the token validation function?"
**Expected output:** Caller list with context (why each caller matters)

### Phase 4: Test Gap Analysis
**Question:** "What test coverage exists for token validation, and what is missing?"
**Expected output:** Covered scenarios, missing scenarios, affected test files

For each phase, specify:
1. The exact question for the subagent
2. Which files the subagent should read
3. The structured output format expected
4. How the output feeds into the next phase

## Part 2: Implement the Scratchpad Pattern

Build a scratchpad module with these functions:

### `initScratchpad(taskDescription)`
- Creates a new scratchpad file at `.claude/scratchpad.md`
- Writes the task header and timestamp
- Returns the scratchpad file path

### `appendFindings(section, findings)`
- Appends a new section to the scratchpad
- Each section has a header and structured findings
- Example sections: "Architecture", "Bug Location", "Callers", "Test Gaps"

### `readScratchpad()`
- Reads the entire scratchpad
- Returns the content as a string
- Used to refresh context before a new phase or after /compact

### `exportState(state)`
- Writes a JSON state file to `.claude/state.json`
- State includes: task, current phase, completed actions, next steps
- Used for crash recovery

### `importState()`
- Reads the JSON state file
- Returns null if no state exists
- Used at session start to check for resume

## Part 3: Execute the 4-Phase Investigation

Run your 4 investigation phases sequentially:

1. **After Phase 1**: Write architecture findings to scratchpad. Export state
   with `phase: 'bug_localization'`.

2. **After Phase 2**: Append bug location to scratchpad. Export state with
   `phase: 'impact_analysis'`.

3. **After Phase 3**: Append caller list to scratchpad. Export state with
   `phase: 'test_gap_analysis'`.

4. **After Phase 4**: Append test gaps to scratchpad. Export state with
   `phase: 'implementation'` and `nextSteps` list.

## Part 4: Simulate Context Reduction

After completing all 4 phases, simulate what happens when `/compact` is used:

1. Clear the in-memory conversation history (pretend it was summarized)
2. Read the scratchpad to recover key findings
3. Verify that the following information is recoverable from the scratchpad:
   - The root cause of the bug
   - The affected files
   - The callers that need updating
   - The missing test scenarios
   - The next implementation steps

## Part 5: Simulate Crash Recovery

1. After Phase 2, simulate a crash (exit the process)
2. Start a new process
3. Call `importState()` to check for saved state
4. Verify the state shows `phase: 'impact_analysis'`
5. Read the scratchpad to recover Phase 1 and Phase 2 findings
6. Resume from Phase 3

Verify that no investigation work is repeated.

## Part 6: Measure Context Efficiency

Compare two approaches to the same 4-phase investigation:

### Approach A: Single agent, all files in context
- Read all auth files into the conversation
- Ask all 4 questions sequentially
- Track total input tokens across all turns

### Approach B: Subagent delegation with scratchpad
- Each phase uses a subagent with only the relevant files
- Main agent sees only structured summaries
- Track total input tokens across all turns

Record:

| Metric | Approach A | Approach B |
|--------|-----------|-----------|
| Total input tokens | | |
| Total output tokens | | |
| Max context usage (peak) | | |
| Files read by main agent | | |
| Key facts recoverable after /compact | | |

**Expected finding:** Approach B uses fewer peak tokens because the main agent
never holds raw file contents. Approach B also preserves more key facts after
/compact because the scratchpad is an external file.

## Deliverables

1. `delegation-plan.js` -- Subagent delegation plan for 4 phases
2. `scratchpad.js` -- Scratchpad module (init, append, read, export, import)
3. `investigation-runner.js` -- Full 4-phase investigation with scratchpad
4. `crash-recovery-demo.js` -- Crash simulation and recovery
5. Context efficiency comparison notes
