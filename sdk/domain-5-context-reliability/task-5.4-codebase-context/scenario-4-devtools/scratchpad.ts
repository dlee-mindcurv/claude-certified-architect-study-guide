/**
 * Scenario 4: Dev Productivity -- Scratchpad-Based Context Management (Agent SDK)
 *
 * Exam relevance (Task 5.4):
 * - Scratchpad files persist key findings beyond the context window
 * - Subagent delegation keeps main agent context focused
 * - Structured state enables crash recovery
 * - Complements /compact by preserving exact details that summaries lose
 *
 * EXAM KEY CONCEPT:
 *   The scratchpad is a FILE that persists beyond the context window.
 *   State says WHERE to resume; the scratchpad says WHAT was discovered.
 *   Together they enable crash recovery and context compaction survival.
 *
 * This module provides scratchpad management, state export/import,
 * and an investigation coordinator pattern using query() subagents.
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRATCHPAD_DIR = join(__dirname, '.claude');

// ─── Scratchpad Manager ──────────────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The scratchpad is a FILE that persists beyond the context
// window. When /compact is used or a new session starts, the scratchpad
// provides a reliable source of truth for previous discoveries.

interface ScratchpadFindings {
  summary?: string;
  keyFiles?: string[];
  findings?: Array<string | { file: string; finding: string }>;
  concerns?: string[];
  missingScenarios?: string[];
  nextSteps?: string[];
}

export class Scratchpad {
  baseDir: string;
  scratchpadPath: string;
  statePath: string;

  constructor(baseDir: string = DEFAULT_SCRATCHPAD_DIR) {
    this.baseDir = baseDir;
    this.scratchpadPath = join(baseDir, 'scratchpad.md');
    this.statePath = join(baseDir, 'state.json');
    this.ensureDir();
  }

  ensureDir() {
    if (!existsSync(this.baseDir)) mkdirSync(this.baseDir, { recursive: true });
  }

  init(taskDescription: string): string {
    const content = [
      '# Investigation Scratchpad',
      `Task: ${taskDescription}`,
      `Created: ${new Date().toISOString()}`,
      '', '---', '',
    ].join('\n');
    writeFileSync(this.scratchpadPath, content, 'utf-8');
    return this.scratchpadPath;
  }

  appendSection(sectionName: string, findings: ScratchpadFindings) {
    const lines: string[] = [`## ${sectionName}`, `Updated: ${new Date().toISOString()}`, ''];

    if (findings.summary) lines.push(`**Summary:** ${findings.summary}`, '');
    if (findings.keyFiles) {
      lines.push('**Key files:**');
      findings.keyFiles.forEach((f: string) => lines.push(`- \`${f}\``));
      lines.push('');
    }
    if (findings.findings) {
      lines.push('**Findings:**');
      findings.findings.forEach((f: string | { file: string; finding: string }) => {
        if (typeof f === 'string') lines.push(`- ${f}`);
        else if (f.file) lines.push(`- \`${f.file}\`: ${f.finding}`);
      });
      lines.push('');
    }
    if (findings.concerns) {
      lines.push('**Concerns:**');
      findings.concerns.forEach((c: string) => lines.push(`- ${c}`));
      lines.push('');
    }
    if (findings.missingScenarios) {
      lines.push('**Missing test scenarios:**');
      findings.missingScenarios.forEach((s: string) => lines.push(`- ${s}`));
      lines.push('');
    }
    if (findings.nextSteps) {
      lines.push('**Next steps:**');
      findings.nextSteps.forEach((s: string) => lines.push(`- [ ] ${s}`));
      lines.push('');
    }

    lines.push('---', '');
    const existing = this.read() || '';
    writeFileSync(this.scratchpadPath, existing + lines.join('\n'), 'utf-8');
  }

  read(): string | null {
    if (!existsSync(this.scratchpadPath)) return null;
    return readFileSync(this.scratchpadPath, 'utf-8');
  }

  exists(): boolean { return existsSync(this.scratchpadPath); }
  clear() { if (existsSync(this.scratchpadPath)) unlinkSync(this.scratchpadPath); }

  /**
   * EXAM KEY CONCEPT: State includes enough info to resume without repeating
   * completed phases. State says WHERE to resume; scratchpad says WHAT.
   */
  exportState(state: Record<string, unknown>) {
    const stateWithMeta = { ...state, exportedAt: new Date().toISOString(), scratchpadPath: this.scratchpadPath };
    writeFileSync(this.statePath, JSON.stringify(stateWithMeta, null, 2), 'utf-8');
  }

  importState(): Record<string, unknown> | null {
    if (!existsSync(this.statePath)) return null;
    return JSON.parse(readFileSync(this.statePath, 'utf-8'));
  }

  clearState() { if (existsSync(this.statePath)) unlinkSync(this.statePath); }
}

// ─── Investigation Phase ────────────────────────────────────────────────────

export class InvestigationPhase {
  name: string;
  question: string;
  relevantFiles: string[];
  dependsOn: string[];
  status: string;
  result: ScratchpadFindings | null;

  constructor({ name, question, relevantFiles, dependsOn = [] }: { name: string; question: string; relevantFiles: string[]; dependsOn?: string[] }) {
    this.name = name;
    this.question = question;
    this.relevantFiles = relevantFiles;
    this.dependsOn = dependsOn;
    this.status = 'pending';
    this.result = null;
  }
}

// ─── Investigation Coordinator ──────────────────────────────────────────────
//
// EXAM KEY CONCEPT: The main agent delegates specific questions to subagents.
// Each subagent has focused context. The coordinator only holds summaries.

export class InvestigationCoordinator {
  task: string;
  scratchpad: Scratchpad;
  phases: InvestigationPhase[];
  completedPhases: Set<string>;

  constructor(task: string, scratchpad: Scratchpad) {
    this.task = task;
    this.scratchpad = scratchpad;
    this.phases = [];
    this.completedPhases = new Set();
  }

  addPhase(phase: InvestigationPhase) { this.phases.push(phase); }

  resumeFrom(savedState: Record<string, unknown> | null) {
    if (!savedState) return;
    for (const phase of this.phases) {
      if (((savedState.completedPhases as string[]) || []).includes(phase.name)) {
        phase.status = 'completed';
        this.completedPhases.add(phase.name);
        console.log(`  [Resume] Skipping completed phase: ${phase.name}`);
      }
    }
  }

  getNextPhase(): InvestigationPhase | null {
    for (const phase of this.phases) {
      if (phase.status !== 'pending') continue;
      if (phase.dependsOn.every((dep: string) => this.completedPhases.has(dep))) return phase;
    }
    return null;
  }

  completePhase(phase: InvestigationPhase, result: ScratchpadFindings) {
    phase.status = 'completed';
    phase.result = result;
    this.completedPhases.add(phase.name);

    this.scratchpad.appendSection(
      phase.name.charAt(0).toUpperCase() + phase.name.slice(1),
      result
    );

    this.scratchpad.exportState({
      task: this.task,
      currentPhase: phase.name,
      completedPhases: Array.from(this.completedPhases),
      nextPhase: this.getNextPhase()?.name || 'done',
    });

    console.log(`  [Coordinator] Phase "${phase.name}" completed and recorded`);
  }

  isComplete(): boolean { return this.phases.every((p: InvestigationPhase) => p.status === 'completed' || p.status === 'skipped'); }

  getSummary(): Record<string, string> {
    const summaries: Record<string, string> = {};
    for (const phase of this.phases) {
      if (phase.result?.summary) summaries[phase.name] = phase.result.summary;
    }
    return summaries;
  }
}

// ─── Subagent Execution via query() ─────────────────────────────────────────

async function runSubagent(phase: InvestigationPhase, codeContext: string): Promise<ScratchpadFindings> {
  let result = '';

  for await (const message of query({
    prompt: `${phase.question}\n\nRelevant files: ${phase.relevantFiles.join(', ')}\n\nCode context:\n${codeContext}`,
    options: {
      systemPrompt: 'You are a code investigation subagent. Return structured JSON findings with summary, findings array, and concerns array.',
      maxTurns: 1,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
    }
  }

  return { summary: result, keyFiles: phase.relevantFiles };
}

// ─── Demo ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Scenario 4: Dev Productivity -- Scratchpad Context Management');
  console.log('='.repeat(60));

  const scratchpad = new Scratchpad();
  const savedState = scratchpad.importState();

  if (savedState) {
    console.log(`\n  [Recovery] Found saved state from: ${savedState.exportedAt}`);
  }

  const task = 'Fix authentication timeout bug -- expired tokens are accepted';
  scratchpad.init(task);

  const coordinator = new InvestigationCoordinator(task, scratchpad);

  coordinator.addPhase(new InvestigationPhase({
    name: 'architecture',
    question: 'What is the structure of the authentication module?',
    relevantFiles: ['src/auth/validate.js', 'src/auth/refresh.js', 'src/middleware/auth.js'],
  }));

  coordinator.addPhase(new InvestigationPhase({
    name: 'callers',
    question: 'What functions call validateToken?',
    relevantFiles: ['src/auth/refresh.js', 'src/middleware/auth.js', 'src/routes/api.js'],
    dependsOn: ['architecture'],
  }));

  coordinator.addPhase(new InvestigationPhase({
    name: 'testCoverage',
    question: 'What test coverage exists for token validation?',
    relevantFiles: ['test/auth/validate.test.js'],
    dependsOn: ['architecture'],
  }));

  coordinator.resumeFrom(savedState);

  // Simulated code context
  const codeContext = `
validateToken: jwt.verify without expiration check
refreshToken: depends on validateToken
authMiddleware: wraps validateToken for Express routes
Tests: valid token + invalid signature only, no expired token test
  `.trim();

  // Execute phases using simulated subagent results
  const results: Record<string, ScratchpadFindings> = {
    architecture: {
      summary: 'Auth module: validate.js (core) -> refresh.js (renewal) -> middleware/auth.js. Bug: no expiration check.',
      keyFiles: ['src/auth/validate.js', 'src/auth/refresh.js', 'src/middleware/auth.js'],
      findings: [{ file: 'src/auth/validate.js', finding: 'Uses jwt.verify but skips expiration check' }],
      concerns: ['No expiration check', 'Generic error messages'],
    },
    callers: {
      summary: 'validateToken has 3 callers: refreshToken, authMiddleware, and test suite.',
    },
    testCoverage: {
      summary: 'Partial coverage (~40%): valid token and invalid signature tested.',
      missingScenarios: ['Expired token rejection', 'Token refresh with expired token'],
      nextSteps: ['Add expiration check', 'Add expired token test case'],
    },
  };

  while (!coordinator.isComplete()) {
    const phase = coordinator.getNextPhase();
    if (!phase) break;

    console.log(`\n--- Phase: ${phase.name} ---`);

    // Simulated results (in production, use runSubagent)
    coordinator.completePhase(phase, results[phase.name]!);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Investigation Complete');
  console.log('='.repeat(60));

  const summary = coordinator.getSummary();
  for (const [phase, text] of Object.entries(summary)) {
    console.log(`\n  ${phase}: ${text}`);
  }

  console.log(`\n  Scratchpad: ${scratchpad.scratchpadPath}`);
  console.log(`  State: ${scratchpad.statePath}`);
}

main().catch(console.error);
