---
adr: 0023
title: Composite Indexes for Recovery and Export Queries
status: accepted
context-date: 2025-09-29
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0023: Composite Indexes for Recovery and Export Queries

## Status

Accepted

## Context

Performance analysis of the ADHD Brain staging ledger revealed query bottlenecks in two critical operation patterns: recovery scans and export operations. The current database schema lacks optimized indexes for these specific access patterns, resulting in full table scans and suboptimal query performance.

**Current Query Patterns:**

1. **Recovery Queries:**
   ```sql
   -- Find captures needing recovery verification
   SELECT * FROM captures 
   WHERE status IN ('DISCOVERED', 'PROCESSING') 
   ORDER BY created_at ASC;
   
   -- Recovery scan by creation time window
   SELECT * FROM captures 
   WHERE created_at >= ? AND status != 'EXPORTED'
   ORDER BY created_at;
   ```

2. **Export Queries:**
   ```sql
   -- Find ready captures for export
   SELECT * FROM captures 
   WHERE status = 'READY' AND exported_at IS NULL
   ORDER BY created_at ASC;
   
   -- Export audit queries
   SELECT c.*, ea.exported_path FROM captures c
   LEFT JOIN exports_audit ea ON c.capture_id = ea.capture_id
   WHERE c.status = 'EXPORTED' AND c.created_at >= ?;
   ```

**Performance Issues Identified:**
- Recovery operations show 5-10x slower performance than target (2s p95 for 1000 items)
- Export queries use full table scans when filtering by status combinations
- `ORDER BY created_at` requires sorting without index support
- Combined status + timestamp queries lack composite index optimization

**Current Index State:**
- Primary key on `capture_id` only
- Unique constraint on `content_hash` only
- No composite indexes for frequent query patterns
- Foreign key constraints lack supporting indexes

The decision supports the goal of 5-10x faster recovery queries and 3-5x faster export operations identified in the architecture review.

## Decision

We will **add composite indexes optimized for recovery and export query patterns** to the staging ledger database.

**New Indexes to Create:**

### Index 1: Recovery Operations Index
```sql
CREATE INDEX IF NOT EXISTS idx_captures_recovery 
ON captures(status, created_at ASC) 
WHERE status IN ('DISCOVERED', 'PROCESSING', 'READY');
```

**Purpose:** Optimizes recovery scans and status-based queries with chronological ordering

### Index 2: Export Ready Index  
```sql
CREATE INDEX IF NOT EXISTS idx_captures_export_ready
ON captures(status, exported_at, created_at ASC)
WHERE status = 'READY' AND exported_at IS NULL;
```

**Purpose:** Optimizes finding captures ready for export in chronological order

### Index 3: Export History Index
```sql
CREATE INDEX IF NOT EXISTS idx_captures_export_history
ON captures(status, created_at ASC, exported_at)
WHERE status = 'EXPORTED';
```

**Purpose:** Optimizes export audit queries and retention cleanup operations

### Index 4: Content Hash Performance Index
```sql
CREATE INDEX IF NOT EXISTS idx_captures_content_hash_status
ON captures(content_hash, status);
```

**Purpose:** Optimizes duplicate detection with status awareness for faster dedup operations

**Implementation Strategy:**
- Create indexes using `IF NOT EXISTS` for safe deployment
- Use partial indexes with `WHERE` clauses to reduce index size
- Order columns by selectivity (status first, then temporal)
- Align with existing WAL mode configuration for concurrent access

## Alternatives Considered

### Alternative 1: Single Covering Index
```sql
CREATE INDEX idx_captures_all_queries 
ON captures(status, created_at, exported_at, content_hash);
```
**Pros:** Single index covers multiple query patterns
**Cons:** Large index size, suboptimal for specific queries, maintenance overhead
**Analysis:** Less selective than purpose-built indexes, wastes storage on unused combinations
**Rejected:** Multiple specialized indexes provide better performance per storage cost

### Alternative 2: Expression-Based Indexes
```sql
CREATE INDEX idx_captures_derived_state 
ON captures((CASE WHEN exported_at IS NULL THEN 'pending' ELSE 'exported' END), created_at);
```
**Pros:** Aligns with derived state logic from application
**Cons:** Complex maintenance, expression evaluation overhead, poor query planner support
**Analysis:** Premature optimization without clear benefit over simple column indexes
**Rejected:** Simple column-based indexes easier to understand and maintain

### Alternative 3: Materialized Views
```sql
CREATE VIEW ready_captures AS 
SELECT * FROM captures WHERE status = 'READY' AND exported_at IS NULL;
```
**Pros:** Encapsulates query logic, potentially faster access
**Cons:** SQLite materialized view limitations, cache invalidation complexity
**Analysis:** SQLite views are not materialized, provides no performance benefit
**Rejected:** Standard indexes provide actual performance improvement

### Alternative 4: Table Partitioning by Status
**Pros:** Physically separate data by access patterns
**Cons:** SQLite lacks native partitioning, application complexity, cross-partition queries
**Analysis:** Would require application-level partition management, overkill for current scale
**Rejected:** Indexes solve performance problem with much lower complexity

## Consequences

### Positive
- **5-10x faster recovery queries** through optimized status + timestamp access
- **3-5x faster export operations** via purpose-built export indexes
- **Improved duplicate detection** with content_hash + status composite index
- **Better query plan optimization** from SQLite query planner using appropriate indexes
- **Reduced full table scans** for common operational queries
- **Chronological ordering optimization** through ordered index structures
- **Partial index efficiency** reduces storage overhead via WHERE clause filtering

### Negative
- **Increased storage overhead** ~15-25% for index data structures
- **Slower write operations** due to additional index maintenance on INSERT/UPDATE
- **Index maintenance complexity** during schema migrations
- **Query plan variability** - some edge case queries may choose suboptimal indexes

### Risk Mitigations
- **Write performance monitoring** to track index maintenance overhead
- **Query plan analysis** using EXPLAIN QUERY PLAN for critical operations
- **Index usage statistics** via SQLite analyzer to validate effectiveness
- **Incremental deployment** - create indexes one at a time to measure impact
- **Rollback capability** - indexes can be dropped without data loss

## Implementation Plan

### Phase 1: Index Creation
1. Create recovery operations index first (highest impact)
2. Validate query plan improvements for recovery scans
3. Deploy export indexes sequentially with performance validation

### Phase 2: Performance Validation
1. Run performance regression tests comparing before/after
2. Validate expected latency improvements (5-10x recovery, 3-5x export)
3. Monitor write operation overhead and optimize if needed

### Phase 3: Optimization
1. Analyze SQLite .stat tables for index usage patterns
2. Consider additional indexes based on real usage data
3. Remove or modify indexes that show low utilization

## Performance Impact Analysis

**Expected Query Performance:**
- Recovery scan (1000 items): 2s → 0.2-0.4s (5-10x improvement)
- Export ready queries: Current → 3-5x faster via idx_captures_export_ready
- Duplicate detection: Content hash lookups optimized by composite index
- Export history queries: Full table scan → indexed range scan

**Storage Impact:**
- Index overhead: ~15-25% of table size
- Recovery index: ~5-8MB for 10k captures
- Export indexes: ~3-5MB each for 10k captures
- Total additional storage: ~15-20MB (acceptable for local-first system)

**Write Performance:**
- Expected 10-15% slower INSERTs due to index maintenance
- Mitigated by sequential processing pattern (not burst writes)
- WAL mode provides concurrent read access during index updates

## Index Maintenance Strategy

**Monitoring:**
```sql
-- Check index usage statistics
SELECT name, tbl, stat FROM sqlite_stat1 WHERE tbl = 'captures';

-- Analyze query plans
EXPLAIN QUERY PLAN 
SELECT * FROM captures WHERE status = 'READY' AND exported_at IS NULL;
```

**Maintenance:**
- `PRAGMA optimize` after significant data changes (handled by ADR-0024)
- `ANALYZE` command periodically to update statistics
- Index rebuilding during major schema migrations

## Trigger to Revisit

These indexes should be reconsidered if:
- Write performance degrades beyond acceptable thresholds (>25% slower)
- Storage overhead exceeds available disk space constraints
- Query patterns change significantly (new access patterns emerge)
- Data volume grows beyond current assumptions (>100k captures)
- SQLite version upgrades provide better optimization alternatives

## Related Decisions
- [ADR 0022: SQLite Cache Size Optimization](./0022-sqlite-cache-size-optimization.md) - Complementary memory optimization
- [ADR 0005: WAL Mode with NORMAL Synchronous](./0005-wal-mode-normal-sync.md) - Concurrent access during index operations
- [ADR 0003: Four-Table Hard Cap](./0003-four-table-hard-cap.md) - Constrains index scope to known schema
- [ADR 0008: Sequential Processing](./0008-sequential-processing-mppp.md) - Write patterns compatible with index maintenance

## References
- [Capture Tech Spec - Performance Requirements](/Users/nathanvale/code/adhd-brain/docs/features/capture/spec-capture-tech.md)
- [Capture Architecture Spec - Recovery Operations](/Users/nathanvale/code/adhd-brain/docs/features/capture/spec-capture-arch.md)
- [Master PRD - Section 4.3 Performance Targets](/Users/nathanvale/code/adhd-brain/docs/master/prd-master.md)
- [SQLite Index Documentation](https://www.sqlite.org/optoverview.html)