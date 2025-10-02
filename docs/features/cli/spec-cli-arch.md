---
title: CLI Architecture Specification
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-27
spec_type: architecture
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# CLI Architecture Notes

## 1) Placement in System

The CLI is a **user-facing feature** that sits at the top of the system architecture, providing command-line access to core system capabilities. It is NOT foundation infrastructure—it USES foundation infrastructure.

```
┌─────────────────────────────────────────┐
│  CLI (User Interface Layer)             │
│  - Command parsing (Commander.js)       │
│  - Input validation (Zod)               │
│  - Output formatting (human/JSON)       │
│  - Error handling (structured codes)    │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│  Service Layer (Domain Logic)           │
│  - Ingestion Service                    │
│  - Ledger Service (SQLite access)       │
│  - Filing Service (vault writes)        │
│  - Health Service (doctor checks)       │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│  Foundation Infrastructure              │
│  - SQLite (staging ledger)              │
│  - File system (voice files, vault)     │
│  - Monorepo structure (packages)        │
│  - Test infrastructure (Vitest)         │
└─────────────────────────────────────────┘
```

**Key Principle:** CLI commands are thin orchestration wrappers. All business logic lives in domain services (testable without CLI).

**Composition with Core Flow:**

```
User Input (CLI)
  → Command Handler
    → Service Layer
      → Capture (voice/text/email)
        → Staging Ledger (SQLite)
          → Processing Pipeline
            → Outbox
              → Vault Write (Obsidian)
```

---

## 2) Dependencies

### Upstream Dependencies (What CLI Uses)

**Domain Services:**

- `@capture-bridge/capture-service` - Voice/text/email capture
- `@capture-bridge/storage` - SQLite ledger access
- `@capture-bridge/vault-connector` - Obsidian file operations
- `@capture-bridge/core` - Shared types and errors

**External Libraries:**

- `commander` (v12+) - CLI framework
- `zod` (v3+) - Schema validation
- `chalk` (v5+) - Terminal colors
- `ora` (v8+) - Spinners

**System Dependencies:**

- Node.js 20+
- SQLite 3.35+
- File system (read/write)

### Downstream Consumers (What Uses CLI)

**Direct Users:**

- Developers (testing, debugging)
- Power users (batch operations)
- Shell scripts (automation via --json)

**Indirect Users:**

- CI/CD pipelines (using exit codes)
- Future GUI (may wrap CLI commands)
- Documentation (examples use CLI)

### External Contracts

**Stable Contracts (Cannot Change):**

- Command names (`capture:voice` not `voice:capture`)
- Exit codes (0=success, 1=error, 2=invalid input, etc.)
- JSON output schemas (backward compatible only)
- Error code registry (CLI_INPUT_INVALID, etc.)

**Evolving Contracts (Can Add):**

- New commands (backward compatible)
- New flags (optional, default=old behavior)
- New JSON fields (additive only)

---

## 3) Failure Modes

### Command Parsing Failures

**Symptom:** Invalid arguments or flags
**Containment:** Zod validation catches before service layer
**Recovery:** Structured error with hint, exit code 2
**Impact:** User sees clear error message, no side effects

### Service Layer Failures

**Symptom:** SQLite locked, file not found, vault not writable
**Containment:** Service layer throws typed errors
**Recovery:** CLI catches, formats for human/JSON, exits with appropriate code
**Impact:** User sees actionable error, can retry after fix

### Unexpected Failures

**Symptom:** Unhandled promise rejection, uncaught exception
**Containment:** Global error handler at CLI entry point
**Recovery:** Log error, print generic message, exit 1
**Impact:** User sees error, but no data corruption (SQLite transactions)

### Partial Batch Failures

**Symptom:** Processing 10 files, 3 fail
**Containment:** Collect errors, continue processing
**Recovery:** Report summary with successes + failures
**Impact:** User sees which files failed, can retry individually

### Performance Degradation

**Symptom:** Startup > 200ms, queries > 1s
**Containment:** Monitor with performance tests
**Recovery:** Profile bottlenecks, optimize hot paths
**Impact:** User experiences slowness, but no data loss

---

## 4) Evolution & Future Considerations

### Phase 1-2 (Current)

- Minimal command set (capture, doctor, ledger)
- Manual operations only
- Single-shot execution (no daemon)

### Phase 3-4 (Next 3 months)

- Email capture commands
- Batch operations (inbox:process)
- Hash migration (hash:migrate)
- Metrics export (metrics:dump)

### Phase 5+ (Future)

**Trigger: User feedback + actual usage patterns**

**Possible Extensions:**

- Interactive mode (REPL)
  - Trigger: Users request "don't exit after command"
- Shell completion (bash/zsh/fish)
  - Trigger: Users report "tab completion would help"
- Plugin system (custom commands)
  - Trigger: Users want to extend CLI without forking
- Watch mode (continuous capture)
  - Trigger: Users request "auto-capture new voice memos"
- TUI (interactive UI)
  - Trigger: Users prefer visual interface over commands

**What Stays Simple:**

- Error handling (always structured codes)
- JSON output (always backward compatible)
- Single-shot commands (no hidden state)
- Local-only (no network calls)

**What Gets Revisited:**

- Command organization (if > 20 commands)
- Configuration file format (if complexity grows)
- Performance targets (if user base > 1000)
- Help text (if too verbose)

---

## 5) Design Decisions & Rationale

### Decision: Thin Command Handlers

**Rationale:** Keep CLI logic simple, testable. Push complexity into services.
**Trade-off:** More files/classes, but better separation of concerns.
**Example:** `capture-voice.ts` is 50 lines of arg parsing, service call, output formatting.

### Decision: Structured Error Codes

**Rationale:** Shell scripts need reliable exit codes for flow control.
**Trade-off:** Maintain error registry, but worth it for automation.
**Example:** `CLI_DB_UNAVAILABLE` always exits with code 10.

### Decision: JSON Output Mode

**Rationale:** Enable automation without parsing human-readable tables.
**Trade-off:** Maintain schema compatibility, but unlocks scripting.
**Example:** `adhd capture voice --json | jq .id`

### Decision: No Daemon/Watch Mode (MVP)

**Rationale:** YAGNI - polling workers handle continuous monitoring.
**Trade-off:** Manual `capture voice` command, but simpler.
**Revisit:** If users report "too tedious to run manually".

### Decision: Commander.js (Not Custom Parser)

**Rationale:** Industry standard, well-tested, TypeScript support.
**Trade-off:** Dependency, but saves 1000+ lines of code.
**Alternative rejected:** Custom parser (reinventing wheel).

---

## 6) Component Diagram

```
┌────────────────────────────────────────────────┐
│ CLI Package (apps/cli)                         │
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────────┐         ┌──────────────┐    │
│  │ index.ts     │────────>│ Commander    │    │
│  │ (entry)      │         │ Program      │    │
│  └──────────────┘         └──────────────┘    │
│         │                        │             │
│         v                        v             │
│  ┌──────────────────────────────────────┐     │
│  │ Command Handlers                     │     │
│  │ - capture-voice.ts                   │     │
│  │ - capture-text.ts                    │     │
│  │ - capture-email.ts                   │     │
│  │ - doctor.ts                          │     │
│  │ - ledger.ts                          │     │
│  └──────────────────────────────────────┘     │
│         │                        │             │
│         v                        v             │
│  ┌────────────┐          ┌────────────┐       │
│  │ Validation │          │ Services   │       │
│  │ (Zod)      │          │ Layer      │       │
│  └────────────┘          └────────────┘       │
│         │                        │             │
│         v                        v             │
│  ┌────────────┐          ┌────────────┐       │
│  │ Error      │          │ Output     │       │
│  │ Handler    │          │ Formatter  │       │
│  └────────────┘          └────────────┘       │
│         │                        │             │
│         v                        v             │
│  ┌──────────────────────────────────────┐     │
│  │ stderr/stdout                        │     │
│  └──────────────────────────────────────┘     │
└────────────────────────────────────────────────┘
```

---

## 7) Testing Strategy

### Unit Tests (Fast, No I/O)

- Argument parsing logic
- Validation schemas (Zod)
- Error formatting
- Output formatting (human/JSON)

### Integration Tests (With Real Services)

- Full command execution
- SQLite operations
- File system operations
- Error scenarios

### Contract Tests (Stability)

- JSON output schemas
- Exit code consistency
- Help text snapshots

**Test Isolation:**

- Use TestKit's in-memory SQLite
- Mock file system via `memfs`
- Capture stdout/stderr for assertions

---

## 8) Performance Considerations

### Startup Time Optimization

- Lazy-load heavy dependencies (ora, chalk)
- Avoid top-level await
- Minimize module imports

### Command Execution Optimization

- Use SQLite prepared statements
- Stream large query results
- Avoid loading all captures into memory

### JSON Output Optimization

- Stream JSON for large result sets
- Use JSON.stringify (native, fast)
- Avoid pretty-printing unless --verbose

---

## 9) Related Specifications

- [CLI PRD](./prd-cli.md) - Product requirements
- [CLI Technical Specification](./spec-cli-tech.md) - Implementation details
- [CLI Test Specification](./spec-cli-test.md) - Testing strategy
- [CLI Extensibility Deferred Features Guide](../../guides/guide-cli-extensibility-deferred.md) - Deferred features
- [Master PRD](../../master/prd-master.md) - Overall system requirements

## 10) ADR References

- [ADR-0015 CLI Library Stack Selection](../../adr/0015-cli-library-stack.md) - Commander.js and Zod selection rationale
- [ADR-0016 CLI as Feature Architecture](../../adr/0016-cli-as-feature-architecture.md) - Architectural placement and dependency flow
- [ADR-0017 JSON Output Contract Stability](../../adr/0017-json-output-contract-stability.md) - Machine-readable output contracts
- [ADR-0018 CLI Exit Code Registry Pattern](../../adr/0018-cli-exit-code-registry.md) - Structured error codes for automation

---

**Version:** 1.0.0
**Status:** Draft
**Last Updated:** 2025-09-27
**Next Steps:** Implement command handlers per technical spec
