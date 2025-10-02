import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from 'better-sqlite3';

/**
 * Testkit SQLite Features Test
 *
 * Verifies that @orchestr8/testkit SQLite utilities work correctly
 * with the lean core implementation.
 *
 * REQUIRES: better-sqlite3
 *
 * Tests cover:
 * - In-memory database creation
 * - File-based database creation
 * - Transaction management
 * - Migration support
 * - Seeding utilities
 * - Cleanup helpers
 */

describe('Testkit SQLite Features', () => {
  let db: Database | null = null;
  const databases: Database[] = [];

  afterEach(() => {
    // Clean up all databases after each test
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

  describe('Database Creation', () => {
    it('should create in-memory SQLite database', async () => {
      try {
        const { createMemoryUrl, FileDatabase } = await import('@orchestr8/testkit/sqlite');

        // Create in-memory database URL
        const memoryUrl = createMemoryUrl();
        expect(memoryUrl).toContain(':memory:');

        // Create database instance
        const fileDb = new FileDatabase(memoryUrl);
        db = fileDb.getDatabase();
        databases.push(db);

        // Verify database works
        const result = db.prepare('SELECT 1 as value').get() as { value: number };
        expect(result.value).toBe(1);

        console.log('✅ In-memory SQLite database created successfully');
      } catch (error) {
        console.error('SQLite import error:', error);
        throw new Error('Failed to import SQLite utilities - ensure better-sqlite3 is installed');
      }
    });

    it('should create file-based SQLite database', async () => {
      const { createFileDatabase } = await import('@orchestr8/testkit/sqlite');
      const { createTempDirectory } = await import('@orchestr8/testkit/fs');

      // Create temp directory for database file
      const tempDir = createTempDirectory();
      const dbPath = `${tempDir.path}/test.db`;

      // Create file database
      const fileDb = createFileDatabase(dbPath);
      db = fileDb.getDatabase();
      databases.push(db);

      // Create a table and insert data
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        )
      `);

      db.prepare('INSERT INTO users (name) VALUES (?)').run('John Doe');

      // Verify data persists
      const user = db.prepare('SELECT * FROM users WHERE name = ?').get('John Doe') as any;
      expect(user).toBeDefined();
      expect(user.name).toBe('John Doe');

      console.log('✅ File-based SQLite database created at:', dbPath);
    });

    it('should handle database with WAL mode and pragmas', async () => {
      const { createMemoryUrl, FileDatabase, applyRecommendedPragmas } = await import('@orchestr8/testkit/sqlite');

      const memoryUrl = createMemoryUrl({ mode: 'wal' });
      const fileDb = new FileDatabase(memoryUrl);
      db = fileDb.getDatabase();
      databases.push(db);

      // Apply recommended pragmas for testing
      const applied = applyRecommendedPragmas(db);

      expect(applied).toHaveProperty('journal_mode');
      expect(applied).toHaveProperty('synchronous');
      expect(applied).toHaveProperty('temp_store');

      console.log('✅ Applied pragmas:', Object.keys(applied).join(', '));
    });
  });

  describe('Migration Support', () => {
    it('should run database migrations', async () => {
      const {
        createMemoryUrl,
        FileDatabase,
        applyMigrations,
        resetDatabase
      } = await import('@orchestr8/testkit/sqlite');

      const fileDb = new FileDatabase(createMemoryUrl());
      db = fileDb.getDatabase();
      databases.push(db);

      // Define test migrations
      const migrations = [
        {
          version: 1,
          up: `CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL
          )`
        },
        {
          version: 2,
          up: `ALTER TABLE users ADD COLUMN email TEXT`
        },
        {
          version: 3,
          up: `CREATE INDEX idx_users_email ON users(email)`
        }
      ];

      // Apply migrations
      const migrationDb = {
        exec: (sql: string) => db!.exec(sql),
        prepare: (sql: string) => db!.prepare(sql),
        pragma: (pragma: string) => db!.pragma(pragma),
        close: () => db!.close()
      };

      for (const migration of migrations) {
        migrationDb.exec(migration.up);
      }

      // Verify migrations applied
      const tableInfo = db.prepare("PRAGMA table_info('users')").all();
      const columns = (tableInfo as any[]).map(col => col.name);

      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('email');

      console.log('✅ Migrations applied successfully');
    });

    it('should reset database to clean state', async () => {
      const { createMemoryUrl, FileDatabase, resetDatabase } = await import('@orchestr8/testkit/sqlite');

      const fileDb = new FileDatabase(createMemoryUrl());
      db = fileDb.getDatabase();
      databases.push(db);

      // Create initial schema
      db.exec(`
        CREATE TABLE test_table (id INTEGER PRIMARY KEY);
        INSERT INTO test_table (id) VALUES (1), (2), (3);
      `);

      // Verify data exists
      let count = db.prepare('SELECT COUNT(*) as count FROM test_table').get() as { count: number };
      expect(count.count).toBe(3);

      // Reset database
      await resetDatabase({
        exec: (sql: string) => db!.exec(sql),
        prepare: (sql: string) => db!.prepare(sql),
        pragma: (pragma: string) => db!.pragma(pragma),
        close: () => {}
      });

      // Verify tables are gone
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all();

      expect(tables).toHaveLength(0);

      console.log('✅ Database reset successfully');
    });
  });

  describe('Seeding Utilities', () => {
    it('should seed database with SQL statements', async () => {
      const { createMemoryUrl, FileDatabase, seedWithSql } = await import('@orchestr8/testkit/sqlite');

      const fileDb = new FileDatabase(createMemoryUrl());
      db = fileDb.getDatabase();
      databases.push(db);

      // Create schema
      db.exec(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          price REAL NOT NULL
        )
      `);

      // Seed with SQL
      const seedSql = `
        INSERT INTO products (name, price) VALUES
          ('Widget', 9.99),
          ('Gadget', 19.99),
          ('Doohickey', 14.99);
      `;

      await seedWithSql(db, seedSql);

      // Verify seeded data
      const products = db.prepare('SELECT * FROM products').all();
      expect(products).toHaveLength(3);

      console.log('✅ Database seeded with', products.length, 'products');
    });

    it('should seed database with batch operations', async () => {
      const { createMemoryUrl, FileDatabase, seedWithBatch } = await import('@orchestr8/testkit/sqlite');

      const fileDb = new FileDatabase(createMemoryUrl());
      db = fileDb.getDatabase();
      databases.push(db);

      // Create schema
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          age INTEGER
        )
      `);

      // Seed with batch
      const users = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 }
      ];

      await seedWithBatch(db, {
        table: 'users',
        data: users,
        chunkSize: 2
      });

      // Verify seeded data
      const allUsers = db.prepare('SELECT * FROM users').all();
      expect(allUsers).toHaveLength(3);

      console.log('✅ Batch seeded', allUsers.length, 'users');
    });
  });

  describe('Transaction Management', () => {
    it('should handle transactions with rollback on error', async () => {
      const { createMemoryUrl, FileDatabase, withTransaction } = await import('@orchestr8/testkit/sqlite');

      const fileDb = new FileDatabase(createMemoryUrl());
      db = fileDb.getDatabase();
      databases.push(db);

      // Create schema
      db.exec(`
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY,
          balance REAL NOT NULL
        )
      `);

      // Insert initial data
      db.prepare('INSERT INTO accounts (id, balance) VALUES (1, 100.0)').run();
      db.prepare('INSERT INTO accounts (id, balance) VALUES (2, 50.0)').run();

      // Try transaction that should rollback
      try {
        await withTransaction(db, async (tx) => {
          // Transfer money
          tx.prepare('UPDATE accounts SET balance = balance - 30 WHERE id = 1').run();
          tx.prepare('UPDATE accounts SET balance = balance + 30 WHERE id = 2').run();

          // Force an error
          throw new Error('Simulated transaction error');
        });
      } catch (error) {
        // Expected error
      }

      // Verify rollback - balances should be unchanged
      const account1 = db.prepare('SELECT balance FROM accounts WHERE id = 1').get() as { balance: number };
      const account2 = db.prepare('SELECT balance FROM accounts WHERE id = 2').get() as { balance: number };

      expect(account1.balance).toBe(100.0);
      expect(account2.balance).toBe(50.0);

      console.log('✅ Transaction rolled back successfully');
    });

    it('should commit successful transactions', async () => {
      const { createMemoryUrl, FileDatabase, withTransaction } = await import('@orchestr8/testkit/sqlite');

      const fileDb = new FileDatabase(createMemoryUrl());
      db = fileDb.getDatabase();
      databases.push(db);

      // Create schema
      db.exec(`
        CREATE TABLE inventory (
          id INTEGER PRIMARY KEY,
          item TEXT NOT NULL,
          quantity INTEGER NOT NULL
        )
      `);

      // Successful transaction
      await withTransaction(db, async (tx) => {
        tx.prepare('INSERT INTO inventory (item, quantity) VALUES (?, ?)').run('Apples', 10);
        tx.prepare('INSERT INTO inventory (item, quantity) VALUES (?, ?)').run('Oranges', 15);
        tx.prepare('INSERT INTO inventory (item, quantity) VALUES (?, ?)').run('Bananas', 20);
      });

      // Verify commit
      const items = db.prepare('SELECT COUNT(*) as count FROM inventory').get() as { count: number };
      expect(items.count).toBe(3);

      console.log('✅ Transaction committed successfully');
    });
  });

  describe('Cleanup Utilities', () => {
    it('should register and cleanup databases', async () => {
      const {
        createMemoryUrl,
        FileDatabase,
        registerDatabaseCleanup,
        executeDatabaseCleanup,
        getCleanupCount
      } = await import('@orchestr8/testkit/sqlite');

      // Create multiple databases
      const db1 = new FileDatabase(createMemoryUrl());
      const db2 = new FileDatabase(createMemoryUrl());
      const db3 = new FileDatabase(createMemoryUrl());

      databases.push(db1.getDatabase(), db2.getDatabase(), db3.getDatabase());

      // Register for cleanup
      const cleanup1 = registerDatabaseCleanup(db1.getDatabase());
      const cleanup2 = registerDatabaseCleanup(db2.getDatabase());
      const cleanup3 = registerDatabaseCleanup(db3.getDatabase());

      // Check cleanup count
      const count = getCleanupCount();
      expect(count).toBeGreaterThanOrEqual(3);

      // Execute cleanup
      await executeDatabaseCleanup();

      // Verify cleanup
      const countAfter = getCleanupCount();
      expect(countAfter).toBe(0);

      console.log('✅ Cleaned up', count, 'databases');
    });
  });

  describe('ORM URL Generation', () => {
    it('should generate Prisma and Drizzle URLs', async () => {
      const { prismaUrl, drizzleUrl } = await import('@orchestr8/testkit/sqlite');

      // Test Prisma URL generation
      const prismaMemoryUrl = prismaUrl(':memory:');
      expect(prismaMemoryUrl).toContain('file:');

      const prismaFileUrl = prismaUrl('/path/to/db.sqlite');
      expect(prismaFileUrl).toContain('file:');

      // Test Drizzle URL generation
      const drizzleMemoryUrl = drizzleUrl(':memory:');
      expect(drizzleMemoryUrl).toBeDefined();

      const drizzleFileUrl = drizzleUrl('/path/to/db.sqlite');
      expect(drizzleFileUrl).toBeDefined();

      console.log('✅ Generated ORM URLs:');
      console.log('  Prisma:', prismaMemoryUrl);
      console.log('  Drizzle:', drizzleMemoryUrl);
    });
  });
});