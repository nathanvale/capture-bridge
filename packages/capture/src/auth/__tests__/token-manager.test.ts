/**
 * Token Manager Tests
 *
 * Tests for AC03-AC04:
 * - AC03: token.json storage (local file)
 * - AC04: Automatic token refresh (before expiry)
 *
 * Risk Level: High
 */

/* eslint-disable import/no-unresolved -- RED phase: module doesn't exist yet */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TokenInfo } from '../oauth-flow.js'
import type Database from 'better-sqlite3'

describe('TokenManager - AC03: Token Storage', () => {
  const databases: Database.Database[] = []
  let tempDir: { path: string; cleanup: () => Promise<void> }

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    tempDir = await createTempDirectory()
  })

  afterEach(async () => {
    // 5-step cleanup
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const db of databases) db.close()
    databases.length = 0
    if (global.gc) global.gc()
  })

  it('should load valid token from file', async () => {
    const { TokenManager } = await import('../token-manager.js')
    const { writeFile } = await import('node:fs/promises')

    const tokenPath = `${tempDir.path}/token.json`
    const validToken: TokenInfo = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() + 3600000, // 1 hour from now
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    await writeFile(tokenPath, JSON.stringify(validToken), { mode: 0o600 })

    const manager = new TokenManager()
    const token = await manager.loadToken(tokenPath)

    expect(token.access_token).toBe('ya29.test_access_token')
    expect(token.refresh_token).toBe('1//test_refresh_token')
    expect(token.expiry_date).toBe(validToken.expiry_date)
  })

  it('should validate token structure - missing access_token', async () => {
    const { TokenManager } = await import('../token-manager.js')
    const { writeFile } = await import('node:fs/promises')

    const tokenPath = `${tempDir.path}/token.json`
    const invalidToken = {
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() + 3600000,
    }

    await writeFile(tokenPath, JSON.stringify(invalidToken))

    const manager = new TokenManager()
    await expect(manager.loadToken(tokenPath)).rejects.toThrow('missing access_token')
  })

  it('should validate token structure - missing refresh_token', async () => {
    const { TokenManager } = await import('../token-manager.js')
    const { writeFile } = await import('node:fs/promises')

    const tokenPath = `${tempDir.path}/token.json`
    const invalidToken = {
      access_token: 'ya29.test_access_token',
      expiry_date: Date.now() + 3600000,
    }

    await writeFile(tokenPath, JSON.stringify(invalidToken))

    const manager = new TokenManager()
    await expect(manager.loadToken(tokenPath)).rejects.toThrow('missing refresh_token')
  })

  it('should validate token structure - missing expiry_date', async () => {
    const { TokenManager } = await import('../token-manager.js')
    const { writeFile } = await import('node:fs/promises')

    const tokenPath = `${tempDir.path}/token.json`
    const invalidToken = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
    }

    await writeFile(tokenPath, JSON.stringify(invalidToken))

    const manager = new TokenManager()
    await expect(manager.loadToken(tokenPath)).rejects.toThrow('missing expiry_date')
  })

  it('should throw on file not found', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const tokenPath = `${tempDir.path}/nonexistent.json`
    const manager = new TokenManager()

    await expect(manager.loadToken(tokenPath)).rejects.toThrow('ENOENT')
  })

  it('should throw on invalid JSON', async () => {
    const { TokenManager } = await import('../token-manager.js')
    const { writeFile } = await import('node:fs/promises')

    const tokenPath = `${tempDir.path}/token.json`

    await writeFile(tokenPath, 'not valid json{')

    const manager = new TokenManager()
    await expect(manager.loadToken(tokenPath)).rejects.toThrow()
  })

  it('should verify token file has 0600 permissions after save', async () => {
    const { TokenManager } = await import('../token-manager.js')
    const { stat } = await import('node:fs/promises')

    const tokenPath = `${tempDir.path}/token.json`
    const validToken: TokenInfo = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const manager = new TokenManager()
    await manager.saveToken(tokenPath, validToken)

    const stats = await stat(tokenPath)
    const mode = stats.mode & parseInt('777', 8)
    expect(mode).toBe(0o600)
  })
})

describe('TokenManager - AC04: Token Expiry Detection', () => {
  const databases: Database.Database[] = []

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const db of databases) db.close()
    databases.length = 0
    if (global.gc) global.gc()
  })

  it('should detect token as valid when > 5 minutes until expiry', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const validToken: TokenInfo = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() + 10 * 60 * 1000, // 10 minutes from now
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const manager = new TokenManager()
    const isExpired = manager.isTokenExpired(validToken)
    expect(isExpired).toBe(false)
  })

  it('should detect token as expired when < 5 minutes until expiry', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const expiringToken: TokenInfo = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() + 4 * 60 * 1000, // 4 minutes from now
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const manager = new TokenManager()
    const isExpired = manager.isTokenExpired(expiringToken)
    expect(isExpired).toBe(true)
  })

  it('should detect token as expired when already past expiry', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const expiredToken: TokenInfo = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() - 1000, // 1 second ago
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const manager = new TokenManager()
    const isExpired = manager.isTokenExpired(expiredToken)
    expect(isExpired).toBe(true)
  })

  it('should get token state as "valid"', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const validToken: TokenInfo = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() + 10 * 60 * 1000, // 10 minutes from now
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const manager = new TokenManager()
    const state = manager.getTokenState(validToken)
    expect(state).toBe('valid')
  })

  it('should get token state as "expiring_soon"', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const expiringToken: TokenInfo = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() + 4 * 60 * 1000, // 4 minutes from now
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const manager = new TokenManager()
    const state = manager.getTokenState(expiringToken)
    expect(state).toBe('expiring_soon')
  })

  it('should get token state as "expired"', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const expiredToken: TokenInfo = {
      access_token: 'ya29.test_access_token',
      refresh_token: '1//test_refresh_token',
      expiry_date: Date.now() - 1000, // 1 second ago
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const manager = new TokenManager()
    const state = manager.getTokenState(expiredToken)
    expect(state).toBe('expired')
  })

  it('should get token state as "revoked" when missing refresh_token', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const revokedToken = {
      access_token: 'ya29.test_access_token',
      refresh_token: '',
      expiry_date: Date.now() + 10 * 60 * 1000,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer' as const,
    }

    const manager = new TokenManager()
    const state = manager.getTokenState(revokedToken)
    expect(state).toBe('revoked')
  })
})

describe('TokenManager - AC04: Token Refresh', () => {
  const databases: Database.Database[] = []
  let tempDir: { path: string; cleanup: () => Promise<void> }

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    tempDir = await createTempDirectory()
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const db of databases) db.close()
    databases.length = 0
    if (global.gc) global.gc()
  })

  it('should refresh token successfully with mock OAuth2 client', async () => {
    const { TokenManager } = await import('../token-manager.js')

    // Mock OAuth2 client
    const mockOAuth2Client = {
      refreshAccessToken: async () => ({
        credentials: {
          access_token: 'ya29.new_access_token',
          refresh_token: '1//test_refresh_token',
          expiry_date: Date.now() + 3600000,
        },
      }),
    } as any

    const manager = new TokenManager()
    const newToken = await manager.refreshToken(mockOAuth2Client)

    expect(newToken.access_token).toBe('ya29.new_access_token')
    expect(newToken.expiry_date).toBeGreaterThan(Date.now())
  })

  it('should retry token refresh on transient network error', async () => {
    const { TokenManager } = await import('../token-manager.js')

    let attemptCount = 0
    const mockOAuth2Client = {
      refreshAccessToken: async () => {
        attemptCount++
        if (attemptCount < 2) {
          const error = new Error('Network timeout') as Error & { code: string }
          error.code = 'ETIMEDOUT'
          throw error
        }
        return {
          credentials: {
            access_token: 'ya29.new_access_token',
            refresh_token: '1//test_refresh_token',
            expiry_date: Date.now() + 3600000,
          },
        }
      },
    } as any

    const manager = new TokenManager()
    const newToken = await manager.refreshToken(mockOAuth2Client)

    expect(attemptCount).toBe(2) // Should retry once
    expect(newToken.access_token).toBe('ya29.new_access_token')
  })

  it('should throw on invalid_grant error (permanent failure)', async () => {
    const { TokenManager } = await import('../token-manager.js')

    const mockOAuth2Client = {
      refreshAccessToken: async () => {
        const error = new Error('invalid_grant') as Error & { code: string }
        error.code = 'invalid_grant'
        throw error
      },
    } as any

    const manager = new TokenManager()
    await expect(manager.refreshToken(mockOAuth2Client)).rejects.toThrow('Refresh token revoked or invalid')
  })
})
