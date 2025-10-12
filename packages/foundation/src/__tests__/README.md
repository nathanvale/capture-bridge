# Foundation Package Test Suite - Comprehensive Guide

**Last Updated**: 2025-10-04 **Test Coverage**: 85%+ (279 tests) **Verified
Against**: @orchestr8/testkit v2.0.0 source code

---

## Table of Contents

1. [Test Suite Architecture](#test-suite-architecture)
2. [Quick Reference](#quick-reference)
3. [Testing Patterns](#testing-patterns)
4. [Best Practices by Domain](#best-practices-by-domain)
5. [Critical Cleanup Patterns](#critical-cleanup-patterns)
6. [Security Testing](#security-testing)
7. [Common Pitfalls & Anti-Patterns](#common-pitfalls--anti-patterns)
8. [Source Code References](#source-code-references)

---

## Test Suite Architecture

### Overview

This test suite validates the @capture-bridge/foundation package, which serves
as a thin wrapper around @orchestr8/testkit v2.0.0. The suite contains **13 test
files** with **279 comprehensive tests** covering:

- ✅ SQLite database testing (connection pooling, migrations, seeding,
  transactions)
- ✅ MSW (Mock Service Worker) HTTP mocking
- ✅ CLI process mocking and testing
- ✅ Core utilities (delay, retry, withTimeout)
- ✅ Security validation (SQL injection, path traversal, command injection)
- ✅ Resource management and cleanup
- ✅ Concurrency control and object pooling
- ✅ Performance benchmarks and memory leak detection

### Test Categories

| Category                | Files | Tests | Coverage                                         |
| ----------------------- | ----- | ----- | ------------------------------------------------ |
| **SQLite Testing**      | 3     | 76    | Pool management, migrations, CRUD, transactions  |
| **Security**            | 1     | 21    | SQL injection, path traversal, command injection |
| **Performance**         | 1     | 14    | Memory leaks, concurrency, stress tests          |
| **CLI Mocking**         | 2     | 73    | Process registration, behavioral validation      |
| **MSW Mocking**         | 1     | 37    | HTTP handlers, responses, auth                   |
| **Core Utilities**      | 2     | 48    | Delay, retry, timeout, mocks, resources          |
| **Contract Validation** | 3     | 13    | Export validation, integration tests             |

---

## Quick Reference

### Test File Purposes

```
├── testkit-sqlite-pool.test.ts (46 tests)
│   ├── Pool creation & configuration
│   ├── Connection acquisition & release
│   ├── Connection limits & queueing
│   └── Pool statistics & cleanup
│
├── testkit-sqlite-features.test.ts (25 tests)
│   ├── Database creation (memory & file)
│   ├── Migration & seeding utilities
│   └── Transaction management
│
├── testkit-sqlite-advanced.test.ts (5 tests)
│   ├── WAL mode & pragmas
│   ├── CRUD operations
│   └── Performance optimization
│
├── security-validation.test.ts (21 tests)
│   ├── SQL injection prevention
│   ├── Path traversal prevention
│   ├── Command injection prevention
│   └── Resource exhaustion prevention
│
├── performance-benchmarks.test.ts (14 tests)
│   ├── Memory leak detection
│   ├── Concurrent operations
│   └── Stress & scalability tests
│
├── testkit-cli-utilities-behavioral.test.ts (56 tests)
│   ├── Process registration & retrieval
│   ├── Process failure scenarios
│   ├── Concurrent process tracking
│   └── Output streaming & exit codes
│
├── testkit-cli-utilities.test.ts (17 tests)
│   ├── Behavioral testing patterns
│   └── Spawn interception validation
│
├── testkit-msw-features.test.ts (34 tests)
│   ├── MSW server setup & teardown
│   ├── HTTP handlers & responses
│   ├── Authentication & CRUD
│   └── Error simulation
│
├── testkit-core-utilities.test.ts (39 tests)
│   ├── delay(), retry(), withTimeout()
│   ├── Mock functions & environment detection
│   └── Edge case handling
│
├── testkit-utils-advanced.test.ts (8 tests)
│   ├── Concurrency management
│   ├── Object pooling
│   ├── Resource management
│   └── Security validation
│
├── testkit-main-export.test.ts (3 tests)
│   └── Integration test for @orchestr8/testkit package
│
├── testkit-final-validation.test.ts (5 tests) ⚠️
│   └── ISSUE: Tests wrong package (should validate foundation)
│
└── package-contract.test.ts (5 tests)
    └── Prevents test-implementation drift
```

---

## Testing Patterns

### Behavioral vs Structural Testing

**❌ AVOID: Structural Testing (superficial)**

```typescript
// Only checks if export exists
it("should export createDatabase", async () => {
  const { createDatabase } = await import("@orchestr8/testkit/sqlite")
  expect(createDatabase).toBeDefined()
})
```

**✅ PREFER: Behavioral Testing (validates functionality)**

```typescript
// Validates actual behavior works
it("should create in-memory database with createDatabase", async () => {
  const { createDatabase } = await import("@orchestr8/testkit/sqlite")

  const db = await createDatabase(":memory:")

  expect(db).toBeDefined()
  expect(db.open).toBe(true)

  // Verify database actually works
  const result = db.prepare("SELECT 1 as value").get()
  expect(result).toEqual({ value: 1 })

  db.close()
})
```

### Test Organization Pattern

```typescript
describe("Feature Group", () => {
  // 1. SETUP - Run before each test
  let resource: Resource

  beforeEach(async () => {
    resource = await createResource()
  })

  // 2. CLEANUP - Run after each test (critical!)
  afterEach(async () => {
    await cleanupResource(resource)
  })

  // 3. TESTS - Grouped by behavior
  describe("Happy Path", () => {
    it("should work in normal conditions", async () => {
      // Arrange - Setup test data
      const input = "test"

      // Act - Execute the behavior
      const result = await resource.process(input)

      // Assert - Validate the outcome
      expect(result).toBe("processed: test")
    })
  })

  describe("Error Handling", () => {
    it("should throw on invalid input", async () => {
      await expect(resource.process(null)).rejects.toThrow()
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty string", async () => {
      const result = await resource.process("")
      expect(result).toBe("processed: ")
    })
  })
})
```

### Integration Testing Pattern

```typescript
/**
 * Integration Test Pattern
 *
 * Purpose: Validate external package contracts
 * Scope: Test real package behavior, not mocked implementations
 *
 * Source: testkit-main-export.test.ts
 */
describe("Package Integration", () => {
  it("should validate external package exports", async () => {
    // Import from ACTUAL package, not local code
    const testkit = await import("@orchestr8/testkit")

    // Validate expected exports exist
    expect(testkit).toHaveProperty("createDatabase")
    expect(testkit).toHaveProperty("setupMSW")

    // Validate exports actually work
    const db = testkit.createDatabase(":memory:")
    expect(db.open).toBe(true)
    db.close()
  })
})
```

---

## Best Practices by Domain

### SQLite Testing

#### Connection Pool Lifecycle

**Source**: `@orchestr8/testkit/dist/sqlite/pool.js:1-437`

```typescript
/**
 * CRITICAL: Connection Pool Cleanup Sequence
 *
 * The order of cleanup operations is essential to prevent:
 * - SQLITE_BUSY errors (database locked)
 * - Process hanging (unclosed connections)
 * - Memory leaks (orphaned resources)
 *
 * Source: performance-benchmarks.test.ts:44-83
 */

afterEach(async () => {
  // STEP 1: POOLS FIRST
  // drain() closes ALL pool-managed connections
  // NEVER manually close pool-managed connections!
  for (const pool of pools) {
    await pool.drain()
  }
  pools.length = 0

  // STEP 2: DATABASES SECOND
  // Only close non-pool connections
  for (const database of databases) {
    if (database.open && !database.readonly) {
      database.close()
    }
  }
  databases.length = 0

  // STEP 3: FILESYSTEM THIRD
  // Remove temp directories after connections closed
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true })
  }

  // STEP 4: GC LAST
  // Force garbage collection to detect memory leaks
  if (global.gc) {
    global.gc()
  }
})
```

#### Pool-Managed Connection Anti-Pattern

**❌ NEVER DO THIS:**

```typescript
// WRONG: Double-tracking pool-managed connections
const pool = await createConnectionPool(dbPath, { maxConnections: 5 })
const conn = await pool.acquire()

databases.push(conn) // ❌ FATAL ERROR: Will cause double-close!

await pool.release(conn)
await pool.drain() // Closes connection
conn.close() // ❌ CRASH: Already closed by pool!
```

**✅ CORRECT PATTERN:**

```typescript
// RIGHT: Let pool manage its own connections
const pool = await createConnectionPool(dbPath, { maxConnections: 5 })
const conn = await pool.acquire()

// Do NOT add to databases array - pool manages it!
// pools.push(pool)  // Track pool only, not connections

await pool.release(conn)
await pool.drain() // ✅ Pool handles connection cleanup
```

#### Migration & Seeding Pattern

**Source**: `@orchestr8/testkit/dist/sqlite/migrate.d.ts:1-136`

```typescript
/**
 * Best Practice: Use TestKit migration utilities
 *
 * Source: testkit-sqlite-features.test.ts:179-209
 */

// ✅ CORRECT: Use TestKit utilities
const db = createFileDatabase(dbPath)
await applyMigrations(db, [
  { id: "001", up: "CREATE TABLE users (id INTEGER PRIMARY KEY)" },
])

// ❌ WRONG: Manual migration (reinventing the wheel)
db.exec("CREATE TABLE IF NOT EXISTS migrations (...)")
db.prepare("INSERT INTO migrations (...)").run()
```

#### Transaction Management

```typescript
/**
 * Transaction Pattern with Auto-Rollback
 *
 * Source: testkit-sqlite-features.test.ts:263-294
 */

it("should handle transaction rollback on error", async () => {
  const db = createDatabase(":memory:")
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)")

  // Use TestKit's transaction helper (auto-rollback on throw)
  await expect(
    runInTransaction(db, async () => {
      db.prepare("INSERT INTO users VALUES (1)").run()
      throw new Error("Intentional failure")
    })
  ).rejects.toThrow()

  // Verify rollback happened
  const count = db.prepare("SELECT COUNT(*) as count FROM users").get()
  expect(count.count).toBe(0)

  db.close()
})
```

### CLI Process Mocking

#### Singleton Registry Pattern

**Source**: `@orchestr8/testkit/dist/cli/mocker.js:1-394`

```typescript
/**
 * CRITICAL: Global Process Mocker Singleton
 *
 * The CLI mocker uses a global registry to prevent parallel registration issues.
 * Always get the singleton instance via getGlobalProcessMocker()
 *
 * Source: testkit-cli-utilities-behavioral.test.ts:21-40
 */

// ✅ CORRECT: Use singleton instance
import { getGlobalProcessMocker } from "@orchestr8/testkit/cli"

beforeEach(() => {
  const mocker = getGlobalProcessMocker()
  mocker.reset() // Clear previous registrations
})

// ❌ WRONG: Creating new instances
const mocker1 = new ProcessMocker() // Separate registry
const mocker2 = new ProcessMocker() // Won't see mocker1's registrations!
```

#### Hexa-Register Pattern

```typescript
/**
 * Hexa-Register Pattern: One Registration → Six Methods
 *
 * Registering a command once applies to ALL 6 child_process methods:
 * - spawn(), spawnSync()
 * - exec(), execSync()
 * - execFile(), execFileSync()
 *
 * Source: testkit-cli-utilities-behavioral.test.ts:121-155
 */

mocker.register("git status") // One registration

// ALL six methods now mocked!
const result1 = spawn("git", ["status"]) // ✅ Mocked
const result2 = spawnSync("git", ["status"]) // ✅ Mocked
const result3 = exec("git status") // ✅ Mocked
const result4 = execSync("git status") // ✅ Mocked
const result5 = execFile("git", ["status"]) // ✅ Mocked
const result6 = execFileSync("git", ["status"]) // ✅ Mocked
```

#### Process Output Streaming

```typescript
/**
 * Process Output Streaming Pattern
 *
 * Source: testkit-cli-utilities-behavioral.test.ts:235-281
 */

it("should stream stdout chunks", (done) => {
  mocker.register("npm install", {
    stdout: "Installing...\nDone!\n",
  })

  const proc = spawn("npm", ["install"])
  const chunks: string[] = []

  proc.stdout.on("data", (chunk) => {
    chunks.push(chunk.toString())
  })

  proc.on("close", (code) => {
    expect(code).toBe(0)
    expect(chunks.join("")).toContain("Installing")
    expect(chunks.join("")).toContain("Done")
    done()
  })
})
```

### MSW HTTP Mocking

#### Server Lifecycle Pattern

**Source**: `@orchestr8/testkit/dist/msw/index.js:1-428`

```typescript
/**
 * MSW Server Lifecycle
 *
 * Source: testkit-msw-features.test.ts:21-40
 */

describe("MSW Tests", () => {
  beforeAll(async () => {
    // Setup MSW server once for all tests
    await setupMSW({
      handlers: [
        http.get("/api/users", () => {
          return HttpResponse.json([{ id: 1, name: "Alice" }])
        }),
      ],
    })
  })

  afterEach(() => {
    // Reset handlers after each test (keeps server running)
    resetMSWHandlers()
  })

  afterAll(async () => {
    // Cleanup server after all tests
    await disposeMSWServer()
  })
})
```

#### Handler Registration Patterns

```typescript
/**
 * Dynamic Handler Registration
 *
 * Source: testkit-msw-features.test.ts:179-213
 */

it("should allow dynamic handler addition", async () => {
  const { addMSWHandler, getMSWServer } = await import("@orchestr8/testkit/msw")

  // Add handler during test
  addMSWHandler(
    http.post("/api/users", async ({ request }) => {
      const user = await request.json()
      return HttpResponse.json({ id: 2, ...user }, { status: 201 })
    })
  )

  // Handler now active
  const response = await fetch("http://localhost/api/users", {
    method: "POST",
    body: JSON.stringify({ name: "Bob" }),
  })

  expect(response.status).toBe(201)
})
```

### Security Testing

#### SQL Injection Prevention

**Source**: `@orchestr8/testkit/dist/security/index.js:1-247`

```typescript
/**
 * SQL Injection Prevention Pattern
 *
 * Source: security-validation.test.ts:22-90
 */

it("should prevent SQL injection via prepared statements", async () => {
  const db = createDatabase(":memory:")
  db.exec("CREATE TABLE users (id INTEGER, name TEXT)")

  // ❌ VULNERABLE: String concatenation
  // db.exec(`INSERT INTO users VALUES (1, '${userInput}')`)

  // ✅ SAFE: Prepared statements with parameter binding
  const stmt = db.prepare("INSERT INTO users VALUES (?, ?)")

  // Attack payload
  const maliciousInput = "'; DROP TABLE users; --"

  // Safe: Treated as literal string, not SQL
  stmt.run(1, maliciousInput)

  // Verify data integrity
  const result = db.prepare("SELECT name FROM users WHERE id = ?").get(1)
  expect(result.name).toBe("'; DROP TABLE users; --") // Literal value stored

  db.close()
})
```

#### Path Traversal Prevention

```typescript
/**
 * Path Traversal Prevention Pattern
 *
 * Source: security-validation.test.ts:92-156
 */

it("should prevent directory traversal attacks", async () => {
  const { validatePath } = await import("@orchestr8/testkit/utils")

  const baseDir = "/tmp/safe-dir"

  // ✅ SAFE: Stays within base directory
  expect(() => validatePath(baseDir, "file.txt")).not.toThrow()
  expect(() => validatePath(baseDir, "subdir/file.txt")).not.toThrow()

  // ❌ ATTACK: Tries to escape base directory
  expect(() => validatePath(baseDir, "../../../etc/passwd")).toThrow(
    "Path traversal detected"
  )

  expect(() => validatePath(baseDir, "..\\..\\windows\\system32")).toThrow(
    "Path traversal detected"
  )
})
```

#### Command Injection Prevention

```typescript
/**
 * Command Injection Prevention Pattern
 *
 * Source: security-validation.test.ts:218-294
 */

it("should prevent command injection via shell metacharacters", async () => {
  const { validateShellExecution } = await import("@orchestr8/testkit/utils")

  // ✅ SAFE: Simple command
  expect(() => validateShellExecution("echo", ["hello"])).not.toThrow()

  // ❌ ATTACK: Shell metacharacters
  expect(() => validateShellExecution("rm -rf /", [])).toThrow(
    "Dangerous command detected"
  )

  expect(() => validateShellExecution("echo", ["$(cat /etc/passwd)"])).toThrow(
    "Shell injection attempt detected"
  )

  // ✅ SAFE: Properly escaped arguments
  const { command, args } = validateShellExecution("echo", ["hello world"])
  expect(command).toBe("echo")
  expect(args[0]).toMatch(/hello world/) // Escaped version
})
```

### Performance Testing

#### Memory Leak Detection Pattern

**Source**: `performance-benchmarks.test.ts:85-162`

```typescript
/**
 * Memory Leak Detection with V8 GC
 *
 * IMPORTANT: Node.js must be run with --expose-gc flag
 * Configure in vitest.config.ts poolOptions.forks.execArgv
 */

it("should not leak memory during connection pool operations", async () => {
  if (!global.gc) {
    console.warn("⚠️ GC not available, skipping memory leak test")
    return
  }

  // Baseline measurement
  global.gc()
  await new Promise((resolve) => setTimeout(resolve, 100))
  const baselineMemory = process.memoryUsage().heapUsed

  // Stress test: Create and destroy 100 pools
  for (let i = 0; i < 100; i++) {
    const pool = await createConnectionPool(":memory:", { maxConnections: 5 })
    await pool.drain()
  }

  // Force garbage collection
  global.gc()
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Final measurement
  const finalMemory = process.memoryUsage().heapUsed
  const growth = finalMemory - baselineMemory
  const growthMB = growth / 1024 / 1024

  // Threshold: Allow 5MB growth for 100 pool cycles
  expect(growthMB).toBeLessThan(5)
})
```

#### Concurrent Operations Pattern

```typescript
/**
 * Concurrent Operations Stress Test
 *
 * Source: performance-benchmarks.test.ts:164-217
 */

it("should handle concurrent connection pool operations", async () => {
  const pool = await createConnectionPool(":memory:", { maxConnections: 10 })

  // Simulate 50 concurrent operations
  const operations = Array.from({ length: 50 }, async (_, i) => {
    const conn = await pool.acquire()

    // Simulate work
    conn.prepare("SELECT ?").get(i)

    await pool.release(conn)
  })

  // All should complete without errors
  await expect(Promise.all(operations)).resolves.not.toThrow()

  await pool.drain()
})
```

---

## Critical Cleanup Patterns

### Resource Management Hierarchy

```typescript
/**
 * Resource Cleanup Hierarchy (Most Critical → Least Critical)
 *
 * Note: Now handled automatically by @orchestr8/testkit/setup
 * which provides pre-configured resource cleanup
 */

// 1. DATABASE POOLS (most critical)
//    - Must drain before closing connections
//    - Prevents SQLITE_BUSY errors
for (const pool of pools) {
  await pool.drain() // Closes all pooled connections
}

// 2. DATABASE CONNECTIONS (critical)
//    - Only close non-pool connections
//    - Check .open and !.readonly before closing
for (const db of databases) {
  if (db.open && !db.readonly) {
    db.close()
  }
}

// 3. CHILD PROCESSES (important)
//    - Send SIGTERM, wait, then SIGKILL if needed
for (const proc of processes) {
  proc.kill("SIGTERM")
  await waitForExit(proc, 1000)
  if (proc.exitCode === null) {
    proc.kill("SIGKILL")
  }
}

// 4. FILE SYSTEM (important)
//    - Remove temp directories
//    - Use { recursive: true, force: true }
if (existsSync(tempDir)) {
  rmSync(tempDir, { recursive: true, force: true })
}

// 5. EVENT LISTENERS (less critical)
//    - Remove listeners to prevent memory leaks
emitter.removeAllListeners()

// 6. GARBAGE COLLECTION (optional)
//    - Force GC for memory leak detection
if (global.gc) {
  global.gc()
}
```

### Global Cleanup Hook

**Configured via**: `@orchestr8/testkit/setup` in `vitest.config.ts`

```typescript
/**
 * Global Cleanup Hook (Safety Net)
 *
 * This is now automatically configured when you include
 * '@orchestr8/testkit/setup' in your vitest setupFiles.
 *
 * It provides:
 * - cleanupAllResources() in afterAll hooks
 * - Automatic leak detection
 * - Optional logging via LOG_CLEANUP_STATS=1
 *
 * For custom cleanup, you can use the factory function:
 */

import { createTestSetup } from '@orchestr8/testkit/setup'

await createTestSetup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: true,
})
```

### Process Hanging Prevention

**Source**: `vitest.config.ts:19`

```typescript
/**
 * Hanging Process Detection
 *
 * The 'hanging-process' reporter detects when tests don't exit.
 * Common causes:
 * - Unclosed database connections
 * - Active child processes
 * - Unresolved promises
 * - Active timers/intervals
 */

export default defineConfig({
  test: {
    reporters: process.env.CI ? ["default"] : ["default", "hanging-process"], // Local dev only
  },
})
```

---

## Security Testing

### Attack Surface Coverage

The security-validation.test.ts file provides comprehensive coverage of common
vulnerabilities:

| Vulnerability       | Tests | Prevention Method                                     |
| ------------------- | ----- | ----------------------------------------------------- |
| SQL Injection       | 5     | Prepared statements with parameter binding            |
| Path Traversal      | 5     | validatePath() with base directory enforcement        |
| Command Injection   | 5     | validateShellExecution() with metacharacter detection |
| Resource Exhaustion | 3     | Connection limits, timeout enforcement, rate limiting |
| Combined Attacks    | 3     | Multi-layer validation (path + SQL + command)         |

### Security Testing Checklist

```typescript
/**
 * Security Testing Checklist
 *
 * Before deploying any database/file/process functionality:
 */

// ✅ SQL Injection
// - Use prepared statements (db.prepare())
// - NEVER concatenate user input into SQL
// - Test with malicious payloads: '; DROP TABLE users; --

// ✅ Path Traversal
// - Use validatePath(baseDir, userPath)
// - Test with: ../../../etc/passwd, ..\\..\\windows\\system32
// - Never trust user-provided paths

// ✅ Command Injection
// - Use validateShellExecution(command, args)
// - Test with: rm -rf /, $(cat /etc/passwd), `whoami`
// - Always escape shell arguments

// ✅ Resource Exhaustion
// - Set connection pool limits (maxConnections)
// - Set timeout limits (testTimeout, hookTimeout)
// - Test with: 1000+ concurrent operations

// ✅ Combined Attacks
// - Test multi-vector attacks (SQL + path + command)
// - Validate defense-in-depth works
```

---

## Common Pitfalls & Anti-Patterns

### ❌ Pitfall 1: Double-Closing Pool-Managed Connections

```typescript
// ❌ WRONG: Will crash with "database not open"
const pool = await createConnectionPool(dbPath)
const conn = await pool.acquire()

databases.push(conn) // Track connection

await pool.release(conn)
await pool.drain() // Closes connection
conn.close() // ❌ CRASH: Already closed!
```

**Fix**: Never manually track or close pool-managed connections. Let the pool
handle its own connections.

### ❌ Pitfall 2: Wrong Cleanup Order

```typescript
// ❌ WRONG: Filesystem before database
rmSync(tempDir, { recursive: true }) // Delete DB file
db.close() // ❌ ERROR: File no longer exists!

// ✅ CORRECT: Database before filesystem
db.close() // Close connection first
rmSync(tempDir, { recursive: true }) // Then delete file
```

### ❌ Pitfall 3: Forgetting Resource Cleanup

```typescript
// ❌ WRONG: No afterEach cleanup
it("should create database", async () => {
  const db = createDatabase(":memory:")
  // ... test code ...
  // ❌ Missing: db.close()
})

// ✅ CORRECT: Always clean up in afterEach
afterEach(() => {
  if (db && db.open) {
    db.close()
  }
})
```

### ❌ Pitfall 4: Structural-Only Tests

```typescript
// ❌ WRONG: Only checks if export exists
it("should export createDatabase", async () => {
  const { createDatabase } = await import("@orchestr8/testkit/sqlite")
  expect(createDatabase).toBeDefined() // Superficial!
})

// ✅ CORRECT: Actually test the behavior
it("should create working database", async () => {
  const { createDatabase } = await import("@orchestr8/testkit/sqlite")
  const db = createDatabase(":memory:")

  // Verify it actually works
  const result = db.prepare("SELECT 1 as value").get()
  expect(result.value).toBe(1)

  db.close()
})
```

### ❌ Pitfall 5: Missing ResourceCategory Import

```typescript
// ❌ WRONG: Using non-existent enum value
registerResource("my-resource", cleanup, {
  category: ResourceCategory.OTHER, // ❌ Doesn't exist!
})

// ✅ CORRECT: Use valid enum value
import { ResourceCategory } from "@orchestr8/testkit"

registerResource("my-resource", cleanup, {
  category: ResourceCategory.EVENT, // ✅ Valid
})
```

### ❌ Pitfall 6: Ignoring Process Exit

```typescript
// ❌ WRONG: Spawn and forget
const proc = spawn("long-running-command")
// ❌ Test ends, process keeps running!

// ✅ CORRECT: Track and cleanup
const proc = spawn("long-running-command")
processes.push(proc) // Track for cleanup

afterEach(async () => {
  for (const p of processes) {
    p.kill("SIGTERM")
    await waitForExit(p, 1000)
  }
})
```

---

## Source Code References

All tests in this suite have been verified against the actual @orchestr8/testkit
v2.0.0 source code.

### TestKit Source Code Map

```
@orchestr8/testkit/
├── dist/
│   ├── index.js                    # Main entry point (lean exports)
│   ├── sqlite/
│   │   ├── database.js:1-328      # createDatabase, createFileDatabase
│   │   ├── migrate.js:1-247       # applyMigrations, resetDatabase
│   │   ├── pool.js:1-437          # SQLiteConnectionPool (46 pool tests)
│   │   ├── seed.js:1-156          # seedWithBatch, seedWithFiles
│   │   └── transaction.js:1-94    # runInTransaction, withTransaction
│   ├── msw/
│   │   ├── index.js:1-428         # setupMSW, MSW server lifecycle
│   │   ├── handlers.js:1-203      # addMSWHandler, resetMSWHandlers
│   │   └── responses.js:1-178     # HTTP response utilities
│   ├── cli/
│   │   ├── mocker.js:1-394        # ProcessMocker, global registry
│   │   ├── builder.js:1-187       # SpawnMockBuilder
│   │   └── commands.js:1-143      # CommonCommands, QuickMocks
│   ├── utils/
│   │   ├── index.js:1-289         # delay, retry, withTimeout
│   │   ├── concurrency.js:1-247   # ConcurrencyManager
│   │   ├── pooling.js:1-318       # ObjectPool, ArrayPool, BufferPool
│   │   └── resources.js:1-394     # ResourceManager, cleanup APIs
│   ├── security/
│   │   └── index.js:1-247         # Security validation functions
│   └── config/
│       └── vitest.js:1-156        # setupResourceCleanup
```

### Test File → Source Code Mapping

| Test File                                | Primary Source Files                                              |
| ---------------------------------------- | ----------------------------------------------------------------- |
| testkit-sqlite-pool.test.ts              | sqlite/pool.js:1-437                                              |
| testkit-sqlite-features.test.ts          | sqlite/database.js, migrate.js, seed.js, transaction.js           |
| testkit-sqlite-advanced.test.ts          | sqlite/database.js, migrate.js                                    |
| security-validation.test.ts              | security/index.js:1-247                                           |
| performance-benchmarks.test.ts           | sqlite/pool.js, resources.js                                      |
| testkit-cli-utilities-behavioral.test.ts | cli/mocker.js:1-394, builder.js, commands.js                      |
| testkit-cli-utilities.test.ts            | cli/mocker.js                                                     |
| testkit-msw-features.test.ts             | msw/index.js, handlers.js, responses.js                           |
| testkit-core-utilities.test.ts           | utils/index.js:1-289                                              |
| testkit-utils-advanced.test.ts           | utils/concurrency.js, pooling.js, resources.js, security/index.js |
| testkit-main-export.test.ts              | index.js (main entry)                                             |
| package-contract.test.ts                 | ../src/index.ts (foundation package)                              |

---

## Running Tests

### Basic Commands

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm vitest run testkit-sqlite-pool.test.ts

# Run in watch mode
pnpm vitest watch

# Run with memory leak detection (requires --expose-gc)
node --expose-gc node_modules/vitest/vitest.mjs run

# Run with cleanup stats
LOG_CLEANUP_STATS=1 pnpm test
```

### Debug Mode

```bash
# Enable hanging process detection
pnpm vitest run --reporter=default --reporter=hanging-process

# Verbose output with test names
pnpm vitest run --reporter=verbose

# Debug specific test
pnpm vitest run -t "should handle concurrent connection pool operations"
```

### Coverage Thresholds

Configured in `vitest.config.ts`:

- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

---

## Contributing

### Adding New Tests

1. **Choose the right pattern**: Behavioral over structural
2. **Add cleanup hooks**: Always use afterEach for resource cleanup
3. **Follow the hierarchy**: Pools → Databases → Processes → Filesystem → GC
4. **Document your tests**: Add JSDoc comments explaining the pattern
5. **Verify against source**: Check TestKit source code for correct API usage

### Test Quality Checklist

- [ ] Does the test validate **behavior** (not just structure)?
- [ ] Is there proper **cleanup** in afterEach?
- [ ] Are **resources tracked** for cleanup (databases, pools, processes)?
- [ ] Does it test **edge cases** (null, undefined, empty, negative)?
- [ ] Does it test **error handling** (invalid input, failures)?
- [ ] Is the **cleanup order** correct (pools → databases → filesystem)?
- [ ] Are there **inline comments** explaining non-obvious patterns?
- [ ] Does it **verify against source code** (not assumptions)?

---

## Troubleshooting

### Tests Hang / Don't Exit

**Cause**: Unclosed resources (databases, processes, listeners)

**Fix**:

1. Check `afterEach` hooks are running
2. Verify all databases are closed: `db.close()`
3. Verify all pools are drained: `await pool.drain()`
4. Check for orphaned child processes
5. Enable hanging-process reporter: `pnpm vitest --reporter=hanging-process`

### SQLITE_BUSY Errors

**Cause**: Connection closed before pool drained

**Fix**:

```typescript
// ✅ CORRECT ORDER
await pool.drain() // First: drain pool
db.close() // Then: close database
```

### Memory Leaks

**Cause**: Resources not being cleaned up

**Fix**:

1. Ensure `global.gc` is available: `node --expose-gc`
2. Add cleanup in afterEach
3. Use `cleanupAllResources()` in global afterAll hook
4. Run with `LOG_CLEANUP_STATS=1` to see resource counts

### Type Errors

**Cause**: TypeScript strict mode enabled

**Fix**: Check TypeScript strict mode errors separately:

```bash
pnpm tsc --noEmit
```

---

## Additional Resources

- **TestKit Documentation**: https://github.com/orchestr8/testkit
- **Vitest Documentation**: https://vitest.dev
- **MSW Documentation**: https://mswjs.io
- **SQLite Documentation**: https://www.sqlite.org/docs.html
- **Test Coverage Report**: `/docs/test-coverage-remediation-complete.md`
- **Test Analysis**: `/docs/test-coverage-analysis-2025-10-04.md`

---

**Last Verified**: 2025-10-04 **TestKit Version**: 2.0.0 **Total Tests**: 279
**Coverage**: 85%+ **Status**: ✅ Production Ready
