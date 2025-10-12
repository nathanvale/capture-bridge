/**
 * Gmail OAuth2 Failure Tracking Tests [AC07]
 * TDD RED phase - Test-first implementation
 */

import { join } from 'node:path'

import { describe, it, expect, afterEach } from 'vitest'

import { GmailAuthError } from '../types.js'

describe('Auth Failure Tracking [AC07]', () => {
  const tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = []
  const databases: Array<{ close: () => void }> = []

  afterEach(async () => {
    // 5-STEP CLEANUP (CRITICAL ORDER)
    // 1. Settle 100ms (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. Close databases
    for (const db of databases) {
      try {
        db.close()
      } catch {
        // Intentionally empty - ignore errors during cleanup
      }
    }
    databases.length = 0

    // 3. TestKit auto-cleanup (temp directories)
    for (const dir of tempDirs) {
      try {
        await dir.cleanup()
      } catch {
        // Intentionally empty - ignore cleanup errors
      }
    }
    tempDirs.length = 0

    // 4. Force GC last
    if (global.gc) global.gc()
  })

  describe('incrementAuthFailures', () => {
    it('should increment gmail_auth_failures counter in sync_state [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      // Create sync_state table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      const authModule = (await import('../auth.js')) as any
      const { incrementAuthFailures } = authModule

      // Act
      const count1 = incrementAuthFailures(db)
      const count2 = incrementAuthFailures(db)
      const count3 = incrementAuthFailures(db)

      // Assert
      expect(count1).toBe(1)
      expect(count2).toBe(2)
      expect(count3).toBe(3)

      // Verify in database
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'").get() as
        | { value: string }
        | undefined
      expect(result).toBeDefined()
      if (result) {
        expect(parseInt(result.value, 10)).toBe(3)
      }
    })

    it('should create initial counter if not exists [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      const authModule = (await import('../auth.js')) as any
      const { incrementAuthFailures } = authModule

      // Act
      const count = incrementAuthFailures(db)

      // Assert
      expect(count).toBe(1)
    })
  })

  describe('resetAuthFailures', () => {
    it('should reset gmail_auth_failures counter to 0 [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      // Set counter to 5
      db.prepare(
        `
        INSERT INTO sync_state (key, value, updated_at)
        VALUES ('gmail_auth_failures', '5', datetime('now'))
      `
      ).run()

      const authModule = (await import('../auth.js')) as any
      const { resetAuthFailures } = authModule

      // Act
      resetAuthFailures(db)

      // Assert
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'").get() as
        | { value: string }
        | undefined
      expect(result).toBeDefined()
      if (result) {
        expect(parseInt(result.value, 10)).toBe(0)
      }
    })

    it('should create counter set to 0 if not exists [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      const authModule = (await import('../auth.js')) as any
      const { resetAuthFailures } = authModule

      // Act
      resetAuthFailures(db)

      // Assert
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'").get() as
        | { value: string }
        | undefined
      expect(result).toBeDefined()
      if (result) {
        expect(parseInt(result.value, 10)).toBe(0)
      }
    })
  })

  describe('authorize() integration', () => {
    it('should reset failure counter on successful authorization [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      // Set failure counter to 3
      db.prepare(
        `
        INSERT INTO sync_state (key, value, updated_at)
        VALUES ('gmail_auth_failures', '3', datetime('now'))
      `
      ).run()

      const fs = await import('node:fs/promises')
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

      // Act
      await authorize(credentialsPath, tokenPath, db, {
        mockTokenExchange: { tokens: mockTokens },
      })

      // Assert - counter should be reset to 0
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'").get() as
        | { value: string }
        | undefined
      expect(result).toBeDefined()
      if (result) {
        expect(parseInt(result.value, 10)).toBe(0)
      }
    })

    it('should increment failure counter on authorization error [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      const fs = await import('node:fs/promises')
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

      // Act & Assert - should throw and increment counter
      await expect(
        authorize(credentialsPath, undefined, db, {
          mockTokenExchange: { error: 'invalid_grant' },
        })
      ).rejects.toThrow()

      // Verify counter was incremented
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'").get() as
        | { value: string }
        | undefined
      expect(result).toBeDefined()
      if (result) {
        expect(parseInt(result.value, 10)).toBe(1)
      }
    })

    it('should throw MaxAuthFailuresError when failures >= 5 [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      // Set failure counter to 5
      db.prepare(
        `
        INSERT INTO sync_state (key, value, updated_at)
        VALUES ('gmail_auth_failures', '5', datetime('now'))
      `
      ).run()

      const fs = await import('node:fs/promises')
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

      // Act & Assert
      await expect(authorize(credentialsPath, undefined, db)).rejects.toThrow(GmailAuthError)
      await expect(authorize(credentialsPath, undefined, db)).rejects.toThrow('5 times consecutively')
      await expect(authorize(credentialsPath, undefined, db)).rejects.toThrow('capture doctor')
    })
  })

  describe('ensureValidToken() integration', () => {
    it('should reset failure counter on successful token refresh [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      // Set failure counter to 3
      db.prepare(
        `
        INSERT INTO sync_state (key, value, updated_at)
        VALUES ('gmail_auth_failures', '3', datetime('now'))
      `
      ).run()

      const fs = await import('node:fs/promises')
      const tokenPath = join(tempDir.path, 'token.json')

      // Create expired token
      const expiredToken = {
        access_token: 'old-access-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() - 3600000, // Expired 1 hour ago
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer',
      }

      await fs.writeFile(tokenPath, JSON.stringify(expiredToken, undefined, 2), { mode: 0o600 })

      const refreshedTokens = {
        access_token: 'new-access-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer',
      }

      const { ensureValidToken } = await import('../auth.js')

      // Act
      await ensureValidToken(tokenPath, undefined, db, {
        mockRefresh: { tokens: refreshedTokens },
      })

      // Assert - counter should be reset to 0
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'").get() as
        | { value: string }
        | undefined
      expect(result).toBeDefined()
      if (result) {
        expect(parseInt(result.value, 10)).toBe(0)
      }
    })

    it('should increment failure counter on token refresh error [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      const fs = await import('node:fs/promises')
      const tokenPath = join(tempDir.path, 'token.json')

      // Create expired token
      const expiredToken = {
        access_token: 'old-access-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() - 3600000,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer',
      }

      await fs.writeFile(tokenPath, JSON.stringify(expiredToken, undefined, 2), { mode: 0o600 })

      const { ensureValidToken } = await import('../auth.js')

      // Act & Assert
      await expect(
        ensureValidToken(tokenPath, undefined, db, {
          mockRefresh: { error: 'invalid_grant' },
        })
      ).rejects.toThrow(GmailAuthError)

      // Verify counter was incremented
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'").get() as
        | { value: string }
        | undefined
      expect(result).toBeDefined()
      if (result) {
        expect(parseInt(result.value, 10)).toBe(1)
      }
    })

    it('should throw MaxAuthFailuresError when failures >= 5 [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      // Set failure counter to 5
      db.prepare(
        `
        INSERT INTO sync_state (key, value, updated_at)
        VALUES ('gmail_auth_failures', '5', datetime('now'))
      `
      ).run()

      const fs = await import('node:fs/promises')
      const tokenPath = join(tempDir.path, 'token.json')

      const validToken = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer',
      }

      await fs.writeFile(tokenPath, JSON.stringify(validToken, undefined, 2), { mode: 0o600 })

      const { ensureValidToken } = await import('../auth.js')

      // Act & Assert
      await expect(ensureValidToken(tokenPath, undefined, db)).rejects.toThrow(GmailAuthError)
      await expect(ensureValidToken(tokenPath, undefined, db)).rejects.toThrow('5 times consecutively')
      await expect(ensureValidToken(tokenPath, undefined, db)).rejects.toThrow('capture doctor')
    })
  })

  describe('Error message content [AC07]', () => {
    it('should include specific instructions to run capture doctor [AC07]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const Database = (await import('better-sqlite3')).default
      const dbPath = join(tempDir.path, 'test.db')
      const db = new Database(dbPath)
      databases.push(db)

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      // Set failure counter to 6 (past threshold)
      db.prepare(
        `
        INSERT INTO sync_state (key, value, updated_at)
        VALUES ('gmail_auth_failures', '6', datetime('now'))
      `
      ).run()

      const fs = await import('node:fs/promises')
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

      // Act & Assert
      try {
        await authorize(credentialsPath, undefined, db)
        // Should not reach here
        expect(true).toBe(false)
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(GmailAuthError)
        if (error instanceof GmailAuthError) {
          expect(error.message).toContain('6 times consecutively')
          expect(error.message).toContain("Run 'capture doctor'")
          expect(error.type).toBe('auth.max_failures')
        }
      }
    })
  })
})
