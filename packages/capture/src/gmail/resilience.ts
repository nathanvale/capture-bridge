import { randomInt } from 'node:crypto'

export enum BreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export class ExponentialBackoff {
  constructor(
    private baseDelay = 1000,
    private maxDelay = 64000,
    private multiplier = 2,
    private jitterFactor = 0.3
  ) {}

  // attempt is 1-based
  calculateDelay(attempt: number): number {
    const raw = Math.min(
      this.baseDelay * Math.pow(this.multiplier, attempt - 1),
      this.maxDelay
    )
  // Positive jitter only (0..+jitterFactor) using crypto-safe random source.
  const randUnit = randomInt(0, 1_000_000) / 1_000_000 // [0, 1)
  const jitter = randUnit * this.jitterFactor
    return Math.floor(raw * (1 + jitter))
  }

  reset(): void {
    // Stateless for now (attempt passed in); provided for API parity/tests
  }
}

export class SimpleCircuitBreaker {
  private failures = 0
  private state: BreakerState = BreakerState.CLOSED
  private lastOpenedAt?: Date

  constructor(
    private errorThreshold = 5,
    private resetTimeout = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === BreakerState.OPEN) {
      const openedAt = this.lastOpenedAt?.getTime() ?? 0
      const elapsed = Date.now() - openedAt
      if (elapsed >= this.resetTimeout) {
        this.state = BreakerState.HALF_OPEN
      } else {
        throw new Error('Circuit breaker is open')
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error: unknown) {
      this.onFailure(error)
      throw error
    }
  }

  private onSuccess(): void {
    this.failures = 0
    if (this.state === BreakerState.HALF_OPEN) this.state = BreakerState.CLOSED
  }

  private onFailure(error: unknown): void {
    // Do not count 429 rate limits as breaker failures
    const code = (error as { code?: number; status?: number } | undefined)?.code ??
      (error as { code?: number; status?: number } | undefined)?.status
    if (code === 429) return

    this.failures += 1
    if (this.failures >= this.errorThreshold) {
      this.state = BreakerState.OPEN
      this.lastOpenedAt = new Date()
    }
  }

  getState(): BreakerState {
    return this.state
  }
}
