---
adr: 0005
title: WAL Mode with NORMAL Synchronous for Local-First Durability
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0005: WAL Mode with NORMAL Synchronous for Local-First Durability

## Status

Accepted

## Context

The staging ledger requires balancing crash safety with performance for burst capture scenarios. ADHD users need sub-100ms capture latency but also zero tolerance for data loss.

SQLite offers multiple journal modes and synchronous settings:

- Journal modes: DELETE, TRUNCATE, PERSIST, MEMORY, WAL, OFF
- Synchronous: OFF, NORMAL, FULL, EXTRA

The staging ledger operates in a local-only environment (no network sync) but must survive application crashes during burst capture sessions.

## Decision

Configure SQLite with **WAL mode** and **NORMAL synchronous**:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

**Rationale:**

- WAL mode enables concurrent reads during writes (non-blocking queries)
- WAL mode provides better crash recovery (smaller corruption window)
- NORMAL sync balances safety with performance for local-only usage
- Acceptable risk: < 1s data loss window on OS crash (not application crash)

## Alternatives Considered

- **FULL synchronous** - Rejected due to burst capture performance impact
- **OFF synchronous** - Rejected due to unacceptable data loss risk
- **DELETE journal mode** - Rejected due to blocking reads during writes
- **Memory journal** - Rejected due to crash recovery requirements

## Consequences

### Positive

- Faster writes (no fsync per transaction)
- Concurrent reads during transcription/export
- Better crash recovery than DELETE mode
- Suitable for local-only ledger (no network corruption risks)

### Negative

- Small data loss window (< 1s) on OS crash or power failure
- Slightly more complex backup (WAL file + main file)
- Larger disk footprint until checkpoint

### Risk Acceptance

We accept the < 1s data loss window because:

1. Local-only usage (no network corruption vectors)
2. Hourly backups provide additional recovery layer
3. Burst capture UX requires sub-100ms latency
4. Application crashes (most common) are fully recoverable

## Monitoring

- Track backup verification success rate
- Monitor capture staging latency (target < 100ms p95)
- Alert on any data integrity issues

## References

- [Staging Ledger PRD v1.0.0-MPPP](../features/staging-ledger/prd-staging.md) §5.4
- [Staging Ledger Tech Spec v1.0.0-MPPP](../features/staging-ledger/spec-staging-tech.md) §2.2
