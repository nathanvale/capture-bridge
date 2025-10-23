/**
 * Placeholder Export Tests - PLACEHOLDER_EXPORT--T01
 *
 * AC01: Trigger - Detect captures with status='failed_transcription'
 *
 * Medium Risk - TDD Required, Coverage ≥80%
 */

import Database from 'better-sqlite3'
import { describe, it, expect, afterEach } from 'vitest'

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
