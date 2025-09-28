---
title: Staging Ledger Schema & Indexes (MPPP)
status: living
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-27
doc_type: reference
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Staging Ledger Schema & Indexes (MPPP)

**Status:** Living • **Scope:** Authoritative reference for the 4-table limit, columns, constraints, and indexes in Phase 1–2.

## 1. Purpose

Centralize the canonical SQLite schema + invariants so implementation, tests, and future migrations stay aligned. This prevents silent drift and keeps YAGNI boundaries explicit (no stealth tables, no premature FTS, no vectors). SQLite is still smaller than your working memory window.

## 2. Table Set (Hard Cap = 4)

1. `captures` – Ephemeral staging + processing state
2. `exports_audit` – Immutable export audit trail
3. `errors_log` – Failure/event diagnostics
4. `sync_state` – Poll cursors and checkpoint markers

No additional tables permitted in MPPP without ADR approval.

## 3. Canonical Schema (Declarative Form)

```sql
CREATE TABLE captures (
  id TEXT PRIMARY KEY,                 -- ULID (time-orderable, export filename)
  source TEXT NOT NULL,                -- 'voice' | 'email'
  raw_content TEXT NOT NULL,           -- Transient body or transcript text (may be placeholder)
  content_hash TEXT UNIQUE,            -- SHA-256 (nullable until available)
  status TEXT NOT NULL,                -- staged | transcribed | failed_transcription | exported | exported_duplicate | exported_placeholder
  meta_json TEXT,                      -- JSON: { file_path?, audio_fp?, message_id?, from?, subject?, channel_native_id? }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exports_audit (
  id TEXT PRIMARY KEY,                 -- ULID
  capture_id TEXT NOT NULL,
  vault_path TEXT NOT NULL,            -- inbox/<ulid>.md
  hash_at_export TEXT,                 -- Snapshot of hash (or NULL for placeholder)
  exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  mode TEXT,                           -- initial | duplicate_skip | placeholder
  error_flag INTEGER DEFAULT 0,
  FOREIGN KEY (capture_id) REFERENCES captures(id)
);

CREATE TABLE errors_log (
  id TEXT PRIMARY KEY,
  capture_id TEXT,
  stage TEXT,                          -- poll | transcribe | export | backup | integrity
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (capture_id) REFERENCES captures(id)
);

CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,                -- e.g. gmail_history_id, last_voice_poll
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 4. Indexes (Current Set)

```sql
-- Channel + native identifier uniqueness (prevents repeated staging of same physical/logical item)
CREATE UNIQUE INDEX captures_channel_native_uid ON captures(
  json_extract(meta_json, '$.channel'),
  json_extract(meta_json, '$.channel_native_id')
);

-- Fast lookup for dedup (hash uniqueness already enforced by UNIQUE constraint)
CREATE INDEX IF NOT EXISTS captures_status_idx ON captures(status);
CREATE INDEX IF NOT EXISTS errors_stage_idx ON errors_log(stage);
CREATE INDEX IF NOT EXISTS exports_capture_idx ON exports_audit(capture_id);
```

### Deferred / Not Added (YAGNI)

- No composite index on `(source, created_at)` yet (only add if query plan shows >5% latency regression over 5k rows).
- No partial indexes (schema simplicity prioritized).
- No FTS5 virtual tables (classification & semantic search deferred Phase 5+).

## 5. Status State Machine & Rules

```text
staged → transcribed → exported
      ↘ failed_transcription → exported_placeholder
staged (duplicate detected pre-export) → exported_duplicate
```

Rules:

- Terminal states start with `exported`.
- `failed_transcription` only transitions to `exported_placeholder`.
- Duplicate detection prior to export sets `exported_duplicate` (still audits action; no vault write).
- Hash may be NULL until transcription completes; placeholder path sets status directly.

## 6. Invariants (Enforced / Tested)

| # | Invariant | Enforcement | Test Strategy |
|---|-----------|-------------|---------------|
| 1 | Export filename ULID == captures.id | Convention (writer) | Property test mapping id → filename |
| 2 | One non-placeholder export per capture | Status machine + mode values | Attempt double export must noop |
| 3 | `(channel, channel_native_id)` unique | Index | Duplicate insert test expects constraint handling |
| 4 | Voice hash mutates at most once | Business rule | Simulated re-transcription attempt rejected |
| 5 | Placeholder exports immutable | No mutation path | Try update → assertion/log error |
| 6 | Backup verification precedes pruning | Process order | Fault injection skip verifies guard |
| 7 | No orphan audit rows | FK | Insert without capture fails |
| 8 | Non-exported rows never trimmed | Retention job filter | Retention test dataset snapshot |

## 7. Retention Policies (Phase 1–2)

- Trim only rows whose status begins with `exported` after 90 days.
- Never auto-trim rows in `staged`, `transcribed`, `failed_transcription`.
- `errors_log`: Optionally trim >90d (low priority) after Phase 2 reliability proof.
- `exports_audit`: Retain forever (minimal footprint).

## 8. Backup & Integrity Hooks

Flow:

1. Hourly backup (SQLite `.backup`).
2. Integrity check + sorted logical hash of `(id,status,content_hash)`.
3. Escalation counters (warn → degraded → prune pause).
4. On success reset counters and enforce retention.

Metrics:

- `backup_verification_result{status=success|failure}`
- `backup_duration_ms`
- `backup_size_bytes`

## 9. Query Patterns (Anticipated)

| Query | Example | Index Utilization |
|-------|---------|-------------------|
| Fetch pending exports | `SELECT * FROM captures WHERE status IN ('staged','transcribed','failed_transcription') LIMIT ?` | `captures_status_idx` |
| Dedup check | `SELECT id FROM captures WHERE content_hash = ?` | UNIQUE on `content_hash` |
| Duplicate native item | `INSERT ...` (relies on unique index) | `captures_channel_native_uid` |
| Error stage summary | `SELECT stage, COUNT(*) FROM errors_log GROUP BY stage` | `errors_stage_idx` |
| Audit by capture | `SELECT * FROM exports_audit WHERE capture_id = ?` | `exports_capture_idx` |

## 10. Forbidden Patterns

- No `ALTER TABLE` introducing new core tables without ADR.
- No storing raw binary blobs (voice media path only).
- No adding text search/FTS modules pre-Phase 5.
- No opportunistic new indexes “for convenience” without measured query plan regression.

## 11. Migration Strategy (Future Placeholder)

- First migration introduces the unique index if not present (idempotent).
- Migrations must be append-only numbered folders (`/migrations/0001_init.sql`).
- Drift detection: integration test runs schema introspection diff.

## 12. Open Questions

| Topic | Current Position | Revisit Trigger |
|-------|------------------|-----------------|
| Secondary hash (BLAKE3) | Deferred | >200 daily captures or false duplicate incident |
| Extra index for ordering | Deferred | Query latency p95 > 11s voice pipeline root cause |
| Partial pruning of errors_log | Deferred | File > 10MB persistent |

## 13. References

- Master PRD v2.3.0-MPPP
- Roadmap v2.0-MPPP (State & Invariants, Backup Procedure)
- [ADR-0001: Voice File Sovereignty](../../adr/0001-voice-file-sovereignty.md)
- [ADR-0002: Dual Hash Migration](../../adr/0002-dual-hash-migration.md) (superseded)
- [ADR-0003: Four-Table Hard Cap](../../adr/0003-four-table-hard-cap.md)
- [ADR-0004: Status-Driven State Machine](../../adr/0004-status-driven-state-machine.md)
- [ADR-0005: WAL Mode Normal Sync](../../adr/0005-wal-mode-normal-sync.md)
- [ADR-0006: Late Hash Binding Voice](../../adr/0006-late-hash-binding-voice.md)
- [ADR-0007: 90-Day Retention Exported Only](../../adr/0007-90-day-retention-exported-only.md)
- [ADR-0008: Sequential Processing MPPP](../../adr/0008-sequential-processing-mppp.md)

---
**Next Update Gate:** After first end-to-end walking skeleton test run validates state machine transitions.
