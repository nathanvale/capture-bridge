/**
 * Crash Recovery Tests - CRASH_RECOVERY_MECHANISM--T02
 *
 * AC07: No duplicate exports during recovery
 * Goals:
 *  - When a transcribed capture without an exports_audit row is recovered, exactly one audit row is created
 *  - When a transcribed capture already has an exports_audit row (status not yet updated due to crash), recovery MUST NOT create a second row
 *  - In both cases, capture status transitions to 'exported'
 *  - Idempotency: multiple recovery invocations remain stable (no new rows)
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('CRASH_RECOVERY_MECHANISM--T02: AC07 Duplicate Export Prevention', () => {
  let db: Database.Database
  const databases: Database.Database[] = []

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        hash_at_export TEXT,
        exported_at TEXT DEFAULT (datetime('now')),
        mode TEXT NOT NULL,
        error_flag INTEGER DEFAULT 0,
        FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX exports_audit_capture_idx ON exports_audit(capture_id);
    `)
  })

  afterEach(() => {
    for (const database of databases) {
      try { if (database.open) database.close() } catch { /* ignore */ }
    }
    databases.length = 0
    if (global.gc) global.gc()
  })

  // Minimal ULID-like generator for test (timestamp+counter)
  let counter = 0
  const genId = () => `01TEST${(Date.now() + counter++).toString(36).toUpperCase()}`.padEnd(26, '0')

  // Test helper performExport used by recovery via options.performExport
  const performExport = (captureId: string, dbLocal: Database.Database) => {
    // If already exported (audit row exists) skip insertion but ensure status update
    const existing = dbLocal
      .prepare('SELECT 1 as one FROM exports_audit WHERE capture_id = ?')
      .get(captureId) as { one: number } | undefined
    if (!existing) {
      dbLocal
        .prepare(
          'INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, exported_at, mode, error_flag) VALUES (?, ?, ?, ?, ?, ?, ?)' // single insertion
        )
        .run(genId(), captureId, `/vault/inbox/${captureId}.md`, 'hash', new Date().toISOString(), 'initial', 0)
    }
    // Update capture status to exported idempotently
    dbLocal.prepare('UPDATE captures SET status = ? WHERE id = ?').run('exported', captureId)
  }

  it('should export transcribed capture exactly once', async () => {
    const captureId = '01AC07INITIAL00000000000000'
    db.prepare(
      'INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json) VALUES (?, ?, ?, ?, ?, ?)' 
    ).run(captureId, 'voice', 'body', 'hash1', 'transcribed', '{}')

    const { recoverCaptures } = await import('./crash-recovery.js')
  await recoverCaptures(db, { performExport }) // FIRST recovery (should insert)

    const { c: count1 } = db
      .prepare('SELECT COUNT(*) as c FROM exports_audit WHERE capture_id = ?')
      .get(captureId) as { c: number }
    expect(count1).toBe(1) // Fails until performExport is invoked by recovery
    const { status: status1 } = db
      .prepare('SELECT status FROM captures WHERE id = ?')
      .get(captureId) as { status: string }
    expect(status1).toBe('exported')

    await recoverCaptures(db, { performExport }) // SECOND recovery (idempotent)
    const { c: count2 } = db
      .prepare('SELECT COUNT(*) as c FROM exports_audit WHERE capture_id = ?')
      .get(captureId) as { c: number }
    expect(count2).toBe(1) // Still one row
  })

  it('should not create duplicate audit row if one already exists (crash mid-transition)', async () => {
    const captureId = '01AC07PARTIAL0000000000000'
    db.prepare(
      'INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(captureId, 'voice', 'body', 'hash2', 'transcribed', '{}')

    // Simulate prior export audit row inserted before status updated
    db.prepare(
      'INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, exported_at, mode, error_flag) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(genId(), captureId, `/vault/inbox/${captureId}.md`, 'hash2', new Date().toISOString(), 'initial', 0)

    const { recoverCaptures } = await import('./crash-recovery.js')
  await recoverCaptures(db, { performExport })

    const { c: count } = db
      .prepare('SELECT COUNT(*) as c FROM exports_audit WHERE capture_id = ?')
      .get(captureId) as { c: number }
    expect(count).toBe(1) // Fails until recovery checks existing audit
    const { status } = db
      .prepare('SELECT status FROM captures WHERE id = ?')
      .get(captureId) as { status: string }
    expect(status).toBe('exported')
  })
})
