/**
 * OAuth2 Authorization Flow Tests (AC02)
 * Risk Level: High
 * TDD: Required
 *
 * Tests OAuth2 authorization flow including:
 * - Generate auth URL with correct scope (gmail.readonly)
 * - Generate auth URL with access_type=offline (for refresh token)
 * - Exchange authorization code for tokens
 * - Save tokens to file with 0600 permissions
 * - Atomic write using temp file + rename pattern
 * - Error: invalid authorization code
 * - Error: network failure during token exchange
 */

import { afterEach, describe, expect, it } from 'vitest'

import type { OAuth2Client } from 'google-auth-library'

describe('OAuth2 Authorization Flow', () => {
  const databases: Array<{ close: () => void }> = []
  const pools: Array<{ drain: () => Promise<void> }> = []

  afterEach(async () => {
    // 5-step cleanup sequence
    // 0. Custom resources (none in this test)
    // 1. Settle
    await new Promise((resolve) => setTimeout(resolve, 100))
    // 2. Drain pools
    for (const pool of pools) await pool.drain()
    pools.length = 0
    // 3. Close databases
    for (const db of databases) db.close()
    databases.length = 0
    // 4. TestKit auto-cleanup (temp directories)
    // 5. Force GC
    if (global.gc) global.gc()
  })

  describe('generateAuthUrl', () => {
    it('should generate auth URL with gmail.readonly scope', async () => {
      const { generateAuthUrl } = await import('../oauth-flow.js')

      const mockOAuth2Client = {
        generateAuthUrl: (options: any) =>
          `https://accounts.google.com/o/oauth2/auth?access_type=${options.access_type}&scope=${options.scope.join(',')}`,
      } as unknown as OAuth2Client

      const authUrl = generateAuthUrl(mockOAuth2Client)

      expect(authUrl).toBeTruthy()
      expect(authUrl).toContain('https://accounts.google.com/o/oauth2')
      expect(authUrl).toContain('scope')
      expect(authUrl).toContain('gmail.readonly')
    })

    it('should generate auth URL with access_type=offline for refresh token', async () => {
      const { generateAuthUrl } = await import('../oauth-flow.js')

      const mockOAuth2Client = {
        generateAuthUrl: (options: any) =>
          `https://accounts.google.com/o/oauth2/auth?access_type=${options.access_type}&scope=${options.scope.join(',')}`,
      } as unknown as OAuth2Client

      const authUrl = generateAuthUrl(mockOAuth2Client)

      expect(authUrl).toContain('access_type')
      expect(authUrl).toContain('offline')
    })
  })

  describe('exchangeCodeForTokens', () => {
    it('should exchange authorization code for tokens', async () => {
      // RED: This test should fail because exchangeCodeForTokens doesn't exist yet
      const { exchangeCodeForTokens } = await import('../oauth-flow.js')

      const mockTokens = {
        access_token: 'ya29.a0AfH6SMBx...',
        refresh_token: '1//0gKZx...',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer' as const,
      }

      const mockOAuth2Client = {
        getToken: () => Promise.resolve({ tokens: mockTokens }),
      } as unknown as OAuth2Client

      const tokens = await exchangeCodeForTokens(mockOAuth2Client, 'test-auth-code')

      expect(tokens).toBeDefined()
      expect(tokens.access_token).toBe(mockTokens.access_token)
      expect(tokens.refresh_token).toBe(mockTokens.refresh_token)
      expect(tokens.expiry_date).toBe(mockTokens.expiry_date)
      expect(tokens.token_type).toBe('Bearer')
    })

    it('should throw error for invalid authorization code', async () => {
      // RED: This test should fail because exchangeCodeForTokens doesn't exist yet
      const { exchangeCodeForTokens } = await import('../oauth-flow.js')

      const mockOAuth2Client = {
        getToken: () => {
          const error = new Error('invalid_grant') as Error & { code?: string }
          error.code = 'invalid_grant'
          return Promise.reject(error)
        },
      } as unknown as OAuth2Client

      await expect(exchangeCodeForTokens(mockOAuth2Client, 'invalid-code')).rejects.toThrow(
        /invalid.*code|authorization.*failed/i
      )
    })

    it('should throw error for network failure during token exchange', async () => {
      // RED: This test should fail because exchangeCodeForTokens doesn't exist yet
      const { exchangeCodeForTokens } = await import('../oauth-flow.js')

      const mockOAuth2Client = {
        getToken: () => {
          const error = new Error('Network error') as Error & { code?: string }
          error.code = 'ECONNREFUSED'
          return Promise.reject(error)
        },
      } as unknown as OAuth2Client

      await expect(exchangeCodeForTokens(mockOAuth2Client, 'test-code')).rejects.toThrow(/network|connection/i)
    })
  })

  describe('saveTokenSecurely', () => {
    it('should save tokens to file with 0600 permissions', async () => {
      // RED: This test should fail because saveTokenSecurely doesn't exist yet
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { saveTokenSecurely } = await import('../oauth-flow.js')
      const fs = await import('node:fs/promises')

      const tempDir = await createTempDirectory()
      const tokenPath = `${tempDir.path}/token.json`

      const mockToken = {
        access_token: 'ya29.test',
        refresh_token: '1//0test',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer' as const,
      }

      await saveTokenSecurely(tokenPath, mockToken)

      // Verify file exists
      const stats = await fs.stat(tokenPath)
      expect(stats.isFile()).toBe(true)

      // Verify permissions are 0600
      const mode = stats.mode & parseInt('777', 8)
      expect(mode).toBe(parseInt('600', 8))

      // Verify content
      const content = await fs.readFile(tokenPath, 'utf-8')
      const savedToken = JSON.parse(content)
      expect(savedToken.access_token).toBe(mockToken.access_token)
      expect(savedToken.refresh_token).toBe(mockToken.refresh_token)
    })

    it('should use atomic write pattern (temp file + rename)', async () => {
      // RED: This test should fail because saveTokenSecurely doesn't exist yet
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { saveTokenSecurely } = await import('../oauth-flow.js')
      const fs = await import('node:fs/promises')

      const tempDir = await createTempDirectory()
      const tokenPath = `${tempDir.path}/token.json`

      const mockToken = {
        access_token: 'ya29.test',
        refresh_token: '1//0test',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer' as const,
      }

      // Save token
      await saveTokenSecurely(tokenPath, mockToken)

      // Verify temp file was cleaned up (shouldn't exist)
      const tempFilePath = `${tokenPath}.tmp`
      await expect(fs.access(tempFilePath)).rejects.toThrow()

      // Verify final file exists
      await expect(fs.access(tokenPath)).resolves.toBeUndefined()
    })

    it('should validate token structure before saving', async () => {
      // RED: This test should fail because saveTokenSecurely doesn't exist yet
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { saveTokenSecurely } = await import('../oauth-flow.js')

      const tempDir = await createTempDirectory()
      const tokenPath = `${tempDir.path}/token.json`

      const invalidToken = {
        access_token: 'ya29.test',
        // Missing refresh_token
        expiry_date: Date.now() + 3600000,
      } as any

      await expect(saveTokenSecurely(tokenPath, invalidToken)).rejects.toThrow(/token.*invalid|missing.*refresh_token/i)
    })
  })

  describe('Integration: Complete OAuth2 flow', () => {
    it('should complete full OAuth2 flow from URL generation to token save', async () => {
      // RED: This test should fail because functions don't exist yet
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { generateAuthUrl, exchangeCodeForTokens, saveTokenSecurely } = await import('../oauth-flow.js')
      const fs = await import('node:fs/promises')

      const tempDir = await createTempDirectory()
      const tokenPath = `${tempDir.path}/token.json`

      // Step 1: Generate auth URL
      const mockOAuth2Client = {
        generateAuthUrl: (options: any) =>
          `https://accounts.google.com/o/oauth2/auth?access_type=${options.access_type}&scope=${options.scope.join(',')}`,
        getToken: () =>
          Promise.resolve({
            tokens: {
              access_token: 'ya29.integration',
              refresh_token: '1//0integration',
              expiry_date: Date.now() + 3600000,
              scope: 'https://www.googleapis.com/auth/gmail.readonly',
              token_type: 'Bearer' as const,
            },
          }),
      } as unknown as OAuth2Client

      const authUrl = generateAuthUrl(mockOAuth2Client)
      expect(authUrl).toContain('gmail.readonly')
      expect(authUrl).toContain('offline')

      // Step 2: Exchange code for tokens
      const tokens = await exchangeCodeForTokens(mockOAuth2Client, 'test-code')
      expect(tokens.access_token).toBeTruthy()
      expect(tokens.refresh_token).toBeTruthy()

      // Step 3: Save tokens securely
      await saveTokenSecurely(tokenPath, tokens)

      // Verify final result
      const stats = await fs.stat(tokenPath)
      const mode = stats.mode & parseInt('777', 8)
      expect(mode).toBe(parseInt('600', 8))

      const content = await fs.readFile(tokenPath, 'utf-8')
      const savedToken = JSON.parse(content)
      expect(savedToken.access_token).toBe('ya29.integration')
    })
  })
})
