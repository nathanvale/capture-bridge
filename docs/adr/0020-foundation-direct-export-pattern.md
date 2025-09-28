# ADR 0015: Foundation Direct Export Pattern (Synchronous Atomic Writes)

## Date
2025-09-28

## Status
Accepted

## Context

The ADHD Brain system needs to export captured content from the staging ledger to Obsidian vault files. Two patterns were considered for this export process:

1. **Outbox Queue Pattern**: Asynchronous background workers with retry logic
2. **Direct Export Pattern**: Synchronous atomic writes during capture processing

The decision was driven by MPPP (Minimum Personally Practical Product) scope constraints, sequential processing requirements (< 200 captures/day), and the need for simple error handling with fast feedback loops.

Key requirements:
- Export latency < 10 seconds (capture to vault file)
- Atomic write guarantees (no partial files in vault)
- Idempotent retries (same capture ID → same result)
- Zero-loss durability (fsync before visibility)
- ADHD-friendly sequential processing (no background complexity)

## Decision

We will implement the **Direct Export Pattern** with synchronous atomic writes.

**Core Pattern:**
- **Synchronous blocking calls** during capture processing (no queue/workers)
- **Atomic temp-then-rename** writes with fsync durability guarantees
- **ULID filenames** for deterministic, collision-resistant naming
- **Content hash deduplication** for idempotent retry safety
- **Flat inbox structure** in Obsidian vault (no hierarchical folders)

**Write Process:**
1. Write content to `.trash/{ULID}.tmp`
2. **fsync() to flush OS cache to disk**
3. **rename() to `inbox/{ULID}.md`** (atomic operation)
4. Record export in `exports_audit` table

**Error Handling:**
- **EACCES/ENETDOWN**: Recoverable, return error for retry (Phase 2)
- **ENOSPC/EROFS**: Non-recoverable, halt worker immediately
- **EEXIST**: Check content hash - duplicate skip or conflict halt

## Alternatives Considered

### Alternative 1: Outbox Queue Pattern
**Pros:** Concurrent processing, robust retry logic, backpressure handling
**Cons:** Background worker complexity, eventual consistency, harder debugging
**Rejected:** YAGNI for MPPP scope (< 200 captures/day sequential processing)

### Alternative 2: Batch Export
**Pros:** Higher throughput, fewer file operations
**Cons:** Higher latency, complex partial failure recovery
**Rejected:** Contradicts fast feedback requirement (< 10s latency)

### Alternative 3: Template-based Export
**Pros:** Flexible file naming, dynamic content transformation
**Cons:** Complex template engine, harder to guarantee atomicity
**Rejected:** Fixed markdown format sufficient for MPPP

## Consequences

### Positive
- **Simple mental model:** Capture → process → export in single thread
- **Fast feedback:** Export completes before capture processing continues
- **Guaranteed atomicity:** fsync + rename ensures no partial files
- **Idempotent retries:** Content hash deduplication prevents duplicates
- **Easy debugging:** Synchronous flow easier to trace and test
- **No background workers:** Reduces cognitive complexity for ADHD users

### Negative
- **Sequential processing only:** Cannot leverage concurrency for throughput
- **Blocking on I/O:** Export failures block capture processing
- **No retry logic:** Failures must be handled at higher level (Phase 2)
- **Higher memory usage:** No buffering/batching to optimize writes

### Mitigations
- Export performance target < 50ms p95 for 1KB files
- Comprehensive error classification (recoverable vs halt)
- Audit trail in SQLite for export tracking and debugging
- Doctor command monitors export health and orphaned temp files

## Trigger to Revisit

This pattern should be reconsidered if:
- Daily capture volume exceeds 200 (concurrency needed)
- Export backlog sustains > 20 items (async queue needed)
- p95 export latency exceeds 100ms (performance optimization needed)
- Export failure rate exceeds 5% (retry logic needed)

## Related Decisions
- [ADR 0001: Voice File Sovereignty](./0001-voice-file-sovereignty.md) - In-place processing complements direct export
- [ADR 0002: Dual Hash Migration](./0002-dual-hash-migration.md) - Content hashing enables deduplication
- [ADR 0003: Monorepo Tooling Stack](./0003-monorepo-tooling-stack.md) - Fast builds support quick iteration

## References
- [Direct Export Tech Spec](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-direct-export-tech.md)
- [Obsidian Bridge PRD](/Users/nathanvale/code/adhd-brain/docs/features/obsidian-bridge/prd-obsidian.md)
- [Obsidian Bridge Tech Spec](/Users/nathanvale/code/adhd-brain/docs/features/obsidian-bridge/spec-obsidian-tech.md)
- [Capture Architecture Spec](/Users/nathanvale/code/adhd-brain/docs/features/capture/spec-capture-arch.md)