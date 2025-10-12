/* eslint-disable import/no-unresolved */
/**
 * TDD RED Phase: Gmail EmailPoller polling interval and sequential execution
 * AC01 (EMAIL_POLLING_GMAIL--T01): Poll Gmail API every 60s (configurable)
 */

import Database from 'better-sqlite3'
import { describe, it, expect, afterEach, vi } from 'vitest'

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

    const poller = new EmailPoller(db as any, dedup, {
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

    const poller = new EmailPoller(db as any, dedup, {
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

    const poller = new EmailPoller(db as any, dedup, {
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

    const poller = new EmailPoller(db as any, dedup, {
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
        new EmailPoller(db as any, dedup, {
          gmailCredentialsPath: '/test/creds.json',
          sequential: true,
          pollInterval: 0,
        } as EmailPollerConfig)
    ).toThrowError()
  })
})
