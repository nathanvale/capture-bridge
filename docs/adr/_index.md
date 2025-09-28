# Architecture Decision Records

This index lists all Architecture Decision Records (ADRs) for the ADHD Brain project in chronological order.

Related: [Master PRD](/docs/master/prd-master.md)

## ADR Index

| Number | Title | Status | Date | Superseded By | Links |
|--------|-------|---------|------|---------------|-------|
| [0001](0001-voice-file-sovereignty.md) | Voice File Sovereignty (In-Place References Only) | Accepted | 2025-01-19 | — | Capture, Staging Ledger |
| [0002](0002-dual-hash-migration.md) | Dual Hash Migration (SHA-256 → BLAKE3) | Superseded | 2025-09-26 | ADR-0004 (SHA-256 Only) | Staging Ledger, CLI |
| [0003](0003-four-table-hard-cap.md) | Four-Table Hard Cap for Staging Ledger | Accepted | 2025-09-28 | — | Staging Ledger |
| [0004](0004-status-driven-state-machine.md) | Status-Driven State Machine for Capture Lifecycle | Accepted | 2025-09-28 | — | Staging Ledger |
| [0005](0005-wal-mode-normal-sync.md) | WAL Mode with NORMAL Synchronous for Local-First Durability | Accepted | 2025-09-28 | — | Staging Ledger |
| [0006](0006-late-hash-binding-voice.md) | Late Hash Binding for Voice Captures | Accepted | 2025-09-28 | — | Staging Ledger, Capture |
| [0007](0007-90-day-retention-exported-only.md) | 90-Day Retention for Exported Captures Only | Accepted | 2025-09-28 | — | Staging Ledger |
| [0008](0008-sequential-processing-mppp.md) | Sequential Processing for MPPP Scope | Accepted | 2025-09-28 | — | Staging Ledger |
| [0009](0009-atomic-write-temp-rename-pattern.md) | Atomic Write via Temp-Then-Rename Pattern | Accepted | 2025-09-27 | — | Obsidian Bridge |
| [0010](0010-ulid-deterministic-filenames.md) | ULID-Based Deterministic Filenames | Accepted | 2025-09-27 | — | Obsidian Bridge, Staging Ledger |
| [0011](0011-inbox-only-export-pattern.md) | Inbox-Only Export Pattern (Phase 1) | Accepted | 2025-09-27 | — | Obsidian Bridge |
| [0012](0012-tdd-required-high-risk.md) | TDD Required for High-Risk Obsidian Bridge | Accepted | 2025-09-27 | — | Obsidian Bridge, Testing |
| [0013](0013-mppp-direct-export-pattern.md) | MPPP Direct Export Pattern (Synchronous vs Outbox Queue) | Accepted | 2025-09-27 | — | Capture, Obsidian Bridge |
| [0014](0014-placeholder-export-immutability.md) | Placeholder Export Immutability (MPPP) | Accepted | 2025-09-27 | — | Capture |
| [0015](0015-cli-library-stack.md) | CLI Library Stack Selection (Commander.js + Zod) | Accepted | 2025-09-28 | — | CLI |
| [0016](0016-cli-as-feature-architecture.md) | CLI as Feature Architecture (Not Foundation Infrastructure) | Accepted | 2025-09-28 | — | CLI |
| [0017](0017-json-output-contract-stability.md) | JSON Output Contract Stability for CLI Automation | Accepted | 2025-09-28 | — | CLI |
| [0018](0018-cli-exit-code-registry.md) | CLI Exit Code Registry Pattern for Automation | Accepted | 2025-09-28 | — | CLI |
| [0019](0019-monorepo-tooling-stack.md) | Monorepo Tooling Stack (pnpm + Turbo + TSUP) | Accepted | 2025-09-28 | — | Foundation |
| [0020](0020-foundation-direct-export-pattern.md) | Foundation Direct Export Pattern (Synchronous Atomic Writes) | Accepted | 2025-09-28 | — | Foundation, Obsidian Bridge |
| [0021](0021-local-metrics-ndjson-strategy.md) | Local-Only NDJSON Metrics Strategy | Accepted | 2025-09-28 | — | Foundation, Metrics |

## Decision Summary

- **Voice File Management**: Apple Voice Memos remain in their original location, referenced by path + fingerprint only
- **Content Hashing**: SHA-256 only (BLAKE3 migration path superseded for MPPP scope)
- **Staging Ledger Architecture**: 4-table hard cap with status-driven state machine, WAL mode, sequential processing
- **Voice Processing**: Late hash binding enables sub-100ms staging while maintaining durability
- **Data Retention**: 90-day cleanup for exported captures only; non-exported rows preserved for debugging
- **Obsidian Export Strategy**: Atomic temp-then-rename pattern with ULID-based deterministic filenames to inbox-only directory
- **Testing Approach**: TDD required for vault operations due to high risk of data loss
- **CLI Architecture**: Feature-level interface using Commander.js + Zod with stable JSON contracts and exit code registry
- **Monorepo Foundation**: pnpm + Turbo + TSUP stack with external @orchestr8/testkit and 4-package ADHD-optimized constraint
- **Direct Export Strategy**: Synchronous atomic writes over outbox queue pattern for MPPP scope (< 200 captures/day)
- **Metrics Collection**: Local-only NDJSON files with opt-in activation and additive-only schema evolution

## Creating New ADRs

1. Use next sequential number (0022, 0023, etc.)
2. Follow the standard ADR template in `/docs/templates/`
3. Update this index immediately after creation
4. Add cross-references to related PRDs and specs
