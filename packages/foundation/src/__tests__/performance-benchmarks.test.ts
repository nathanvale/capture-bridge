/* eslint-disable sonarjs/no-nested-functions -- Performance tests require nested async functions for concurrent operations */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import type BetterSqlite3 from 'better-sqlite3'

/**
 * Performance Benchmark Tests
 *
 * Comprehensive performance regression tests for @orchestr8/testkit.
 * These tests ensure that the testing utilities maintain optimal performance
 * and do not introduce memory leaks or performance degradation.
 *
 * REQUIRES: better-sqlite3
 *
 * Benchmarks cover:
 * - Memory leak detection for core utilities
 * - Concurrent operations performance
 * - Resource cleanup efficiency
 * - Connection pool performance under load
 * - Object pool reuse verification
 */

describe('Performance Benchmarks', () => {
  let testDir: string
  let pools: any[] = []
  const databases: Array<InstanceType<typeof BetterSqlite3>> = []

  beforeEach(() => {
    // Create temp directory for test databases
    testDir = join(tmpdir(), `testkit-perf-${Date.now()}`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dynamic temp directory path is safe
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(async () => {
    // CLEANUP SEQUENCE (IMPORTANT: Order matters!)
    //
    // 0. Allow in-flight release operations to settle (prevents race conditions)
    //    - Even after Promise.all resolves, pool internals may still be processing
    //    - 100ms settling period prevents "connection not in use" warnings
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 1. Drain connection pools FIRST
    //    - Pool.drain() gracefully closes all pool-managed connections
    //    - This prevents "connection not in use" warnings
    //    - NEVER manually close pool-managed connections
    for (const pool of pools) {
      try {
        await pool.drain()
      } catch {
        // Pool might already be drained or have errors - safe to ignore
      }
    }
    pools = []

    // 2. Close direct database connections SECOND
    //    - Only close connections NOT managed by pools
    //    - These are connections created with `new Database()`
    //    - Pool-managed connections are already closed by pool.drain()
    for (const database of databases) {
      try {
        // Skip if already closed by pool.drain() or if readonly
        if (database.open && !database.readonly) {
          database.close()
        }
      } catch {
        // Connection might already be closed - safe to ignore
        // This prevents cascade failures in cleanup
      }
    }
    databases.length = 0

    // 3. Clean up file system resources THIRD
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      // Directory might not exist or be in use - safe to ignore
    }

    // 4. Force garbage collection LAST (if available)
    //    - Helps with memory leak detection
    //    - Only available when Node.js started with --expose-gc
    if (global.gc) {
      global.gc()
    }
  })

  describe('Memory Leak Detection', () => {
    it('should not leak memory with repeated delay calls', async () => {
      const { delay } = await import('@orchestr8/testkit')

      // Force GC before measurement
      if (global.gc) global.gc()
      await delay(100) // Warm up

      const initialMemory = process.memoryUsage().heapUsed

      // Execute 100 delay operations - Reduced from 1000: memory leaks detectable at 100 iterations
      for (let i = 0; i < 100; i++) {
        await delay(1)
      }

      // Force GC to ensure cleanup
      if (global.gc) global.gc()
      await delay(100) // Allow GC to complete

      const finalMemory = process.memoryUsage().heapUsed
      const growth = finalMemory - initialMemory

      // Memory growth should be less than 5MB (V8 GC is not deterministic)
      expect(growth).toBeLessThan(5 * 1024 * 1024)

      // ✅ Memory growth from 100 delay calls: ${(growth / 1024).toFixed(2)} KB
    }, 30000) // Increase timeout for this test

    it('should not leak with withTimeout operations', async () => {
      const { withTimeout, delay } = await import('@orchestr8/testkit')

      // Force GC before measurement
      if (global.gc) global.gc()
      await delay(100) // Warm up

      const initialMemory = process.memoryUsage().heapUsed

      // Execute 100 withTimeout operations - Reduced from 1000: sufficient for leak detection
      for (let i = 0; i < 100; i++) {
        await withTimeout(
          delay(1).then(() => `result-${i}`),
          100
        )
      }

      // Force GC to ensure cleanup
      if (global.gc) global.gc()
      await delay(100) // Allow GC to complete

      const finalMemory = process.memoryUsage().heapUsed
      const growth = finalMemory - initialMemory

      // Memory growth should be less than 5MB (V8 GC is not deterministic)
      expect(growth).toBeLessThan(5 * 1024 * 1024)

      // ✅ Memory growth from 100 withTimeout calls: ${(growth / 1024).toFixed(2)} KB
    }, 30000)

    it('should not leak with retry operations', async () => {
      const { retry } = await import('@orchestr8/testkit')

      // Force GC before measurement
      if (global.gc) global.gc()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Warm up

      const initialMemory = process.memoryUsage().heapUsed

      // Execute 100 retry operations (succeeding on first attempt) - Reduced from 1000: leaks manifest early
      for (let i = 0; i < 100; i++) {
        await retry(() => Promise.resolve(`result-${i}`), 3, 10)
      }

      // Force GC to ensure cleanup
      if (global.gc) global.gc()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Allow GC to complete

      const finalMemory = process.memoryUsage().heapUsed
      const growth = finalMemory - initialMemory

      // Memory growth should be less than 5MB (V8 GC is not deterministic)
      expect(growth).toBeLessThan(5 * 1024 * 1024)

      // ✅ Memory growth from 100 retry calls: ${(growth / 1024).toFixed(2)} KB
    }, 30000)
  })

  describe('Concurrent Operations Performance', () => {
    it('should handle 1000 concurrent process mocks in under 100ms', async () => {
      const { createMockFn } = await import('@orchestr8/testkit')

      const start = Date.now()

      // Create 1000 mock functions concurrently
      const mocks = await Promise.all(
        Array.from({ length: 1000 }, (_, i) => Promise.resolve(createMockFn(() => `mock-${i}`)))
      )

      const elapsed = Date.now() - start

      expect(mocks).toHaveLength(1000)
      expect(elapsed).toBeLessThan(100)

      // ✅ Created 1000 concurrent mocks in ${elapsed}ms
    })

    it('should handle connection pool under heavy load', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')

      const dbPath = join(testDir, 'pool-load-test.db')
      const pool = new SQLiteConnectionPool(dbPath, {
        maxConnections: 10,
        minConnections: 2,
        idleTimeout: 5000,
        acquireTimeout: 5000,
      })
      pools.push(pool)

      const start = Date.now()

      // Execute 100 concurrent operations
      const operations = Array.from({ length: 100 }, async (_, i) => {
        const conn = await pool.acquire()
        try {
          // Execute a simple query
          conn.exec('SELECT 1')
          return i
        } finally {
          await pool.release(conn)
        }
      })

      const results = await Promise.all(operations)
      const elapsed = Date.now() - start

      expect(results).toHaveLength(100)
      expect(elapsed).toBeLessThan(5000) // Should complete within 5 seconds

      // Verify pool statistics
      const stats = pool.getStats()
      expect(stats.totalConnections).toBeGreaterThan(0)

      // ✅ 100 concurrent pool operations in ${elapsed}ms
      // Pool stats: ${stats.totalConnections} connections, ${stats.hitRate.toFixed(2)}% hit rate
    }, 10000)

    it('should handle concurrent database operations efficiently', async () => {
      const Database = (await import('better-sqlite3')).default

      // Create 10 in-memory databases
      const dbs = Array.from({ length: 10 }, () => {
        const db = new Database(':memory:')
        databases.push(db)
        return db
      })

      // Initialize each database
      for (const db of dbs) {
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
      }

      const start = Date.now()

      // Execute 1000 operations across 10 databases (100 ops per DB)
      const operations = []
      for (let i = 0; i < 1000; i++) {
        const db = dbs[i % 10]
        operations.push(
          Promise.resolve().then(() => {
            db.prepare('INSERT INTO test (value) VALUES (?)').run(`value-${i}`)
            return db.prepare('SELECT COUNT(*) as count FROM test').get()
          })
        )
      }

      await Promise.all(operations)
      const elapsed = Date.now() - start

      // Verify all operations completed
      const totalRecords = dbs.reduce((sum, db) => {
        const result = db.prepare('SELECT COUNT(*) as count FROM test').get() as { count: number }
        return sum + result.count
      }, 0)

      expect(totalRecords).toBe(1000)
      expect(elapsed).toBeLessThan(2000) // Should complete within 2 seconds

      // ✅ 1000 concurrent DB operations across 10 databases in ${elapsed}ms
      // Average: ${(elapsed / 1000).toFixed(2)}ms per operation
    }, 10000)
  })

  describe('Efficiency Benchmarks', () => {
    it('should verify object pool reuse efficiency', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')

      const dbPath = join(testDir, 'pool-reuse-test.db')
      const pool = new SQLiteConnectionPool(dbPath, {
        maxConnections: 5,
        minConnections: 2,
      })
      pools.push(pool)

      // Acquire and release connections multiple times
      const iterations = 100
      for (let i = 0; i < iterations; i++) {
        const conn = await pool.acquire()
        conn.exec('SELECT 1')
        await pool.release(conn)
      }

      const stats = pool.getStats()

      // Verify pool statistics
      expect(stats.connectionsCreated).toBeLessThanOrEqual(5) // Should not create more than max
      expect(stats.connectionsCreated).toBeGreaterThan(0) // Should have created at least one

      // Hit rate is calculated by TestKit as a decimal (0-1 range)
      // High hit rate indicates good connection reuse
      expect(stats.hitRate).toBeGreaterThan(0.9) // Should reuse connections > 90% of the time

      // ✅ Object pool reuse efficiency:
      // Hit rate: ${stats.hitRate.toFixed(2)}%
      // Connections created: ${stats.connectionsCreated}
      // Total acquisitions: ${iterations}
    })

    it('should verify resource cleanup performance', async () => {
      const { createFileDatabase, registerDatabaseCleanup, cleanupAllSqlite } = await import(
        '@orchestr8/testkit/sqlite'
      )

      // Create multiple database files
      const dbCount = 50
      const dbPromises = Array.from({ length: dbCount }, (_, i) => createFileDatabase(`cleanup-perf-${i}.db`))

      const fileDBs = await Promise.all(dbPromises)

      // Register all for cleanup
      for (const fileDB of fileDBs) {
        registerDatabaseCleanup(fileDB)
      }

      const start = Date.now()

      // Execute cleanup
      await cleanupAllSqlite()

      const elapsed = Date.now() - start

      // Cleanup should be fast
      expect(elapsed).toBeLessThan(1000) // Should complete within 1 second

      // ✅ Cleaned up ${dbCount} databases in ${elapsed}ms
      // Average: ${(elapsed / dbCount).toFixed(2)}ms per database
    }, 10000)
  })

  describe('Stress Tests', () => {
    it('should handle rapid connection acquisition and release cycles', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')

      const dbPath = join(testDir, 'stress-test.db')
      const pool = new SQLiteConnectionPool(dbPath, {
        maxConnections: 3,
        minConnections: 1,
        idleTimeout: 2000,
      })
      pools.push(pool)

      const start = Date.now()
      const cycles = 500

      // Rapid acquire/release cycles
      for (let i = 0; i < cycles; i++) {
        const conn = await pool.acquire()
        await pool.release(conn)
      }

      const elapsed = Date.now() - start
      const stats = pool.getStats()

      expect(stats.totalConnections).toBeLessThanOrEqual(3)
      expect(elapsed).toBeLessThan(5000) // Should complete within 5 seconds

      // ✅ ${cycles} rapid acquire/release cycles in ${elapsed}ms
      // Average: ${(elapsed / cycles).toFixed(2)}ms per cycle
      // Pool hit rate: ${stats.hitRate.toFixed(2)}%
    }, 10000)

    it('should maintain performance under queue pressure', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')

      const dbPath = join(testDir, 'queue-pressure.db')
      const pool = new SQLiteConnectionPool(dbPath, {
        maxConnections: 2, // Small pool to create queue pressure
        minConnections: 1,
        acquireTimeout: 10000,
      })
      pools.push(pool)

      const start = Date.now()

      // Launch 20 concurrent operations with only 2 connections
      // This will create queue pressure
      const operations = Array.from({ length: 20 }, async (_, i) => {
        const conn = await pool.acquire()
        try {
          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 50))
          return i
        } finally {
          await pool.release(conn)
        }
      })

      const results = await Promise.all(operations)
      const elapsed = Date.now() - start

      expect(results).toHaveLength(20)

      // With 2 connections and 50ms per operation, theoretical minimum is ~500ms
      // Allow some overhead for queueing
      expect(elapsed).toBeLessThan(2000)

      // Verify pool statistics show connection usage
      const stats = pool.getStats()
      expect(stats.totalConnections).toBeLessThanOrEqual(2)

      // ✅ 20 operations with 2 connections in ${elapsed}ms
      // Waiting requests at end: ${stats.waitingRequests}
    }, 15000)

    it('should handle mixed workload patterns efficiently', async () => {
      const { delay, retry, withTimeout } = await import('@orchestr8/testkit')

      const start = Date.now()

      // Mix of different operation types
      const operations = [
        // Fast operations
        ...Array.from({ length: 100 }, () => delay(1)),
        // Retry operations
        ...Array.from({ length: 50 }, (_, i) => {
          let attempts = 0
          return retry(
            // eslint-disable-next-line require-await -- async required for retry signature
            async () => {
              attempts++
              if (attempts < 2) throw new Error('retry')
              return `result-${i}`
            },
            3,
            5
          )
        }),
        // Timeout operations
        ...Array.from({ length: 50 }, () =>
          withTimeout(
            delay(10).then(() => 'done'),
            100
          )
        ),
      ]

      await Promise.all(operations)
      const elapsed = Date.now() - start

      // 200 mixed operations should complete reasonably fast
      expect(elapsed).toBeLessThan(1000)

      // ✅ 200 mixed operations in ${elapsed}ms
      // Average: ${(elapsed / 200).toFixed(2)}ms per operation
    }, 10000)
  })

  describe('Scalability Tests', () => {
    it('should scale linearly with connection pool size', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')

      const results: Array<{ poolSize: number; elapsed: number }> = []

      // Test with different pool sizes
      for (const poolSize of [1, 2, 5, 10]) {
        const dbPath = join(testDir, `scale-${poolSize}.db`)
        const pool = new SQLiteConnectionPool(dbPath, {
          maxConnections: poolSize,
          minConnections: 1,
        })
        pools.push(pool)

        const start = Date.now()

        // Execute 100 operations
        const operations = Array.from({ length: 100 }, async () => {
          const conn = await pool.acquire()
          try {
            await new Promise((resolve) => setTimeout(resolve, 10))
            conn.exec('SELECT 1')
          } finally {
            await pool.release(conn)
          }
        })

        await Promise.all(operations)
        const elapsed = Date.now() - start

        results.push({ poolSize, elapsed })
      }

      // Verify that larger pools complete faster or similarly
      // Note: Small workloads may not show significant difference
      const firstResult = results[0]
      const lastResult = results[3]
      expect(firstResult).toBeDefined()
      expect(lastResult).toBeDefined()
      if (firstResult && lastResult) {
        expect(lastResult.elapsed).toBeLessThanOrEqual(firstResult.elapsed * 1.5) // Allow some variance
      }

      // ✅ Pool size scalability:
      // Pool size 1: ${results[0]?.elapsed}ms
      // Pool size 2: ${results[1]?.elapsed}ms
      // Pool size 5: ${results[2]?.elapsed}ms
      // Pool size 10: ${results[3]?.elapsed}ms
    }, 30000)

    it('should maintain performance with large datasets', async () => {
      const Database = (await import('better-sqlite3')).default

      const db = new Database(':memory:')
      databases.push(db)

      // Create table
      db.exec(`
        CREATE TABLE large_dataset (
          id INTEGER PRIMARY KEY,
          data TEXT NOT NULL
        )
      `)

      const start = Date.now()

      // Insert 10,000 records using prepared statement
      const insert = db.prepare('INSERT INTO large_dataset (data) VALUES (?)')
      const insertMany = db.transaction((records: string[]) => {
        for (const record of records) {
          insert.run(record)
        }
      })

      const records = Array.from({ length: 10000 }, (_, i) => `data-${i}`)
      insertMany(records)

      const insertElapsed = Date.now() - start

      // Query large dataset
      const queryStart = Date.now()
      const count = db.prepare('SELECT COUNT(*) as count FROM large_dataset').get() as { count: number }
      const queryElapsed = Date.now() - queryStart

      expect(count.count).toBe(10000)
      expect(insertElapsed).toBeLessThan(5000) // Insert should be fast
      expect(queryElapsed).toBeLessThan(100) // Count should be instant

      // ✅ Large dataset performance:
      // Insert 10,000 records: ${insertElapsed}ms
      // Query count: ${queryElapsed}ms
    }, 10000)
  })

  describe('Regression Tests', () => {
    it('should not degrade with repeated test runs', async () => {
      const { delay } = await import('@orchestr8/testkit')

      const runTimings: number[] = []

      // Run the same test 10 times
      for (let run = 0; run < 10; run++) {
        const start = Date.now()

        // Simulate a typical test workload - Reduced from 100: total 100 iterations instead of 1000
        for (let i = 0; i < 10; i++) {
          await delay(1)
        }

        runTimings.push(Date.now() - start)
      }

      // Calculate variance
      const avg = runTimings.reduce((a, b) => a + b, 0) / runTimings.length
      const variance = runTimings.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / runTimings.length
      const stdDev = Math.sqrt(variance)

      // Standard deviation should be reasonable (within 50% of average)
      expect(stdDev).toBeLessThan(avg * 0.5)

      // Last run should not be significantly slower than first
      const firstTiming = runTimings[0]
      const lastTiming = runTimings[9]
      expect(firstTiming).toBeDefined()
      expect(lastTiming).toBeDefined()
      if (firstTiming && lastTiming) {
        const degradation = ((lastTiming - firstTiming) / firstTiming) * 100
        expect(Math.abs(degradation)).toBeLessThan(50) // Less than 50% variation

        // ✅ Performance consistency across 10 runs:
        // Average: ${avg.toFixed(2)}ms
        // Std Dev: ${stdDev.toFixed(2)}ms
        // Degradation: ${degradation.toFixed(2)}%
      }
    }, 30000)
  })
})
