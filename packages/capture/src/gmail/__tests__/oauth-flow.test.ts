/**
 * OAuth2 Authorization Flow Tests [AC02 + AC03]
 * TDD RED phase - Test-first implementation
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect, afterEach } from 'vitest'

describe('OAuth2 Authorization Flow [AC02]', () => {
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

  it('should generate authorization URL with gmail.readonly scope [AC02]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    // Create mock credentials.json
    const credentialsPath = join(tempDir.path, 'credentials.json')
    const mockCredentials = {
      installed: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        redirect_uris: ['http://localhost'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    }
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    // Import function under test
    const { authorize } = await import('../auth.js')

    // Execute OAuth flow (mock mode)
    const result = await authorize(credentialsPath)

    // Verify auth URL generated
    expect(result.authUrl).toBeDefined()
    expect(result.authUrl).toContain('access_type=offline')
    expect(result.authUrl).toContain('scope=')
    expect(result.authUrl).toContain('gmail.readonly')
  })

  it('should exchange authorization code for tokens [AC02]', async () => {
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
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    // Mock token response
    const mockTokens = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expiry_date: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const { authorize } = await import('../auth.js')

    // Execute with mock token exchange
    const result = await authorize(credentialsPath, tokenPath, {
      mockTokenExchange: { tokens: mockTokens },
    })

    // Verify token returned
    expect(result.credentials.access_token).toBe('mock-access-token')
    expect(result.credentials.refresh_token).toBe('mock-refresh-token')

    // Verify token saved to file
    const savedToken = JSON.parse(await fs.readFile(tokenPath, 'utf-8'))
    expect(savedToken.access_token).toBe('mock-access-token')
  })

  it('should handle invalid authorization code [AC02]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const credentialsPath = join(tempDir.path, 'credentials.json')
    const mockCredentials = {
      installed: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        redirect_uris: ['http://localhost'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    }
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    const { authorize } = await import('../auth.js')

    // Mock failed token exchange
    await expect(
      authorize(credentialsPath, undefined, {
        mockTokenExchange: { error: 'invalid_grant' },
      })
    ).rejects.toThrow()
  })
})

describe('Token Storage [AC03]', () => {
  const tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = []

  afterEach(async () => {
    // 5-STEP CLEANUP
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const dir of tempDirs) {
      try {
        await dir.cleanup()
      } catch (_error) {}
    }
    tempDirs.length = 0
    if (global.gc) global.gc()
  })

  it('should write token.json with 0600 permissions [AC03]', async () => {
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
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    const mockTokens = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expiry_date: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const { authorize } = await import('../auth.js')
    await authorize(credentialsPath, tokenPath, {
      mockTokenExchange: { tokens: mockTokens },
    })

    // Verify file permissions are 0600
    const stats = await fs.stat(tokenPath)
    const mode = stats.mode & parseInt('777', 8)
    expect(mode).toBe(0o600)
  })

  it('should use atomic write (temp + rename) [AC03]', async () => {
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
    await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials, undefined, 2))

    const mockTokens = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expiry_date: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
    }

    const { authorize } = await import('../auth.js')
    await authorize(credentialsPath, tokenPath, {
      mockTokenExchange: { tokens: mockTokens },
    })

    // Verify no .tmp file remains
    const tmpPath = `${tokenPath}.tmp`
    await expect(fs.access(tmpPath)).rejects.toThrow()

    // Verify final file exists
    await expect(fs.access(tokenPath)).resolves.toBeUndefined()
  })

  it('should validate token JSON format on load [AC03]', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const tokenPath = join(tempDir.path, 'token.json')

    // Write corrupted JSON
    await fs.writeFile(tokenPath, '{invalid json}')

    const { loadToken } = await import('../auth.js')

    // Should throw on corrupted JSON
    await expect(loadToken(tokenPath)).rejects.toThrow()
  })
})
