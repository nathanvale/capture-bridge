---
title: Capture Ingestion Core Technical Specification
status: draft
owner: Nathan
version: 0.2.0-MPPP
date: 2025-09-28
spec_type: tech
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Capture Ingestion Core Spec v0.2-MPPP

Source of Truth Alignment: Anchored to `docs/master/prd-master.md` (Master PRD v2.3.0-MPPP), ADR-0001 Voice File Sovereignty, and `docs/cross-cutting/spec-direct-export-tech.md` (Direct Export Pattern).

**MPPP Scope:** This spec covers capture ingestion through staging ledger. For export behavior (staging → Obsidian vault), see [Direct Export Pattern Tech Spec](../../cross-cutting/spec-direct-export-tech.md).

## 1. Executive Summary

This spec hardens the earliest segment of the capture pipeline: turning raw user input (voice memo reference, email) into a **durable, idempotent, queryable staging record** ready for export. It defines the canonical capture envelope, the ingestion state machine, SHA-256 hashing & dedup semantics, recovery guarantees, and minimal metrics. **Export to vault is handled by the Direct Export Pattern** (separate spec). It deliberately excludes higher-level classification, PARA intelligence, or plugin behaviors (YAGNI).

Goal: No user action should take >3s to become “safely staged” with zero chance of loss, and ingestion must be replay-safe after crashes.

## 2. Scope

In Scope:

- Canonical capture envelope (fields, invariants, evolution rules)
- SHA-256 hashing strategy + duplicate detection semantics
- Ingestion state machine (pre-export) and transitions (DISCOVERED → READY)
- Voice Memo referencing: path + fingerprints (no relocation) per ADR-0001
- File sovereignty & integrity checks (existence, size, SHA-256 fingerprint)
- Crash/restart recovery + idempotent replay of partially processed captures
- Local-only metrics (dev flag) & minimal logging taxonomy
- Performance and concurrency boundaries (sequential processing)
- TDD applicability matrix (P0 integrity focus)

Out of Scope (deferred / other specs):

- **Export to vault** (see Direct Export Pattern Tech Spec)
- PARA classification logic
- UI/Inbox triage surface
- Whisper transcription internals (separate guide)
- CLI command surface details (separate CLI core spec)
- Embeddings / semantic search / RAG (deferred Phase 5+)
- Plugin architecture / event hooks (deferred)

## 3. Problem Statement

The Master PRD establishes durability, idempotency, and a minimal staging ledger as foundational. What is still underspecified is the **precise shape and lifecycle** of an individual capture prior to export, how we represent external voice memo files safely (ADR-0001), and how we ensure SHA-256 hashing provides deterministic deduplication without compromising existing data or integrity guarantees.

## 4. Goals & Non-Goals

Goals:

1. Deterministic canonical envelope enabling future channel unification.
2. Idempotent ingestion across crashes, restarts, and partial writes.
3. Strong, fast hashing enabling early dedup without waiting for enrichment.
4. Explicit trigger conditions for future hash algorithm changes (deferred to Phase 2+).
5. Recovery model requiring **no manual intervention** under normal failures.
6. Voice memo references remain immutable (path + fingerprint only).

Non-Goals (YAGNI):

- Streaming transcript partial commits.
- Multi-node coordination (single-host assumption for v1).
- Fine-grained per-field schema migrations (use additive JSON metadata for evolution).

## 5. Architecture Overview (Delta)

MPPP SQLite tables: `captures`, `exports_audit`, `errors_log`, `sync_state` (4-table limit per Master PRD). This spec:

- Refines meaning of `captures.status` for pre-classification ingestion.
- Adds a channel-neutral `ingest_state` (virtual / derivable) clarifying transitions before a capture is eligible for export.
- Introduces a canonical envelope serialization for hashing.
- Defines recovery scanning order at startup.
- **Export behavior:** Direct synchronous export to `vault_root/inbox/ulid.md` per [Direct Export Pattern](../../cross-cutting/spec-direct-export-tech.md).

### 5.1 Canonical Capture Envelope

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | ULID string | yes | Time-sortable primary key |
| source_type | enum | yes | `voice`, `text`, `web`, `email` |
| raw_content | string | conditional | Text body (empty for pre‑transcript voice) |
| external_ref | string | conditional | Absolute file path (voice) or URL (web) |
| external_fingerprint | string | conditional | `sha256(first_N_bytes)` for voice (config default 4MB) |
| content_hash | string | yes | SHA-256 hash of canonical serialization (see below) |
| size_bytes | integer | conditional | For external asset (voice) at discovery time |
| metadata | JSON | optional | Channel-specific additive fields |
| ingest_state | virtual | yes | Derived; see state machine |
| created_at | datetime | yes | Insert timestamp |
| capture_time | datetime | optional | User-intended timestamp (if provided) |

Canonical serialization (ordered keys, UTF-8, newline-delimited):

```text
id:<id>
source_type:<source_type>
raw_content_sha256:<sha256(raw_content || '')>
external_ref:<external_ref || ''>
external_fingerprint:<external_fingerprint || ''>
size_bytes:<size_bytes || 0>
metadata_canonical_sha256:<sha256(stableJson(metadata || {}))>
version:1
```

`content_hash = sha256(serialization)`

Rationale: Small, stable, cheap to recompute; SHA-256 provides deterministic hashing with negligible collision probability for MPPP scope (< 1000 captures/year).

### 5.2 State Machine (Pre-Export, MPPP)

States (linear, minimal branching - **export happens outside this spec**):

1. DISCOVERED – Inserted into `captures` with provisional fields, hash computed.
2. VERIFIED – External reference (if any) exists & fingerprint acquired.
3. STAGED – Durable; safe to proceed to enrichment (voice) or direct export (email).
4. ENRICHING – (Voice only) Transcription pending.
5. READY – Content hash available; eligible for direct export.

Simplification vs earlier outline: `HASHED` folded into DISCOVERED (hash computed synchronously on insert). Transcription does not block STAGED—only ENRICHING if required. **Export to vault is handled by Direct Export Pattern** (see `spec-direct-export-tech.md`).

Transition Rules:

| From | To | Trigger | Failure Handling |
|------|----|---------|------------------|
| DISCOVERED | VERIFIED | External file stat / path resolution success | Retry (exp backoff) if file temporarily dataless |
| VERIFIED | STAGED | Fingerprint persisted (and size_bytes recorded) | Mark quarantine if fingerprint mismatch on recheck |
| STAGED | ENRICHING | Voice capture requires transcription | Timeout → revert to STAGED & schedule retry |
| ENRICHING | READY | Transcript captured (content_hash computed) | On error fallback to STAGED with error flag |
| STAGED | READY | Non-voice / no enrichment required (content_hash ready) | N/A |
| READY | (export) | Direct export invoked (external to this spec) | See Direct Export Pattern for error handling |

**Placeholder Export Immutability (MPPP):** When transcription fails and placeholder export occurs (`exported_placeholder` status), the placeholder markdown file is **immutable** in Phase 1. No retrofill mechanism exists to update placeholder exports with successful retries. This simplification ensures Phase 1 export idempotency remains deterministic.

**Trigger to Revisit:** If placeholder export ratio exceeds 5% rolling 7-day average (per Master PRD), implement retrofill append mechanism in Phase 2.

State Persistence Strategy: We do not add a new column; instead `captures.status` continues (`staged | transcribed | exported | exported_duplicate | exported_placeholder | error`). The finer-grain ingest_state is derived from metadata flags:

- `metadata.verification.ok` boolean
- `metadata.fingerprint.sha` (SHA-256)
- `metadata.enrichment.transcript.status`

Advantages: Avoids schema churn; easy additive evolution. **Note:** `exported*` states are set by Direct Export Pattern (external to this spec).

## 6. Hashing Strategy (SHA-256, MPPP)

**MPPP Decision:** SHA-256 for all content hashing and deduplication (per Master PRD v2.3.0-MPPP and ADR-0002).

**Hash Usage:**

1. **Content Hash:** SHA-256 of canonical envelope serialization (see §5.1)
2. **Voice Fingerprint:** SHA-256 of first 4MB of audio file (early dedup before transcription)
3. **Email Body:** SHA-256 of normalized text content (after HTML stripping)

**Collision & Integrity:** SHA-256 provides negligible collision probability for MPPP scope (< 1000 captures/year). Duplicate detection relies solely on `content_hash` uniqueness constraint in SQLite.

**Future Consideration (Phase 2+):** BLAKE3 migration deferred per ADR-0002 (faster parallel hashing for burst capture patterns). Trigger: Daily capture volume > 200 OR p95 hashing latency > 25ms.

## 7. Voice Memo Referencing (ADR-0001)

Policy Recap:

- Never move/rename Apple Voice Memo files.
- We reference canonical path within group container.
- We fingerprint only the first configurable N bytes (default 4MB) for speed + early dedup heuristics; full file integrity can be optionally validated async.
- iCloud dataless files trigger a download via Swift helper; ingestion remains in DISCOVERED until VERIFIED.

Integrity Measures:

- Re-verify size + partial fingerprint during recovery scan; mismatch → quarantine flag `metadata.integrity.quarantine=true`.

## 8. Concurrency & Ordering

Assumptions:

- Single process performs envelope insert (simplifies race handling).
- Voice memo verification & fingerprinting can run concurrently up to a small pool (config: 2) while downloads remain sequential (semaphore=1) to respect APFS/iCloud heuristics.
- Classification is decoupled; READY is a stable hand-off state.

Burst Handling:

- Backpressure if unresolved DISCOVERED > threshold (config default: 500) → temporarily reject new non-essential channel (e.g., web clip) with retry suggestion.

## 9. Failure & Recovery Model

On Startup:

1. Scan for rows where `status NOT IN ('exported', 'exported_duplicate', 'exported_placeholder')`.
2. Derive ingest_state; re-process any not READY or STAGED for necessary step.
3. Recompute `content_hash` if missing (ensure SHA-256 computed).
4. Validate voice external references; quarantine missing files.

Idempotent Replays:

- All transitions re-check preconditions; if already satisfied, they short‑circuit.
- **Export invocation:** Direct Export Pattern (external to this spec) handles export idempotency via content hash deduplication and ULID collision detection. See [Direct Export Pattern](../../cross-cutting/spec-direct-export-tech.md) §4 (TDD Applicability) and §6 (Risks & Mitigations).

Quarantine States:

- `metadata.integrity.quarantine_reason` enumerated: `missing_file | fingerprint_mismatch | unreadable`.
- Quarantined captures never auto-deleted; require manual resolution tool (future).

## 10. Metrics & Instrumentation (Local Only)

Enabled with `CAPTURE_METRICS=1` (as PRD).

**Phase 1 Metrics (Master PRD Minimal Set):**

- `capture_voice_staging_ms` - Time to stage voice memo
- `capture_email_staging_ms` - Time to stage email
- `transcription_duration_ms` - Whisper processing time
- `export_write_ms` - Vault file write duration
- `dedup_hits_total` - Duplicate detection count
- `export_failures_total` - Failed vault writes
- `poll_voice_duration_ms` - Voice polling cycle time
- `poll_email_duration_ms` - Email polling cycle time
- `capture_time_to_export_ms` - End-to-end latency per capture
- `transcription_queue_depth` - Queue depth snapshot each poll
- `placeholder_export_ratio` - Aggregated daily ratio
- `backup_verification_result` - success/failure event metric

**Phase 2+ Extended Metrics (Deferred):**

- `ingest_discovered_total` (granular staging counters)
- `ingest_verification_failures_total` (detailed failure tracking)
- `ingest_fingerprint_ms` (histogram for fingerprint performance)
- `ingest_recovery_replays_total` (recovery event tracking)
- `hash_computation_ms` (histogram, SHA-256 performance profiling)

**Export Format:** Newline-delimited JSON objects in `./.metrics/YYYY-MM-DD.ndjson` (per Master PRD).

## 11. Performance Targets (Refine PRD)

| Operation | Target | Notes |
|-----------|--------|-------|
| Insert + hash (text) | < 25ms p95 | SHA-256 sufficient for MPPP |
| Insert + first 4MB fingerprint (voice) | < 150ms p95 | Sequential disk read constraint |
| Recovery scan (1000 items) | < 2s | Hash recompute cached; sequential processing |
| Verification (stat) | < 5ms avg | Warm path |

## 12. Security & Privacy

- Local-only filesystem operations; no network egress.
- Avoid storing full voice binary in SQLite (path + fingerprint only).
- Do not log raw content unless `CAPTURE_DEBUG=1` (sanitized length + hash only).

## 13. TDD Applicability Decision

### Risk Assessment
**Level**: HIGH
**Justification**: Core ingestion logic with multiple critical failure modes:
- Data loss during crashes or power failures (partial writes to staging ledger)
- Hash collision errors causing duplicate acceptance/rejection
- State machine inconsistency breaking recovery replay guarantees
- Content corruption during canonical serialization process
- Voice file sovereignty violations (path/fingerprint mismatch after system changes)
- Deduplication failures creating duplicate vault exports

### Decision
TDD Required

### Test Strategy

**Unit Test Scope**:
- Canonical envelope serialization produces deterministic SHA-256 hashes
- State machine transitions follow exact rules (DISCOVERED → VERIFIED → STAGED → ENRICHING → READY)
- Hash deduplication logic (content_hash uniqueness constraint)
- Content hash collision handling (rejection with clear error)
- Metadata JSON stability across serialization/deserialization
- Voice fingerprint computation (first 4MB SHA-256)

**Integration Test Scope**:
- Complete ingestion flow from raw input to READY state with SQLite persistence
- Recovery replay after simulated crashes (does not duplicate transitions)
- Voice file verification with real file stat operations and fingerprinting
- Backpressure enforcement when unresolved DISCOVERED captures exceed threshold
- Quarantine workflow for missing or corrupted voice files
- Sequential voice processing constraint (no concurrent downloads)
- **Export integration:** Direct Export Pattern invocation (contract test, not full E2E)

**Contract Test Scope**:
- SQLite schema compatibility across captures table operations
- Voice memo file system contract (path resolution, size/fingerprint validation)
- SHA-256 hash output format (64-character hex string)
- Canonical serialization format versioning and backward compatibility
- **Direct Export Pattern contract:** CaptureRecord → ExportResult interface

### YAGNI Deferrals
**Not testing in Phase 1-2 (MPPP):**
- Performance benchmarking under heavy load (>1000 concurrent captures)
- Cross-device synchronization scenarios
- Plugin hook integration points
- Streaming transcript partial commits
- Multi-node coordination edge cases
- Full-file integrity validation (vs partial fingerprint)
- Hash algorithm migration (BLAKE3 deferred to Phase 2+)
- Outbox queue pattern (replaced by Direct Export)
- PARA classification at capture time (deferred to Phase 5+)

**Trigger to Revisit:**
- Hash collision detected in production (extremely unlikely but would require immediate response)
- Recovery replay fails to restore system to consistent state (incident response)
- Voice file sovereignty violations detected (fingerprint mismatches >1% of checks)
- Ingestion latency exceeds 3 second target for >5% of captures
- Backpressure threshold hit regularly (daily basis indicating scaling need)

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hash migration inconsistency | Duplicate acceptance divergence | Dual-hash phased rollout + comprehensive test fixtures |
| Partial fingerprint insufficient | Miss rare boundary collisions | Optional full-file integrity audit batch job (future) |
| Recovery scan latency | Delays READY availability | Parallelize; cache sub-hashes |
| Metadata drift | Ingest state derivation errors | Central serializer + validation schema (Zod) |

## 15. Open Questions

1. Should we persist `ingest_state` denormalized for faster queries? (Current: derive from metadata.)
2. Configurable fingerprint byte length per device performance profile? (Adaptive 4MB default?)
3. Should voice transcription failures block export with placeholder content or retry indefinitely?
4. What's the optimal backpressure threshold (current: 500 unresolved DISCOVERED)?
5. Should quarantine captures be auto-expired after N days or require manual resolution?

## 16. Activation & Rollout (MPPP)

**MPPP Approach:** Direct activation with no feature flags (SHA-256 only, no migration complexity).

**Success Criteria (Phase 1 complete):**

- Voice + email captures working end-to-end
- >50 real captures with zero hash collisions
- p95 insert latency under target for burst (≥10 rapid ingests) scenario
- Direct export working (see Direct Export Pattern spec)

**Phase 2 Success Criteria:**

- 7 days operation with zero data loss
- Recovery tested with fault injection
- Health command (`capture doctor`) operational

**Rollback Plan:**

- SQLite ledger retains all captures; vault writes are idempotent (safe to retry)
- Manual recovery via `capture doctor` if needed

## 17. ADR References

- [ADR-0001 Voice File Sovereignty](../../adr/0001-voice-file-sovereignty.md) - Voice memo path immutability rule
- [ADR-0002 Dual-Hash Migration](../../adr/0002-dual-hash-migration.md) - Superseded; SHA-256 only for MPPP
- [ADR-0006 Late Hash Binding for Voice Captures](../../adr/0006-late-hash-binding-voice.md) - Content hash computed after transcription
- [ADR-0008 Sequential Processing for MPPP Scope](../../adr/0008-sequential-processing-mppp.md) - Single capture processing model
- [ADR-0013 MPPP Direct Export Pattern](../../adr/0013-mppp-direct-export-pattern.md) - Synchronous export decision
- [ADR-0014 Placeholder Export Immutability](../../adr/0014-placeholder-export-immutability.md) - Transcription failure handling

## 18. YAGNI Boundary Reinforcement

Not introducing new tables beyond MPPP 4-table limit (`captures`, `exports_audit`, `errors_log`, `sync_state`); rely on existing schema & metadata JSON. No plugin hook points, no streaming transcripts, no cross-device sync concerns, **no outbox queue** (Direct Export Pattern replaces async queue with synchronous atomic writes). This keeps ingestion lean and auditable.

**Deferred to Phase 5+:** Outbox queue pattern, background workers, async export processing, PARA classification at capture time.

## 19. Appendix: Sample Envelope JSON

```json
{
  "id": "01JABCDEF123XYZ7890ABCD12",
  "source_type": "voice",
  "raw_content": "", 
  "external_ref": "/Users/nathan/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/ABC123.m4a",
  "external_fingerprint": "c3b4...",
  "size_bytes": 482938,
  "metadata": {
    "verification": { "ok": true },
    "hashes": { "sha256": "a1b2c3..." },
    "enrichment": { "transcript": { "status": "pending" } }
  },
  "created_at": "2025-09-26T10:15:22.123Z"
}
```

## 20. Nerdy Joke

Ingestion state machines are like ADHD-friendly checklists—short, linear, and everything past READY is someone else's problem (specifically, the Direct Export Pattern's problem). Keep the state machine shallow and the hash fast.

---
Version: 0.2.0-MPPP
Last Updated: 2025-09-28
Author: adhd-brain-planner (Nathan)
Reviewers: (TBD)
Change Log:

- 0.2.0-MPPP (2025-09-28): Removed outbox queue references; aligned with Direct Export Pattern; clarified MPPP 4-table scope
- 0.1.0 (2025-09-26): Initial draft including SHA-256 hashing strategy
