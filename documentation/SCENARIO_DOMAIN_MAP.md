# Scenario-Domain Cross-Reference Map

Use this map to study by scenario (preparing for which 4 you'll get) or by domain (studying by weight).

## Scenarios → Domains

### S1: Customer Support Resolution Agent (Agent SDK)
| Domain | Task | What's Tested |
|--------|------|---------------|
| D1 | 1.1 Agentic loops | CSR agent loop: stop_reason handling, tool result appending |
| D1 | 1.4 Enforcement & handoff | Prerequisite gates (get_customer before process_refund), structured handoff summaries |
| D1 | 1.5 Hooks | PostToolUse data normalization, refund threshold enforcement |
| D2 | 2.1 Tool descriptions | Differentiating get_customer vs lookup_order with clear descriptions |
| D2 | 2.2 Structured errors | Error categories (transient/validation/business/permission) for CSR tools |
| D4 | 4.2 Few-shot prompting | Escalation decision examples in system prompt |
| D5 | 5.1 Context preservation | Case facts block for multi-turn support sessions |
| D5 | 5.2 Escalation patterns | When to escalate vs resolve, honoring customer requests |

### S2: Code Generation with Claude Code (Native Claude Code)
| Domain | Task | What's Tested |
|--------|------|---------------|
| D2 | 2.5 Built-in tools | Choosing Grep vs Glob vs Read vs Edit for codebase tasks |
| D3 | 3.1 CLAUDE.md hierarchy | Project-level conventions for code generation teams |
| D3 | 3.2 Commands & skills | /review slash command, codebase analysis skill |
| D3 | 3.3 Path-specific rules | Different conventions for React, API, test files via glob patterns |
| D3 | 3.4 Plan vs direct | When to plan (migration) vs execute directly (bug fix) |
| D3 | 3.5 Iterative refinement | Test-driven iteration, input/output examples, interview pattern |

### S3: Multi-Agent Research System (Agent SDK)
| Domain | Task | What's Tested |
|--------|------|---------------|
| D1 | 1.1 Agentic loops | Coordinator agent loop managing subagent delegation |
| D1 | 1.2 Coordinator-subagent | Hub-and-spoke architecture, dynamic routing, iterative refinement |
| D1 | 1.3 Subagent invocation | Task tool, allowedTools, AgentDefinition, parallel spawning |
| D2 | 2.2 Structured errors | Error propagation from subagents to coordinator |
| D2 | 2.3 Tool distribution | Scoped tools per subagent role, verify_fact cross-role tool |
| D5 | 5.3 Error propagation | Structured error context, partial results, coverage annotations |
| D5 | 5.6 Provenance | Claim-source mappings, handling conflicting sources, temporal context |

### S4: Developer Productivity with Claude (Agent SDK + Claude Code)
| Domain | Task | What's Tested |
|--------|------|---------------|
| D1 | 1.2 Coordinator-subagent | Dev productivity coordinator with exploration subagent |
| D1 | 1.6 Task decomposition | Adaptive decomposition for legacy codebase exploration |
| D1 | 1.7 Session state | Named sessions (--resume), fork_session for parallel exploration |
| D2 | 2.4 MCP integration | .mcp.json configuration, MCP server integration for dev tools |
| D2 | 2.5 Built-in tools | Read/Write/Edit/Grep/Glob selection for codebase tasks |
| D3 | 3.2 Commands & skills | Explore codebase skill with context: fork |
| D5 | 5.4 Codebase context | Scratchpad files, subagent delegation, /compact |

### S5: Claude Code for Continuous Integration (Claude Code CLI)
| Domain | Task | What's Tested |
|--------|------|---------------|
| D3 | 3.6 CI/CD integration | -p flag, --output-format json, --json-schema, session isolation |
| D4 | 4.1 Explicit criteria | Review criteria with severity levels, reducing false positives |
| D4 | 4.5 Batch processing | Message Batches API for overnight tech debt reports |
| D4 | 4.6 Multi-pass review | Per-file analysis + cross-file integration pass |

### S6: Structured Data Extraction (Claude API)
| Domain | Task | What's Tested |
|--------|------|---------------|
| D4 | 4.2 Few-shot prompting | Extraction examples for varied document structures |
| D4 | 4.3 Structured output | tool_use with JSON schemas, tool_choice configuration |
| D4 | 4.4 Validation/retry | Retry with error feedback, identifying non-retryable failures |
| D4 | 4.5 Batch processing | Message Batches API for high-volume extraction |
| D5 | 5.5 Human review | Confidence-based routing, stratified sampling, accuracy analysis |

## Domains → Scenarios (Reverse Map)

| Domain | Weight | Tested in Scenarios |
|--------|--------|---------------------|
| D1: Agentic Architecture | 27% | S1, S3, S4 |
| D2: Tool Design & MCP | 18% | S1, S2, S3, S4 |
| D3: Claude Code Config | 20% | S2, S4, S5 |
| D4: Prompt Engineering | 20% | S1, S5, S6 |
| D5: Context & Reliability | 15% | S1, S3, S4, S6 |
