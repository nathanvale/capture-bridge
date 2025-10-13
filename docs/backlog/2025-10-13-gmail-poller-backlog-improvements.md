# Backlog: Gmail Poller Improvements (EMAIL_POLLING_GMAIL--T01)

Context

- Scope: Gmail History-based poller implementation for EMAIL_POLLING_GMAIL--T01.
- Status: AC01–AC05 implemented and verified by tests; overall coverage ≈82%.
- Alignment: Sequential execution per ADR-0008; four-table cap per ADR-0003; resilience patterns (backoff + jitter + circuit breaker) per tech spec.
- Recent fix: Unified sync_state.updated_at to ISO 8601 UTC with Z to match metrics/timestamps.

Problem/Opportunity

- The poller is feature-complete for AC01–AC05 and safe to merge. Observability and duplicate-handling are not yet integrated and should land soon after to de-risk operations.

---

## P1: Metrics Instrumentation (High Priority)

Add operational metrics for the Gmail poller using the existing foundation metrics client. Metrics are opt-in with CAPTURE_METRICS=1 and must not make network calls (local NDJSON only).

Acceptance criteria

- [ ] Histogram gmail_poll_once_duration_ms emitted once per pollOnce with duration and tags: { source: 'gmail' }.
- [ ] Counter gmail_history_pages_processed increments by pagesProcessed per poll.
- [ ] Counter gmail_messages_added_total increments by number of messageIds processed per poll.
- [ ] Histogram gmail_backoff_wait_ms records actual sleep time for each retry/backoff event.
- [ ] Counter gmail_429_total increments on HTTP 429 occurrences.
- [ ] Gauge gmail_circuit_state reflects breaker state: 0=closed, 1=half_open, 2=open.
- [ ] Gauge gmail_cursor_age_seconds reports current cursor age when available.
- [ ] Metrics gated by CAPTURE_METRICS=1; include ISO 8601 UTC timestamps and schema version per foundation.
- [ ] Tests validate emission via metrics client (when enabled), without relying on real FS writes.
- [ ] Brief doc note in guides covering emitted metrics and how to enable/locate them.

Notes

- Place metrics at stable hook points: start/end of pollOnce, on each pagination step, on backoff events, on breaker transitions.

---

## P2: Deduplication Integration (Medium Priority)

Introduce a deduplication seam before staging to avoid double-processing messageIds.

Acceptance criteria

- [ ] Call DeduplicationService (or equivalent repository) before staging each messageId.
- [ ] Skip staging for known duplicates; track duplicatesSkipped in the poll result.
- [ ] Emit counter gmail_duplicates_skipped_total for skipped items.
- [ ] Preserve transactional guarantee: when any staging fails, cursor must not advance (existing transaction pattern remains intact).
- [ ] Tests cover: no-dup happy path, one-dup skipped, and transactional rollback with duplicates present.

Notes

- Keep processing sequential and simple; no concurrency is introduced. Aligns with ADR-0008.

---

## P3: Enhancements & Documentation (Nice-to-have)

Small improvements to polish resilience and observability.

Acceptance criteria

- [ ] Consider decorrelated jitter for backoff to reduce thundering herd (optional; keep current positive jitter if simpler).
- [ ] Expand metrics tags with outcome: { status: 'success'|'rate_limited'|'error' }.
- [ ] Add a short README/guides section on cursor semantics and re-bootstrap behavior after 404.
- [ ] Add developer note linking the timestamp format decision (ISO 8601 with trailing Z) to metrics/logs consistency.

---

## References

- Implementation
  - packages/capture/src/gmail/email-poller.ts
  - packages/capture/src/gmail/sync-state-repository.ts
  - packages/capture/src/gmail/resilience.ts
  - packages/capture/src/gmail/__tests__/email-poller.test.ts
- Docs & Guides
  - docs/features/capture/spec-capture-tech.md
  - docs/guides/guide-polling-implementation.md
  - docs/guides/guide-gmail-oauth2-setup.md
- ADRs
  - docs/adr/0008-sequential-processing-mppp.md
  - docs/adr/0003-four-table-hard-cap.md
  - docs/adr/0009-atomic-write-temp-rename-pattern.md
  - docs/adr/0017-json-output-contract-stability.md

---

## Why this now

- Improves operational readiness for the upcoming PR by adding visibility and preventing duplicate work.
- Keeps within existing constraints (sequential processing, four-table cap, no external metrics system).
- Low-risk, additive changes that don’t alter AC01–AC05 behavior.
