---
adr: 0024
title: PRAGMA optimize Implementation from SQLite 2024
status: accepted
context-date: 2025-09-29
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0024: PRAGMA optimize Implementation from SQLite 2024

## Status

Accepted

## Context

SQLite 3.18.0+ (and enhanced in 2024 releases) introduced `PRAGMA optimize`, a maintenance command that automatically optimizes database performance by updating table statistics and rebuilding indexes when beneficial. The ADHD Brain staging ledger, with its composite indexes from ADR-0023 and growing capture data, would benefit significantly from this optimization feature.

**Current State:**
- Manual `ANALYZE` commands required for query optimizer statistics
- Index statistics become stale as data volume grows
- Query planner may choose suboptimal execution plans without current statistics
- No automated maintenance for index efficiency

**Performance Context:**
- New composite indexes (ADR-0023) need regular statistics updates for optimal query planning
- Recovery and export queries depend on accurate cardinality estimates
- Growing capture volume (MPPP target: <1000 captures/year) changes data distribution over time
- Cache optimization (ADR-0022) benefits from up-to-date query plans

**SQLite PRAGMA optimize Benefits:**
- **Automatic statistics updates** for improved query planning
- **Index maintenance** without manual intervention
- **Query plan optimization** based on actual data distribution
- **Performance regression prevention** through proactive maintenance
- **Zero configuration** once implemented - SQLite handles optimization logic

The feature aligns with ADHD-friendly automation principles by reducing manual database maintenance tasks while ensuring consistent performance.

## Decision

We will **implement `PRAGMA optimize` from SQLite 2024** as an automated maintenance feature for the staging ledger database.

**Implementation Strategy:**

### Automatic Optimization Triggers
```typescript
// Database connection shutdown
await db.exec('PRAGMA optimize');
await db.close();

// Periodic maintenance (daily)
async function performDailyMaintenance() {
  await db.exec('PRAGMA optimize');
  // Log optimization completion for metrics
}

// Application startup (conditional)
async function initializeDatabase() {
  await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  
  // Run optimize if last run > 24 hours
  const lastOptimize = await getLastOptimizeTime();
  if (Date.now() - lastOptimize > 24 * 60 * 60 * 1000) {
    await db.exec('PRAGMA optimize');
    await setLastOptimizeTime(Date.now());
  }
}
```

### Integration Points
1. **Connection Shutdown:** Always run `PRAGMA optimize` before closing database connections
2. **Daily Maintenance:** Scheduled optimization during low-usage periods
3. **Conditional Startup:** Run optimization if last execution > 24 hours
4. **Health Checks:** Include optimization status in health command output

### Configuration Approach
```sql
-- Enable automatic optimization (default in SQLite 3.18+)
PRAGMA optimize; -- Full optimization

-- For debugging: query-specific optimization
PRAGMA optimize(0x10002); -- Update all statistics only
```

**Scope:**
- **Target Database:** Staging ledger (`~/.adhd-brain/staging.db`) only
- **Tables Covered:** captures, exports_audit, errors_log, sync_state (all 4 tables per hard cap)
- **Index Coverage:** All indexes including new composite indexes from ADR-0023
- **Statistics:** Table and index statistics for query optimizer

## Alternatives Considered

### Alternative 1: Manual ANALYZE Commands
```sql
ANALYZE; -- Update all statistics manually
ANALYZE captures; -- Table-specific analysis
```
**Pros:** Fine-grained control, predictable timing, explicit execution
**Cons:** Manual intervention required, easy to forget, no index maintenance
**Analysis:** Reduces automation benefits, inconsistent performance over time
**Rejected:** Contradicts ADHD-friendly automation principles

### Alternative 2: Scheduled VACUUM Operations
```sql
VACUUM; -- Full database rebuild and optimization
```
**Pros:** Complete optimization, reclaims unused space, rebuilds all indexes
**Cons:** Long execution time, exclusive lock required, overkill for statistics
**Analysis:** Too heavy-weight for regular maintenance, blocks all operations
**Rejected:** `PRAGMA optimize` provides statistics updates without downtime

### Alternative 3: Custom Statistics Management
```typescript
// Application-level statistics tracking
async function updateTableStatistics() {
  const stats = await analyzeTableDistribution();
  await updateQueryPlannerHints(stats);
}
```
**Pros:** Application-aware optimization, custom heuristics possible
**Cons:** Complex implementation, duplicates SQLite functionality, maintenance burden
**Analysis:** Reinventing SQLite's proven optimization logic
**Rejected:** SQLite's built-in optimization is more reliable and maintained

### Alternative 4: No Optimization Strategy
**Pros:** Simplest implementation, no maintenance overhead
**Cons:** Degrading performance over time, suboptimal query plans, wasted index benefits
**Analysis:** Performance regression inevitable as data volume grows
**Rejected:** Contradicts performance optimization goals from ADRs 0022-0023

## Consequences

### Positive
- **Automated query plan optimization** without manual intervention
- **Index efficiency maintenance** ensures composite indexes (ADR-0023) perform optimally
- **Statistics freshness** keeps query optimizer informed of data distribution changes
- **Performance regression prevention** through proactive maintenance
- **Zero configuration overhead** - SQLite handles optimization logic internally
- **ADHD-friendly automation** reduces cognitive load of manual database maintenance
- **Complementary optimization** enhances benefits from cache sizing (ADR-0022) and indexes (ADR-0023)

### Negative
- **Slight overhead on connection shutdown** - adds ~50-200ms to close operations
- **Periodic maintenance cost** - daily optimization takes ~100-500ms on staging database
- **Non-deterministic timing** - optimization duration varies with data volume and changes
- **Minimal disk I/O increase** during optimization runs

### Risk Mitigations
- **Asynchronous execution** where possible to avoid blocking operations
- **Timeout protection** for optimization commands (reasonable max duration)
- **Logging and monitoring** to track optimization frequency and duration
- **Graceful degradation** - application continues if optimization fails
- **Performance monitoring** to validate optimization effectiveness

## Implementation Plan

### Phase 1: Basic Integration
1. Add `PRAGMA optimize` to database connection shutdown sequence
2. Implement last-optimization tracking in sync_state table
3. Add conditional optimization to database initialization

### Phase 2: Scheduled Maintenance
1. Implement daily maintenance routine with optimization
2. Add optimization status to health command output
3. Include optimization metrics in local NDJSON logs (when enabled)

### Phase 3: Monitoring and Validation
1. Track optimization frequency and duration via metrics
2. Monitor query performance improvements post-optimization
3. Validate index usage statistics accuracy after optimization runs

## Performance Impact Analysis

**Expected Benefits:**
- **Query plan accuracy:** Up-to-date statistics improve optimizer decisions
- **Index effectiveness:** Maintains optimal index utilization over time
- **Performance consistency:** Prevents gradual degradation as data grows
- **Compound optimization:** Maximizes benefits from cache size and composite indexes

**Overhead Assessment:**
- Connection shutdown: +50-200ms per close operation
- Daily maintenance: ~100-500ms for staging database optimization
- Startup conditional: +100-300ms when optimization needed (max once/24h)
- Total daily cost: <1 second for significant performance benefits

**Measurement Strategy:**
```typescript
// Track optimization metrics
interface OptimizationMetrics {
  timestamp: string;
  duration_ms: number;
  tables_analyzed: number;
  indexes_updated: number;
  query_plan_changes: number;
}
```

## Integration with Existing Optimizations

**Synergy with ADR-0022 (Cache Size):**
- Fresh statistics help query planner utilize 64MB cache more effectively
- Index selection benefits from accurate cardinality estimates
- Cache hit ratios improve with optimal query plans

**Synergy with ADR-0023 (Composite Indexes):**
- Statistics updates ensure composite indexes are preferred when beneficial
- Index selectivity calculations stay current with data distribution
- Query planner chooses optimal index for multi-condition queries

**WAL Mode Compatibility (ADR-0005):**
- `PRAGMA optimize` works safely with WAL mode
- No exclusive locks required for statistics updates
- Concurrent operations continue during optimization

## Monitoring and Health Checks

**Health Command Integration:**
```bash
capture health --verbose
# Database Status:
# - Cache Size: 64MB
# - Last Optimization: 2025-09-29T10:30:00Z (2 hours ago)
# - Index Statistics: Current
# - Query Plan Efficiency: 95%
```

**Metrics Collection:**
- optimization_duration_ms (histogram)
- optimization_frequency_total (counter) 
- query_plan_changes_total (counter per optimization)
- index_statistics_age_hours (gauge)

## Trigger to Revisit

This optimization strategy should be reconsidered if:
- Optimization overhead exceeds 5% of total database operation time
- Manual tuning provides significantly better performance than automated optimization
- Data volume growth changes optimization frequency requirements (>10k captures)
- SQLite version upgrades provide better optimization alternatives
- Application workload shifts to require different optimization strategies

## Related Decisions
- [ADR 0022: SQLite Cache Size Optimization](./0022-sqlite-cache-size-optimization.md) - Complementary memory optimization
- [ADR 0023: Composite Indexes](./0023-composite-indexes-recovery-export.md) - Index statistics optimization target
- [ADR 0005: WAL Mode with NORMAL Synchronous](./0005-wal-mode-normal-sync.md) - Optimization compatibility
- [ADR 0021: Local-Only NDJSON Metrics](./0021-local-metrics-ndjson-strategy.md) - Performance monitoring alignment

## References
- [SQLite PRAGMA optimize Documentation](https://www.sqlite.org/pragma.html#pragma_optimize)
- [SQLite Query Planner Documentation](https://www.sqlite.org/optoverview.html)
- [Capture Tech Spec - Performance Requirements](/Users/nathanvale/code/adhd-brain/docs/features/capture/spec-capture-tech.md)
- [Master PRD - Section 4.3 Performance Targets](/Users/nathanvale/code/adhd-brain/docs/master/prd-master.md)