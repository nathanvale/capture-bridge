---
adr: 0022
title: SQLite Cache Size Optimization (2MB → 64MB)
status: accepted
context-date: 2025-09-29
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0022: SQLite Cache Size Optimization (2MB → 64MB)

## Status

Accepted

## Context

Performance analysis of the ADHD Brain capture system revealed significant SQLite read performance bottlenecks during recovery operations and export queries. The current SQLite configuration uses default `cache_size` settings (approximately 2MB) which is insufficient for the staging ledger workload patterns.

Key findings from architecture review:

- Recovery scans of 1000+ staged captures exceed p95 latency targets (>2s observed vs <2s target)
- Export queries show 40-60% slower read operations than optimal
- Large voice memo metadata processing creates cache pressure during fingerprint verification
- Sequential processing of captures benefits from larger cache retention between operations

**Current State:**

- Default SQLite `cache_size` = -2000 (2MB)
- Recovery operations frequently hit disk for metadata lookups
- Export query patterns show cache misses on repeated table scans
- Memory usage well below available system resources on target devices

**Performance Requirements:**

- Recovery scan (1000 items) < 2s p95 latency per Capture Tech Spec
- Voice memo staging < 150ms p95 including fingerprint operations
- Export query performance supporting 40-60% faster read operations
- Memory efficiency within ADHD-friendly resource constraints

The decision aligns with local-first architecture principles where optimizing for local database performance takes priority over network efficiency considerations.

## Decision

We will **increase SQLite `cache_size` from 2MB to 64MB** (32x improvement) for the staging ledger database.

**Implementation Details:**

```sql
-- Set cache size to 64MB (64000 KB = 64000 pages of 1KB each)
PRAGMA cache_size = -64000;

-- Verify setting persists across connections
PRAGMA cache_size; -- Should return -64000
```

**Application Integration:**

- Set pragma immediately after database connection establishment
- Apply to staging ledger database (`~/.adhd-brain/staging.db`)
- Document in database initialization scripts
- Add cache size verification to health checks

**Scope:**

- **In Scope:** Staging ledger database only (captures, exports_audit, errors_log, sync_state tables)
- **Out of Scope:** Other SQLite databases (if any), external database connections
- **Backward Compatible:** No schema changes, pure configuration optimization

## Alternatives Considered

### Alternative 1: Conservative 16MB Cache

**Pros:** Lower memory footprint, still significant improvement over 2MB
**Cons:** Sub-optimal performance gains, may still hit cache limits during large recovery operations
**Analysis:** 16MB provides ~8x improvement but leaves performance on table for minimal memory cost
**Rejected:** 64MB provides better ROI with negligible memory impact on target devices

### Alternative 2: Adaptive Cache Sizing

**Pros:** Dynamic optimization based on workload, memory-efficient
**Cons:** Implementation complexity, unpredictable performance characteristics, ADHD-unfriendly variability
**Analysis:** Adds complexity without clear benefits for single-user MPPP scope
**Rejected:** Fixed sizing provides predictable performance and simpler debugging

### Alternative 3: External Caching Layer (Redis/Memcached)

**Pros:** Mature caching infrastructure, sophisticated eviction policies
**Cons:** External dependency, operational complexity, contradicts local-first principles
**Analysis:** Overkill for single-user system, adds deployment complexity
**Rejected:** SQLite native caching sufficient for MPPP scope

### Alternative 4: Database Sharding/Partitioning

**Pros:** Distributes cache pressure across multiple databases
**Cons:** Query complexity, transaction coordination issues, premature optimization
**Analysis:** Architectural overkill for current data volumes (<1000 captures/year)
**Rejected:** Simple cache increase addresses root cause more directly

## Consequences

### Positive

- **40-60% faster read operations** during recovery and export queries
- **Improved p95 latency** for recovery scans (target: <2s for 1000 items)
- **Reduced disk I/O** during sequential capture processing
- **Better fingerprint verification performance** through metadata cache retention
- **Predictable performance characteristics** with fixed cache allocation
- **Zero schema migration required** - pure configuration change
- **Immediate effect** - applies to existing databases without data migration

### Negative

- **Increased memory usage** by ~62MB per staging database connection
- **Higher memory baseline** for ADHD Brain process (acceptable on target devices)
- **Cache warming time** - initial operations may be slower until cache populates
- **Memory pressure on resource-constrained environments** (mitigated by single-user scope)

### Risk Mitigations

- **Memory monitoring** via health command to track actual usage vs allocation
- **Cache hit ratio metrics** to validate performance improvements
- **Graceful degradation** - SQLite handles memory pressure by reducing cache automatically
- **Rollback plan** - simple pragma change to revert to previous cache size
- **Documentation** in troubleshooting guides for memory-constrained debugging

## Implementation Plan

### Phase 1: Database Configuration

1. Add `PRAGMA cache_size = -64000` to database initialization
2. Update connection pooling to set pragma consistently
3. Verify setting persistence across connection cycles

### Phase 2: Validation

1. Add cache size verification to health checks
2. Implement cache hit ratio monitoring (optional dev metrics)
3. Performance regression tests for recovery operations

### Phase 3: Documentation

1. Update deployment guides with memory requirements
2. Document rollback procedure in troubleshooting guides
3. Add cache size rationale to architecture notes

## Performance Impact Analysis

**Expected Improvements:**

- Recovery scan latency: 2s → <1.5s (25% improvement)
- Export query performance: 40-60% faster read operations
- Voice memo staging: Reduced metadata lookup latency
- Memory overhead: +62MB per connection (acceptable for single-user system)

**Measurement Strategy:**

- Track p95 latencies for recovery operations
- Monitor cache hit ratios via SQLite statistics
- Memory usage monitoring in health checks
- Performance regression gates in test suite

## Trigger to Revisit

This cache size should be reconsidered if:

- Memory usage exceeds 80% of available system RAM on target devices
- Performance monitoring shows diminishing returns from cache size
- Data volume growth changes access patterns (>10k captures, distributed usage)
- Multi-user deployment requires memory optimization
- Alternative storage engines considered (LMDB, RocksDB, etc.)

## Related Decisions

- [ADR 0005: WAL Mode with NORMAL Synchronous](./0005-wal-mode-normal-sync.md) - Durability vs performance balance
- [ADR 0003: Four-Table Hard Cap](./0003-four-table-hard-cap.md) - Constrains cache scope to known table set
- [ADR 0008: Sequential Processing for MPPP](./0008-sequential-processing-mppp.md) - Cache retention benefits sequential operations
- [ADR 0021: Local-Only NDJSON Metrics](./0021-local-metrics-ndjson-strategy.md) - Performance monitoring alignment

## References

- [Capture Tech Spec - Performance Requirements](/Users/nathanvale/code/adhd-brain/docs/features/capture/spec-capture-tech.md)
- [Capture Architecture Spec - SQLite Integration](/Users/nathanvale/code/adhd-brain/docs/features/capture/spec-capture-arch.md)
- [Master PRD - Section 4.3 Performance Targets](/Users/nathanvale/code/adhd-brain/docs/master/prd-master.md)
- [SQLite Cache Size Documentation](https://www.sqlite.org/pragma.html#pragma_cache_size)
