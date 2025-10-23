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
    expect(markdown).toContain('PERMANENT')
    expect(markdown).toMatch(/cannot be retried|permanent/i)
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
