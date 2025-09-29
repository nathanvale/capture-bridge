# Cross-Cutting Concerns

This directory contains documentation for foundational infrastructure and
patterns that span multiple features in the ADHD Brain project.

## Foundation

### [Monorepo Foundation](./prd-foundation-monorepo.md)

Core monorepo infrastructure using pnpm workspaces, Turbo, and shared tooling.

**Key Documents:**

- [PRD: Foundation Monorepo](./prd-foundation-monorepo.md)
- [Architecture Spec](./spec-foundation-monorepo-arch.md)
- [Technical Spec](./spec-foundation-monorepo-tech.md)
- [Test Spec](./spec-foundation-monorepo-test.md)

**Includes:**

- Package structure and boundaries
- Build pipeline (Turbo)
- Shared TestKit for testing patterns
- Linting and type checking
- CI/CD integration

## Core Patterns

### [Direct Export Pattern](./spec-direct-export-tech.md)

Atomic write pattern for exporting content from staging ledger to Obsidian
vault.

**Key Documents:**

- [Technical Spec](./spec-direct-export-tech.md)
- [Test Spec](./spec-direct-export-tech-test.md)
- [ADR: MPPP Direct Export](../adr/0013-mppp-direct-export-pattern.md)
- [ADR: Foundation Direct Export](../adr/0020-foundation-direct-export-pattern.md)

**Features:**

- Atomic write via temp-file-rename
- Idempotent exports
- Content hash integrity
- Error classification

### [Metrics Contract](./spec-metrics-contract-tech.md)

Local-first metrics collection using NDJSON for performance and quality
monitoring.

**Key Documents:**

- [Technical Spec](./spec-metrics-contract-tech.md)
- [Test Spec](./spec-metrics-contract-tech-test.md)
- [ADR: Local Metrics NDJSON](../adr/0021-local-metrics-ndjson-strategy.md)

**Features:**

- NDJSON append-only format
- Concurrent-safe writes
- Minimal overhead (< 1ms p95)
- Schema evolution support

## Related Documentation

### Feature Documentation

- [Features Overview](../features/) - Feature-specific requirements and specs
- [Master PRD](../master/prd-master.md) - Overall project requirements

### Architectural Decisions

- [ADR Index](../adr/_index.md) - All architectural decision records
- [ADR: Four Table Hard Cap](../adr/0003-four-table-hard-cap.md)
- [ADR: Status Driven State Machine](../adr/0004-status-driven-state-machine.md)
- [ADR: Atomic Write Pattern](../adr/0009-atomic-write-temp-rename-pattern.md)

### Implementation Guides

- [TDD Applicability Guide](../guides/guide-tdd-applicability.md)
- [Test Strategy Guide](../guides/guide-test-strategy.md)
- [TestKit Standardization Guide](../guides/guide-testkit-standardization.md)
- [Monorepo MPPP Guide](../guides/guide-monorepo-mppp.md)

## Architecture Principles

### MPPP Constraints (Minimum Plausible Production Path)

1. **Sequential Processing**: Single-threaded capture and export
2. **Direct Export**: No background job queue or outbox pattern
3. **Four Table Cap**: Maximum 4 tables in staging ledger
4. **Local-First**: All operations work offline
5. **Atomic Operations**: All writes are atomic (temp → rename)

### Risk Classification

- **P0 (Critical)**: Data loss/corruption risks - TDD required
- **P1 (Important)**: UX degradation - TDD recommended
- **P2 (Nice-to-have)**: Minor issues - Manual testing sufficient
- **P3 (Future)**: Deferred features

### YAGNI Boundaries

- ❌ No complex background job system (MPPP uses direct export)
- ❌ No distributed systems (local-first SQLite)
- ❌ No premature optimization (MPPP proves viability first)
- ✅ Simple, proven patterns (temp-file-rename, NDJSON)
- ✅ Incremental enhancement (P0 → P1 → P2)

## Quick Reference

| Concern               | Status | Risk Level | TDD Required |
| --------------------- | ------ | ---------- | ------------ |
| Monorepo Foundation   | Active | P0         | Yes          |
| Direct Export Pattern | Active | P0         | Yes          |
| Metrics Contract      | Active | P0         | Yes          |
| Security & Privacy    | Scoped | P1         | Partially    |
| Performance           | Scoped | P1         | Partially    |

## Documentation Standards

Cross-cutting documentation follows these templates:

- [Technical Spec Template](../templates/tech-spec-template.md)
- [Test Spec Template](../templates/test-spec-template.md)
- [Guide Template](../templates/guide-template.md)

All documents include:

- YAML frontmatter with metadata
- TDD Applicability Decision sections (when applicable)
- YAGNI Boundaries
- Links to related ADRs
