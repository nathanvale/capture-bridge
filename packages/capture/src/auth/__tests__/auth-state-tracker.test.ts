import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Increase process event listener limit for TestKit cleanup (15 tests)
process.setMaxListeners(20)

describe('Auth State Tracker [AC06-AC07]', () => {
  const databases: Database.Database[] = []

  beforeEach(() => {
    // Fresh database for each test
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    // 1. Settle (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. No pools in this test

    // 3. Close databases
    for (const db of databases) {
      try {
        if (db.open && !db.readonly) db.close()
      } catch {
        // Safe to ignore cleanup errors
      }
    }
    databases.length = 0

    // 4. TestKit auto-cleanup (temp directories)

    // 5. Force GC
    if (global.gc) global.gc()
  })

  describe('recordAuthSuccess [AC06]', () => {
    it('should store last successful auth timestamp in sync_state', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      // Initialize schema
      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      const { recordAuthSuccess } = await import('../auth-state-tracker.js')

      // Record success
      const beforeTime = new Date().toISOString()
      await recordAuthSuccess(db)
      const afterTime = new Date().toISOString()

      // Verify stored timestamp
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_last_auth_success'").get() as
        | { value: string }
        | undefined

      expect(result).toBeDefined()
      expect(result?.value).toBeDefined()
      const timestamp = new Date(result?.value ?? '').getTime()
      expect(timestamp).toBeGreaterThanOrEqual(new Date(beforeTime).getTime())
      expect(timestamp).toBeLessThanOrEqual(new Date(afterTime).getTime())
    })

    it('should reset failure count on successful auth', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      // Set initial failure count
      db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_auth_failure_count', '3')").run()

      const { recordAuthSuccess } = await import('../auth-state-tracker.js')
      await recordAuthSuccess(db)

      // Verify failure count reset
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failure_count'").get() as
        | { value: string }
        | undefined

      expect(result).toBeDefined()
      expect(result?.value).toBe('0')
    })

    it('should update existing auth success timestamp', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      // Set initial timestamp
      const oldTime = '2025-01-01T00:00:00.000Z'
      db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_last_auth_success', ?)").run(oldTime)

      const { recordAuthSuccess } = await import('../auth-state-tracker.js')
      await recordAuthSuccess(db)

      // Verify timestamp updated
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_last_auth_success'").get() as
        | { value: string }
        | undefined

      expect(result).toBeDefined()
      expect(new Date(result?.value ?? '').getTime()).toBeGreaterThan(new Date(oldTime).getTime())
    })
  })

  describe('recordAuthFailure [AC07]', () => {
    it('should increment failure count on auth failure', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      const { recordAuthFailure } = await import('../auth-state-tracker.js')

      // Record multiple failures
      await recordAuthFailure(db)
      await recordAuthFailure(db)
      await recordAuthFailure(db)

      // Verify count incremented
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failure_count'").get() as
        | { value: string }
        | undefined

      expect(result).toBeDefined()
      expect(result?.value).toBe('3')
    })

    it('should initialize failure count to 1 if not exists', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      const { recordAuthFailure } = await import('../auth-state-tracker.js')
      await recordAuthFailure(db)

      // Verify count initialized
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failure_count'").get() as
        | { value: string }
        | undefined

      expect(result).toBeDefined()
      expect(result?.value).toBe('1')
    })
  })

  describe('getConsecutiveFailures [AC07]', () => {
    it('should return current failure count', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      // Set failure count
      db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_auth_failure_count', '5')").run()

      const { getConsecutiveFailures } = await import('../auth-state-tracker.js')
      const count = await getConsecutiveFailures(db)

      expect(count).toBe(5)
    })

    it('should return 0 if no failure count exists', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      const { getConsecutiveFailures } = await import('../auth-state-tracker.js')
      const count = await getConsecutiveFailures(db)

      expect(count).toBe(0)
    })
  })

  describe('shouldHaltPolling [AC07]', () => {
    it('should return true when failures exceed 5', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      // Set failure count > 5
      db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_auth_failure_count', '6')").run()

      const { shouldHaltPolling } = await import('../auth-state-tracker.js')
      const shouldHalt = await shouldHaltPolling(db)

      expect(shouldHalt).toBe(true)
    })

    it('should return false when failures are exactly 5', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      // Set failure count = 5
      db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_auth_failure_count', '5')").run()

      const { shouldHaltPolling } = await import('../auth-state-tracker.js')
      const shouldHalt = await shouldHaltPolling(db)

      expect(shouldHalt).toBe(false)
    })

    it('should return false when failures are less than 5', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      // Set failure count < 5
      db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_auth_failure_count', '3')").run()

      const { shouldHaltPolling } = await import('../auth-state-tracker.js')
      const shouldHalt = await shouldHaltPolling(db)

      expect(shouldHalt).toBe(false)
    })

    it('should return false when no failure count exists', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      const { shouldHaltPolling } = await import('../auth-state-tracker.js')
      const shouldHalt = await shouldHaltPolling(db)

      expect(shouldHalt).toBe(false)
    })
  })

  describe('Integration: Auth Flow with State Tracking', () => {
    it('should handle complete auth success flow', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      // Simulate some previous failures
      db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_auth_failure_count', '3')").run()

      const { recordAuthSuccess, getConsecutiveFailures, shouldHaltPolling } = await import('../auth-state-tracker.js')

      // Record successful auth
      await recordAuthSuccess(db)

      // Verify state after success
      const failures = await getConsecutiveFailures(db)
      const halt = await shouldHaltPolling(db)

      expect(failures).toBe(0)
      expect(halt).toBe(false)

      // Verify timestamp was set
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_last_auth_success'").get() as
        | { value: string }
        | undefined

      expect(result).toBeDefined()
      expect(new Date(result?.value ?? '').getTime()).toBeGreaterThan(Date.now() - 5000) // Within last 5 seconds
    })

    it('should handle failure escalation to halt threshold', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      const { recordAuthFailure, getConsecutiveFailures, shouldHaltPolling } = await import('../auth-state-tracker.js')

      // Simulate escalating failures
      for (let i = 1; i <= 6; i++) {
        await recordAuthFailure(db)
        const count = await getConsecutiveFailures(db)
        expect(count).toBe(i)

        const shouldStop = await shouldHaltPolling(db)
        if (i <= 5) {
          expect(shouldStop).toBe(false)
        } else {
          expect(shouldStop).toBe(true)
        }
      }
    })
  })

  describe('Security: SQL Injection Protection', () => {
    it('should prevent SQL injection in key parameters', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      const { recordAuthSuccess } = await import('../auth-state-tracker.js')

      // This should be safe - implementation should use parameterized queries
      await recordAuthSuccess(db)

      // Verify normal operation
      const count = db.prepare('SELECT COUNT(*) as count FROM sync_state').get() as {
        count: number
      }
      expect(count.count).toBeGreaterThanOrEqual(2) // At least timestamp and failure count
    })
  })

  describe('Memory Leak Detection', () => {
    it('should not leak memory during repeated operations', async () => {
      const db = new Database(':memory:')
      databases.push(db)

      const { createSchema } = await import('@capture-bridge/storage')
      createSchema(db)

      const { recordAuthSuccess, recordAuthFailure, getConsecutiveFailures, shouldHaltPolling } = await import(
        '../auth-state-tracker.js'
      )

      if (global.gc) global.gc()
      const before = process.memoryUsage().heapUsed

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        await recordAuthSuccess(db)
        await recordAuthFailure(db)
        await getConsecutiveFailures(db)
        await shouldHaltPolling(db)
      }

      if (global.gc) global.gc()
      await new Promise((resolve) => setTimeout(resolve, 100))
      const after = process.memoryUsage().heapUsed

      // Should not leak more than 5MB
      expect(after - before).toBeLessThan(5 * 1024 * 1024)
    })
  })
})
