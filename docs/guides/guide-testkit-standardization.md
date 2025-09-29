---
title: TestKit Standardization Guide
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
---

# TestKit Standardization Guide

## Purpose

This guide establishes mandatory patterns for using TestKit across all packages, eliminating custom mock implementations and ensuring consistent test practices. It addresses anti-patterns found in capture and obsidian-bridge specifications, providing migration paths to standardized TestKit usage.

**Target audience:** All developers writing tests in the ADHD Brain monorepo.

**Key goal:** Replace ALL custom mock implementations with TestKit patterns to maintain test reliability, reduce duplication, and enforce consistent behavior across packages.

## When to Use This Guide

Use this guide when:

- Writing new tests for any package
- Migrating existing tests that use custom mocks
- Setting up shared test fixtures
- Reviewing code that contains test-related anti-patterns
- Implementing test helpers that might be reusable

**Mandatory application:**

- All new test files MUST follow TestKit patterns
- All custom mock implementations MUST be migrated to TestKit
- All shared fixtures MUST live in `packages/testkit/fixtures/`
- All test helpers MUST live in `packages/testkit/helpers/`

## Prerequisites

**Required knowledge:**

- Basic Vitest test structure
- Understanding of mocking concepts
- TestKit API familiarity (see [TestKit Usage Guide](./guide-testkit-usage.md))

**Required tools:**

- TestKit installed (`@template/testkit`)
- Vitest configured in your package
- Access to monorepo shared packages

**Related documentation:**

- [TestKit Usage Guide](./guide-testkit-usage.md) - Complete API reference
- [Test Strategy Guide](./guide-test-strategy.md) - Overall testing approach
- [Phase 1 Testing Patterns](./guide-phase1-testing-patterns.md) - Basic patterns for MVP

## Quick Reference

### TestKit Standardization Rules

**✅ REQUIRED: Use TestKit for ALL mocking**

```typescript
// Database mocking
const db = new Database(createMemoryUrl())

// File system mocking
const tempDir = await createTempDirectory()

// HTTP mocking
setupMSW([http.post('...', () => ...)])

// CLI mocking
quickMocks.success('git status', 'clean')

// Logger mocking
const logger = createMockLogger()
```

**❌ FORBIDDEN: Custom mock implementations**

```typescript
// Custom database mocks
const mockDB = { query: vi.fn(), ... }

// Custom file system mocks
const mockFS = { writeFile: vi.fn(), ... }

// Custom HTTP mocks
vi.mock('axios')

// Custom CLI mocks
vi.mock('child_process')

// Custom logger mocks
const mockLogger = { log: vi.fn(), ... }
```

### Fixture and Helper Organization

**Shared fixtures:**

```
packages/testkit/fixtures/
├── golden-captures.json
├── sample-emails.json
├── mock-audio-files/
└── test-schemas/
```

**Test helpers:**

```
packages/testkit/helpers/
├── database-helpers.ts
├── file-helpers.ts
├── assertion-helpers.ts
└── fixture-loaders.ts
```

## Step-by-Step Instructions

### Step 1: Audit Current Test Files

Identify anti-patterns in your package's test files:

```bash
# Search for custom mock patterns
grep -r "vi.mock" packages/your-package/tests/
grep -r "jest.mock" packages/your-package/tests/
grep -r "const mock" packages/your-package/tests/
grep -r "mockImplementation" packages/your-package/tests/
```

**Expected findings:** Custom mock implementations that need migration to TestKit.

### Step 2: Replace Database Mocking

**Before (Custom Anti-Pattern):**

```typescript
// ❌ WRONG: Custom database mock
const mockDB = {
  query: vi.fn(),
  insert: vi.fn(),
  close: vi.fn(),
}

beforeEach(() => {
  mockDB.query.mockReset()
  mockDB.insert.mockReset()
})
```

**After (TestKit Standard):**

```typescript
// ✅ CORRECT: TestKit database
import { createMemoryUrl, applyTestPragmas } from "@template/testkit/sqlite"

let db: Database

beforeEach(() => {
  db = new Database(createMemoryUrl())
  applyTestPragmas(db)
  // Apply schema
  db.exec(SCHEMA_SQL)
})

afterEach(() => {
  db.close()
})
```

**Expected outcome:** Real SQLite behavior with deterministic isolation.

### Step 3: Replace File System Mocking

**Before (Custom Anti-Pattern):**

```typescript
// ❌ WRONG: Custom file system mock
const mockFS = {
  writeFile: vi.fn(),
  readFile: vi.fn(),
  existsSync: vi.fn(),
}

vi.mock("fs", () => mockFS)
```

**After (TestKit Standard):**

```typescript
// ✅ CORRECT: TestKit file system
import { createTempDirectory } from "@template/testkit/fs"

let tempDir: TempDirectory

beforeEach(async () => {
  tempDir = await createTempDirectory({ prefix: "test-" })
})

afterEach(async () => {
  await tempDir.cleanup()
})

test("writes file atomically", async () => {
  await tempDir.writeFile("test.txt", "content")
  const content = await tempDir.readFile("test.txt")
  expect(content).toBe("content")
})
```

**Expected outcome:** Real file system operations with automatic cleanup.

### Step 4: Replace HTTP Mocking

**Before (Custom Anti-Pattern):**

```typescript
// ❌ WRONG: Custom HTTP mock
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}))

const mockedAxios = axios as jest.Mocked<typeof axios>
```

**After (TestKit Standard):**

```typescript
// ✅ CORRECT: TestKit HTTP mocking
import { setupMSW, http, createDelayedResponse } from "@template/testkit/msw"

setupMSW([
  http.post("http://localhost:11434/api/generate", () =>
    createDelayedResponse({ response: "Mock transcription" }, 100)
  ),
])
```

**Expected outcome:** HTTP interception with automatic cleanup and realistic responses.

### Step 5: Replace CLI Mocking

**Before (Custom Anti-Pattern):**

```typescript
// ❌ WRONG: Custom process mock
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}))

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>
mockExecSync.mockReturnValue(Buffer.from("success"))
```

**After (TestKit Standard):**

```typescript
// ✅ CORRECT: TestKit CLI mocking
import { quickMocks } from "@template/testkit/cli"

beforeEach(() => {
  quickMocks.success("git status", "nothing to commit")
  quickMocks.success("npm install", "packages installed")
})

test("executes git commands", () => {
  const result = execSync("git status")
  expect(result.toString()).toBe("nothing to commit")
})
```

**Expected outcome:** Process mocking that works across all child_process methods.

### Step 6: Migrate Fixtures to Shared Location

**Before (Package-Specific Fixtures):**

```
packages/capture/tests/fixtures/
├── sample-audio.json
└── test-emails.json

packages/obsidian-bridge/tests/fixtures/
├── sample-audio.json  # Duplicate!
└── vault-structure.json
```

**After (Shared TestKit Fixtures):**

```
packages/testkit/fixtures/
├── golden-captures.json
├── sample-emails.json
├── vault-structures.json
└── audio-files/
    ├── short-memo.json
    └── long-transcript.json
```

**Migration process:**

```typescript
// 1. Move fixtures to testkit
mv packages/capture/tests/fixtures/* packages/testkit/fixtures/

// 2. Update imports
// Before
import fixtures from '../fixtures/sample-audio.json'

// After
import { loadAudioFixtures } from '@template/testkit/fixtures'
const fixtures = loadAudioFixtures()
```

**Expected outcome:** No fixture duplication, consistent test data across packages.

## Common Patterns

### Pattern: Database Test Setup

```typescript
import {
  createMemoryUrl,
  applyTestPragmas,
  withTransaction,
} from "@template/testkit/sqlite"

describe("Database Operations", () => {
  let db: Database

  beforeEach(() => {
    db = new Database(createMemoryUrl())
    applyTestPragmas(db)

    // Apply your schema
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

  test("atomic operations", async () => {
    await withTransaction(db, async (tx) => {
      tx.prepare(
        "INSERT INTO captures (id, content_hash, raw_content) VALUES (?, ?, ?)"
      ).run("1", "hash1", "content1")

      // Transaction auto-commits or auto-rollbacks
    })
  })
})
```

### Pattern: File System Test Setup

```typescript
import { createTempDirectory, assertFileExists } from "@template/testkit/fs"

describe("File Operations", () => {
  let tempDir: TempDirectory

  beforeEach(async () => {
    tempDir = await createTempDirectory({ prefix: "obsidian-test-" })
  })

  afterEach(async () => {
    await tempDir.cleanup()
  })

  test("atomic file write", async () => {
    const content = "test content"
    await tempDir.writeFile("test.md", content)

    assertFileExists(tempDir.getPath("test.md"))

    const readContent = await tempDir.readFile("test.md")
    expect(readContent).toBe(content)
  })
})
```

### Pattern: HTTP Mocking with MSW

```typescript
import {
  setupMSW,
  http,
  createDelayedResponse,
  createErrorResponse,
} from "@template/testkit/msw"

// Setup at file scope
setupMSW([
  http.post("http://localhost:11434/api/generate", () =>
    createDelayedResponse({ text: "Mock transcription" }, 100)
  ),

  http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", () =>
    createDelayedResponse({ messages: [] }, 50)
  ),
])

describe("API Integration", () => {
  test("handles API responses", async () => {
    const result = await whisperClient.transcribe("audio.m4a")
    expect(result.text).toBe("Mock transcription")
  })
})
```

### Pattern: Shared Test Utilities

**Create reusable helpers:**

```typescript
// packages/testkit/helpers/database-helpers.ts
export function setupStagingLedger(): Database {
  const db = new Database(createMemoryUrl())
  applyTestPragmas(db)

  // Apply staging ledger schema
  db.exec(STAGING_LEDGER_SCHEMA)

  return db
}

export function seedCaptures(db: Database, count: number) {
  const stmt = db.prepare(`
    INSERT INTO captures (id, content_hash, raw_content, status)
    VALUES (?, ?, ?, ?)
  `)

  for (let i = 0; i < count; i++) {
    stmt.run(`cap-${i}`, `hash-${i}`, `content-${i}`, "staged")
  }
}
```

**Use in tests:**

```typescript
import { setupStagingLedger, seedCaptures } from "@template/testkit/helpers"

describe("Staging Ledger", () => {
  let db: Database

  beforeEach(() => {
    db = setupStagingLedger()
    seedCaptures(db, 10)
  })

  afterEach(() => {
    db.close()
  })
})
```

### Anti-Patterns to Avoid

**❌ Don't create custom database mocks:**

```typescript
// This breaks SQLite behavior and constraint testing
const mockDB = {
  prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn() })),
  exec: vi.fn(),
}
```

**❌ Don't duplicate fixtures:**

```typescript
// Don't copy fixtures between packages
// packages/capture/fixtures/audio.json
// packages/obsidian/fixtures/audio.json  // Duplicate!
```

**❌ Don't use package-specific test helpers:**

```typescript
// Don't create helpers in individual packages
// packages/capture/test-utils/helpers.ts
// packages/obsidian/test-utils/helpers.ts  // Duplicate logic!
```

**❌ Don't mock at the wrong level:**

```typescript
// Don't mock low-level APIs when TestKit provides higher-level alternatives
vi.mock("fs/promises") // Use TestKit's createTempDirectory instead
vi.mock("child_process") // Use TestKit's quickMocks instead
```

**❌ Don't skip cleanup:**

```typescript
// Always clean up resources
beforeEach(() => {
  db = setupDatabase()
  // ❌ Missing afterEach cleanup
})
```

## Troubleshooting

### "TestKit mock not working"

**Symptom:**

```
TypeError: Cannot read property 'mockReturnValue' of undefined
```

**Cause:** Trying to use Jest/Vitest mocking syntax on TestKit mocks

**Solution:** Use TestKit's fluent API instead

```typescript
// ❌ Wrong
mockDatabase.query.mockReturnValue([])

// ✅ Correct
const db = new Database(createMemoryUrl())
// Real database behavior, no mocking needed
```

### "File fixtures not found"

**Symptom:**

```
Error: Cannot find module '../fixtures/audio.json'
```

**Cause:** Fixtures not moved to TestKit or incorrect import path

**Solution:** Move to TestKit and use fixture loader

```typescript
// ❌ Wrong
import audio from "../fixtures/audio.json"

// ✅ Correct
import { loadFixture } from "@template/testkit/fixtures"
const audio = loadFixture("audio.json")
```

### "Database locked error"

**Symptom:**

```
SQLITE_BUSY: database is locked
```

**Cause:** Not using TestKit's memory URLs or missing cleanup

**Solution:** Use TestKit patterns consistently

```typescript
// ✅ Each test gets isolated database
const db = new Database(createMemoryUrl())
// Always close in afterEach
afterEach(() => db.close())
```

### "MSW handlers not resetting"

**Symptom:**

```
Handler from previous test affecting current test
```

**Cause:** Not using TestKit's setupMSW for automatic cleanup

**Solution:** Use TestKit's MSW setup

```typescript
// ✅ Automatic cleanup between tests
setupMSW([...handlers])
```

### "Process mocks interfering"

**Symptom:**

```
Mock from one test file affecting another
```

**Cause:** Global process mocking without proper isolation

**Solution:** Use TestKit's quickMocks with proper scoping

```typescript
// ✅ Isolated per test file
beforeEach(() => {
  quickMocks.success("git status", "clean")
})
```

## Migration Guide

### Phase 1: Audit and Identify

**Identify custom mock patterns:**

```bash
# Find all custom mocks
find packages/ -name "*.test.ts" -o -name "*.spec.ts" | xargs grep -l "vi.mock\|jest.mock\|mockImplementation"

# Find fixture duplication
find packages/ -name "fixtures" -type d | xargs -I {} find {} -name "*.json"

# Find custom test helpers
find packages/ -name "*helper*" -o -name "*util*" | grep -E "(test|spec)"
```

### Phase 2: Migrate by Package

**Priority order:**

1. **Staging Ledger** (already good TestKit usage - use as reference)
2. **Capture** (has custom mock anti-patterns)
3. **Obsidian Bridge** (has custom mock anti-patterns)
4. **CLI** (moderate TestKit usage)

### Phase 3: Migrate Each Test File

**For each test file:**

1. **Replace database mocks:**

   ```typescript
   // Before
   const mockDB = { query: vi.fn() }

   // After
   const db = new Database(createMemoryUrl())
   ```

2. **Replace file system mocks:**

   ```typescript
   // Before
   vi.mock("fs")

   // After
   const tempDir = await createTempDirectory()
   ```

3. **Replace HTTP mocks:**

   ```typescript
   // Before
   vi.mock('axios')

   // After
   setupMSW([http.post('...', () => ...)])
   ```

4. **Move fixtures:**

   ```bash
   # Move to shared location
   mv packages/capture/fixtures/* packages/testkit/fixtures/
   ```

5. **Update imports:**

   ```typescript
   // Before
   import fixture from "../fixtures/data.json"

   // After
   import { loadFixture } from "@template/testkit/fixtures"
   const fixture = loadFixture("data.json")
   ```

### Phase 4: Create Shared Helpers

**Extract common patterns:**

```typescript
// packages/testkit/helpers/capture-helpers.ts
export function createCaptureFixture(
  overrides: Partial<Capture> = {}
): Capture {
  return {
    id: ulid(),
    source: "voice",
    raw_content: "test content",
    content_hash: computeContentHash("test content"),
    status: "staged",
    captured_at: new Date().toISOString(),
    meta_json: {},
    ...overrides,
  }
}

export function setupCaptureDatabase(): Database {
  const db = new Database(createMemoryUrl())
  applyTestPragmas(db)
  db.exec(CAPTURE_SCHEMA)
  return db
}
```

### Phase 5: Update Documentation

**Update test specifications:**

- Remove references to custom mocks
- Add TestKit pattern examples
- Update anti-pattern sections

## Examples

### Real-World Example: Migrating Capture Tests

**Before (Custom Mocks):**

```typescript
// ❌ Custom database mock
const mockDB = {
  query: vi.fn(),
  insert: vi.fn(),
  close: vi.fn(),
}

// ❌ Custom file mock
vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}))

// ❌ Custom HTTP mock
vi.mock("axios")

describe("Capture Service", () => {
  test("captures voice memo", async () => {
    mockDB.insert.mockResolvedValue({ id: "1" })
    mockAxios.post.mockResolvedValue({ data: { text: "transcription" } })

    // Test implementation with unrealistic mock behavior
  })
})
```

**After (TestKit Standard):**

```typescript
// ✅ TestKit database
import { createMemoryUrl, applyTestPragmas } from "@template/testkit/sqlite"
import { createTempDirectory } from "@template/testkit/fs"
import { setupMSW, http, createDelayedResponse } from "@template/testkit/msw"

// ✅ Real HTTP mocking
setupMSW([
  http.post("http://localhost:11434/api/generate", () =>
    createDelayedResponse({ text: "transcription" }, 100)
  ),
])

describe("Capture Service", () => {
  let db: Database
  let tempDir: TempDirectory

  beforeEach(async () => {
    db = new Database(createMemoryUrl())
    applyTestPragmas(db)
    db.exec(CAPTURE_SCHEMA)

    tempDir = await createTempDirectory()
  })

  afterEach(async () => {
    db.close()
    await tempDir.cleanup()
  })

  test("captures voice memo", async () => {
    // Real database behavior with constraints
    // Real file system with atomic operations
    // Real HTTP behavior with timing
    // Test implementation with realistic behavior
  })
})
```

### Real-World Example: Shared Fixture Loading

**Before (Duplicated Fixtures):**

```
packages/capture/fixtures/sample-audio.json
packages/obsidian/fixtures/sample-audio.json  # Duplicate!
packages/staging/fixtures/sample-captures.json
```

**After (Shared TestKit Fixtures):**

```
packages/testkit/fixtures/
├── golden-captures.json
├── sample-emails.json
├── audio-files/
│   ├── short-memo.json
│   └── long-transcript.json
└── vault-structures/
    ├── basic-vault.json
    └── complex-vault.json
```

**Fixture loader:**

```typescript
// packages/testkit/fixtures/index.ts
export function loadGoldenCaptures(): Capture[] {
  return require("./golden-captures.json")
}

export function loadAudioFixture(name: string): AudioFixture {
  return require(`./audio-files/${name}.json`)
}

export function loadVaultStructure(name: string): VaultStructure {
  return require(`./vault-structures/${name}.json`)
}
```

**Usage in tests:**

```typescript
import {
  loadGoldenCaptures,
  loadAudioFixture,
} from "@template/testkit/fixtures"

test("processes golden captures", () => {
  const captures = loadGoldenCaptures()
  const audio = loadAudioFixture("short-memo")

  // Use consistent test data across packages
})
```

## Related Documentation

**TestKit specifications:**

- [TestKit Usage Guide](./guide-testkit-usage.md) - Complete TestKit API reference
- [Phase 1 Testing Patterns](./guide-phase1-testing-patterns.md) - Basic patterns for MVP
- [Test Strategy Guide](./guide-test-strategy.md) - Overall testing approach

**Feature test specifications:**

- [Capture Test Spec](../features/capture/spec-capture-test.md) - Contains anti-patterns to migrate
- [Obsidian Bridge Test Spec](../features/obsidian-bridge/spec-obsidian-test.md) - Contains anti-patterns to migrate
- [Staging Ledger Test Spec](../features/staging-ledger/spec-staging-test.md) - Good TestKit usage example

**Architecture:**

- [Master PRD](../master/prd-master.md) - System requirements driving test needs
- [TDD Applicability Guide](./guide-tdd-applicability.md) - When comprehensive testing is required

## Maintenance Notes

### When to Update This Guide

Update this guide when:

- New TestKit utilities are added that replace existing custom patterns
- New anti-patterns are discovered during code reviews
- Migration reveals additional standardization opportunities
- TestKit API changes require pattern updates

### Enforcement Strategy

**Code review checklist:**

- [ ] No custom mock implementations (`vi.mock`, `jest.mock`)
- [ ] All database tests use `createMemoryUrl()`
- [ ] All file operations use `createTempDirectory()`
- [ ] All HTTP mocking uses `setupMSW()`
- [ ] All process mocking uses `quickMocks`
- [ ] All fixtures loaded from `@template/testkit/fixtures`
- [ ] All test helpers from `@template/testkit/helpers`

**Linting rules (future):**

```typescript
// .eslintrc.js rules to enforce TestKit usage
{
  "rules": {
    "no-vi-mock": "error",
    "no-jest-mock": "error",
    "prefer-testkit-database": "error",
    "prefer-testkit-filesystem": "error"
  }
}
```

### Known Limitations

**Current gaps:**

- Some packages still contain custom mock implementations
- Fixture duplication exists across packages
- Test helper logic duplicated in multiple locations

**Migration priorities:**

1. **High:** Replace custom database and file system mocks (data integrity risk)
2. **Medium:** Consolidate HTTP mocking patterns (consistency improvement)
3. **Low:** Move fixtures to shared location (maintainability improvement)

---

**Summary: Standardize on TestKit for ALL testing**

1. **Replace** custom mocks with TestKit utilities
2. **Move** fixtures to `packages/testkit/fixtures/`
3. **Create** shared helpers in `packages/testkit/helpers/`
4. **Enforce** through code review and future linting
5. **Migrate** package by package, starting with highest-risk areas

TestKit provides better isolation, more realistic behavior, and eliminates the maintenance burden of custom mock implementations. The result is faster, more reliable tests that catch real bugs instead of mock configuration errors.

_Testing should be like a good ADHD medication: consistent, reliable, and it just works without you having to think about it._
