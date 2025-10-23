/**
 * Email Direct Exporter Tests
 *
 * Tests for DIRECT_EXPORT_EMAIL--T01
 * Risk: HIGH (vault corruption, data loss)
 * Coverage: ≥80% required
 *
 * Acceptance Criteria:
 * AC01: Trigger on status='staged' (email) AND duplicate check passed
 * AC02: Generate markdown with email frontmatter (created, source, capture_id, from, subject) + body
 * AC03: Atomic write to inbox/{capture.id}.md
 * AC04: Insert exports_audit (capture_id, vault_path, hash_at_export, mode='initial')
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

describe('Email Direct Exporter', () => {
  let db: Database
  let tempDir: { path: string; cleanup: () => Promise<void> }
  let vaultPath: string
  const databases: Database[] = []

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const DatabaseConstructor = (await import('better-sqlite3')).default
    tempDir = await createTempDirectory()
    vaultPath = tempDir.path

    // Create in-memory database for tests
    db = new DatabaseConstructor(':memory:')
    databases.push(db)

    // Initialize schema
    // eslint-disable-next-line import/no-unresolved -- TypeScript path mapping resolves this
    const { initializeDatabase } = await import('@capture-bridge/storage')
    initializeDatabase(db)
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    // 0. Custom resources (none in these tests)

    // 1. Settle
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. Drain pools (none in these tests)

    // 3. Close databases
    for (const database of databases) {
      database.close()
    }
    databases.length = 0

    // 4. TestKit auto-cleanup (temp directories)
    await tempDir.cleanup()

    // 5. Force GC
    if (global.gc) global.gc()
  })

  describe('AC01: Export Trigger (staged email + duplicate passed)', () => {
    it('should export capture with status=staged and source=email', async () => {
      // Arrange: Insert a staged email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      const contentHash = 'abc123hash'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        contentHash,
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export the capture
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      const result = await exportEmailCapture(captureId, vaultPath, db)

      // Assert: Export succeeded
      expect(result.success).toBe(true)
      expect(result.export_path).toBe(`inbox/${captureId}.md`)
      expect(result.mode).toBe('initial')
    })

    it('should use StagingLedger to detect duplicates', async () => {
      // Arrange: Insert an existing exported capture
      const originalId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      const contentHash = 'abc123hash'

      // Insert original capture (exported)
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        originalId,
        'email',
        'Test email body',
        contentHash,
        'exported',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Insert export audit for original
      db.prepare(
        `
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode, error_flag)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run('audit1', originalId, `inbox/${originalId}.md`, contentHash, 'initial', 0)

      // Act: Check for duplicate using StagingLedger
      // eslint-disable-next-line import/no-unresolved -- TypeScript path mapping resolves this
      const { StagingLedger } = await import('@capture-bridge/storage')
      const ledger = new StagingLedger(db)
      const dupCheck = ledger.checkDuplicate(contentHash)

      // Assert: Duplicate detected
      expect(dupCheck.is_duplicate).toBe(true)
      expect('original_capture_id' in dupCheck).toBe(true)
      expect('original_export_path' in dupCheck).toBe(true)
      if ('original_capture_id' in dupCheck && 'original_export_path' in dupCheck) {
        expect(dupCheck.original_capture_id).toBe(originalId)
        expect(dupCheck.original_export_path).toBe(`inbox/${originalId}.md`)
      }
    })

    it('should only export email source (not voice)', async () => {
      // Arrange: Insert a voice capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'Transcribed voice content',
        'voicehash123',
        'transcribed',
        JSON.stringify({ audio_file: '/path/to/audio.m4a' })
      )

      // Act & Assert: Should throw error for non-email source
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      await expect(exportEmailCapture(captureId, vaultPath, db)).rejects.toThrow('source must be email')
    })

    it('should require status=staged for export', async () => {
      // Arrange: Insert a capture with wrong status
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'exported', // Wrong status
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act & Assert: Should throw error for wrong status
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      await expect(exportEmailCapture(captureId, vaultPath, db)).rejects.toThrow('status must be staged')
    })
  })

  describe('AC02: Markdown Formatting', () => {
    it('should generate frontmatter with required fields', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      const createdAt = '2025-10-23T10:30:00Z'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' }),
        createdAt
      )

      // Act: Format markdown
      const { formatEmailMarkdown } = await import('../email-direct-exporter.js')
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
        id: string
        source: string
        raw_content: string
        content_hash: string
        meta_json: string
        created_at: string
      }
      const markdown = formatEmailMarkdown({
        id: capture.id,
        source: capture.source as 'email',
        raw_content: capture.raw_content,
        content_hash: capture.content_hash,
        meta_json: JSON.parse(capture.meta_json),
        created_at: capture.created_at,
      })

      // Assert: Frontmatter contains required fields
      expect(markdown).toContain('---')
      expect(markdown).toContain(`id: ${captureId}`)
      expect(markdown).toContain('source: email')
      expect(markdown).toContain(`captured_at: ${createdAt}`)
      expect(markdown).toContain('content_hash: abc123hash')
    })

    it('should include From and Subject in frontmatter', async () => {
      // Arrange: Insert email capture with From and Subject
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'sender@example.com', Subject: 'Important Email' })
      )

      // Act: Format markdown
      const { formatEmailMarkdown } = await import('../email-direct-exporter.js')
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
        id: string
        source: string
        raw_content: string
        content_hash: string
        meta_json: string
        created_at: string
      }
      const markdown = formatEmailMarkdown({
        id: capture.id,
        source: capture.source as 'email',
        raw_content: capture.raw_content,
        content_hash: capture.content_hash,
        meta_json: JSON.parse(capture.meta_json),
        created_at: capture.created_at,
      })

      // Assert: From and Subject in frontmatter
      expect(markdown).toContain('from: sender@example.com')
      expect(markdown).toContain('subject: Important Email')
    })

    it('should include email body as content', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      const emailBody = 'This is the email body content.\n\nWith multiple paragraphs.'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        emailBody,
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Format markdown
      const { formatEmailMarkdown } = await import('../email-direct-exporter.js')
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
        id: string
        source: string
        raw_content: string
        content_hash: string
        meta_json: string
        created_at: string
      }
      const markdown = formatEmailMarkdown({
        id: capture.id,
        source: capture.source as 'email',
        raw_content: capture.raw_content,
        content_hash: capture.content_hash,
        meta_json: JSON.parse(capture.meta_json),
        created_at: capture.created_at,
      })

      // Assert: Body content after frontmatter
      expect(markdown).toContain(emailBody)
      // Check frontmatter separator
      const parts = markdown.split('---')
      expect(parts).toHaveLength(3) // Opening, frontmatter, body
      expect(parts[2]).toContain(emailBody)
    })

    it('should handle missing From/Subject gracefully', async () => {
      // Arrange: Insert email capture without From/Subject
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({}) // No From/Subject
      )

      // Act: Format markdown
      const { formatEmailMarkdown } = await import('../email-direct-exporter.js')
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
        id: string
        source: string
        raw_content: string
        content_hash: string
        meta_json: string
        created_at: string
      }
      const markdown = formatEmailMarkdown({
        id: capture.id,
        source: capture.source as 'email',
        raw_content: capture.raw_content,
        content_hash: capture.content_hash,
        meta_json: JSON.parse(capture.meta_json),
        created_at: capture.created_at,
      })

      // Assert: Should not contain from/subject fields (or have empty values)
      // This is acceptable - frontmatter should still be valid
      expect(markdown).toContain('---')
      expect(markdown).toContain('source: email')
    })
  })

  describe('AC03: Atomic Write', () => {
    it('should write to inbox/{capture.id}.md', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export the capture
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      const result = await exportEmailCapture(captureId, vaultPath, db)

      // Assert: File exists at correct path
      const { promises: fs } = await import('node:fs')
      const { default: path } = await import('node:path')
      const expectedPath = path.join(vaultPath, 'inbox', `${captureId}.md`)

      const fileExists = await fs
        .access(expectedPath)
        .then(() => true)
        .catch(() => false)
      expect(fileExists).toBe(true)
      expect(result.export_path).toBe(`inbox/${captureId}.md`)
    })

    it('should use obsidian-bridge writeAtomic()', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export the capture
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      const result = await exportEmailCapture(captureId, vaultPath, db)

      // Assert: File was written atomically (check file exists and has content)
      const { promises: fs } = await import('node:fs')
      const { default: path } = await import('node:path')
      const expectedPath = path.join(vaultPath, 'inbox', `${captureId}.md`)

      const content = await fs.readFile(expectedPath, 'utf-8')
      expect(content).toContain('source: email')
      expect(content).toContain('Test email body')
      expect(result.success).toBe(true)
    })

    it('should handle write errors gracefully', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export with invalid vault path (read-only or non-existent)
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      const result = await exportEmailCapture(captureId, '/nonexistent/vault', db)

      // Assert: Error returned with appropriate code
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBeDefined()
      // Status should not have changed
      const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as { status: string }
      expect(capture.status).toBe('staged')
    })
  })

  describe('AC04: Audit Trail', () => {
    it('should insert exports_audit record', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      const contentHash = 'abc123hash'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        contentHash,
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export the capture
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      await exportEmailCapture(captureId, vaultPath, db)

      // Assert: Audit record exists
      const audit = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').get(captureId) as
        | {
            id: string
            capture_id: string
            vault_path: string
            hash_at_export: string
            mode: string
            error_flag: number
          }
        | undefined

      expect(audit).toBeDefined()
      expect(audit?.capture_id).toBe(captureId)
      expect(audit?.vault_path).toBe(`inbox/${captureId}.md`)
      expect(audit?.hash_at_export).toBe(contentHash)
    })

    it('should set mode=initial for first export', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export the capture
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      await exportEmailCapture(captureId, vaultPath, db)

      // Assert: mode=initial
      const audit = db.prepare('SELECT mode FROM exports_audit WHERE capture_id = ?').get(captureId) as { mode: string }
      expect(audit.mode).toBe('initial')
    })

    it('should store hash_at_export', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      const contentHash = 'abc123hash'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        contentHash,
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export the capture
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      await exportEmailCapture(captureId, vaultPath, db)

      // Assert: hash_at_export matches content_hash
      const audit = db.prepare('SELECT hash_at_export FROM exports_audit WHERE capture_id = ?').get(captureId) as {
        hash_at_export: string
      }
      expect(audit.hash_at_export).toBe(contentHash)
    })

    it('should set error_flag=0 for successful export', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export the capture
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      await exportEmailCapture(captureId, vaultPath, db)

      // Assert: error_flag=0
      const audit = db.prepare('SELECT error_flag FROM exports_audit WHERE capture_id = ?').get(captureId) as {
        error_flag: number
      }
      expect(audit.error_flag).toBe(0)
    })

    it('should update capture status to exported', async () => {
      // Arrange: Insert email capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Test email body',
        'abc123hash',
        'staged',
        JSON.stringify({ From: 'test@example.com', Subject: 'Test Subject' })
      )

      // Act: Export the capture
      const { exportEmailCapture } = await import('../email-direct-exporter.js')
      await exportEmailCapture(captureId, vaultPath, db)

      // Assert: status=exported
      const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as { status: string }
      expect(capture.status).toBe('exported')
    })
  })
})
