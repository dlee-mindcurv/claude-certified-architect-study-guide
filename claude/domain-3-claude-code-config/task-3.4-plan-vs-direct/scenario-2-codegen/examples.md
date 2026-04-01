# Scenario 2: Code Generation -- Plan Mode vs Direct Execution Examples

## Context

In a code generation scenario, teams use Claude Code to generate new features, components,
and modules. Choosing the right execution mode ensures generated code is consistent and
well-integrated with the existing codebase.

## Example 1: Direct Execution -- Add a New API Endpoint

### Task
> "Add a GET /api/users/:id endpoint that returns a user by ID, following the same pattern
> as the existing GET /api/posts/:id endpoint."

### Why Direct Execution
- Clear requirement with explicit pattern to follow
- Single endpoint, predictable file changes
- Existing pattern provides a template

### What Happens
Claude reads the existing posts endpoint, replicates the pattern for users, creates the
handler, schema, service function, and test file. All following the established conventions.

---

## Example 2: Plan Mode -- Add Full CRUD for a New Entity

### Task
> "Add a complete Orders module with CRUD endpoints, database model, validation schemas,
> and tests."

### Why Plan Mode
- Multiple files to create (model, handlers, schemas, services, tests)
- Architectural decisions needed (where to place files, how to structure)
- Multiple valid approaches for order state management
- Need to understand existing patterns across the full stack

### What the Plan Might Include
1. Review existing entity modules (Users, Posts) for patterns
2. Create database migration for orders table
3. Define Zod schemas for order validation
4. Create order service with business logic
5. Create CRUD handlers following existing patterns
6. Create test files for each layer
7. Update route registration

### Why This Is Better Than Direct
Without planning, Claude might create files in the wrong locations, use inconsistent
patterns, or miss important aspects like order state transitions.

---

## Example 3: Direct Execution -- Generate Tests for Existing Code

### Task
> "Generate unit tests for the `calculateDiscount` function in src/utils/pricing.ts."

### Why Direct Execution
- Well-scoped: one function, one test file
- Clear requirement: generate tests
- The function's signature and behavior define the test cases

---

## Example 4: Plan Mode -- Implement a New Feature with UI and API

### Task
> "Add a user notifications feature with a preferences page, API endpoints for managing
> notification settings, and real-time delivery via WebSocket."

### Why Plan Mode
- Spans frontend and backend
- Multiple delivery mechanisms (WebSocket is a new pattern)
- Preferences UI requires understanding existing settings page patterns
- Need to decide on notification storage, delivery queue, real-time approach
- High complexity with multiple valid architectures

### Planning Enables
- Discussion of WebSocket vs Server-Sent Events
- Review of existing real-time patterns (if any)
- Coordinated schema design across frontend and backend
- Phased implementation approach

---

## Example 5: Direct Execution -- Apply a Pattern Across Files

### Task
> "Add input validation using Zod to all API handlers that currently lack it.
> Follow the pattern used in the users handler."

### Why Direct Execution
- Repetitive application of a known pattern
- Each individual change is straightforward
- The reference pattern is explicitly specified

### Note
Even though this touches multiple files, each change is mechanical and follows a clear
template. No architectural decisions are needed.

---

## Summary: Code Generation Decision Guide

| Task Type | Mode | Reasoning |
|-----------|------|-----------|
| New endpoint following existing pattern | Direct | Template exists |
| Full CRUD module for new entity | Plan | Multiple files, architectural decisions |
| Tests for existing function | Direct | Scoped, clear inputs |
| New feature spanning UI + API | Plan | Cross-cutting, multiple approaches |
| Apply known pattern to multiple files | Direct | Mechanical, repetitive |
| New architectural pattern | Plan | Needs exploration and discussion |
| Bug fix in generated code | Direct | Clear symptom and location |
| Refactor generated code to new pattern | Plan | Broad impact, multiple approaches |
