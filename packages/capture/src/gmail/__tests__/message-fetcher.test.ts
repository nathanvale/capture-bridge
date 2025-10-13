/**
 * TDD RED Phase: GmailMessageFetcher - Fetch full message (headers + plain text body)
 * Task: EMAIL_POLLING_GMAIL--T02, AC06
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Helper to generate base64url without padding
const makeUrl = (s: string) =>
  Buffer.from(s, 'utf-8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

// Minimal Gmail mock factory focused on users.messages.get
function createGmailMock() {
  const get = vi.fn()
  return {
    users: {
      messages: { get },
    },
    __spies: { get },
  }
}

describe('GmailMessageFetcher', () => {
  const databases: Array<{ close: () => void }> = []
  const clients: Array<{ shutdown: () => Promise<void> }> = []

  beforeEach(async () => {
    // nothing yet
  })

  afterEach(async () => {
    // 5-step cleanup
    for (const client of clients) await client.shutdown?.()
    clients.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const db of databases) db.close()
    databases.length = 0

    if (global.gc) global.gc()
    vi.resetAllMocks()
  })

  it('fetches message with headers and plain text body', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_123',
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test Subject' },
            { name: 'Date', value: '2025-10-13T10:00:00Z' },
            { name: 'Message-ID', value: '<abc123@example.com>' },
          ],
          body: {
            data: Buffer.from('Plain text content\nLine 2', 'utf-8').toString('base64'),
          },
        },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    const result = await fetcher.fetchMessage('msg_123')

    expect(result).toMatchObject({
      messageId: 'msg_123',
      from: 'sender@example.com',
      subject: 'Test Subject',
      body: expect.stringContaining('Plain text content'),
      date: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
      headers: expect.objectContaining({
        From: 'sender@example.com',
        Subject: 'Test Subject',
        'Message-ID': '<abc123@example.com>',
      }),
    })
  })

  it('handles multipart/alternative and prefers text/plain over text/html', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_multi',
        payload: {
          mimeType: 'multipart/alternative',
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Multipart' },
            { name: 'Date', value: '2025-10-13T10:05:00Z' },
            { name: 'Message-ID', value: '<multi@example.com>' },
          ],
          parts: [
            {
              mimeType: 'text/html',
              body: { data: Buffer.from('<p>HTML</p>', 'utf-8').toString('base64') },
            },
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from('Plain wins', 'utf-8').toString('base64') },
            },
          ],
        },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    const result = await fetcher.fetchMessage('msg_multi')
    expect(result.body).toBe('Plain wins')
  })

  it('handles missing optional headers gracefully', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_missing',
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: 'sender@example.com' },
            // Subject intentionally missing
            { name: 'Date', value: '2025-10-13T11:00:00Z' },
          ],
          body: { data: Buffer.from('Body', 'utf-8').toString('base64') },
        },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    const result = await fetcher.fetchMessage('msg_missing')
    expect(result.from).toBe('sender@example.com')
    expect(result.subject).toBe('')
    expect(result.date).toMatch(/\d{4}-\d{2}-\d{2}/)
  // Headers map should include only present headers
  expect(result.headers['From']).toBe('sender@example.com')
  expect(result.headers['Subject'] ?? '').toBe('')
  })

  it('returns empty body when only HTML is present', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_html_only',
        payload: {
          mimeType: 'multipart/alternative',
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Date', value: '2025-10-13T12:00:00Z' },
          ],
          parts: [
            {
              mimeType: 'text/html',
              body: { data: Buffer.from('<p>HTML only</p>').toString('base64') },
            },
          ],
        },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    const result = await fetcher.fetchMessage('msg_html_only')
    expect(result.body).toBe('')
  })

  it('propagates Gmail API errors and logs to errors_log', async () => {
    const db = new Database(':memory:')
    databases.push(db)
    // Ensure errors_log exists for assertion; fetcher may also create if missing
    db.exec(`
      CREATE TABLE IF NOT EXISTS errors_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT,
        code INTEGER,
        message TEXT,
        context TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)

    const gmail = createGmailMock()
    const err: any = new Error('Server error')
    err.code = 500
    gmail.__spies.get.mockRejectedValue(err)

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    await expect(fetcher.fetchMessage('msg_err')).rejects.toThrow('Server error')

    const row = db.prepare('SELECT source, code, message, context FROM errors_log ORDER BY id DESC LIMIT 1').get() as
      | { source: string; code: number; message: string; context: string }
      | undefined
    expect(row).toBeDefined()
    expect(row?.source).toBe('gmail.fetchMessage')
    expect(row?.code).toBe(500)
    expect(row?.message).toContain('Server error')
    expect(row?.context).toContain('msg_err')
  })

  it('decodes base64url content and preserves UTF-8 characters', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const special = 'Café – naïve ☕️'
    // Gmail uses base64url, so replace +/ with -_ and strip padding
  const b64 = Buffer.from(special, 'utf-8').toString('base64')
  let b64url = b64.replaceAll('+', '-').replaceAll('/', '_')
  const eqIndex = b64url.indexOf('=')
  b64url = eqIndex !== -1 ? b64url.slice(0, eqIndex) : b64url

    const gmail = createGmailMock()
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_utf8',
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Date', value: '2025-10-13T13:00:00Z' },
            { name: 'Message-ID', value: '<utf8@example.com>' },
          ],
          body: { data: b64url },
        },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    const result = await fetcher.fetchMessage('msg_utf8')
    expect(result.body).toBe(special)
  })

  it('handles headers case-insensitively and base64 padding variants', async () => {
    const db = new Database(':memory:')
    databases.push(db)

  // text 'Pad' yields base64 'UGFk' (length % 4 === 0), 'Pa' => 'UGE=' (rem===3), 'P' => 'UA==' (rem===2)

    const gmail = createGmailMock()
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_case_pad',
        payload: {
          mimeType: 'multipart/alternative',
          headers: [
            { name: 'from', value: 'sender@example.com' }, // lower-case on purpose
            { name: 'sUbJeCt', value: 'Weird Casing' },
            { name: 'DATE', value: '2025-10-13T14:00:00Z' },
          ],
          parts: [
            { mimeType: 'text/plain', body: { data: makeUrl('P') } },
            { mimeType: 'text/plain', body: { data: makeUrl('Pa') } },
            { mimeType: 'text/plain', body: { data: makeUrl('Pad') } },
          ],
        },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    const result = await fetcher.fetchMessage('msg_case_pad')
    // First matching part returns; any of the three decodes to their original string
    expect(['P', 'Pa', 'Pad']).toContain(result.body)
    // Case-insensitive header lookup is normalized in result fields
    expect(result.from).toBe('sender@example.com')
    expect(result.subject).toBe('Weird Casing')
    expect(result.date).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('swallows logging errors and still rethrows original error', async () => {
    // Create a DB that will throw during exec/prepare to simulate logging failure
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    const error: any = new Error('Boom')
    error.code = 400
    gmail.__spies.get.mockRejectedValue(error)

    // Monkey-patch db.exec to throw to simulate filesystem/database issue
    const originalExec = db.exec.bind(db)
    ;(db as any).exec = () => {
      throw new Error('exec failed')
    }

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    await expect(fetcher.fetchMessage('msg_log_err')).rejects.toThrow('Boom')

    // Restore exec for clean shutdown
    ;(db as any).exec = originalExec
  })

  it('handles messages with no payload gracefully', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    gmail.__spies.get.mockResolvedValue({ data: { id: 'msg_no_payload' } })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    const result = await fetcher.fetchMessage('msg_no_payload')
    expect(result.messageId).toBe('msg_no_payload')
    expect(result.body).toBe('')
    expect(result.from).toBe('')
    expect(result.subject).toBe('')
    expect(result.date).toBe('')
    expect(Object.keys(result.headers)).toHaveLength(0)
  })

  it('returns empty string when base64 decoding fails', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    // Intentionally malformed base64-like string to trigger decode fallback
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_bad_b64',
        payload: {
          mimeType: 'text/plain',
          headers: [{ name: 'From', value: 'sender@example.com' }],
          body: { data: '!!not-base64!!' },
        },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)

    const result = await fetcher.fetchMessage('msg_bad_b64')
    expect(result.body).toBe('')
  })

  it('decodes base64url with rem===3 padding case', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    const data = makeUrl('Pa') // base64 ends with '=', rem===3 after stripping
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_pad_rem3',
        payload: { mimeType: 'text/plain', body: { data }, headers: [] },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)
    const result = await fetcher.fetchMessage('msg_pad_rem3')
    expect(result.body).toBe('Pa')
  })

  it('decodes base64url with rem===0 (no extra padding needed)', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    const gmail = createGmailMock()
    const data = makeUrl('Pad') // base64 length % 4 === 0
    gmail.__spies.get.mockResolvedValue({
      data: {
        id: 'msg_pad_rem0',
        payload: { mimeType: 'text/plain', body: { data }, headers: [] },
      },
    })

    const { GmailMessageFetcher } = await import('../message-fetcher.js')
    const fetcher = new GmailMessageFetcher(db as any, gmail as any)
    const result = await fetcher.fetchMessage('msg_pad_rem0')
    expect(result.body).toBe('Pad')
  })
})
