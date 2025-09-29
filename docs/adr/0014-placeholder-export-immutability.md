---
adr: 0014
title: Placeholder Export Immutability (MPPP)
status: accepted
context-date: 2025-09-27
owner: Nathan
---

## Status

Accepted - 2025-09-27

## Context

When voice memo transcription fails (corrupt audio, Whisper timeout, OOM errors), the system must decide whether to:

1. **Export placeholder**: Create a markdown file with error information and audio file reference
2. **Skip export**: Leave capture in staging ledger until transcription succeeds
3. **Export with retry mechanism**: Create placeholder but update it when transcription eventually succeeds

The question arises: should placeholder exports be **immutable** (never updated) or **mutable** (retrofilled when transcription succeeds)?

### MPPP Complexity Constraints

- Minimize state machine complexity in Phase 1-2
- Avoid complicated retry/update mechanisms
- Ensure deterministic export behavior
- Maintain clear audit trails

### Placeholder Export Scenarios

- **Voice file corruption**: Permanent failure, no retry possible
- **Transcription timeout**: Transient failure, retry may succeed
- **OOM errors**: System resource limitation, retry possible with smaller model
- **iCloud download failure**: Transient failure, file may become available later

## Decision

**Placeholder exports are immutable in MPPP (Phase 1-2). Once exported as placeholder, the markdown file is never updated with successful retry transcriptions.**

### Implementation Details

1. **One-Time Export**: When transcription fails and capture moves to DLQ, export placeholder immediately
2. **Immutable Content**: Placeholder markdown file content never changes after export
3. **No Retrofill Mechanism**: Successful retries do not update existing placeholder files
4. **Clear Status Tracking**: `exported_placeholder` status indicates immutable placeholder export
5. **Manual Intervention**: User must manually delete placeholder if they want retry export

### Placeholder File Format

```markdown
---
id: 01HZVM8YWRQT5J3M3K7YPTX9RZ
source: voice
captured_at: 2025-09-27T10:30:45.123Z
status: placeholder_export
error_type: transcription_failed
---

# Placeholder Export (Transcription Failed)

**Audio File:** `/path/to/voice/memo.m4a`
**Error:** validation.corrupt_input
**Exported:** 2025-09-27T10:35:12.456Z

This capture could not be automatically transcribed. The original voice memo is available at the path above.

To retry transcription:

1. Verify audio file accessibility
2. Delete this placeholder file
3. Run: `adhd capture retry 01HZVM8YWRQT5J3M3K7YPTX9RZ`
```

### State Machine Implications

```
Voice Capture → Transcription Failed → DLQ → Placeholder Export (TERMINAL)
                                    ↑
                              No updates allowed
```

## Alternatives Considered

1. **Mutable Placeholders with Retrofill**: Rejected - Adds significant complexity for tracking and updating existing files
2. **No Placeholder Export**: Rejected - User loses visibility into failed captures
3. **Conditional Immutability**: Rejected - Inconsistent behavior based on error type would confuse users

## Consequences

### Positive

- **Deterministic Behavior**: Each capture exports exactly once, no update logic needed
- **Simple State Machine**: Terminal states remain terminal, no backwards transitions
- **Clear Audit Trail**: `exports_audit` records show single export event per capture
- **Predictable File System**: No unexpected file modifications after export
- **Easier Testing**: No complex update scenarios to test

### Negative

- **Manual Recovery Required**: User must delete placeholder and manually retry for transient failures
- **Potential Duplicate Files**: If user retries, may end up with both placeholder and successful export
- **Lost Transcription Opportunity**: Transient failures that later resolve don't automatically benefit user
- **User Education Required**: Users must understand placeholder system and manual recovery process

### Technical Implementation

**Exports Audit Schema:**

```sql
-- exported_placeholder status is terminal - no updates allowed
UPDATE captures SET status = 'exported_placeholder' WHERE id = ?;
INSERT INTO exports_audit (capture_id, mode, hash_at_export)
VALUES (?, 'placeholder', NULL);  -- NULL hash for placeholder
```

**DLQ Processing:**

```typescript
async function handleTranscriptionFailure(
  capture: CaptureRecord,
  error: TranscriptionError
): Promise<void> {
  // Move to DLQ
  await moveToDLQ(capture.id, error)

  // Export placeholder (immutable)
  await exportPlaceholder(capture)

  // Mark as terminal state
  await updateCaptureStatus(capture.id, "exported_placeholder")

  // No retry mechanism - user must intervene manually
}
```

### Trigger to Reconsider

Immutability should be reconsidered if:

- **Placeholder export ratio exceeds 5%** rolling 7-day average (indicates systematic issues)
- **User feedback indicates significant friction** with manual recovery process
- **Phase 2 introduces automated retry systems** that would benefit from mutable placeholders

### Recovery Process

**For Transient Failures (User-Initiated):**

1. User identifies placeholder file in vault
2. User deletes placeholder file manually
3. User runs `adhd capture retry <capture_id>`
4. System re-attempts transcription and export
5. If successful, new file created (different from deleted placeholder)

**For Permanent Failures:**

- Placeholder serves as permanent record
- User can manually transcribe audio and update file content
- Original audio path preserved for manual access

## Monitoring and Metrics

**Key Metrics to Track:**

- `placeholder_export_ratio`: Percentage of voice captures exported as placeholder
- `manual_retry_requests`: Count of user-initiated retries after placeholder export
- `placeholder_resolution_time`: Time from placeholder to successful retry (if any)

**Alert Thresholds:**

- Daily placeholder ratio > 5%: Investigate transcription pipeline health
- Weekly manual retries > 10: Consider mutable placeholder implementation

## References

- [ADR-0013 MPPP Direct Export Pattern](./0013-mppp-direct-export-pattern.md) - Synchronous export context
- [Capture Tech Spec](../features/capture/spec-capture-tech.md) - Section 5.2: State Machine
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Section 8.3: Error Recovery Flow Contract Tests
- [Master PRD](../master/prd-master.md) - MPPP simplicity constraints
