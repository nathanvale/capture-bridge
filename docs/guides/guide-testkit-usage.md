---
title: TestKit Developer Guide
doc_type: guide
status: living
owner: Nathan
version: 2.0.0
date: 2025-09-30
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
testkit_version: 2.0.0
---

# TestKit Developer Guide

> **Complete NPM package reference for `@orchestr8/testkit` - Modular testing utilities with security validation, resource management, and concurrency control**
>
> **Alignment**: Supports MPPP requirements for deterministic testing, sequential processing validation, and no-outbox architecture verification
>
> **Cross-References**:
>
> - Master PRD: [prd-master.md](../master/prd-master.md)
> - Roadmap: [roadmap.md](../master/roadmap.md)
> - TDD Applicability Guide: [tdd-applicability.md](./tdd-applicability.md)
> - Test Strategy Guide: [test-strategy.md](./test-strategy.md)

## 📦 Package Overview

**Package Name:** `@orchestr8/testkit`
**Version:** 2.0.0
**Purpose:** Comprehensive testing utilities with modular imports and optional dependencies
**Architecture:** Lean core with modular sub-exports
**Philosophy:** Test isolation, deterministic behavior, ADHD-friendly patterns

### 🎯 Modular Architecture

TestKit uses **modular sub-exports**:
- **Main export** (`@orchestr8/testkit`) - Core utilities only (delay, retry, withTimeout, createMockFn)
- **Sub-exports** - Feature-specific modules (env, fs, sqlite, msw, containers, etc.)
- **No optional dependency bloat** - Install only what you need
- **Tree-shakable** - Import exactly what you use
- **Enhanced TypeScript support** - Full type safety across all modules

### ✨ Key Features

- **Security Validation** - Command injection prevention, path traversal protection, SQL injection guards
- **Resource Management** - Automatic resource tracking, priority cleanup, leak detection
- **Concurrency Control** - Operation-specific limits, batch processing, predefined managers
- **Enhanced Environment Control** - Fake timers, deterministic randomness, crypto mocking
- **SQLite Connection Pooling** - Advanced connection management, transaction adapters
- **Naming Conventions** - Consistent `create*`, `setup*`, `use*`, `with*`, `get*` patterns

## 🚀 Installation & Import

```bash
# Install core package
pnpm add -D @orchestr8/testkit @vitest/ui vitest

# Install optional dependencies as needed
pnpm add -D msw happy-dom                    # For MSW testing
pnpm add -D better-sqlite3                    # For SQLite testing
pnpm add -D testcontainers pg mysql2          # For container testing
pnpm add -D convex-test                       # For Convex testing
```

### Core Utilities (No Optional Dependencies)

```typescript
// Import from main export - requires only vitest
import {
  delay,           // Promise-based delay
  retry,           // Retry with exponential/linear backoff
  withTimeout,     // Timeout wrapper
  createMockFn     // Vitest-compatible mock function with call tracking
} from "@orchestr8/testkit"
```

### Modular Sub-Exports (v2.0)

```typescript
// Environment utilities
import {
  getTestEnvironment,
  setupTestEnv,
  useFakeTime,           // NEW in v2.0 - replaces useFakeTimers
  controlRandomness,
  quickRandom,
  quickCrypto
} from "@orchestr8/testkit/env"

// File system utilities
import {
  createTempDirectory,
  createTempDirectoryWithResourceManager,  // NEW in v2.0
  useTempDirectory,
  withTempDirectoryScope
} from "@orchestr8/testkit/fs"

// SQLite testing
import {
  createMemoryUrl,
  createFileDatabase,
  createSQLitePool,              // NEW in v2.0
  withSQLiteTransaction,         // NEW in v2.0
  migrateDatabase,               // NEW in v2.0
  applyRecommendedPragmas        // NEW in v2.0
} from "@orchestr8/testkit/sqlite"

// MSW mock server (requires msw@^2.0.0)
import {
  setupMSW,
  http,                          // MSW v2 - replaces 'rest'
  HttpResponse,                  // MSW v2
  createSuccessResponse,
  createAuthHandlers
} from "@orchestr8/testkit/msw"

// CLI process mocking
import {
  spawnUtils,
  createProcessMock,
  mockProcess
} from "@orchestr8/testkit/cli"

// Container testing (requires testcontainers)
import {
  createPostgresContext,
  createMySQLContext
} from "@orchestr8/testkit/containers"

// Convex testing (requires convex-test)
import {
  createConvexTestHarness,
  withConvexTest
} from "@orchestr8/testkit/convex"

// Vitest configuration
import {
  createVitestConfig,            // NEW in v2.0 - single config function
  defineVitestConfig
} from "@orchestr8/testkit/config"
```

## 🎯 Core Domains & Features

### 1. **MSW Domain** (Mock Service Worker)

**Purpose:** API mocking for unit/integration tests
**Maturity:** ✅ Stable (Production Ready)

> ⚠️ **MSW Module Status**
> Currently experiencing build issues. Use native MSW setup until fixed:
> ```typescript
> import { setupServer } from 'msw/node';
> import { http, HttpResponse } from 'msw';
> ```

#### Server Lifecycle Functions

- `setupMSW(handlers[])` - Vitest lifecycle hooks (beforeAll/afterEach/afterAll)
- `quickSetupMSW(handlers[])` - Fire-and-forget startup
- `setupMSWGlobal(handlers[])` - Global setup for vitest.globalSetup.ts
- `setupMSWManual(handlers[])` - Imperative control
- `setupMSWForEnvironment(handlers[], config?)` - Environment-aware setup
- `createTestScopedMSW(handlers[])` - Suite-scoped isolation

#### Handler Factories

- `createSuccessResponse(data, status?)` - JSON success responses
- `createErrorResponse(message, status?, code?)` - Standard error envelopes
- `createDelayedResponse(data, delayMs?, status?)` - Latency simulation
- `createUnreliableHandler(endpoint, data, failureRate?)` - Random failure injection
- `createPaginatedHandler(endpoint, allData, pageSize?)` - Pagination metadata
- `createAuthHandlers(baseUrl?)` - Complete auth flow (/login, /me, /logout)
- `createCRUDHandlers<T>(resourceName, initialData?)` - In-memory REST resource
- `createNetworkIssueHandler(endpoint, method?)` - Timeout/unavailable patterns

#### Constants & Utilities

- `HTTP_STATUS` - Common status codes (200, 404, 500, etc.)
- `COMMON_HEADERS` - Header presets
- Direct re-exports: `http`, `HttpResponse`, `delay` from MSW

```typescript
// Example: Mock Ollama for ADHD Brain
setupMSW([
  http.post("http://localhost:11434/api/generate", () =>
    createDelayedResponse({ response: "Mock transcription" }, 100)
  ),
  createUnreliableHandler(
    "http://localhost:11434/api/embeddings",
    { embedding: new Array(384).fill(0.1) },
    0.1 // 10% failure rate
  ),
])
```

### 2. **SQLite Domain**

**Purpose:** Database testing with SQLite (memory/file modes)
**Maturity:** ✅ Stable (Production Ready)

#### Database Management

- `createMemoryUrl(options?)` - In-memory SQLite URL generation
- `createFileDatabase(name?, options?)` - Factory function for file-based DB with cleanup (returns { url, path, dir, cleanup })
- `createInMemoryDatabase(options?)` - Memory DB wrapper
- `withTransaction(db, fn)` - Transaction isolation wrapper

#### Migration & Schema

- `applyMigrations(db, options)` - Apply SQL migration files
- `resetDatabase(db, options?)` - Drop all tables/indexes
- `backupDatabase(db, backupPath)` - Create DB backup

#### ORM Utilities

- `prismaUrl(type, path?, options?)` - Prisma-compatible URLs
- `drizzleUrl(type, path?, driver?)` - Drizzle-compatible URLs

#### Pragmas & Optimization

- `applyProductionPragmas(db)` - Production settings (WAL, synchronous, etc.)
- `applyTestPragmas(db)` - Test optimizations (memory journal, etc.)
- `applyRecommendedPragmas(db, options?)` - Smart pragma selection
- `probeEnvironment(db, options?)` - Capability detection

```typescript
// Example: Test with memory database
const url = createMemoryUrl()
const db = new Database(url)
applyTestPragmas(db)

// Migration testing
await applyMigrations(db, { dir: "./migrations" })

// Transaction isolation
await withTransaction(db, async (tx) => {
  tx.prepare("INSERT INTO users (name) VALUES (?)").run("Test User")
})
```

### 3. **CLI Domain**

**Purpose:** Mock child_process commands (spawn, exec, fork, etc.)
**Maturity:** ✅ Stable (Production Ready)

#### Quick Mocks (Hexa-Register Pattern)

- `quickMocks.success(command, output)` - Mock successful command
- `quickMocks.failure(command, error, exitCode)` - Mock failed command
- `quickMocks.throws(command, error)` - Mock command that throws
- `quickMocks.slow(command, delay, output)` - Mock slow command
- `quickMocks.batch(commands[])` - Mock multiple commands at once

#### Process Helpers

- `processHelpers.mockSuccess(command, stdout, exitCode?)`
- `processHelpers.mockFailure(command, stderr, exitCode?)`
- `processHelpers.mockError(command, error)`
- `processHelpers.clear()` - Clear all mocks
- `processHelpers.clearCalls()` - Clear call history

#### Spawn Utilities

- `mockSpawn(command)` → `SpawnMockBuilder` - Fluent builder pattern
- `spawnUtils.mockCommandSuccess(command, stdout, stderr?, exitCode?)`
- `spawnUtils.mockCommandFailure(command, stderr, exitCode?, stdout?)`

**Note:** One registration works for all 6 child_process methods!

```typescript
// Example: Mock git commands
quickMocks.success("git status", "nothing to commit\n")
quickMocks.failure("npm install", "ENOENT", 1)

// Works with spawn, exec, execSync, fork, execFile, execFileSync
const result = execSync("git status") // Returns mocked output
```

### 4. **File System Domain**

**Purpose:** Temp directory management and file operations
**Maturity:** ✅ Stable (Production Ready)

#### Async vs Sync Methods

| Method | Returns | Usage |
|--------|---------|-------|
| createTempDirectory() | TempDirectory | Synchronous |
| createNamedTempDirectory(prefix) | TempDirectory | Synchronous |
| createMultipleTempDirectories(n) | Promise<TempDirectory[]> | Await required |
| cleanupMultipleTempDirectories(dirs) | Promise<void> | Await required |

> ⚠️ **Note:** Some functions shown in examples may not be available in current version.
> Use createTempDirectory() and manual cleanup for now.

#### Temp Directory Creation

- `createTempDirectory(options?)` - Create temp dir with manual cleanup (synchronous, returns {path, cleanup})
- `useTempDirectory(fn)` - Auto-cleanup temp dir in callback (not currently exported)
- `createManagedTempDirectory(options?)` - Suite-managed temp dir (not currently exported)
- `withTempDirectoryScope(fn)` - Scoped temp dir with auto-cleanup

#### Directory Operations

- `ensureDirectoryExists(path)` - Recursive mkdir
- `cleanupDirectory(path)` - Recursive removal
- `copyDirectory(src, dest, options?)` - Recursive copy
- `getTempDirectoryCount()` - Debug helper for leak detection

#### File Utilities

- `assertFileExists(path)` - Throw if file missing
- `assertDirectoryExists(path)` - Throw if directory missing
- `watchFileChanges(path, callback)` - File watcher
- `createFileSnapshot(path)` - Capture file state

```typescript
// Example: Test with temp directory
const temp = await createTempDirectory({ prefix: "test-" })
await temp.writeFile("config.json", JSON.stringify({ key: "value" }))
await temp.createStructure({
  src: {
    "index.ts": "export const answer = 42",
    lib: { "util.ts": "export const double = (n) => n * 2" },
  },
})
const content = await temp.readFile("config.json")
await temp.cleanup()
```

### 5. **Environment Domain**

**Purpose:** Time control, randomness, and data generation
**Maturity:** ✅ Stable (Production Ready)

#### Test Environment

- `getTestEnvironment()` - Returns environment flags
  - Available properties: `isCI`, `isWallaby`, `isLocal`, `isDebug`, `isTurbo`
  - Note: `isTest` property not available, use `process.env.NODE_ENV === 'test'`
- `setupTestEnv(env)` - Sets environment variables, returns restore function directly (not object)
  ```typescript
  const restore = setupTestEnv({ VAR: 'value' });
  restore(); // ✅ Correct - returns function directly
  ```

#### Time Control

- `useFakeTimers(options?)` - Vitest fake timers wrapper
- `setSystemTime(date)` - Set system clock
- `advanceTimersByTime(ms)` - Advance timers
- `withTimezone(tz, fn)` - Test in timezone
- `TimerController` class - Advanced timer control

#### Randomness Control

- `controlRandomness(seed?)` - Deterministic Math.random
- `quickRandom.predictable(seed?)` - Quick seeded random
- `quickRandom.sequence(values[])` - Sequence of values
- `quickRandom.fixed(value?)` - Fixed value (default 0.5)
- `SeededRandom` class - Seeded random generator

#### Crypto Mocking

- `mockCryptoUUID(pattern)` - Mock crypto.randomUUID
- `createSequentialUUID(prefix?)` - Sequential UUIDs
- `createPredictableUUID(seed)` - Seeded UUIDs

#### Data Generation

- `DeterministicGenerator` class - Deterministic data
- `generateName()`, `generateEmail()` - User data
- `generatePhone()`, `generateSSN()` - Contact data
- `createUserFactory()` - User factory
- `FactoryRegistry` class - Factory management

```typescript
// Example: Control time and randomness
useFakeTimers({ now: new Date("2024-01-01") })
controlRandomness(12345)

// Predictable UUIDs
mockCryptoUUID("test-{n}") // test-1, test-2, test-3...

// Advance time
advanceTimersByTime(5000) // 5 seconds
```

### 6. **Container Domain**

**Purpose:** Database containers for integration tests
**Maturity:** 🔶 Beta (Use with caution)

#### PostgreSQL

- `createPostgresContainer(config?)` - Create Postgres container
- `setupPostgresTest(options?)` - Complete test setup
- `runMigrations(container, glob)` - Run SQL migrations
- `seedDatabase(container, data)` - Seed with data

#### MySQL

- `createMySQLContainer(config?)` - Create MySQL container
- `setupMySQLTest(options?)` - Complete test setup
- `runMySQLMigrations(container, glob)` - Run migrations

```typescript
// Example: Postgres integration test
const { db, cleanup } = await setupPostgresTest({
  migrations: "./migrations/*.sql",
  seed: { users: [{ name: "Test" }] },
})
// ... run tests
await cleanup()
```

### 7. **Convex Domain**

**Purpose:** Testing Convex applications
**Maturity:** 🔶 Beta (Use with caution)

#### Test Harness

- `createConvexTestHarness(options)` - Create test harness
- Database operations via `harness.db`
- Auth management via `harness.auth`
- Storage operations via `harness.storage`
- Scheduler control via `harness.scheduler`

```typescript
// Example: Convex testing
const harness = createConvexTestHarness({ schema })
await harness.db.seed(async (ctx) => {
  await ctx.db.insert("users", { name: "Test User" })
})
const result = await harness.auth
  .withUser({ subject: "user123" })
  .run(async (ctx) => ctx.db.query("users").collect())
```

### 8. **Configuration Domain**

**Purpose:** Vitest configuration helpers
**Maturity:** ✅ Stable

**Available Exports:**
```typescript
export {
  baseVitestConfig,        // Pre-configured object
  createVitestBaseConfig,   // Function to create config (note: name is swapped from expected pattern)
  createCIOptimizedConfig,  // CI-specific config
  createWallabyOptimizedConfig, // Wallaby-specific config
  defineVitestConfig,       // Wrapper for defineConfig
  createVitestCoverage,     // Coverage configuration
  createVitestEnvironmentConfig, // Environment setup
  createVitestPoolOptions,  // Thread pool config
  createVitestTimeouts,     // Timeout configuration
}
```

- `createVitestBaseConfig(overrides?)` - Base Vitest config (⚠️ Note: function name is swapped)
- `createWorkspaceConfig(projects)` - Workspace config
- `detectEnvironment()` - Environment detection
- `getTestTimeouts()` - Timeout configuration

### 9. **Utils Domain**

**Purpose:** General testing utilities
**Maturity:** ✅ Stable

- `delay(ms)` - Promise-based delay
- `retry(fn, maxAttempts, delayMs)` - Retry with linear backoff (both parameters required)
  ```typescript
  // Note: Current implementation uses linear backoff
  // Each retry waits delayMs (not exponential)
  await retry(operation, 3, 100); // Retries at 100ms intervals
  ```
- `withTimeout(promise, timeoutMs)` - Timeout wrapper
  ```typescript
  try {
    await withTimeout(slowOp, 1000);
  } catch (error) {
    // Error message: "Timeout after 1000ms"
  }
  ```
- `createMockFn(implementation?)` - Basic mock function
  ```typescript
  const mockFn = createMockFn();
  mockFn('test');
  // Note: Returns basic function, not a vitest spy
  // For spy functionality, use vi.fn() directly
  ```

## 🔄 Cross-Domain Patterns

### TDD-First Testing

```typescript
// Memory DB for unit tests
const memUrl = createMemoryUrl()
// File DB for integration tests
const fileDb = await createFileDatabase()
// MSW for external services
setupMSW([...handlers])
// Control time and randomness
useFakeTimers()
controlRandomness(seed)
```

### Anti-Flake Measures

1. **Deterministic outputs** - Seeded random, fixed time
2. **Transaction isolation** - `withTransaction()` for DB tests
3. **Handler reset** - MSW resets after each test
4. **Temp cleanup** - Auto-cleanup temp directories
5. **Mock registry** - Singleton pattern prevents conflicts

## 🎯 MPPP-Specific Testing Patterns

### Sequential Processing Validation

The MPPP architecture requires **sequential processing** with no outbox pattern. TestKit provides tools to validate these constraints:

```typescript
import { useFakeTimers, setSystemTime } from "@orchestr8/testkit/env"
import { createMemoryUrl, withTransaction } from "@orchestr8/testkit/sqlite"

// Test that operations are truly sequential (no concurrent writes)
useFakeTimers()
const db = new Database(createMemoryUrl())

// Validate no outbox table exists
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
expect(tables.find((t) => t.name.includes("outbox"))).toBeUndefined()

// Test sequential staging writes
await withTransaction(db, async (tx) => {
  const before = Date.now()
  tx.prepare("INSERT INTO staging (id, data) VALUES (?, ?)").run("1", "data1")
  const after = Date.now()
  expect(after - before).toBeLessThan(100) // Fast synchronous write
})
```

### No-Outbox Architecture Testing

```typescript
// Verify direct-to-Obsidian pattern (no intermediate queues)
const obsidianPath = await createTempDirectory({ prefix: "vault-" })

// Mock the file system watcher to verify writes are immediate
const writes: string[] = []
watchFileChanges(obsidianPath.path, (filename) => {
  writes.push(filename)
})

// Execute capture → staging → Obsidian flow
await captureVoice({ file: "test.m4a" })
await exportToObsidian({ id: "1" })

// Verify single-pass write (no queuing)
expect(writes).toHaveLength(1)
expect(writes[0]).toMatch(/inbox\/\d{8}-.*\.md/)
```

### Deduplication Window Testing

```typescript
// Test 5-minute deduplication window with controlled time
const DEDUP_WINDOW_MS = 5 * 60 * 1000

setSystemTime("2024-01-01T10:00:00Z")
const hash = "abc123"

db.prepare("INSERT INTO staging (hash, created_at) VALUES (?, ?)").run(
  hash,
  Date.now()
)

// Attempt duplicate within window
const duplicate1 = await attemptCapture({ hash })
expect(duplicate1.status).toBe("duplicate")

// Advance past dedup window
advanceTimersByTime(DEDUP_WINDOW_MS + 1000)

// Duplicate after window should succeed
const duplicate2 = await attemptCapture({ hash })
expect(duplicate2.status).toBe("captured")
```

### iCloud Polling Without Watchers

```typescript
// Test polling-based file discovery (no fs.watch in MPPP scope)
import { quickMocks } from "@orchestr8/testkit/cli"

quickMocks.batch([
  { command: "ls", output: "file1.m4a\nfile2.m4a\n", exitCode: 0 },
  { command: "brctl download", output: "Downloaded file1.m4a", exitCode: 0 },
])

const poller = new VoiceFilePoller({ interval: 1000 })
await poller.tick() // Single poll cycle

expect(poller.discoveredFiles).toEqual(["file1.m4a", "file2.m4a"])
```

## 📋 Common Recipes

### Recipe: Testing with Gmail API Mock

```typescript
import { setupMSW, createDelayedResponse } from "@orchestr8/testkit/msw"

setupMSW([
  http.post("https://oauth2.googleapis.com/token", () => ({
    access_token: "mock-token",
    expires_in: 3600,
  })),
  http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", () =>
    createDelayedResponse({ messages: [] }, 100)
  ),
])
```

### Recipe: ADHD-Friendly Capture Testing

```typescript
const db = new Database(createMemoryUrl())
applyTestPragmas(db)

// Control time for deduplication window
setSystemTime("2024-01-01T10:00:00Z")
db.prepare("INSERT INTO captures (hash, created_at) VALUES (?, ?)").run(
  hash,
  Date.now()
)

// Advance past dedup window
advanceTimersByTime(5 * 60 * 1000) // 5 minutes
```

### Recipe: CLI Command Testing

```typescript
quickMocks.batch([
  { command: "npm install", output: "installed", exitCode: 0 },
  { command: "npm test", output: "tests passed", exitCode: 0 },
  { command: "npm build", output: "built", exitCode: 0 },
])

// All child_process methods work
const result = execSync("npm install") // Returns 'installed'
```

## 🚨 Important Notes for AI Agents

### Package Philosophy (Updated with Lean Core)

- **Lean core principle** - Main export contains only essential utilities
- **Lazy loading** - Optional features load only when explicitly imported
- **No dependency bloat** - Core utilities work without optional dependencies
- **Subpath exports** - Optional features accessed via domain-specific paths
- **Domain isolation** - Each domain is independent
- **Tree-shakable** - Only import what you need
- **Module resolution fixed** - Works correctly with vitest/vite/pnpm

### Maturity Guidance

- ✅ **Stable**: Use freely (MSW, SQLite, FS, CLI, Env, Utils)
- 🔶 **Beta**: Test thoroughly (Containers, Convex)
- 🚧 **Alpha**: Not available (ChromaDB, Network Guard)

### MPPP Architecture Alignment

TestKit directly supports MPPP constraints:

1. **Sequential Processing**: Transaction isolation (`withTransaction`) validates no concurrent writes
2. **No Outbox Pattern**: Schema validation helpers detect forbidden queue tables
3. **Polling Over Watching**: CLI mocks support polling-based file discovery tests
4. **Deterministic Dedup**: Time control (`setSystemTime`, `advanceTimersByTime`) validates 5-minute dedup windows
5. **Direct File Writes**: Temp directory helpers validate single-pass Obsidian writes

### YAGNI Deferrals

Per Master PRD v2.3.0-MPPP scope reduction:

- ChromaDB mocking - Deferred to Phase 3+ (RAG/semantic search)
- Network deny guard - Optional safety net (low priority)
- Policy metrics - Deferred monitoring infrastructure
- Convex testing - Not applicable to MPPP (SQLite-only architecture)
- Container testing - Only if integration tests require external services

### Testing Best Practices

1. Use memory DBs for unit tests (fast)
2. Use file DBs for integration tests (realistic)
3. Reset MSW handlers after each test
4. Control time and randomness for determinism
5. Clean up resources (temp dirs, containers)
6. **MPPP-Specific**: Always validate no outbox tables in schema tests
7. **MPPP-Specific**: Use transaction isolation to prove sequential writes

## 🔗 Quick Reference

```typescript
// Core utilities from main export (always available, no optional deps)
import {
  delay,
  retry,              // Requires both maxAttempts AND delayMs parameters
  withTimeout,        // Error format: "Timeout after {ms}ms"
  createMockFn        // Returns basic function, not vitest spy
} from "@orchestr8/testkit"

// Optional features from sub-exports (lazy loaded)
// Note: MSW currently has build issues - use native MSW imports for now
import { setupServer } from 'msw/node';  // Use this instead of @orchestr8/testkit/msw
import { http, HttpResponse } from 'msw';

import { createMemoryUrl, createFileDatabase, applyTestPragmas } from "@orchestr8/testkit/sqlite"
import { quickMocks, processHelpers } from "@orchestr8/testkit/cli"
import { createTempDirectory } from "@orchestr8/testkit/fs"  // useTempDirectory not exported
import { useFakeTimers, controlRandomness, setSystemTime, getTestEnvironment, setupTestEnv } from "@orchestr8/testkit/env"
import { createTestFixture } from "@orchestr8/testkit/utils"
import { createVitestBaseConfig } from "@orchestr8/testkit/config/vitest"  // Note: function name is swapped
```

## 🔒 Security Validation

```typescript
import {
  validateCommand,
  sanitizeCommand,
  validatePath,
  sanitizeSqlIdentifier,
  escapeShellArg,
  validateShellExecution
} from "@orchestr8/testkit"

// Command injection prevention
validateCommand('echo hello') // ✅ Safe
validateCommand('rm -rf /') // ❌ Throws SecurityValidationError

// Path traversal protection
const safePath = validatePath('/tmp/test', 'file.txt') // ✅
validatePath('/tmp/test', '../../../etc/passwd') // ❌ Throws

// SQL injection prevention
const tableName = sanitizeSqlIdentifier('user_table') // ✅

// Shell argument escaping
const escaped = escapeShellArg('hello world; rm -rf /')
// Returns: "'hello world; rm -rf /'"
```

## 📊 Resource Management

```typescript
import {
  registerResource,
  cleanupAllResources,
  getResourceStats,
  detectResourceLeaks,
  ResourceCategory,
  ResourcePriority
} from "@orchestr8/testkit"

// Register resources for automatic cleanup
registerResource('db-connection', () => db.close(), {
  category: ResourceCategory.DATABASE,
  priority: ResourcePriority.CRITICAL
})

// Get statistics
const stats = getResourceStats()
console.log(`Active: ${stats.active}, Total: ${stats.total}`)

// Detect leaks
const leaks = detectResourceLeaks()

// Clean up all resources
await cleanupAllResources({ timeout: 10000 })
```

## 🔄 Concurrency Control

```typescript
import {
  limitConcurrency,
  limitedPromiseAll,
  ConcurrencyManager,
  databaseOperationsManager
} from "@orchestr8/testkit"

// Limit concurrent operations
const tasks = Array.from({ length: 10 }, (_, i) =>
  limitConcurrency(() => processItem(i), 3)
)
await Promise.all(tasks) // Only 3 running at once

// Batch processing with limits
const results = await limitedPromiseAll(promises, { maxConcurrent: 5 })

// Predefined managers
await databaseOperationsManager.execute(() => db.query('SELECT * FROM users'))
```

## 🕐 Enhanced Environment Control

```typescript
import {
  useFakeTime,
  controlRandomness,
  quickRandom,
  quickCrypto
} from "@orchestr8/testkit/env"

// Time control
const timeController = useFakeTime(new Date('2023-01-01'))
timeController.advance(1000 * 60 * 60) // Advance 1 hour
timeController.restore()

// Deterministic randomness
const randomController = controlRandomness(12345)
expect(Math.random()).toBe(0.123456789)
randomController.restore()

// Quick random helpers
const restore = quickRandom.sequence([0.1, 0.5, 0.9])
expect(Math.random()).toBe(0.1)
restore()

// Quick crypto mocking
const cryptoRestore = quickCrypto.uuid([
  '550e8400-e29b-41d4-a716-446655440000'
])
expect(crypto.randomUUID()).toBe('550e8400-e29b-41d4-a716-446655440000')
cryptoRestore()
```

## 💾 SQLite Connection Pooling

```typescript
import {
  createSQLitePool,
  createMemoryUrl,
  withSQLiteTransaction,
  migrateDatabase,
  applyRecommendedPragmas
} from "@orchestr8/testkit/sqlite"
import { betterSqliteAdapter } from "@orchestr8/testkit/sqlite/adapters"

// Connection pooling
const pool = createSQLitePool({
  databaseUrl: createMemoryUrl('raw'),
  maxConnections: 5,
  idleTimeoutMs: 30000
})

await pool.withConnection(async (db) => {
  const result = await db.prepare('SELECT 1 as test').get()
  expect(result.test).toBe(1)
})

// Transactions with adapters
await withSQLiteTransaction(db, betterSqliteAdapter, async (tx) => {
  tx.run('INSERT INTO users (name) VALUES (?)', 'Alice')
})

// Migrations
await migrateDatabase(db, './migrations')

// Recommended pragmas
await applyRecommendedPragmas(db, {
  journalMode: 'WAL',
  foreignKeys: true,
  busyTimeoutMs: 5000
})
```

## 🌐 MSW v2 API

```typescript
import { http, HttpResponse } from '@orchestr8/testkit/msw'

// Define handlers using MSW v2 API
http.get('/api/users', () => HttpResponse.json([
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' }
]))
```

## 📝 Naming Conventions

TestKit follows consistent naming patterns:

- **`create*`** - Factory functions returning new instances
  - `createTempDirectory()`, `createSQLitePool()`, `createConvexTestHarness()`

- **`setup*`** - One-time initialization with side effects
  - `setupMSW()`, `setupTestEnv()`, `setupCryptoControl()`

- **`use*`** - Hook-style functions for test lifecycle
  - `useTempDirectory()`, `useFakeTime()`, `usePrismaTestDatabase()`

- **`with*`** - Scoped operations with automatic cleanup
  - `withTempDirectoryScope()`, `withSQLiteTransaction()`, `withFakeTimers()`

- **`get*`** - Pure getter functions without side effects
  - `getTestEnvironment()`, `getResourceStats()`, `getMSWServer()`

## Related Documentation

**PRDs (Product Requirements):**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System-wide testing requirements
- [Monorepo Foundation PRD](../cross-cutting/prd-foundation-monorepo.md) - Monorepo testing infrastructure

**Cross-Cutting Specifications:**

- [Monorepo Technical Spec](../cross-cutting/spec-foundation-monorepo-tech.md) - Test infrastructure architecture
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Capture testing patterns
- [Staging Ledger Test Spec](../features/staging-ledger/spec-staging-test.md) - Database testing patterns
- [Obsidian Bridge Test Spec](../features/obsidian-bridge/spec-obsidian-test.md) - File system testing patterns
- [CLI Test Spec](../features/cli/spec-cli-test.md) - CLI testing patterns

**Guides (How-To):**

- [TestKit Standardization Guide](./guide-testkit-standardization.md) - Mandatory patterns for TestKit usage
- [TDD Applicability Guide](./guide-tdd-applicability.md) - When to apply TDD with TestKit
- [Test Strategy Guide](./guide-test-strategy.md) - Overall testing approach
- [Phase 1 Testing Patterns](./guide-phase1-testing-patterns.md) - MPPP-specific testing patterns
- [Error Recovery Guide](./guide-error-recovery.md) - Testing error scenarios
- [Fault Injection Registry](./guide-fault-injection-registry.md) - Using TestKit for fault injection
- [Crash Matrix Test Plan](./guide-crash-matrix-test-plan.md) - Advanced TestKit patterns

**ADRs (Architecture Decisions):**

- [ADR-0012: TDD Required for High-Risk Paths](../adr/0012-tdd-required-high-risk.md) - When TestKit is mandatory
- [ADR-0007: Sequential Processing Model](../adr/0007-sequential-processing-model.md) - Testing sequential constraints
- [ADR-0001: Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md) - Testing file handling

**External Resources:**

- [Vitest Documentation](https://vitest.dev/) - Test runner
- [MSW Documentation](https://mswjs.io/) - API mocking
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3/wiki) - SQLite driver

## Maintenance Notes

**When to Update:**

- New TestKit domains added (e.g., ChromaDB mocking in Phase 3+)
- MPPP architecture changes (sequential processing, dedup windows)
- Vitest or MSW major version updates
- New testing patterns discovered in implementation

**Known Limitations:**

- Container domain is beta quality (use with caution)
- Convex domain not applicable to MPPP architecture
- ChromaDB mocking deferred to Phase 3+ (RAG/semantic search)
- Network deny guard not implemented (optional safety net)

**Gaps:**

- E2E testing patterns (deferred to Phase 2+)
- Performance testing patterns (deferred to Phase 2+)
- Visual regression testing (not in MPPP scope)
- Multi-device coordination testing (Phase 5+)

---

_The test kit thinks faster than your ADHD brain switches tabs—and that's measured in microseconds. Use it wisely, test early, and keep your capture ingestion pipeline bulletproof._
