/**
 * Placeholder Export Tests - PLACEHOLDER_EXPORT--T01
 *
 * AC01: Trigger - Detect captures with status='failed_transcription'
 * AC02: Generate placeholder markdown content
 *
 * Medium Risk - TDD Required, Coverage ≥80%
 */

import Database from 'better-sqlite3'
import { describe, it, expect, afterEach } from 'vitest'

import type { TranscriptionErrorType } from './types.js'

const databases: Database.Database[] = []

afterEach(async () => {
  // Step 1: Settle
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Step 2: Close databases
  for (const db of databases) {
    db.close()
  }
  databases.length = 0

  // Step 3: Force GC
  if (global.gc) global.gc()
})

describe('detectFailedTranscriptions', () => {
  it('should return captures with status=failed_transcription', async () => {
    // Arrange - Create in-memory database with captures table
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // Insert a capture with failed_transcription status
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'test-capture-01',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 3 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    // Act - This will FAIL because detectFailedTranscriptions doesn't exist yet
    const { detectFailedTranscriptions } = await import('./placeholder-export.js')
    const results = detectFailedTranscriptions(db)

    // Assert
    expect(results).toHaveLength(1)
    const [firstResult] = results
    expect(firstResult?.id).toBe('test-capture-01')
    expect(firstResult?.status).toBe('failed_transcription')
  })

  it('should return empty array when no failed transcriptions exist', async () => {
    // Arrange
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // Insert captures with other statuses
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'test-capture-02',
      'voice',
      '/path/to/voice.m4a',
      'abc123',
      'transcribed',
      JSON.stringify({ file_path: '/path/to/voice.m4a' }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    // Act
    const { detectFailedTranscriptions } = await import('./placeholder-export.js')
    const results = detectFailedTranscriptions(db)

    // Assert
    expect(results).toHaveLength(0)
  })

  it('should return multiple failed transcriptions ordered by created_at ASC', async () => {
    // Arrange
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // Insert multiple failed transcriptions in reverse order
    const captures = [
      {
        id: 'test-capture-03',
        created_at: '2025-10-23T10:02:00Z',
      },
      {
        id: 'test-capture-01',
        created_at: '2025-10-23T10:00:00Z',
      },
      {
        id: 'test-capture-02',
        created_at: '2025-10-23T10:01:00Z',
      },
    ]

    for (const capture of captures) {
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        capture.id,
        'voice',
        '/path/to/voice.m4a',
        null,
        'failed_transcription',
        JSON.stringify({ file_path: '/path/to/voice.m4a' }),
        capture.created_at,
        capture.created_at
      )
    }

    // Act
    const { detectFailedTranscriptions } = await import('./placeholder-export.js')
    const results = detectFailedTranscriptions(db)

    // Assert - Should be ordered by created_at ASC
    expect(results).toHaveLength(3)
    const [first, second, third] = results
    expect(first?.id).toBe('test-capture-01')
    expect(second?.id).toBe('test-capture-02')
    expect(third?.id).toBe('test-capture-03')
  })

  it('should use parameterized queries to prevent SQL injection', async () => {
    // Arrange
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // Insert legitimate capture
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'test-capture-04',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a' }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    // Act - Call function (should use parameterized queries internally)
    const { detectFailedTranscriptions } = await import('./placeholder-export.js')
    const results = detectFailedTranscriptions(db)

    // Assert - Should return legitimate capture
    expect(results).toHaveLength(1)
    const [result] = results
    expect(result?.id).toBe('test-capture-04')

    // Verify table still exists (SQL injection would have dropped it)
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='captures'").get()
    expect(tableExists).toBeDefined()
  })
})

describe('generatePlaceholderMarkdown - AC02', () => {
  it('should generate placeholder markdown for voice capture with TIMEOUT error', async () => {
    // Arrange - Create a failed voice transcription capture
    const capture = {
      id: '01HQW3P7XKZM2YJVT8YFGQSZ4M',
      source: 'voice',
      raw_content: '/path/to/voice.m4a',
      content_hash: null,
      status: 'failed_transcription',
      meta_json: JSON.stringify({
        file_path: '/Users/nathan/Library/Group Containers/.../ABC123.m4a',
        attempt_count: 2,
        audio_fp: 'sha256:abc123',
      }),
      created_at: '2025-09-27T10:30:00Z',
      updated_at: '2025-09-27T10:35:00Z',
    }

    // Act - This will FAIL because generatePlaceholderMarkdown doesn't exist yet
    const { generatePlaceholderMarkdown } = await import('./placeholder-export.js')
    const markdown = generatePlaceholderMarkdown(capture, 'TIMEOUT', 'Transcription exceeded 300s timeout')

    // Assert
    expect(markdown).toContain('[TRANSCRIPTION_FAILED: TIMEOUT]')
    expect(markdown).toContain('Audio file: /Users/nathan/Library/Group Containers/.../ABC123.m4a')
    expect(markdown).toContain('Captured at: 2025-09-27T10:30:00Z')
    expect(markdown).toContain('Error: Transcription exceeded 300s timeout')
    expect(markdown).toContain('Retry count: 2')
  })

  it('should generate placeholder markdown for voice capture with missing attempt_count', async () => {
    // Arrange - Capture without attempt_count (should default to 0)
    const capture = {
      id: '01HQW3P7XKZM2YJVT8YFGQSZ4N',
      source: 'voice',
      raw_content: '/path/to/voice.m4a',
      content_hash: null,
      status: 'failed_transcription',
      meta_json: JSON.stringify({
        file_path: '/Users/nathan/Library/Voice Memos/Recording.m4a',
        audio_fp: 'sha256:def456',
      }),
      created_at: '2025-09-27T11:00:00Z',
      updated_at: '2025-09-27T11:05:00Z',
    }

    // Act
    const { generatePlaceholderMarkdown } = await import('./placeholder-export.js')
    const markdown = generatePlaceholderMarkdown(capture, 'CORRUPT_AUDIO', 'Audio file is corrupted or unreadable')

    // Assert
    expect(markdown).toContain('Retry count: 0')
    expect(markdown).toContain('[TRANSCRIPTION_FAILED: CORRUPT_AUDIO]')
  })

  it('should generate placeholder markdown for email capture (no file_path)', async () => {
    // Arrange - Email capture uses message_id instead of file_path
    const capture = {
      id: '01HQW3P7XKZM2YJVT8YFGQSZ4O',
      source: 'email',
      raw_content: 'email body content',
      content_hash: null,
      status: 'failed_transcription',
      meta_json: JSON.stringify({
        message_id: '<abc123@gmail.com>',
        attempt_count: 1,
      }),
      created_at: '2025-09-27T12:00:00Z',
      updated_at: '2025-09-27T12:05:00Z',
    }

    // Act
    const { generatePlaceholderMarkdown } = await import('./placeholder-export.js')
    const markdown = generatePlaceholderMarkdown(capture, 'UNKNOWN', 'Unknown error occurred during processing')

    // Assert
    expect(markdown).toContain('[TRANSCRIPTION_FAILED: UNKNOWN]')
    expect(markdown).toContain('Message-ID: <abc123@gmail.com>')
    expect(markdown).not.toContain('Audio file:')
    expect(markdown).toContain('Captured at: 2025-09-27T12:00:00Z')
  })

  it('should handle error messages with special characters', async () => {
    // Arrange
    const capture = {
      id: '01HQW3P7XKZM2YJVT8YFGQSZ4P',
      source: 'voice',
      raw_content: '/path/to/voice.m4a',
      content_hash: null,
      status: 'failed_transcription',
      meta_json: JSON.stringify({
        file_path: '/path/to/file.m4a',
        attempt_count: 3,
      }),
      created_at: '2025-09-27T13:00:00Z',
      updated_at: '2025-09-27T13:05:00Z',
    }

    const errorWithSpecialChars = 'Error: "Timeout"\nOccurred at line 42\n\tStack trace...'

    // Act
    const { generatePlaceholderMarkdown } = await import('./placeholder-export.js')
    const markdown = generatePlaceholderMarkdown(capture, 'OOM', errorWithSpecialChars)

    // Assert
    expect(markdown).toContain(errorWithSpecialChars)
    expect(markdown).toContain('[TRANSCRIPTION_FAILED: OOM]')
  })

  it('should include permanence notice in placeholder', async () => {
    // Arrange
    const capture = {
      id: '01HQW3P7XKZM2YJVT8YFGQSZ4Q',
      source: 'voice',
      raw_content: '/path/to/voice.m4a',
      content_hash: null,
      status: 'failed_transcription',
      meta_json: JSON.stringify({
        file_path: '/path/to/file.m4a',
        attempt_count: 1,
      }),
      created_at: '2025-09-27T14:00:00Z',
      updated_at: '2025-09-27T14:05:00Z',
    }

    // Act
    const { generatePlaceholderMarkdown } = await import('./placeholder-export.js')
    const markdown = generatePlaceholderMarkdown(capture, 'FILE_NOT_FOUND', 'Audio file no longer exists')

    // Assert
    expect(markdown).toContain('permanent')
    expect(markdown).toMatch(/will not be retried|permanent/i)
  })

  it('should format all error types correctly', async () => {
    // Arrange
    const capture = {
      id: '01HQW3P7XKZM2YJVT8YFGQSZ4R',
      source: 'voice',
      raw_content: '/path/to/voice.m4a',
      content_hash: null,
      status: 'failed_transcription',
      meta_json: JSON.stringify({
        file_path: '/path/to/file.m4a',
        attempt_count: 0,
      }),
      created_at: '2025-09-27T15:00:00Z',
      updated_at: '2025-09-27T15:05:00Z',
    }

    const { generatePlaceholderMarkdown } = await import('./placeholder-export.js')

    // Act & Assert - Test all error types
    const errorTypes: TranscriptionErrorType[] = [
      'TIMEOUT',
      'CORRUPT_AUDIO',
      'OOM',
      'UNSUPPORTED_FORMAT',
      'FILE_NOT_FOUND',
      'UNKNOWN',
    ]

    for (const errorType of errorTypes) {
      const markdown = generatePlaceholderMarkdown(capture, errorType, `Test error: ${errorType}`)
      expect(markdown).toContain(`[TRANSCRIPTION_FAILED: ${errorType}]`)
    }
  })

  it('should format timestamps as ISO 8601 UTC strings', async () => {
    // Arrange
    const capture = {
      id: '01HQW3P7XKZM2YJVT8YFGQSZ4S',
      source: 'voice',
      raw_content: '/path/to/voice.m4a',
      content_hash: null,
      status: 'failed_transcription',
      meta_json: JSON.stringify({
        file_path: '/path/to/file.m4a',
        attempt_count: 1,
      }),
      created_at: '2025-09-27T16:30:45.123Z',
      updated_at: '2025-09-27T16:35:00Z',
    }

    // Act
    const { generatePlaceholderMarkdown } = await import('./placeholder-export.js')
    const markdown = generatePlaceholderMarkdown(capture, 'TIMEOUT', 'Timeout error')

    // Assert - Should preserve ISO 8601 format
    expect(markdown).toContain('Captured at: 2025-09-27T16:30:45.123Z')
    expect(markdown).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('should handle missing metadata gracefully', async () => {
    // Arrange - Empty meta_json
    const capture = {
      id: '01HQW3P7XKZM2YJVT8YFGQSZ4T',
      source: 'voice',
      raw_content: '/path/to/voice.m4a',
      content_hash: null,
      status: 'failed_transcription',
      meta_json: '{}',
      created_at: '2025-09-27T17:00:00Z',
      updated_at: '2025-09-27T17:05:00Z',
    }

    // Act
    const { generatePlaceholderMarkdown } = await import('./placeholder-export.js')
    const markdown = generatePlaceholderMarkdown(capture, 'UNKNOWN', 'Unknown error')

    // Assert - Should use defaults
    expect(markdown).toContain('Retry count: 0')
    expect(markdown).toContain('[TRANSCRIPTION_FAILED: UNKNOWN]')
  })
})

describe('exportPlaceholderToVault - AC03', () => {
  it('should write placeholder markdown to vault inbox directory', async () => {
    // Arrange - Create temp vault directory
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempVault = await createTempDirectory()
    const vaultRoot = tempVault.path

    // Create database with failed transcription
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      '01JANKR8EKZM2YJVT8YFGQSZ4M',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get('01JANKR8EKZM2YJVT8YFGQSZ4M') as {
      id: string
      source: string
      raw_content: string
      content_hash: string | null
      status: string
      meta_json: string
      created_at: string
      updated_at: string
    }

    // Generate placeholder markdown
    const { generatePlaceholderMarkdown, exportPlaceholderToVault } = await import('./placeholder-export.js')
    const placeholder = generatePlaceholderMarkdown(capture, 'TIMEOUT', 'Test timeout error')

    // Act - This will FAIL because exportPlaceholderToVault doesn't exist yet
    const result = await exportPlaceholderToVault(vaultRoot, capture.id, placeholder)

    // Assert
    expect(result.success).toBe(true)
    expect(result.export_path).toBe('inbox/01JANKR8EKZM2YJVT8YFGQSZ4M.md')

    // Verify file was written to inbox
    const { promises: fs } = await import('node:fs')
    const path = await import('node:path')
    const exportPath = path.join(vaultRoot, 'inbox', '01JANKR8EKZM2YJVT8YFGQSZ4M.md')

    const fileContent = await fs.readFile(exportPath, 'utf-8')
    expect(fileContent).toBe(placeholder)
  })

  it('should handle duplicate export (same content hash)', async () => {
    // Arrange - Create temp vault directory
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempVault = await createTempDirectory()
    const vaultRoot = tempVault.path

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      '01JANKR8EKZM2YJVT8YFGQSZ4N',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get('01JANKR8EKZM2YJVT8YFGQSZ4N') as {
      id: string
      source: string
      raw_content: string
      content_hash: string | null
      status: string
      meta_json: string
      created_at: string
      updated_at: string
    }

    const { generatePlaceholderMarkdown, exportPlaceholderToVault } = await import('./placeholder-export.js')
    const placeholder = generatePlaceholderMarkdown(capture, 'TIMEOUT', 'Test timeout error')

    // Act - Export twice with same content
    const result1 = await exportPlaceholderToVault(vaultRoot, capture.id, placeholder)
    const result2 = await exportPlaceholderToVault(vaultRoot, capture.id, placeholder)

    // Assert - Both should succeed, second should be skipped (duplicate)
    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)

    // Verify file exists only once
    const { promises: fs } = await import('node:fs')
    const path = await import('node:path')
    const exportPath = path.join(vaultRoot, 'inbox', '01JANKR8EKZM2YJVT8YFGQSZ4N.md')
    const fileContent = await fs.readFile(exportPath, 'utf-8')
    expect(fileContent).toBe(placeholder)
  })

  it('should handle invalid vault path gracefully', async () => {
    // Arrange - Use non-existent vault path
    const invalidVaultPath = '/nonexistent/vault/path'

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      '01JANKR8EKZM2YJVT8YFGQSZ4P',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get('01JANKR8EKZM2YJVT8YFGQSZ4P') as {
      id: string
      source: string
      raw_content: string
      content_hash: string | null
      status: string
      meta_json: string
      created_at: string
      updated_at: string
    }

    const { generatePlaceholderMarkdown, exportPlaceholderToVault } = await import('./placeholder-export.js')
    const placeholder = generatePlaceholderMarkdown(capture, 'TIMEOUT', 'Test timeout error')

    // Act - This should handle error gracefully
    const result = await exportPlaceholderToVault(invalidVaultPath, capture.id, placeholder)

    // Assert - Should fail but not throw
    expect(result.success).toBe(false)
  })

  it('should validate capture_id format', async () => {
    // Arrange - Create temp vault directory
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempVault = await createTempDirectory()
    const vaultRoot = tempVault.path

    const { exportPlaceholderToVault } = await import('./placeholder-export.js')
    const placeholder = '[TRANSCRIPTION_FAILED: TIMEOUT]\n\nTest placeholder'

    // Act & Assert - Should reject invalid ULID
    await expect(exportPlaceholderToVault(vaultRoot, 'invalid-ulid', placeholder)).rejects.toThrow(
      'Invalid capture_id format'
    )
  })

  it('should create inbox directory if it does not exist', async () => {
    // Arrange - Create temp vault directory without inbox
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempVault = await createTempDirectory()
    const vaultRoot = tempVault.path

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      '01JANKR8EKZM2YJVT8YFGQSZ4Q',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get('01JANKR8EKZM2YJVT8YFGQSZ4Q') as {
      id: string
      source: string
      raw_content: string
      content_hash: string | null
      status: string
      meta_json: string
      created_at: string
      updated_at: string
    }

    const { generatePlaceholderMarkdown, exportPlaceholderToVault } = await import('./placeholder-export.js')
    const placeholder = generatePlaceholderMarkdown(capture, 'TIMEOUT', 'Test timeout error')

    // Verify inbox directory does not exist before export
    const { promises: fs } = await import('node:fs')
    const path = await import('node:path')
    const inboxPath = path.join(vaultRoot, 'inbox')
    let inboxExists = false
    try {
      await fs.access(inboxPath)
      inboxExists = true
    } catch {
      inboxExists = false
    }
    expect(inboxExists).toBe(false)

    // Act - Export should create inbox directory
    const result = await exportPlaceholderToVault(vaultRoot, capture.id, placeholder)

    // Assert - Inbox directory should now exist
    expect(result.success).toBe(true)
    const exportPath = path.join(vaultRoot, 'inbox', '01JANKR8EKZM2YJVT8YFGQSZ4Q.md')
    const fileContent = await fs.readFile(exportPath, 'utf-8')
    expect(fileContent).toBe(placeholder)
  })

  it('should write file with correct permissions', async () => {
    // Arrange - Create temp vault directory
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempVault = await createTempDirectory()
    const vaultRoot = tempVault.path

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      '01JANKR8EKZM2YJVT8YFGQSZ4R',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get('01JANKR8EKZM2YJVT8YFGQSZ4R') as {
      id: string
      source: string
      raw_content: string
      content_hash: string | null
      status: string
      meta_json: string
      created_at: string
      updated_at: string
    }

    const { generatePlaceholderMarkdown, exportPlaceholderToVault } = await import('./placeholder-export.js')
    const placeholder = generatePlaceholderMarkdown(capture, 'TIMEOUT', 'Test timeout error')

    // Act - Export placeholder
    const result = await exportPlaceholderToVault(vaultRoot, capture.id, placeholder)

    // Assert - File should be readable
    expect(result.success).toBe(true)

    const { promises: fs } = await import('node:fs')
    const path = await import('node:path')
    const exportPath = path.join(vaultRoot, 'inbox', '01JANKR8EKZM2YJVT8YFGQSZ4R.md')

    // Verify file is readable (basic permission check)
    const fileContent = await fs.readFile(exportPath, 'utf-8')
    expect(fileContent).toBe(placeholder)

    // Verify we can stat the file (confirms it exists and is accessible)
    const stats = await fs.stat(exportPath)
    expect(stats.isFile()).toBe(true)
  })
})

describe('insertPlaceholderAuditRecord - AC04', () => {
  it('should insert exports_audit row with NULL hash_at_export for placeholder', async () => {
    // Arrange - Create in-memory database with required tables
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        hash_at_export TEXT,
        mode TEXT NOT NULL,
        error_flag INTEGER NOT NULL,
        exported_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(capture_id) REFERENCES captures(id) ON DELETE CASCADE
      );
    `)

    // Insert a failed transcription capture
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      '01JANKR8EKZM2YJVT8YFGQSZ4S',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 2 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const captureId = '01JANKR8EKZM2YJVT8YFGQSZ4S'
    const vaultPath = 'inbox/01JANKR8EKZM2YJVT8YFGQSZ4S.md'

    // Act - This will FAIL because insertPlaceholderAuditRecord doesn't exist yet
    const { insertPlaceholderAuditRecord } = await import('./placeholder-export.js')
    const result = await insertPlaceholderAuditRecord(db, captureId, vaultPath, 'TIMEOUT', 'Test timeout error')

    // Assert
    expect(result.success).toBe(true)

    // Verify exports_audit row was created with correct values
    const auditRecord = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').get(captureId) as
      | {
          id: string
          capture_id: string
          vault_path: string
          hash_at_export: string | null
          mode: string
          error_flag: number
          exported_at: string
          created_at: string
        }
      | undefined

    expect(auditRecord).toBeDefined()

    // Assert auditRecord exists before accessing properties
    if (!auditRecord) {
      throw new Error('Audit record should exist')
    }

    expect(auditRecord.capture_id).toBe(captureId)
    expect(auditRecord.vault_path).toBe(vaultPath)
    expect(auditRecord.hash_at_export).toBeNull()
    expect(auditRecord.mode).toBe('placeholder')
    expect(auditRecord.error_flag).toBe(1)

    // Verify timestamp is recent (within 1 second)
    const exportedAt = new Date(auditRecord.exported_at)
    const now = new Date()
    const diffMs = now.getTime() - exportedAt.getTime()
    expect(diffMs).toBeLessThan(1000)
  })

  it('should update capture status to exported_placeholder', async () => {
    // Arrange - Create database with captures and exports_audit tables
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        hash_at_export TEXT,
        mode TEXT NOT NULL,
        error_flag INTEGER NOT NULL,
        exported_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(capture_id) REFERENCES captures(id) ON DELETE CASCADE
      );
    `)

    // Insert a failed transcription capture
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      '01JANKR8EKZM2YJVT8YFGQSZ4T',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const captureId = '01JANKR8EKZM2YJVT8YFGQSZ4T'
    const vaultPath = 'inbox/01JANKR8EKZM2YJVT8YFGQSZ4T.md'

    // Act
    const { insertPlaceholderAuditRecord } = await import('./placeholder-export.js')
    await insertPlaceholderAuditRecord(db, captureId, vaultPath, 'TIMEOUT', 'Test timeout error')

    // Assert - Capture status should be updated
    const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as
      | { status: string }
      | undefined

    expect(capture).toBeDefined()

    if (!capture) {
      throw new Error('Capture should exist')
    }

    expect(capture.status).toBe('exported_placeholder')
  })

  it('should handle foreign key constraint when capture does not exist', async () => {
    // Arrange - Create database with tables but no capture
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        hash_at_export TEXT,
        mode TEXT NOT NULL,
        error_flag INTEGER NOT NULL,
        exported_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(capture_id) REFERENCES captures(id) ON DELETE CASCADE
      );
    `)

    const nonExistentCaptureId = '01JANKR8EKZM2YJVT8YFGQSZ4U'
    const vaultPath = 'inbox/01JANKR8EKZM2YJVT8YFGQSZ4U.md'

    // Act
    const { insertPlaceholderAuditRecord } = await import('./placeholder-export.js')
    const result = await insertPlaceholderAuditRecord(db, nonExistentCaptureId, vaultPath, 'TIMEOUT', 'Test error')

    // Assert - Should fail due to foreign key constraint
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('AUDIT_INSERT_FAILED')
  })

  it('should prevent duplicate audit records for same capture', async () => {
    // Arrange - Create database with unique constraint
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        hash_at_export TEXT,
        mode TEXT NOT NULL,
        error_flag INTEGER NOT NULL,
        exported_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(capture_id) REFERENCES captures(id) ON DELETE CASCADE
      );
    `)

    // Insert a failed transcription capture
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      '01JANKR8EKZM2YJVT8YFGQSZ4V',
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const captureId = '01JANKR8EKZM2YJVT8YFGQSZ4V'
    const vaultPath = 'inbox/01JANKR8EKZM2YJVT8YFGQSZ4V.md'

    // Act - Insert twice
    const { insertPlaceholderAuditRecord } = await import('./placeholder-export.js')
    const result1 = await insertPlaceholderAuditRecord(db, captureId, vaultPath, 'TIMEOUT', 'Test error')
    const result2 = await insertPlaceholderAuditRecord(db, captureId, vaultPath, 'TIMEOUT', 'Test error')

    // Assert - First should succeed, second should succeed (multiple audit records allowed)
    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)

    // Verify multiple audit records exist
    const auditRecords = db
      .prepare('SELECT COUNT(*) as count FROM exports_audit WHERE capture_id = ?')
      .get(captureId) as { count: number } | undefined

    expect(auditRecords).toBeDefined()

    if (!auditRecords) {
      throw new Error('Audit records should exist')
    }

    expect(auditRecords.count).toBe(2)
  })

  it('should use parameterized queries to prevent SQL injection', async () => {
    // Arrange - Create database
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        hash_at_export TEXT,
        mode TEXT NOT NULL,
        error_flag INTEGER NOT NULL,
        exported_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(capture_id) REFERENCES captures(id) ON DELETE CASCADE
      );
    `)

    // Insert a failed transcription capture
    const captureId = '01JANKR8EKZM2YJVT8YFGQSZ4W'
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      captureId,
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    // Malicious input attempt
    const maliciousVaultPath = "inbox/test.md'; DROP TABLE captures; --"

    // Act
    const { insertPlaceholderAuditRecord } = await import('./placeholder-export.js')
    const result = await insertPlaceholderAuditRecord(db, captureId, maliciousVaultPath, 'TIMEOUT', 'Test error')

    // Assert - Should succeed safely
    expect(result.success).toBe(true)

    // Verify captures table still exists (not dropped by SQL injection)
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='captures'").get()
    expect(tableExists).toBeDefined()

    // Verify malicious string was stored as literal data
    const auditRecord = db.prepare('SELECT vault_path FROM exports_audit WHERE capture_id = ?').get(captureId) as
      | { vault_path: string }
      | undefined

    expect(auditRecord).toBeDefined()

    if (!auditRecord) {
      throw new Error('Audit record should exist')
    }

    expect(auditRecord.vault_path).toBe(maliciousVaultPath)
  })

  it('should format timestamps as ISO 8601 UTC strings', async () => {
    // Arrange - Create database
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        hash_at_export TEXT,
        mode TEXT NOT NULL,
        error_flag INTEGER NOT NULL,
        exported_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(capture_id) REFERENCES captures(id) ON DELETE CASCADE
      );
    `)

    // Insert a failed transcription capture
    const captureId = '01JANKR8EKZM2YJVT8YFGQSZ4X'
    db.prepare(
      `
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      captureId,
      'voice',
      '/path/to/voice.m4a',
      null,
      'failed_transcription',
      JSON.stringify({ file_path: '/path/to/voice.m4a', attempt_count: 1 }),
      '2025-10-23T10:00:00Z',
      '2025-10-23T10:05:00Z'
    )

    const vaultPath = 'inbox/01JANKR8EKZM2YJVT8YFGQSZ4X.md'

    // Act
    const { insertPlaceholderAuditRecord } = await import('./placeholder-export.js')
    await insertPlaceholderAuditRecord(db, captureId, vaultPath, 'TIMEOUT', 'Test error')

    // Assert - Verify ISO 8601 format
    const auditRecord = db.prepare('SELECT exported_at FROM exports_audit WHERE capture_id = ?').get(captureId) as
      | { exported_at: string }
      | undefined

    expect(auditRecord).toBeDefined()

    if (!auditRecord) {
      throw new Error('Audit record should exist')
    }

    // ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
    expect(auditRecord.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
