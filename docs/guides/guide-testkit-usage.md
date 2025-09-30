---
title: TestKit Developer Guide
doc_type: guide
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-28
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# TestKit Developer Guide

> **Complete NPM package reference for `@orchestr8/testkit` - An AI agent's guide to understanding and using the test kit features with lean core implementation**
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

**Package Name:** `@orchestr8/testkit` (formerly `@template/testkit`)
**Purpose:** Comprehensive testing utilities for monorepo projects
**Architecture:** Lean core with optional domain-based subpath exports
**Philosophy:** Test isolation, deterministic behavior, ADHD-friendly patterns

### 🎯 Lean Core Implementation (Fixed as of v1.1.0+)

The package now uses a **lean core approach**:
- **Main export** (`@orchestr8/testkit`) contains ONLY core utilities
- **Sub-exports** provide optional features via lazy loading
- **No dependency bloat** - Only loads what you explicitly use
- **Fixed module resolution** - Works with vitest/vite/pnpm

## 🚀 Installation & Import

```bash
pnpm add -D @orchestr8/testkit
```

### Core Utilities (No Optional Dependencies Required)

```typescript
// Import core utilities from main export - always available
import {
  delay,           // Promise-based delay
  createMockFn,    // Basic mock function
  retry,           // Retry with backoff
  withTimeout      // Timeout wrapper
} from "@orchestr8/testkit"
```

### Optional Features (Via Sub-Exports)

```typescript
// Import optional features from domain-specific subpaths
// These load lazily - only when you explicitly import them
import { setupMSW } from "@orchestr8/testkit/msw"
import { createMemoryUrl } from "@orchestr8/testkit/sqlite"
import { useFakeTimers } from "@orchestr8/testkit/env"
import { createTempDirectory } from "@orchestr8/testkit/fs"
import { quickMocks } from "@orchestr8/testkit/cli"
import { createConvexTestHarness } from "@orchestr8/testkit/convex"
import { createTestFixture } from "@orchestr8/testkit/utils"
import { createBaseVitestConfig } from "@orchestr8/testkit/config/vitest"
```

## 🎯 Core Domains & Features

### 1. **MSW Domain** (Mock Service Worker)

**Purpose:** API mocking for unit/integration tests
**Maturity:** ✅ Stable (Production Ready)

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
- `createFileDatabase(name?, options?)` - File-based DB with cleanup
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

#### Temp Directory Creation

- `createTempDirectory(options?)` - Create temp dir with manual cleanup
- `useTempDirectory(fn)` - Auto-cleanup temp dir in callback
- `createManagedTempDirectory(options?)` - Suite-managed temp dir
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

- `createBaseVitestConfig(overrides?)` - Base Vitest config
- `createWorkspaceConfig(projects)` - Workspace config
- `detectEnvironment()` - Environment detection
- `getTestTimeouts()` - Timeout configuration

### 9. **Utils Domain**

**Purpose:** General testing utilities
**Maturity:** ✅ Stable

- `delay(ms)` - Promise-based delay
- `retry(fn, maxAttempts?, delayMs?)` - Retry with backoff
- `withTimeout(promise, timeoutMs)` - Timeout wrapper
- `createMockFn(implementation?)` - Basic mock function

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
  retry,
  withTimeout,
  createMockFn
} from "@orchestr8/testkit"

// Optional features from sub-exports (lazy loaded)
import { setupMSW, createSuccessResponse, http } from "@orchestr8/testkit/msw"
import { createMemoryUrl, createFileDatabase, applyTestPragmas } from "@orchestr8/testkit/sqlite"
import { quickMocks, processHelpers } from "@orchestr8/testkit/cli"
import { createTempDirectory, useTempDirectory } from "@orchestr8/testkit/fs"
import { useFakeTimers, controlRandomness, setSystemTime } from "@orchestr8/testkit/env"
import { createTestFixture } from "@orchestr8/testkit/utils"
import { createBaseVitestConfig } from "@orchestr8/testkit/config/vitest"
```

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
