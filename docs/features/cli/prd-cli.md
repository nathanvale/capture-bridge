---
title: CLI Feature PRD
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-28
spec_type: prd
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# CLI Feature — PRD

## 1) Problem & Outcomes

**Problem:**
The ADHD Brain system requires a user interface for manual capture operations, system health checks, and staging ledger inspection during development and operational phases. Without a CLI, developers and power users cannot:

- Test capture workflows manually
- Debug staging ledger issues
- Inspect staged captures *(Note: MPPP uses direct export - outbox pattern deferred to Phase 5+)*
- Verify system health
- Perform batch operations

**Success Metrics:**

- CLI startup time < 150ms (p95)
- All MVP capture channels accessible via CLI
- 100% P0/P1 error paths tested
- Zero unhandled exceptions in production usage
- Doctor command detects 95%+ of common issues

---

## 2) Users & Jobs

**Primary User: Nathan (Developer/Power User)**

- Test voice memo capture workflows
- Debug staging ledger state
- Inspect capture queue
- Verify system health before production use
- Perform emergency recovery operations

**Secondary Users: Future Power Users**

- Batch capture operations (import voice memos)
- System diagnostics for troubleshooting
- Automation via shell scripts (using --json mode)

**Top Jobs-to-be-Done:**

1. Manually capture voice memos for testing
2. Check system health (doctor command)
3. Inspect staged captures (list, show)
4. Force-file stuck captures
5. Monitor dead letter queue

---

## 3) Scope (MVP → v1)

**MVP (Phase 1-2):**

- ✅ `capture voice` - Register voice memo files
- ✅ `doctor` - Health checks
- ✅ `ledger list` - List staged captures
- ✅ `ledger inspect` - Show capture details
- ✅ Error handling with structured codes
- ✅ JSON output mode (--json)

> NOTE: `capture text` was previously listed but is explicitly deferred per Master PRD YAGNI boundaries (quick text capture Phase 5+). Removed here for alignment.

**Phase 3:**

- ✅ `capture email` - Email file ingestion
- ✅ `ledger dlq` - Dead letter queue inspection

**Phase 4:**

- ✅ `inbox:process` - Batch file captures
- ✅ `hash:migrate` - Hash algorithm migration
- ✅ `metrics:dump` - Local metrics export

**Out (YAGNI - Deferred to Phase 5+):**

- ❌ Interactive REPL
- ❌ Plugin system
- ❌ Shell completion
- ❌ Web clipper commands
- ❌ Search commands
- ❌ Config editing commands
- ❌ Streaming progress bars
- ❌ Real-time transcription monitoring
- ❌ Quick text capture (`capture text`)

### 3.1 YAGNI Deferrals Table

| Feature | Defer Phase | Trigger to Revisit |
|---------|-------------|--------------------|
| Quick text capture | 5+ | Sustained manual friction > 10 notes/day manually created for 7 days |
| Shell completion | 5+ | Daily CLI invocation > 30 commands |
| Plugin/extensibility | 5+ | 3+ external integration requests |
| Interactive REPL | 5+ | User feedback citing discoverability pain |
| Real-time transcription view | 5+ | Voice export latency > p95 target for 14 days |
| Batch inbox processing | 3+ | Inbox backlog > 300 items |

---

## 4) User Flows

### Flow A: Manual Voice Capture (Testing)

1. User records voice memo on iPhone
2. Voice memo syncs to Mac via iCloud
3. User runs `adhd capture voice ~/Library/.../recording.m4a`
4. CLI validates file, computes hash, stages to SQLite
5. CLI returns capture ID and status
6. User verifies capture with `adhd ledger list`

### Flow B: System Health Check

1. User suspects system issues (captures not filing)
2. User runs `adhd doctor`
3. CLI checks:
   - Staging ledger accessible
   - Vault path writable
   - Voice memos folder readable
   - Disk space adequate
4. CLI reports status (pass/fail/warn)
5. User runs `adhd doctor --fix` to auto-repair if possible

### Flow C: Dead Letter Queue Recovery

1. User notices captures stuck in "processing"
2. User runs `adhd ledger dlq`
3. CLI shows failed captures with retry counts
4. User inspects specific capture: `adhd ledger inspect <id>`
5. User manually fixes issue (e.g., vault permissions)
6. User reprocesses: `adhd capture:file <id>`

### Flow D: Batch Email Capture

1. User forwards emails to local .eml files
2. User runs `adhd capture email inbox/*.eml --json`
3. CLI processes each file, returns JSON array
4. Shell script parses JSON, logs results
5. User verifies in Obsidian vault

---

## 5) Non-Functional Requirements

### Privacy

- **Local-only**: All operations are local filesystem only
- **No telemetry**: Zero external network calls
- **Path redaction**: File paths hidden in JSON unless --verbose
- **No sensitive data in logs**: Only hashes and lengths

### Reliability

- **Idempotent commands**: Safe to retry after crashes
- **Atomic operations**: Leverage SQLite transactions
- **Structured errors**: Clear error codes and messages
- **Graceful degradation**: Continue on non-critical failures

### Performance

- **Cold start**: < 150ms (p95)
- **Capture voice**: < 100ms (p95)
- **List queries**: < 50ms for 1000 items
- **Doctor checks**: < 500ms

### Accessibility

- **Human-friendly defaults**: Readable tables and colors
- **Machine-readable mode**: JSON output (--json)
- **Clear error messages**: Actionable hints
- **Help text**: Comprehensive command help

---

## 6) Decisions (Locked)

### CLI is a Feature, Not Foundation

- **Rationale**: CLI is user-facing interface, uses foundation infrastructure
- **Location**: `docs/features/cli/` not `docs/cross-cutting/`
- **ADR**: [ADR-0016 CLI as Feature Architecture](../../adr/0016-cli-as-feature-architecture.md)

### Commander.js for Argument Parsing

- **Rationale**: Industry standard, well-tested, TypeScript support
- **Alternative rejected**: Custom parsing (complexity)
- **ADR**: [ADR-0015 CLI Library Stack Selection](../../adr/0015-cli-library-stack.md)

### Zod for Validation

- **Rationale**: Type-safe validation, excellent error messages
- **Alternative rejected**: Manual validation (error-prone)
- **ADR**: [ADR-0015 CLI Library Stack Selection](../../adr/0015-cli-library-stack.md)

### JSON Output for Automation

- **Rationale**: Enable shell script automation
- **Contract**: Schema must remain backward compatible
- **ADR**: [ADR-0017 JSON Output Contract Stability](../../adr/0017-json-output-contract-stability.md)

### Exit Codes Registry

- **Rationale**: Stable exit codes for shell script flow control
- **Contract**: Exit codes cannot change once released
- **ADR**: [ADR-0018 CLI Exit Code Registry Pattern](../../adr/0018-cli-exit-code-registry.md)

### No Interactive Wizards (MVP)

- **Rationale**: YAGNI - command-line flags sufficient for Phase 1-4
- **Trigger to revisit**: When non-technical users need CLI

## 7) TDD Applicability Decision (Refined for MPPP)

### Risk Assessment

- **Risk Level:** MEDIUM (elevated for core commands: `capture voice`, `doctor`)
- **High-risk factors:** exit codes as automation contract, JSON schema stability, health diagnostics correctness.

### Decision: TDD Required (Targeted Scope)

| Layer | Required | Reason |
|-------|----------|--------|
| Unit (command handlers) | Yes | Deterministic parsing & validation |
| Integration (spawn CLI) | Yes (core commands) | Contract + exit codes |
| Contract (JSON schema) | Yes | Automation stability |
| Performance smoke | Optional | Only if cold start > 150ms |
| Snapshot formatting | No | Presentation not critical now |

### Scope

- **Unit:** voice capture args validation, doctor check aggregator, ledger query output shaping
- **Integration:** `adhd doctor --json`, `adhd capture voice <path>` (voice path stub), error path for missing vault
- **Contract:** JSON schema for doctor output, stable exit code map

### Out-of-Scope (YAGNI)

- Full golden snapshots of help text
- Concurrency stress (sequential execution in MPPP)
- Email capture commands (Phase 3 activation)

### Triggers to Revisit

| Trigger | Expansion Action |
|---------|------------------|
| Add email capture command | Add email flow integration tests |
| Exit code regression incident | Add regression harness |
| >5% user-reported CLI confusion | Introduce richer UX tests |

---

## 8) Master PRD Success Criteria Alignment

This PRD delivers the following Master PRD v2.3.0-MPPP §12 success criteria:

### Phase 1 (MVP) Criteria Mapping

| Master PRD Criterion | CLI PRD Deliverable | Verification Test |
|---------------------|---------------------|-------------------|
| ✅ Infrastructure health command functional | `adhd doctor` command with checks | `test-cli-doctor.spec.ts` |

### Phase 2 (Production Ready) Criteria Mapping

| Master PRD Criterion | CLI PRD Deliverable | Verification Test |
|---------------------|---------------------|-------------------|
| ✅ Doctor command detects 95%+ of common issues | Health check coverage | Manual validation with fault injection |

### Test Infrastructure Criteria

| Master PRD Criterion | CLI PRD Deliverable | Verification Test |
|---------------------|---------------------|-------------------|
| ✅ TestKit integrated across all packages | CLI test suite uses TestKit | All CLI tests pass with TestKit |
| ✅ Test suite runs in < 30 seconds | CLI unit tests optimized | CI pipeline timing validation |

### Test Traceability

All tests referenced above live in `packages/cli/tests/` and are executed via TestKit.

---

## 9) Open Questions (Updated)

1. Scope of `--fix` in `doctor` (start read-only?)
2. Provide `--filter` flags earlier if staging volume grows sooner?
3. Do we need a dry-run mode for future bulk operations (Phase 3)?
4. Should JSON schema versions be annotated (`schema_version` field)?
5. Retain color output by default when piping? (Likely disable)

## 10) Related Specifications

- [CLI Technical Specification](./spec-cli-tech.md) - Complete implementation details
- [CLI Architecture Specification](./spec-cli-arch.md) - Component design
- [CLI Test Specification](./spec-cli-test.md) - Testing strategy
- [CLI Extensibility Deferred Features Guide](../../guides/guide-cli-extensibility-deferred.md) - Deferred features
- [Health Command Guide](../../guides/guide-health-command.md) - Usage patterns for doctor command
- [CLI Doctor Implementation Guide](../../guides/guide-cli-doctor-implementation.md) - Implementation details
- [Master PRD](../../master/prd-master.md) - Overall system requirements
- [Capture PRD](../capture/prd-capture.md) - Capture feature requirements

---

## 11) Sign-off Checklist

- [x] Problem statement clear and validated
- [x] Success metrics defined
- [x] User flows documented
- [x] Scope defined (in/out)
- [x] Non-functional requirements specified
- [x] Key decisions locked
- [x] Open questions documented
- [x] Related specs referenced

---

## 12) Optional Reading List

- Commander.js documentation
- Zod validation patterns
- TestKit usage guide (`../../guides/guide-testkit-usage.md`)
- Master PRD export & health sections
- Staging Ledger PRD (ledger inspection semantics)

## 13) Clarifying Questions

1. Are we enforcing strict JSON schema versioning now or deferring until Phase 3?
2. Should `doctor` surface placeholder export ratio early (or defer to observability slice)?
3. Do we want a `--no-color` flag or auto-detect piping only?
4. Should failed voice path validations suggest `icloudctl` prerequisites?
5. Do we need a soft deprecation mechanism for legacy command aliases later?

## 14) Nerdy Joke

The CLI is the command-line executive function you wish your brain came with—structured flags instead of scattered thoughts.

## 15. Revision History

- **v1.0.0** (2025-09-28): Promoted to living status (P2-3 phase)
- **v1.0.0** (2025-09-27): Updated for MPPP alignment (Post-uplift)

**Status:** Living
**Last Updated:** 2025-09-28
**Next Steps:** Create architecture spec, implement Phase 1 commands
