---
adr: 0013
title: MPPP Direct Export Pattern (Synchronous vs Outbox Queue)
status: accepted
context-date: 2025-09-27
owner: Nathan
---

## Status

Accepted - 2025-09-27

## Context

The original capture architecture included an outbox queue pattern with background workers for exporting staged captures to the Obsidian vault. This pattern was designed for high-throughput scenarios with complex retry logic and concurrent processing.

However, for MPPP (Minimum Pragmatic Product Package) scope targeting <200 captures/day, the outbox queue introduces unnecessary complexity:

- Background worker coordination
- Queue management and retry logic
- Async error handling complexity
- Inter-process communication overhead
- Testing complexity for concurrent scenarios

MPPP requirements mandate:
- Sub-3-second staging for immediate confidence
- Sub-10-second export for responsive feedback
- Zero data loss guarantees
- Sequential processing sufficient for volume

## Decision

**Replace the outbox queue pattern with Direct Export Pattern for MPPP (Phase 1-2).**

### Direct Export Pattern Characteristics

1. **Synchronous Export**: Export invoked immediately after staging/transcription completes
2. **Blocking Calls**: Processing waits for export completion before continuing
3. **Atomic Writes**: temp → fsync → rename pattern ensures durability
4. **Sequential Processing**: Single-threaded export eliminates concurrency complexity
5. **Fail-Fast**: Export failures halt processing with clear error reporting

### Implementation

```typescript
// OLD: Outbox queue pattern (deferred)
async function processCapture(capture) {
  await stageCapture(capture);
  await enqueueForExport(capture.id);  // Background worker processes later
}

// NEW: Direct export pattern (MPPP)
async function processCapture(capture) {
  await stageCapture(capture);
  await directExporter.exportToVault(capture);  // Synchronous, blocks until complete
}
```

### Triggers to Reconsider

Direct Export Pattern should be reconsidered when:
- Daily capture volume exceeds 200
- Export backlog depth > 20 for >30 minutes
- p95 export latency > 100ms
- Concurrent processing requirements emerge

## Alternatives Considered

1. **Keep Outbox Queue**: Rejected - Premature optimization for MPPP scope
2. **Hybrid Approach**: Rejected - Complexity without clear benefit for Phase 1-2
3. **Database-Only Storage**: Rejected - Doesn't fulfill requirement for Obsidian integration

## Consequences

### Positive
- **Reduced Complexity**: No background workers, queues, or async coordination
- **Immediate Feedback**: User sees export results within seconds of capture
- **Simplified Testing**: Synchronous flows easier to test deterministically
- **Clear Error Handling**: Export failures are immediate and actionable
- **Easier Debugging**: Linear execution flow simplifies troubleshooting

### Negative
- **Latency Coupling**: Capture latency tied to vault write performance
- **Limited Throughput**: Sequential processing caps maximum capture rate
- **Blocking on Errors**: Export failures halt all processing
- **No Retry Logic**: Transient failures require manual intervention (Phase 1)

### Technical Impact
- Eliminates `outbox` table from staging ledger schema
- Replaces background export workers with synchronous API calls
- Simplifies failure modes to binary success/failure per capture
- Atomic write pattern (temp → fsync → rename) ensures durability

### Migration Path
- Phase 1-2: Direct Export Pattern (MPPP scope)
- Phase 3+: Evaluate outbox queue if throughput/concurrency requirements emerge
- **No Breaking Changes**: Staging ledger schema remains compatible

## References

- [Direct Export Pattern Tech Spec](../cross-cutting/spec-direct-export-tech.md)
- [Capture Architecture Spec](../features/capture/spec-capture-arch.md)
- [Capture Tech Spec](../features/capture/spec-capture-tech.md)
- [Master PRD v2.3.0-MPPP](../master/prd-master.md)