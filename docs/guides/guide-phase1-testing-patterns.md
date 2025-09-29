---
title: Phase 1 Testing Patterns Guide
status: living
owner: Nathan
version: 1.1.0
date: 2025-09-27
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Phase 1 Testing Patterns Guide

> Simple isolation patterns for MVP using TestKit alone - no test coordinator needed

## Purpose

This guide helps developers write fast, isolated tests for Phase 1 features using TestKit alone. It demonstrates why test coordinator infrastructure is unnecessary for MVP scope and provides practical patterns for unit and light integration testing.

**Target audience:** Developers implementing Phase 1 features (voice capture, email capture, staging ledger, CLI, Obsidian bridge).

## When to Use This Guide

Use this guide when:

- Writing unit tests with in-memory SQLite databases
- Setting up light integration tests with MSW API mocks
- Testing Phase 1 features that don't require port binding
- Questioning whether you need test coordinator infrastructure

**Phase 1 scope:**

- Unit tests with in-memory SQLite (`:memory:`)
- Light integration tests with MSW API mocks
- No port binding (no running servers in tests)
- No file-based database performance tests

## Prerequisites

**Required knowledge:**

- Basic Vitest test structure
- SQLite database concepts
- HTTP mocking fundamentals

**Required tools:**

- TestKit installed (`@orchestr8/testkit`)
- Vitest configured in your package

**Related documentation:**

- [TestKit Tech Spec](../cross-cutting/../guides/guide-testkit-usage.md) - TestKit capabilities
- [Test Strategy Guide](./test-strategy.md) - Overall testing approach
- [TDD Applicability Framework](./tdd-applicability.md) - When to write tests first

## Quick Reference

**TestKit provides sufficient isolation for Phase 1:**

- ✅ Automatic database isolation (each `:memory:` is separate)
- ✅ MSW lifecycle management (`setupMSW()` auto-cleans)
- ✅ Process mocking via `register.ts`
- ✅ Temp directory utilities

**Key patterns:**

```typescript
// In-memory database
const db = new Database(createMemoryUrl())

// MSW mocking
setupMSW([http.post('http://...', () => ...)])

// Process mocking
quickMocks.success('git status', 'clean')
```

**When you'll need test coordinator (Phase 2-3):**

- Integration tests binding to ports
- File-based database performance tests
- Resource leak detection

## Step-by-Step Instructions

### Step 1: Configure Package Test Setup

Set up Vitest configuration to use TestKit's register hook:

```typescript
// packages/@adhd-brain/staging-ledger/vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["@orchestr8/testkit/register"],
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false, // Allow parallel execution
        isolate: true, // Each test file isolated
      },
    },
  },
})
```

**Expected outcome:** Vitest automatically loads TestKit's isolation mechanisms before each test file runs.

### Step 2: Create In-Memory Database Tests

Use TestKit's SQLite utilities for isolated database testing:

```typescript
// packages/@adhd-brain/staging-ledger/tests/deduplication.test.ts
import Database from "better-sqlite3"
import { createMemoryUrl, applyTestPragmas } from "@orchestr8/testkit/sqlite"

describe("Deduplication", () => {
  let db: Database

  beforeEach(() => {
    // Each test gets its own isolated :memory: database
    db = new Database(createMemoryUrl())
    applyTestPragmas(db)

    // Apply schema
    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        content_hash TEXT UNIQUE,
        raw_content TEXT
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  test("prevents duplicate captures by hash", () => {
    // First insert succeeds
    db.prepare(
      "INSERT INTO captures (id, content_hash, raw_content) VALUES (?, ?, ?)"
    ).run("1", "abc123", "test content")

    // Second insert with same hash fails
    expect(() => {
      db.prepare(
        "INSERT INTO captures (id, content_hash, raw_content) VALUES (?, ?, ?)"
      ).run("2", "abc123", "test content")
    }).toThrow(/UNIQUE constraint/)
  })
})
```

**Why this works:**

- Each `beforeEach` creates a NEW `:memory:` database
- Even if tests run in parallel, each has its own memory space
- No collisions possible

**Expected outcome:** Tests run in parallel without database locking issues.

### Step 3: Set Up MSW API Mocking

Use TestKit's MSW utilities for HTTP mocking with automatic cleanup:

```typescript
// packages/@adhd-brain/voice-poller/tests/whisper.test.ts
import { setupMSW, http, createDelayedResponse } from "@orchestr8/testkit/msw"

// TestKit's setupMSW handles cleanup automatically
setupMSW([
  http.post("http://localhost:11434/api/generate", () =>
    createDelayedResponse({ text: "Mock transcription" }, 100)
  ),
])

describe("Whisper Integration", () => {
  test("transcribes voice memo", async () => {
    const result = await whisperClient.transcribe("test.m4a")

    expect(result.text).toBe("Mock transcription")
  })
})
```

**Why this works:**

- `setupMSW()` registers Vitest lifecycle hooks
- Handlers cleaned up automatically after each test
- No manual reset needed

**Expected outcome:** API calls are intercepted and mocked without external service dependencies.

### Step 4: Implement Process Mocking

Use TestKit's CLI mocking for shell command tests:

```typescript
// packages/@adhd-brain/cli/tests/capture.test.ts
import { quickMocks } from "@orchestr8/testkit/cli"
import { execSync } from "child_process"

describe("CLI Capture", () => {
  beforeEach(() => {
    // Mock git commands
    quickMocks.success("git status", "nothing to commit")
    quickMocks.success("git add", "")
  })

  test("stages file before capture", () => {
    const result = execSync("git status")
    expect(result.toString()).toBe("nothing to commit")
  })
})
```

**Why this works:**

- TestKit's CLI mocks use singleton registry
- Each test file gets isolated mock state
- Vitest's thread pool provides isolation

**Expected outcome:** Shell commands are mocked without executing actual processes.

### Step 5: Create Cross-Package Test Utilities

Share common test setup code across packages:

```typescript
// packages/@adhd-brain/test-utils/src/fixtures.ts
import Database from "better-sqlite3"
import { createMemoryUrl } from "@orchestr8/testkit/sqlite"

export function createTestDB() {
  const db = new Database(createMemoryUrl())

  // Apply common schema
  db.exec(`
    CREATE TABLE captures (
      id TEXT PRIMARY KEY,
      content_hash TEXT UNIQUE,
      raw_content TEXT,
      status TEXT
    )
  `)

  return db
}

export function seedCaptures(db: Database, count: number) {
  const stmt = db.prepare(
    "INSERT INTO captures (id, content_hash, raw_content, status) VALUES (?, ?, ?, ?)"
  )

  for (let i = 0; i < count; i++) {
    stmt.run(`cap-${i}`, `hash-${i}`, `content-${i}`, "STAGED")
  }
}
```

**Usage in tests:**

```typescript
// packages/@adhd-brain/capture-service/tests/staging.test.ts
import { createTestDB, seedCaptures } from "@adhd-brain/test-utils"

describe("Capture Service", () => {
  test("processes staged captures", () => {
    const db = createTestDB()
    seedCaptures(db, 10)

    const staged = db
      .prepare("SELECT * FROM captures WHERE status = ?")
      .all("STAGED")
    expect(staged).toHaveLength(10)
  })
})
```

**Expected outcome:** Consistent test setup across packages without code duplication.

## Common Patterns

### Pattern: In-Memory Database Isolation

**Use case:** Testing database operations without file I/O or locking.

```typescript
// Each test gets its own isolated :memory: database
const db = new Database(createMemoryUrl())
applyTestPragmas(db)

// Apply schema
db.exec(SCHEMA_SQL)

// Run tests
// ...

// Clean up
db.close()
```

**Why it's safe for parallel execution:**

- Each `:memory:` database lives in separate process memory
- No file system collisions
- No locking issues

### Pattern: MSW Handler Registration

**Use case:** Mocking external HTTP APIs without network calls.

```typescript
setupMSW([
  http.post("http://localhost:11434/api/generate", () =>
    createDelayedResponse({ text: "Mock transcription" }, 100)
  ),
])
```

**Best practices:**

- Register handlers at test file scope
- Use `createDelayedResponse()` to simulate network latency
- TestKit automatically cleans up between tests

### Pattern: Parallel Execution Safety

**Why tests don't collide in Phase 1:**

**In-memory databases:**

```typescript
// Test A (package staging-ledger)
const db1 = new Database(":memory:") // Memory space 1

// Test B (package capture-service, runs in parallel)
const db2 = new Database(":memory:") // Memory space 2

// ✅ NO COLLISION - Separate memory spaces
```

**MSW handlers:**

```typescript
// Test A (package voice-poller)
setupMSW([...])  // Handlers registered

// Test B (package email-poller, runs in parallel)
setupMSW([...])  // Handlers registered

// ✅ NO COLLISION - TestKit's setupMSW manages lifecycle per test file
```

**Process mocks:**

```typescript
// Test A (package cli)
quickMocks.success("git status", "clean")

// Test B (package workers, runs in parallel)
quickMocks.success("npm install", "installed")

// ✅ NO COLLISION - TestKit's singleton registry scoped per test file
```

### Anti-Patterns to Avoid

**❌ Don't bind to ports in tests:**

```typescript
// This will cause collisions in parallel execution
const server = app.listen(3001) // Multiple tests bind same port
```

**❌ Don't use file-based databases:**

```typescript
// This will cause file locks without coordinator
const db = new Database("./test.db") // Multiple tests use same file
```

**❌ Don't share state between test files:**

```typescript
// Global state causes unpredictable test behavior
let sharedDB: Database // Shared across test files
```

**❌ Don't use `shared` SQLite cache mode:**

```typescript
// This breaks isolation between tests
const db = new Database(":memory:", { cache: "shared" })
```

**❌ Don't skip cleanup:**

```typescript
// Forgetting cleanup causes resource leaks
test("example", () => {
  const db = new Database(":memory:")
  // ❌ Missing db.close() in afterEach
})
```

## Troubleshooting

### "Database is locked" error

**Symptom:**

```
SQLITE_BUSY: database is locked
```

**Cause:** Multiple connections to same database file

**Solution:** Use `:memory:` databases for tests, not files

```typescript
// ✅ Correct - use memory
const db = new Database(createMemoryUrl())

// ❌ Wrong - uses file
const db = new Database("./test.db")
```

### MSW handlers not working

**Symptom:**

```
Request not matched by any handler
```

**Cause:** Forgot to call `setupMSW()`

**Solution:** Import and call `setupMSW([...])` at test file scope

```typescript
import { setupMSW, http } from '@orchestr8/testkit/msw'

// ✅ Call at file scope (before describe blocks)
setupMSW([
  http.post('http://...', () => ...)
])

describe('Tests', () => {
  // ...
})
```

### Tests fail randomly in CI

**Symptom:**

```
Tests pass locally but fail in GitHub Actions
```

**Cause:** Improper cleanup or shared state

**Solution:**

- Ensure all databases closed in `afterEach`
- Check MSW handlers are reset
- Verify no global state mutations

```typescript
describe("Example", () => {
  let db: Database

  beforeEach(() => {
    db = new Database(createMemoryUrl())
  })

  afterEach(() => {
    // ✅ Always close resources
    db.close()
  })
})
```

## Examples

### Real-World Example: Staging Ledger Tests

```typescript
// packages/@adhd-brain/staging-ledger/tests/deduplication.test.ts
import Database from "better-sqlite3"
import { createMemoryUrl, applyTestPragmas } from "@orchestr8/testkit/sqlite"

describe("Deduplication", () => {
  let db: Database

  beforeEach(() => {
    db = new Database(createMemoryUrl())
    applyTestPragmas(db)
    db.exec(STAGING_SCHEMA)
  })

  afterEach(() => {
    db.close()
  })

  test("prevents duplicate captures by hash", () => {
    // Test implementation...
  })
})
```

### Real-World Example: Voice Poller Integration Tests

```typescript
// packages/@adhd-brain/voice-poller/tests/whisper.test.ts
import { setupMSW, http, createDelayedResponse } from "@orchestr8/testkit/msw"

setupMSW([
  http.post("http://localhost:11434/api/generate", () =>
    createDelayedResponse({ text: "Mock transcription" }, 100)
  ),
])

describe("Whisper Integration", () => {
  test("transcribes voice memo", async () => {
    // Test implementation...
  })
})
```

### Real-World Example: CLI Tests

```typescript
// packages/@adhd-brain/cli/tests/capture.test.ts
import { quickMocks } from "@orchestr8/testkit/cli"

describe("CLI Capture", () => {
  beforeEach(() => {
    quickMocks.success("git status", "nothing to commit")
    quickMocks.success("git add", "")
  })

  test("stages file before capture", () => {
    // Test implementation...
  })
})
```

## Related Documentation

**Core specifications:**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Phase 1 scope and success criteria
- [Roadmap v2.0-MPPP](../master/roadmap.md) - Phase 1 delivery slices
- [TestKit Tech Spec](../cross-cutting/../guides/guide-testkit-usage.md) - TestKit capabilities

**Testing strategy:**

- [Test Strategy Guide](./test-strategy.md) - Overall testing approach
- [TDD Applicability Framework](./tdd-applicability.md) - When to write tests first
- [TestKit Usage Guide](./guide-testkit-usage.md) - Complete TestKit API reference and patterns

**Feature-specific specs:**

- [Capture Test Spec](../features/capture/spec-capture-test.md)
- [Staging Ledger Test Spec](../features/staging-ledger/spec-staging-test.md)
- [CLI Test Spec](../features/cli/spec-cli-test.md)
- [Obsidian Bridge Test Spec](../features/obsidian-bridge/spec-obsidian-test.md)

## Maintenance Notes

### When to Update This Guide

Update this guide when:

- TestKit API changes (new utilities or deprecations)
- Phase 1 scope expands to include port binding or file-based tests
- New test patterns emerge during Phase 1 implementation
- CI/CD reveals common test failures requiring pattern adjustments

### When Test Coordinator Becomes Necessary (Phase 2-3)

Test coordinator will be needed when Phase 1 graduates to Phase 2-3 and requires:

**1. Port binding in integration tests:**

```typescript
// ❌ This will cause collisions without coordinator
const server = app.listen(3001) // Multiple tests bind same port
```

**Solution with coordinator:**

```typescript
const port = coordinator.allocatePort("voice-poller") // Gets unique port
const server = app.listen(port)
```

**2. File-based database performance tests:**

```typescript
// ❌ This will cause file locks without coordinator
const db = new Database("./test.db") // Multiple tests use same file
```

**Solution with coordinator:**

```typescript
const dbPath = coordinator.getPackageDBPath("staging-ledger")
const db = new Database(dbPath) // Scoped per package
```

**3. Long-running worker tests:**

```typescript
// ❌ Need resource leak detection
const poller = new VoicePoller()
await poller.start()
// Forgot to stop() → leaks into next test
```

**Solution with coordinator:**

```typescript
afterAll(async () => {
  const report = coordinator.checkResourceLeaks()
  if (report.hasLeaks) throw new Error("Leaks detected")
})
```

### Known Limitations

**Current limitations for Phase 1:**

- Cannot test port binding without test coordinator
- Cannot run file-based database performance tests
- No resource leak detection for long-running workers

**Acceptable for Phase 1 because:**

- MVP doesn't require running servers in tests
- Performance testing deferred to Phase 2-3
- Worker tests use in-memory resources only

---

**Summary: Phase 1 testing is simple**

1. Use TestKit's `createMemoryUrl()` for databases
2. Use TestKit's `setupMSW()` for API mocks
3. Let Vitest's thread pool provide isolation
4. Close resources in `afterEach`

**No test coordinator needed until:**

- Integration tests bind to ports
- Performance tests need file-based DBs
- Resource leak detection required

For MVP (voice + email capture with staging ledger), TestKit isolation is sufficient. Focus on writing tests, not coordination infrastructure.

_Testing should be fast and simple, just like capturing a thought before your ADHD brain switches tabs._
