/**
 * Token Refresh Tests [AC04]
 * TDD RED phase - Test automatic token refresh before expiry
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'

describe('Token Expiry Detection [AC04]', () => {
  const tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = []

  afterEach(async () => {
    // 5-STEP CLEANUP (CRITICAL ORDER)
    // 1. Settle 100ms (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. TestKit auto-cleanup (temp directories)
    for (const dir of tempDirs) {
      try {
        await dir.cleanup()
      } catch {
        // Ignore cleanup errors
      }
    }
    tempDirs.length = 0

    // 3. Force GC last
    if (global.gc) global.gc()
  })

  it('should detect token expiring in less than 5 minutes [AC04]', async () => {
    const { isTokenExpired } = await import('../auth.js')

    // Token expiring in 4 minutes
    const fourMinutesFromNow = Date.now() + 4 * 60 * 1000
    const token = {
      access_token: 'test-token',
      expiry_date: fourMinutesFromNow,
    }

    expect(isTokenExpired(token)).toBe(true)
  })

  it('should detect token valid if expiring in more than 5 minutes [AC04]', async () => {
    const { isTokenExpired } = await import('../auth.js')

    // Token expiring in 10 minutes
    const tenMinutesFromNow = Date.now() + 10 * 60 * 1000
    const token = {
      access_token: 'test-token',
      expiry_date: tenMinutesFromNow,
    }

    expect(isTokenExpired(token)).toBe(false)
  })

  it('should detect token expired if expiry_date is in the past [AC04]', async () => {
    const { isTokenExpired } = await import('../auth.js')

    // Token expired 1 hour ago
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    const token = {
      access_token: 'test-token',
      expiry_date: oneHourAgo,
    }

    expect(isTokenExpired(token)).toBe(true)
  })

  it('should detect token expiring exactly at 5-minute boundary [AC04]', async () => {
    const { isTokenExpired } = await import('../auth.js')

    // Token expiring exactly in 5 minutes
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
    const token = {
      access_token: 'test-token',
      expiry_date: fiveMinutesFromNow,
    }

    // Should be considered expiring (< 5 minutes, not <=)
    expect(isTokenExpired(token)).toBe(false)
  })

  it('should handle token without expiry_date as expired [AC04]', async () => {
    const { isTokenExpired } = await import('../auth.js')

    const token = {
      access_token: 'test-token',
      // No expiry_date
    }

    expect(isTokenExpired(token)).toBe(true)
  })
})

describe('Automatic Token Refresh [AC04]', () => {
  const tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = []

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // 5-STEP CLEANUP
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const dir of tempDirs) {
      try {
        await dir.cleanup()
      } catch {
        // Ignore cleanup errors
      }
    }
    tempDirs.length = 0
    if (global.gc) global.gc()
  })

  it('should skip refresh if token is still valid [AC04]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const tokenPath = join(tempDir.path, 'token.json')

    // Create token expiring in 10 minutes (valid)
    const tenMinutesFromNow = Date.now() + 10 * 60 * 1000
    const validToken = {
      access_token: 'valid-access-token',
      refresh_token: 'refresh-token',
      expiry_date: tenMinutesFromNow,
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(tokenPath, JSON.stringify(validToken, undefined, 2))

    const { ensureValidToken } = await import('../auth.js')

    // Should not throw or modify token
    await expect(ensureValidToken(tokenPath)).resolves.toBeUndefined()

    // Verify token unchanged
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    const savedToken = JSON.parse(await fs.readFile(tokenPath, 'utf-8'))
    expect(savedToken.access_token).toBe('valid-access-token')
  })

  it('should refresh token if expiring soon [AC04]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const credentialsPath = join(tempDir.path, 'credentials.json')
    const tokenPath = join(tempDir.path, 'token.json')

    // Create credentials.json
    const mockCredentials = {
      installed: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        redirect_uris: ['http://localhost'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    // Create token expiring in 2 minutes (needs refresh)
    const twoMinutesFromNow = Date.now() + 2 * 60 * 1000
    const expiringToken = {
      access_token: 'expiring-access-token',
      refresh_token: 'refresh-token',
      expiry_date: twoMinutesFromNow,
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(tokenPath, JSON.stringify(expiringToken, undefined, 2))

    const { ensureValidToken } = await import('../auth.js')

    // Mock refreshAccessToken to return new tokens
    const mockNewTokens = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expiry_date: Date.now() + 3600000,
    }

    await expect(
      ensureValidToken(credentialsPath, tokenPath, undefined, {
        mockRefresh: { tokens: mockNewTokens },
      })
    ).resolves.toBeUndefined()

    // Verify token was refreshed
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    const savedToken = JSON.parse(await fs.readFile(tokenPath, 'utf-8'))
    expect(savedToken.access_token).toBe('new-access-token')
  })

  it('should write refreshed token atomically [AC04]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const credentialsPath = join(tempDir.path, 'credentials.json')
    const tokenPath = join(tempDir.path, 'token.json')

    const mockCredentials = {
      installed: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        redirect_uris: ['http://localhost'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    // Create expiring token
    const twoMinutesFromNow = Date.now() + 2 * 60 * 1000
    const expiringToken = {
      access_token: 'expiring-access-token',
      refresh_token: 'refresh-token',
      expiry_date: twoMinutesFromNow,
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(tokenPath, JSON.stringify(expiringToken, undefined, 2))

    const { ensureValidToken } = await import('../auth.js')

    const mockNewTokens = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expiry_date: Date.now() + 3600000,
    }

    await ensureValidToken(credentialsPath, tokenPath, undefined, {
      mockRefresh: { tokens: mockNewTokens },
    })

    // Verify no .tmp file remains after refresh
    const tmpPath = `${tokenPath}.tmp`
    await expect(fs.access(tmpPath)).rejects.toThrow()

    // Verify final file exists with new tokens
    await expect(fs.access(tokenPath)).resolves.toBeUndefined()
  })

  it('should handle invalid_grant error during refresh [AC04]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const credentialsPath = join(tempDir.path, 'credentials.json')
    const tokenPath = join(tempDir.path, 'token.json')

    const mockCredentials = {
      installed: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        redirect_uris: ['http://localhost'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    // Create expiring token
    const twoMinutesFromNow = Date.now() + 2 * 60 * 1000
    const expiringToken = {
      access_token: 'expiring-access-token',
      refresh_token: 'invalid-refresh-token',
      expiry_date: twoMinutesFromNow,
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(tokenPath, JSON.stringify(expiringToken, undefined, 2))

    const { ensureValidToken } = await import('../auth.js')

    // Mock invalid_grant error
    await expect(
      ensureValidToken(credentialsPath, tokenPath, undefined, {
        mockRefresh: { error: 'invalid_grant' },
      })
    ).rejects.toThrow('Token revoked')
  })

  it('should handle generic OAuth2 errors during refresh [AC04]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const credentialsPath = join(tempDir.path, 'credentials.json')
    const tokenPath = join(tempDir.path, 'token.json')

    const mockCredentials = {
      installed: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        redirect_uris: ['http://localhost'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    // Create expiring token
    const twoMinutesFromNow = Date.now() + 2 * 60 * 1000
    const expiringToken = {
      access_token: 'expiring-access-token',
      refresh_token: 'refresh-token',
      expiry_date: twoMinutesFromNow,
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(tokenPath, JSON.stringify(expiringToken, undefined, 2))

    const { ensureValidToken } = await import('../auth.js')

    // Mock generic OAuth2 error
    await expect(
      ensureValidToken(credentialsPath, tokenPath, undefined, {
        mockRefresh: { error: 'server_error' },
      })
    ).rejects.toThrow('OAuth2 error: server_error')
  })

  it('should handle malformed token during refresh attempt [AC04]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const tokenPath = join(tempDir.path, 'token.json')

    // Write malformed JSON
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test file path controlled by TestKit
    await fs.writeFile(tokenPath, '{invalid json}')

    const { ensureValidToken } = await import('../auth.js')

    // Should throw due to corrupted token
    await expect(ensureValidToken(tokenPath)).rejects.toThrow()
  })
})
