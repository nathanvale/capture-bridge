/**
 * @file sync-state-tracking.test.ts
 * @description Test suite for AC06 - Store last successful auth in sync_state table
 *
 * Tests verify:
 * - updateSyncState() writes to sync_state table
 * - authorize() calls updateSyncState() after successful token exchange
 * - ensureValidToken() calls updateSyncState() after successful refresh
 * - Timestamp is ISO 8601 UTC format
 * - Multiple calls UPDATE existing row (no duplicates)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

describe('AC06: Store last successful auth in sync_state table', () => {
  const databases: Database[] = []
  let testDir: string

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    testDir = tempDir.path
  })

  afterEach(async () => {
    // Step 1: Settle
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Step 2: Close databases
    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    // Step 3: TestKit auto-cleanup

    // Step 4: Force GC
    if (global.gc) global.gc()
  })

  describe('updateSyncState()', () => {
    it('writes timestamp to sync_state.last_gmail_auth', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase } = await import('@capture-bridge/storage')
      const { updateSyncState } = await import('../auth.js')

      const db = new Database(':memory:')
      databases.push(db)
      initializeDatabase(db)

      updateSyncState(db)

      const stmt = db.prepare("SELECT value FROM sync_state WHERE key = 'last_gmail_auth'")
      const row = stmt.get() as { value: string } | undefined

      expect(row).toBeDefined()
      const value = row?.value
      expect(value).toBeDefined()
      if (value) {
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      }
    })

    it('uses ISO 8601 UTC format', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase } = await import('@capture-bridge/storage')
      const { updateSyncState } = await import('../auth.js')

      const db = new Database(':memory:')
      databases.push(db)
      initializeDatabase(db)

      const beforeTimestamp = new Date().toISOString()
      await updateSyncState(db)
      const afterTimestamp = new Date().toISOString()

      const stmt = db.prepare("SELECT value FROM sync_state WHERE key = 'last_gmail_auth'")
      const row = stmt.get() as { value: string } | undefined

      expect(row).toBeDefined()
      const value = row?.value
      expect(value).toBeDefined()
      if (value) {
        expect(value >= beforeTimestamp).toBe(true)
        expect(value <= afterTimestamp).toBe(true)
      }
    })

    it('updates existing row instead of creating duplicates', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase } = await import('@capture-bridge/storage')
      const { updateSyncState } = await import('../auth.js')

      const db = new Database(':memory:')
      databases.push(db)
      initializeDatabase(db)

      // First call
      await updateSyncState(db)
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Second call
      updateSyncState(db)

      const stmt = db.prepare("SELECT COUNT(*) as count FROM sync_state WHERE key = 'last_gmail_auth'")
      const row = stmt.get() as { count: number }

      expect(row.count).toBe(1)
    })

    it('updates timestamp on subsequent calls', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase } = await import('@capture-bridge/storage')
      const { updateSyncState } = await import('../auth.js')

      const db = new Database(':memory:')
      databases.push(db)
      initializeDatabase(db)

      // First call
      await updateSyncState(db)
      const stmt = db.prepare("SELECT value FROM sync_state WHERE key = 'last_gmail_auth'")
      const firstRow = stmt.get() as { value: string }

      // Wait to ensure timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Second call
      await updateSyncState(db)
      const secondRow = stmt.get() as { value: string }

      expect(secondRow.value > firstRow.value).toBe(true)
    })
  })

  describe('authorize() integration', () => {
    it('calls updateSyncState() after successful token exchange', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase } = await import('@capture-bridge/storage')
      const { authorize } = await import('../auth.js')
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const db = new Database(':memory:')
      databases.push(db)
      initializeDatabase(db)

      // Create credentials.json with all required fields for validation [P0-2]
      const credentialsPath = path.join(testDir, 'credentials.json')
      await fs.writeFile(
        credentialsPath,
        JSON.stringify({
          installed: {
            client_id: 'mock_client_id',
            client_secret: 'mock_client_secret',
            redirect_uris: ['http://localhost:3000'],
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
          },
        })
      )

      // Create token.json with authorization code
      const tokenPath = path.join(testDir, 'token.json')
      await fs.writeFile(
        tokenPath,
        JSON.stringify({
          type: 'authorized',
          tokens: {
            access_token: 'mock_access_token',
            refresh_token: 'mock_refresh_token',
            scope: 'https://www.googleapis.com/auth/gmail.readonly',
            token_type: 'Bearer',
            expiry_date: Date.now() + 3600 * 1000,
          },
        })
      )

      // Call authorize with mock token exchange
      await authorize(credentialsPath, tokenPath, db, {
        mockTokenExchange: {
          tokens: {
            access_token: 'mock_access_token',
            refresh_token: 'mock_refresh_token',
            scope: 'https://www.googleapis.com/auth/gmail.readonly',
            token_type: 'Bearer',
            expiry_date: Date.now() + 3600 * 1000,
          },
        },
      })

      // Verify sync_state was updated
      const stmt = db.prepare("SELECT value FROM sync_state WHERE key = 'last_gmail_auth'")
      const row = stmt.get() as { value: string } | undefined

      expect(row).toBeDefined()
      const value = row?.value
      expect(value).toBeDefined()
      if (value) {
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      }
    })
  })

  describe('ensureValidToken() integration', () => {
    it('calls updateSyncState() after successful token refresh', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase } = await import('@capture-bridge/storage')
      const { ensureValidToken } = await import('../auth.js')
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const db = new Database(':memory:')
      databases.push(db)
      initializeDatabase(db)

      // Create credentials.json with all required fields for validation [P0-2]
      const credentialsPath = path.join(testDir, 'credentials.json')
      await fs.writeFile(
        credentialsPath,
        JSON.stringify({
          installed: {
            client_id: 'mock_client_id',
            client_secret: 'mock_client_secret',
            redirect_uris: ['http://localhost:3000'],
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
          },
        })
      )

      // Create token.json with expired token
      const tokenPath = path.join(testDir, 'token.json')
      await fs.writeFile(
        tokenPath,
        JSON.stringify({
          access_token: 'mock_expired_access_token',
          refresh_token: 'mock_refresh_token',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
          token_type: 'Bearer',
          expiry_date: Date.now() - 1000, // Expired
        })
      )

      // Call ensureValidToken with mock refresh (should trigger refresh)
      await ensureValidToken(credentialsPath, tokenPath, db, {
        mockRefresh: {
          tokens: {
            access_token: 'mock_refreshed_access_token',
            refresh_token: 'mock_refresh_token',
            scope: 'https://www.googleapis.com/auth/gmail.readonly',
            token_type: 'Bearer',
            expiry_date: Date.now() + 3600 * 1000,
          },
        },
      })

      // Verify sync_state was updated
      const stmt = db.prepare("SELECT value FROM sync_state WHERE key = 'last_gmail_auth'")
      const row = stmt.get() as { value: string } | undefined

      expect(row).toBeDefined()
      const value = row?.value
      expect(value).toBeDefined()
      if (value) {
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      }
    })
  })
})
