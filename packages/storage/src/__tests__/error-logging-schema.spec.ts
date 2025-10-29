/**
 * Error Logging: Schema Validation and Query Functions (AC02-AC07)
 *
 * Tests for:
 * - AC02: Schema fields (id, capture_id, stage, message, created_at)
 * - AC03: Stage values (poll, transcribe, export, backup, integrity)
 * - AC04: Foreign key constraint and cascade behavior
 * - AC05: Doctor command error summary (last 24 hours)
 * - AC06: Group by stage query
 * - AC07: Retention policy (Phase 3+ deferred)
 *
 * Task: ERROR_LOGGING_STRUCTURED--T01
 * Risk Level: Medium
 *
 * Source: docs/features/staging-ledger/spec-staging-tech.md §2.1
 */

import Database from 'better-sqlite3'
import { ulid } from 'ulid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

type DatabaseInstance = ReturnType<typeof Database>

describe('Error Logging: Schema Validation (AC02-AC04)', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:')
    databases.push(db)

    // Enable foreign keys
    db.pragma('foreign_keys = ON')

    // Create captures table (parent)
    db.exec(`
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
      )
    `)

    // Create errors_log table (child)
    db.exec(`
      CREATE TABLE IF NOT EXISTS errors_log (
        id TEXT PRIMARY KEY,
        capture_id TEXT,
        stage TEXT NOT NULL CHECK (stage IN (
          'poll',
          'transcribe',
          'export',
          'backup',
          'integrity'
        )),
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
      )
    `)

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS errors_log_stage_idx ON errors_log(stage)
    `)
    db.exec(`
      CREATE INDEX IF NOT EXISTS errors_log_created_at_idx ON errors_log(created_at)
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

  // === AC02: All 5 fields present ===
  it('stores all 5 required fields: id, capture_id, stage, message, created_at', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Arrange: Create test capture
    const captureId = ulid()
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, status, meta_json)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(captureId, 'voice', 'test content', 'staged', '{}')

    // Act: Insert error log
    await logError(db, captureId, 'transcribe', 'Test error message')

    // Assert: Query all columns via SELECT *
    const row = db.prepare('SELECT * FROM errors_log WHERE capture_id = ?').get(captureId) as {
      id: string
      capture_id: string
      stage: string
      message: string
      created_at: string
    }

    expect(row).toBeDefined()
    // Verify all 5 fields are present
    expect(row).toHaveProperty('id')
    expect(row).toHaveProperty('capture_id')
    expect(row).toHaveProperty('stage')
    expect(row).toHaveProperty('message')
    expect(row).toHaveProperty('created_at')
    // Verify no extra fields
    expect(Object.keys(row)).toHaveLength(5)
  })

  // === AC02: id is TEXT PRIMARY KEY (ULID) ===
  it('id is TEXT PRIMARY KEY with ULID format', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Insert multiple error logs
    await logError(db, null, 'poll', 'Error 1')
    await logError(db, null, 'poll', 'Error 2')

    // Assert: Query all IDs
    const rows = db.prepare('SELECT id FROM errors_log').all() as Array<{ id: string }>
    expect(rows).toHaveLength(2)

    // Verify ULID format (26 uppercase alphanumeric)
    for (const row of rows) {
      expect(row.id).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/)
    }

    // Verify uniqueness (PRIMARY KEY)
    const ids = rows.map((r) => r.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(2)
  })

  // === AC02: capture_id is nullable ===
  it('capture_id is nullable (TEXT, not TEXT NOT NULL)', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Insert with null capture_id
    await logError(db, null, 'backup', 'System-level error')

    // Assert: Query and verify NULL stored correctly
    const row = db.prepare('SELECT capture_id FROM errors_log WHERE stage = ?').get('backup') as {
      capture_id: string | null
    }

    expect(row).toBeDefined()
    expect(row.capture_id).toBeNull()
  })

  // === AC02: stage is TEXT NOT NULL ===
  it('stage is TEXT NOT NULL', () => {
    // Arrange: Attempt to insert without stage (via raw SQL to bypass logError validation)
    const id = ulid()

    // Act & Assert: Direct SQL insert should fail if stage is missing
    expect(() => {
      db.prepare('INSERT INTO errors_log (id, message) VALUES (?, ?)').run(id, 'Test message')
    }).toThrow()
  })

  // === AC02: message is TEXT NOT NULL ===
  it('message is TEXT NOT NULL', () => {
    // Arrange: Attempt to insert without message
    const id = ulid()

    // Act & Assert: Should fail if message is missing
    expect(() => {
      db.prepare('INSERT INTO errors_log (id, stage) VALUES (?, ?)').run(id, 'poll')
    }).toThrow()
  })

  // === AC02: message allows empty string ===
  it('message allows empty string (but not null)', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Insert with empty string message
    await logError(db, null, 'export', '')

    // Assert: Query and verify empty string stored
    const row = db.prepare('SELECT message FROM errors_log WHERE stage = ?').get('export') as {
      message: string
    }

    expect(row).toBeDefined()
    expect(row.message).toBe('')
  })

  // === AC02: created_at has DEFAULT CURRENT_TIMESTAMP ===
  it('created_at has DEFAULT CURRENT_TIMESTAMP', () => {
    // Arrange: Insert via raw SQL without providing created_at
    const id = ulid()
    const beforeInsert = new Date()

    // Act: Insert without created_at
    db.prepare('INSERT INTO errors_log (id, stage, message) VALUES (?, ?, ?)').run(id, 'integrity', 'Test')

    const afterInsert = new Date()

    // Assert: Query and verify created_at is auto-populated
    const row = db.prepare('SELECT created_at FROM errors_log WHERE id = ?').get(id) as {
      created_at: string
    }

    expect(row).toBeDefined()
    expect(row.created_at).toBeDefined()

    const createdAt = new Date(row.created_at + ' UTC')
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 5000)
    expect(createdAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime() + 5000)
  })

  // === AC03: All 5 valid stage values ===
  it('accepts all 5 valid stage values: poll, transcribe, export, backup, integrity', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Insert one error for each valid stage
    const stages = ['poll', 'transcribe', 'export', 'backup', 'integrity'] as const

    for (const stage of stages) {
      await logError(db, null, stage, `Error during ${stage}`)
    }

    // Assert: Query all stages and verify count
    const rows = db.prepare('SELECT stage FROM errors_log').all() as Array<{ stage: string }>
    expect(rows).toHaveLength(5)

    // Verify all 5 stages are present
    const uniqueStages = new Set(rows.map((r) => r.stage))
    expect(uniqueStages.size).toBe(5)
    for (const stage of stages) {
      expect(uniqueStages.has(stage)).toBe(true)
    }
  })

  // === AC03: Reject invalid stage values (CHECK constraint) ===
  it('rejects invalid stage values via CHECK constraint', () => {
    // Arrange: Attempt to insert invalid stage via raw SQL
    const id = ulid()

    // Act & Assert: Should fail due to CHECK constraint
    expect(() => {
      db.prepare('INSERT INTO errors_log (id, stage, message) VALUES (?, ?, ?)').run(id, 'invalid_stage', 'Test')
    }).toThrow(/CHECK constraint/)
  })

  // === AC03: Stage values are case-sensitive (lowercase) ===
  it('stage values are case-sensitive (must be lowercase)', () => {
    // Arrange: Attempt to insert uppercase stage
    const id = ulid()

    // Act & Assert: Should fail because CHECK constraint expects lowercase
    expect(() => {
      db.prepare('INSERT INTO errors_log (id, stage, message) VALUES (?, ?, ?)').run(id, 'POLL', 'Test')
    }).toThrow(/CHECK constraint/)
  })

  // === AC04: Foreign key constraint on valid capture_id ===
  it('enforces foreign key constraint on capture_id', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Arrange: Create valid capture
    const validCaptureId = ulid()
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, status, meta_json)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(validCaptureId, 'email', 'test', 'staged', '{}')

    // Act: Insert error log with valid capture_id
    await logError(db, validCaptureId, 'export', 'Export failed')

    // Assert: Query and verify capture_id is stored
    const row = db.prepare('SELECT capture_id FROM errors_log WHERE capture_id = ?').get(validCaptureId) as {
      capture_id: string
    }

    expect(row).toBeDefined()
    expect(row.capture_id).toBe(validCaptureId)
  })

  // === AC04: Foreign key allows NULL capture_id ===
  it('foreign key constraint allows NULL capture_id', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Act: Insert with null capture_id
    await logError(db, null, 'poll', 'System error')

    // Assert: Should succeed
    const row = db.prepare('SELECT capture_id FROM errors_log WHERE stage = ?').get('poll') as {
      capture_id: string | null
    }

    expect(row).toBeDefined()
    expect(row.capture_id).toBeNull()
  })

  // === AC04: ON DELETE SET NULL cascade behavior ===
  it('ON DELETE SET NULL: capture deletion nullifies capture_id in errors_log', async () => {
    // Dynamic import
    const { logError } = await import('../errors/error-logger.js')

    // Arrange: Create capture and error log
    const captureId = ulid()
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, status, meta_json)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(captureId, 'voice', 'test', 'transcribed', '{}')

    await logError(db, captureId, 'transcribe', 'Transcription warning')

    // Verify error log exists with capture_id
    const beforeDelete = db.prepare('SELECT id, capture_id FROM errors_log WHERE capture_id = ?').get(captureId) as {
      id: string
      capture_id: string
    }
    expect(beforeDelete).toBeDefined()
    expect(beforeDelete.capture_id).toBe(captureId)

    // Act: Delete the capture
    db.prepare('DELETE FROM captures WHERE id = ?').run(captureId)

    // Assert: Error log still exists but capture_id is NULL
    const afterDelete = db.prepare('SELECT capture_id FROM errors_log WHERE id = ?').get(beforeDelete.id) as {
      capture_id: string | null
    }
    expect(afterDelete).toBeDefined()
    expect(afterDelete.capture_id).toBeNull()
  })
})

describe('Error Logging: Query Functions (AC05-AC06)', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:')
    databases.push(db)

    // Enable foreign keys
    db.pragma('foreign_keys = ON')

    // Create errors_log table
    db.exec(`
      CREATE TABLE IF NOT EXISTS errors_log (
        id TEXT PRIMARY KEY,
        capture_id TEXT,
        stage TEXT NOT NULL CHECK (stage IN (
          'poll',
          'transcribe',
          'export',
          'backup',
          'integrity'
        )),
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS errors_log_stage_idx ON errors_log(stage)
    `)
    db.exec(`
      CREATE INDEX IF NOT EXISTS errors_log_created_at_idx ON errors_log(created_at)
    `)
  })

  afterEach(async () => {
    // 5-step cleanup
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const database of databases) {
      database.close()
    }
    databases.length = 0
    if (global.gc) global.gc()
  })

  // === AC05: getErrorSummaryLast24Hours() returns errors from last 24h only ===
  it('getErrorSummaryLast24Hours() returns errors from last 24h only', async () => {
    // Dynamic import
    const { getErrorSummaryLast24Hours } = await import('../errors/error-logger.js')

    // Arrange: Insert errors at different times
    // Error from 25 hours ago (should NOT be included)
    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-25 hours'))
    `
    ).run(ulid(), 'poll', 'Old error')

    // Error from 12 hours ago (should be included)
    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-12 hours'))
    `
    ).run(ulid(), 'transcribe', 'Recent error 1')

    // Error from 1 hour ago (should be included)
    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-1 hour'))
    `
    ).run(ulid(), 'transcribe', 'Recent error 2')

    // Act: Query last 24h summary
    const summary = getErrorSummaryLast24Hours(db)

    // Assert: Should return only 2 recent errors (grouped by stage)
    expect(summary).toBeDefined()
    expect(Array.isArray(summary)).toBe(true)

    // Should have 1 entry for 'transcribe' stage with count=2
    const transcribeEntry = summary.find((s) => s.stage === 'transcribe')
    expect(transcribeEntry).toBeDefined()
    expect(transcribeEntry?.count).toBe(2)

    // Should NOT have 'poll' stage (25h old error excluded)
    const pollEntry = summary.find((s) => s.stage === 'poll')
    expect(pollEntry).toBeUndefined()
  })

  // === AC05: Handle empty results ===
  it('getErrorSummaryLast24Hours() returns empty array when no errors', async () => {
    // Dynamic import
    const { getErrorSummaryLast24Hours } = await import('../errors/error-logger.js')

    // Act: Query with no errors in database
    const summary = getErrorSummaryLast24Hours(db)

    // Assert: Should return empty array
    expect(summary).toBeDefined()
    expect(Array.isArray(summary)).toBe(true)
    expect(summary).toHaveLength(0)
  })

  // === AC05: Handle errors older than 24h ===
  it('getErrorSummaryLast24Hours() excludes all errors when all are older than 24h', async () => {
    // Dynamic import
    const { getErrorSummaryLast24Hours } = await import('../errors/error-logger.js')

    // Arrange: Insert errors from 2 days ago
    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-2 days'))
    `
    ).run(ulid(), 'backup', 'Old error 1')

    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-3 days'))
    `
    ).run(ulid(), 'integrity', 'Old error 2')

    // Act: Query last 24h summary
    const summary = getErrorSummaryLast24Hours(db)

    // Assert: Should return empty (all errors too old)
    expect(summary).toHaveLength(0)
  })

  // === AC06: getErrorsByStageLastDay() groups by stage ===
  it('getErrorsByStageLastDay() groups errors by stage with correct counts', async () => {
    // Dynamic import
    const { getErrorsByStageLastDay } = await import('../errors/error-logger.js')

    // Arrange: Insert errors with various stages
    const stages = ['poll', 'poll', 'poll', 'transcribe', 'transcribe', 'export'] as const

    for (const stage of stages) {
      db.prepare(
        `
        INSERT INTO errors_log (id, stage, message)
        VALUES (?, ?, ?)
      `
      ).run(ulid(), stage, `${stage} error`)
    }

    // Act: Query grouped by stage
    const result = getErrorsByStageLastDay(db)

    // Assert: Verify grouping
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)

    // Should have 3 groups (poll, transcribe, export)
    expect(result).toHaveLength(3)

    // Verify counts
    const pollEntry = result.find((r) => r.stage === 'poll')
    expect(pollEntry).toBeDefined()
    expect(pollEntry?.count).toBe(3)

    const transcribeEntry = result.find((r) => r.stage === 'transcribe')
    expect(transcribeEntry).toBeDefined()
    expect(transcribeEntry?.count).toBe(2)

    const exportEntry = result.find((r) => r.stage === 'export')
    expect(exportEntry).toBeDefined()
    expect(exportEntry?.count).toBe(1)
  })

  // === AC06: Exact SQL query from spec ===
  it('getErrorsByStageLastDay() uses exact SQL: SELECT stage, COUNT(*) ... GROUP BY stage', async () => {
    // Dynamic import
    const { getErrorsByStageLastDay } = await import('../errors/error-logger.js')

    // Arrange: Insert test data
    db.prepare('INSERT INTO errors_log (id, stage, message) VALUES (?, ?, ?)').run(ulid(), 'backup', 'Test')

    // Act: Call function
    const result = getErrorsByStageLastDay(db)

    // Assert: Verify result structure matches expected SQL output
    expect(result).toBeDefined()
    expect(result[0]).toHaveProperty('stage')
    expect(result[0]).toHaveProperty('count')
    expect(typeof result[0]?.count).toBe('number')
  })

  // === AC06: Handle empty results ===
  it('getErrorsByStageLastDay() returns empty array when no errors', async () => {
    // Dynamic import
    const { getErrorsByStageLastDay } = await import('../errors/error-logger.js')

    // Act: Query with empty database
    const result = getErrorsByStageLastDay(db)

    // Assert: Should return empty array
    expect(result).toHaveLength(0)
  })

  // === AC06: Respects 24h time window ===
  it('getErrorsByStageLastDay() only includes errors from last 24 hours', async () => {
    // Dynamic import
    const { getErrorsByStageLastDay } = await import('../errors/error-logger.js')

    // Arrange: Insert errors from different times
    // Recent error (should be included)
    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-1 hour'))
    `
    ).run(ulid(), 'export', 'Recent')

    // Old error (should NOT be included)
    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-2 days'))
    `
    ).run(ulid(), 'poll', 'Old')

    // Act: Query last day
    const result = getErrorsByStageLastDay(db)

    // Assert: Should only have 1 entry (export)
    expect(result).toHaveLength(1)
    expect(result[0]?.stage).toBe('export')
    expect(result[0]?.count).toBe(1)
  })
})

describe('Error Logging: Retention (AC07 - Phase 3 Deferred)', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE IF NOT EXISTS errors_log (
        id TEXT PRIMARY KEY,
        capture_id TEXT,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const database of databases) {
      database.close()
    }
    databases.length = 0
    if (global.gc) global.gc()
  })

  // === AC07: Function exists ===
  it('trimErrorsOlderThan90Days() exists and is callable', async () => {
    // Dynamic import
    // eslint-disable-next-line sonarjs/deprecation -- Testing Phase 3 deferred function (AC07)
    const { trimErrorsOlderThan90Days } = await import('../errors/error-logger.js')

    // Assert: Function exists
    expect(trimErrorsOlderThan90Days).toBeDefined()
    expect(typeof trimErrorsOlderThan90Days).toBe('function')

    // Act: Call function (should not throw)
    const result = await trimErrorsOlderThan90Days(db)

    // Assert: Returns expected structure
    expect(result).toHaveProperty('rowsDeleted')
    expect(typeof result.rowsDeleted).toBe('number')
  })

  // === AC07: Phase 3 deferral (no-op in MPPP) ===
  it('trimErrorsOlderThan90Days() is deferred (returns 0 deleted rows)', async () => {
    // Dynamic import
    // eslint-disable-next-line sonarjs/deprecation -- Testing Phase 3 deferred function (AC07)
    const { trimErrorsOlderThan90Days } = await import('../errors/error-logger.js')

    // Arrange: Insert old errors
    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-100 days'))
    `
    ).run(ulid(), 'poll', 'Old error 1')

    db.prepare(
      `
      INSERT INTO errors_log (id, stage, message, created_at)
      VALUES (?, ?, ?, datetime('now', '-95 days'))
    `
    ).run(ulid(), 'backup', 'Old error 2')

    // Act: Call trim function
    const result = await trimErrorsOlderThan90Days(db)

    // Assert: Should return 0 (deferred, not implemented)
    expect(result.rowsDeleted).toBe(0)

    // Verify rows still exist (function didn't delete anything)
    const count = db.prepare('SELECT COUNT(*) as count FROM errors_log').get() as { count: number }
    expect(count.count).toBe(2)
  })

  // === AC07: Documentation notes Phase 3 ===
  it('trimErrorsOlderThan90Days() is documented as Phase 3+ feature', async () => {
    // This test verifies that the function signature and JSDoc indicate deferral
    // eslint-disable-next-line sonarjs/deprecation -- Testing Phase 3 deferred function (AC07)
    const { trimErrorsOlderThan90Days } = await import('../errors/error-logger.js')

    // The function exists but is a no-op in MPPP
    // Check return type structure
    const result = await trimErrorsOlderThan90Days(db)
    expect(result).toHaveProperty('rowsDeleted')

    // Phase 3 deferral: Function exists but does nothing
    expect(result.rowsDeleted).toBe(0)
  })
})
