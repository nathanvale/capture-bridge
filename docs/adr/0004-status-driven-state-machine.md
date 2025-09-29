---
adr: 0004
title: Status-Driven State Machine for Capture Lifecycle
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0004: Status-Driven State Machine for Capture Lifecycle

## Status

Accepted

## Context

Captures flow through multiple processing stages: staging → transcription → export. Early implementations used boolean flags (`is_staged`, `is_exported`) but this approach led to invalid state combinations and debugging difficulties.

A clear state machine is needed to prevent invalid transitions, aid crash recovery, and provide explicit lifecycle visibility. The choice is between boolean flags vs. explicit status enum vs. separate state tracking.

## Decision

Use a single `status` column with explicit enumerated values that form an immutable state machine:

**Valid States:**

- `staged` - Initial capture, awaiting processing
- `transcribed` - Transcription complete, awaiting export
- `failed_transcription` - Transcription failed, needs placeholder
- `exported` - Successfully exported (terminal)
- `exported_duplicate` - Skipped as duplicate (terminal)
- `exported_placeholder` - Exported as placeholder (terminal)

**State Machine Rules:**

1. Terminal states start with `exported*` and are immutable
2. Only valid transitions are permitted (enforced by validation)
3. Hash may change at most once (`NULL` → SHA-256 on transcription)

**Transition Rules:**

```
staged → {transcribed, failed_transcription, exported_duplicate}
transcribed → {exported, exported_duplicate}
failed_transcription → {exported_placeholder}
exported* → (no transitions - immutable)
```

## Alternatives Considered

- **Boolean flags** (`is_staged`, `is_exported`, etc.) - Rejected due to invalid combinations
- **Separate state table** - Rejected as over-engineering for MPPP scope
- **Implicit state from other columns** - Rejected due to debugging complexity

## Consequences

### Positive

- Explicit state prevents invalid transitions
- Clear recovery logic (query by status for resumable work)
- Immutable terminal states prevent corruption
- Self-documenting capture lifecycle
- Simplified crash recovery queries

### Negative

- More complex than boolean flags
- Requires validation logic for transitions
- String comparisons instead of boolean checks

### Mitigation

- Comprehensive validation function for all transitions
- Unit tests covering all valid and invalid paths
- Clear documentation of state machine rules

## References

- [Staging Ledger PRD v1.0.0-MPPP](../features/staging-ledger/prd-staging.md) §5.1
- [Staging Ledger Arch Spec v1.0.0-MPPP](../features/staging-ledger/spec-staging-arch.md) §5.1
- [Schema Reference](../features/staging-ledger/schema-indexes.md) §5
