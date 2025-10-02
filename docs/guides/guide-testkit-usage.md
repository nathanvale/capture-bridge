---
title: TestKit 2.0 Usage Guide
status: approved
owner: Nathan
version: 2.0.0
date: 2025-10-01
doc_type: guide
---

# TestKit 2.0 Usage Guide

## Purpose

This guide provides comprehensive documentation for using TestKit 2.0 to implement test-driven development (TDD) workflows in the ADHD Brain project. It serves as a practical reference for both human developers and AI agents, focusing on current usage patterns and best practices.

**Target Audience:** Developers and AI agents writing tests in the monorepo.

**Key Goal:** Enable rapid, reliable TDD workflows with minimal setup overhead and maximum type safety.

## When to Use This Guide

Use this guide when:

- Writing new tests for any package
- Setting up test infrastructure for a new feature
- Implementing TDD workflows with TestKit utilities
- Understanding which TestKit module to use for specific testing needs
- Debugging test failures or performance issues
- Ensuring consistent test patterns across the codebase

## Prerequisites

**Required Installation:**

```bash
# Core testkit (required)
pnpm add -D @orchestr8/testkit vitest

# Optional dependencies (install as needed)
pnpm add -D better-sqlite3       # For SQLite testing
pnpm add -D msw                  # For HTTP mocking
pnpm add -D testcontainers       # For container testing
pnpm add -D convex-test          # For Convex testing
```

**Required Knowledge:**

- Basic Vitest test structure
- TypeScript fundamentals
- Understanding of test doubles (mocks, stubs, fakes)

**Related Documentation:**

- [TDD Applicability Guide](./guide-tdd-applicability.md) - When to use TDD
- [TestKit Standardization Guide](./guide-testkit-standardization.md) - Mandatory patterns
- [Test Strategy Guide](./guide-test-strategy.md) - Overall testing approach

## Quick Reference

### Module Import Matrix

```typescript
// Core utilities (always available)
import { delay, retry, withTimeout, createMockFn } from '@orchestr8/testkit'

// Environment control
import { getTestEnvironment, setupTestEnv, useFakeTime } from '@orchestr8/testkit/env'

// File system utilities
import { createTempDirectory, ensureDirectoryExists } from '@orchestr8/testkit/fs'

// SQLite testing (requires better-sqlite3)
import { createMemoryUrl, createSQLitePool, withSQLiteTransaction } from '@orchestr8/testkit/sqlite'

// HTTP mocking (requires msw)
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

// CLI process mocking
import { spawnUtils, createProcessMock } from '@orchestr8/testkit/cli'

// Container testing (requires testcontainers)
import { createPostgreSQLContext, createMySQLContext } from '@orchestr8/testkit/containers'

// Convex testing (requires convex-test)
import { createConvexTestHarness } from '@orchestr8/testkit/convex'

// Vitest configuration
import { createVitestConfig } from '@orchestr8/testkit/config'
```

### Common TDD Patterns

```typescript
// ✅ Database testing
const db = new Database(createMemoryUrl())
applyRecommendedPragmas(db)

// ✅ File system testing
const tempDir = createTempDirectory({ prefix: 'test-' })

// ✅ HTTP mocking
const server = setupMSW([
  http.get('/api/users', () => HttpResponse.json([]))
])

// ✅ Time control
const timeCtrl = useFakeTime()
timeCtrl.advance(1000)

// ✅ Environment variables
const envRestore = setupTestEnv({ NODE_ENV: 'test' })
```

## Core Utilities

### Async Helpers

**Purpose:** Control timing and retry logic in tests.

```typescript
import { delay, retry, withTimeout } from '@orchestr8/testkit'

// Wait for specific duration
await delay(100) // 100ms pause

// Retry flaky operations
const result = await retry(
  async () => {
    const response = await fetch('/api/data')
    if (!response.ok) throw new Error('Failed')
    return response.json()
  },
  3,      // max attempts
  1000    // base delay ms
)

// Add timeout to prevent hanging
const data = await withTimeout(
  fetchLargeDataset(),
  5000  // 5 second timeout
)
```

**When to use:**
- `delay`: Waiting for async operations to settle
- `retry`: Handling flaky external dependencies
- `withTimeout`: Preventing tests from hanging indefinitely

### Mock Functions

**Purpose:** Framework-agnostic mock function creation.

```typescript
import { createMockFn } from '@orchestr8/testkit'

// Create mock with implementation
const mockFn = createMockFn((x: number) => x * 2)

expect(mockFn(5)).toBe(10)
expect(mockFn.calls).toHaveLength(1)
expect(mockFn.calls[0]).toEqual([5])

// Reset mock state
mockFn.mockClear()
```

**Key features:**
- Vitest-compatible interface
- Call tracking
- Framework-agnostic implementation
- Full TypeScript support

## Environment Control

### Environment Detection

**Purpose:** Adapt test behavior based on runtime environment.

```typescript
import { getTestEnvironment } from '@orchestr8/testkit/env'

const env = getTestEnvironment()

console.log({
  runner: env.runner,     // 'vitest' | 'wallaby' | 'jest' | 'node'
  isCI: env.isCI,         // boolean
  isWallaby: env.isWallaby, // boolean
  nodeVersion: env.nodeVersion // string
})

// Conditional test behavior
if (env.isCI) {
  test.setTimeout(30000) // Longer timeout in CI
}

if (env.isWallaby) {
  test.skip('Skip slow test in Wallaby')
}
```

### Temporary Environment Variables

**Purpose:** Isolate environment variable changes to specific tests.

```typescript
import { setupTestEnv } from '@orchestr8/testkit/env'

test('with custom environment', () => {
  const envRestore = setupTestEnv({
    NODE_ENV: 'production',
    API_URL: 'https://staging.example.com',
    DEBUG: 'true'
  })

  // Test with custom environment
  expect(process.env.NODE_ENV).toBe('production')
  expect(process.env.API_URL).toBe('https://staging.example.com')

  // Restore original environment
  envRestore.restore()
})
```

**Best practices:**
- Always call `restore()` in cleanup
- Use in `beforeEach`/`afterEach` for isolation
- Don't mutate `process.env` directly

### Fake Timers

**Purpose:** Control time for deterministic testing.

```typescript
import { useFakeTime } from '@orchestr8/testkit/env'

test('time-dependent behavior', () => {
  const timeCtrl = useFakeTime(new Date('2023-01-01'))

  expect(Date.now()).toBe(new Date('2023-01-01').getTime())

  // Advance time
  timeCtrl.advance(1000 * 60 * 60) // 1 hour

  expect(Date.now()).toBe(new Date('2023-01-01T01:00:00').getTime())

  // Restore real time
  timeCtrl.restore()
})
```

**Use cases:**
- Testing timeouts
- Retry logic with backoff
- Scheduled operations
- Time-based caching

### Randomness Control

**Purpose:** Deterministic random values for reproducible tests.

```typescript
import { controlRandomness, quickRandom } from '@orchestr8/testkit/env'

// Seeded randomness
const randomCtrl = controlRandomness(12345)
const value1 = Math.random() // Deterministic
randomCtrl.reset() // Reset to same seed
const value2 = Math.random()
expect(value1).toBe(value2) // Same sequence

randomCtrl.restore() // Restore original Math.random

// Quick patterns
const restore = quickRandom.sequence([0.1, 0.5, 0.9])
expect(Math.random()).toBe(0.1)
expect(Math.random()).toBe(0.5)
restore()
```

### Crypto Mocking

**Purpose:** Deterministic crypto operations for testing.

```typescript
import { quickCrypto } from '@orchestr8/testkit/env'

// Mock UUIDs
const restore = quickCrypto.uuid([
  '550e8400-e29b-41d4-a716-446655440000',
  '550e8400-e29b-41d4-a716-446655440001'
])

expect(crypto.randomUUID()).toBe('550e8400-e29b-41d4-a716-446655440000')
expect(crypto.randomUUID()).toBe('550e8400-e29b-41d4-a716-446655440001')

restore()

// Sequential UUIDs
const restore2 = quickCrypto.sequential('test-')
expect(crypto.randomUUID()).toBe('test-0')
expect(crypto.randomUUID()).toBe('test-1')
restore2()
```

## File System Utilities

### Temporary Directories

**Purpose:** Create isolated temporary directories with automatic cleanup.

```typescript
import { createTempDirectory } from '@orchestr8/testkit/fs'
import * as fs from 'fs'
import * as path from 'path'

test('file operations', async () => {
  const tempDir = createTempDirectory({ prefix: 'test-' })

  console.log(tempDir.path) // e.g., '/tmp/test-abc123'

  // Use directory for test
  await fs.promises.writeFile(
    path.join(tempDir.path, 'test.txt'),
    'content'
  )

  // Automatic cleanup when test completes
})
```

**With resource manager:**

```typescript
import { createTempDirectoryWithResourceManager } from '@orchestr8/testkit/fs'

test('with resource tracking', async () => {
  const tempDir = await createTempDirectoryWithResourceManager({
    prefix: 'test-',
    cleanup: true
  })

  // Automatically registered for cleanup
  // Resources tracked and cleaned up in correct order
})
```

### Safe Path Operations

**Purpose:** Prevent path traversal attacks and ensure safe file operations.

```typescript
import { safePathJoin, validatePath } from '@orchestr8/testkit/fs'

// Safe path joining
const safePath = safePathJoin('/tmp', 'test', 'file.txt')
// Returns: '/tmp/test/file.txt'

// Path validation
const validPath = validatePath('/tmp/test', 'subdir/file.txt')
// Returns: '/tmp/test/subdir/file.txt'

// Throws on traversal
validatePath('/tmp/test', '../../../etc/passwd')
// Throws SecurityValidationError
```

### Directory Management

**Purpose:** Ensure directories exist before file operations.

```typescript
import { ensureDirectoryExists } from '@orchestr8/testkit/fs'

// Create directory if it doesn't exist
await ensureDirectoryExists('/tmp/test/subdir')

// Now safe to write files
await fs.promises.writeFile('/tmp/test/subdir/file.txt', 'content')
```

## SQLite Testing

### In-Memory Databases

**Purpose:** Fast, isolated database testing with real SQLite behavior.

```typescript
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import Database from 'better-sqlite3'

describe('Database Operations', () => {
  let db: Database.Database

  beforeEach(() => {
    // Create isolated in-memory database
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db, {
      journalMode: 'WAL',
      foreignKeys: true
    })

    // Apply schema
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  test('inserts user', () => {
    const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)')
    const info = stmt.run('John', 'john@example.com')

    expect(info.changes).toBe(1)
  })
})
```

**Memory URL options:**

```typescript
// Basic raw URL
const url1 = createMemoryUrl('raw')
// 'file::memory:?cache=shared'

// Named database
const url2 = createMemoryUrl('raw', {
  identifier: 'test-db',
  cache: 'shared'
})
// 'file:test-db:?mode=memory&cache=shared'

// Absolute format
const url3 = createMemoryUrl('absolute')
// '/var/folders/.../test-db.sqlite'
```

### Connection Pooling

**Purpose:** Manage multiple SQLite connections efficiently.

```typescript
import { createSQLitePool } from '@orchestr8/testkit/sqlite'

const pool = createSQLitePool({
  databaseUrl: createMemoryUrl('raw'),
  maxConnections: 5,
  idleTimeoutMs: 30000
})

// Execute with connection from pool
await pool.withConnection(async (db) => {
  const result = db.prepare('SELECT 1 as test').get()
  expect(result.test).toBe(1)
})

// Cleanup
await pool.close()
```

### Transaction Management

**Purpose:** Atomic database operations with automatic rollback on error.

```typescript
import { withSQLiteTransaction } from '@orchestr8/testkit/sqlite'

test('atomic operations', async () => {
  await withSQLiteTransaction(db, async (tx) => {
    // All operations in this block are part of transaction
    tx.run('INSERT INTO users (name, email) VALUES (?, ?)', 'Alice', 'alice@example.com')

    const user = tx.get('SELECT * FROM users WHERE name = ?', 'Alice')
    expect(user.name).toBe('Alice')

    // Transaction commits automatically on success
    // Rolls back automatically on error
  })
})
```

### Database Seeding

**Purpose:** Populate test database with initial data.

```typescript
import { seedDatabase, migrateDatabase } from '@orchestr8/testkit/sqlite'

beforeEach(async () => {
  db = new Database(createMemoryUrl('raw'))

  // Apply migrations
  await migrateDatabase(db, './migrations')

  // Seed test data
  await seedDatabase(db, './seeds/test-data.sql')
})
```

## HTTP Mocking (MSW)

### Basic Server Setup

**Purpose:** Mock HTTP requests with automatic lifecycle management.

```typescript
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

const server = setupMSW([
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' }
    ])
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json(
      { id: 3, ...body },
      { status: 201 }
    )
  })
])

// Server automatically managed in test lifecycle
```

**Key features:**
- Automatic start/stop lifecycle
- Request handler reset between tests
- Full MSW v2 API support
- TypeScript type inference

### Response Helpers

**Purpose:** Create standardized HTTP responses.

```typescript
import { createSuccessResponse, createErrorResponse } from '@orchestr8/testkit/msw'

// Success response
http.get('/api/data', () => {
  return createSuccessResponse({ data: 'value' }, { status: 200 })
})

// Error response
http.post('/api/error', () => {
  return createErrorResponse('Invalid data', 422)
})
```

### Authentication Handlers

**Purpose:** Mock common authentication patterns.

```typescript
import { setupMSW, createAuthHandlers } from '@orchestr8/testkit/msw'

const server = setupMSW([
  ...createAuthHandlers(),
  // Provides:
  // - POST /auth/login
  // - POST /auth/logout
  // - GET /auth/user
  // - POST /auth/refresh

  // Add your custom handlers
  http.get('/api/protected', () => {
    return HttpResponse.json({ data: 'protected' })
  })
])
```

### Pagination Handling

**Purpose:** Mock paginated API endpoints.

```typescript
import { createPaginatedHandler } from '@orchestr8/testkit/msw'

const posts = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  title: `Post ${i + 1}`
}))

const handler = createPaginatedHandler('/api/posts', posts, {
  pageSize: 10,
  pageParam: 'page',
  limitParam: 'limit'
})

// GET /api/posts?page=1&limit=10
// Returns first 10 posts with pagination metadata
```

### Test-Scoped Server

**Purpose:** Isolated MSW server for individual tests.

```typescript
import { createTestScopedMSW } from '@orchestr8/testkit/msw'

test('isolated server', () => {
  const server = createTestScopedMSW([
    http.get('/api/test', () => HttpResponse.json({ test: true }))
  ])

  // Server automatically cleaned up after this test
  // Won't affect other tests
})
```

## CLI Process Mocking

### Quick Command Mocking

**Purpose:** Mock command-line process execution.

```typescript
import { spawnUtils } from '@orchestr8/testkit/cli'
import { execSync } from 'child_process'

beforeEach(() => {
  // Mock successful command
  spawnUtils.mockCommandSuccess('git status', 'nothing to commit, working tree clean')

  // Mock failed command
  spawnUtils.mockCommandFailure('git push', 'Permission denied', 1)

  // Mock long-running command
  spawnUtils.mockLongRunningCommand('npm install', 500, 'packages installed', 0)
})

afterEach(() => {
  spawnUtils.restore()
})

test('executes git commands', () => {
  const result = execSync('git status').toString()
  expect(result).toContain('nothing to commit')
})
```

### Fluent Process Mocking

**Purpose:** Build complex process mocks with fluent API.

```typescript
import { createProcessMock } from '@orchestr8/testkit/cli'

const mock = createProcessMock('deploy')
  .withStdout('Deploying...\nDone!')
  .withStderr('Warning: deprecated flag')
  .withExitCode(0)
  .withDelay(500)
  .register()

// Execute mocked command
const result = execSync('deploy').toString()
expect(result).toContain('Deploying')
```

### Process Tracking

**Purpose:** Verify process calls and arguments.

```typescript
import { mockProcess } from '@orchestr8/testkit/cli'

const tracker = mockProcess()

execSync('git add .')
execSync('git commit -m "message"')

const calls = tracker.getCalls()
expect(calls).toHaveLength(2)
expect(calls[0].command).toBe('git add .')
expect(calls[1].command).toBe('git commit -m "message"')

tracker.clear()
```

## Security Validation

### Command Validation

**Purpose:** Prevent command injection vulnerabilities.

```typescript
import { validateCommand, sanitizeCommand } from '@orchestr8/testkit'

// Validate command is safe
validateCommand('echo hello')  // ✅ OK
validateCommand('rm -rf /')    // ❌ Throws SecurityValidationError

// Sanitize command
const safe = sanitizeCommand('echo "hello; rm -rf /"')
// Returns: 'echo "hello\\; rm -rf /"'
```

### Path Validation

**Purpose:** Prevent directory traversal attacks.

```typescript
import { validatePath } from '@orchestr8/testkit'

// Safe path
const safePath = validatePath('/tmp/test', 'file.txt')
// Returns: '/tmp/test/file.txt'

// Unsafe path
validatePath('/tmp/test', '../../../etc/passwd')
// Throws SecurityValidationError
```

### SQL Identifier Sanitization

**Purpose:** Prevent SQL injection in dynamic queries.

```typescript
import { sanitizeSqlIdentifier } from '@orchestr8/testkit'

const tableName = sanitizeSqlIdentifier('user_table')  // ✅ OK
sanitizeSqlIdentifier('table; DROP TABLE users;')      // ❌ Throws

// Safe dynamic query
const table = sanitizeSqlIdentifier(userInput)
const query = `SELECT * FROM ${table}`
```

### Shell Argument Escaping

**Purpose:** Safely pass arguments to shell commands.

```typescript
import { escapeShellArg, validateShellExecution } from '@orchestr8/testkit'

// Escape single argument
const escaped = escapeShellArg('hello world; rm -rf /')
// Returns: "'hello world; rm -rf /'"

// Validate full command
const result = validateShellExecution('echo', ['hello', 'world; rm -rf /'])
// Returns: { command: 'echo', args: ['hello', "'world; rm -rf /'"] }
```

## Resource Management

### Resource Registration

**Purpose:** Track resources for automatic cleanup.

```typescript
import { registerResource, cleanupAllResources, ResourceCategory, ResourcePriority } from '@orchestr8/testkit'

// Register resource
registerResource('db-connection', () => db.close(), {
  category: ResourceCategory.DATABASE,
  priority: ResourcePriority.CRITICAL,
  description: 'Main database connection'
})

// Cleanup all resources
afterAll(async () => {
  const result = await cleanupAllResources({
    timeout: 10000,
    stopOnFirstError: false
  })

  console.log(`Cleaned ${result.successful} resources`)
})
```

### Resource Statistics

**Purpose:** Monitor resource usage and detect leaks.

```typescript
import { getResourceStats, detectResourceLeaks } from '@orchestr8/testkit'

// Get statistics
const stats = getResourceStats()
console.log({
  active: stats.active,
  total: stats.total,
  byCategory: stats.byCategory
})

// Detect leaks
const leaks = detectResourceLeaks()
if (leaks.length > 0) {
  console.warn('Potential leaks:', leaks)
}
```

### Resource Manager

**Purpose:** Advanced resource lifecycle management.

```typescript
import { ResourceManager, ResourceCategory } from '@orchestr8/testkit'

const manager = new ResourceManager({
  defaultTimeout: 5000,
  enableLogging: true
})

// Register resources
manager.register('connection', () => connection.close(), {
  category: ResourceCategory.DATABASE
})

// Listen to events
manager.on('cleanup:start', (resources) => {
  console.log(`Cleaning up ${resources.length} resources`)
})

// Cleanup by category
await manager.cleanupByCategory(ResourceCategory.DATABASE)
```

## Concurrency Control

### Limit Concurrent Operations

**Purpose:** Prevent resource exhaustion from parallel operations.

```typescript
import { limitConcurrency } from '@orchestr8/testkit'

const tasks = Array.from({ length: 10 }, (_, i) =>
  limitConcurrency(
    () => processItem(i),
    3  // Max 3 concurrent
  )
)

await Promise.all(tasks) // Only 3 running at once
```

### Batch Processing

**Purpose:** Process arrays with concurrency limits.

```typescript
import { limitedPromiseAll } from '@orchestr8/testkit'

const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const promises = items.map(item => processItem(item))

const results = await limitedPromiseAll(promises, {
  maxConcurrent: 3,
  timeout: 5000,
  stopOnFirstError: false
})
```

### Concurrency Managers

**Purpose:** Manage concurrency for specific operation types.

```typescript
import { databaseOperationsManager, fileOperationsManager } from '@orchestr8/testkit'

// Database operations (limit: 3)
await databaseOperationsManager.execute(() =>
  db.query('SELECT * FROM users')
)

// File operations (limit: 10)
await fileOperationsManager.execute(() =>
  fs.promises.writeFile('file.txt', 'content')
)
```

**Custom manager:**

```typescript
import { ConcurrencyManager } from '@orchestr8/testkit'

const apiManager = new ConcurrencyManager({
  maxConcurrent: 5,
  timeout: 10000
})

const result = await apiManager.execute(async () => {
  return await fetch('/api/data')
})

// Get statistics
const stats = apiManager.getStats()
console.log({
  active: stats.active,
  queued: stats.queued,
  total: stats.total
})
```

## Container Testing

### PostgreSQL Containers

**Purpose:** Integration testing with real PostgreSQL database.

```typescript
import { createPostgreSQLContext, PostgreSQLPresets } from '@orchestr8/testkit/containers'

test('postgres integration', async () => {
  const context = await createPostgreSQLContext({
    preset: PostgreSQLPresets.postgres15(),
    database: 'test_db'
  })

  const client = context.getClient()
  await client.query('CREATE TABLE users (id serial PRIMARY KEY, name text)')

  const result = await client.query('SELECT * FROM users')
  expect(result.rows).toEqual([])

  await context.cleanup()
}, 60000) // Containers need longer timeout
```

### MySQL Containers

**Purpose:** Integration testing with real MySQL database.

```typescript
import { createMySQLContext, MySQLPresets } from '@orchestr8/testkit/containers'

test('mysql integration', async () => {
  const context = await createMySQLContext({
    preset: MySQLPresets.mysql8(),
    database: 'test_db'
  })

  const connection = await context.getConnection()
  await connection.execute('CREATE TABLE users (id int PRIMARY KEY, name varchar(255))')

  const [rows] = await connection.execute('SELECT * FROM users')
  expect(rows).toEqual([])

  await context.cleanup()
}, 60000)
```

## Convex Testing

### Test Harness

**Purpose:** Test Convex functions in isolation.

```typescript
import { createConvexTestHarness } from '@orchestr8/testkit/convex'
import schema from './schema'
import { api } from './_generated/api'

describe('Convex Functions', () => {
  let harness: ConvexTestHarness

  beforeEach(() => {
    harness = createConvexTestHarness(schema)
  })

  test('queries users', async () => {
    // Insert test data
    await harness.run(async (ctx) => {
      await ctx.db.insert('users', { name: 'Alice' })
      await ctx.db.insert('users', { name: 'Bob' })
    })

    // Test query
    const users = await harness.query(api.users.list)
    expect(users).toHaveLength(2)
  })

  test('with authentication', async () => {
    const asUser = harness.auth.withUser({ subject: 'user123' })
    const result = await asUser.query(api.users.me)
    expect(result.id).toBe('user123')
  })
})
```

### Scoped Execution

**Purpose:** Execute functions with Convex test context.

```typescript
import { withConvexTest } from '@orchestr8/testkit/convex'

const result = await withConvexTest(schema, async (harness) => {
  await harness.run(async (ctx) => {
    await ctx.db.insert('users', { name: 'Charlie' })
  })

  return await harness.query(api.users.count)
})

expect(result).toBe(1)
```

## Vitest Configuration

### Standard Configuration

**Purpose:** Consistent Vitest setup with testkit optimizations.

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { createVitestConfig } from '@orchestr8/testkit/config'

export default defineConfig(
  createVitestConfig({
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['@orchestr8/testkit/register'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/**',
          'dist/**',
          '**/*.test.ts',
          '**/*.spec.ts'
        ]
      }
    }
  })
)
```

## Common TDD Workflows

### Database-Backed Feature

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import Database from 'better-sqlite3'

describe('UserRepository', () => {
  let db: Database.Database

  beforeEach(() => {
    // RED: Create isolated database
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db)

    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('creates user with unique email', () => {
    // RED: Write failing test
    const repo = new UserRepository(db)

    // GREEN: Implement minimal code
    const user = repo.create({
      email: 'alice@example.com',
      name: 'Alice'
    })

    expect(user.id).toBeDefined()
    expect(user.email).toBe('alice@example.com')

    // REFACTOR: Verify constraints
    expect(() => {
      repo.create({
        email: 'alice@example.com',
        name: 'Alice Again'
      })
    }).toThrow('UNIQUE constraint failed')
  })
})
```

### HTTP Integration

```typescript
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

const server = setupMSW([
  http.get('https://api.example.com/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' }
    ])
  })
])

describe('UserService', () => {
  it('fetches users from API', async () => {
    const service = new UserService('https://api.example.com')

    const users = await service.getUsers()

    expect(users).toHaveLength(1)
    expect(users[0].name).toBe('Alice')
  })
})
```

### File System Operations

```typescript
import { createTempDirectory } from '@orchestr8/testkit/fs'
import * as fs from 'fs/promises'
import * as path from 'path'

describe('ConfigManager', () => {
  let tempDir: ReturnType<typeof createTempDirectory>

  beforeEach(() => {
    tempDir = createTempDirectory({ prefix: 'config-test-' })
  })

  it('saves configuration to file', async () => {
    const manager = new ConfigManager(tempDir.path)

    await manager.save({ theme: 'dark' })

    const configPath = path.join(tempDir.path, 'config.json')
    const content = await fs.readFile(configPath, 'utf-8')
    const config = JSON.parse(content)

    expect(config.theme).toBe('dark')
  })
})
```

### Time-Dependent Logic

```typescript
import { useFakeTime } from '@orchestr8/testkit/env'

describe('CacheService', () => {
  it('expires cached values after TTL', () => {
    const timeCtrl = useFakeTime()
    const cache = new CacheService({ ttl: 5000 })

    // Cache value
    cache.set('key', 'value')
    expect(cache.get('key')).toBe('value')

    // Advance past TTL
    timeCtrl.advance(6000)

    // Value should be expired
    expect(cache.get('key')).toBeUndefined()

    timeCtrl.restore()
  })
})
```

## Troubleshooting

### "Module not found" errors

**Problem:** Import fails for TestKit sub-exports

**Solution:** Install optional dependencies

```bash
# For SQLite
pnpm add -D better-sqlite3

# For MSW
pnpm add -D msw

# For containers
pnpm add -D testcontainers
```

### Tests hang indefinitely

**Problem:** Async operations never complete

**Solution:** Use `withTimeout` wrapper

```typescript
const result = await withTimeout(
  longRunningOperation(),
  5000  // 5 second timeout
)
```

### Database locked errors

**Problem:** SQLite `SQLITE_BUSY` errors

**Solution:** Use memory URLs and ensure cleanup

```typescript
beforeEach(() => {
  db = new Database(createMemoryUrl('raw'))  // Isolated
})

afterEach(() => {
  db.close()  // Always cleanup
})
```

### MSW handlers not working

**Problem:** HTTP requests not intercepted

**Solution:** Ensure server lifecycle is correct

```typescript
const server = setupMSW([...handlers])

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### Resource leaks detected

**Problem:** Resources not cleaned up properly

**Solution:** Use resource manager

```typescript
import { cleanupAllResources } from '@orchestr8/testkit'

afterAll(async () => {
  await cleanupAllResources()
})
```

## Best Practices

### DO:

✅ Use in-memory databases for unit tests
✅ Isolate tests with `beforeEach`/`afterEach`
✅ Clean up resources in `afterEach`/`afterAll`
✅ Use fake timers for time-dependent code
✅ Mock external HTTP calls with MSW
✅ Validate inputs with security utilities
✅ Use TypeScript for better type safety

### DON'T:

❌ Share database instances between tests
❌ Use real time in tests (use fake timers)
❌ Skip cleanup (causes leaks)
❌ Mock low-level APIs when higher-level alternatives exist
❌ Mutate global state without restore
❌ Use `setTimeout` in tests (use fake timers)
❌ Ignore security validation warnings

## Performance Tips

1. **Use memory databases:** 100x faster than file-based SQLite
2. **Limit concurrency:** Prevent resource exhaustion with managers
3. **Batch operations:** Use `limitedPromiseAll` for parallel processing
4. **Fake timers:** Eliminate real delays in tests
5. **Test-scoped servers:** Isolate MSW handlers to specific tests
6. **Resource cleanup:** Always clean up in `afterEach`/`afterAll`

## Related Documentation

### TestKit Documentation

- [TestKit API Reference](/Users/nathanvale/code/@orchestr8/packages/testkit/API.md)
- [TestKit README](/Users/nathanvale/code/@orchestr8/packages/testkit/README.md)
- [TestKit Standardization Guide](./guide-testkit-standardization.md)

### Testing Strategy

- [TDD Applicability Guide](./guide-tdd-applicability.md)
- [Test Strategy Guide](./guide-test-strategy.md)
- [Wallaby TDD Integration Guide](./guide-wallaby-tdd-integration.md)

### Project Documentation

- [Master PRD](../master/prd-master.md)
- [Agent Workflow Guide](./guide-agent-workflow.md)

## Maintenance Notes

### When to Update This Guide

Update this guide when:

- New TestKit utilities are added
- API changes occur in TestKit
- New usage patterns are discovered
- Common pitfalls are identified
- Integration patterns evolve

### Version Compatibility

- TestKit 2.0.0+
- Vitest 3.2.0+
- MSW 2.0.0+ (breaking changes from v1)
- Better-sqlite3 12.0.0+

---

**Summary: TestKit 2.0 provides comprehensive testing utilities for TDD workflows**

1. **Core utilities** for timing, retries, and mocking
2. **Environment control** for deterministic tests
3. **Database testing** with real SQLite behavior
4. **HTTP mocking** with MSW v2
5. **Security validation** to prevent vulnerabilities
6. **Resource management** for leak prevention
7. **Container testing** for integration tests

TestKit enables fast, reliable TDD cycles with minimal setup overhead and maximum type safety. Use this guide as your reference for implementing tests that are both comprehensive and maintainable.

_Testing should feel like having a conversation with your code—you ask a question (write a test), the code responds (passes or fails), and you learn something new with each exchange._
