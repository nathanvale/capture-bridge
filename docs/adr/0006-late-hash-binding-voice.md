---
adr: 0006
title: Late Hash Binding for Voice Captures
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0006: Late Hash Binding for Voice Captures

## Status

Accepted

## Context

Voice captures require transcription before content hash computation, but durability demands immediate staging. This creates a timing conflict: we need to achieve < 100ms staging time but transcription takes seconds.

Two approaches were considered:

1. Block staging until transcription completes (guarantees hash availability)
2. Stage immediately with NULL hash, bind hash after transcription (late binding)

ADHD burst capture patterns require rapid staging without blocking on async operations.

## Decision

Implement **late hash binding** for voice captures:

1. **Immediate staging**: Insert capture with `status='staged'` and `content_hash=NULL`
2. **Audio fingerprint**: Store SHA-256 of first 4MB in `meta_json.audio_fp` for early deduplication
3. **Hash binding**: Update `content_hash` after successful transcription
4. **Immutability**: Hash may change at most once (NULL → SHA-256)

**Staging Flow:**

```typescript
// Phase 1: Immediate durability (< 100ms)
await insertCapture({
  id: ulid(),
  source: "voice",
  raw_content: "",
  content_hash: null, // Late binding
  meta_json: { audio_fp: sha256(firstMB) },
})

// Phase 2: Async transcription
const transcript = await whisper(audioFile)
await updateTranscription(captureId, {
  transcript_text: transcript,
  content_hash: sha256(transcript),
})
```

## Alternatives Considered

- **Blocking staging**: Wait for transcription before staging - Rejected due to burst capture UX requirements
- **Placeholder hash**: Use audio fingerprint as content hash - Rejected due to deduplication accuracy
- **Dual-phase deduplication**: Different logic for voice vs email - Rejected due to complexity

## Consequences

### Positive

- Achieves < 100ms staging target for voice captures
- Enables burst capture without transcription bottleneck
- Maintains durability guarantee (crash-safe after staging)
- Audio fingerprint provides early duplicate detection

### Negative

- Content hash deduplication delayed until transcription
- More complex state management (nullable hash)
- Different flow for voice vs email captures

### Risk Mitigation

- Audio fingerprint prevents duplicate staging of same file
- Hash immutability prevents corruption after binding
- State machine enforces valid transitions

## References

- [Staging Ledger PRD v1.0.0-MPPP](../features/staging-ledger/prd-staging.md) §5.3
- [Staging Ledger Arch Spec v1.0.0-MPPP](../features/staging-ledger/spec-staging-arch.md) §4.1
- [ADR-0004: Status-Driven State Machine](0004-status-driven-state-machine.md)
