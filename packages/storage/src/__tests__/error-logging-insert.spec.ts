/**
 * Error Logging: Insert errors_log
 *
 * Tests for AC01: Insert errors_log on any failure
 *
 * Task: ERROR_LOGGING_STRUCTURED--T01
 * Risk Level: Medium
 *
 * Source: docs/features/staging-ledger/spec-staging-tech.md §2.1 (errors_log table)
 */

import Database from 'better-sqlite3'
import { ulid } from 'ulid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

type DatabaseInstance = ReturnType<typeof Database>

describe('Error Logging: Insert errors_log', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []

  beforeEach(() => {
    // Create in-memory database for each test
    db = new Database(':memory:')
    databases.push(db)

    // Create errors_log table schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('voice', 'email')),
        status TEXT NOT NULL CHECK (status IN (
          'staged',
          'transcribed',
          'exported',
          'failed_transcription',
          'exported_placeholder',
          'exported_duplicate'
        )),
        content_hash TEXT,
        meta_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS errors_log (
        id TEXT PRIMARY KEY,
        capture_id TEXT,
        stage TEXT NOT NULL CHECK (stage IN ('poll', 'transcribe', 'export', 'backup', 'integrity')),
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
      )
    `)

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS errors_log_stage_idx
        ON errors_log(stage)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS errors_log_created_at_idx
        ON errors_log(created_at)
    `)
  })

  afterEach(async () => {
    // 5-step cleanup
    // 0. Custom resources (none)
    // 1. Settle 100ms
    await new Promise((resolve) => setTimeout(resolve, 100))
    // 2. Drain pools (none)
    // 3. Close databases
    for (const database of databases) {
      database.close()
    }
    databases.length = 0
    // 4. TestKit auto-cleanup (none)
    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('inserts error log entry with id, capture_id, stage, message, and created_at', async () => {
    // Arrange: Create test capture
    const captureId = ulid()
    db.prepare(`INSERT INTO captures (id, source, status) VALUES (?, ?, ?)`).run(captureId, 'voice', 'staged')

    // Dynamic import to trigger test failure
    const { logError } = await import('../errors/error-logger.js')

    // Act: Call logError() with valid inputs
    await logError(db, captureId, 'transcribe', 'Whisper API timeout')

    // Assert: Query errors_log and verify row exists with correct values
    const row = db.prepare('SELECT * FROM errors_log WHERE capture_id = ?').get(captureId) as {
      id: string
      capture_id: string
      stage: string
      message: string
      created_at: string
    }

    expect(row).toBeDefined()
    expect(row.id).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/) // ULID format
    expect(row.capture_id).toBe(captureId)
    expect(row.stage).toBe('transcribe')
    expect(row.message).toBe('Whisper API timeout')
    expect(row.created_at).toBeDefined()
  })

  it('allows null capture_id for system-level errors', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Call logError with null capture_id
    await logError(db, null, 'poll', 'System error: disk full')

    // Assert: Query errors_log and verify null capture_id accepted
    const row = db
      .prepare('SELECT * FROM errors_log WHERE stage = ? AND message = ?')
      .get('poll', 'System error: disk full') as {
      id: string
      capture_id: string | null
      stage: string
      message: string
      created_at: string
    }

    expect(row).toBeDefined()
    expect(row.capture_id).toBeNull()
    expect(row.stage).toBe('poll')
    expect(row.message).toBe('System error: disk full')
  })

  it('rejects invalid stage values', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act & Assert: Call logError with invalid stage
    await expect(async () => {
      await logError(db, null, 'invalid_stage', 'error message')
    }).rejects.toThrow()
  })

  it('sets created_at to current timestamp automatically', async () => {
    // Arrange: Note current time before insert
    const beforeInsert = new Date()

    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Call logError
    await logError(db, null, 'backup', 'Backup verification failed')

    // Arrange: Note current time after insert
    const afterInsert = new Date()

    // Assert: Query row and verify created_at is close to current time
    const row = db.prepare('SELECT * FROM errors_log WHERE stage = ?').get('backup') as {
      id: string
      capture_id: string | null
      stage: string
      message: string
      created_at: string
    }

    expect(row).toBeDefined()
    expect(row.created_at).toBeDefined()

    // SQLite CURRENT_TIMESTAMP returns UTC time as string: "YYYY-MM-DD HH:MM:SS"
    // Parse it and verify it's between beforeInsert and afterInsert (with some tolerance)
    const createdAt = new Date(row.created_at + ' UTC')

    // Verify timestamp is reasonable (within test execution window + 5s tolerance)
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 5000)
    expect(createdAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime() + 5000)
  })

  it('generates unique ULIDs for each error log entry', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Insert multiple error log entries
    await logError(db, null, 'poll', 'Error 1')
    await logError(db, null, 'transcribe', 'Error 2')
    await logError(db, null, 'export', 'Error 3')

    // Assert: Verify all IDs are unique
    const rows = db.prepare('SELECT id FROM errors_log').all() as Array<{ id: string }>

    expect(rows).toHaveLength(3)

    const ids = rows.map((r) => r.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(3) // All IDs should be unique
  })

  it('respects foreign key constraint on capture_id', async () => {
    // Arrange: Create test capture
    const captureId = ulid()
    db.prepare(`INSERT INTO captures (id, source, status) VALUES (?, ?, ?)`).run(captureId, 'email', 'staged')

    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Insert error log entry
    await logError(db, captureId, 'export', 'Export failed')

    // Verify insertion
    const initialRow = db.prepare('SELECT * FROM errors_log WHERE capture_id = ?').get(captureId) as
      | {
          id: string
          capture_id: string
          stage: string
          message: string
        }
      | undefined

    expect(initialRow).toBeDefined()
    expect(initialRow).toHaveProperty('capture_id', captureId)

    // Act: Delete the capture (should SET NULL on errors_log)
    db.prepare('DELETE FROM captures WHERE id = ?').run(captureId)

    // Assert: errors_log row should still exist but capture_id should be NULL
    const rowAfterDelete = db
      .prepare('SELECT * FROM errors_log WHERE stage = ? AND message = ?')
      .get('export', 'Export failed') as
      | {
          id: string
          capture_id: string | null
          stage: string
          message: string
        }
      | undefined

    expect(rowAfterDelete).toBeDefined()
    expect(rowAfterDelete).toHaveProperty('capture_id', null) // ON DELETE SET NULL
  })
})
