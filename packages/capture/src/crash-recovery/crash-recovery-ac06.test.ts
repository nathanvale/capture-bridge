/**
 * Crash Recovery Tests - CRASH_RECOVERY_MECHANISM--T02
 *
 * AC06: Performance - Recover 1000 pending captures < 250ms
 * Scope: Full recovery path (sequential processing) across mixed statuses
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('CRASH_RECOVERY_MECHANISM--T02: AC06 Performance (1000 captures)', () => {
  let db: Database.Database
  const databases: Database.Database[] = []

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK(source IN ('voice', 'email')),
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL CHECK(status IN (
          'staged',
          'transcribed', 
          'failed_transcription',
          'exported',
          'exported_duplicate',
          'exported_placeholder'
        )) DEFAULT 'staged',
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    const insert = db.prepare(
      `INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, 'voice', ?, ?, ?)`
    )
    const now = Date.now()
    // Distribute statuses evenly to exercise all branches
    for (let i = 0; i < 1000; i++) {
      const mod = i % 3
      let status: string
      if (mod === 0) status = 'staged'
      else if (mod === 1) status = 'transcribed'
      else status = 'failed_transcription'
      // Slightly vary updated_at via meta to avoid timeout logic triggering
      insert.run(`cap-${i}`, 'payload', status, JSON.stringify({ seed: now + i }))
    }
  })

  afterEach(() => {
    for (const database of databases) {
      try {
        if (database.open) database.close()
      } catch {
        // ignore
      }
    }
    databases.length = 0
    if (global.gc) global.gc()
  })

  it('should recover 1000 captures < 250ms', async () => {
    const { recoverCaptures } = await import('./crash-recovery.js')
    const start = performance.now()
    const result = await recoverCaptures(db)
    const wall = performance.now() - start

    // Guard: ensure dataset recognized
    expect(result.capturesFound).toBe(1000)
    expect(result.capturesRecovered + result.capturesTimedOut + result.capturesQuarantined).toBe(result.capturesFound)

    // AC06 threshold
    expect(result.duration).toBeLessThan(250)
    // Cross-check wall clock measurement (should closely match, allow slack for overhead)
    expect(wall).toBeLessThan(275)

    // Log for observability in Wallaby output
    // eslint-disable-next-line no-console
    console.log(`AC06 Performance: result.duration=${result.duration.toFixed(2)}ms wall=${wall.toFixed(2)}ms`)
  })
})
