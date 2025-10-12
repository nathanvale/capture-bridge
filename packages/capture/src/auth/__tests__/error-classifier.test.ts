import { describe, it, expect } from 'vitest'

describe('Gmail Error Classifier [AC05]', () => {
  describe('classifyError', () => {
    it('should classify invalid_grant errors as AUTH_INVALID_GRANT', async () => {
      const { classifyError, ErrorType } = await import('../error-classifier.js')

      const error = new Error('invalid_grant')
      const classification = classifyError(error)

      expect(classification.type).toBe(ErrorType.AUTH_INVALID_GRANT)
      expect(classification.retryable).toBe(false)
    })

    it('should classify invalid_client errors as AUTH_INVALID_CLIENT', async () => {
      const { classifyError, ErrorType } = await import('../error-classifier.js')

      const error = new Error('invalid_client: The OAuth client was not found.')
      const classification = classifyError(error)

      expect(classification.type).toBe(ErrorType.AUTH_INVALID_CLIENT)
      expect(classification.retryable).toBe(false)
    })

    it('should classify rate limit errors as API_RATE_LIMITED', async () => {
      const { classifyError, ErrorType } = await import('../error-classifier.js')

      const error = new Error('User rate limit exceeded')
      const classification = classifyError(error)

      expect(classification.type).toBe(ErrorType.API_RATE_LIMITED)
      expect(classification.retryable).toBe(true)
    })

    it('should classify quota exceeded errors as API_RATE_LIMITED', async () => {
      const { classifyError, ErrorType } = await import('../error-classifier.js')

      const error = new Error('Quota exceeded for quota metric')
      const classification = classifyError(error)

      expect(classification.type).toBe(ErrorType.API_RATE_LIMITED)
      expect(classification.retryable).toBe(true)
    })

    it('should classify network errors as API_NETWORK_ERROR', async () => {
      const { classifyError, ErrorType } = await import('../error-classifier.js')

      const error = new Error('ECONNREFUSED')
      const classification = classifyError(error)

      expect(classification.type).toBe(ErrorType.API_NETWORK_ERROR)
      expect(classification.retryable).toBe(true)
    })

    it('should classify timeout errors as API_NETWORK_ERROR', async () => {
      const { classifyError, ErrorType } = await import('../error-classifier.js')

      const error = new Error('ETIMEDOUT')
      const classification = classifyError(error)

      expect(classification.type).toBe(ErrorType.API_NETWORK_ERROR)
      expect(classification.retryable).toBe(true)
    })

    it('should classify unknown errors as API_NETWORK_ERROR with retry', async () => {
      const { classifyError, ErrorType } = await import('../error-classifier.js')

      const error = new Error('Something unexpected happened')
      const classification = classifyError(error)

      expect(classification.type).toBe(ErrorType.API_NETWORK_ERROR)
      expect(classification.retryable).toBe(true)
    })
  })

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff with jitter [30s, 60s, 300s, 900s, 1800s]', async () => {
      const { calculateBackoff } = await import('../error-classifier.js')

      // Test all retry attempts
      const expectedBase = [30000, 60000, 300000, 900000, 1800000]

      for (let attempt = 0; attempt < 5; attempt++) {
        const backoff = calculateBackoff(attempt)
        // eslint-disable-next-line security/detect-object-injection -- Array index from loop counter is safe
        const baseMs = expectedBase[attempt] ?? 1800000
        const minJitter = baseMs * 0.7 // 30% jitter means 70%-130% of base
        const maxJitter = baseMs * 1.3

        expect(backoff).toBeGreaterThanOrEqual(minJitter)
        expect(backoff).toBeLessThanOrEqual(maxJitter)
      }
    })

    it('should cap backoff at 1800s (30 minutes) after 5 attempts', async () => {
      const { calculateBackoff } = await import('../error-classifier.js')

      const backoff = calculateBackoff(10) // Way beyond 5 attempts
      const maxMs = 1800000 * 1.3 // Max with jitter

      expect(backoff).toBeLessThanOrEqual(maxMs)
    })

    it('should apply 30% jitter variation', async () => {
      const { calculateBackoff } = await import('../error-classifier.js')

      // Run multiple times to ensure we get variation
      const results = new Set<number>()
      for (let i = 0; i < 100; i++) {
        results.add(calculateBackoff(0))
      }

      // With jitter, we should get different values
      expect(results.size).toBeGreaterThan(1)

      // All values should be within 30% of base (30000ms)
      const values = Array.from(results)
      const min = Math.min(...values)
      const max = Math.max(...values)

      expect(min).toBeGreaterThanOrEqual(21000) // 30000 * 0.7
      expect(max).toBeLessThanOrEqual(39000) // 30000 * 1.3
    })
  })

  describe('shouldRetry', () => {
    it('should not retry AUTH_INVALID_GRANT errors', async () => {
      const { shouldRetry, ErrorType } = await import('../error-classifier.js')

      const classification = {
        type: ErrorType.AUTH_INVALID_GRANT,
        retryable: false,
        message: 'invalid_grant',
      }

      expect(shouldRetry(classification)).toBe(false)
    })

    it('should not retry AUTH_INVALID_CLIENT errors', async () => {
      const { shouldRetry, ErrorType } = await import('../error-classifier.js')

      const classification = {
        type: ErrorType.AUTH_INVALID_CLIENT,
        retryable: false,
        message: 'invalid_client',
      }

      expect(shouldRetry(classification)).toBe(false)
    })

    it('should retry API_RATE_LIMITED errors', async () => {
      const { shouldRetry, ErrorType } = await import('../error-classifier.js')

      const classification = {
        type: ErrorType.API_RATE_LIMITED,
        retryable: true,
        message: 'rate limit exceeded',
      }

      expect(shouldRetry(classification)).toBe(true)
    })

    it('should retry API_NETWORK_ERROR errors', async () => {
      const { shouldRetry, ErrorType } = await import('../error-classifier.js')

      const classification = {
        type: ErrorType.API_NETWORK_ERROR,
        retryable: true,
        message: 'network timeout',
      }

      expect(shouldRetry(classification)).toBe(true)
    })
  })
})
