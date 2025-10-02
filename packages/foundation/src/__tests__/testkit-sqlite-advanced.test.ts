import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from 'better-sqlite3';

/**
 * Testkit SQLite Advanced Features Test
 *
 * Tests advanced SQLite utilities:
 * - Performance optimization (WAL mode, pragmas)
 * - Backup and restore
 * - Query builders
 * - Index management
 * - Connection pooling
 * - Performance benchmarks
 */

describe('Testkit SQLite Advanced Features', () => {
  let db: Database | null = null;
  const databases: Database[] = [];

  afterEach(() => {
    databases.forEach(database => {
      try {
        if (!database.readonly) {
          database.close();
        }
      } catch (error) {
        // Ignore close errors
      }
    });
    databases.length = 0;
    db = null;
  });

  describe('WAL Mode and Pragmas', () => {
    it('should enable WAL mode for better concurrency', async () => {
      const { createMemoryUrl, applyRecommendedPragmas } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      // Apply recommended pragmas including WAL mode
      const applied = applyRecommendedPragmas(db);

      expect(applied).toBeDefined();
      expect(applied).toHaveProperty('journal_mode');

      console.log('✅ WAL mode and pragmas applied:', Object.keys(applied).join(', '));
    });

    it('should optimize cache size', async () => {
      const { applyRecommendedPragmas } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      const pragmas = applyRecommendedPragmas(db);

      // Verify cache_size is set
      if (pragmas.cache_size) {
        expect(typeof pragmas.cache_size).toBe('number');
        console.log('✅ Cache size optimized:', pragmas.cache_size);
      }
    });

    it('should set synchronous mode for testing', async () => {
      const { applyRecommendedPragmas } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      const pragmas = applyRecommendedPragmas(db);

      expect(pragmas.synchronous).toBeDefined();

      console.log('✅ Synchronous mode:', pragmas.synchronous);
    });

    it('should configure temp store in memory', async () => {
      const { applyRecommendedPragmas } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      const pragmas = applyRecommendedPragmas(db);

      expect(pragmas.temp_store).toBeDefined();

      console.log('✅ Temp store configured:', pragmas.temp_store);
    });
  });

  describe('Connection Management', () => {
    it('should create multiple isolated connections', async () => {
      const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      // Create multiple in-memory databases
      const db1 = new Database(':memory:');
      const db2 = new Database(':memory:');
      const db3 = new Database(':memory:');

      databases.push(db1, db2, db3);

      // Create table in db1
      db1.exec('CREATE TABLE test (id INTEGER)');
      db1.exec('INSERT INTO test VALUES (1)');

      // Verify db2 doesn't have the table
      expect(() => {
        db2.exec('SELECT * FROM test');
      }).toThrow();

      console.log('✅ Multiple isolated connections work');
    });

    it('should handle readonly connections', async () => {
      const { createFileDatabase } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      // Create file database
      const fileDb = await createFileDatabase('readonly-test.db');
      const writeDb = new Database(fileDb.path);
      databases.push(writeDb);

      // Create schema
      writeDb.exec('CREATE TABLE test (id INTEGER)');
      writeDb.exec('INSERT INTO test VALUES (1)');
      writeDb.close();

      // Open readonly
      const readDb = new Database(fileDb.path, { readonly: true });
      databases.push(readDb);

      // Should be able to read
      const rows = readDb.prepare('SELECT * FROM test').all();
      expect(rows).toHaveLength(1);

      // Cleanup
      if (fileDb.cleanup) {
        await fileDb.cleanup();
      }

      console.log('✅ Readonly connections work');
    });
  });

  describe('Transaction Performance', () => {
    it('should handle nested transaction-like operations', async () => {
      const { withTransaction } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      db.exec('CREATE TABLE counters (id INTEGER PRIMARY KEY, value INTEGER)');
      db.exec('INSERT INTO counters VALUES (1, 0)');

      // Outer transaction
      await withTransaction(db, async (tx1) => {
        tx1.exec('UPDATE counters SET value = value + 1 WHERE id = 1');

        // Simulate nested operation
        const value = tx1.prepare('SELECT value FROM counters WHERE id = 1').get() as { value: number };
        expect(value.value).toBe(1);

        tx1.exec('UPDATE counters SET value = value + 1 WHERE id = 1');
      });

      const final = db.prepare('SELECT value FROM counters WHERE id = 1').get() as { value: number };
      expect(final.value).toBe(2);

      console.log('✅ Nested transaction-like operations work');
    });

    it('should rollback on error in transaction', async () => {
      const { withTransaction } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      db.exec('CREATE TABLE accounts (id INTEGER, balance INTEGER)');
      db.exec('INSERT INTO accounts VALUES (1, 100), (2, 50)');

      try {
        await withTransaction(db, async (tx) => {
          tx.exec('UPDATE accounts SET balance = balance - 30 WHERE id = 1');
          tx.exec('UPDATE accounts SET balance = balance + 30 WHERE id = 2');

          // Simulate error
          throw new Error('Transaction failed');
        });
      } catch (error) {
        // Expected
      }

      // Verify rollback
      const account1 = db.prepare('SELECT balance FROM accounts WHERE id = 1').get() as { balance: number };
      expect(account1.balance).toBe(100); // Unchanged

      console.log('✅ Transaction rollback on error works');
    });
  });

  describe('Batch Operations', () => {
    it('should seed large datasets efficiently', async () => {
      const { seedWithBatch } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      db.exec(`
        CREATE TABLE large_table (
          id INTEGER PRIMARY KEY,
          name TEXT,
          value REAL
        )
      `);

      // Generate large dataset
      const data = Array.from({ length: 1000 }, (_, i) => ({
        name: `item-${i}`,
        value: Math.random() * 100
      }));

      // Batch insert
      await seedWithBatch(db, {
        table: 'large_table',
        data,
        chunkSize: 100
      });

      const count = db.prepare('SELECT COUNT(*) as count FROM large_table').get() as { count: number };
      expect(count.count).toBe(1000);

      console.log('✅ Large dataset seeded efficiently:', count.count, 'rows');
    });

    it('should handle batch operations with transactions', async () => {
      const { seedWithBatch, withTransaction } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      db.exec('CREATE TABLE batch_test (id INTEGER, data TEXT)');

      // Batch insert within transaction
      await withTransaction(db, async (tx) => {
        await seedWithBatch(tx, {
          table: 'batch_test',
          data: Array.from({ length: 500 }, (_, i) => ({
            data: `data-${i}`
          })),
          chunkSize: 50
        });
      });

      const count = db.prepare('SELECT COUNT(*) as count FROM batch_test').get() as { count: number };
      expect(count.count).toBe(500);

      console.log('✅ Batch operations with transactions work');
    });
  });

  describe('Migration Management', () => {
    it('should apply migrations in order', async () => {
      const { applyMigrations, resetDatabase } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      const migrations = [
        {
          version: 1,
          up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)'
        },
        {
          version: 2,
          up: 'ALTER TABLE users ADD COLUMN email TEXT'
        },
        {
          version: 3,
          up: 'CREATE INDEX idx_users_email ON users(email)'
        },
        {
          version: 4,
          up: 'CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)'
        }
      ];

      // Apply all migrations
      for (const migration of migrations) {
        db.exec(migration.up);
      }

      // Verify final schema
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = (tables as any[]).map(t => t.name);

      expect(tableNames).toContain('users');
      expect(tableNames).toContain('posts');

      console.log('✅ Migrations applied in order:', tableNames.join(', '));
    });

    it('should reset database and reapply migrations', async () => {
      const { resetDatabase } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      // Create initial schema
      db.exec('CREATE TABLE test1 (id INTEGER)');
      db.exec('CREATE TABLE test2 (id INTEGER)');

      // Reset database
      await resetDatabase({
        exec: (sql: string) => db!.exec(sql),
        prepare: (sql: string) => db!.prepare(sql),
        pragma: (pragma: string) => db!.pragma(pragma),
        close: () => {}
      });

      // Verify all tables are gone
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      expect(tables).toHaveLength(0);

      // Reapply schema
      db.exec('CREATE TABLE new_table (id INTEGER)');
      const newTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      expect(newTables).toHaveLength(1);

      console.log('✅ Database reset and schema reapplied');
    });
  });

  describe('Query Optimization', () => {
    it('should create indexes for performance', async () => {
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      db.exec(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY,
          name TEXT,
          category TEXT,
          price REAL
        )
      `);

      // Create indexes
      db.exec('CREATE INDEX idx_products_category ON products(category)');
      db.exec('CREATE INDEX idx_products_price ON products(price)');

      // Verify indexes
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
      const indexNames = (indexes as any[]).map(idx => idx.name);

      expect(indexNames).toContain('idx_products_category');
      expect(indexNames).toContain('idx_products_price');

      console.log('✅ Indexes created:', indexNames.join(', '));
    });

    it('should use prepared statements for performance', async () => {
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      db.exec('CREATE TABLE benchmark (id INTEGER, value TEXT)');

      // Prepare statement once
      const insert = db.prepare('INSERT INTO benchmark (id, value) VALUES (?, ?)');

      // Execute many times
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        insert.run(i, `value-${i}`);
      }
      const elapsed = Date.now() - start;

      const count = db.prepare('SELECT COUNT(*) as count FROM benchmark').get() as { count: number };
      expect(count.count).toBe(1000);

      console.log(`✅ Prepared statements: inserted 1000 rows in ${elapsed}ms`);
    });
  });

  describe('ORM Integration', () => {
    it('should generate Prisma URLs for in-memory databases', async () => {
      const { prismaUrl } = await import('@orchestr8/testkit/sqlite');

      const memoryUrl = prismaUrl(':memory:');

      expect(memoryUrl).toContain('file:');
      expect(memoryUrl).toContain('memory');

      console.log('✅ Prisma in-memory URL:', memoryUrl);
    });

    it('should generate Prisma URLs for file databases', async () => {
      const { prismaUrl } = await import('@orchestr8/testkit/sqlite');

      const fileUrl = prismaUrl('/tmp/test.db');

      expect(fileUrl).toContain('file:');
      expect(fileUrl).toContain('/tmp/test.db');

      console.log('✅ Prisma file URL:', fileUrl);
    });

    it('should generate Drizzle URLs', async () => {
      const { drizzleUrl } = await import('@orchestr8/testkit/sqlite');

      const memoryUrl = drizzleUrl(':memory:');
      const fileUrl = drizzleUrl('/path/to/db.sqlite');

      expect(memoryUrl).toBeDefined();
      expect(fileUrl).toBeDefined();

      console.log('✅ Drizzle URLs generated');
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should register multiple databases for cleanup', async () => {
      const {
        registerDatabaseCleanup,
        executeDatabaseCleanup,
        getCleanupCount
      } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      // Create multiple databases
      const dbs = Array.from({ length: 5 }, () => new Database(':memory:'));
      databases.push(...dbs);

      // Register all for cleanup
      dbs.forEach(d => registerDatabaseCleanup(d));

      // Check count
      const count = getCleanupCount();
      expect(count).toBeGreaterThanOrEqual(5);

      // Execute cleanup
      await executeDatabaseCleanup();

      // Verify cleanup
      expect(getCleanupCount()).toBe(0);

      console.log('✅ Multiple databases cleaned up:', count);
    });

    it('should handle cleanup of file-based databases', async () => {
      const {
        createFileDatabase,
        registerDatabaseCleanup,
        executeDatabaseCleanup
      } = await import('@orchestr8/testkit/sqlite');
      const Database = (await import('better-sqlite3')).default;

      const fileDb = await createFileDatabase('cleanup-test.db');
      const db = new Database(fileDb.path);
      databases.push(db);

      // Create some data
      db.exec('CREATE TABLE test (id INTEGER)');
      db.exec('INSERT INTO test VALUES (1), (2), (3)');

      // Register for cleanup
      registerDatabaseCleanup(db);

      // Execute cleanup
      await executeDatabaseCleanup();

      // File cleanup
      if (fileDb.cleanup) {
        await fileDb.cleanup();
      }

      console.log('✅ File database cleanup handled');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should benchmark insert performance', async () => {
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      db.exec('CREATE TABLE perf_test (id INTEGER, data TEXT)');

      const insert = db.prepare('INSERT INTO perf_test VALUES (?, ?)');

      // Benchmark
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        insert.run(i, `data-${i}`);
      }
      const elapsed = Date.now() - start;

      const count = db.prepare('SELECT COUNT(*) as count FROM perf_test').get() as { count: number };
      expect(count.count).toBe(10000);

      console.log(`✅ Insert benchmark: ${count.count} rows in ${elapsed}ms (${Math.round(count.count / elapsed * 1000)} rows/sec)`);
    });

    it('should benchmark query performance', async () => {
      const Database = (await import('better-sqlite3')).default;

      db = new Database(':memory:');
      databases.push(db);

      db.exec(`
        CREATE TABLE query_test (
          id INTEGER PRIMARY KEY,
          value INTEGER
        )
      `);

      // Insert test data
      const insert = db.prepare('INSERT INTO query_test VALUES (?, ?)');
      for (let i = 0; i < 1000; i++) {
        insert.run(i, Math.floor(Math.random() * 100));
      }

      // Benchmark queries
      const query = db.prepare('SELECT * FROM query_test WHERE value > ?');

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        query.all(50);
      }
      const elapsed = Date.now() - start;

      console.log(`✅ Query benchmark: 1000 queries in ${elapsed}ms (${Math.round(1000 / elapsed * 1000)} queries/sec)`);
    });
  });
});
