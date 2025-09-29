---
adr: 0025
title: Memory Mapping for Large Data Performance
status: accepted
context-date: 2025-09-29
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0025: Memory Mapping for Large Data Performance

## Status

Accepted

## Context

The ADHD Brain staging ledger performs large sequential read operations during recovery scans and export queries, particularly when processing voice memo metadata and performing bulk capture operations. SQLite's default I/O mechanism uses traditional read/write system calls, which can be suboptimal for large sequential data access patterns.

**Current I/O Patterns:**
- Recovery scans read 1000+ capture records sequentially
- Voice memo fingerprint verification accesses large metadata blobs
- Export operations perform bulk reads of capture data for vault writing
- Database file sizes ranging from 10MB to 500MB+ as capture volume grows

**Performance Analysis:**
- Traditional read() syscalls require multiple kernel transitions
- Page cache management handled by OS buffer cache
- Memory copying between kernel and user space for each read operation
- Cache misses result in disk I/O latency for large sequential operations

**SQLite Memory Mapping Benefits:**
- **mmap()** syscall maps database file directly into process address space
- **Zero-copy access** eliminates memory copying between kernel and user space
- **OS page cache integration** provides more efficient memory management
- **Large data performance** significantly improved for sequential access patterns
- **Automatic prefetching** by OS based on access patterns

**Target Environment:**
- Modern macOS/Linux systems with efficient mmap() implementations
- Sufficient virtual address space for database mapping
- Single-user local-first system with predictable access patterns

The decision supports the architecture review goal of optimizing large data performance while maintaining SQLite's reliability and ACID properties.

## Decision

We will **enable SQLite memory mapping** for the staging ledger database to optimize large data performance.

**Configuration:**
```sql
-- Enable memory mapping for database files up to 256MB
PRAGMA mmap_size = 268435456; -- 256MB in bytes

-- For larger databases, use dynamic sizing
PRAGMA mmap_size = -1; -- Use default (depends on SQLite version, typically 128MB+)
```

**Implementation Strategy:**

### Memory Mapping Configuration
```typescript
async function configureDatabase(db: Database) {
  // Set memory mapping size based on expected database growth
  await db.exec('PRAGMA mmap_size = 268435456'); // 256MB
  
  // Verify mmap configuration
  const mmapSize = await db.get('PRAGMA mmap_size');
  console.log(`Memory mapping configured: ${mmapSize} bytes`);
}
```

### Dynamic Sizing Strategy
- **Initial Setting:** 256MB for expected MPPP database sizes
- **Growth Handling:** Monitor database size and adjust mmap_size if needed
- **Performance Monitoring:** Track I/O performance improvements via metrics

### Platform Considerations
- **macOS:** Excellent mmap() performance, virtual memory management
- **Linux:** Strong mmap() support, transparent huge pages benefit
- **Windows:** SQLite handles platform differences automatically

**Scope:**
- **Target:** Staging ledger database only (`~/.adhd-brain/staging.db`)
- **Operations:** All database operations benefit (reads primarily, writes secondarily)
- **Size Limit:** 256MB mapping size covers expected MPPP database growth
- **Compatibility:** Works with existing WAL mode, cache optimization, and indexes

## Alternatives Considered

### Alternative 1: Larger Cache Size Instead of mmap
```sql
PRAGMA cache_size = -128000; -- 128MB cache instead of 64MB + mmap
```
**Pros:** Single optimization approach, predictable memory usage
**Cons:** Limited to SQLite's cache management, no OS-level optimizations
**Analysis:** Memory mapping provides OS-level benefits beyond cache size
**Rejected:** mmap + cache optimization provide complementary benefits

### Alternative 2: Disable Memory Mapping (SQLite Default)
**Pros:** Consistent with traditional SQLite deployment, predictable behavior
**Cons:** Leaves performance optimizations on table, suboptimal for large data
**Analysis:** Missing opportunity for significant I/O performance improvements
**Rejected:** Contradicts performance optimization goals

### Alternative 3: Aggressive Memory Mapping (1GB+)
```sql
PRAGMA mmap_size = 1073741824; -- 1GB mapping
```
**Pros:** Maximum performance for any database size
**Cons:** Excessive virtual memory usage, potential memory pressure
**Analysis:** Overkill for MPPP scope, may cause resource contention
**Rejected:** 256MB provides optimal balance for expected usage

### Alternative 4: Application-Level File Mapping
```typescript
// Custom mmap() implementation for data access
const mappedFile = mmap(databaseFile, 0, fileSize, PROT_READ);
```
**Pros:** Fine-grained control over mapping strategy
**Cons:** Bypasses SQLite's ACID guarantees, complex implementation, durability risks
**Analysis:** Reinventing SQLite's proven data access mechanisms
**Rejected:** SQLite's mmap implementation maintains reliability while optimizing performance

## Consequences

### Positive
- **Significantly faster large data operations** through zero-copy access
- **Reduced CPU overhead** by eliminating memory copying between kernel/user space
- **Better OS integration** with virtual memory and page cache systems
- **Automatic OS optimizations** like prefetching and transparent huge pages
- **Improved sequential read performance** for recovery and export operations
- **Virtual memory efficiency** - mapped pages only consume physical RAM when accessed
- **Complementary optimization** enhances benefits from cache sizing and indexes

### Negative
- **Virtual address space usage** - 256MB of virtual memory mapped per connection
- **Platform dependency** - performance benefits vary across operating systems
- **Memory pressure sensitivity** - performance degrades if system under memory pressure
- **Debugging complexity** - memory-mapped crashes can be harder to diagnose

### Risk Mitigations
- **Conservative sizing** - 256MB limit prevents excessive virtual memory usage
- **Monitoring** - track virtual memory usage and performance metrics
- **Fallback capability** - can disable mmap if issues arise (set mmap_size = 0)
- **Platform testing** - validate performance improvements on target systems
- **Memory monitoring** in health checks to detect pressure conditions

## Implementation Plan

### Phase 1: Enable Memory Mapping
1. Add `PRAGMA mmap_size = 268435456` to database initialization
2. Verify configuration in health checks
3. Monitor virtual memory usage patterns

### Phase 2: Performance Validation
1. Run performance regression tests for recovery and export operations
2. Measure I/O performance improvements vs baseline
3. Validate memory usage patterns under normal load

### Phase 3: Optimization and Monitoring
1. Fine-tune mmap size based on actual database growth patterns
2. Add memory mapping metrics to health command output
3. Document performance characteristics in troubleshooting guides

## Performance Impact Analysis

**Expected Improvements:**
- **Large sequential reads:** 20-40% performance improvement
- **Recovery operations:** Faster metadata access during bulk scans
- **Export queries:** Reduced I/O latency for bulk data retrieval
- **Voice memo processing:** Faster access to large metadata structures

**Memory Usage:**
- **Virtual memory:** +256MB per database connection (mapped, not resident)
- **Physical memory:** Only accessed pages consume RAM (typically 10-50MB)
- **Memory efficiency:** OS manages page eviction based on access patterns

**System Requirements:**
- **64-bit systems:** Essential for large virtual address space
- **Available virtual memory:** 256MB+ per connection
- **OS support:** Modern mmap() implementation (macOS 10.9+, Linux 3.x+)

## Integration with Existing Optimizations

**Synergy with ADR-0022 (64MB Cache):**
- Memory mapping reduces cache pressure by eliminating redundant buffering
- Cache focuses on frequently accessed data while mmap handles large sequential access
- Combined optimization provides both hot data caching and large data efficiency

**Synergy with ADR-0023 (Composite Indexes):**
- Index access benefits from memory mapping for large index structures
- Sequential index scans (ORDER BY operations) significantly faster
- Index statistics and metadata access optimized

**Synergy with ADR-0024 (PRAGMA optimize):**
- Statistics gathering operations benefit from faster large data access
- Index maintenance operations complete faster with memory mapping
- Query plan optimization based on more accurate performance characteristics

## Platform-Specific Considerations

**macOS Optimization:**
- Unified Buffer Cache integrates well with mmap
- Virtual memory system handles large mappings efficiently
- Metal performance shaders may benefit from consistent memory access patterns

**Linux Optimization:**
- Transparent Huge Pages can improve mapping efficiency
- cgroups memory limits apply to mapped pages when accessed
- systemd memory accounting includes mapped pages appropriately

## Monitoring and Health Checks

**Health Command Integration:**
```bash
capture health --verbose
# Memory Mapping Status:
# - Configured Size: 256MB
# - Mapped Pages: 45MB (active)
# - Virtual Memory Usage: 256MB
# - Page Faults: 1,234 (major: 56)
```

**Performance Metrics:**
- `mmap_configured_bytes` (gauge) - Configured mapping size
- `mmap_active_pages_bytes` (gauge) - Actually mapped pages in memory
- `io_sequential_read_ms` (histogram) - Large read operation latency
- `virtual_memory_usage_bytes` (gauge) - Process virtual memory size

## Trigger to Revisit

This memory mapping configuration should be reconsidered if:
- Virtual memory usage causes system resource constraints
- Performance monitoring shows no significant improvement from mmap
- Database size consistently exceeds 256MB (increase mmap_size)
- Platform-specific issues arise with memory mapping
- Alternative storage engines provide better large data performance

## Related Decisions
- [ADR 0022: SQLite Cache Size Optimization](./0022-sqlite-cache-size-optimization.md) - Complementary memory optimization
- [ADR 0023: Composite Indexes](./0023-composite-indexes-recovery-export.md) - Index access optimization
- [ADR 0024: PRAGMA optimize](./0024-pragma-optimize-implementation.md) - Maintenance operation optimization
- [ADR 0005: WAL Mode with NORMAL Synchronous](./0005-wal-mode-normal-sync.md) - Durability and concurrency balance

## References
- [SQLite Memory Mapping Documentation](https://www.sqlite.org/mmap.html)
- [SQLite I/O and Memory Usage](https://www.sqlite.org/tempfiles.html)
- [Capture Tech Spec - Performance Requirements](/Users/nathanvale/code/adhd-brain/docs/features/capture/spec-capture-tech.md)
- [Master PRD - Section 4.3 Performance Targets](/Users/nathanvale/code/adhd-brain/docs/master/prd-master.md)