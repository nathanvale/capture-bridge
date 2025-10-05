# TestKit TDD Guide for AI Agents

**Purpose**: Production-accurate TDD guide based on 319 passing tests in foundation package
**TestKit Version**: @orchestr8/testkit v2.0.0
**Source**: `/packages/foundation/src/__tests__/` (verified against implementation)
**Last Updated**: 2025-10-04

---

## 🚨 CRITICAL: Wallaby TDD Agent Requirements

**MANDATORY**: When implementing ANY test-driven development task, the Wallaby TDD agent (`wallaby-tdd-agent`) **MUST** be used.

### Why Wallaby TDD Agent is Required

1. **Real-time Test Feedback**: Wallaby provides instant test results as you write code
2. **TDD Discipline Enforcement**: Ensures Red-Green-Refactor cycle is followed
3. **Runtime Insights**: Shows code coverage and execution flow in real-time
4. **Failure Prevention**: Catches errors immediately before they compound

### When to Use Wallaby TDD Agent

✅ **ALWAYS use for:**
- Writing new tests (Red phase)
- Implementing code to pass tests (Green phase)
- Refactoring with test safety net (Refactor phase)
- Debugging failing tests
- Test coverage validation

❌ **DO NOT bypass Wallaby for:**
- "Quick fixes" (they often break things)
- "Simple tests" (simple tests still need TDD)
- Time pressure (TDD saves time in the long run)
- Existing test changes (verify with Wallaby first)

### Agent Invocation

```markdown
When implementing TDD task:
1. Invoke wallaby-tdd-agent FIRST
2. Follow Red-Green-Refactor cycle
3. Verify all tests pass with Wallaby
4. Only then commit changes
```

**Location**: `.claude/agents/wallaby-tdd-agent.md`

---

## 🚀 Quick Pattern Index

**Jump to pattern:**
- [Import Patterns](#import-patterns) - Dynamic imports, type imports
- [Cleanup Sequence](#cleanup-sequence-critical) - 4-step cleanup with settling
- [SQLite Testing](#sqlite-testing-patterns) - Pools, migrations, transactions
- [MSW HTTP Mocking](#msw-http-mocking-patterns) - Module-level setup
- [CLI Process Mocking](#cli-process-mocking-patterns) - Dynamic registration
- [Security Testing](#security-testing-patterns) - Attack vectors
- [Memory Leak Detection](#memory-leak-detection-patterns) - GC patterns
- [Global Setup](#global-test-setup) - test-setup.ts configuration

---

## Import Patterns

### ✅ PRODUCTION PATTERN: Dynamic Imports

```typescript
// ✅ CORRECT: Use dynamic imports inside tests
describe('My Tests', () => {
  it('should work', async () => {
    const { delay } = await import('@orchestr8/testkit')
    const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
    const { setupMSW } = await import('@orchestr8/testkit/msw')
    const { createProcessMocker } = await import('@orchestr8/testkit/cli')
  })
})

// ❌ WRONG: Static imports at module level (unless for types)
import { delay } from '@orchestr8/testkit' // Don't do this
```

### Type Imports (Static)

```typescript
// ✅ CORRECT: Type imports at module level
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { SetupServer } from 'msw/node'
```

### Available Sub-Exports

```typescript
'@orchestr8/testkit'         // Core: delay, retry, withTimeout
'@orchestr8/testkit/sqlite'  // Database: pools, migrations, seeding
'@orchestr8/testkit/msw'     // HTTP mocking: MSW integration
'@orchestr8/testkit/cli'     // CLI: process mocking
'@orchestr8/testkit/config'  // Config: setupResourceCleanup
'@orchestr8/testkit/utils'   // Utils: cleanupAllResources
```

**Source**: All test files use dynamic imports - see `testkit-core-utilities.test.ts:22`

---

## Cleanup Sequence (CRITICAL)

### ✅ PRODUCTION PATTERN: 4-Step Cleanup

**From**: `performance-benchmarks.test.ts:37-89` (exact copy)

```typescript
describe('My Tests', () => {
  let testDir: string
  let pools: any[] = []
  const databases: Database[] = []

  beforeEach(() => {
    // Create temp directory
    testDir = join(tmpdir(), `test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(async () => {
    // CLEANUP SEQUENCE (IMPORTANT: Order matters!)
    //
    // 0. Allow in-flight release operations to settle (prevents race conditions)
    //    - Even after Promise.all resolves, pool internals may still be processing
    //    - 100ms settling period prevents "connection not in use" warnings
    await new Promise(resolve => setTimeout(resolve, 100))

    // 1. Drain connection pools FIRST
    //    - Pool.drain() gracefully closes all pool-managed connections
    //    - This prevents "connection not in use" warnings
    //    - NEVER manually close pool-managed connections
    for (const pool of pools) {
      try {
        await pool.drain()
      } catch (error) {
        // Pool might already be drained or have errors - safe to ignore
        console.warn('Pool drain error (non-critical):', error)
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
      } catch (error) {
        // Connection might already be closed - safe to ignore
        // This prevents cascade failures in cleanup
      }
    }
    databases.length = 0

    // 3. Clean up file system resources THIRD
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch (error) {
      // Directory might not exist or be in use - safe to ignore
    }

    // 4. Force garbage collection LAST (if available)
    //    - Helps with memory leak detection
    //    - Only available when Node.js started with --expose-gc
    if (global.gc) {
      global.gc()
    }
  })
})
```

**Why this order?**
1. Pools hold connections → drain pools before closing DBs
2. DBs hold file handles → close DBs before filesystem cleanup
3. Files prevent deletion → cleanup files after closing DBs
4. GC frees memory → run last to reclaim all resources

**Source**: `performance-benchmarks.test.ts:37-89`

---

## SQLite Testing Patterns

### Pool Creation with Helper

**From**: `testkit-sqlite-pool.test.ts:62-67`

```typescript
describe('SQLite Pool Tests', () => {
  let testDir: string
  let dbPath: string
  let pools: any[] = []

  beforeEach(() => {
    testDir = join(tmpdir(), `testkit-pool-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    dbPath = join(testDir, 'test.db')
  })

  afterEach(async () => {
    // Drain all pools
    for (const pool of pools) {
      try {
        await pool.drain()
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    pools = []

    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  const createPool = async (options = {}) => {
    const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')
    const pool = new SQLiteConnectionPool(dbPath, options)
    pools.push(pool) // Track for cleanup
    return pool
  }

  it('should create pool with default options', async () => {
    const pool = await createPool()
    const stats = pool.getStats()
    expect(stats.totalConnections).toBe(0)
  })
})
```

**Source**: `testkit-sqlite-pool.test.ts:31-77`

### In-Memory Database

**From**: `testkit-sqlite-features.test.ts`

```typescript
it('should create in-memory database', async () => {
  const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
  const Database = (await import('better-sqlite3')).default

  const url = createMemoryUrl()
  const db = new Database(url)
  databases.push(db) // Track for cleanup

  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')

  const user = db.prepare('SELECT * FROM users WHERE name = ?').get('Alice')
  expect(user).toEqual({ id: 1, name: 'Alice' })
})
```

**Key Points**:
- Track databases in array: `databases.push(db)`
- Use parameterized queries: `prepare().get(?)`
- Import dynamically: `await import()`

### Migrations & Seeding

**From**: `testkit-sqlite-features.test.ts`

```typescript
it('should apply migrations', async () => {
  const { applyMigrations } = await import('@orchestr8/testkit/sqlite')
  const Database = (await import('better-sqlite3')).default

  const db = new Database(':memory:')
  databases.push(db)

  await applyMigrations(db, [
    { id: 1, sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)' },
    { id: 2, sql: 'ALTER TABLE users ADD COLUMN email TEXT' }
  ])

  // Verify migrations applied
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
  expect(tables).toContainEqual({ name: 'users' })
})
```

---

## MSW HTTP Mocking Patterns

### Module-Level Setup

**From**: `testkit-msw-features.test.ts:50-100`

```typescript
import { setupMSW, createAuthHandlers, createCRUDHandlers } from '@orchestr8/testkit/msw'
import { http, HttpResponse } from 'msw'
import { describe, it, expect } from 'vitest'

// ✅ CRITICAL: MSW setup at MODULE level (before any tests)
// This is required because MSW must initialize interceptors at module evaluation time
setupMSW([
  // Basic handlers
  http.get('*/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ])
  }),

  http.post('*/api/users', async ({ request }) => {
    const body = await request.json() as { name: string }
    return HttpResponse.json({ id: 3, name: body.name }, { status: 201 })
  }),

  // Auth handlers (use full URL for proper path matching)
  ...createAuthHandlers('http://localhost/api'),

  // CRUD handlers (use full URL for proper path matching)
  ...createCRUDHandlers(
    'posts',
    [
      { id: '1', title: 'First Post', content: 'Content 1' },
      { id: '2', title: 'Second Post', content: 'Content 2' }
    ],
    'http://localhost/api'
  ),
])

describe('API Tests', () => {
  it('should fetch users', async () => {
    const response = await fetch('http://localhost/api/users')
    const users = await response.json()
    expect(users).toHaveLength(2)
  })
})
```

**Key Points**:
- Setup BEFORE describe blocks
- Use full URLs for auth/CRUD handlers
- No beforeEach/afterEach needed
- Handlers persist across tests

**Source**: `testkit-msw-features.test.ts:50-100`

---

## CLI Process Mocking Patterns

### Dynamic Registration

**From**: `testkit-cli-utilities-behavioral.test.ts:29-87`

```typescript
describe('CLI Mocking', () => {
  it('should register and retrieve mocked process', async () => {
    const { createProcessMocker } = await import('@orchestr8/testkit/cli')
    const mocker = createProcessMocker()

    // Register a process mock
    mocker.register('npm install', {
      stdout: 'added 50 packages',
      exitCode: 0,
    })

    const processes = mocker.getSpawnedProcesses()
    expect(processes).toBeDefined()
    expect(Array.isArray(processes)).toBe(true)

    console.log('✅ Process registered and retrieved successfully')
  })

  it('should mock process failures', async () => {
    const { mockSpawn } = await import('@orchestr8/testkit/cli')

    // Create failure mock
    mockSpawn('npm install --invalid-flag')
      .stderr('Unknown argument: --invalid-flag')
      .exitCode(1)
      .mock()

    console.log('✅ Process failure scenario mocked successfully')
  })
})
```

**Key Points**:
- No beforeEach/afterEach needed
- Use dynamic imports
- Builder pattern: `.stderr().exitCode().mock()`

**Source**: `testkit-cli-utilities-behavioral.test.ts:29-120`

---

## Security Testing Patterns

### SQL Injection Prevention

**From**: `security-validation.test.ts:58-92`

```typescript
describe('SQL Injection Prevention', () => {
  let db: Database | null = null
  const databases: Database[] = []

  afterEach(async () => {
    // Cleanup databases
    for (const database of databases) {
      try {
        if (!database.readonly && database.open) {
          database.close()
        }
      } catch (error) {
        // Ignore close errors
      }
    }
    databases.length = 0
    db = null
  })

  it('should reject unsafe SQL in database paths', async () => {
    const { createFileDatabase } = await import('@orchestr8/testkit/sqlite')
    const Database = (await import('better-sqlite3')).default

    // Test malicious path with SQL injection attempt
    const maliciousPath = "test.db'; DROP TABLE users; --"

    try {
      const fileDb = await createFileDatabase(maliciousPath)
      db = new Database(fileDb.path)
      databases.push(db)

      // Create table with PARAMETERIZED query
      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
      db.prepare('INSERT INTO users (name) VALUES (?)').run('Test User')

      // Verify table exists and data is intact
      const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
      expect(result.count).toBe(1)

      console.log('✅ SQL injection in database path prevented')

      await fileDb.cleanup()
    } catch (error) {
      // If path is rejected entirely, that's also acceptable
      console.log('✅ Malicious database path rejected:', error)
    }
  })

  it('should use parameterized queries', async () => {
    const Database = (await import('better-sqlite3')).default
    db = new Database(':memory:')
    databases.push(db)

    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')

    const maliciousInput = "'; DROP TABLE users; --"

    // ✅ CORRECT: Parameterized query
    const stmt = db.prepare('SELECT * FROM users WHERE name = ?')
    const result = stmt.get(maliciousInput)

    expect(result).toBeUndefined() // Not found, not executed

    // Verify table still exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    expect(tables).toContainEqual({ name: 'users' })
  })
})
```

**Source**: `security-validation.test.ts:57-150`

### Path Traversal Prevention

```typescript
it('should reject path traversal attempts', async () => {
  const maliciousPath = '../../../etc/passwd'

  expect(() => {
    // Your validation logic
    validatePath(maliciousPath)
  }).toThrow('Path traversal detected')
})
```

### Command Injection Prevention

```typescript
it('should sanitize shell arguments', async () => {
  const maliciousArg = '; rm -rf /'

  const sanitized = sanitizeShellArg(maliciousArg)
  expect(sanitized).not.toContain(';')
  expect(sanitized).not.toContain('rm')
})
```

---

## Memory Leak Detection Patterns

### Full Memory Leak Test

**From**: `performance-benchmarks.test.ts:92-117`

```typescript
describe('Memory Leak Detection', () => {
  it('should not leak memory with repeated delay calls', async () => {
    const { delay } = await import('@orchestr8/testkit')

    // Force GC before measurement
    if (global.gc) global.gc()
    await delay(100) // Warm up

    const initialMemory = process.memoryUsage().heapUsed

    // Execute 100 delay operations
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

    console.log(`✅ Memory growth from 100 delay calls: ${(growth / 1024).toFixed(2)} KB`)
  }, 30000) // Increase timeout for this test
})
```

**Key Points**:
- GC before: `if (global.gc) global.gc()`
- Warm up: `await delay(100)`
- 100 iterations sufficient for leak detection
- GC after + delay: allow GC to complete
- Threshold: < 5MB (V8 GC not deterministic)
- Extended timeout: `30000ms`

**Source**: `performance-benchmarks.test.ts:92-117`

---

## Global Test Setup

### test-setup.ts Pattern

**From**: `test-setup.ts:1-33`

```typescript
/**
 * Global test setup for foundation package
 */

import { afterAll } from 'vitest'
import { setupResourceCleanup } from '@orchestr8/testkit/config'
import { cleanupAllResources } from '@orchestr8/testkit/utils'

// Configure automatic resource cleanup
await setupResourceCleanup({
  cleanupAfterEach: true,   // Clean up after each individual test
  cleanupAfterAll: true,    // Clean up after all tests in a file
  enableLeakDetection: true, // Detect and warn about resource leaks
  logStats: process.env.LOG_CLEANUP_STATS === '1', // Log cleanup statistics
})

// Add global afterAll hook for comprehensive cleanup
afterAll(async () => {
  await cleanupAllResources()
})

console.log('✅ TestKit resource cleanup configured (foundation package)')
```

**Configure in vitest.config.ts**:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test-setup.ts'], // ← Add this
    testTimeout: 10000,
    hookTimeout: 30000,
    teardownTimeout: 60000,
  },
})
```

**Source**: `test-setup.ts:1-33`

---

## Complete Test File Templates

### SQLite Test Template

```typescript
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'

describe('My SQLite Feature', () => {
  let testDir: string
  let dbPath: string
  let pools: any[] = []
  const databases: Database[] = []

  beforeEach(() => {
    testDir = join(tmpdir(), `test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    dbPath = join(testDir, 'test.db')
  })

  afterEach(async () => {
    // 4-step cleanup (see Cleanup Sequence section)
    await new Promise(resolve => setTimeout(resolve, 100))

    for (const pool of pools) {
      try {
        await pool.drain()
      } catch (error) {
        console.warn('Pool drain error (non-critical):', error)
      }
    }
    pools = []

    for (const database of databases) {
      try {
        if (database.open && !database.readonly) {
          database.close()
        }
      } catch (error) {
        // Ignore
      }
    }
    databases.length = 0

    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore
    }

    if (global.gc) global.gc()
  })

  it('should work', async () => {
    const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
    const Database = (await import('better-sqlite3')).default

    const db = new Database(createMemoryUrl())
    databases.push(db)

    // Your test code here
  })
})
```

### MSW Test Template

```typescript
import { setupMSW } from '@orchestr8/testkit/msw'
import { http, HttpResponse } from 'msw'
import { describe, it, expect } from 'vitest'

// Module-level setup
setupMSW([
  http.get('*/api/resource', () => {
    return HttpResponse.json({ data: 'value' })
  }),
])

describe('My API Tests', () => {
  it('should fetch resource', async () => {
    const response = await fetch('http://localhost/api/resource')
    const data = await response.json()
    expect(data).toEqual({ data: 'value' })
  })
})
```

---

## Production Best Practices

### ✅ DO

1. **Use dynamic imports**: `await import('@orchestr8/testkit/sqlite')`
2. **Track resources in arrays**: `pools: any[] = []`, `databases: Database[] = []`
3. **Follow 4-step cleanup**: settling → pools → databases → filesystem → GC
4. **Use parameterized queries**: `prepare('SELECT * FROM users WHERE name = ?').get(name)`
5. **Test security**: SQL injection, path traversal, command injection
6. **Check memory leaks**: GC before/after, 100 iterations, < 5MB growth
7. **Add console logs**: `console.log('✅ Test passed')`
8. **Use try-catch in cleanup**: Ignore errors to prevent cascade failures
9. **Set extended timeouts**: `30000ms` for memory leak tests
10. **Configure test-setup.ts**: Global resource cleanup

### ❌ DON'T

1. **Don't use static imports** (except for types and vitest)
2. **Don't skip cleanup steps** (causes resource leaks)
3. **Don't use string concatenation in SQL** (SQL injection risk)
4. **Don't manually close pool-managed connections** (use `pool.drain()`)
5. **Don't forget settling delay** (100ms before pool.drain())
6. **Don't set GC first** (must be last in cleanup)
7. **Don't use fixed delays** (use explicit waits like `pool.warmUp()`)
8. **Don't parallelize cleanup** (use sequential for loops)
9. **Don't throw in cleanup** (use try-catch and ignore errors)
10. **Don't test implementation details** (test behavior)

---

## Common Patterns Quick Reference

### Create Pool

```typescript
const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')
const pool = new SQLiteConnectionPool(dbPath, { maxConnections: 5 })
pools.push(pool)
```

### Create Database

```typescript
const Database = (await import('better-sqlite3')).default
const db = new Database(':memory:')
databases.push(db)
```

### Parameterized Query

```typescript
const stmt = db.prepare('SELECT * FROM users WHERE name = ?')
const user = stmt.get('Alice')
```

### Migration

```typescript
const { applyMigrations } = await import('@orchestr8/testkit/sqlite')
await applyMigrations(db, [
  { id: 1, sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY)' }
])
```

### MSW Handler

```typescript
http.get('*/api/users', () => HttpResponse.json([...]))
```

### CLI Mock

```typescript
const { mockSpawn } = await import('@orchestr8/testkit/cli')
mockSpawn('git status').stdout('On branch main').exitCode(0).mock()
```

### Memory Test

```typescript
if (global.gc) global.gc()
const before = process.memoryUsage().heapUsed
// ... operations ...
if (global.gc) global.gc()
await delay(100)
const after = process.memoryUsage().heapUsed
expect(after - before).toBeLessThan(5 * 1024 * 1024)
```

---

## Vitest Configuration

**From**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/test-setup.ts',
      ],
      include: ['src/**/*.ts'],
      all: true,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 10000,
    hookTimeout: 30000,
    teardownTimeout: 60000,
  },
})
```

---

## Reference Links

- **Test Files**: `/packages/foundation/src/__tests__/`
- **Test Setup**: `/packages/foundation/test-setup.ts`
- **Vitest Config**: `/packages/foundation/vitest.config.ts`
- **Production Report**: `/packages/foundation/docs/PRODUCTION-READY-FINAL-REPORT.md`

---

**All patterns verified against production code with 319 passing tests** ✅
