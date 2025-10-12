# TestKit TDD Guide for AI Agents

**Purpose**: Production-accurate TDD guide based on 319 passing tests in foundation package
**TestKit Version**: @orchestr8/testkit v2.2.0
**Source**: `/packages/foundation/src/__tests__/` (verified against implementation)
**Last Updated**: 2025-10-12 - Migrated to setup/auto module; removed test-setup.ts references

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
- [TestKit Temp Directory](#testkit-temp-directory-pattern) - createTempDirectory() usage
- [TempDirectory API](#tempdirectory-api) - Helper methods (writeFile, readFile, etc.)
- [Advanced Temp Directory Utilities](#advanced-temp-directory-utilities) - Named, batch, scoped patterns
- [Cleanup Sequence](#cleanup-sequence-critical) - 4-step cleanup with settling
- [Custom Resource Cleanup](#custom-resource-cleanup-patterns-critical) - Event listeners, timers, async shutdown
- [SQLite Testing](#sqlite-testing-patterns) - Pools, migrations, transactions
- [MSW HTTP Mocking](#msw-http-mocking-patterns) - Module-level setup
- [CLI Process Mocking](#cli-process-mocking-patterns) - Dynamic registration
- [Security Testing](#security-testing-patterns) - Attack vectors
- [Memory Leak Detection](#memory-leak-detection-patterns) - GC patterns
- [Global Setup](#global-test-setup) - setup/auto module (zero-config)
- [Legacy Patterns](#⚠️-legacy-patterns) - tmpdir() pattern (still supported)

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
'@orchestr8/testkit'         // Core: delay, retry, withTimeout (re-exports fs utilities)
'@orchestr8/testkit/fs'      // File system: createTempDirectory, temp directory utilities
'@orchestr8/testkit/sqlite'  // Database: pools, migrations, seeding
'@orchestr8/testkit/msw'     // HTTP mocking: MSW integration
'@orchestr8/testkit/cli'     // CLI: process mocking
'@orchestr8/testkit/config'  // Config: setupResourceCleanup
'@orchestr8/testkit/utils'   // Utils: cleanupAllResources
```

**Source**: All test files use dynamic imports - see `testkit-core-utilities.test.ts:22`

---

## TestKit Temp Directory Pattern

### ✅ PRODUCTION PATTERN: TestKit Temp Directories

**Updated**: 2025-10-07 - TestKit 2.0.0 best practice

```typescript
describe('My Tests', () => {
  let tempDir: any  // Full TempDirectory object with helper methods

  beforeEach(async () => {
    // ✅ PREFERRED: Explicit sub-export (more discoverable)
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    tempDir = await createTempDirectory()

    // ✅ ALSO VALID: Main export re-exports filesystem utilities
    // const { createTempDirectory } = await import('@orchestr8/testkit')
  })

  it('should work', async () => {
    // Access the temp directory path
    const testDir = tempDir.path

    // Use helper methods (see TempDirectory API below)
    await tempDir.writeFile('test.txt', 'content')
    const exists = await tempDir.exists('test.txt')
  })

  // No manual cleanup needed - TestKit handles it automatically!
})
```

**Why use createTempDirectory()?**
- ✅ Automatic cleanup via TestKit resource tracking
- ✅ Proper test isolation between runs
- ✅ Cross-platform safety (handles path differences)
- ✅ Integration with TestKit's global cleanup hooks
- ✅ No manual rmSync() needed in afterEach
- ✅ Rich API with file operation helpers

**What TestKit manages for you:**
- Directory creation with unique naming
- Automatic cleanup after each test
- Resource leak detection
- Cross-platform path handling

### TempDirectory API

The object returned by `createTempDirectory()` includes these methods:

```typescript
const tempDir = await createTempDirectory()

// Access path
tempDir.path                               // string: absolute path to temp directory

// File operations (all paths are relative to tempDir.path)
await tempDir.writeFile('test.txt', 'content')     // Write file
await tempDir.readFile('test.txt')                 // Read file (returns string)
await tempDir.exists('test.txt')                   // Check if file/dir exists (returns boolean)
await tempDir.mkdir('subdir')                      // Create subdirectory
await tempDir.readdir()                            // List files (returns string[])
const absPath = tempDir.getPath('file.txt')        // Get absolute path for relative path

// Copy external files in
await tempDir.copyFileIn('/absolute/source.txt', 'dest.txt')

// Create directory structure (nested files/folders)
await tempDir.createStructure({
  'package.json': '{}',
  'src/index.ts': 'export {}'
})

// Manual cleanup (automatic, but can call explicitly if needed)
await tempDir.cleanup()
```

**Source**: TestKit 2.0.0 `/fs` utilities, automatic resource management

### Advanced Temp Directory Utilities

**TestKit provides additional filesystem utilities for advanced use cases:**

```typescript
// Named temp directories (custom prefix)
const { createNamedTempDirectory } = await import('@orchestr8/testkit/fs')
const tempDir = await createNamedTempDirectory('my-test')
// Creates: /tmp/test-my-test-abc123

// Batch creation (multiple temp directories at once)
const { createMultipleTempDirectories } = await import('@orchestr8/testkit/fs')
const tempDirs = await createMultipleTempDirectories(5, { prefix: 'batch-' })
// Returns: Array of 5 TempDirectory objects

// Scoped cleanup (automatic cleanup after scope exits)
const { withTempDirectoryScope } = await import('@orchestr8/testkit/fs')
await withTempDirectoryScope(async (tempDir) => {
  // Use tempDir.path here
  await tempDir.writeFile('test.txt', 'content')
  // Automatic cleanup when scope exits (even on error)
})

// Batch cleanup
const { cleanupMultipleTempDirectories } = await import('@orchestr8/testkit/fs')
await cleanupMultipleTempDirectories(tempDirs)

// Hook-style temp directory (returns cleanup function)
const { useTempDirectory } = await import('@orchestr8/testkit/fs')
const { path, cleanup } = await useTempDirectory()
try {
  // Use path
} finally {
  await cleanup()
}
```

**When to use advanced utilities**:
- `createNamedTempDirectory()` - When you need recognizable temp directory names for debugging
- `createMultipleTempDirectories()` - When testing parallel operations or isolation between workers
- `withTempDirectoryScope()` - When you want guaranteed cleanup in a specific code block
- `useTempDirectory()` - When you need functional/hook-style temp directory management

---

## Cleanup Sequence (CRITICAL)

### ✅ PRODUCTION PATTERN: 4-Step Cleanup (Updated)

**Updated**: 2025-10-07 - Uses TestKit's createTempDirectory()

```typescript
describe('My Tests', () => {
  let testDir: string
  let pools: any[] = []
  const databases: Database[] = []

  beforeEach(async () => {
    // Create temp directory using TestKit
    const { createTempDirectory } = await import('@orchestr8/testkit')
    const tempDir = await createTempDirectory()
    testDir = tempDir.path
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

    // 3. TestKit handles temp directory cleanup automatically
    //    - No manual rmSync() needed!
    //    - Cleanup happens via TestKit's resource tracking

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
3. TestKit handles temp directory cleanup automatically
4. GC frees memory → run last to reclaim all resources

**Source**: `performance-benchmarks.test.ts:37-89`

---

## Custom Resource Cleanup Patterns (CRITICAL)

### ✅ PRODUCTION PATTERN: Custom Resources with Global State

**Critical Principle**: Any custom resource that registers **global state** (event listeners, timers, intervals, file watchers, network connections) MUST provide an **async cleanup method** and be tracked for cleanup in `afterEach`.

### The MetricsClient Anti-Pattern (What NOT to Do)

**❌ WRONG: Violates TestKit cleanup principles**

```typescript
class MetricsClient {
  private flushTimer: NodeJS.Timeout

  constructor(config: MetricsConfig) {
    // ❌ Registers event listeners without cleanup plan
    process.on('SIGTERM', () => this.flush())
    process.on('SIGINT', () => this.flush())
    process.on('beforeExit', () => this.flush())

    // ❌ Creates timer without cleanup plan
    this.flushTimer = setInterval(() => {
      this.flush()
    }, config.flushIntervalMs)
  }

  // ❌ Synchronous shutdown - can't await cleanup
  shutdown(): void {
    clearInterval(this.flushTimer)
    this.flush()  // Fire and forget - not awaited!
  }
}

// ❌ Not tracked for cleanup
describe('Metrics Tests', () => {
  it('should collect metrics', async () => {
    const client = new MetricsClient(config)  // Resource leak!
    // No cleanup in afterEach → process hangs
  })
})
```

**Consequences**:
- Process hangs after tests complete (event listeners prevent exit)
- Timers continue running across tests (test pollution)
- File handles/network connections leak
- Vitest never completes, requires Ctrl+C

### The Correct Pattern (TestKit-Compliant)

**✅ CORRECT: Proper async cleanup with resource tracking**

```typescript
class MetricsClient {
  private flushTimer: NodeJS.Timeout | undefined
  private shutdownHandler: (() => void) | undefined = undefined

  constructor(config: MetricsConfig) {
    // ✅ Store handler reference for cleanup
    this.shutdownHandler = () => {
      void this.flush()  // Fire and forget is OK in process exit
    }

    // ✅ Register with stored reference
    process.on('SIGTERM', this.shutdownHandler)
    process.on('SIGINT', this.shutdownHandler)
    process.on('beforeExit', this.shutdownHandler)

    // ✅ Store timer reference for cleanup
    this.flushTimer = setInterval(() => {
      void this.flush()
    }, config.flushIntervalMs)
  }

  // ✅ ASYNC shutdown - can await cleanup operations
  async shutdown(): Promise<void> {
    // Step 1: Clear timer first
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    }

    // Step 2: Remove event listeners (CRITICAL!)
    if (this.shutdownHandler) {
      process.removeListener('SIGTERM', this.shutdownHandler)
      process.removeListener('SIGINT', this.shutdownHandler)
      process.removeListener('beforeExit', this.shutdownHandler)
      this.shutdownHandler = undefined
    }

    // Step 3: Final flush (await it!)
    await this.flush()
  }
}

// ✅ Track resources for cleanup
describe('Metrics Tests', () => {
  const clients: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    // ✅ Cleanup all clients before other cleanup steps
    for (const client of clients) {
      try {
        await client.shutdown()
      } catch (error) {
        // Ignore cleanup errors to prevent cascade failures
      }
    }
    clients.length = 0

    // Continue with standard 4-step cleanup...
  })

  it('should collect metrics', async () => {
    const client = new MetricsClient(config)
    clients.push(client)  // ✅ Track for cleanup

    // Test implementation...
  })
})
```

### Custom Resource Cleanup Checklist

Before implementing any custom resource class, verify:

- [ ] **Async shutdown**: Does `shutdown()` return `Promise<void>`?
- [ ] **Event listeners**: Are all `process.on()` calls paired with `process.removeListener()`?
- [ ] **Timers**: Are all `setInterval()` calls paired with `clearInterval()`?
- [ ] **File watchers**: Are all `fs.watch()` calls paired with `watcher.close()`?
- [ ] **Network connections**: Are all sockets/servers closed in `shutdown()`?
- [ ] **Resource tracking**: Is the resource tracked in an array for cleanup?
- [ ] **afterEach cleanup**: Is `shutdown()` called in `afterEach` for ALL test files?
- [ ] **Error handling**: Does cleanup use try-catch to prevent cascade failures?

### Integration with 4-Step Cleanup

Custom resources should be cleaned up **BEFORE** the standard 4-step cleanup:

```typescript
afterEach(async () => {
  // 0. Custom resources FIRST (event listeners, timers, etc.)
  for (const client of clients) {
    try {
      await client.shutdown()
    } catch (error) {
      // Ignore errors
    }
  }
  clients.length = 0

  // 1. Settling delay
  await new Promise(resolve => setTimeout(resolve, 100))

  // 2. Drain connection pools
  for (const pool of pools) {
    try {
      await pool.drain()
    } catch (error) {
      console.warn('Pool drain error (non-critical):', error)
    }
  }
  pools = []

  // 3. Close databases
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

  // 4. TestKit handles temp directory cleanup automatically

  // 5. Force garbage collection LAST
  if (global.gc) global.gc()
})
```

### Common Global State Patterns

**Event Listeners:**
```typescript
// ❌ WRONG
process.on('SIGTERM', handler)

// ✅ CORRECT
this.handler = () => { /* ... */ }
process.on('SIGTERM', this.handler)
// Later in shutdown():
process.removeListener('SIGTERM', this.handler)
```

**Timers:**
```typescript
// ❌ WRONG
setInterval(() => { /* ... */ }, 1000)

// ✅ CORRECT
this.timer = setInterval(() => { /* ... */ }, 1000)
// Later in shutdown():
clearInterval(this.timer)
```

**File Watchers:**
```typescript
// ❌ WRONG
fs.watch(path, () => { /* ... */ })

// ✅ CORRECT
this.watcher = fs.watch(path, () => { /* ... */ })
// Later in shutdown():
this.watcher.close()
```

**Network Connections:**
```typescript
// ❌ WRONG
const server = http.createServer()
server.listen(port)

// ✅ CORRECT
this.server = http.createServer()
this.server.listen(port)
// Later in shutdown():
await new Promise<void>((resolve) => {
  this.server.close(() => resolve())
})
```

### Wallaby TDD Agent Integration

When using the Wallaby TDD agent, it will detect hanging tests and warn you. If you see:

```
⚠️  Tests completed but process not exiting
⚠️  Possible resource leak detected
```

**Immediate actions:**

1. Check for custom resources with global state
2. Verify `shutdown()` is async and removes all listeners/timers
3. Confirm `shutdown()` is called in `afterEach` for ALL test files
4. Use `lsof` to identify leaked file handles: `lsof -p $(pgrep node)`
5. Use `process._getActiveHandles()` to identify leaked timers/listeners

**Source**: Lesson learned from foundation package metrics client implementation

---

## SQLite Testing Patterns

### Pool Creation with Helper

**Updated**: 2025-10-07 - Uses TestKit's createTempDirectory()

```typescript
describe('SQLite Pool Tests', () => {
  let testDir: string
  let dbPath: string
  let pools: any[] = []

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit')
    const tempDir = await createTempDirectory()
    testDir = tempDir.path
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

    // TestKit handles temp directory cleanup automatically
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

**Source**: Updated pattern based on `testkit-sqlite-pool.test.ts:31-77`

### In-Memory Database

**Recommended Pattern**: Use `:memory:` for true in-memory databases

```typescript
it('should create in-memory database', async () => {
  const Database = (await import('better-sqlite3')).default

  // ✅ CORRECT: True in-memory (zero file handles, perfect isolation)
  const db = new Database(':memory:')
  databases.push(db) // Track for cleanup

  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')

  const user = db.prepare('SELECT * FROM users WHERE name = ?').get('Alice')
  expect(user).toEqual({ id: 1, name: 'Alice' })
})
```

**Why `:memory:` is preferred**:
- **Zero file handles**: No OS-level file descriptors created
- **Perfect isolation**: Each connection gets fresh database
- **Auto-cleanup**: Database destroyed when connection closes
- **Faster**: No IPC overhead from shared memory
- **Simpler**: No dynamic imports needed

**When NOT to use**:
- Need to share state across connections (rare, use explicit coordination)

**Related**: For detailed analysis of `:memory:` vs shared memory, see:
`docs/features/testing/spec-test-db-cleanup-tech.md`

**Key Points**:
- Track databases in array: `databases.push(db)`
- Use parameterized queries: `prepare().get(?)`
- Import Database dynamically: `await import('better-sqlite3')`

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

### @orchestr8/testkit/setup/auto Pattern (TestKit 2.2.0+)

**Zero-Config Resource Cleanup** - No manual setup files needed!

```typescript
// vitest.projects.ts (centralized configuration)
import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { resolve } from 'node:path'

export const getVitestProjects = () => {
  const foundation = createBaseVitestConfig({
    test: {
      name: 'foundation',
      root: resolve(__dirname, 'packages/foundation'),
      environment: 'node',

      // Zero-config resource cleanup (foundation package only)
      setupFiles: [
        '@orchestr8/testkit/register',     // 1. Bootstrap
        '@orchestr8/testkit/setup/auto',   // 2. Auto-executing cleanup
      ],

      // Other packages: bootstrap only
      // setupFiles: ['@orchestr8/testkit/register'],

      testTimeout: 10000,
      hookTimeout: 5000,
      teardownTimeout: 20000,
    },
  })

  return [foundation, capture, cli, storage]
}
```

**What `@orchestr8/testkit/setup/auto` provides:**

- ✅ Automatic resource cleanup after each test
- ✅ Leak detection enabled by default
- ✅ Zombie process prevention
- ✅ Priority-based cleanup (databases → files → network → timers)
- ✅ Optional logging via `LOG_CLEANUP_STATS=1`

**Custom Configuration** (if needed):

```typescript
// custom-setup.ts (only if you need non-standard configuration)
import { createTestSetup } from '@orchestr8/testkit/setup'

await createTestSetup({
  cleanupAfterEach: true,
  enableLeakDetection: true,
  logStats: true,
  packageName: 'my-package',
})
```

**Migration Note**: TestKit 2.2.0 eliminated the need for manual `test-setup.ts` files in most cases. Only use custom setup if you need non-standard configuration.

---

## Complete Test File Templates

### SQLite Test Template

**Updated**: 2025-10-07 - Uses TestKit's createTempDirectory()

```typescript
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'

describe('My SQLite Feature', () => {
  let testDir: string
  let dbPath: string
  let pools: any[] = []
  const databases: Database[] = []

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit')
    const tempDir = await createTempDirectory()
    testDir = tempDir.path
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

    // TestKit handles temp directory cleanup automatically

    if (global.gc) global.gc()
  })

  it('should work', async () => {
    const Database = (await import('better-sqlite3')).default

    const db = new Database(':memory:')
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

1. **Use TestKit's createTempDirectory()**: `const { createTempDirectory } = await import('@orchestr8/testkit/fs')` (or main export)
2. **Use dynamic imports**: `await import('@orchestr8/testkit/sqlite')`
3. **Track resources in arrays**: `pools: any[] = []`, `databases: Database[] = []`, `clients: Array<{ shutdown: () => Promise<void> }> = []`
4. **Follow 5-step cleanup**: custom resources → settling → pools → databases → (TestKit auto-cleanup) → GC
5. **Make shutdown() async**: Always return `Promise<void>` for proper cleanup
6. **Remove event listeners**: Pair every `process.on()` with `process.removeListener()` in shutdown
7. **Clear timers**: Pair every `setInterval()` with `clearInterval()` in shutdown
8. **Use parameterized queries**: `prepare('SELECT * FROM users WHERE name = ?').get(name)`
9. **Test security**: SQL injection, path traversal, command injection
10. **Check memory leaks**: GC before/after, 100 iterations, < 5MB growth
11. **Add console logs**: `console.log('✅ Test passed')`
12. **Use try-catch in cleanup**: Ignore errors to prevent cascade failures
13. **Set extended timeouts**: `30000ms` for memory leak tests
14. **Configure test-setup.ts**: Global resource cleanup

### ❌ DON'T

1. **Don't use Node.js tmpdir()** (use TestKit's `createTempDirectory()` instead)
2. **Don't use static imports** (except for types and vitest)
3. **Don't skip cleanup steps** (causes resource leaks)
4. **Don't make shutdown() synchronous** (must return `Promise<void>`)
5. **Don't register event listeners without cleanup** (causes process hanging)
6. **Don't create timers without clearing them** (causes test pollution)
7. **Don't forget to track custom resources** (add to array for cleanup)
8. **Don't use string concatenation in SQL** (SQL injection risk)
9. **Don't manually close pool-managed connections** (use `pool.drain()`)
10. **Don't forget settling delay** (100ms before pool.drain())
11. **Don't set GC first** (must be last in cleanup)
12. **Don't use fixed delays** (use explicit waits like `pool.warmUp()`)
13. **Don't parallelize cleanup** (use sequential for loops)
14. **Don't throw in cleanup** (use try-catch and ignore errors)
15. **Don't test implementation details** (test behavior)
16. **Don't manually rmSync() temp directories** (TestKit handles cleanup)

---

## ⚠️ LEGACY PATTERNS

### Node.js tmpdir() Pattern (Still Supported, TestKit Preferred)

**Status**: Legacy pattern - still functional but TestKit 2.0.0 provides better alternatives

⚠️ **Legacy way (still used in some production tests)**:
```typescript
import { tmpdir } from 'node:os'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

beforeEach(() => {
  testDir = join(tmpdir(), `test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})
```

**When to use this pattern**:
- ✅ Maintaining existing tests that use this pattern
- ✅ Need manual control over cleanup timing
- ✅ Working with code that can't use async beforeEach
- ❌ New tests (use `createTempDirectory()` instead)

**Limitations of this approach**:
- ⚠️ Requires manual cleanup in `afterEach`
- ⚠️ Risks temp directory pollution if cleanup fails
- ⚠️ No integration with TestKit's resource management
- ⚠️ More code, more chances for errors
- ⚠️ No cross-platform path safety
- ⚠️ No helper methods (writeFile, readFile, etc.)

✅ **Recommended way (TestKit 2.0+)**:
```typescript
import { join } from 'node:path'

beforeEach(async () => {
  const { createTempDirectory } = await import('@orchestr8/testkit/fs')
  const tempDir = await createTempDirectory()
  testDir = tempDir.path
})

afterEach(async () => {
  // No manual rmSync() needed - TestKit handles cleanup automatically!
  // Just close your resources in the proper order
})
```

**Benefits of TestKit's createTempDirectory()**:
- ✅ Automatic cleanup via TestKit resource tracking
- ✅ Proper test isolation between runs
- ✅ Cross-platform safety (handles path differences)
- ✅ Integration with TestKit's global cleanup hooks
- ✅ Less code, fewer errors
- ✅ Built-in leak detection
- ✅ Rich API with helper methods (writeFile, readFile, createStructure, etc.)

---

## Common Patterns Quick Reference

### Create Temp Directory

```typescript
// Preferred: Explicit sub-export
const { createTempDirectory } = await import('@orchestr8/testkit/fs')
const tempDir = await createTempDirectory()
const testDir = tempDir.path

// Access helper methods
await tempDir.writeFile('test.txt', 'content')
await tempDir.readFile('test.txt')
```

### Create Pool

```typescript
const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')
const pool = new SQLiteConnectionPool(dbPath, { maxConnections: 5 })
pools.push(pool)
```

### Create In-Memory Database

```typescript
const Database = (await import('better-sqlite3')).default

// ✅ CORRECT: True in-memory (zero file handles, perfect isolation)
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
    setupFiles: [
      '@orchestr8/testkit/register',
      '@orchestr8/testkit/setup/auto',  // Zero-config cleanup
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/__tests__/**',
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
- **Centralized Config**: `/vitest.projects.ts` (includes foundation setup)
- **TestKit Setup**: `@orchestr8/testkit/setup/auto` (zero-config module)
- **Production Report**: `/packages/foundation/docs/PRODUCTION-READY-FINAL-REPORT.md`

---

**All patterns verified against production code with 319 passing tests** ✅
