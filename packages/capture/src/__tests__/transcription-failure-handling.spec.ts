import { describe, it, expect, afterEach } from 'vitest'

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
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

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
      const result = handleTranscriptionFailure(db, 'test-capture-1', timeoutError, 1)

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

      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.prepare(
        `INSERT INTO captures (id, status, content_hash)
         VALUES (?, ?, ?)`
      ).run('test-capture-2', 'staged', null)

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      const oomError = new Error('Memory limit exceeded')
      oomError.name = 'OOMError'

      const result = handleTranscriptionFailure(db, 'test-capture-2', oomError, 1)

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

      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

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

      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

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

      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

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

      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

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

      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

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
  })
})
