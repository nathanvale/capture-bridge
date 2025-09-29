---
adr: 0016
title: CLI as Feature Architecture (Not Foundation Infrastructure)
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

## Status

Accepted

## Context

During project organization, a key question arose about the architectural placement of the Command Line Interface (CLI): Should it be classified as foundation infrastructure or as a user-facing feature?

This decision impacts:

- **Directory structure**: `docs/cross-cutting/` vs `docs/features/cli/`
- **Dependency flow**: What the CLI can depend on vs what depends on it
- **Architectural layering**: CLI's position in the system hierarchy
- **Testing strategy**: How CLI components are tested and mocked
- **Development workflow**: Who owns CLI changes and how they're prioritized

The CLI provides command-line access to core system capabilities including:

- Manual capture operations (`capture voice`, `capture email`)
- System health diagnostics (`doctor`)
- Staging ledger inspection (`ledger list`, `ledger inspect`)
- Batch operations (`inbox:process`, `hash:migrate`)

Referenced in:

- [CLI PRD](../features/cli/prd-cli.md) §6 Decisions (Locked)
- [CLI Architecture Specification](../features/cli/spec-cli-arch.md) §1 Placement in System

## Decision

**The CLI is a user-facing feature that sits at the top of the system architecture, NOT foundation infrastructure.**

### Architectural Position

```
┌─────────────────────────────────────────┐
│  CLI (User Interface Layer)             │  ← FEATURE
│  - Command parsing (Commander.js)       │
│  - Input validation (Zod)               │
│  - Output formatting (human/JSON)       │
│  - Error handling (structured codes)    │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│  Service Layer (Domain Logic)           │  ← USES FOUNDATION
│  - Ingestion Service                    │
│  - Ledger Service (SQLite access)       │
│  - Filing Service (vault writes)        │
│  - Health Service (doctor checks)       │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│  Foundation Infrastructure              │  ← FOUNDATION
│  - SQLite (staging ledger)              │
│  - File system (voice files, vault)     │
│  - Monorepo structure (packages)        │
│  - Test infrastructure (Vitest)         │
└─────────────────────────────────────────┘
```

### Key Principle

**CLI commands are thin orchestration wrappers.** All business logic lives in domain services that are testable without CLI involvement.

## Rationale

### 1. Dependency Direction

- CLI **uses** foundation infrastructure (SQLite, file system, test frameworks)
- CLI **does not provide** infrastructure for other components
- Foundation components should never depend on CLI

### 2. User-Facing Nature

- CLI is an interface, not infrastructure
- Users interact directly with CLI commands
- CLI output format and behavior are user experience concerns
- Multiple interfaces could theoretically exist (CLI, GUI, API)

### 3. Testing and Development

- Business logic is testable without spawning CLI processes
- CLI tests focus on argument parsing, output formatting, error handling
- Domain services have their own comprehensive test suites
- Separation allows independent evolution of interface vs logic

### 4. Organizational Clarity

- Feature teams can own CLI commands for their domain
- Infrastructure changes don't require CLI coordination
- CLI changes don't block infrastructure development

## Alternatives Considered

### 1. CLI as Foundation Infrastructure

- **Pros**: Central location, shared access patterns
- **Cons**: Inverts dependency flow, makes business logic harder to test independently
- **Rejected**: Violates separation of concerns

### 2. CLI as Cross-Cutting Concern

- **Pros**: Spans multiple domains, could justify cross-cutting placement
- **Cons**: CLI doesn't provide shared functionality to other components
- **Rejected**: Cross-cutting should be for shared utilities, not interfaces

### 3. Multiple CLI Packages by Domain

- **Pros**: Clear ownership boundaries, smaller packages
- **Cons**: User confusion, complex argument parsing coordination, YAGNI
- **Rejected**: Premature optimization for current team size

## Consequences

### Positive

- **Clear dependency flow**: CLI → Services → Foundation
- **Testable business logic**: Services can be unit tested without CLI
- **User experience focus**: CLI development prioritizes usability
- **Parallel development**: CLI and business logic can evolve independently
- **Multiple interface support**: Future GUI or API doesn't affect business logic

### Negative

- **Additional abstraction layer**: Commands must delegate to services
- **More files**: Service interfaces required even for simple operations
- **Coordination overhead**: Changes affecting both CLI and services require coordination

### Mitigation Strategies

- Keep command handlers thin (< 50 lines each)
- Use shared service interfaces to minimize CLI/service coupling
- Document service contracts clearly for CLI developers

## Implementation Guidelines

### Command Structure

```typescript
// ✅ Good: Thin command handler
export async function captureVoiceCommand(
  file: string,
  options: CaptureOptions
) {
  const service = new CaptureService()
  const result = await service.captureVoice({ filePath: file, ...options })
  return formatOutput(result, options.json)
}

// ❌ Bad: Business logic in command
export async function captureVoiceCommand(
  file: string,
  options: CaptureOptions
) {
  const hash = await computeHash(file)
  const db = await openDatabase()
  await db.query("INSERT INTO captures...", [hash, file])
  // ... more business logic
}
```

### Directory Structure

```
docs/features/cli/          # ✅ CLI lives here
  ├── prd-cli.md
  ├── spec-cli-arch.md
  ├── spec-cli-tech.md
  └── spec-cli-test.md

docs/cross-cutting/          # ❌ CLI does not live here
  └── foundation/            # ✅ Foundation infrastructure
      ├── spec-foundation-monorepo-*.md
      └── spec-foundation-testing.md
```

## Success Metrics

- CLI startup time remains < 150ms (thin interface doesn't add overhead)
- Business logic remains 100% testable without CLI processes
- Zero CLI dependencies in foundation packages
- Clear ownership: CLI changes handled by feature teams

## References

- [CLI PRD](../features/cli/prd-cli.md) - Product requirements
- [CLI Architecture Specification](../features/cli/spec-cli-arch.md) - Detailed architecture
- [CLI Technical Specification](../features/cli/spec-cli-tech.md) - Implementation approach
- [Master PRD](../master/prd-master.md) - Overall system architecture

## Revision History

- 2025-09-28: Initial decision documentation
