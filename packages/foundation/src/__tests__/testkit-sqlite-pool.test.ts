import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { Database } from 'better-sqlite3';

/**
 * Testkit SQLite Connection Pool Test
 *
 * Comprehensive tests for the 437-line SQLiteConnectionPool implementation
 * that manages database connections with lifecycle management, health checks,
 * and automatic resource cleanup.
 *
 * REQUIRES: better-sqlite3
 *
 * Tests cover:
 * - Connection lifecycle (acquire/release/drain)
 * - Pool limits and queueing
 * - Connection validation and health checks
 * - Timeout handling
 * - Statistics tracking
 * - Idle connection cleanup
 * - Minimum connection maintenance
 * - Shared cache mode
 * - Resource registration
 * - Pool manager functionality
 */

describe('SQLite Connection Pool', () => {
  let testDir: string;
  let dbPath: string;
  let pools: any[] = [];

  beforeEach(() => {
    // Create temp directory for test databases
    testDir = join(tmpdir(), `testkit-pool-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test.db');
  });

  afterEach(async () => {
    // Drain all pools
    for (const pool of pools) {
      try {
        await pool.drain();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    pools = [];

    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  const createPool = async (options = {}) => {
    const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite');
    const pool = new SQLiteConnectionPool(dbPath, options);
    pools.push(pool);
    return pool;
  };

  describe('Pool Creation and Configuration', () => {
    it('should create pool with default options', async () => {
      const pool = await createPool();

      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(0);
      expect(stats.connectionsInUse).toBe(0);
      expect(stats.idleConnections).toBe(0);
    });

    it('should create pool with custom options', async () => {
      const pool = await createPool({
        maxConnections: 5,
        minConnections: 1,
        idleTimeout: 10000,
        acquireTimeout: 3000,
      });

      const stats = pool.getStats();
      expect(stats).toBeDefined();
    });

    it('should throw error for invalid maxConnections', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite');

      expect(() => {
        new SQLiteConnectionPool(dbPath, { maxConnections: 0 });
      }).toThrow('maxConnections must be at least 1');
    });

    it('should throw error for negative minConnections', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite');

      expect(() => {
        new SQLiteConnectionPool(dbPath, { minConnections: -1 });
      }).toThrow('minConnections cannot be negative');
    });

    it('should throw error when minConnections exceeds maxConnections', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite');

      expect(() => {
        new SQLiteConnectionPool(dbPath, {
          minConnections: 5,
          maxConnections: 2
        });
      }).toThrow('minConnections cannot exceed maxConnections');
    });

    it('should throw error for invalid idleTimeout', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite');

      expect(() => {
        new SQLiteConnectionPool(dbPath, { idleTimeout: 500 });
      }).toThrow('idleTimeout must be at least 1000ms');
    });

    it('should throw error for invalid acquireTimeout', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite');

      expect(() => {
        new SQLiteConnectionPool(dbPath, { acquireTimeout: 500 });
      }).toThrow('acquireTimeout must be at least 1000ms');
    });
  });

  describe('Connection Acquisition and Release', () => {
    it('should acquire and release a connection', async () => {
      const pool = await createPool();

      const conn = await pool.acquire();
      expect(conn).toBeDefined();

      let stats = pool.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.connectionsInUse).toBe(1);
      expect(stats.idleConnections).toBe(0);

      await pool.release(conn);

      stats = pool.getStats();
      expect(stats.connectionsInUse).toBe(0);
      expect(stats.idleConnections).toBe(1);
    });

    it('should reuse released connections', async () => {
      const pool = await createPool({ maxConnections: 1, minConnections: 0 });

      const conn1 = await pool.acquire();
      await pool.release(conn1);

      const conn2 = await pool.acquire();

      // Should be the same connection reused
      expect(conn2).toBe(conn1);

      const stats = pool.getStats();
      expect(stats.connectionsCreated).toBe(1); // Only one connection created
      expect(stats.hitRate).toBeGreaterThan(0); // Should have cache hit
    });

    it('should execute queries on acquired connections', async () => {
      const pool = await createPool();

      const conn = await pool.acquire();

      // Create table and insert data
      conn.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
      conn.exec("INSERT INTO test (name) VALUES ('Alice')");

      // Query data
      const result = conn.prepare('SELECT * FROM test').all();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 1, name: 'Alice' });

      await pool.release(conn);
    });

    it('should warn when releasing unknown connection', async () => {
      const pool = await createPool();
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const Database = (await import('better-sqlite3')).default;
      const unknownConn = new Database(':memory:');

      await pool.release(unknownConn);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Attempted to release unknown connection to pool'
      );

      unknownConn.close();
      consoleWarnSpy.mockRestore();
    });

    it('should warn when releasing connection twice', async () => {
      const pool = await createPool();
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const conn = await pool.acquire();
      await pool.release(conn);
      await pool.release(conn);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Attempted to release connection that was not in use'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Connection Limits and Queueing', () => {
    it('should limit concurrent connections to maxConnections', async () => {
      const pool = await createPool({ maxConnections: 2 });

      // Acquire max connections
      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();

      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.connectionsInUse).toBe(2);

      await pool.release(conn1);
      await pool.release(conn2);
    });

    it('should queue requests when pool is exhausted', async () => {
      const pool = await createPool({
        maxConnections: 2,
        acquireTimeout: 10000
      });

      // Exhaust the pool
      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();

      // Start acquiring a third connection (will be queued)
      const conn3Promise = pool.acquire();

      // Give time for the request to be queued
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = pool.getStats();
      expect(stats.waitingRequests).toBe(1);

      // Release a connection to fulfill queued request
      await pool.release(conn1);

      const conn3 = await conn3Promise;
      expect(conn3).toBeDefined();

      await pool.release(conn2);
      await pool.release(conn3);
    });

    it('should timeout when acquiring connection takes too long', async () => {
      const pool = await createPool({
        maxConnections: 1,
        minConnections: 0,
        acquireTimeout: 1000
      });

      // Acquire the only connection
      const conn1 = await pool.acquire();

      // Try to acquire another (should timeout)
      await expect(pool.acquire()).rejects.toThrow(
        /Connection acquisition timeout after 1000ms/
      );

      await pool.release(conn1);
    });

    it('should process queued requests in FIFO order', async () => {
      const pool = await createPool({
        maxConnections: 1,
        minConnections: 0,
        acquireTimeout: 10000
      });

      const conn1 = await pool.acquire();

      const results: number[] = [];

      // Queue multiple requests
      const promise1 = pool.acquire().then((conn) => {
        results.push(1);
        return conn;
      });
      const promise2 = pool.acquire().then((conn) => {
        results.push(2);
        return conn;
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Release to trigger queue processing
      await pool.release(conn1);
      const conn2 = await promise1;

      await pool.release(conn2);
      const conn3 = await promise2;

      // Verify FIFO order
      expect(results).toEqual([1, 2]);

      await pool.release(conn3);
    });
  });

  describe('Connection Validation', () => {
    it('should validate connections before reuse', async () => {
      const pool = await createPool({ validateConnections: true });

      const conn = await pool.acquire();
      await pool.release(conn);

      // Acquire again (should validate)
      const conn2 = await pool.acquire();
      expect(conn2).toBe(conn);

      const stats = pool.getStats();
      expect(stats.validationFailures).toBe(0);

      await pool.release(conn2);
    });

    it('should remove invalid connections from pool', async () => {
      const pool = await createPool({ validateConnections: true });

      const conn = await pool.acquire();

      // Close the connection to make it invalid
      conn.close();

      await pool.release(conn);

      // Next acquire should create a new connection
      const conn2 = await pool.acquire();
      expect(conn2).not.toBe(conn);

      const stats = pool.getStats();
      expect(stats.validationFailures).toBe(1);
      expect(stats.connectionsDestroyed).toBe(1);

      await pool.release(conn2);
    });

    it('should skip validation when disabled', async () => {
      const pool = await createPool({ validateConnections: false });

      const conn = await pool.acquire();
      await pool.release(conn);

      const conn2 = await pool.acquire();
      expect(conn2).toBe(conn);

      await pool.release(conn2);
    });
  });

  describe('Pool Statistics', () => {
    it('should track connection creation and destruction', async () => {
      const pool = await createPool({ maxConnections: 3 });

      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();

      let stats = pool.getStats();
      expect(stats.connectionsCreated).toBe(2);
      expect(stats.connectionsDestroyed).toBe(0);

      await pool.drain();

      stats = pool.getStats();
      expect(stats.connectionsDestroyed).toBe(2);
    });

    it('should track hit rate accurately', async () => {
      const pool = await createPool();

      // First acquire creates new connection
      const conn1 = await pool.acquire();
      await pool.release(conn1);

      // Second acquire reuses connection
      const conn2 = await pool.acquire();
      await pool.release(conn2);

      const stats = pool.getStats();
      expect(stats.hitRate).toBe(0.5); // 1 hit out of 2 acquisitions
    });

    it('should calculate average connection age', async () => {
      const pool = await createPool();

      const conn1 = await pool.acquire();
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = pool.getStats();
      expect(stats.averageConnectionAge).toBeGreaterThan(0);

      await pool.release(conn1);
    });

    it('should track connections in use vs idle', async () => {
      const pool = await createPool({ maxConnections: 3 });

      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();
      const conn3 = await pool.acquire();

      await pool.release(conn1);

      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(3);
      expect(stats.connectionsInUse).toBe(2);
      expect(stats.idleConnections).toBe(1);

      await pool.release(conn2);
      await pool.release(conn3);
    });
  });

  describe('Idle Connection Cleanup', () => {
    it('should clean up idle connections after timeout', async () => {
      const pool = await createPool({
        minConnections: 0,
        idleTimeout: 2000,
      });

      const conn = await pool.acquire();
      await pool.release(conn);

      let stats = pool.getStats();
      expect(stats.totalConnections).toBe(1);

      // Poll for idle connection cleanup instead of fixed wait
      // This prevents flakiness due to timing variations under load
      let cleaned = false;
      for (let i = 0; i < 20; i++) {  // Max 10 seconds (20 * 500ms)
        await new Promise(resolve => setTimeout(resolve, 500));
        stats = pool.getStats();
        if (stats.totalConnections === 0) {
          cleaned = true;
          break;
        }
      }

      expect(cleaned).toBe(true);
      expect(stats.totalConnections).toBe(0);
      expect(stats.connectionsDestroyed).toBe(1);
    }, 10000);

    it('should not clean up connections below minConnections', async () => {
      const pool = await createPool({
        minConnections: 1,
        idleTimeout: 1000,
      });

      const conn = await pool.acquire();
      await pool.release(conn);

      // Wait for idle timeout
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stats = pool.getStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(1);
    }, 10000);

    it('should not clean up connections currently in use', async () => {
      const pool = await createPool({
        minConnections: 0,
        idleTimeout: 1000,
      });

      const conn = await pool.acquire();

      // Wait for longer than idle timeout
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.connectionsInUse).toBe(1);

      await pool.release(conn);
    });
  });

  describe('Minimum Connection Maintenance', () => {
    it('should maintain minimum connections', async () => {
      const pool = await createPool({
        minConnections: 2,
        maxConnections: 5,
      });

      // Use warmUp() instead of waiting for automatic warmup interval (saves ~11s)
      await pool.warmUp();

      const stats = pool.getStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(2);
    });

    it('should warmUp pool to minConnections', async () => {
      const pool = await createPool({
        minConnections: 3,
        maxConnections: 5,
      });

      await pool.warmUp();

      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(3);
      expect(stats.connectionsCreated).toBe(3);
    });
  });

  describe('Pool Shutdown', () => {
    it('should drain pool and close all connections', async () => {
      const pool = await createPool();

      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();

      await pool.drain();

      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(0);
      expect(stats.connectionsDestroyed).toBe(2);
    });

    it('should reject waiting requests on drain', async () => {
      const pool = await createPool({
        maxConnections: 1,
        minConnections: 0,
        acquireTimeout: 10000
      });

      const conn1 = await pool.acquire();

      // Queue a request
      const acquirePromise = pool.acquire();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Drain the pool
      await pool.drain();

      // Queued request should be rejected
      await expect(acquirePromise).rejects.toThrow('Pool is shutting down');

      await pool.release(conn1);
    });

    it('should prevent new acquisitions after shutdown', async () => {
      const pool = await createPool();

      await pool.drain();

      await expect(pool.acquire()).rejects.toThrow(
        'Cannot acquire connection from shutting down pool'
      );
    });

    it('should handle release gracefully after shutdown', async () => {
      const pool = await createPool();

      const conn = await pool.acquire();
      await pool.drain();

      // Should not throw
      await expect(pool.release(conn)).resolves.toBeUndefined();
    });
  });

  describe('Shared Cache Mode', () => {
    it('should enable shared cache mode by default', async () => {
      const pool = await createPool({ enableSharedCache: true });

      const conn = await pool.acquire();

      // Shared cache mode is enabled internally during connection creation
      // We can verify the connection works (cache pragma is not directly queryable)
      expect(conn).toBeDefined();
      expect(conn.open).toBe(true);

      await pool.release(conn);
    });

    it('should work without shared cache mode', async () => {
      const pool = await createPool({ enableSharedCache: false });

      const conn = await pool.acquire();
      expect(conn).toBeDefined();

      await pool.release(conn);
    });
  });

  describe('Pragma Settings', () => {
    it('should apply pragma settings to new connections', async () => {
      const pool = await createPool({
        pragmaSettings: {
          journal_mode: 'WAL',
          synchronous: 'NORMAL',
        },
      });

      const conn = await pool.acquire();

      const journalMode = conn.pragma('journal_mode', { simple: true });
      expect(journalMode).toBe('wal');

      await pool.release(conn);
    });

    it('should handle pragma errors gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pool = await createPool({
        pragmaSettings: {
          invalid_pragma: 'value',
        },
      });

      const conn = await pool.acquire();
      expect(conn).toBeDefined();

      await pool.release(conn);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('createSQLitePool Helper', () => {
    it('should create pool using helper function', async () => {
      const { createSQLitePool } = await import('@orchestr8/testkit/sqlite');

      const pool = createSQLitePool(dbPath, {
        maxConnections: 5,
      });
      pools.push(pool);

      const conn = await pool.acquire();
      expect(conn).toBeDefined();

      await pool.release(conn);
    });
  });

  describe('SQLitePoolManager', () => {
    it('should get or create named pools', async () => {
      const { poolManager } = await import('@orchestr8/testkit/sqlite');

      const pool1 = poolManager.getPool('test1', dbPath);
      const pool2 = poolManager.getPool('test2', dbPath);
      const pool1Again = poolManager.getPool('test1', dbPath);

      expect(pool1).toBe(pool1Again);
      expect(pool1).not.toBe(pool2);

      await poolManager.drainAll();
    });

    it('should remove and drain specific pool', async () => {
      const { poolManager } = await import('@orchestr8/testkit/sqlite');

      const pool = poolManager.getPool('test', dbPath);
      const conn = await pool.acquire();

      await poolManager.removePool('test');

      // Pool should be drained
      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(0);
    });

    it('should drain all pools', async () => {
      const { poolManager } = await import('@orchestr8/testkit/sqlite');

      const pool1 = poolManager.getPool('test1', dbPath);
      const pool2 = poolManager.getPool('test2', dbPath);

      await pool1.acquire();
      await pool2.acquire();

      await poolManager.drainAll();

      expect(pool1.getStats().totalConnections).toBe(0);
      expect(pool2.getStats().totalConnections).toBe(0);
    });

    it('should get stats for all pools', async () => {
      const { poolManager } = await import('@orchestr8/testkit/sqlite');

      poolManager.getPool('test1', dbPath);
      poolManager.getPool('test2', dbPath);

      const allStats = poolManager.getAllStats();

      expect(allStats).toHaveProperty('test1');
      expect(allStats).toHaveProperty('test2');
      expect(allStats.test1).toHaveProperty('totalConnections');
      expect(allStats.test2).toHaveProperty('totalConnections');

      await poolManager.drainAll();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection creation errors', async () => {
      const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite');

      // Invalid database path
      const invalidPath = '/nonexistent/directory/that/does/not/exist/test.db';
      const pool = new SQLiteConnectionPool(invalidPath);
      pools.push(pool);

      await expect(pool.acquire()).rejects.toThrow();
    });

    it('should handle connection close errors during drain', async () => {
      const pool = await createPool();
      const conn = await pool.acquire();

      // Release connection normally
      await pool.release(conn);

      // Manually close the connection to simulate an error condition
      conn.close();

      // Drain should handle the already-closed connection gracefully
      await pool.drain();

      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(0);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent acquisitions', async () => {
      const pool = await createPool({ maxConnections: 5 });

      // Acquire multiple connections concurrently
      const acquisitions = Array.from({ length: 10 }, () =>
        pool.acquire().then(async (conn) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return conn;
        })
      );

      const connections = await Promise.all(acquisitions);
      expect(connections).toHaveLength(10);

      // Release all
      await Promise.all(connections.map(conn => pool.release(conn)));

      const stats = pool.getStats();
      expect(stats.connectionsInUse).toBe(0);
    });

    it('should handle concurrent releases', async () => {
      const pool = await createPool({ maxConnections: 3 });

      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();
      const conn3 = await pool.acquire();

      // Release concurrently
      await Promise.all([
        pool.release(conn1),
        pool.release(conn2),
        pool.release(conn3),
      ]);

      const stats = pool.getStats();
      expect(stats.connectionsInUse).toBe(0);
      expect(stats.idleConnections).toBe(3);
    });
  });

  describe('Default Pool Options', () => {
    it('should expose default pool options', async () => {
      const { DEFAULT_POOL_OPTIONS } = await import('@orchestr8/testkit/sqlite');

      expect(DEFAULT_POOL_OPTIONS).toMatchObject({
        maxConnections: 10,
        minConnections: 2,
        idleTimeout: 30000,
        acquireTimeout: 5000,
        enableSharedCache: true,
        validateConnections: true,
      });

      expect(DEFAULT_POOL_OPTIONS.pragmaSettings).toMatchObject({
        journal_mode: 'WAL',
        synchronous: 'NORMAL',
        foreign_keys: 'ON',
        temp_store: 'MEMORY',
      });
    });
  });
});
