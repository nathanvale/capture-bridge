import { ulid } from 'ulid'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

let EmailDeduplicator: any

// Dynamic import to align with ESM .js-in-TS pattern for Node16 resolution
const importDeduplicator = async () => {
  ;({ EmailDeduplicator } = await import('../email-deduplicator.js'))
}

interface EmailMetadata {
  channel: 'email'
  channel_native_id: string
  message_id: string
  from?: string
  subject?: string
}

describe('EmailDeduplicator', () => {
  const databases: any[] = []

  beforeEach(async () => {
    await importDeduplicator()
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT,
        content_hash TEXT,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      -- Index for Layer 1 deduplication
      CREATE INDEX idx_captures_email_message_id
      ON captures(source, json_extract(meta_json, '$.channel_native_id'))
      WHERE source = 'email';
    `)
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const db of databases) db.close()
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('returns false when no duplicate exists', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    const result = await deduplicator.checkDuplicate({ messageId: 'new-message@example.com' })

    expect(result.isDuplicate).toBe(false)
    expect(result.matchedCaptureId).toBeUndefined()
  })

  it('returns true when duplicate exists', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    const existingId = ulid()
    const metadata: EmailMetadata = {
      channel: 'email',
      channel_native_id: 'test123@example.com',
      message_id: 'test123@example.com',
      from: 'sender@example.com',
      subject: 'Test',
    }

    db.prepare(
      `
      INSERT INTO captures (id, source, status, meta_json)
      VALUES (?, 'email', 'staged', ?)
    `
    ).run(existingId, JSON.stringify(metadata))

    const result = await deduplicator.checkDuplicate({ messageId: 'test123@example.com' })

    expect(result.isDuplicate).toBe(true)
    expect(result.matchedCaptureId).toBe(existingId)
    expect(result.matchType).toBe('message_id')
  })

  it('returns false for different message id', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    const existingId = ulid()
    const metadata: EmailMetadata = {
      channel: 'email',
      channel_native_id: 'first@example.com',
      message_id: 'first@example.com',
    }
    db.prepare(
      `
      INSERT INTO captures (id, source, status, meta_json)
      VALUES (?, 'email', 'staged', ?)
    `
    ).run(existingId, JSON.stringify(metadata))

    const result = await deduplicator.checkDuplicate({ messageId: 'second@example.com' })

    expect(result.isDuplicate).toBe(false)
  })

  it('is case-sensitive for message_id', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    db.prepare(
      `
      INSERT INTO captures (id, source, status, meta_json)
      VALUES (?, 'email', 'staged', ?)
    `
    ).run(
      ulid(),
      JSON.stringify({ channel: 'email', channel_native_id: 'TEST123@example.com', message_id: 'TEST123@example.com' })
    )

    const result = await deduplicator.checkDuplicate({ messageId: 'test123@example.com' })

    expect(result.isDuplicate).toBe(false)
  })

  it('returns oldest when multiple matches exist', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    const targetId1 = ulid()
    const targetId2 = ulid()
    const targetId3 = ulid()

    const stmt = db.prepare(
      `
      INSERT INTO captures (id, source, status, meta_json, created_at)
      VALUES (?, 'email', 'staged', ?, ?)
    `
    )

    const metadata = { channel: 'email', channel_native_id: 'same@example.com', message_id: 'same@example.com' }

    stmt.run(targetId1, JSON.stringify(metadata), '2025-01-01T00:00:00.000Z')
    stmt.run(targetId2, JSON.stringify(metadata), '2025-02-01T00:00:00.000Z')
    stmt.run(targetId3, JSON.stringify(metadata), '2025-03-01T00:00:00.000Z')

    const result = await deduplicator.checkDuplicate({ messageId: 'same@example.com' })

    expect(result.isDuplicate).toBe(true)
    expect(result.matchedCaptureId).toBe(targetId1)
  })

  it('completes duplicate check in < 10ms (p95)', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    const stmt = db.prepare(
      `
      INSERT INTO captures (id, source, status, meta_json)
      VALUES (?, 'email', 'staged', ?)
    `
    )

    for (let i = 0; i < 1000; i++) {
      const metadata: EmailMetadata = {
        channel: 'email',
        channel_native_id: `msg${i}@example.com`,
        message_id: `msg${i}@example.com`,
      }
      stmt.run(ulid(), JSON.stringify(metadata))
    }

    const durations: number[] = []

    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      await deduplicator.checkDuplicate({ messageId: `msg${i}@example.com` })
      durations.push(performance.now() - start)
    }

    durations.sort((a, b) => a - b)
    expect(durations[Math.floor(durations.length * 0.95)]).toBeLessThan(10)
  })

  it('uses index for message_id lookup (EXPLAIN QUERY PLAN)', () => {
    const db = databases[0]

    const plan = db
      .prepare(
        `
        EXPLAIN QUERY PLAN
        SELECT id FROM captures
        WHERE source = 'email'
          AND json_extract(meta_json, '$.channel_native_id') = ?
        LIMIT 1
      `
      )
      .all('test@example.com')

    const planText = JSON.stringify(plan)

    expect(planText).toContain('USING INDEX')
    expect(planText).not.toContain('SCAN TABLE')
  })

  it('returns error for invalid message_id', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    const result = await deduplicator.checkDuplicate({ messageId: '' })

    expect(result.error).toBeDefined()
  })

  it('handles SQLITE_BUSY by returning database_error', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    // Monkey-patch statement to throw SQLITE_BUSY
    ;(deduplicator as unknown as Record<string, unknown>)['stmtMessageId'] = {
      get: () => {
        const err: any = new Error('busy')
        err.code = 'SQLITE_BUSY'
        throw err
      },
    }

    const result = await deduplicator.checkDuplicate({ messageId: 'x@example.com' })
    expect(result.error).toBe('dedup.database_error')
    expect(result.isDuplicate).toBe(false)
  })

  it('maps timeout errors to query_timeout', async () => {
    const db = databases[0]
    const deduplicator = new EmailDeduplicator(db)

    ;(deduplicator as unknown as Record<string, unknown>)['stmtMessageId'] = {
      get: () => {
        const err: any = new Error('timeout exceeded while executing')
        throw err
      },
    }

    const result = await deduplicator.checkDuplicate({ messageId: 'y@example.com' })
    expect(result.error).toBe('dedup.query_timeout')
    expect(result.isDuplicate).toBe(false)
  })
})
