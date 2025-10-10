/**
 * Error Handling Tests for Gmail OAuth2 [AC05]
 * Tests error handling for invalid credentials, revoked tokens, and rate limits
 */

import { describe, it, expect, afterEach } from 'vitest'

import { GmailAuthError, GmailErrorType } from '../types.js'

describe('Gmail OAuth2 Error Handling [AC05]', () => {
  const databases: Array<{ close: () => void }> = []
  const pools: Array<{ drain: () => Promise<void> }> = []

  afterEach(async () => {
    // 5-step cleanup
    // 1. Settle 100ms
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. Drain pools
    for (const pool of pools) await pool.drain()

    // 3. Close databases
    for (const db of databases) db.close()

    // 4. TestKit auto-cleanup (temp directories)

    // 5. Force GC
    if (global.gc) global.gc()

    // Clear arrays
    pools.length = 0
    databases.length = 0
  })

  describe('Invalid credentials.json handling', () => {
    it('should throw GmailAuthError for missing client_id field', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const invalidCredentials = {
        installed: {
          client_secret: 'secret',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      const credentialsPath = `${tempDir.path}/credentials.json`
      const fs = await import('node:fs/promises')
      await fs.writeFile(credentialsPath, JSON.stringify(invalidCredentials))

      const { loadCredentials } = await import('../credentials.js')

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)

      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.type).toBe(GmailErrorType.AUTH_INVALID_CLIENT)
          expect(error.message).toContain('client_id')
          expect(error.cause).toBeDefined() // Original error preserved
        }
      }
    })

    it('should throw GmailAuthError for missing client_secret field', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const invalidCredentials = {
        installed: {
          client_id: '12345',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      const credentialsPath = `${tempDir.path}/credentials.json`
      const fs = await import('node:fs/promises')
      await fs.writeFile(credentialsPath, JSON.stringify(invalidCredentials))

      const { loadCredentials } = await import('../credentials.js')

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)

      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.type).toBe(GmailErrorType.AUTH_INVALID_CLIENT)
          expect(error.message).toContain('client_secret')
          expect(error.cause).toBeDefined()
        }
      }
    })

    it('should throw GmailAuthError for missing redirect_uris field', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const invalidCredentials = {
        installed: {
          client_id: '12345',
          client_secret: 'secret',
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      const credentialsPath = `${tempDir.path}/credentials.json`
      const fs = await import('node:fs/promises')
      await fs.writeFile(credentialsPath, JSON.stringify(invalidCredentials))

      const { loadCredentials } = await import('../credentials.js')

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)

      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.type).toBe(GmailErrorType.AUTH_INVALID_CLIENT)
          expect(error.message).toContain('redirect_uris')
          expect(error.cause).toBeDefined()
        }
      }
    })
  })

  describe('Malformed credentials.json handling', () => {
    it('should throw GmailAuthError for invalid JSON syntax', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const credentialsPath = `${tempDir.path}/credentials.json`
      const fs = await import('node:fs/promises')
      // Write invalid JSON (missing closing brace)
      await fs.writeFile(credentialsPath, '{"installed": {')

      const { loadCredentials } = await import('../credentials.js')

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)

      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.type).toBe(GmailErrorType.FILE_PARSE_ERROR)
          expect(error.message).toContain('invalid JSON')
          expect(error.cause).toBeDefined()
          expect(error.cause).toBeInstanceOf(SyntaxError)
        }
      }
    })

    it('should throw GmailAuthError for empty JSON object', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const credentialsPath = `${tempDir.path}/credentials.json`
      const fs = await import('node:fs/promises')
      await fs.writeFile(credentialsPath, '{}')

      const { loadCredentials } = await import('../credentials.js')

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)

      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.type).toBe(GmailErrorType.AUTH_INVALID_CLIENT)
          expect(error.message).toContain('installed')
          expect(error.cause).toBeDefined()
        }
      }
    })
  })

  describe('Revoked token handling (HTTP 401)', () => {
    it('should throw GmailAuthError with "Token revoked" for invalid_grant error', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      // Create valid credentials
      const credentials = {
        installed: {
          client_id: '12345',
          client_secret: 'secret',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      const credentialsPath = `${tempDir.path}/credentials.json`
      const tokenPath = `${tempDir.path}/token.json`

      const fs = await import('node:fs/promises')
      await fs.writeFile(credentialsPath, JSON.stringify(credentials))

      // Create expired token
      const expiredToken = {
        access_token: 'expired_token',
        refresh_token: 'invalid_refresh',
        expiry_date: Date.now() - 10000, // Expired 10 seconds ago
      }
      await fs.writeFile(tokenPath, JSON.stringify(expiredToken))

      const { ensureValidToken } = await import('../auth.js')

      // Simulate invalid_grant error (token revoked)
      await expect(
        ensureValidToken(credentialsPath, tokenPath, undefined, {
          mockRefresh: { error: 'invalid_grant' },
        })
      ).rejects.toThrow(GmailAuthError)

      try {
        await ensureValidToken(credentialsPath, tokenPath, undefined, {
          mockRefresh: { error: 'invalid_grant' },
        })
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.type).toBe(GmailErrorType.AUTH_INVALID_GRANT)
          expect(error.message).toContain('Token revoked')
          expect(error.cause).toBeDefined()
        }
      }
    })

    it('should preserve original error details in error.cause', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const credentials = {
        installed: {
          client_id: '12345',
          client_secret: 'secret',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      const credentialsPath = `${tempDir.path}/credentials.json`
      const tokenPath = `${tempDir.path}/token.json`

      const fs = await import('node:fs/promises')
      await fs.writeFile(credentialsPath, JSON.stringify(credentials))

      const expiredToken = {
        access_token: 'expired_token',
        refresh_token: 'invalid_refresh',
        expiry_date: Date.now() - 10000,
      }
      await fs.writeFile(tokenPath, JSON.stringify(expiredToken))

      const { ensureValidToken } = await import('../auth.js')

      try {
        await ensureValidToken(credentialsPath, tokenPath, undefined, {
          mockRefresh: { error: 'invalid_grant' },
        })
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.cause).toBeDefined()
          // Verify original error is preserved
          const originalError = error.cause as Error
          expect(originalError.message).toContain('invalid_grant')
        }
      }
    })
  })

  describe('Rate limit handling (HTTP 429)', () => {
    it('should throw GmailAuthError for rate limit with retry-after duration', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const credentials = {
        installed: {
          client_id: '12345',
          client_secret: 'secret',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      const credentialsPath = `${tempDir.path}/credentials.json`
      const tokenPath = `${tempDir.path}/token.json`

      const fs = await import('node:fs/promises')
      await fs.writeFile(credentialsPath, JSON.stringify(credentials))

      const expiredToken = {
        access_token: 'expired_token',
        refresh_token: 'valid_refresh',
        expiry_date: Date.now() - 10000,
      }
      await fs.writeFile(tokenPath, JSON.stringify(expiredToken))

      const { ensureValidToken } = await import('../auth.js')

      // Simulate rate limit error with retry-after
      const rateLimitError = {
        status: 429,
        message: 'Rate limit exceeded',
        retryAfter: 60, // Retry after 60 seconds
      }

      await expect(
        ensureValidToken(credentialsPath, tokenPath, undefined, {
          mockRefresh: { error: JSON.stringify(rateLimitError) },
        })
      ).rejects.toThrow(GmailAuthError)

      try {
        await ensureValidToken(credentialsPath, tokenPath, undefined, {
          mockRefresh: { error: JSON.stringify(rateLimitError) },
        })
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.type).toBe(GmailErrorType.API_RATE_LIMITED)
          expect(error.message).toContain('Rate limit')
          expect(error.message).toContain('60') // Should include retry-after duration
          expect(error.cause).toBeDefined()
        }
      }
    })

    it('should throw GmailAuthError for rate limit without retry-after', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const credentials = {
        installed: {
          client_id: '12345',
          client_secret: 'secret',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      const credentialsPath = `${tempDir.path}/credentials.json`
      const tokenPath = `${tempDir.path}/token.json`

      const fs = await import('node:fs/promises')
      await fs.writeFile(credentialsPath, JSON.stringify(credentials))

      const expiredToken = {
        access_token: 'expired_token',
        refresh_token: 'valid_refresh',
        expiry_date: Date.now() - 10000,
      }
      await fs.writeFile(tokenPath, JSON.stringify(expiredToken))

      const { ensureValidToken } = await import('../auth.js')

      // Simulate rate limit error without retry-after
      const rateLimitError = {
        status: 429,
        message: 'Rate limit exceeded',
      }

      await expect(
        ensureValidToken(credentialsPath, tokenPath, undefined, {
          mockRefresh: { error: JSON.stringify(rateLimitError) },
        })
      ).rejects.toThrow(GmailAuthError)

      try {
        await ensureValidToken(credentialsPath, tokenPath, undefined, {
          mockRefresh: { error: JSON.stringify(rateLimitError) },
        })
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.type).toBe(GmailErrorType.API_RATE_LIMITED)
          expect(error.message).toContain('Rate limit')
          expect(error.cause).toBeDefined()
        }
      }
    })
  })

  describe('Error.cause preservation', () => {
    it('should preserve original error in cause for all error types', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const credentialsPath = `${tempDir.path}/credentials.json`
      const fs = await import('node:fs/promises')

      // Test 1: File parse error
      await fs.writeFile(credentialsPath, '{"invalid"}')

      const { loadCredentials } = await import('../credentials.js')

      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.cause).toBeInstanceOf(SyntaxError)
        }
      }

      // Test 2: Missing fields error
      await fs.writeFile(credentialsPath, '{"installed": {}}')

      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.cause).toBeDefined()
          expect(error.cause).toBeInstanceOf(Error)
        }
      }
    })
  })
})
