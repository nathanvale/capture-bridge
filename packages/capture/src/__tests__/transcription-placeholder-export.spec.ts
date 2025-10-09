import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Transcription Placeholder Export [AC08]', () => {
  let testDir: string
  const databases: any[] = []

  beforeEach(async () => {
    // Create temp directory for vault
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    testDir = tempDir.path
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    await new Promise((resolve) => setTimeout(resolve, 100)) // 1. Settle

    // 2. No pools in this test

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

  describe('exportPlaceholder', () => {
    it('should export placeholder markdown file to vault on permanent transcription failure', async () => {
      // Setup database
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE exports_audit (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL,
          vault_path TEXT NOT NULL,
          hash_at_export TEXT,
          exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          mode TEXT,
          error_flag INTEGER DEFAULT 0,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
        )
      `)

      // Insert test capture with failed transcription
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const createdAt = new Date('2025-09-27T10:30:00Z').toISOString()
      const meta = {
        file_path: '/path/to/audio.m4a',
        attempt_count: 3,
        error: {
          type: 'oom',
          message: 'JavaScript heap out of memory',
        },
      }

      db.prepare(
        `INSERT INTO captures (id, source, status, content_hash, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(captureId, 'voice', 'failed_transcription', null, JSON.stringify(meta), createdAt)

      // Import exportPlaceholder function (will fail initially - RED phase)
      const { exportPlaceholder } = await import('../transcription/failure-handler.js')

      // Call exportPlaceholder
      await exportPlaceholder(db, captureId, 'oom', testDir)

      // Verify placeholder file was created
      const exportPath = join(testDir, 'inbox', `${captureId}.md`)
      const fileExists = await fs
        .access(exportPath)
        .then(() => true)
        .catch(() => false)
      expect(fileExists).toBe(true)

      // Read and verify placeholder content
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const content = await fs.readFile(exportPath, 'utf-8')
      expect(content).toContain('[TRANSCRIPTION_FAILED: oom]')
      expect(content).toContain(`Capture ID: ${captureId}`)
      expect(content).toContain('Source: voice')
      expect(content).toContain('JavaScript heap out of memory')
      expect(content).toContain('Attempts: 3')
      expect(content).toContain('Captured At: 2025-09-27T10:30:00.000Z')
      expect(content).toContain('This placeholder is PERMANENT and cannot be retried in MPPP')

      // Verify capture status was updated
      const capture = db.prepare('SELECT status, raw_content FROM captures WHERE id = ?').get(captureId) as {
        status: string
        raw_content: string
      }
      expect(capture.status).toBe('exported_placeholder')
      expect(capture.raw_content).toContain('[TRANSCRIPTION_FAILED: oom]')

      // Verify exports_audit record was created
      const audit = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').get(captureId) as {
        capture_id: string
        vault_path: string
        hash_at_export: string | null
        mode: string
        error_flag: number
      }
      expect(audit).toBeDefined()
      expect(audit.capture_id).toBe(captureId)
      expect(audit.vault_path).toBe(`inbox/${captureId}.md`)
      expect(audit.hash_at_export).toBeNull() // NULL for placeholder per spec
      expect(audit.mode).toBe('placeholder')
      expect(audit.error_flag).toBe(1)
    })

    it('should format placeholder with correct error details for corrupt_audio', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE exports_audit (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL,
          vault_path TEXT NOT NULL,
          hash_at_export TEXT,
          exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          mode TEXT,
          error_flag INTEGER DEFAULT 0,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
        )
      `)

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9SZ'
      const meta = {
        file_path: '/Users/test/voice.m4a',
        attempt_count: 2,
        error: {
          type: 'corrupt_audio',
          message: 'Invalid audio format detected',
        },
      }

      db.prepare(
        `INSERT INTO captures (id, source, status, meta_json)
         VALUES (?, ?, ?, ?)`
      ).run(captureId, 'voice', 'failed_transcription', JSON.stringify(meta))

      const { exportPlaceholder } = await import('../transcription/failure-handler.js')

      await exportPlaceholder(db, captureId, 'corrupt_audio', testDir)

      const exportPath = join(testDir, 'inbox', `${captureId}.md`)
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const content = await fs.readFile(exportPath, 'utf-8')

      expect(content).toContain('[TRANSCRIPTION_FAILED: corrupt_audio]')
      expect(content).toContain('Invalid audio format detected')
      expect(content).toContain('Attempts: 2')
      expect(content).toContain('/Users/test/voice.m4a')
    })

    it('should use atomic write pattern (temp file then rename)', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE exports_audit (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL,
          vault_path TEXT NOT NULL,
          hash_at_export TEXT,
          exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          mode TEXT,
          error_flag INTEGER DEFAULT 0,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
        )
      `)

      const captureId = '01HZVM8YWRQT5J3M3K7YPTXAZ'
      db.prepare(
        `INSERT INTO captures (id, source, status, meta_json)
         VALUES (?, ?, ?, ?)`
      ).run(captureId, 'voice', 'failed_transcription', '{}')

      // Mock fs operations to track temp file usage
      const fsOperations: string[] = []
      const originalWriteFile = fs.writeFile
      const originalRename = fs.rename

      // Track writeFile calls
      // eslint-disable-next-line require-await
      fs.writeFile = async (path: any, data: any, options?: any) => {
        fsOperations.push(`write:${path}`)
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        return originalWriteFile(path, data, options)
      }

      // Track rename calls
      // eslint-disable-next-line require-await
      fs.rename = async (oldPath: any, newPath: any) => {
        fsOperations.push(`rename:${oldPath}:${newPath}`)
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        return originalRename(oldPath, newPath)
      }

      try {
        const { exportPlaceholder } = await import('../transcription/failure-handler.js')
        await exportPlaceholder(db, captureId, 'oom', testDir)

        // Verify atomic write pattern was used
        const tempDir = join(testDir, '.trash')
        const finalPath = join(testDir, 'inbox', `${captureId}.md`)

        // Should write to temp first, then rename (temp file includes timestamp)
        const writeOp = fsOperations.find(
          (op) => op.startsWith(`write:${tempDir}/${captureId}-`) && op.endsWith('.tmp')
        )
        expect(writeOp).toBeDefined()
        if (!writeOp) throw new Error('Write operation not found')

        const tempPath = writeOp.replace('write:', '')
        expect(fsOperations).toContain(`rename:${tempPath}:${finalPath}`)

        // Verify order: write before rename
        const writeIndex = fsOperations.findIndex((op) => op.startsWith(`write:${tempDir}/${captureId}-`))
        const renameIndex = fsOperations.findIndex((op) => op.startsWith(`rename:${tempPath}`))
        expect(writeIndex).toBeLessThan(renameIndex)
      } finally {
        // Restore original fs methods
        fs.writeFile = originalWriteFile
        fs.rename = originalRename
      }
    })

    it('should handle file system errors gracefully', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      const captureId = '01HZVM8YWRQT5J3M3K7YPTXBZ'
      db.prepare(
        `INSERT INTO captures (id, source, status, meta_json)
         VALUES (?, ?, ?, ?)`
      ).run(captureId, 'voice', 'failed_transcription', '{}')

      // Make vault directory read-only to simulate permission error
      const readOnlyDir = join(testDir, 'readonly')
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.mkdir(readOnlyDir)
      // eslint-disable-next-line security/detect-non-literal-fs-filename, sonarjs/file-permissions
      await fs.chmod(readOnlyDir, 0o444) // Read-only - safe for testing

      const { exportPlaceholder } = await import('../transcription/failure-handler.js')

      // Should throw error for unwritable vault
      await expect(exportPlaceholder(db, captureId, 'oom', readOnlyDir)).rejects.toThrow()

      // Restore permissions for cleanup
      // eslint-disable-next-line security/detect-non-literal-fs-filename, sonarjs/file-permissions
      await fs.chmod(readOnlyDir, 0o755)
    })

    it('should integrate with handleTranscriptionFailure for permanent errors', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create full schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE exports_audit (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL,
          vault_path TEXT NOT NULL,
          hash_at_export TEXT,
          exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          mode TEXT,
          error_flag INTEGER DEFAULT 0,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
        )
      `)

      db.exec(`
        CREATE TABLE errors_log (
          id TEXT PRIMARY KEY,
          capture_id TEXT,
          operation TEXT NOT NULL,
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

      const captureId = '01HZVM8YWRQT5J3M3K7YPTXCZ'
      db.prepare(
        `INSERT INTO captures (id, source, status)
         VALUES (?, ?, ?)`
      ).run(captureId, 'voice', 'staged')

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      // Create OOM error (permanent)
      const oomError = new Error('JavaScript heap out of memory')
      oomError.name = 'OOMError'

      // Call handleTranscriptionFailure with vault path for placeholder export
      const result = await handleTranscriptionFailure(db, captureId, oomError, 3, testDir)

      expect(result.success).toBe(false)
      expect(result.errorType).toBe('oom')

      // Verify placeholder was exported
      const exportPath = join(testDir, 'inbox', `${captureId}.md`)
      const fileExists = await fs
        .access(exportPath)
        .then(() => true)
        .catch(() => false)
      expect(fileExists).toBe(true)

      // Verify status is now exported_placeholder
      const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as { status: string }
      expect(capture.status).toBe('exported_placeholder')

      // Verify exports_audit record
      const audit = db.prepare('SELECT mode, error_flag FROM exports_audit WHERE capture_id = ?').get(captureId) as {
        mode: string
        error_flag: number
      }
      expect(audit.mode).toBe('placeholder')
      expect(audit.error_flag).toBe(1)
    })

    it('should not export placeholder for retriable errors (timeout, file_not_found)', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE errors_log (
          id TEXT PRIMARY KEY,
          capture_id TEXT,
          operation TEXT NOT NULL,
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

      const captureId = '01HZVM8YWRQT5J3M3K7YPTXDZ'
      db.prepare(
        `INSERT INTO captures (id, source, status)
         VALUES (?, ?, ?)`
      ).run(captureId, 'voice', 'staged')

      const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

      // Create timeout error (retriable)
      const timeoutError = new Error('Transcription timeout')
      timeoutError.name = 'TimeoutError'

      // Call without vault path since retriable errors shouldn't export
      const result = await handleTranscriptionFailure(db, captureId, timeoutError, 1)

      expect(result.success).toBe(false)
      expect(result.errorType).toBe('timeout')

      // Verify status is failed_transcription (not exported_placeholder)
      const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as { status: string }
      expect(capture.status).toBe('failed_transcription')

      // Verify no file was created
      const exportPath = join(testDir, 'inbox', `${captureId}.md`)
      const fileExists = await fs
        .access(exportPath)
        .then(() => true)
        .catch(() => false)
      expect(fileExists).toBe(false)
    })

    it('should include ULID generation for exports_audit record', async () => {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          meta_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE TABLE exports_audit (
          id TEXT PRIMARY KEY,
          capture_id TEXT NOT NULL,
          vault_path TEXT NOT NULL,
          hash_at_export TEXT,
          exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          mode TEXT,
          error_flag INTEGER DEFAULT 0,
          FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
        )
      `)

      const captureId = '01HZVM8YWRQT5J3M3K7YPTXEZ'
      db.prepare(
        `INSERT INTO captures (id, source, status, meta_json)
         VALUES (?, ?, ?, ?)`
      ).run(captureId, 'voice', 'failed_transcription', '{}')

      const { exportPlaceholder } = await import('../transcription/failure-handler.js')
      await exportPlaceholder(db, captureId, 'oom', testDir)

      // Verify audit record has valid ULID
      const audit = db.prepare('SELECT id FROM exports_audit WHERE capture_id = ?').get(captureId) as { id: string }
      expect(audit.id).toMatch(/^[0-9A-Z]{26}$/) // ULID format
    })
  })
})
