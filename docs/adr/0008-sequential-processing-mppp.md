---
adr: 0008
title: Sequential Processing for MPPP Scope
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0008: Sequential Processing for MPPP Scope

## Status

Accepted

## Context
The staging ledger processing pipeline involves multiple async operations: transcription, duplicate checking, and export. Two processing models were considered:

1. **Concurrent processing**: Multiple captures processed in parallel
2. **Sequential processing**: One capture processed at a time

MPPP scope assumes < 200 captures/day for a single ADHD user, making throughput less critical than simplicity and reliability.

## Decision
Implement **sequential processing** for MPPP scope:

- Process captures one at a time in chronological order (`created_at ASC`)
- No parallel transcription or export operations
- Single writer pattern avoids lock contention
- Simplifies crash recovery (no partial batch rollback)

**Processing Loop:**
```typescript
async function processCaptures() {
  const pending = await queryPendingExports();

  for (const capture of pending) {
    try {
      await processCapture(capture);
    } catch (error) {
      await logError(capture.id, error);
      continue; // Next capture
    }
  }
}
```

## Alternatives Considered
- **Parallel transcription**: Multiple Whisper processes - Rejected due to complexity and resource usage
- **Batch processing**: Process multiple captures per transaction - Rejected due to recovery complexity
- **Priority queuing**: High-priority captures first - Rejected as YAGNI for MPPP

## Consequences

### Positive
- Simplifies crash recovery (single capture state)
- Avoids lock contention and race conditions
- Predictable resource usage (one transcription at a time)
- Easier debugging and error isolation
- FIFO processing maintains chronological order

### Negative
- Slower processing for high-volume bursts
- Head-of-line blocking if one capture fails
- Cannot utilize multi-core for transcription parallelism

### Performance Analysis
- Expected volume: ~50 captures/day (2 per hour average)
- Whisper transcription: ~5-15s per capture
- Email processing: ~100-500ms per capture
- Sequential processing adequate for expected load

## Trigger to Revisit
**Concurrent processing** if any of:
- Sustained backlog depth > 20 captures for > 30 minutes
- Transcription queue regularly exceeds 1 hour processing time
- User feedback indicates unacceptable processing delays

**Monitoring:**
- `transcription_queue_depth` gauge
- `processing_latency_ms` histogram
- Alert if queue depth > 10 sustained

## References
- [Staging Ledger PRD v1.0.0-MPPP](../features/staging-ledger/prd-staging.md) §3
- [Staging Ledger Arch Spec v1.0.0-MPPP](../features/staging-ledger/spec-staging-arch.md) §3.5
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - MPPP scope assumptions