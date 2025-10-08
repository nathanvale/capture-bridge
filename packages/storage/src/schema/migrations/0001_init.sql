-- Migration 0001: Initial Schema
--
-- Creates the 4-table staging ledger architecture:
-- - captures: Ephemeral staging for incoming data
-- - exports_audit: Immutable trail of vault writes
-- - errors_log: Diagnostics and failure tracking
-- - sync_state: Cursor tracking for polling
--
-- Source: docs/features/staging-ledger/spec-staging-tech.md §2.1
-- ADR: docs/adr/0003-four-table-hard-cap.md

-- === Table 1: captures (Ephemeral Staging) ===
CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('voice', 'email')),
  raw_content TEXT NOT NULL,
  content_hash TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'staged',
    'transcribed',
    'failed_transcription',
    'exported',
    'exported_duplicate',
    'exported_placeholder'
  )),
  meta_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for captures table
CREATE UNIQUE INDEX IF NOT EXISTS captures_content_hash_idx
  ON captures(content_hash)
  WHERE content_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS captures_channel_native_uid
  ON captures(
    json_extract(meta_json, '$.channel'),
    json_extract(meta_json, '$.channel_native_id')
  );

-- P0: Status index required for crash recovery query performance
-- Recovery query: WHERE status IN ('staged', 'transcribed', 'failed_transcription')
-- Target: < 50ms p95 (ADR-0004, spec-staging-arch.md §8.1)
CREATE INDEX IF NOT EXISTS captures_status_idx
  ON captures(status);

CREATE INDEX IF NOT EXISTS captures_created_at_idx
  ON captures(created_at);

-- === Table 2: exports_audit (Immutable Trail) ===
CREATE TABLE IF NOT EXISTS exports_audit (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL,
  vault_path TEXT NOT NULL,
  hash_at_export TEXT,
  exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  mode TEXT NOT NULL CHECK (mode IN ('initial', 'duplicate_skip', 'placeholder')),
  error_flag INTEGER DEFAULT 0 CHECK (error_flag IN (0, 1)),
  FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
);

-- Index for exports_audit table
CREATE INDEX IF NOT EXISTS exports_audit_capture_idx
  ON exports_audit(capture_id);

-- === Table 3: errors_log (Diagnostics) ===
CREATE TABLE IF NOT EXISTS errors_log (
  id TEXT PRIMARY KEY,
  capture_id TEXT,
  stage TEXT NOT NULL CHECK (stage IN ('poll', 'transcribe', 'export', 'backup', 'integrity')),
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
);

-- Indexes for errors_log table
CREATE INDEX IF NOT EXISTS errors_log_stage_idx
  ON errors_log(stage);

CREATE INDEX IF NOT EXISTS errors_log_created_at_idx
  ON errors_log(created_at);

-- === Table 4: sync_state (Cursors) ===
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- === Schema Version Tracking ===
-- Store schema version in sync_state for migration tracking
INSERT OR IGNORE INTO sync_state (key, value)
VALUES ('schema_version', '0001');
