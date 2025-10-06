# TDD Testing Patterns with TestKit

Comprehensive testing patterns for test-driven development using @orchestr8/testkit.

## Overview

This guide provides concrete testing patterns for the Wallaby TDD agent and developers. Each pattern follows the structure:

1. **Testing Pattern** - The approach and strategy
2. **TestKit API Feature** - Which TestKit utilities to use
3. **Test Example** - Working code from `packages/foundation/src/__tests__/`

## Pattern Index

- [Async Operations Testing](#async-operations-testing)
- [Retry Logic Testing](#retry-logic-testing)
- [Timeout Handling Testing](#timeout-handling-testing)
- [Mock Function Testing](#mock-function-testing)
- [Environment Detection Testing](#environment-detection-testing)
- [Temporary File System Testing](#temporary-file-system-testing)
- [SQLite Database Testing](#sqlite-database-testing)
- [Transaction Testing](#transaction-testing)
- [Migration Testing](#migration-testing)
- [HTTP Mocking with MSW](#http-mocking-with-msw)
- [Process Mocking](#process-mocking)
- [Concurrency Testing](#concurrency-testing)
- [Resource Leak Testing](#resource-leak-testing)
- [Security Validation Testing](#security-validation-testing)

---

## Async Operations Testing

### Pattern: Test Asynchronous Delays

**When to use**: Testing time-dependent behavior, debouncing, throttling, or async flow control.

**TestKit API**: `delay(ms: number): Promise<void>`

**Reference**: `guide-testkit.md` - Core Utilities → Async Utilities

**Test Example**: `testkit-core-utilities.test.ts:22-45`

```typescript
import { delay } from "@orchestr8/testkit"

describe("Async Operations", () => {
  it("should delay execution for specified milliseconds", async () => {
    const start = Date.now()
    await delay(100)
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(95) // Allow 5ms variance
    expect(elapsed).toBeLessThan(150)
  })

  it("should handle zero delay (event loop yield)", async () => {
    const start = Date.now()
    await delay(0)
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(20) // Nearly instant
  })
})
```

**TDD Cycle**:

1. RED: Write test expecting delay behavior
2. GREEN: Use `delay()` utility
3. REFACTOR: Extract delay constants, add timing tolerance

---

## Retry Logic Testing

### Pattern: Test Retry with Exponential Backoff

**When to use**: Testing resilient operations, API calls, database connections, file operations.

**TestKit API**: `retry<T>(operation, maxRetries, delayMs): Promise<T>`

**Reference**: `guide-testkit.md` - Core Utilities → Async Utilities

**Test Example**: `testkit-core-utilities.test.ts:48-110`

```typescript
import { retry } from "@orchestr8/testkit"

describe("Retry Logic", () => {
  it("should retry failed operations with backoff", async () => {
    let attempts = 0

    const operation = async () => {
      attempts++
      if (attempts < 3) {
        throw new Error(`Attempt ${attempts} failed`)
      }
      return "success"
    }

    const result = await retry(operation, 5, 10)

    expect(result).toBe("success")
    expect(attempts).toBe(3)
  })

  it("should fail after max retries", async () => {
    let attempts = 0

    const operation = async () => {
      attempts++
      throw new Error(`Always fails - attempt ${attempts}`)
    }

    await expect(retry(operation, 3, 10)).rejects.toThrow("Always fails")
    expect(attempts).toBe(3)
  })

  it("should apply exponential backoff", async () => {
    let attempts = 0
    const timestamps: number[] = []

    const operation = async () => {
      timestamps.push(Date.now())
      attempts++
      if (attempts < 3) {
        throw new Error("Retry me")
      }
      return "success"
    }

    await retry(operation, 3, 50)

    // Verify increasing delays
    const delay1 = timestamps[1] - timestamps[0]
    const delay2 = timestamps[2] - timestamps[1]

    expect(delay1).toBeGreaterThanOrEqual(45) // ~50ms
    expect(delay2).toBeGreaterThanOrEqual(90) // ~100ms (exponential)
  })
})
```

**TDD Cycle**:

1. RED: Test that operation retries on failure
2. GREEN: Use `retry()` utility with timing verification
3. REFACTOR: Extract retry configuration, test backoff timing

---

## Timeout Handling Testing

### Pattern: Test Operation Timeouts

**When to use**: Testing slow operations, API timeouts, preventing hangs.

**TestKit API**: `withTimeout<T>(promise, timeoutMs): Promise<T>`

**Reference**: `guide-testkit.md` - Core Utilities → Async Utilities

**Test Example**: `testkit-core-utilities.test.ts:113-148`

```typescript
import { withTimeout, delay } from "@orchestr8/testkit"

describe("Timeout Handling", () => {
  it("should complete within timeout", async () => {
    const fastOperation = delay(50).then(() => "completed")
    const result = await withTimeout(fastOperation, 200)

    expect(result).toBe("completed")
  })

  it("should timeout slow operations", async () => {
    const slowOperation = delay(200).then(() => "too late")

    await expect(withTimeout(slowOperation, 50)).rejects.toThrow("timeout")
  })

  it("should preserve promise rejection", async () => {
    const failingOperation = Promise.reject(new Error("Original error"))

    await expect(withTimeout(failingOperation, 1000)).rejects.toThrow(
      "Original error"
    )
  })
})
```

**TDD Cycle**:

1. RED: Test both successful completion and timeout scenarios
2. GREEN: Use `withTimeout()` wrapper
3. REFACTOR: Extract timeout constants, test error preservation

---

## Mock Function Testing

### Pattern: Test with Mock Functions

**When to use**: Testing callbacks, dependencies, side effects.

**TestKit API**: `createMockFn<T>(implementation?: T): T`

**Reference**: `guide-testkit.md` - Core Utilities → Mock Functions

**Test Example**: `testkit-core-utilities.test.ts:151-185`

```typescript
import { createMockFn } from "@orchestr8/testkit"

describe("Mock Functions", () => {
  it("should create basic mock functions", async () => {
    const mockFn = createMockFn()

    const result = mockFn("arg1", "arg2")

    // Without implementation, returns undefined
    expect(result).toBeUndefined()
    expect(typeof mockFn).toBe("function")
  })

  it("should work with custom implementations", async () => {
    const mockFn = createMockFn((x: number) => x * 2)

    const result = mockFn(5)

    expect(result).toBe(10)
  })
})
```

**TDD Cycle**:

1. RED: Test that mock captures calls and returns expected values
2. GREEN: Use `createMockFn()` with implementation
3. REFACTOR: Extract mock setup, verify call counts

---

## Environment Detection Testing

### Pattern: Test Environment-Specific Behavior

**When to use**: Testing CI/local differences, test runner detection, environment configuration.

**TestKit API**: `getTestEnvironment()`

**Reference**: `guide-testkit.md` - Environment Utilities

**Test Example**: `testkit-core-utilities.test.ts:187-208`

```typescript
import { getTestEnvironment } from "@orchestr8/testkit"

describe("Environment Detection", () => {
  it("should detect test environment", async () => {
    const env = getTestEnvironment()

    expect(env).toBeDefined()
    expect(env).toHaveProperty("isVitest")
    expect(env.isVitest).toBe(true) // We're in Vitest
    expect(env).toHaveProperty("isCI")
    expect(env).toHaveProperty("isWallaby")
    expect(env).toHaveProperty("nodeEnv")
  })
})
```

**TDD Cycle**:

1. RED: Test environment detection logic
2. GREEN: Use `getTestEnvironment()` for conditional behavior
3. REFACTOR: Extract environment checks to configuration

---

## Temporary File System Testing

### Pattern: Test with Isolated File Systems

**When to use**: Testing file operations, avoiding test pollution, cleanup verification.

**TestKit API**: `createTempDirectory()`, `useTempDirectory()`

**Reference**: `guide-testkit.md` - File System Utilities

**Test Example**: `testkit-core-utilities.test.ts:255-347`

```typescript
import { createTempDirectory, useTempDirectory } from "@orchestr8/testkit"
import fs from "fs/promises"
import path from "path"

describe("File System Testing", () => {
  it("should create isolated temporary directory", async () => {
    const tempDir = await createTempDirectory()

    expect(tempDir).toBeDefined()
    expect(tempDir.path).toBeDefined()

    // Verify directory exists
    const stats = await fs.stat(tempDir.path)
    expect(stats.isDirectory()).toBe(true)

    // Cleanup
    if (tempDir.cleanup) {
      await tempDir.cleanup()
    }
  })

  it("should use managed temporary directory with auto-cleanup", async () => {
    const result = await useTempDirectory(async (dir) => {
      // Write test file
      const testFile = path.join(dir.path, "test.txt")
      await fs.writeFile(testFile, "test content")

      // Verify file exists
      const content = await fs.readFile(testFile, "utf-8")
      expect(content).toBe("test content")

      return "completed"
    })

    expect(result).toBe("completed")
    // Cleanup happens automatically
  })
})
```

**TDD Cycle**:

1. RED: Test file operations in isolation
2. GREEN: Use `useTempDirectory()` for automatic cleanup
3. REFACTOR: Extract file setup to fixtures

---

## SQLite Database Testing

### Pattern: Test with In-Memory Databases

**When to use**: Testing database operations, query logic, schema validation.

**TestKit API**: `createMemoryUrl()`, `applyRecommendedPragmas()`

**Reference**: `guide-testkit.md` - SQLite Utilities

**Test Example**: `testkit-sqlite-features.test.ts:40-63`

```typescript
import {
  createMemoryUrl,
  applyRecommendedPragmas,
} from "@orchestr8/testkit/sqlite"
import Database from "better-sqlite3"

describe("SQLite Testing", () => {
  let db: Database

  beforeEach(() => {
    db = new Database(":memory:")
    applyRecommendedPragmas(db)
  })

  afterEach(() => {
    db.close()
  })

  it("should create and query database", () => {
    // Create schema
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `)

    // Insert data
    db.prepare("INSERT INTO users (name) VALUES (?)").run("John Doe")

    // Query data
    const user = db
      .prepare("SELECT * FROM users WHERE name = ?")
      .get("John Doe")

    expect(user).toBeDefined()
    expect(user.name).toBe("John Doe")
  })
})
```

**TDD Cycle**:

1. RED: Test database schema and queries
2. GREEN: Use in-memory database with pragmas
3. REFACTOR: Extract schema to migrations, seed data to fixtures

---

## Transaction Testing

### Pattern: Test Transaction Rollback

**When to use**: Testing atomic operations, error recovery, data integrity.

**TestKit API**: `withTransaction(db, callback)`

**Reference**: `guide-testkit.md` - SQLite Utilities → Transaction Management

**Test Example**: `testkit-sqlite-features.test.ts:274-316`

```typescript
import { withTransaction } from "@orchestr8/testkit/sqlite"
import Database from "better-sqlite3"

describe("Transaction Testing", () => {
  let db: Database

  beforeEach(() => {
    db = new Database(":memory:")
    db.exec(`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        balance REAL NOT NULL
      )
    `)
    db.exec("INSERT INTO accounts VALUES (1, 100.0), (2, 50.0)")
  })

  it("should rollback on error", async () => {
    try {
      await withTransaction(db, async (tx) => {
        tx.prepare(
          "UPDATE accounts SET balance = balance - 30 WHERE id = 1"
        ).run()
        tx.prepare(
          "UPDATE accounts SET balance = balance + 30 WHERE id = 2"
        ).run()

        // Force error
        throw new Error("Simulated transaction error")
      })
    } catch (error) {
      // Expected
    }

    // Verify rollback - balances unchanged
    const account1 = db
      .prepare("SELECT balance FROM accounts WHERE id = 1")
      .get()
    expect(account1.balance).toBe(100.0)
  })

  it("should commit successful transactions", async () => {
    await withTransaction(db, async (tx) => {
      tx.prepare(
        "UPDATE accounts SET balance = balance - 30 WHERE id = 1"
      ).run()
      tx.prepare(
        "UPDATE accounts SET balance = balance + 30 WHERE id = 2"
      ).run()
    })

    // Verify commit
    const account1 = db
      .prepare("SELECT balance FROM accounts WHERE id = 1")
      .get()
    expect(account1.balance).toBe(70.0)
  })
})
```

**TDD Cycle**:

1. RED: Test transaction rollback on error
2. GREEN: Use `withTransaction()` wrapper
3. REFACTOR: Extract transaction logic to repository methods

---

## Migration Testing

### Pattern: Test Database Migrations

**When to use**: Testing schema evolution, migration rollback, version management.

**TestKit API**: `applyMigrations()`, `resetDatabase()`

**Reference**: `guide-testkit.md` - SQLite Utilities → Migration Support

**Test Example**: `testkit-sqlite-features.test.ts:113-165`

```typescript
import { resetDatabase } from "@orchestr8/testkit/sqlite"
import Database from "better-sqlite3"

describe("Migration Testing", () => {
  let db: Database

  beforeEach(() => {
    db = new Database(":memory:")
  })

  it("should apply migrations in order", () => {
    const migrations = [
      {
        version: 1,
        up: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
      },
      {
        version: 2,
        up: "ALTER TABLE users ADD COLUMN email TEXT",
      },
      {
        version: 3,
        up: "CREATE INDEX idx_users_email ON users(email)",
      },
    ]

    // Apply migrations
    for (const migration of migrations) {
      db.exec(migration.up)
    }

    // Verify schema
    const tableInfo = db.prepare("PRAGMA table_info('users')").all()
    const columns = tableInfo.map((col) => col.name)

    expect(columns).toContain("id")
    expect(columns).toContain("name")
    expect(columns).toContain("email")
  })

  it("should reset database to clean state", async () => {
    // Create schema
    db.exec("CREATE TABLE test (id INTEGER)")
    db.exec("INSERT INTO test VALUES (1), (2)")

    // Reset
    await resetDatabase({
      exec: (sql: string) => db.exec(sql),
      prepare: (sql: string) => db.prepare(sql),
      pragma: (pragma: string) => db.pragma(pragma),
      close: () => {},
    })

    // Verify tables are gone
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
    expect(tables).toHaveLength(0)
  })
})
```

**TDD Cycle**:

1. RED: Test migration application and rollback
2. GREEN: Use migration utilities with version tracking
3. REFACTOR: Extract migrations to separate files

---

## HTTP Mocking with MSW

### Pattern: Test HTTP Requests with MSW

**When to use**: Testing API integrations, HTTP clients, request/response handling.

**TestKit API**: `createMSWServer()`, `createCRUDHandlers()`

**Reference**: `guide-testkit.md` - MSW Utilities

**Test Example**: `testkit-msw-features.test.ts:96-197`

```typescript
import { createMSWServer } from "@orchestr8/testkit/msw"
import { http, HttpResponse } from "msw"

describe("HTTP Mocking", () => {
  let server

  beforeAll(() => {
    server = createMSWServer([
      http.get("http://localhost/api/users", () => {
        return HttpResponse.json([
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ])
      }),
      http.post("http://localhost/api/users", async ({ request }) => {
        const body = await request.json()
        return HttpResponse.json({ id: 3, name: body.name }, { status: 201 })
      }),
    ])

    server.listen({ onUnhandledRequest: "bypass" })
  })

  afterAll(() => {
    server.close()
  })

  it("should intercept GET requests", async () => {
    const response = await fetch("http://localhost/api/users")
    const users = await response.json()

    expect(response.status).toBe(200)
    expect(users).toHaveLength(2)
    expect(users[0].name).toBe("Alice")
  })

  it("should intercept POST requests", async () => {
    const response = await fetch("http://localhost/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Charlie" }),
    })
    const user = await response.json()

    expect(response.status).toBe(201)
    expect(user.name).toBe("Charlie")
  })
})
```

**TDD Cycle**:

1. RED: Test API client behavior
2. GREEN: Use `createMSWServer()` with handlers
3. REFACTOR: Extract handlers to shared mocks

**Note**: MSW in Node.js requires full URLs (e.g., `http://localhost/api/users`), not relative paths.

---

## Process Mocking

### Pattern: Test Command-Line Operations

**When to use**: Testing CLI tools, spawn processes, shell commands.

**TestKit API**: `mockSpawn()`, `commonCommands`

**Reference**: `guide-testkit.md` - CLI Utilities

**Test Example**: `testkit-cli-utilities.test.ts:17-120`

```typescript
import { mockSpawn, commonCommands } from "@orchestr8/testkit/cli"

describe("Process Mocking", () => {
  it("should mock git status command", () => {
    const gitStatusMock = mockSpawn({
      command: "git",
      args: ["status"],
      stdout: "On branch main\nnothing to commit\n",
      exitCode: 0,
    })

    expect(gitStatusMock).toBeDefined()
    expect(typeof gitStatusMock).toBe("function")
  })

  it("should use common command mocks", () => {
    if (commonCommands.npm) {
      expect(commonCommands.npm).toBeDefined()
    }
  })

  it("should handle command failures", () => {
    const errorMock = mockSpawn({
      command: "invalid-command",
      stderr: "command not found: invalid-command\n",
      exitCode: 127,
    })

    expect(errorMock).toBeDefined()
  })
})
```

**TDD Cycle**:

1. RED: Test CLI command behavior
2. GREEN: Use `mockSpawn()` for process mocking
3. REFACTOR: Extract command mocks to test utilities

---

## Concurrency Testing

### Pattern: Test Concurrent Operations

**When to use**: Testing parallel execution, rate limiting, resource contention.

**TestKit API**: `limitConcurrency()`, `limitedAll()`

**Reference**: `guide-testkit.md` - Advanced Utils → Concurrency Management

**Test Example**: `testkit-utils-advanced.test.ts:169-197`

```typescript
import { limitConcurrency } from "@orchestr8/testkit/utils"

describe("Concurrency Testing", () => {
  it("should limit concurrent operations", async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return i
    })

    const results = await limitConcurrency(tasks, 3) // Max 3 concurrent

    expect(results).toHaveLength(10)
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
```

**TDD Cycle**:

1. RED: Test that concurrency limit is enforced
2. GREEN: Use `limitConcurrency()` utility
3. REFACTOR: Extract concurrency limits to configuration

---

## Resource Leak Testing

### Pattern: Test Resource Cleanup

**When to use**: Testing cleanup logic, preventing memory leaks, resource management.

**TestKit API**: `registerResource()`, `detectResourceLeaks()`

**Reference**: `guide-testkit.md` - Advanced Utils → Resource Management

**Test Example**: `testkit-utils-advanced.test.ts:250-275`

```typescript
import {
  registerResource,
  cleanupAllResources,
  detectResourceLeaks,
} from "@orchestr8/testkit/utils"

describe("Resource Leak Testing", () => {
  it("should register and cleanup resources", async () => {
    let cleaned = false

    // Register test resource
    registerResource({
      id: "test-resource",
      category: "test",
      cleanup: async () => {
        cleaned = true
      },
    })

    // Cleanup all resources
    await cleanupAllResources()

    expect(cleaned).toBe(true)
  })

  it("should detect resource leaks", async () => {
    const leaks = await detectResourceLeaks()

    expect(leaks).toBeDefined()
    expect(Array.isArray(leaks)).toBe(true)
  })
})
```

**TDD Cycle**:

1. RED: Test that resources are cleaned up
2. GREEN: Use `registerResource()` and `cleanupAllResources()`
3. REFACTOR: Extract cleanup to lifecycle hooks

---

## Security Validation Testing

### Pattern: Test Input Validation

**When to use**: Testing command injection prevention, path traversal, SQL injection.

**TestKit API**: `validateCommand()`, `validatePath()`, `sanitizeSqlIdentifier()`

**Reference**: `guide-testkit.md` - Advanced Utils → Security Validation

**Test Example**: `testkit-utils-advanced.test.ts:279-341`

```typescript
import { validateCommand, validatePath } from "@orchestr8/testkit/utils"

describe("Security Validation Testing", () => {
  it("should validate shell commands", () => {
    // Valid command
    const validResult = validateCommand("echo", ["hello"])
    expect(validResult.valid).toBe(true)

    // Invalid command with shell metacharacters
    const invalidResult = validateCommand("echo && rm -rf /", [])
    expect(invalidResult.valid).toBe(false)
  })

  it("should validate file paths", () => {
    // Valid path
    const validResult = validatePath("/tmp/test.txt")
    expect(validResult.valid).toBe(true)

    // Invalid path with traversal
    const invalidResult = validatePath("/tmp/../../etc/passwd")
    expect(invalidResult.valid).toBe(false)
  })
})
```

**TDD Cycle**:

1. RED: Test security validation fails on malicious input
2. GREEN: Use validation utilities
3. REFACTOR: Extract validation to middleware/guards

---

## Best Practices Summary

### For Wallaby TDD Agent

1. **Start with Pattern**: Identify which testing pattern applies
2. **Reference API**: Link to specific TestKit API feature
3. **Copy Test Example**: Use working examples from foundation tests
4. **Follow TDD Cycle**: RED → GREEN → REFACTOR with Wallaby feedback

### Test Organization

- **Colocate tests**: Place `.test.ts` files next to implementation
- **Use descriptive names**: `describe` blocks match class/function names
- **One assertion per test**: Keep tests focused and debuggable
- **Setup/teardown**: Use `beforeEach`/`afterEach` for test isolation

### Wallaby Integration

- Use `mcp__wallaby__wallaby_failingTests` after writing test (RED phase)
- Use `mcp__wallaby__wallaby_allTests` to verify green
- Use `mcp__wallaby__wallaby_runtimeValues` for debugging
- Use `mcp__wallaby__wallaby_coveredLinesForFile` to check coverage

### TestKit Module Selection

| Testing Need        | TestKit Module | Import Path                 |
| ------------------- | -------------- | --------------------------- |
| Async/Retry/Timeout | Core           | `@orchestr8/testkit`        |
| Mocks               | Core           | `@orchestr8/testkit`        |
| Environment         | Core           | `@orchestr8/testkit`        |
| File System         | FS             | `@orchestr8/testkit/fs`     |
| SQLite              | SQLite         | `@orchestr8/testkit/sqlite` |
| HTTP Mocking        | MSW            | `@orchestr8/testkit/msw`    |
| CLI/Process         | CLI            | `@orchestr8/testkit/cli`    |
| Advanced Utils      | Utils          | `@orchestr8/testkit/utils`  |

## Quick Reference

### Common Test Scenarios → Pattern Mapping

- **API calls fail randomly** → Retry Logic Testing
- **Need to test file operations** → Temporary File System Testing
- **Testing database queries** → SQLite Database Testing
- **API integration testing** → HTTP Mocking with MSW
- **Testing CLI tools** → Process Mocking
- **Rate limiting logic** → Concurrency Testing
- **Memory leak concerns** → Resource Leak Testing
- **User input validation** → Security Validation Testing

### TestKit Import Quick Guide

```typescript
// Core async utilities
import { delay, retry, withTimeout, createMockFn } from "@orchestr8/testkit"

// Environment
import {
  getTestEnvironment,
  getTestTimeouts,
  setupTestEnv,
} from "@orchestr8/testkit"

// File system
import { createTempDirectory, useTempDirectory } from "@orchestr8/testkit/fs"

// SQLite
import {
  createMemoryUrl,
  withTransaction,
  seedWithBatch,
} from "@orchestr8/testkit/sqlite"

// MSW
import { createMSWServer, createCRUDHandlers } from "@orchestr8/testkit/msw"

// CLI
import { mockSpawn, commonCommands } from "@orchestr8/testkit/cli"

// Advanced utils
import {
  limitConcurrency,
  registerResource,
  validateCommand,
} from "@orchestr8/testkit/utils"
```

---

**For complete API documentation, see**: `docs/guides/guide-testkit.md`

**For working examples, see**: `packages/foundation/src/__tests__/testkit-*.test.ts`
