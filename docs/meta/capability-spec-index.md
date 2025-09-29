# Capability-Spec Index

**Generated**: 2025-09-29T15:30:00Z  
**Master PRD**: v2.3.0-MPPP  
**Roadmap**: v3.0.0  
**Context**: SQLite optimization work integration  

This index maps capabilities to their supporting specifications, with special emphasis on SQLite optimization enhancements from ADRs 0022-0025.

---

## SQLite Optimization Enhanced Capabilities

### SQLITE_SCHEMA (Phase 1, Slice 1.1) 🚀
**Category**: foundation | **Risk**: High | **TDD**: Required

**Core Specifications**:
- **Architecture**: `docs/features/capture/spec-capture-arch.md` §2 Component Overview
- **Technical**: `docs/features/capture/spec-capture-tech.md` §6 Hashing Strategy
- **Test**: `docs/features/capture/spec-capture-test.md` §4.1 Critical Tests

**SQLite Optimization ADRs**:
- **ADR-0022**: SQLite Cache Size Optimization (2MB → 64MB)
  - **Impact**: 40-60% faster read operations
  - **Implementation**: `PRAGMA cache_size = -64000`
- **ADR-0023**: Composite Indexes for Recovery and Export Queries
  - **Impact**: 5-10x faster recovery, 3-5x faster exports  
  - **Implementation**: 4 new composite indexes for query patterns
- **ADR-0024**: PRAGMA optimize Implementation  
  - **Impact**: Prevents performance regression over time
  - **Implementation**: Automated database maintenance scheduling
- **ADR-0025**: Memory Mapping for Large Data Performance
  - **Impact**: 20-40% improvement for large sequential reads
  - **Implementation**: `PRAGMA mmap_size = 268435456` (256MB)

**Foundational ADRs**:
- **ADR-0003**: Four-Table Hard Cap (constrains optimization scope)
- **ADR-0005**: WAL Mode with NORMAL Synchronous (compatibility baseline)

**Performance Enhancement**:
- **Before**: 2s recovery scans, 2MB cache, no memory mapping
- **After**: 0.2-0.4s recovery scans, 64MB cache, 256MB memory mapping
- **Compound Improvement**: 40-60% baseline + 5-10x for specific operations

---

### VOICE_POLLING_ICLOUD (Phase 1, Slice 1.2) 📈
**Category**: capture | **Risk**: High | **TDD**: Required

**Core Specifications**:
- **Architecture**: `docs/features/capture/spec-capture-arch.md` §6.2 Voice Reference
- **Technical**: `docs/features/capture/spec-capture-tech.md` §7 Voice Memo Referencing  
- **Test**: `docs/features/capture/spec-capture-test.md` §4.1 APFS Dataless Handling

**SQLite Optimization Benefits**:
- **Cache Optimization (ADR-0022)**: Faster voice memo metadata queries
- **Index Optimization (ADR-0023)**: Optimized capture staging operations
- **Memory Mapping (ADR-0025)**: Faster access to large voice file metadata

**Related ADRs**:
- **ADR-0001**: Voice File Sovereignty (external reference strategy)
- **ADR-0006**: Late Hash Binding for Voice (content hash after transcription)

---

### CRASH_RECOVERY_MECHANISM (Phase 2, Slice 2.1) 🔧
**Category**: process | **Risk**: High | **TDD**: Required

**Core Specifications**:
- **Architecture**: `docs/features/capture/spec-capture-arch.md` §6.4 Recovery
- **Technical**: `docs/features/capture/spec-capture-tech.md` §9 Failure & Recovery Model
- **Test**: `docs/features/capture/spec-capture-test.md` §8.3 Error Recovery

**SQLite Optimization Impact**:
- **Index Optimization (ADR-0023)**: 5-10x faster recovery scans via `idx_captures_recovery`
- **Cache Optimization (ADR-0022)**: Reduced recovery query latency  
- **Memory Mapping (ADR-0025)**: Accelerated large recovery operations

**Performance Transformation**:
- **Previous**: ~2s for 1000 item recovery scan
- **Optimized**: ~0.2-0.4s for 1000 item recovery scan (10x improvement)

---

## Optimization Synergy Matrix

| Capability | Cache (0022) | Indexes (0023) | Optimize (0024) | Mmap (0025) | Combined Benefit |
|------------|--------------|----------------|-----------------|-------------|------------------|
| **SQLITE_SCHEMA** | ✅ Core enhancement | ✅ Schema addition | ✅ Maintenance | ✅ Config addition | 32x cache + indexes |
| **VOICE_POLLING** | ✅ Metadata queries | ✅ Staging optimization | ✅ Stats maintenance | ✅ Large data access | Faster staging pipeline |
| **CRASH_RECOVERY** | ✅ Query acceleration | ✅ 10x recovery speed | ✅ Index maintenance | ✅ Bulk operations | 10x overall improvement |
| **DEDUPLICATION** | ✅ Hash lookup speed | ✅ Content hash index | ✅ Query plan optimization | ✅ Large hash operations | 2-3x faster dedup |
| **BACKUP_VERIFICATION** | ✅ Integrity checks | ✅ Audit queries | ✅ Automated optimization | ✅ Large file access | Faster verification |

---

## Implementation Sequence Recommendations

### Phase 1: Foundation Optimization (Immediate)
1. **ADR-0022**: Cache size increase (immediate 40-60% read improvement)
2. **ADR-0023**: Composite indexes (query-specific optimization) 
3. **ADR-0025**: Memory mapping (large data performance)
4. **ADR-0024**: PRAGMA optimize (automated maintenance)

### Phase 2: Validation & Monitoring
1. **Performance regression tests**: Validate optimization effectiveness
2. **Health command enhancement**: Include optimization status reporting
3. **Metrics integration**: Track optimization performance benefits
4. **Documentation updates**: Record actual performance improvements

---

## Related Architectural Decisions

### Core SQLite Foundation
- **ADR-0003**: Four-Table Hard Cap → Constrains optimization scope
- **ADR-0005**: WAL Mode Normal Sync → Optimization compatibility baseline
- **ADR-0007**: 90-Day Retention → Affects index efficiency over time

### Performance & Reliability
- **ADR-0021**: Local NDJSON Metrics → Performance monitoring alignment
- **ADR-0008**: Sequential Processing → Compatible with optimization strategy

### Content & Export
- **ADR-0002**: Dual Hash Migration → Superseded (SHA-256 only, simplifies caching)
- **ADR-0009**: Atomic Write Pattern → Benefits from faster database operations

---

## Future Optimization Triggers

**Reconsider optimizations if**:
- Memory usage exceeds 80% of available system RAM
- Write performance degrades beyond 25% of baseline
- Data volume grows beyond 10k captures (scaling assessment)
- Alternative storage engines considered (LMDB, RocksDB)

**Enhance optimizations if**:
- Daily capture volume exceeds 200 (consider BLAKE3 dual-hash from ADR-0002)
- Recovery operations regularly exceed optimized targets
- Large data patterns change significantly (adjust mmap size)

---

## Testing Integration

### Optimization Test Coverage
- **Performance regression tests**: Before/after optimization benchmarks
- **Cache efficiency tests**: Validate 64MB cache utilization patterns
- **Index usage tests**: Confirm query planner selects composite indexes
- **Memory mapping tests**: Verify mmap performance benefits for large operations
- **PRAGMA optimize tests**: Validate automated optimization scheduling

### Existing Test Alignment
- **Unit tests**: Hash and deduplication logic (faster with optimizations)
- **Integration tests**: End-to-end capture flow (overall performance improvement)
- **Contract tests**: SQLite schema stability (enhanced with optimizations)
- **Fault tests**: Crash recovery (significantly faster with index optimization)

---

## Health & Monitoring Integration

### Health Command Enhancement
```bash
capture health --verbose
# Database Optimization Status:
# - Cache Size: 64MB (configured), 45MB (active)
# - Composite Indexes: 4 created, all active
# - Memory Mapping: 256MB (configured), 67MB (active)
# - Last PRAGMA optimize: 2025-09-29T10:30:00Z (2 hours ago)
# - Query Performance: 95% optimal
```

### Optimization Metrics
- `sqlite_cache_hit_ratio` (gauge) - Cache effectiveness measurement
- `sqlite_index_usage_ratio` (gauge) - Composite index utilization
- `sqlite_mmap_active_bytes` (gauge) - Memory mapping utilization
- `sqlite_optimize_duration_ms` (histogram) - Maintenance operation timing

---

*Generated by Roadmap Orchestrator v1.0*  
*Analysis: Complete documentation corpus with SQLite optimization integration*  
*Status: Ready for implementation with enhanced performance characteristics*