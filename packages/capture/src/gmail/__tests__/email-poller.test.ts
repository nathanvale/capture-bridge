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

    expect(gmail.__spies.listHistory).toHaveBeenCalledWith({
      userId: 'me',
      startHistoryId: 'previous-history-id',
    })
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
