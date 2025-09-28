---
adr: 0012
title: TDD Required for High-Risk Obsidian Bridge
status: accepted
context-date: 2025-09-27
owner: Nathan
---

## Status

Accepted

## Context

The Obsidian Bridge component handles atomic writes to the user's Obsidian vault, which serves as their canonical knowledge store. Failures in this component can result in:
- Vault corruption from partial writes
- Data loss from failed exports
- Sync conflicts with Obsidian Sync/iCloud
- User anxiety from unreliable export behavior

The component implements complex atomicity guarantees, collision detection, and error recovery paths that are difficult to verify through manual testing alone.

Reference: `docs/features/obsidian-bridge/spec-obsidian-test.md` §2

## Decision

Classify Obsidian Bridge as **HIGH RISK** and mandate Test-Driven Development (TDD):

1. **Risk Level**: HIGH (vault corruption = permanent data loss)
2. **TDD Scope**:
   - Unit tests: AtomicWriter contract, path resolution, collision detection
   - Integration tests: End-to-end atomic write with filesystem and SQLite
   - Contract tests: `exports_audit` foreign key constraints, filesystem atomicity
3. **Coverage Requirements**: 100% coverage for atomic write operations and error paths
4. **Test Categories**: P0 (data integrity), P1 (operational reliability), P2 (edge cases)

## Alternatives Considered

1. **Manual testing only** - Insufficient for complex atomicity requirements (rejected)
2. **Post-implementation testing** - Cannot validate design decisions early (rejected)
3. **Integration tests only** - Misses unit-level edge cases (rejected)
4. **Reduced coverage** - Unacceptable risk for vault corruption scenarios (rejected)

## Consequences

**Positive:**
- Early detection of atomicity violations and race conditions
- Comprehensive error path verification (EACCES, ENOSPC, etc.)
- Design validation for collision handling and recovery
- Regression prevention for critical vault safety features
- Documentation of expected behavior through tests

**Negative:**
- Increased development time for test creation
- Additional complexity for crash simulation and fault injection
- Test maintenance overhead for refactoring
- Slower initial feature delivery

**Quality Assurance:**
- P0 Tests: Atomic write guarantees, collision detection, audit trail integrity
- P1 Tests: Error recovery paths, filesystem edge cases
- P2 Tests: Performance characteristics, concurrent access (Phase 2+)

## Testing Strategy

1. **TestKit Integration**: Use filesystem, SQLite, and environment domains
2. **Crash Recovery**: Fault injection hooks for deterministic crash testing
3. **Performance Gates**: < 50ms p95 export latency requirement
4. **Contract Verification**: SQLite foreign keys, filesystem atomicity guarantees

## Implementation Notes

- Crash simulation using fault injection registry (guide reference)
- Isolated test environments using TestKit temp directories
- Mock filesystem operations for error injection testing
- Performance benchmarks integrated into CI/CD pipeline

## References

- Test Spec: `docs/features/obsidian-bridge/spec-obsidian-test.md` v1.0.0-MPPP
- TDD Guide: `docs/guides/tdd-applicability.md` v1.0.0 (risk assessment framework)
- TestKit Guide: `docs/guides/guide-testkit-usage.md` v0.1.0
- Crash Matrix Guide: `docs/guides/guide-crash-matrix-test-plan.md`