/**
 * Scenario 4: Dev Productivity — Scratchpad-Based Context Management
 *
 * Exam relevance (Task 5.4):
 * - Scratchpad files persist key findings beyond the context window
 * - Subagent delegation keeps main agent context focused
 * - Structured state enables crash recovery
 * - Complements /compact by preserving exact details that summaries lose
 *
 * This module provides:
 * 1. Scratchpad file management (init, append, read, clear)
 * 2. Structured state export/import for session resumption
 * 3. Subagent delegation framework for codebase investigation
 * 4. Context-efficient coordination pattern
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Scratchpad Configuration ────────────────────────────────────────────────

const DEFAULT_SCRATCHPAD_DIR = join(__dirname, '.claude');
const SCRATCHPAD_FILENAME = 'scratchpad.md';
const STATE_FILENAME = 'state.json';

// ─── Scratchpad Manager ──────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The scratchpad is a FILE that persists beyond the context
// window. Key findings are written to it after each investigation phase.
// When /compact is used or a new session starts, the scratchpad provides
// a reliable source of truth for previous discoveries.

export class Scratchpad {
  constructor(baseDir = DEFAULT_SCRATCHPAD_DIR) {
    this.baseDir = baseDir;
    this.scratchpadPath = join(baseDir, SCRATCHPAD_FILENAME);
    this.statePath = join(baseDir, STATE_FILENAME);
    this.ensureDir();
  }

  ensureDir() {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  // ── Scratchpad File Operations ─────────────────────────────────────────────

  /**
   * Initialize a new scratchpad for a task.
   *
   * @param {string} taskDescription - What the investigation is about
   * @returns {string} Path to the scratchpad file
   */
  init(taskDescription) {
    const content = [
      '# Investigation Scratchpad',
      `Task: ${taskDescription}`,
      `Created: ${new Date().toISOString()}`,
      '',
      '---',
      '',
    ].join('\n');

    writeFileSync(this.scratchpadPath, content, 'utf-8');
    return this.scratchpadPath;
  }

  /**
   * Append a findings section to the scratchpad.
   *
   * Each section has a clear header so it can be located reliably.
   * Findings are structured as key-value pairs or bullet lists.
   *
   * @param {string} sectionName - Header for this section (e.g., "Architecture")
   * @param {object} findings - Structured findings to record
   */
  appendSection(sectionName, findings) {
    const lines = [
      `## ${sectionName}`,
      `Updated: ${new Date().toISOString()}`,
      '',
    ];

    // Handle different finding shapes
    if (findings.summary) {
      lines.push(`**Summary:** ${findings.summary}`, '');
    }

    if (findings.keyFiles) {
      lines.push('**Key files:**');
      findings.keyFiles.forEach(f => lines.push(`- \`${f}\``));
      lines.push('');
    }

    if (findings.findings) {
      lines.push('**Findings:**');
      findings.findings.forEach(f => {
        if (typeof f === 'string') {
          lines.push(`- ${f}`);
        } else if (f.file) {
          lines.push(`- \`${f.file}\`: ${f.finding}`);
        } else if (f.claim) {
          lines.push(`- ${f.claim} (${f.confidence || 'unknown'} confidence)`);
        }
      });
      lines.push('');
    }

    if (findings.callers) {
      lines.push('**Callers:**');
      findings.callers.forEach(c => {
        lines.push(`- \`${c.file}\` → \`${c.function}\`: ${c.lineContext}`);
      });
      lines.push('');
    }

    if (findings.concerns) {
      lines.push('**Concerns:**');
      findings.concerns.forEach(c => lines.push(`- ${c}`));
      lines.push('');
    }

    if (findings.missingScenarios) {
      lines.push('**Missing test scenarios:**');
      findings.missingScenarios.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }

    if (findings.nextSteps) {
      lines.push('**Next steps:**');
      findings.nextSteps.forEach(s => lines.push(`- [ ] ${s}`));
      lines.push('');
    }

    lines.push('---', '');

    // Append to existing scratchpad
    const existing = this.read() || '';
    writeFileSync(this.scratchpadPath, existing + lines.join('\n'), 'utf-8');
  }

  /**
   * Read the entire scratchpad content.
   *
   * @returns {string|null} Scratchpad content or null if not found
   */
  read() {
    if (!existsSync(this.scratchpadPath)) return null;
    return readFileSync(this.scratchpadPath, 'utf-8');
  }

  /**
   * Check if a scratchpad exists from a previous session.
   *
   * @returns {boolean}
   */
  exists() {
    return existsSync(this.scratchpadPath);
  }

  /**
   * Clear the scratchpad (start fresh).
   */
  clear() {
    if (existsSync(this.scratchpadPath)) {
      unlinkSync(this.scratchpadPath);
    }
  }

  // ── State Management ──────────────────────────────────────────────────────

  /**
   * Export structured state for crash recovery.
   *
   * EXAM KEY CONCEPT: State includes enough information to resume the
   * investigation without repeating completed phases. This pairs with
   * the scratchpad: state says WHERE to resume, scratchpad says WHAT
   * was discovered.
   *
   * @param {object} state - Structured state to export
   */
  exportState(state) {
    const stateWithMeta = {
      ...state,
      exportedAt: new Date().toISOString(),
      scratchpadPath: this.scratchpadPath,
    };
    writeFileSync(this.statePath, JSON.stringify(stateWithMeta, null, 2), 'utf-8');
  }

  /**
   * Import state from a previous session.
   *
   * @returns {object|null} Previous state or null if none exists
   */
  importState() {
    if (!existsSync(this.statePath)) return null;
    const raw = readFileSync(this.statePath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Clear saved state.
   */
  clearState() {
    if (existsSync(this.statePath)) {
      unlinkSync(this.statePath);
    }
  }
}

// ─── Subagent Delegation Framework ───────────────────────────────────────────
//
// EXAM KEY CONCEPT: The main agent delegates specific investigation questions
// to subagents. Each subagent has a focused context (only relevant files)
// and returns a structured summary. The main agent never holds raw file
// contents in its context.

/**
 * An investigation phase definition.
 * Used by the coordinator to plan and execute subagent delegations.
 */
export class InvestigationPhase {
  /**
   * @param {object} config
   * @param {string} config.name - Phase name (e.g., "architecture")
   * @param {string} config.question - The investigation question
   * @param {string[]} config.relevantFiles - Files the subagent should read
   * @param {string} config.outputFormat - Expected output structure description
   * @param {string[]} config.dependsOn - Phase names this depends on
   */
  constructor({ name, question, relevantFiles, outputFormat, dependsOn = [] }) {
    this.name = name;
    this.question = question;
    this.relevantFiles = relevantFiles;
    this.outputFormat = outputFormat;
    this.dependsOn = dependsOn;
    this.status = 'pending';     // pending | in_progress | completed | skipped
    this.result = null;
  }
}

/**
 * Coordinator that manages investigation phases.
 *
 * Responsibilities:
 * 1. Execute phases in dependency order
 * 2. Pass previous phase results to dependent phases
 * 3. Write findings to scratchpad after each phase
 * 4. Export state after each phase for crash recovery
 */
export class InvestigationCoordinator {
  constructor(task, scratchpad) {
    this.task = task;
    this.scratchpad = scratchpad;
    this.phases = [];
    this.completedPhases = new Set();
  }

  addPhase(phase) {
    this.phases.push(phase);
  }

  /**
   * Resume from a saved state, skipping completed phases.
   */
  resumeFrom(savedState) {
    if (!savedState) return;

    const completedNames = savedState.completedPhases || [];
    for (const phase of this.phases) {
      if (completedNames.includes(phase.name)) {
        phase.status = 'completed';
        this.completedPhases.add(phase.name);
        console.log(`  [Resume] Skipping completed phase: ${phase.name}`);
      }
    }
  }

  /**
   * Get the next phase to execute (respecting dependencies).
   */
  getNextPhase() {
    for (const phase of this.phases) {
      if (phase.status !== 'pending') continue;

      // Check if all dependencies are completed
      const depsReady = phase.dependsOn.every(dep => this.completedPhases.has(dep));
      if (depsReady) return phase;
    }
    return null;
  }

  /**
   * Mark a phase as completed and record its results.
   *
   * @param {InvestigationPhase} phase
   * @param {object} result - Subagent's structured findings
   */
  completePhase(phase, result) {
    phase.status = 'completed';
    phase.result = result;
    this.completedPhases.add(phase.name);

    // Write to scratchpad
    this.scratchpad.appendSection(
      phase.name.charAt(0).toUpperCase() + phase.name.slice(1),
      result
    );

    // Export state for crash recovery
    this.scratchpad.exportState({
      task: this.task,
      currentPhase: phase.name,
      completedPhases: Array.from(this.completedPhases),
      nextPhase: this.getNextPhase()?.name || 'done',
    });

    console.log(`  [Coordinator] Phase "${phase.name}" completed and recorded`);
  }

  /**
   * Check if all phases are done.
   */
  isComplete() {
    return this.phases.every(p => p.status === 'completed' || p.status === 'skipped');
  }

  /**
   * Get a summary of all completed findings (for the main agent's context).
   *
   * EXAM KEY CONCEPT: The main agent only holds this summary, not the raw
   * file contents that each subagent read. This keeps the main context lean.
   */
  getSummary() {
    const summaries = {};
    for (const phase of this.phases) {
      if (phase.result?.summary) {
        summaries[phase.name] = phase.result.summary;
      }
    }
    return summaries;
  }
}

// ─── Demo: Full Investigation Flow ──────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Scenario 4: Dev Productivity — Scratchpad Context Management');
  console.log('='.repeat(60));

  const scratchpad = new Scratchpad();

  // Check for crash recovery
  const savedState = scratchpad.importState();
  if (savedState) {
    console.log(`\n  [Recovery] Found saved state from: ${savedState.exportedAt}`);
    console.log(`  [Recovery] Last phase: ${savedState.currentPhase}`);
    console.log(`  [Recovery] Completed: ${savedState.completedPhases?.join(', ')}`);
  }

  // Initialize scratchpad
  const task = 'Fix authentication timeout bug — expired tokens are accepted';
  scratchpad.init(task);
  console.log(`\n  [Init] Task: ${task}`);

  // Set up investigation coordinator
  const coordinator = new InvestigationCoordinator(task, scratchpad);

  coordinator.addPhase(new InvestigationPhase({
    name: 'architecture',
    question: 'What is the structure of the authentication module?',
    relevantFiles: ['src/auth/validate.js', 'src/auth/refresh.js', 'src/middleware/auth.js'],
    outputFormat: 'Module graph with key functions and dependencies',
  }));

  coordinator.addPhase(new InvestigationPhase({
    name: 'callers',
    question: 'What functions call validateToken?',
    relevantFiles: ['src/auth/refresh.js', 'src/middleware/auth.js', 'src/routes/api.js'],
    outputFormat: 'Caller list with file, function, and context',
    dependsOn: ['architecture'],
  }));

  coordinator.addPhase(new InvestigationPhase({
    name: 'testCoverage',
    question: 'What test coverage exists for token validation?',
    relevantFiles: ['test/auth/validate.test.js'],
    outputFormat: 'Covered and missing scenarios with test file references',
    dependsOn: ['architecture'],
  }));

  // Resume from saved state if available
  coordinator.resumeFrom(savedState);

  // Execute phases
  while (!coordinator.isComplete()) {
    const phase = coordinator.getNextPhase();
    if (!phase) {
      console.log('  [Coordinator] No more phases can execute (dependency deadlock?)');
      break;
    }

    console.log(`\n--- Phase: ${phase.name} ---`);
    console.log(`  Question: ${phase.question}`);
    console.log(`  Files: ${phase.relevantFiles.join(', ')}`);

    // Simulate subagent execution (in production, this would be a Claude API call)
    const result = simulateSubagent(phase);
    coordinator.completePhase(phase, result);
  }

  // Print final summary
  console.log('\n' + '='.repeat(60));
  console.log('Investigation Complete');
  console.log('='.repeat(60));

  const summary = coordinator.getSummary();
  for (const [phase, text] of Object.entries(summary)) {
    console.log(`\n  ${phase}: ${text}`);
  }

  console.log(`\n  Scratchpad: ${scratchpad.scratchpadPath}`);
  console.log(`  State: ${scratchpad.statePath}`);

  // Show scratchpad content
  console.log('\n--- Scratchpad Content ---');
  console.log(scratchpad.read());
}

function simulateSubagent(phase) {
  const results = {
    architecture: {
      summary: 'Auth module: validate.js (core) -> refresh.js (renewal) -> middleware/auth.js (Express). Bug: no expiration check in validateToken.',
      keyFiles: phase.relevantFiles,
      findings: [
        { file: 'src/auth/validate.js', finding: 'Uses jwt.verify but skips expiration check' },
        { file: 'src/auth/refresh.js', finding: 'Depends on validateToken for token renewal' },
        { file: 'src/middleware/auth.js', finding: 'Wraps validateToken; generic error handling' },
      ],
      concerns: ['No expiration check', 'Generic error messages'],
    },
    callers: {
      summary: 'validateToken has 3 callers: refreshToken (refresh.js), authMiddleware (auth.js), and test suite.',
      callers: [
        { file: 'src/auth/refresh.js', function: 'refreshToken', lineContext: 'Decodes old token' },
        { file: 'src/middleware/auth.js', function: 'authMiddleware', lineContext: 'Validates request token' },
        { file: 'test/auth/validate.test.js', function: 'describe', lineContext: 'Unit tests' },
      ],
    },
    testCoverage: {
      summary: 'Partial coverage (~40%): valid token and invalid signature tested. Missing: expired tokens, refresh, middleware.',
      missingScenarios: [
        'Expired token rejection',
        'Token refresh with expired token',
        'Middleware error differentiation',
      ],
      nextSteps: [
        'Add expiration check in validateToken()',
        'Add expired token test case',
        'Update middleware error handling',
      ],
    },
  };

  return results[phase.name] || { summary: 'No simulation available for this phase' };
}

main().catch(console.error);
