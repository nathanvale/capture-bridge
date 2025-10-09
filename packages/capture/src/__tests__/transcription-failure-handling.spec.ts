import { describe, it, expect, afterEach } from 'vitest'

// Helper function to create schema with both tables
const createSchema = (db: any) => {
  db.exec(`
    CREATE TABLE captures (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      content_hash TEXT,
      meta_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.exec(`
    CREATE TABLE errors_log (
      id TEXT PRIMARY KEY,
      capture_id TEXT,
      operation TEXT NOT NULL CHECK (operation IN ('voice_poll', 'email_poll', 'transcribe', 'export', 'gmail_auth', 'cursor_bootstrap')),
      error_type TEXT NOT NULL,
      error_message TEXT NOT NULL,
      stack_trace TEXT,
      context_json TEXT DEFAULT '{}',
      attempt_count INTEGER NOT NULL DEFAULT 1,
      escalation_action TEXT,
      dlq INTEGER NOT NULL DEFAULT 0 CHECK (dlq IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
    )
  `)
}

describe('Transcription Failure Handling', () => {
  const databases: any[] = []

  afterEach(async () => {
    // 5-step cleanup sequence
    await new Promise((resolve) => setTimeout(resolve, 100)) // 1. Settle

    // Skip pools - none used here

    // 3. Close databases
    for (const db of databases) {
      try {
        if (db.open && !db.readonly) db.close()
      } catch {
        // Safe to ignore cleanup errors
      }
    }
    databases.length = 0

    // 4. TestKit auto-cleanup (temp directories)
    // 5. Force GC
    if (global.gc) global.gc()
  })

  describe('handleTranscriptionFailure', () => {
    it('should update status to failed_transcription on TIMEOUT error', async () => {
      // Setup in-memory database
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      createSchema(db)

      // Insert test capture
      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-1', 'staged', null)

      // Import the handler (will fail since it doesn't exist yet)
      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      // Create timeout error
      const timeoutError = new Error('Transcription timeout')
      timeoutError.name = 'TimeoutError'

      // Call handler
      const result = await handleTranscriptionFailure(db, 'test-capture-1', timeoutError, 1)

      // Verify database was updated
      const capture = db
        .prepare('SELECT status, content_hash, meta_json FROM captures WHERE id = ?')
        .get('test-capture-1') as {
        status: string
        content_hash: string | null
        meta_json: string
      }

      expect(capture.status).toBe('failed_transcription')
      expect(capture.content_hash).toBeNull() // Per ADR-0006 late hash binding
      const meta = JSON.parse(capture.meta_json)
      expect(meta.error).toMatchObject({
        type: 'timeout',
        message: 'Transcription timeout',
        attemptCount: 1,
      })

      // Verify return value
      expect(result).toMatchObject({
        success: false,
        errorType: 'timeout',
        captureId: 'test-capture-1',
      })
    })

    it('should update status to failed_transcription on OOM error', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      createSchema(db)

      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-2', 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const oomError = new Error('Memory limit exceeded')
      oomError.name = 'OOMError'

      const result = await handleTranscriptionFailure(db, 'test-capture-2', oomError, 1)

      const capture = db
        .prepare('SELECT status, content_hash, meta_json FROM captures WHERE id = ?')
        .get('test-capture-2') as {
        status: string
        content_hash: string | null
        meta_json: string
      }

      expect(capture.status).toBe('failed_transcription')
      expect(capture.content_hash).toBeNull()
      const meta = JSON.parse(capture.meta_json)
      expect(meta.error).toMatchObject({
        type: 'oom',
        message: 'Memory limit exceeded',
        attemptCount: 1,
      })

      expect(result).toMatchObject({
        success: false,
        errorType: 'oom',
        captureId: 'test-capture-2',
      })
    })

    it('should update status to failed_transcription on CORRUPT_AUDIO error', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      createSchema(db)

      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-3', 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const corruptError = new Error('Invalid audio format')

      const result = await handleTranscriptionFailure(db, 'test-capture-3', corruptError, 1)

      const capture = db
        .prepare('SELECT status, content_hash, meta_json FROM captures WHERE id = ?')
        .get('test-capture-3') as {
        status: string
        content_hash: string | null
        meta_json: string
      }

      expect(capture.status).toBe('failed_transcription')
      expect(capture.content_hash).toBeNull()
      const meta = JSON.parse(capture.meta_json)
      expect(meta.error).toMatchObject({
        type: 'corrupt_audio',
        message: 'Invalid audio format',
        attemptCount: 1,
      })

      expect(result).toMatchObject({
        success: false,
        errorType: 'corrupt_audio',
        captureId: 'test-capture-3',
      })
    })

    it('should update status to failed_transcription on FILE_NOT_FOUND error', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      createSchema(db)

      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-4', 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const notFoundError = new Error('ENOENT: no such file or directory')

      const result = await handleTranscriptionFailure(db, 'test-capture-4', notFoundError, 1)

      const capture = db
        .prepare('SELECT status, content_hash, meta_json FROM captures WHERE id = ?')
        .get('test-capture-4') as {
        status: string
        content_hash: string | null
        meta_json: string
      }

      expect(capture.status).toBe('failed_transcription')
      expect(capture.content_hash).toBeNull()
      const meta = JSON.parse(capture.meta_json)
      expect(meta.error).toMatchObject({
        type: 'file_not_found',
        message: 'ENOENT: no such file or directory',
        attemptCount: 1,
      })

      expect(result).toMatchObject({
        success: false,
        errorType: 'file_not_found',
        captureId: 'test-capture-4',
      })
    })

    it('should update status to failed_transcription on WHISPER_ERROR', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      createSchema(db)

      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-5', 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const whisperError = new Error('Whisper transcription failed')

      const result = await handleTranscriptionFailure(db, 'test-capture-5', whisperError, 2)

      const capture = db
        .prepare('SELECT status, content_hash, meta_json FROM captures WHERE id = ?')
        .get('test-capture-5') as {
        status: string
        content_hash: string | null
        meta_json: string
      }

      expect(capture.status).toBe('failed_transcription')
      expect(capture.content_hash).toBeNull()
      const meta = JSON.parse(capture.meta_json)
      expect(meta.error).toMatchObject({
        type: 'whisper_error',
        message: 'Whisper transcription failed',
        attemptCount: 2,
      })

      expect(result).toMatchObject({
        success: false,
        errorType: 'whisper_error',
        captureId: 'test-capture-5',
      })
    })

    it('should preserve existing meta_json fields when adding error', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      createSchema(db)

      // Insert capture with existing meta_json
      const existingMeta = { source: 'voice', duration: 45 }
      db.prepare(
        `INSERT INTO captures (id, status, content_hash, meta_json)
         VALUES (?, ?, ?, ?)`
      ).run('test-capture-6', 'staged', null, JSON.stringify(existingMeta))

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const error = new Error('Unknown error')
      const result = await handleTranscriptionFailure(db, 'test-capture-6', error, 1)

      const capture = db.prepare('SELECT meta_json FROM captures WHERE id = ?').get('test-capture-6') as {
        meta_json: string
      }

      const meta = JSON.parse(capture.meta_json)
      expect(meta.source).toBe('voice') // Original field preserved
      expect(meta.duration).toBe(45) // Original field preserved
      expect(meta.error).toMatchObject({
        type: 'unknown',
        message: 'Unknown error',
        attemptCount: 1,
      })

      expect(result.errorType).toBe('unknown')
    })

    it('should handle SQL injection attempts safely', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      createSchema(db)

      // Malicious capture ID with SQL injection attempt
      const maliciousId = "'; DROP TABLE captures; --"
      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run(maliciousId, 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const error = new Error('Test error')
      const result = await handleTranscriptionFailure(db, maliciousId, error, 1)

      // Verify table still exists and was updated correctly
      const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(maliciousId) as { status: string }

      expect(capture.status).toBe('failed_transcription')
      expect(result.captureId).toBe(maliciousId)

      // Verify table wasn't dropped
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='captures'").get() as
        | { name: string }
        | undefined
      expect(tableCheck?.name).toBe('captures')
    })

    it('should insert errors_log record on transcription failure', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema with full errors_log table
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE errors_log (
          id TEXT PRIMARY KEY,
          capture_id TEXT,
          operation TEXT NOT NULL CHECK (operation IN ('voice_poll', 'email_poll', 'transcribe', 'export', 'gmail_auth', 'cursor_bootstrap')),
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          context_json TEXT DEFAULT '{}',
          attempt_count INTEGER NOT NULL DEFAULT 1,
          escalation_action TEXT,
          dlq INTEGER NOT NULL DEFAULT 0 CHECK (dlq IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
        )
      `)

      // Insert test capture
      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-errors-1', 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      // Create a timeout error
      const timeoutError = new Error('Transcription timeout after 30s')
      timeoutError.name = 'TimeoutError'
      timeoutError.stack = 'Error: Transcription timeout after 30s\n    at Timeout._onTimeout (/test.js:10:5)'

      // Call handler
      await handleTranscriptionFailure(db, 'test-capture-errors-1', timeoutError, 1)

      // Verify errors_log was inserted
      const errorLog = db.prepare('SELECT * FROM errors_log WHERE capture_id = ?').get('test-capture-errors-1') as {
        id: string
        capture_id: string
        operation: string
        error_type: string
        error_message: string
        stack_trace: string | null
        context_json: string
        attempt_count: number
        escalation_action: string | null
        dlq: number
        created_at: string
      }

      expect(errorLog).toBeDefined()
      expect(errorLog.id).toMatch(/^[0-9A-Z]{26}$/) // ULID format
      expect(errorLog.capture_id).toBe('test-capture-errors-1')
      expect(errorLog.operation).toBe('transcribe')
      expect(errorLog.error_type).toBe('timeout')
      expect(errorLog.error_message).toBe('Transcription timeout after 30s')
      expect(errorLog.stack_trace).toBe(
        'Error: Transcription timeout after 30s\n    at Timeout._onTimeout (/test.js:10:5)'
      )
      expect(errorLog.attempt_count).toBe(1)
      expect(errorLog.escalation_action).toBeNull() // Retriable error
      expect(errorLog.dlq).toBe(0) // Not in DLQ (retriable)
      expect(errorLog.created_at).toBeDefined()

      // Verify capture was updated too
      const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get('test-capture-errors-1') as {
        status: string
      }
      expect(capture.status).toBe('failed_transcription')
    })

    it('should set dlq=1 for permanent errors (corrupt_audio, oom)', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE errors_log (
          id TEXT PRIMARY KEY,
          capture_id TEXT,
          operation TEXT NOT NULL CHECK (operation IN ('voice_poll', 'email_poll', 'transcribe', 'export', 'gmail_auth', 'cursor_bootstrap')),
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          context_json TEXT DEFAULT '{}',
          attempt_count INTEGER NOT NULL DEFAULT 1,
          escalation_action TEXT,
          dlq INTEGER NOT NULL DEFAULT 0 CHECK (dlq IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
        )
      `)

      // Test OOM error (permanent)
      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-oom', 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const oomError = new Error('JavaScript heap out of memory')
      oomError.name = 'OOMError'

      await handleTranscriptionFailure(db, 'test-capture-oom', oomError, 3)

      const oomLog = db
        .prepare('SELECT error_type, escalation_action, dlq FROM errors_log WHERE capture_id = ?')
        .get('test-capture-oom') as {
        error_type: string
        escalation_action: string | null
        dlq: number
      }

      expect(oomLog.error_type).toBe('oom')
      expect(oomLog.escalation_action).toBe('export_placeholder')
      expect(oomLog.dlq).toBe(1) // Permanent error, in DLQ

      // Test corrupt_audio error (permanent)
      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-corrupt', 'staged', null)

      const corruptError = new Error('Invalid audio format detected')
      await handleTranscriptionFailure(db, 'test-capture-corrupt', corruptError, 2)

      const corruptLog = db
        .prepare('SELECT error_type, escalation_action, dlq FROM errors_log WHERE capture_id = ?')
        .get('test-capture-corrupt') as {
        error_type: string
        escalation_action: string | null
        dlq: number
      }

      expect(corruptLog.error_type).toBe('corrupt_audio')
      expect(corruptLog.escalation_action).toBe('export_placeholder')
      expect(corruptLog.dlq).toBe(1) // Permanent error, in DLQ
    })

    it('should include context_json with additional metadata', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE errors_log (
          id TEXT PRIMARY KEY,
          capture_id TEXT,
          operation TEXT NOT NULL CHECK (operation IN ('voice_poll', 'email_poll', 'transcribe', 'export', 'gmail_auth', 'cursor_bootstrap')),
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          context_json TEXT DEFAULT '{}',
          attempt_count INTEGER NOT NULL DEFAULT 1,
          escalation_action TEXT,
          dlq INTEGER NOT NULL DEFAULT 0 CHECK (dlq IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
        )
      `)

      // Insert capture with metadata
      const captureMeta = {
        source: 'voice',
        file_path: '/path/to/audio.m4a',
        duration: 120,
      }
      db.prepare(
        `INSERT INTO captures (id, status, content_hash, meta_json)
         VALUES (?, ?, ?, ?)`
      ).run('test-capture-context', 'staged', null, JSON.stringify(captureMeta))

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const error = new Error('Model load failure')
      await handleTranscriptionFailure(db, 'test-capture-context', error, 1)

      const errorLog = db
        .prepare('SELECT context_json FROM errors_log WHERE capture_id = ?')
        .get('test-capture-context') as { context_json: string }

      const context = JSON.parse(errorLog.context_json)
      expect(context).toMatchObject({
        source: 'voice',
        file_path: '/path/to/audio.m4a',
        duration: 120,
      })
    })

    it('should handle FOREIGN KEY constraint with ON DELETE SET NULL', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Enable foreign keys
      db.pragma('foreign_keys = ON')

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE errors_log (
          id TEXT PRIMARY KEY,
          capture_id TEXT,
          operation TEXT NOT NULL CHECK (operation IN ('voice_poll', 'email_poll', 'transcribe', 'export', 'gmail_auth', 'cursor_bootstrap')),
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          context_json TEXT DEFAULT '{}',
          attempt_count INTEGER NOT NULL DEFAULT 1,
          escalation_action TEXT,
          dlq INTEGER NOT NULL DEFAULT 0 CHECK (dlq IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
        )
      `)

      // Insert and handle failure
      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-fk', 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')
      await handleTranscriptionFailure(db, 'test-capture-fk', new Error('test'), 1)

      // Verify error log exists
      const errorCount = db
        .prepare('SELECT COUNT(*) as count FROM errors_log WHERE capture_id = ?')
        .get('test-capture-fk') as { count: number }
      expect(errorCount.count).toBe(1)

      // Delete the capture
      db.prepare('DELETE FROM captures WHERE id = ?').run('test-capture-fk')

      // Verify error log still exists but with NULL capture_id
      const errorLog = db.prepare('SELECT capture_id FROM errors_log').get() as { capture_id: string | null }
      expect(errorLog.capture_id).toBeNull() // ON DELETE SET NULL
    })
  })
})
