/* eslint-disable no-console, sonarjs/no-nested-functions -- Test output requires console logging; test cleanup scopes require nested functions */
import { describe, it, expect, afterEach } from 'vitest'

import type BetterSqlite3 from 'better-sqlite3'

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
  let db: InstanceType<typeof BetterSqlite3> | null = null
  const databases: Array<InstanceType<typeof BetterSqlite3>> = []

  afterEach(() => {
    // Clean up all databases after each test
    for (const database of databases) {
      try {
        if (!database.readonly) {
          database.close()
        }
      } catch {
        // Ignore close errors - database might already be closed
      }
    }
    databases.length = 0
    db = null
  })

  describe('Database Creation', () => {
    it('should create in-memory SQLite database', async () => {
      const Database = (await import('better-sqlite3')).default

      // Create database instance with :memory: string
      db = new Database(':memory:')
      databases.push(db)

      // Verify database works
      const result = db.prepare('SELECT 1 as value').get() as { value: number }
      expect(result.value).toBe(1)

      // Create table to verify full functionality
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
      db.prepare('INSERT INTO test (name) VALUES (?)').run('Test')

      const row = db.prepare('SELECT * FROM test').get() as { id: number; name: string }
      expect(row.name).toBe('Test')

      console.log('✅ In-memory SQLite database created successfully')
    })

    it('should create file-based SQLite database', async () => {
      const { createFileDatabase } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      // Create file database (returns object with path info)
      const fileDb = await createFileDatabase('test.db')

      // Create actual database connection
      db = new Database(fileDb.path)
      databases.push(db)

      // Create a table and insert data
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        )
      `)

      db.prepare('INSERT INTO users (name) VALUES (?)').run('John Doe')

      // Verify data persists
      const user = db.prepare('SELECT * FROM users WHERE name = ?').get('John Doe')
      expect(user).toBeDefined()
      expect(user.name).toBe('John Doe')

      console.log('✅ File-based SQLite database created at:', fileDb.path)
    })

    it('should create file database with connection pool', async () => {
      const { createFileDBWithPool } = await import('@orchestr8/testkit/sqlite')

      // Create file database with pool
      const fileDb = await createFileDBWithPool('test-pool.db', {
        maxConnections: 5,
        minConnections: 1,
        idleTimeout: 30000,
      })

      expect(fileDb.pool).toBeDefined()
      expect(fileDb.path).toBeDefined()
      expect(fileDb.url).toBeDefined()

      // Type guard: pool verified above
      if (!fileDb.pool) {
        throw new Error('Pool should be defined')
      }
      const { pool } = fileDb

      // Acquire connection from pool
      const conn1 = await pool.acquire()
      databases.push(conn1)

      // Use connection
      conn1.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
      conn1.prepare('INSERT INTO test (name) VALUES (?)').run('Test User')

      // Release connection back to pool
      await pool.release(conn1)

      // Acquire another connection and verify data persists
      const conn2 = await pool.acquire()
      databases.push(conn2)

      const result = conn2.prepare('SELECT * FROM test WHERE name = ?').get('Test User') as any
      expect(result).toBeDefined()
      expect(result.name).toBe('Test User')

      await pool.release(conn2)

      // Get pool stats
      const stats = pool.getStats()
      expect(stats).toHaveProperty('totalConnections')
      expect(stats).toHaveProperty('connectionsInUse')
      expect(stats).toHaveProperty('idleConnections')

      console.log('✅ File database with connection pool created, stats:', stats)

      // Cleanup pool
      await pool.drain()
      await fileDb.cleanup()
    })

    it('should handle database with WAL mode and pragmas', async () => {
      const { applyRecommendedPragmas } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      // WAL mode will be applied via applyRecommendedPragmas
      db = new Database(':memory:')
      databases.push(db)

      // Apply recommended pragmas for testing
      const applied = await applyRecommendedPragmas(db)

      expect(applied).toHaveProperty('journal_mode')
      expect(applied).toHaveProperty('foreign_keys')
      expect(applied).toHaveProperty('busy_timeout')

      console.log('✅ Applied pragmas:', Object.keys(applied).join(', '))
    })

    it('should probe SQLite environment capabilities', async () => {
      const { probeEnvironment } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      db = new Database(':memory:')
      databases.push(db)

      // Probe environment with capability checks
      const result = await probeEnvironment(db, {
        logLevel: 'silent',
        required: ['foreign_keys', 'json1'],
      })

      // Verify result structure
      expect(result).toHaveProperty('pragmas')
      expect(result).toHaveProperty('capabilities')

      // Verify capabilities
      expect(result.capabilities).toHaveProperty('wal')
      expect(result.capabilities).toHaveProperty('foreign_keys')
      expect(result.capabilities).toHaveProperty('json1')
      expect(result.capabilities).toHaveProperty('fts5')

      // Verify required capabilities are available
      expect(result.capabilities.foreign_keys).toBe(true)
      expect(result.capabilities.json1).toBe(true)

      console.log('✅ Environment probed successfully:', result.capabilities)
    })
  })

  describe('Migration Support', () => {
    it('should apply migrations using applyMigrations', async () => {
      const { applyMigrations } = await import('@orchestr8/testkit/sqlite')
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const Database = (await import('better-sqlite3')).default
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      db = new Database(':memory:')
      databases.push(db)

      // Create temp directory using TestKit (auto-cleanup)
      const tempDir = await createTempDirectory()
      const tmpDir = tempDir.path

      // Write migration files
      await fs.writeFile(
        path.join(tmpDir, '001_create_users.sql'),
        'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);'
      )
      await fs.writeFile(path.join(tmpDir, '002_add_email.sql'), 'ALTER TABLE users ADD COLUMN email TEXT;')
      await fs.writeFile(path.join(tmpDir, '003_create_index.sql'), 'CREATE INDEX idx_users_email ON users(email);')

      // Apply migrations using actual applyMigrations function
      await applyMigrations(db, { dir: tmpDir })

      // Verify migrations applied
      const tableInfo = db.prepare("PRAGMA table_info('users')").all()
      const columns = (tableInfo as any[]).map((col) => col.name)

      expect(columns).toContain('id')
      expect(columns).toContain('name')
      expect(columns).toContain('email')

      // Verify index was created
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_email'").all()
      expect(indexes).toHaveLength(1)

      console.log('✅ Migrations applied successfully using applyMigrations')
      // No manual cleanup needed - TestKit handles it automatically
    })

    it('should reset database using resetDatabase', async () => {
      const { resetDatabase } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      db = new Database(':memory:')
      databases.push(db)

      // Create initial schema with multiple object types
      db.exec(`
        CREATE TABLE test_table (id INTEGER PRIMARY KEY);
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
        CREATE INDEX idx_users ON users(name);
        CREATE VIEW user_view AS SELECT * FROM users;
        INSERT INTO test_table (id) VALUES (1), (2), (3);
      `)

      // Verify data exists
      const count = db.prepare('SELECT COUNT(*) as count FROM test_table').get() as { count: number }
      expect(count.count).toBe(3)

      // Create a database adapter with all() method for resetDatabase
      const dbAdapter = {
        exec: (sql: string) => db.exec(sql),
        all: (sql: string) => db.prepare(sql).all(),
      }

      // Reset database using actual resetDatabase function with allowReset flag
      await resetDatabase(dbAdapter, { allowReset: true })

      // Verify all user objects are gone
      const remainingObjects = db
        .prepare(
          "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index', 'view') AND name NOT LIKE 'sqlite_%'"
        )
        .all()

      expect(remainingObjects).toHaveLength(0)

      console.log('✅ Database reset successfully using resetDatabase')
    })
  })

  describe('Seeding Utilities', () => {
    it('should seed database with SQL statements', async () => {
      const { seedWithSql } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          price REAL NOT NULL
        )
      `)

      // Seed with SQL
      const seedSql = `
        INSERT INTO products (name, price) VALUES
          ('Widget', 9.99),
          ('Gadget', 19.99),
          ('Doohickey', 14.99);
      `

      await seedWithSql(db, seedSql)

      // Verify seeded data
      const products = db.prepare('SELECT * FROM products').all()
      expect(products).toHaveLength(3)

      console.log('✅ Database seeded with', products.length, 'products')
    })

    it('should seed database with batch operations', async () => {
      const { seedWithBatch } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          age INTEGER
        )
      `)

      // Seed with batch - seedWithBatch expects (db, operations[], options)
      const users = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 },
      ]

      // Create operations array for seedWithBatch
      const operations = users.map((user) => ({
        sql: `INSERT INTO users (name, age) VALUES ('${user.name}', ${user.age})`,
        label: `Insert user ${user.name}`,
      }))

      await seedWithBatch(db, operations, { maxBatchSize: 2 })

      // Verify seeded data
      const allUsers = db.prepare('SELECT * FROM users').all()
      expect(allUsers).toHaveLength(3)

      console.log('✅ Batch seeded', allUsers.length, 'users')
    })

    it('should seed database with files using seedWithFiles', async () => {
      const { seedWithFiles } = await import('@orchestr8/testkit/sqlite')
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const Database = (await import('better-sqlite3')).default
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          price REAL NOT NULL
        );
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );
      `)

      // Create temp directory using TestKit (auto-cleanup)
      const tempDir = await createTempDirectory()
      const tmpDir = tempDir.path

      // Write seed files
      await fs.writeFile(
        path.join(tmpDir, '001_categories.sql'),
        `INSERT INTO categories (name) VALUES ('Electronics'), ('Books'), ('Clothing');`
      )
      await fs.writeFile(
        path.join(tmpDir, '002_products.sql'),
        `INSERT INTO products (name, price) VALUES
          ('Laptop', 999.99),
          ('Mouse', 29.99),
          ('Keyboard', 79.99);`
      )

      // Seed using actual seedWithFiles function
      await seedWithFiles(db, { dir: tmpDir })

      // Verify seeded data
      const categories = db.prepare('SELECT * FROM categories').all()
      const products = db.prepare('SELECT * FROM products').all()

      expect(categories).toHaveLength(3)
      expect(products).toHaveLength(3)

      console.log('✅ Database seeded with files using seedWithFiles')
      // No manual cleanup needed - TestKit handles it automatically
    })
  })

  describe('Transaction Management', () => {
    it('should handle transactions with rollback on error', async () => {
      const { withTransaction } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY,
          balance REAL NOT NULL
        )
      `)

      // Insert initial data
      db.prepare('INSERT INTO accounts (id, balance) VALUES (1, 100.0)').run()
      db.prepare('INSERT INTO accounts (id, balance) VALUES (2, 50.0)').run()

      // Create adapter for better-sqlite3
      const adapter = {
        begin: (database: typeof db) => {
          database.exec('BEGIN')
          return Promise.resolve(database)
        },
        commit: (database: typeof db) => Promise.resolve(database.exec('COMMIT')),
        rollback: (database: typeof db) => Promise.resolve(database.exec('ROLLBACK')),
      }

      // Try transaction that should rollback
      try {
        await withTransaction(db, adapter, (tx) => {
          // Transfer money
          tx.prepare('UPDATE accounts SET balance = balance - 30 WHERE id = 1').run()
          tx.prepare('UPDATE accounts SET balance = balance + 30 WHERE id = 2').run()

          // Force an error
          throw new Error('Simulated transaction error')
        })
      } catch {
        // Expected error - transaction should rollback
      }

      // Verify rollback - balances should be unchanged
      const account1 = db.prepare('SELECT balance FROM accounts WHERE id = 1').get() as { balance: number }
      const account2 = db.prepare('SELECT balance FROM accounts WHERE id = 2').get() as { balance: number }

      expect(account1.balance).toBe(100.0)
      expect(account2.balance).toBe(50.0)

      console.log('✅ Transaction rolled back successfully')
    })

    it('should commit successful transactions', async () => {
      const { withTransaction } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      db = new Database(':memory:')
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE inventory (
          id INTEGER PRIMARY KEY,
          item TEXT NOT NULL,
          quantity INTEGER NOT NULL
        )
      `)

      // Create adapter for better-sqlite3
      const adapter = {
        begin: (database: typeof db) => {
          database.exec('BEGIN')
          return Promise.resolve(database)
        },
        commit: (database: typeof db) => Promise.resolve(database.exec('COMMIT')),
        rollback: (database: typeof db) => Promise.resolve(database.exec('ROLLBACK')),
      }

      // Successful transaction
      await withTransaction(db, adapter, (tx) => {
        tx.prepare('INSERT INTO inventory (item, quantity) VALUES (?, ?)').run('Apples', 10)
        tx.prepare('INSERT INTO inventory (item, quantity) VALUES (?, ?)').run('Oranges', 15)
        tx.prepare('INSERT INTO inventory (item, quantity) VALUES (?, ?)').run('Bananas', 20)
        return Promise.resolve()
      })

      // Verify commit
      const items = db.prepare('SELECT COUNT(*) as count FROM inventory').get() as { count: number }
      expect(items.count).toBe(3)

      console.log('✅ Transaction committed successfully')
    })
  })

  describe('Cleanup Utilities', () => {
    it('should register and cleanup databases', async () => {
      const { registerDatabaseCleanup, cleanupAllSqlite, getCleanupCount } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      // Create multiple databases
      const rawDb1 = new Database(':memory:')
      const rawDb2 = new Database(':memory:')
      const rawDb3 = new Database(':memory:')

      databases.push(rawDb1, rawDb2, rawDb3)

      // Wrap databases with cleanup method for DatabaseLike interface
      const db1 = {
        db: rawDb1,
        cleanup: () => {
          if (!rawDb1.readonly && rawDb1.open) {
            rawDb1.close()
          }
        },
      }
      const db2 = {
        db: rawDb2,
        cleanup: () => {
          if (!rawDb2.readonly && rawDb2.open) {
            rawDb2.close()
          }
        },
      }
      const db3 = {
        db: rawDb3,
        cleanup: () => {
          if (!rawDb3.readonly && rawDb3.open) {
            rawDb3.close()
          }
        },
      }

      // Register for cleanup
      registerDatabaseCleanup(db1)
      registerDatabaseCleanup(db2)
      registerDatabaseCleanup(db3)

      // Check cleanup count
      const count = getCleanupCount()
      expect(count).toBeGreaterThanOrEqual(3)

      // Execute cleanup
      await cleanupAllSqlite()

      // Verify cleanup
      const countAfter = getCleanupCount()
      expect(countAfter).toBe(0)

      console.log('✅ Cleaned up', count, 'databases')
    })

    it('should register and execute cleanup functions', async () => {
      const { registerCleanup, executeCleanup, getCleanupCount } = await import('@orchestr8/testkit/sqlite')

      let cleanupCalled = false
      const cleanupFn = () => {
        cleanupCalled = true
      }

      // Register cleanup function
      registerCleanup(cleanupFn)
      expect(getCleanupCount()).toBeGreaterThan(0)

      // Execute specific cleanup
      const executed = await executeCleanup(cleanupFn)
      expect(executed).toBe(true)
      expect(cleanupCalled).toBe(true)

      // Verify cleanup was removed from registry
      const executedAgain = await executeCleanup(cleanupFn)
      expect(executedAgain).toBe(false)

      console.log('✅ Cleanup function registered and executed')
    })

    it('should unregister cleanup without executing', async () => {
      const { registerCleanup, unregisterCleanup } = await import('@orchestr8/testkit/sqlite')

      let cleanupCalled = false
      const cleanupFn = () => {
        cleanupCalled = true
      }

      // Register and unregister
      registerCleanup(cleanupFn)
      const removed = unregisterCleanup(cleanupFn)

      expect(removed).toBe(true)
      expect(cleanupCalled).toBe(false)

      // Try to remove again
      const removedAgain = unregisterCleanup(cleanupFn)
      expect(removedAgain).toBe(false)

      console.log('✅ Cleanup unregistered without execution')
    })

    it('should get detailed cleanup counts', async () => {
      const { registerCleanup, registerDatabaseCleanup, getDetailedCleanupCount, cleanupAllSqlite } = await import(
        '@orchestr8/testkit/sqlite'
      )
      const Database = (await import('better-sqlite3')).default

      // Register both functions and databases
      registerCleanup(() => {
        // Cleanup function 1
      })
      registerCleanup(() => {
        // Cleanup function 2
      })

      const rawDb = new Database(':memory:')
      databases.push(rawDb)

      const dbCleanable = {
        cleanup: () => {
          if (!rawDb.readonly && rawDb.open) {
            rawDb.close()
          }
        },
      }

      registerDatabaseCleanup(dbCleanable)

      const counts = getDetailedCleanupCount()
      expect(counts).toHaveProperty('functions')
      expect(counts).toHaveProperty('databases')
      expect(counts).toHaveProperty('total')
      expect(counts.total).toBeGreaterThanOrEqual(3)

      console.log('✅ Detailed cleanup counts:', counts)

      await cleanupAllSqlite()
    })

    it('should use useSqliteCleanup hook for automatic cleanup', async () => {
      const { useSqliteCleanup, createFileDatabase, getCleanupCount } = await import('@orchestr8/testkit/sqlite')

      // Create a wrapped database creator
      const useDatabase = useSqliteCleanup(() => createFileDatabase('hook-test.db'))

      const initialCount = getCleanupCount()

      // Create database - should auto-register for cleanup
      const fileDb = await useDatabase()

      expect(fileDb).toBeDefined()
      expect(fileDb.path).toBeDefined()
      expect(getCleanupCount()).toBeGreaterThan(initialCount)

      console.log('✅ Database auto-registered with useSqliteCleanup hook')

      await fileDb.cleanup()
    })

    it('should use withSqliteCleanupScope for scoped cleanup', async () => {
      const { withSqliteCleanupScope, registerCleanup, getCleanupCount } = await import('@orchestr8/testkit/sqlite')

      let scopeCleanupCalled = false
      const initialCount = getCleanupCount()

      // Execute within cleanup scope
      const result = await withSqliteCleanupScope(() => {
        registerCleanup(() => {
          scopeCleanupCalled = true
        })

        // Cleanup count should increase within scope
        expect(getCleanupCount()).toBeGreaterThan(initialCount)

        return Promise.resolve('scope-result')
      })

      // Verify result returned
      expect(result).toBe('scope-result')

      // Verify scoped cleanup was executed
      expect(scopeCleanupCalled).toBe(true)

      // Cleanup count should return to initial after scope
      expect(getCleanupCount()).toBeLessThanOrEqual(initialCount + 1)

      console.log('✅ Scoped cleanup executed successfully')
    })

    it('should create cleanable file database', async () => {
      const { createCleanableFileDatabase, createFileDatabase, getCleanupCount } = await import(
        '@orchestr8/testkit/sqlite'
      )

      const initialCount = getCleanupCount()

      // Create cleanable database
      const fileDb = await createCleanableFileDatabase(() => createFileDatabase('cleanable.db'))

      expect(fileDb).toBeDefined()
      expect(fileDb.path).toBeDefined()
      expect(getCleanupCount()).toBeGreaterThan(initialCount)

      console.log('✅ Cleanable file database created and registered')

      await fileDb.cleanup()
    })

    it('should unregister database cleanup without executing', async () => {
      const { registerDatabaseCleanup, unregisterDatabaseCleanup } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default

      const rawDb = new Database(':memory:')
      databases.push(rawDb)

      let cleanupCalled = false
      const dbCleanable = {
        cleanup: () => {
          cleanupCalled = true
          if (!rawDb.readonly && rawDb.open) {
            rawDb.close()
          }
        },
      }

      // Register and unregister
      registerDatabaseCleanup(dbCleanable)
      const removed = unregisterDatabaseCleanup(dbCleanable)

      expect(removed).toBe(true)
      expect(cleanupCalled).toBe(false)

      // Try to remove again
      const removedAgain = unregisterDatabaseCleanup(dbCleanable)
      expect(removedAgain).toBe(false)

      console.log('✅ Database cleanup unregistered without execution')
    })
  })

  describe('ORM URL Generation', () => {
    it('should generate Prisma and Drizzle URLs', async () => {
      const { prismaUrl, drizzleUrl } = await import('@orchestr8/testkit/sqlite')

      // Test Prisma URL generation
      const prismaMemoryUrl = prismaUrl('memory')
      expect(prismaMemoryUrl).toContain('file:')
      expect(prismaMemoryUrl).toContain('memory')

      const prismaFileUrl = prismaUrl('file', '/path/to/db.sqlite')
      expect(prismaFileUrl).toContain('file:')
      expect(prismaFileUrl).toContain('/path/to/db.sqlite')

      // Test Drizzle URL generation
      const drizzleMemoryUrl = drizzleUrl('memory')
      expect(drizzleMemoryUrl).toBeDefined()

      const drizzleFileUrl = drizzleUrl('file', '/path/to/db.sqlite')
      expect(drizzleFileUrl).toBeDefined()
      expect(drizzleFileUrl).toContain('/path/to/db.sqlite')

      console.log('✅ Generated ORM URLs:')
      console.log('  Prisma memory:', prismaMemoryUrl)
      console.log('  Prisma file:', prismaFileUrl)
      console.log('  Drizzle memory:', drizzleMemoryUrl)
      console.log('  Drizzle file:', drizzleFileUrl)
    })
  })
})
