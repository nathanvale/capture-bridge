/**
 * Gmail API Error Classification and Retry Logic
 *
 * AC05: Error handling for OAuth2 and Gmail API operations
 * - Classify errors by type (auth vs API, retryable vs permanent)
 * - Calculate exponential backoff with jitter
 * - Determine retry eligibility
 */

export enum ErrorType {
  AUTH_INVALID_GRANT = 'AUTH_INVALID_GRANT', // Token revoked or expired
  AUTH_INVALID_CLIENT = 'AUTH_INVALID_CLIENT', // Invalid credentials.json
  API_RATE_LIMITED = 'API_RATE_LIMITED', // Rate limit or quota exceeded
  API_NETWORK_ERROR = 'API_NETWORK_ERROR', // Network/timeout/unknown errors
}

export interface ErrorClassification {
  type: ErrorType
  retryable: boolean
  message: string
}

/**
 * Classify an error from OAuth2 or Gmail API operations
 *
 * @param error - Error object from OAuth2Client or Gmail API
 * @returns Classification with type, retryable flag, and message
 */
export const classifyError = (error: Error): ErrorClassification => {
  const { message } = error

  // AUTH_INVALID_GRANT: Token revoked or invalid (non-retryable)
  if (message.includes('invalid_grant')) {
    return {
      type: ErrorType.AUTH_INVALID_GRANT,
      retryable: false,
      message,
    }
  }

  // AUTH_INVALID_CLIENT: Invalid credentials.json (non-retryable)
  if (message.includes('invalid_client')) {
    return {
      type: ErrorType.AUTH_INVALID_CLIENT,
      retryable: false,
      message,
    }
  }

  // API_RATE_LIMITED: Rate limit or quota exceeded (retryable with backoff)
  if (message.includes('rate limit') || message.includes('Quota exceeded')) {
    return {
      type: ErrorType.API_RATE_LIMITED,
      retryable: true,
      message,
    }
  }

  // API_NETWORK_ERROR: Network/timeout errors (retryable with backoff)
  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
    return {
      type: ErrorType.API_NETWORK_ERROR,
      retryable: true,
      message,
    }
  }

  // Default: Treat unknown errors as network errors (retryable)
  return {
    type: ErrorType.API_NETWORK_ERROR,
    retryable: true,
    message,
  }
}

/**
 * Calculate exponential backoff with 30% jitter
 *
 * Backoff schedule (base values):
 * - Attempt 0: 30s
 * - Attempt 1: 60s
 * - Attempt 2: 300s (5 minutes)
 * - Attempt 3: 900s (15 minutes)
 * - Attempt 4+: 1800s (30 minutes, capped)
 *
 * Jitter: ±30% variation to prevent thundering herd
 *
 * @param attempt - Retry attempt number (0-indexed)
 * @returns Backoff delay in milliseconds
 */
export const calculateBackoff = (attempt: number): number => {
  // Base backoff schedule (in milliseconds)
  const backoffSchedule = [
    30000, // 30s
    60000, // 60s
    300000, // 5 minutes
    900000, // 15 minutes
    1800000, // 30 minutes (cap)
  ]

  // Get base delay, capped at max (1800s)
  // eslint-disable-next-line security/detect-object-injection -- Array index from numeric attempt parameter, bounded by schedule length
  const baseMs = backoffSchedule[attempt] ?? backoffSchedule[backoffSchedule.length - 1] ?? 1800000

  // Apply 30% jitter: random value between 0.7x and 1.3x of base
  // eslint-disable-next-line sonarjs/pseudo-random -- Jitter for backoff doesn't require cryptographic randomness
  const jitterFactor = 0.7 + Math.random() * 0.6 // 0.7 to 1.3
  const delayMs = baseMs * jitterFactor

  return Math.floor(delayMs)
}

/**
 * Determine if an error should be retried
 *
 * @param classification - Error classification from classifyError()
 * @returns true if error is retryable, false if permanent failure
 */
export const shouldRetry = (classification: ErrorClassification): boolean => {
  return classification.retryable
}
