import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest'

let extractEmailMetadata: (m: any) => any
beforeAll(async () => {
  ;({ extractEmailMetadata } = await import('../metadata-extractor.js'))
})

// Minimal Gmail-like types used in tests
interface GmailHeader {
  name: string
  value: string
}
interface GmailMessageLike {
  id?: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  historyId?: string
  internalDate?: string
  sizeEstimate?: number
  payload?: { headers?: GmailHeader[] }
}

describe('extractEmailMetadata', () => {
  const databases: any[] = []

  beforeEach(async () => {
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
      )
    `)
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const db of databases) db.close()
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('extracts complete metadata from message', () => {
    const mockMessage: GmailMessageLike = {
      id: 'msg_123',
      threadId: 'thread_456',
      labelIds: ['INBOX', 'UNREAD'],
      snippet: 'This is a preview of the email content...',
      historyId: '987654',
      internalDate: '1695900000000',
      sizeEstimate: 5432,
      payload: {
        headers: [
          { name: 'Message-ID', value: '<CAJrW+aNqXZJX5K9vZ_9@mail.gmail.com>' },
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Test Email' },
          { name: 'Date', value: 'Thu, 28 Sep 2025 10:30:00 +0000' },
        ],
      },
    }

    const result = extractEmailMetadata(mockMessage as any)

    expect(result.success).toBe(true)
    expect(result.metadata).toMatchObject({
      channel: 'email',
      channel_native_id: 'CAJrW+aNqXZJX5K9vZ_9@mail.gmail.com',
      message_id: 'CAJrW+aNqXZJX5K9vZ_9@mail.gmail.com',
      from: 'sender@example.com',
      subject: 'Test Email',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/),
      thread_id: 'thread_456',
      labels: ['INBOX', 'UNREAD'],
      snippet: 'This is a preview of the email content...',
      history_id: '987654',
    })
  })

  it('defaults subject when missing', () => {
    const mockMessage: GmailMessageLike = {
      id: 'msg_123',
      payload: {
        headers: [
          { name: 'Message-ID', value: '<abc@test.com>' },
          { name: 'From', value: 'sender@example.com' },
          { name: 'Date', value: '2025-09-28T10:30:00Z' },
        ],
      },
    }

    const result = extractEmailMetadata(mockMessage as any)
    expect(result.success).toBe(true)
    expect(result.metadata?.subject).toBe('(no subject)')
  })

  it('fails when Message-ID header missing', () => {
    const mockMessage: GmailMessageLike = {
      id: 'msg_123',
      payload: {
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Test' },
        ],
      },
    }

    const result = extractEmailMetadata(mockMessage as any)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('missing_message_id')
    expect(result.error?.message).toContain('required for deduplication')
    expect(result.error?.headers).toBeTypeOf('object')
  })

  it('fails when From header missing', () => {
    const mockMessage: GmailMessageLike = {
      id: 'msg_123',
      payload: {
        headers: [
          { name: 'Message-ID', value: '<abc@test.com>' },
          { name: 'Subject', value: 'Test' },
        ],
      },
    }

    const result = extractEmailMetadata(mockMessage as any)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('missing_from')
  })

  it('preserves complex From header', () => {
    const mockMessage: GmailMessageLike = {
      id: 'msg_123',
      payload: {
        headers: [
          { name: 'Message-ID', value: '<abc@test.com>' },
          { name: 'From', value: 'John Doe <john@example.com>' },
          { name: 'Subject', value: 'Test' },
          { name: 'Date', value: '2025-09-28T10:30:00Z' },
        ],
      },
    }

    const result = extractEmailMetadata(mockMessage as any)

    expect(result.success).toBe(true)
    expect(result.metadata?.from).toBe('John Doe <john@example.com>')
  })

  it('normalizes various date formats and falls back to internalDate', () => {
    const rfc2822: GmailMessageLike = {
      payload: {
        headers: [
          { name: 'Message-ID', value: '<id@x>' },
          { name: 'From', value: 'a@b' },
          { name: 'Date', value: 'Thu, 28 Sep 2025 10:30:00 +0000' },
        ],
      },
    }
    const iso: GmailMessageLike = {
      payload: {
        headers: [
          { name: 'Message-ID', value: '<id@x>' },
          { name: 'From', value: 'a@b' },
          { name: 'Date', value: '2025-09-28T10:30:00Z' },
        ],
      },
    }
    const fallback: GmailMessageLike = {
      internalDate: '1695900000000',
      payload: {
        headers: [
          { name: 'Message-ID', value: '<id@x>' },
          { name: 'From', value: 'a@b' },
        ],
      },
    }

    const r1 = extractEmailMetadata(rfc2822 as any)
    const r2 = extractEmailMetadata(iso as any)
    const r3 = extractEmailMetadata(fallback as any)

    for (const r of [r1, r2, r3]) {
      expect(r.success).toBe(true)
      expect(r.metadata?.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:/)
    }
  })

  it('is JSON serializable and SQLite json_extract compatible', () => {
    const db = databases[0]
    const metadata = {
      channel: 'email',
      channel_native_id: 'test123@example.com',
      message_id: 'test123@example.com',
      from: 'sender@example.com',
      subject: 'Test Subject',
      date: '2025-09-28T10:30:00Z',
    }

    db.prepare(
      `
        INSERT INTO captures (id, source, status, meta_json)
        VALUES (?, 'email', 'staged', ?)
      `
    ).run('01JABCDEF123XYZ', JSON.stringify(metadata))

    const row = db
      .prepare(
        `
        SELECT json_extract(meta_json, '$.message_id') as message_id,
               json_extract(meta_json, '$.from') as from_addr,
               json_extract(meta_json, '$.subject') as subject
        FROM captures WHERE id = ?
      `
      )
      .get('01JABCDEF123XYZ')

    expect(row).toMatchObject({
      message_id: 'test123@example.com',
      from_addr: 'sender@example.com',
      subject: 'Test Subject',
    })
  })
})
