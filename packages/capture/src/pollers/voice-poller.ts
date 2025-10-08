import type {
  VoicePollerConfig,
  VoicePollResult,
  DatabaseClient,
  DeduplicationService,
} from './types.js'

const DEFAULT_POLL_INTERVAL = 30000 // 30 seconds

export class VoicePoller {
  private intervalId: NodeJS.Timeout | undefined = undefined
  private config: VoicePollerConfig & { pollInterval: number }

  constructor(
    // @ts-expect-error - Will be used in future ACs

    private db: DatabaseClient,
    // @ts-expect-error - Will be used in future ACs

    private dedup: DeduplicationService,
    config: VoicePollerConfig
  ) {
    // Apply default poll interval if not specified
    this.config = {
      ...config,
      pollInterval: config.pollInterval ?? DEFAULT_POLL_INTERVAL,
    }
  }

  /**
   * Single poll cycle - returns immediately after processing
   */
  // eslint-disable-next-line require-await -- Will have await in future implementation
  async pollOnce(): Promise<VoicePollResult> {
    // Stub implementation for now
    return Promise.resolve({
      filesFound: 0,
      filesProcessed: 0,
      duplicatesSkipped: 0,
      errors: [],
      duration: 100,
    })
  }

  /**
   * Start continuous polling with the configured interval
   */
  async startContinuous(): Promise<void> {
    // Idempotent - return if already running
    if (this.intervalId) return

    // Initial poll
    await this.pollOnce()

    // Set up interval for subsequent polls
    this.intervalId = setInterval(async () => {
      try {
        await this.pollOnce()
      } catch (error) {
        // eslint-disable-next-line no-console -- Required for error logging in polling loop
        console.error('Poll cycle failed:', error)
      }
    }, this.config.pollInterval)
  }

  /**
   * Stop the continuous polling
   */
  // eslint-disable-next-line require-await -- Async for consistency with future implementations
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }

  /**
   * Shutdown method for resource cleanup
   * Required by TestKit pattern for classes with timers
   */
  async shutdown(): Promise<void> {
    await this.stop()
  }
}
