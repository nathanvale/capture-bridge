---
title: Capture Architecture Overview
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-27
spec_type: architecture
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

⚠️ **Superseded (MPPP):** This architecture document describes an outbox queue pattern.
**MPPP implementation uses direct synchronous export to Obsidian vault (no queue).**
Outbox pattern deferred to Phase 5+ per [Master PRD v2.3.0-MPPP](../../master/prd-master.md).
Sections referencing "Outbox Queue" are retained for historical context only.

---

Related: `prd-capture.md` • Tech: `spec-capture-tech.md` • Guides: `../../guides/guide-polling-implementation.md`, `../../guides/guide-gmail-oauth2-setup.md`, `../../guides/guide-whisper-transcription.md`

# Capture Feature Architecture

Provide a durable, extensible, low-friction ingestion layer that:

1. Never loses a thought
2. Enforces idempotency / deduplication
3. Isolates capture volatility from vault stability
4. Enables later enrichment without risking source integrity (voice memo sovereignty)

## 0. Guiding Principles

- Durability first: not "captured" until persisted in the staging ledger
- Single write funnel to the vault (outbox only)
- Cheap early structure (envelope + hash) / expensive enrichment deferred
- Every stage must be crash safe + replayable
- YAGNI boundaries strictly enforced

## 1. High-Level Placement

```text
Input (voice | text | web* | email*)
  -> Channel Adapter
    -> Ingestion Service (envelope + hashes + dedup)
      -> Staging Ledger (SQLite WAL)
        -> (Optional) Enrichment Workers
          -> Outbox Queue
            -> Vault Writer (atomic temp+rename)
              -> Audit Log / Metrics
```

Web/email are deferred; seams reserved for future phases.

## 2. Component Overview

⚠️ **Historical Architecture:** Components marked with ⏳ are deferred to Phase 5+ (outbox pattern).

| Component | Responsibility | Notes | MPPP Status |
|-----------|---------------|-------|-------------|
| Channel Adapters | Normalize raw input | Stateless; minimal validation | ✅ Active |
| Ingestion Service | Build envelope + compute hashes | Transaction boundary | ✅ Active |
| Dedup Subsystem | Hash + fingerprint lookups | SHA-256 only (MPPP) | ✅ Active |
| State Manager | Enforce legal transitions | Pure logic layer | ✅ Active |
| Staging Ledger | Durable persistence | WAL + tuned pragmas | ✅ Active |
| Enrichment Workers | Async transcript / classification | ⏳ Deferred (sequential transcription only) | ⏳ Phase 5+ |
| Outbox Processor | Create vault notes | ⏳ Replaced by Direct Export Pattern | ⏳ Phase 5+ |
| Metrics Emitter | Local JSONL counters/histograms | No network I/O | ✅ Active |
| Recovery Manager | Startup reconciliation | Quarantine missing refs | ✅ Active |
| Doctor Command | Health & integrity surfacing | User trust anchor | ✅ Active |

**MPPP Implementation:** See [Direct Export Pattern](../../cross-cutting/spec-direct-export-tech.md) for synchronous export replacing outbox queue.

## 3. Data Model

### 3.1 Tables (MPPP Schema)

**captures** (ephemeral staging)

- id (ULID)
- source (voice | email)
- raw_content (nullable pre-transcript)
- content_hash (SHA-256 hex, nullable until transcription)
- status (staged | transcribed | failed_transcription | exported | exported_duplicate | exported_placeholder)
- meta_json (channel, channel_native_id, audio_fp, etc.)
- created_at / updated_at

**exports_audit** (immutable trail)

- id (ULID)
- capture_id (FK → captures.id)
- vault_path (inbox/ulid.md)
- hash_at_export (SHA-256, NULL for placeholder)
- exported_at
- mode (initial | duplicate_skip | placeholder)
- error_flag (0 | 1)

**errors_log** (diagnostics)

- id (ULID)
- capture_id (nullable FK)
- stage (poll | transcribe | export | backup | integrity)
- message
- created_at

**sync_state** (cursors)

- key (gmail_history_id, last_voice_poll, schema_version)
- value
- updated_at

**Indexes:** source+created_at, content_hash, channel+native_id composite, status

⚠️ **Historical Note:** Earlier architecture included `outbox` table. MPPP uses Direct Export Pattern (no queue). See [spec-direct-export-tech.md](../../cross-cutting/spec-direct-export-tech.md).

### 3.2 Envelope Mapping

One-to-one field persistence; ingest_state is derived (not stored) unless performance dictates later materialization.

## 4. State Machine Integration

Reference ingestion core spec for canonical definition. Transitions:

1. DISCOVERED → VERIFIED (existence + fingerprint)
2. VERIFIED → STAGED (or ENRICHING if enrichment required)
3. ENRICHING → READY (success or fallback timeout)
4. READY triggers potential outbox record (separate lifecycle)

Recovery sweeps ENRICHING timeouts back to STAGED safely.

## 5. Hashing & Dedup (MPPP: SHA-256 Only)

**MPPP Scope:** Single hash strategy using SHA-256 for all content hashing and deduplication.

- **Content Hash:** SHA-256 of normalized text content (transcripts, email body)
- **Voice Fingerprint:** SHA-256 of first 4MB audio (early dedup before transcription)
- **Email Dedup:** Message-ID + SHA-256 content hash

**Deduplication Layers:**
1. **Layer 1 (Channel Native ID):** Unique constraint on (channel, channel_native_id) prevents duplicate staging
2. **Layer 2 (Content Hash):** SHA-256 content_hash prevents duplicate exports

⏳ **Deferred (Phase 2+):** BLAKE3 dual-hash migration per [ADR-0002](../../adr/0002-dual-hash-migration.md). Trigger: Daily capture volume > 200 OR hash collision detected.

## 6. Key Flows

### 6.1 Quick Text

1. Adapter receives text
2. Envelope + hashes
3. Dedup check
4. Insert + audit
5. STAGED (later classification schedules outbox)

### 6.2 Voice Reference

1. Path detected
2. Partial fingerprint
3. DISCOVERED insert → VERIFIED
4. STAGED (await transcript)
5. Transcript enrichment → READY

### 6.3 Direct Export (MPPP)

⚠️ **Replaces Outbox Pattern:** See [Direct Export Pattern](../../cross-cutting/spec-direct-export-tech.md) for full implementation.

**Flow:**
1. Capture reaches READY state (transcribed + content_hash available)
2. DirectExporter.exportToVault() invoked **synchronously**
3. Atomic write: temp → fsync → rename to inbox/{ulid}.md
4. Record in exports_audit table
5. Update captures.status to exported/exported_duplicate/exported_placeholder

**No background workers, no queue, no retry logic in MPPP.**

### 6.4 Recovery

1. Timeouts revert ENRICHING → STAGED
2. Missing external_ref → quarantine flag
3. Clean temp partial notes

## 7. Performance Targets

| Operation | p95 Target | Notes |
|-----------|-----------|-------|
| Text insert | < 25ms | Hash + transaction |
| Voice stage | < 150ms | Partial read only |
| Dedup lookup | < 10ms | Indexed hash |
| Recovery (1k rows) | < 250ms | Single scan |
| Outbox simple write | < 500ms | Disk bound |

## 8. Failure Modes

| Failure | Detection | Containment | Surface |
|---------|-----------|------------|---------|
| Crash mid-capture | Missing audit pair | Atomic insert ensures validity | Doctor |
| Hash divergence | Metrics anomaly | Phase halt + warning | Doctor |
| Lost voice file | stat failure / recovery | Quarantine flag | Doctor |
| Partial note write | Temp file residue | Cleanup on start | Doctor |
| DB corruption | pragma quick_check | Halt enrichment | Doctor |

## 9. Security & Privacy

- Local only; no telemetry egress
- Store references, not voice binaries
- Hashes irreversible; minimal metadata

## 10. Extensibility & YAGNI

Reserved seams (not implemented): adapter registry, enrichment task queue abstraction, pluggable hash strategy.

Deferred: plugins, remote ingestion, streaming partial transcripts, embedding pipeline.

## 11. Operations

- Hourly backups + checksum
- Weekly vacuum/analyze trigger (future metric gate)
- Hash migration command advances phase
- Doctor: state counts, quarantine list, hash divergence, schema drift

## 12. Testing Layers

| Layer | Focus |
|-------|-------|
| Unit | Envelope construction, hashing |
| Integration | Ingestion → SQLite atomicity |
| Contract | CLI schema & exit codes |
| Property | Dedup idempotency |
| Fault | Crash/restart recovery |
| Performance | p95 regression detection |

## 13. Risks

| Risk | Mitigation |
|------|-----------|
| Schema churn | Centralized schema module + migrations |
| Over-enrichment | Feature flags + staged rollout |
| Migration stall | Phase checkpoints + doctor warnings |
| Large audio files | Partial fingerprint cap |
| Silent failures | Doctor + metrics visibility |

## 14. Decision Log

| Decision | Date | Rationale | ADR |
|----------|------|-----------|-----|
| Voice file sovereignty | 2025-09-24 | Avoid duplication/sync issues | [ADR-0001](../../adr/0001-voice-file-sovereignty.md) |
| Late hash binding for voice | 2025-09-28 | Sub-100ms staging requirement | [ADR-0006](../../adr/0006-late-hash-binding-voice.md) |
| Sequential processing model | 2025-09-28 | MPPP scope simplicity | [ADR-0008](../../adr/0008-sequential-processing-mppp.md) |
| Direct export pattern | 2025-09-27 | Replace outbox queue complexity | [ADR-0013](../../adr/0013-mppp-direct-export-pattern.md) |
| Placeholder export immutability | 2025-09-27 | Simplify state machine | [ADR-0014](../../adr/0014-placeholder-export-immutability.md) |

## 15. Evolution Triggers

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Row volume | > 100k | Partition/prune strategy |
| p95 regression | +30% 3 days | Index/optimize |
| Transcript backlog | > 200 pending | Parallelism / batching |
| Hash divergence | > 0.1% mismatch | Investigate / pause phase |

## 16. Open Questions

1. Materialize ingest_state when row count grows?

Decision-in-progress: keep derived (computed on SELECT) until any of:

- Median inbox query > 40ms on 10k staged rows
- > 3 derived state recomputations per capture processing path observed
- Need arises for partial index on state to accelerate archival queries

If triggered: add persisted column + backward-fill in single transaction; add to Decision Log.

1. Post-transcript dedup soft-merge policy?
1. Automated user remediation flow for quarantine?
1. Schema → generated CLI help artifacts (MDX)?

## 17. Glossary

| Term | Meaning |
|------|---------|
| Envelope | Canonical capture representation |
| Staging Ledger | Durable pre-filing store |
| Outbox | Queue + processor producing vault notes |
| Quarantine | Flag for missing / invalid external ref |
| Dual Hash | Transitional period storing SHA-256 + BLAKE3 |

---

Version: 1.0.0  
Last Updated: 2025-09-26  
Author: Copilot (pairing with Nathan)
