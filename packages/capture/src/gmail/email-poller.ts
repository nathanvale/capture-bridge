/**
 * Gmail EmailPoller
 *
 * Minimal implementation to satisfy AC01 (EMAIL_POLLING_GMAIL--T01):
 * - Constructor accepts EmailPollerConfig
 * - Default pollInterval: 60000ms
 * - pollOnce() exists and returns EmailPollResult (stub)
 * - Sequential execution constraint (no overlapping polls)
 */

import { z } from 'zod'

import type DatabaseConstructor from 'better-sqlite3'

export interface EmailPollerConfig {
  gmailCredentialsPath: string
  pollInterval?: number // Optional, defaults to 60000ms
  sequential: true // Enforce MPPP constraint
  rateLimitConfig?: {
    maxRequestsPerSecond: number
    burstCapacity: number
  }
}

export interface EmailPollResult {
  messagesFound: number
  messagesProcessed: number
  duplicatesSkipped: number
  errors: Array<{ messageId: string; error: string }>
  duration: number
}

// Same Database type pattern used elsewhere in gmail module
type Database = ReturnType<typeof DatabaseConstructor>

export interface DeduplicationService {
  isDuplicate: (params: { messageId: string }) => Promise<boolean>
}

export const DEFAULT_POLL_INTERVAL = 60000

// Zod schema for runtime validation (keeps TS shape with optional pollInterval)
const EmailPollerConfigSchema = z.object({
  gmailCredentialsPath: z.string().min(1, 'gmailCredentialsPath is required'),
  pollInterval: z
    .number()
    .int('pollInterval must be an integer')
    .positive('pollInterval must be > 0')
    .optional(),
  sequential: z.literal(true),
  rateLimitConfig: z
    .object({
      maxRequestsPerSecond: z.number().positive('maxRequestsPerSecond must be > 0'),
      burstCapacity: z
        .number()
        .int('burstCapacity must be an integer')
        .nonnegative('burstCapacity must be >= 0'),
    })
    .optional(),
})

export class EmailPoller {
  // Expose concrete config with defaulted pollInterval for tests and consumers
  public readonly config: EmailPollerConfig & { pollInterval: number }

  // Non-reentrant guard to serialize pollOnce calls
  private activePoll: Promise<EmailPollResult> | undefined = undefined

  constructor(
    private readonly _db: Database,
    private readonly _dedup: DeduplicationService,
    config: EmailPollerConfig
  ) {
    // Validate config (and keep defaults external to preserve optional type)
    const parsed = EmailPollerConfigSchema.parse(config)
    const pollInterval = parsed.pollInterval ?? DEFAULT_POLL_INTERVAL
    const cfg: EmailPollerConfig & { pollInterval: number } = {
      gmailCredentialsPath: parsed.gmailCredentialsPath,
      sequential: parsed.sequential,
      pollInterval,
    }
    if (parsed.rateLimitConfig) cfg.rateLimitConfig = parsed.rateLimitConfig
    this.config = cfg
  }

  /**
   * Performs a single Gmail polling cycle.
   * Currently a stub that returns empty result while architecture is wired.
   * Enforces sequential execution by preventing overlapping polls.
   */
  async pollOnce(): Promise<EmailPollResult> {
    // Serialize concurrent invocations
    if (this.activePoll) {
      // Wait for current poll to finish, then run a new one
      // Chain to ensure callers get their own poll execution result
      const next = this.activePoll.then(() => this.executePollOnce())
      this.activePoll = next
      try {
        return await next
      } finally {
        // Clear lock only if this is the last chained promise
        if (this.activePoll === next) this.activePoll = undefined
      }
    }

    const run = this.executePollOnce()
    this.activePoll = run
    try {
      return await run
    } finally {
      if (this.activePoll === run) this.activePoll = undefined
    }
  }

  /**
   * Internal implementation of a single poll cycle.
   * Returns a minimal, well-typed result for now.
   */
  private executePollOnce(): Promise<EmailPollResult> {
    const start = Date.now()

    // Placeholder: real implementation will use Gmail History API + messages.get
    // to collect new messages based on a persisted cursor in sync_state.

    // Touch injected dependencies to satisfy strict no-unused rules until fully implemented
    // eslint-disable-next-line no-console -- temporary to consume refs until implemented
    console.debug('EmailPoller deps bound', Boolean(this._db), Boolean(this._dedup))

    const result: EmailPollResult = {
      messagesFound: 0,
      messagesProcessed: 0,
      duplicatesSkipped: 0,
      errors: [],
      duration: Date.now() - start,
    }
    return Promise.resolve(result)
  }
}
