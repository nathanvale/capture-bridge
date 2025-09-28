---
title: Capture Feature PRD
status: living
owner: Nathan
version: 1.3.0-MPPP
date: 2025-09-27
spec_type: prd
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Capture Feature PRD v3.1-MPPP

Related Master Document: `../../master/prd-master.md` (Master PRD v2.3.0-MPPP)
Related Specs: `spec-capture-arch.md`, `spec-capture-tech.md`

---

## 1. Executive Summary

The Capture feature provides a **zero-friction, durable entry layer** for voice memos and email forwarding (MPPP scope). It funnels every input into a **SQLite staging ledger** (never directly into the Obsidian vault) guaranteeing durability, deduplication, and crash recovery. Voice memo sovereignty is preserved—original files remain in Apple's managed location and are referenced, not copied.

Primary Objective: Time from thought -> safely staged < 3 seconds; staged -> exported note < 10 seconds; **zero data loss**.

---

## 2. Problem Statement

ADHD cognition produces bursty, interrupt-prone capture attempts. Traditional tools lose content during app switching, crash mid-save, or generate duplicates eroding trust. Obsidian excels at long-term structure but provides no durable capture layer. We address the **durability gap** by staging all inputs transactionally before any organization.

Failure modes eliminated:

- Lost capture due to crash or focus shift
- Duplicate anxiety ("Did I already record this?")
- Partial / corrupted vault writes
- Manual filing friction delaying cognitive offload

---

## 3. Personas

Primary: Nathan (engineering, high technical comfort, PARA vault). Needs frictionless offload, anti-dup, crash resilience, batch triage.  
Secondary: ADHD knowledge workers (variable technical skill) needing trust + fast inbox zero.

---

## 4. Goals & Non-Goals

### Goals

- Sub-100ms perceived acknowledgment for text capture
- Voice reference stored (path + fingerprint) within 150ms p95
- Deterministic dedup across all channels (content or fingerprint based)
- Idempotent replay after crash (no user intervention)
- Extensible envelope enabling later enrichment (transcription, PARA classification)

### Non-Goals / YAGNI

- Quick text capture (deferred to Phase 5+)
- Web clipper (deferred to Phase 5+)
- Browser extensions
- Mobile native clients (defer)
- Cloud sync layer or multi-device replication
- Knowledge graph / vector indexing inside SQLite
- Real-time collaboration
- PARA auto-classification (deferred to Phase 5+)
- Inbox triage UI (deferred to Phase 5+)
- Plugin command injection (covered separately; deferred)  

---

## 5. Scope

| Phase | Channels Included | Key Outcomes | Excluded |
|-------|-------------------|--------------|----------|
| MPPP (Phase 1) | Voice memos + Email (Gmail) | Durable staging, direct to Obsidian inbox/, dedup, audit | Classification, inbox UI, daily note append |
| Phase 2 | Hardening + observability | Health checks, backup verification, error recovery | All cognitive features |
| Phase 5+ (Future) | Quick text, web clipper, attachments | Additional capture channels | Still deferred |

**YAGNI - Not building now:**

- ❌ Quick text capture (deferred to Phase 5+)
- ❌ Web clipper (deferred to Phase 5+)
- ❌ Browser extensions
- ❌ Mobile apps
- ❌ Batch triage UI
- ❌ Inbox interface
- ❌ PARA auto-classification
- ❌ Smart routing / suggestions
- ❌ RAG / embeddings
- ❌ Daily note append
- ❌ Attachment inline extraction

---

## 6. Architecture Overview

High-Level Layers (MPPP Simplified):

```text
Voice: iCloud poll → APFS check → sequential download → transcribe → direct export (inbox/)
Email: Gmail poll → normalize → hash check → direct export (inbox/)
Shared: SQLite staging + exports_audit + error logging
```

Key Feature-Specific Clarifications:

- Voice memos never relocated (ADR-0001). External path & SHA-256 fingerprint recorded.
- Dedup precedes any costly enrichment (e.g., transcription) to protect CPU cycles.
- Direct export to vault (no outbox queue in MPPP). ⚠️ **Superseded (MPPP):** This flow uses direct synchronous export to Obsidian. Outbox pattern deferred to Phase 5+ per [Master PRD v2.3.0-MPPP](../../master/prd-master.md).
- Flat inbox structure: `vault_root/inbox/ulid.md` (PARA methodology - classification happens in future phases)

### 6.1 Status States (Simplified)

| State | Meaning | Next State |
|-------|---------|------------|
| staged | Row inserted, fingerprint computed | transcribed (voice) or exported (email) |
| transcribed | Voice transcript available | exported |
| exported | Successfully written to vault | terminal state |
| exported_duplicate | Duplicate detected, not written | terminal state |
| error | Processing failed, needs retry | staged (after retry) or terminal |

### 6.2 Hashing & Dedup

Uses SHA-256 for all fingerprinting and content hashing (consistent with master PRD decision).

Dedup inputs per channel:

- Voice: partial audio (first 4MB) fingerprint + later transcript hash
- Email: Message-ID (primary) OR normalized body hash (fallback)

### 6.3 Voice Memo Sovereignty

We store only: `external_ref`, `external_fingerprint`, `size_bytes`. No copying, renaming, or embedding binary content into vault. Vault may hold a markdown note linking to the original path.

---

## 7. Functional Requirements

### 7.1 Channels (MPPP Only)

| Channel | Trigger | Minimum Persisted Fields | Export Behavior |
|---------|---------|---------------------------|-----------------|
| Voice | iCloud folder polling (automatic) | id, source_type=voice, external_ref, fingerprint | Transcribe → export to inbox/ulid.md |
| Email | Gmail API polling (automatic) | id, source_type=email, message_id, raw_content, hash | Normalize → export to inbox/ulid.md |

**Voice Polling Details:**

- **Path**: `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/`
- **APFS Dataless Check**: Verify file availability before processing (skip if not downloaded)
- **Swift Helper**: Use `icloudctl` for download management
- **Sequential Download**: Semaphore=1 to prevent `ubd` daemon overload
- **Fingerprint**: First 4MB SHA-256 for early dedup

**Gmail Polling Details:**

- **OAuth2**: credentials.json + token.json pattern
- **API**: `gmail.users.messages.list()` with pagination
- **Dedup**: message_id primary, body hash secondary
- **Rate Limits**: Built into googleapis library

**Export Behavior (Both Channels):**

- **Folder Structure**: `vault_root/inbox/ulid.md` (flat PARA inbox)
- **Conflict Resolution**: ULID collision → increment suffix (extremely rare)
- **Atomic Writes**: temp file + rename pattern
- **Frontmatter**: Minimal (source, captured_at, message_id/file_path)
- **Future Classification**: Intelligence layer (Phase 5+) processes inbox → moves to PARA folders

### 7.2 Deduplication Behavior

If duplicate detected:

1. Do not create new capture record (or mark metadata.increment_count)
2. Return existing id (communicated to caller / CLI)
3. Optionally log dedup hit metric

### 7.3 Recovery

On startup all non-exported captures re-evaluated; errors flagged for missing voice files (no deletion). Infrastructure health command (`capture doctor`) provides comprehensive serviceability diagnostics and operational status for manual review.

---

## 8. Non-Functional Requirements

| Aspect | Target | Rationale |
|--------|--------|-----------|
| Voice reference staging | < 150ms p95 | Reinforce confidence |
| Email staging | < 200ms p95 | Maintain responsiveness |
| Crash durability | 100% of staged persisted | Trust |
| Duplicate check | < 10ms | Avoid slowing polling |
| Direct export write | < 1s | Obsidian note feel responsive |
| Voice transcription | < 10s average | Reasonable for background job |

SQLite PRAGMAs (inherit master): WAL journal, synchronous=NORMAL, busy_timeout=5000.

Backups: hourly + retention policy (24 hourly + 7 daily) with checksum; restore test weekly.

---

## 9. Telemetry & Observability (MVP Scope)

**Status:** Basic observability included in MPPP for operational visibility

Essential metrics (activated with `CAPTURE_METRICS=1`):

- `capture_voice_staging_ms` - Voice memo staging duration
- `capture_email_staging_ms` - Email capture staging duration  
- `transcription_duration_ms` - Whisper processing time
- `export_write_ms` - Vault file write duration
- `dedup_hits_total` - Duplicate detection events
- `export_failures_total` - Failed vault writes
- `poll_voice_duration_ms` - Voice polling cycle time
- `poll_email_duration_ms` - Email polling cycle time

**Storage:** Newline-delimited JSON in `./.metrics/YYYY-MM-DD.ndjson` (daily rotation)
**Privacy:** Local-only, no external transmission

---

## 10. Workflows

### 10.1 Voice Memo Capture

1. User records in Voice Memos app (native)
2. Polling detects new file in iCloud shared folder
3. APFS check confirms file is downloaded (not dataless)
4. Sequential download via `icloudctl` if needed
5. Fingerprint (first 4MB SHA-256) computed -> status=staged
6. Dedup check (skip if duplicate)
7. Transcription initiated -> status=transcribed
8. Direct export to `inbox/ulid.md` -> status=exported

### 10.2 Email Capture

1. Gmail API polling detects new message
2. Message-ID dedup check (skip if duplicate)
3. Normalize content (strip HTML, extract text) -> status=staged
4. Content hash computed (SHA-256)
5. Direct export to `inbox/ulid.md` -> status=exported

### 10.3 Crash Recovery

1. Restart triggers recovery scan
2. Any transcribed but not exported -> retry export
3. Any staged with missing file -> status=error
4. Health command (`capture doctor`) displays errors for manual review  

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| iCloud partial availability (APFS dataless) | Delayed voice export | APFS check + sequential download + retry backoff |
| Gmail API quota limits | Email capture delays | Built-in rate limiting + backoff |
| Voice transcription latency | User impatience | Single retry + placeholder fallback |
| Vault write conflicts | Note duplication confusion | ULID-based naming (collision extremely rare) |
| SQLite growth | Performance degradation | Retention thresholds + cleanup jobs |
| User distrust from hidden failures | Abandonment | Infrastructure health command (`capture doctor`) + observability metrics |

---

## 12. TDD Applicability Decision

### Risk Assessment

- **Risk Level:** HIGH
- **Justification:**
  - Data loss = P0 failure mode (lost thoughts create user anxiety)
  - Duplicate anxiety = Trust erosion (users lose confidence in the system)
  - APFS dataless failures = Silent data loss (file appears present but unreadable)
  - Hash collision = Duplicate suppression failure (multiple distinct captures marked as same)
  - Crash recovery = Correctness critical (must resume without user intervention)

### TDD Decision

- **Decision:** TDD Required
- **Scope:**
  - **Unit tests**: Hash functions (SHA-256 determinism), fingerprint generation (first 4MB consistency), content normalization (email body)
  - **Integration tests**: End-to-end capture flow (voice polling → staging → export), crash recovery (WAL replay verification), dedup correctness (same content → single export)
  - **Contract tests**: Staging ledger API contracts, export audit foreign keys, external ref validation

### Test Coverage Requirements

- **Unit:** 100% coverage for hash/fingerprint functions, dedup logic
- **Integration:** Happy path + APFS dataless, Gmail quota errors, transcription failures, vault write errors
- **Contract:** Verify `exports_audit` foreign key constraints, external ref validation

### Test Execution Strategy

- **Pre-commit:** Unit tests (< 10s execution time)
- **CI pipeline:** Full integration suite (< 2min execution time)
- **Manual testing:** APFS dataless scenarios (requires iCloud simulation)

**Reference:** See Staging Ledger PRD §9 for TDD pattern template.

---

## 13. Roadmap Alignment (Extract)

| Phase | Capture Deliverables |
|-------|----------------------|
| 1 (MPPP Foundation) | Schema, voice + email polling, direct export, dedup, audit, basic observability |
| 2 (Hardening) | Health command, backup verification, error recovery |
| 5+ (Future) | Quick text, web clipper, classification, inbox UI |

---

## 14. Master PRD Success Criteria Alignment

This PRD delivers the following Master PRD v2.3.0-MPPP §12 success criteria:

### Phase 1 (MVP) Criteria Mapping

| Master PRD Criterion | Capture PRD Deliverable | Verification Test |
|---------------------|------------------------|-------------------|
| ✅ Voice capture operational | Voice polling + transcription pipeline | `test-capture-voice-e2e.spec.ts` |
| ✅ Email capture operational | Email polling + normalization pipeline | `test-capture-email-e2e.spec.ts` |
| ✅ Deduplication working | Content hash + fingerprint dedup logic | `test-capture-dedup.spec.ts` |
| ✅ Export to vault | Staging → export worker → Obsidian Bridge | `test-capture-export-flow.spec.ts` |
| ✅ Audit trail complete | `exports_audit` table populated | `test-audit-trail.spec.ts` |

### Phase 2 (Production Ready) Criteria Mapping

| Master PRD Criterion | Capture PRD Deliverable | Verification Test |
|---------------------|------------------------|-------------------|
| ✅ Both capture channels stable | Voice + Email error handling | `test-capture-error-recovery.spec.ts` |
| ✅ Error recovery working | Whisper failure → placeholder export | `test-transcription-fallback.spec.ts` |
| ✅ 7 days without data loss | Voice + Email durability | Manual 7-day validation |
| ✅ Fault injection validated | Crash → restart → resume | `test-crash-recovery.spec.ts` |

### Test Traceability

All tests referenced above live in `packages/capture/tests/` and are executed via TestKit.

---

## 15. Success Criteria

MPPP (end Phase 1):

- Voice + email captures durable
- Zero lost captures over 50 real events (voice + email combined) across 7 days
- Dedup working (duplicate test suite pass)
- Direct export to inbox/ working

Hardened (end Phase 2):

- Health command (`capture doctor`) operational
- Backup verification automated
- Error recovery tested with fault injection
- 99.9% durability proven

v1.0 (Future):

- 50+ unique captures validated
- Zero vault corruption events
- Classification pipeline integrated (Phase 5+)

---

## 16. YAGNI Boundaries

Not building: quick text capture, web clipper, inbox UI, classification, multi-device sync, embeddings, plugin gestures, mobile capture, full-text search in ledger, vector indices, remote telemetry, relocation of voice files, daily note append.

---

## 17. Open Questions

1. Should voice transcription failures block export with placeholder content?
2. Gmail API vs IMAP for email polling (current: Gmail API)?
3. Should health command check transcription service availability?
4. Notification method for voice transcription failures (current: error log only)?  

---

## 18. Dependencies & ADRs

- [ADR-0001 Voice File Sovereignty](../../adr/0001-voice-file-sovereignty.md) - Voice memos referenced in place
- [ADR-0002 Dual Hash Migration](../../adr/0002-dual-hash-migration.md) - Superseded by SHA-256 only strategy
- [ADR-0006 Late Hash Binding for Voice Captures](../../adr/0006-late-hash-binding-voice.md) - Fast staging with delayed content hashing
- [ADR-0008 Sequential Processing for MPPP Scope](../../adr/0008-sequential-processing-mppp.md) - One capture at a time processing
- [ADR-0013 MPPP Direct Export Pattern](../../adr/0013-mppp-direct-export-pattern.md) - Synchronous export vs outbox queue
- [ADR-0014 Placeholder Export Immutability](../../adr/0014-placeholder-export-immutability.md) - Failed transcriptions export immutable placeholders

---

## 19. TDD Focus Areas (P0)

- Canonical envelope hashing determinism
- Duplicate suppression correctness (message_id + body hash)
- Direct export idempotent write & ULID conflict policy
- Recovery replay leaves system stable
- Error tagging for missing external refs (voice files)

---

## 20. Appendix: Minimal Envelope Example (Voice)

```json
{
  "id": "01JABCDEF123XYZ7890ABCD12",
  "source_type": "voice",
  "external_ref": "/Users/user/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/ABC123.m4a",
  "external_fingerprint": "b3:abcd...",
  "metadata": { "verification": { "ok": true } },
  "created_at": "2025-09-26T10:15:22.123Z"
}
```

---

## 21. Nerdy Joke

The staging ledger is the ADHD brain’s short-term RAM upgrade—fast enough you forget it’s there, reliable enough you never worry it crashed mid-thought.

---

## 22. Appendix: Future Enhancements (Phase 5+)

### Quick Text Capture

Hotkey-triggered (Cmd+Shift+N) burst text entry. Deferred until voice + email proven stable.

### Web Clipper

Browser extension or URL paste for article extraction. Requires readability parsing and attachment handling.

### PARA Auto-Classification

AI-driven routing from flat inbox/ to PARA folders (Projects, Areas, Resources, Archives). Separate intelligence phase.

### Inbox Triage UI

Batch review interface for manual classification and enrichment. Not part of MPPP.

---

Version: 3.1.0-MPPP
Last Updated: 2025-09-27
Author: Copilot (pairing with Nathan)
