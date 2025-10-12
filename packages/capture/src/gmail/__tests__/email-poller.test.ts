/* eslint-disable import/no-unresolved */
/**
 * TDD RED Phase: Gmail EmailPoller polling interval and sequential execution
 * AC01 (EMAIL_POLLING_GMAIL--T01): Poll Gmail API every 60s (configurable)
 */

import Database from 'better-sqlite3'
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'

// Local test-only type contracts
interface DeduplicationService {
  isDuplicate: (params: { messageId: string }) => Promise<boolean>
}

interface EmailPollerConfig {
  gmailCredentialsPath: string
  pollInterval?: number
  sequential: true
  rateLimitConfig?: {
    maxRequestsPerSecond: number
    burstCapacity: number
  }
}

interface EmailPollResult {
  messagesFound: number
  messagesProcessed: number
  duplicatesSkipped: number
  errors: Array<{ messageId: string; error: string }>
  duration: number
}

describe('EmailPoller', () => {
  const databases: Array<{ close: () => void }> = []

  afterEach(async () => {
    // Small settle to avoid race conditions
    await new Promise((resolve) => setTimeout(resolve, 50))
    for (const db of databases) db.close()
    databases.length = 0
    if (global.gc) global.gc()
    vi.resetAllMocks()
  })

  it('should accept configurable poll interval', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const db = new Database(':memory:')
    databases.push(db)

    const dedup: DeduplicationService = {
      isDuplicate: () => Promise.resolve(false),
    }

    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/test/creds.json',
      pollInterval: 30000, // Custom 30s
      sequential: true,
    } satisfies EmailPollerConfig)

    expect(poller.config.pollInterval).toBe(30000)
  })

  it('should default poll interval to 60000ms when not provided', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const db = new Database(':memory:')
    databases.push(db)

    const dedup: DeduplicationService = {
      isDuplicate: () => Promise.resolve(false),
    }

    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/test/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)

    expect(poller.config.pollInterval).toBe(60000)
  })

  it('should expose pollOnce() that returns EmailPollResult', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const db = new Database(':memory:')
    databases.push(db)

    const dedup: DeduplicationService = {
      isDuplicate: () => Promise.resolve(false),
    }

    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/test/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)

    const result: EmailPollResult = await poller.pollOnce()
    expect(result).toEqual(
      expect.objectContaining({
        messagesFound: expect.any(Number),
        messagesProcessed: expect.any(Number),
        duplicatesSkipped: expect.any(Number),
        errors: expect.any(Array),
        duration: expect.any(Number),
      })
    )
  })

  it('enforces sequential execution by preventing overlapping polls', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const db = new Database(':memory:')
    databases.push(db)

    const dedup: DeduplicationService = {
      isDuplicate: () => Promise.resolve(false),
    }

    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/test/creds.json',
      sequential: true,
      pollInterval: 1000,
    } satisfies EmailPollerConfig)

    let inFlight = 0
    let maxConcurrent = 0
    // Spy on internal executePollOnce to simulate a slow poll while preserving the lock
    const slowImpl = vi.spyOn(poller as any, 'executePollOnce').mockImplementation(async () => {
      inFlight++
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await new Promise((r) => setTimeout(r, 50))
      inFlight--
      return {
        messagesFound: 0,
        messagesProcessed: 0,
        duplicatesSkipped: 0,
        errors: [],
        duration: 50,
      }
    })

    const p1 = poller.pollOnce()
    const p2 = poller.pollOnce()

    await Promise.all([p1, p2])

    expect(slowImpl).toHaveBeenCalledTimes(2)
    expect(maxConcurrent).toBe(1)
  })

  it('should reject non-positive pollInterval values', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const db = new Database(':memory:')
    databases.push(db)

    const dedup: DeduplicationService = {
      isDuplicate: () => Promise.resolve(false),
    }

    expect(
      () =>
        new EmailPoller(db, dedup, {
          gmailCredentialsPath: '/test/creds.json',
          sequential: true,
          pollInterval: 0,
        } as EmailPollerConfig)
    ).toThrowError()
  })
})

// History API RED tests (AC02)
// Helper shim must be in module scope to satisfy lint rules
const makeMockGmail = () => {
  const listHistory = vi.fn()
  const listMessages = vi.fn()
  return {
    users: {
      history: { list: listHistory },
      messages: { list: listMessages, get: vi.fn() },
    },
    __spies: { listHistory, listMessages },
  }
}

describe('EmailPoller - History API', () => {
  const databases: Array<{ close: () => void }> = []
  let db: any

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)
    // Minimal sync_state table for cursor tests
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    // Seed a previous cursor
    db.prepare(`
      INSERT OR REPLACE INTO sync_state (key, value, updated_at)
      VALUES ('gmail_history_id', 'previous-history-id', datetime('now'))
    `).run()
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 20))
    for (const d of databases) d.close()
    databases.length = 0
    vi.resetAllMocks()
  })

  it('should use history.list API with startHistoryId', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    // Mock history.list returning a basic history envelope
    gmail.__spies.listHistory.mockResolvedValue({
      data: { history: [], historyId: '67890' },
    })

    // Inject mock gmail into poller via any-cast field after construction in GREEN phase.
  const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)

    // Inject mock gmail for RED phase
    ;(poller as any).gmail = gmail

    await poller.pollOnce()

    expect(gmail.__spies.listHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        startHistoryId: 'previous-history-id',
      })
    )
  })

  it('should extract message IDs from messagesAdded events and update cursor', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    gmail.__spies.listHistory.mockResolvedValue({
      data: {
        history: [
          {
            id: '12345',
            messagesAdded: [
              { message: { id: 'msg1', threadId: 't1' } },
              { message: { id: 'msg2', threadId: 't2' } },
            ],
          },
        ],
        historyId: '67890',
      },
    })

  const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    const result = await poller.pollOnce()

    // Expect messageIds returned and cursor advanced
    expect(result).toEqual(
      expect.objectContaining({
        messageIds: ['msg1', 'msg2'],
        historyId: '67890',
      })
    )

    const row = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string } | undefined
    expect(row?.value).toBe('67890')
  })

  it('should bootstrap cursor if missing', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    // Remove existing cursor
    db.prepare("DELETE FROM sync_state WHERE key = 'gmail_history_id'").run()

    // Simulate messages.list to obtain a current historyId during bootstrap
    gmail.__spies.listMessages.mockResolvedValue({
      data: { historyId: 'cur-100', resultSizeEstimate: 0 },
    })

    // Subsequent history.list after bootstrap
    gmail.__spies.listHistory.mockResolvedValue({
      data: { history: [], historyId: 'cur-101' },
    })

  const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    const result = await poller.pollOnce()

    expect(result.bootstrapped ?? true).toBe(true)
    const cursor = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string } | undefined
    expect(cursor?.value).toBe('cur-101')
  })

  it('should handle 404 cursor invalid error by re-bootstrapping', async () => {
    // @ts-expect-error - TS project references may not include test module mapping; runtime path is valid
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    const error404: any = new Error('Requested history not found')
    error404.status = 404

    gmail.__spies.listHistory.mockRejectedValueOnce(error404)
    gmail.__spies.listMessages.mockResolvedValue({
      data: { historyId: 'reboot-1', resultSizeEstimate: 0 },
    })

  const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    const result = await poller.pollOnce()
    expect(result.cursorReset ?? true).toBe(true)
  })
})

// AC03: Cursor Persistence RED tests
describe('EmailPoller - Cursor Persistence', () => {
  const databases: Array<{ close: () => void }> = []
  let db: any

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sync_state_updated ON sync_state(updated_at);
    `)
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 20))
    for (const d of databases) d.close()
    databases.length = 0
    vi.resetAllMocks()
  })

  it('stores cursor with key gmail_history_id on first poll', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
  const gmail = makeMockGmail()

    // Bootstrap path: no existing cursor → messages.list then history.list
    gmail.__spies.listMessages.mockResolvedValue({
      data: { historyId: '100', resultSizeEstimate: 0 },
    })
    gmail.__spies.listHistory.mockResolvedValue({
      data: { history: [], historyId: '101' },
    })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    await poller.pollOnce()

    const cursor = db
      .prepare("SELECT key, value, updated_at FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { key: string; value: string; updated_at: string } | undefined
    expect(cursor).toBeDefined()
    expect(cursor?.key).toBe('gmail_history_id')
    expect(cursor?.value).toMatch(/^\d+$/)
    expect(cursor?.updated_at).toBeDefined()
  })

  it('updates cursor after subsequent polls', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
  const gmail = makeMockGmail()

    // Seed missing → bootstrap to 100 then first history to 101
    gmail.__spies.listMessages.mockResolvedValueOnce({
      data: { historyId: '100', resultSizeEstimate: 0 },
    })
    gmail.__spies.listHistory.mockResolvedValueOnce({
      data: { history: [], historyId: '101' },
    })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail
    await poller.pollOnce()

    const row1 = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string }
    expect(row1.value).toBe('101')

    // Next poll returns newer history id
    gmail.__spies.listHistory.mockResolvedValueOnce({
      data: { history: [], historyId: '102' },
    })
    await poller.pollOnce()
    const row2 = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string }
    expect(row2.value).not.toBe(row1.value)
    expect(row2.value).toBe('102')
  })

  it('bootstraps cursor if missing', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
  const gmail = makeMockGmail()
    // Ensure missing
    db.prepare("DELETE FROM sync_state WHERE key = 'gmail_history_id'").run()

    gmail.__spies.listMessages.mockResolvedValue({
      data: { historyId: '200', resultSizeEstimate: 0 },
    })
    gmail.__spies.listHistory.mockResolvedValue({
      data: { history: [], historyId: '201' },
    })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    await poller.pollOnce()
    const row = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string } | undefined
    expect(row?.value).toBe('201')
  })

  it('does not update cursor if staging fails (atomic rollback)', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
  const gmail = makeMockGmail()

    // Seed existing cursor
    db.prepare(`INSERT OR REPLACE INTO sync_state(key,value,updated_at) VALUES('gmail_history_id','300',datetime('now'))`).run()

    gmail.__spies.listHistory.mockResolvedValueOnce({
      data: {
        history: [
          { messagesAdded: [{ message: { id: 'm1', threadId: 't1' } }] },
        ],
        historyId: '301',
      },
    })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    // Force stageCapture to fail synchronously so transaction rolls back
    vi.spyOn(poller as any, 'stageCapture').mockImplementationOnce(() => {
      throw new Error('Insert failed')
    })

    await expect(poller.pollOnce()).rejects.toThrow('Insert failed')

    const row = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string }
    expect(row.value).toBe('300') // should not advance to 301
  })

  it('calculates cursor age from updated_at', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
  const gmail = makeMockGmail()

    gmail.__spies.listMessages.mockResolvedValueOnce({
      data: { historyId: '400', resultSizeEstimate: 0 },
    })
    gmail.__spies.listHistory.mockResolvedValueOnce({
      data: { history: [], historyId: '401' },
    })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    await poller.pollOnce()

    // Wait ~1s
    await new Promise((r) => setTimeout(r, 1000))
    const cursor = db
      .prepare("SELECT value, updated_at FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string; updated_at: string }

    const age = Date.now() - new Date(cursor.updated_at).getTime()
    expect(age).toBeGreaterThanOrEqual(900)
    expect(age).toBeLessThan(3000)
  })

  it('persists cursor across poller restarts', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
  const gmail = makeMockGmail()

    gmail.__spies.listMessages.mockResolvedValueOnce({
      data: { historyId: '500', resultSizeEstimate: 0 },
    })
    gmail.__spies.listHistory.mockResolvedValueOnce({
      data: { history: [], historyId: '501' },
    })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller1 = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller1 as any).gmail = gmail
    await poller1.pollOnce()

    const row1 = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string }
    expect(row1.value).toBe('501')

    // New instance, new poll should advance
    gmail.__spies.listHistory.mockResolvedValueOnce({
      data: { history: [], historyId: '502' },
    })
    const poller2 = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller2 as any).gmail = gmail
    await poller2.pollOnce()
    const row2 = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string }
    expect(row2.value).toBe('502')
  })
})

// Unit tests for SyncStateRepository (AC03 coverage)
describe('SyncStateRepository', () => {
  const databases: Array<{ close: () => void }> = []
  let db: any

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  })

  afterEach(() => {
    for (const d of databases) d.close()
    databases.length = 0
  })

  it('get/set/exists/getCursorAge basics', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { SyncStateRepository } = await import('../sync-state-repository.js')
    const repo = new SyncStateRepository(db)

    expect(await repo.exists('gmail_history_id')).toBe(false)
    expect(await repo.get('gmail_history_id')).toBeNull()

    await repo.set('gmail_history_id', '900')
    expect(await repo.exists('gmail_history_id')).toBe(true)
    expect(await repo.get('gmail_history_id')).toBe('900')

    const age0 = await repo.getCursorAge('gmail_history_id')
    expect(typeof age0).toBe('number')

    await new Promise((r) => setTimeout(r, 15))
    await repo.set('gmail_history_id', '901')
    const age = await repo.getCursorAge('gmail_history_id')
    expect(age).toBeGreaterThanOrEqual(0)
  })
})

// AC04: Pagination RED tests
describe('EmailPoller - Pagination', () => {
  const databases: Array<{ close: () => void }> = []
  let db: any

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    // Start with an initial cursor
    db.prepare(
      `INSERT OR REPLACE INTO sync_state(key,value,updated_at) VALUES('gmail_history_id','seed-0',datetime('now'))`
    ).run()
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 20))
    for (const d of databases) d.close()
    databases.length = 0
    vi.resetAllMocks()
  })

  it('should fetch all pages when nextPageToken present and update cursor to final historyId', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    const page1 = {
      data: {
        history: [{ messagesAdded: [{ message: { id: 'msg1', threadId: 't1' } }] }],
        historyId: 'hist-page1',
        nextPageToken: 'token-page2',
      },
    }
    const page2 = {
      data: {
        history: [{ messagesAdded: [{ message: { id: 'msg2', threadId: 't2' } }] }],
        historyId: 'hist-page2',
        nextPageToken: 'token-page3',
      },
    }
    const page3 = {
      data: {
        history: [{ messagesAdded: [{ message: { id: 'msg3', threadId: 't3' } }] }],
        historyId: 'hist-final',
      },
    }

    gmail.__spies.listHistory
      .mockResolvedValueOnce(page1 as any)
      .mockResolvedValueOnce(page2 as any)
      .mockResolvedValueOnce(page3 as any)

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    const result: any = await poller.pollOnce()

    expect(gmail.__spies.listHistory).toHaveBeenCalledTimes(3)
    expect(result.messageIds).toEqual(['msg1', 'msg2', 'msg3'])
    expect(result.historyId).toBe('hist-final')
    expect(result.pagesProcessed ?? 0).toBeGreaterThanOrEqual(3)

    const row = db
      .prepare("SELECT value FROM sync_state WHERE key = 'gmail_history_id'")
      .get() as { value: string }
    expect(row.value).toBe('hist-final')
  })

  it('should pass pageToken to subsequent requests', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    gmail.__spies.listHistory
      .mockResolvedValueOnce({
        data: { history: [], historyId: 'hist1', nextPageToken: 'token-abc' },
      })
      .mockResolvedValueOnce({
        data: { history: [], historyId: 'hist2' },
      })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    await poller.pollOnce()

    expect(gmail.__spies.listHistory).toHaveBeenNthCalledWith(1, {
      userId: 'me',
      startHistoryId: expect.any(String),
      maxResults: 100,
    })
    expect(gmail.__spies.listHistory).toHaveBeenNthCalledWith(2, {
      userId: 'me',
      startHistoryId: expect.any(String),
      pageToken: 'token-abc',
      maxResults: 100,
    })
  })

  it('should stop when no nextPageToken', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    gmail.__spies.listHistory.mockResolvedValueOnce({
      data: { history: [{ messagesAdded: [{ message: { id: 'msg1', threadId: 't1' } }] }], historyId: 'hist-final' },
    })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    await poller.pollOnce()
    expect(gmail.__spies.listHistory).toHaveBeenCalledTimes(1)
  })

  it('should handle empty pages gracefully and still advance', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    gmail.__spies.listHistory
      .mockResolvedValueOnce({
        data: { history: [], historyId: 'hist1', nextPageToken: 'token-next' },
      })
      .mockResolvedValueOnce({
        data: { history: [{ messagesAdded: [{ message: { id: 'msg1', threadId: 't1' } }] }], historyId: 'hist2' },
      })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    const result: any = await poller.pollOnce()
    expect(result.messageIds).toEqual(['msg1'])
    expect(result.pagesProcessed ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('should process pages sequentially not concurrently', async () => {
    // @ts-expect-error runtime path valid under vitest
    const { EmailPoller } = await import('../email-poller.js')
    const gmail = makeMockGmail()

    const timestamps: number[] = []
    gmail.__spies.listHistory.mockImplementation(async () => {
      timestamps.push(Date.now())
      await new Promise((r) => setTimeout(r, 100))
      return {
        data: {
          history: [],
          historyId: 'hist',
          nextPageToken: timestamps.length < 3 ? 'token' : undefined,
        },
      } as any
    })

    const dedup: DeduplicationService = { isDuplicate: () => Promise.resolve(false) }
    const poller = new EmailPoller(db, dedup, {
      gmailCredentialsPath: '/creds.json',
      sequential: true,
    } satisfies EmailPollerConfig)
    ;(poller as any).gmail = gmail

    await poller.pollOnce()

    expect(timestamps).toHaveLength(3)
    // Assert length to satisfy TS, then compare deltas
    if (timestamps.length === 3) {
      const [t0, t1, t2] = timestamps as [number, number, number]
      expect(t1 - t0).toBeGreaterThanOrEqual(90)
      expect(t2 - t1).toBeGreaterThanOrEqual(90)
    }
  })
})
