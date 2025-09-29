---
title: Direct Export Pattern Test Spec
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-28
spec_type: test
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
prd_reference: docs/features/obsidian-bridge/prd-obsidian.md
tech_spec_reference: docs/cross-cutting/spec-direct-export-tech.md
---

> ✅ **MPPP FOUNDATION PATTERN** (Phase 1-2)

# Direct Export Pattern — Test Specification

## 1) Objectives

This test specification ensures the Direct Export Pattern delivers atomic, idempotent, and durable exports from Staging Ledger to Obsidian vault with zero data loss guarantees.

**Primary Testing Objectives:**

1. **Atomic Write Guarantee** - Prove temp → fsync → rename sequence prevents partial files
2. **Idempotency Contract** - Verify same capture_id + content_hash → identical result
3. **Durability Assurance** - Confirm fsync ordering prevents data loss after crash
4. **Collision Handling** - Test DUPLICATE vs CONFLICT detection and resolution
5. **Error Classification** - Validate recoverable vs non-recoverable error handling
6. **Performance Compliance** - Ensure < 50ms p95 latency for 1KB files

**Success Criteria:**

- All P0 risks have comprehensive test coverage with TDD red-green-refactor
- No partial files ever appear in vault under any failure scenario
- Content hash verification passes for all successful exports
- Error scenarios are deterministic and properly classified
- Performance gates met under normal MPPP load (< 200 captures/day)

## 2) Traceability

### PRD Requirements Mapping

| PRD Requirement             | Test Coverage                          | Implementation Reference             |
| --------------------------- | -------------------------------------- | ------------------------------------ |
| **Export latency < 10s**    | Performance tests verify < 50ms p95    | `spec-direct-export-tech.md:838-852` |
| **Zero data loss**          | Atomic write tests, crash recovery     | `spec-direct-export-tech.md:298-331` |
| **Idempotent retries**      | Duplicate detection, hash verification | `spec-direct-export-tech.md:806-830` |
| **ULID collision handling** | Conflict resolution tests              | `spec-direct-export-tech.md:622-671` |
| **Audit trail**             | SQLite exports_audit verification      | `spec-direct-export-tech.md:228-253` |

### Tech Spec Guarantee Mapping

| Tech Spec Guarantee           | Test Type          | Test Location                        |
| ----------------------------- | ------------------ | ------------------------------------ |
| **fsync before rename**       | Unit + Integration | `DirectExporter.atomicWrite()`       |
| **Temp file cleanup**         | Integration        | `DirectExporter.cleanupOnFailure()`  |
| **Path traversal prevention** | Unit               | `PathResolver.validateUlid()`        |
| **Content hash computation**  | Unit               | `ContentHasher.computeSha256()`      |
| **Directory creation**        | Integration        | `DirectExporter.ensureDirectories()` |

## 3) Coverage Strategy

### Test Pyramid Architecture

```
            E2E-lite (smoke)
         /                    \
    Integration (boundaries)
   /                            \
Unit (pure logic)            Contract (adapters)
```

#### Unit Tests (Pure Logic - TDD Required)

**Focus:** Deterministic algorithms, transformations, validation logic

**Modules Under Test:**

- Path resolution and ULID validation
- Content hash computation (SHA-256)
- Markdown formatting and frontmatter generation
- Collision detection logic
- Error classification rules

**Coverage:** 100% for pure functions, focusing on edge cases and boundary conditions

#### Integration Tests (Pipeline Boundaries - TDD Required)

**Focus:** File system operations, database interactions, atomic write sequences

**Modules Under Test:**

- End-to-end export pipeline (capture → vault file + audit)
- Directory creation and permission handling
- Temp file lifecycle (create → write → fsync → rename → cleanup)
- SQLite audit record insertion
- Error path testing with real filesystem

**Coverage:** P0 risk scenarios, performance gates, crash recovery

#### Contract Tests (External Boundaries - TDD Required)

**Focus:** Interfaces between components, mock verification

**Contracts Under Test:**

- Staging Ledger → DirectExporter (CaptureRecord format)
- DirectExporter → Filesystem (atomic write semantics)
- DirectExporter → SQLite (audit trail schema)
- Error handling → Upstream callers (error classification)

**Coverage:** Interface stability, mock behavior verification

#### E2E-lite Tests (Smoke Only - Optional)

**Focus:** Critical user journeys, deployment verification

**Scenarios:**

- Voice capture → export → Obsidian file appears
- Email capture → export → vault sync compatible
- Export failure → user feedback → recovery

**Coverage:** Happy path verification, deployment smoke tests

## 4) Critical Tests (TDD Required)

### P0 Risk Coverage (HIGH Priority)

Per [TDD Applicability Guide](../../guides/guide-tdd-applicability.md), Direct Export Pattern qualifies as **HIGH RISK** due to:

- 💾 Storage/Data Integrity: Vault corruption = permanent data loss
- 🔐 User Trust: Partial writes = sync conflicts
- 🧠 Core Cognition: ULID collisions = integrity violation
- 🔁 Concurrency/Durability: fsync timing bugs = silent data loss
- ⚠️ Cascading Failures: Sequential processing = blocking failures

#### Test Group 1: Atomic Write Guarantee

**File:** `tests/integration/direct-export/atomic-write.test.ts`

```typescript
describe("Atomic Write Guarantee", () => {
  test("successful export: temp → fsync → rename → cleanup", async () => {
    // Verify temp file created in .trash/
    // Verify fsync called before rename
    // Verify file appears in inbox/ with complete content
    // Verify temp file removed
    // Verify audit record created
  })

  test("crash during fsync: no partial file in vault", async () => {
    // Mock fsync to throw ENOSPC
    // Verify temp file exists but export_path does not
    // Verify no audit record created
    // Verify temp file cleanup occurs
  })

  test("crash during rename: temp file cleanup on retry", async () => {
    // Mock rename to throw filesystem error
    // Verify temp file cleaned up
    // Verify export_path does not exist
    // Verify retry attempt succeeds
  })
})
```

#### Test Group 2: Idempotency Contract

**File:** `tests/integration/direct-export/idempotency.test.ts`

```typescript
describe("Idempotency Contract", () => {
  test("duplicate capture: same content_hash → skip write", async () => {
    // Export capture once (success)
    // Export same capture again
    // Verify: no second file write, audit logged as duplicate_skip
    // Verify: file content unchanged
  })

  test("retry after crash: identical result", async () => {
    // Start export, simulate crash mid-write
    // Retry export with same capture
    // Verify: final result identical to clean export
    // Verify: single audit record (not duplicate)
  })

  test("ULID collision with different content: CONFLICT halt", async () => {
    // Create file with same ULID, different content_hash
    // Attempt export
    // Verify: CRITICAL error logged, export halted
    // Verify: no audit record created
  })
})
```

#### Test Group 3: Content Hash Integrity

**File:** `tests/unit/direct-export/content-hash.test.ts`

```typescript
describe("Content Hash Integrity", () => {
  test("SHA-256 deterministic computation", () => {
    // Same input → same hash (100 iterations)
    // Different input → different hash
    // UTF-8 encoding normalization
    // Empty content edge case
  })

  test("markdown content hash verification", async () => {
    // Export capture, read file back
    // Compute hash of exported content
    // Verify: matches original content_hash
    // Verify: frontmatter includes correct hash
  })
})
```

#### Test Group 4: Error Classification & Recovery

**File:** `tests/integration/direct-export/error-handling.test.ts`

```typescript
describe("Error Classification", () => {
  test("EACCES: permission denied → recoverable", async () => {
    // Mock fs.open to throw EACCES
    // Verify: error.recoverable = true
    // Verify: no partial files created
    // Verify: error logged, no audit record
  })

  test("ENOSPC: disk full → non-recoverable halt", async () => {
    // Mock fs.write to throw ENOSPC
    // Verify: error.recoverable = false
    // Verify: export worker halt triggered
    // Verify: temp file cleanup occurs
  })

  test("ENETDOWN: network mount → recoverable", async () => {
    // Mock rename to throw ENETDOWN
    // Verify: error.recoverable = true
    // Verify: structured error response
  })
})
```

#### Test Group 5: Directory & Path Security

**File:** `tests/unit/direct-export/path-resolution.test.ts`

```typescript
describe("Path Security", () => {
  test("valid ULID → correct paths", () => {
    // Valid 26-char ULID → temp and export paths
    // Verify: paths within vault boundaries
    // Verify: .trash/ and inbox/ subdirectories
  })

  test("invalid ULID → path traversal prevention", () => {
    // "../" sequences → error
    // Special characters → error
    // Empty/null ULID → error
    // Non-ULID format → error
  })

  test("directory creation idempotency", async () => {
    // Create directories multiple times
    // Verify: no errors on existing directories
    // Verify: correct permissions set
  })
})
```

### P1 Risk Coverage (MEDIUM Priority)

#### Test Group 6: Performance Gates

**File:** `tests/integration/direct-export/performance.test.ts`

```typescript
describe("Performance Gates", () => {
  test("export latency < 50ms p95 for 1KB files", async () => {
    // Run 100 exports with 1KB markdown
    // Measure end-to-end latency
    // Verify: p95 < 50ms
    // Verify: p99 < 100ms
  })

  test("sequential processing throughput", async () => {
    // Export 50 captures sequentially
    // Verify: no memory leaks
    // Verify: consistent latency (no degradation)
  })
})
```

#### Test Group 7: Filesystem Contract

**File:** `tests/contract/direct-export/filesystem.test.ts`

```typescript
describe("Filesystem Contract", () => {
  test("fsync called before rename", async () => {
    // Mock fs operations with call tracking
    // Verify: fsync() called before rename()
    // Verify: file descriptor closed after fsync
  })

  test("same filesystem requirement", async () => {
    // Verify: .trash/ and inbox/ on same mount
    // Verify: atomic rename guarantee
    // Test: cross-filesystem error detection
  })
})
```

## 5) Tooling

### Primary Test Framework

- **Vitest** - Fast unit and integration test runner
- **@testing-library/jest-dom** - Custom matchers for DOM assertions
- **better-sqlite3** - SQLite test database with in-memory option

### Mock Strategy

- **Mock-first approach** for filesystem operations during unit tests
- **Real filesystem** for integration tests with temp directories
- **TestKit helpers** for deterministic capture data generation

### Test Environment Setup

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10000, // 10s for file operations
    reporters: ["verbose"],
    coverage: {
      reporter: ["text", "html"],
      exclude: ["tests/", "dist/"],
    },
  },
})
```

### Performance Profiling

```bash
# Latency measurement setup
vitest run --reporter=json | jq '.testResults[] | select(.name | contains("performance"))'

# Memory leak detection
node --inspect --max-old-space-size=128 vitest run tests/integration/performance/
```

## 6) TestKit Helpers

### 6.1 Required TestKit Modules

#### Filesystem TestKit (`@adhd-brain/testkit/fs`)

```typescript
import { MockFileSystem, TempVaultSetup } from "@adhd-brain/testkit/fs"

// Deterministic filesystem mocking
const mockFs = new MockFileSystem()
mockFs.mockError("ENOSPC") // Simulate disk full

// Real temp vault for integration tests
const tempVault = await TempVaultSetup.create()
// Auto-cleanup after test completion
```

#### Capture TestKit (`@adhd-brain/testkit/capture`)

```typescript
import { CaptureFactory } from "@adhd-brain/testkit/capture"

// Generate deterministic test captures
const voiceCapture = CaptureFactory.voice({
  content: "Test voice content",
  ulid: "01HZVM8YWRQT5J3M3K7YPTX9RZ",
})

const emailCapture = CaptureFactory.email({
  subject: "Test email",
  content: "Email body content",
})
```

#### SQLite TestKit (`@adhd-brain/testkit/db`)

```typescript
import { TestDatabase } from "@adhd-brain/testkit/db"

// In-memory SQLite with schema setup
const testDb = await TestDatabase.create()
await testDb.migrate() // Apply staging ledger schema
// Auto-cleanup and transaction rollback
```

### 6.2 Custom Test Assertions

#### DirectExport Assertions

```typescript
// Custom matchers for export verification
expect(exportResult).toBeSuccessfulExport({
  mode: "initial",
  exportPath: "inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md",
})

expect(vaultPath).toContainValidMarkdown({
  ulid: "01HZVM8YWRQT5J3M3K7YPTX9RZ",
  contentHash: "a1b2c3...",
  source: "voice",
})

expect(auditRecord).toMatchExportAudit({
  captureId: "01HZVM8YWRQT5J3M3K7YPTX9RZ",
  mode: "initial",
  errorFlag: 0,
})
```

#### Performance Assertions

```typescript
// Latency measurement helpers
await expectWithinLatency(
  async () => {
    await directExporter.exportToVault(capture)
  },
  { p95: 50, p99: 100 }
) // milliseconds
```

### 6.3 TestKit Extensions

#### New TestKit Helpers (To Be Implemented)

**Crash Simulation Helper:**

```typescript
// @adhd-brain/testkit/crash - NEW MODULE NEEDED
import { CrashSimulator } from "@adhd-brain/testkit/crash"

const crashSim = new CrashSimulator()
await crashSim.simulatePowerLoss("during_fsync")
await crashSim.simulateProcessKill("during_rename")
```

**Filesystem Corruption Helper:**

```typescript
// @adhd-brain/testkit/fs-corruption - NEW MODULE NEEDED
import { CorruptionSimulator } from "@adhd-brain/testkit/fs-corruption"

const corruptSim = new CorruptionSimulator()
await corruptSim.corruptTempFile("partial_write")
await corruptSim.simulateRenameFailure("cross_filesystem")
```

**Concurrent Export Helper:**

```typescript
// @adhd-brain/testkit/concurrency - NEW MODULE NEEDED (Phase 2)
import { ConcurrencyTester } from "@adhd-brain/testkit/concurrency"

const concurrency = new ConcurrencyTester()
await concurrency.raceCondition([export1, export2], "same_ulid")
```

## 7) Test Scenarios

### 7.1 Happy Path Scenarios

#### Scenario: Voice Capture Export

```typescript
test("voice capture → markdown export → audit trail", async () => {
  // Arrange: Valid voice capture in staging ledger
  const capture = CaptureFactory.voice({
    content: "Remember to buy groceries tomorrow",
    timestamp: "2025-09-28T10:30:00Z",
  })

  // Act: Direct export
  const result = await directExporter.exportToVault(capture)

  // Assert: Success result
  expect(result).toBeSuccessfulExport({
    mode: "initial",
    exportPath: `inbox/${capture.id}.md`,
  })

  // Assert: File exists with correct content
  const vaultPath = path.join(VAULT_PATH, "inbox", `${capture.id}.md`)
  expect(vaultPath).toContainValidMarkdown({
    ulid: capture.id,
    contentHash: capture.content_hash,
    source: "voice",
    content: "Remember to buy groceries tomorrow",
  })

  // Assert: Audit record created
  const auditRecord = await db.get(
    "SELECT * FROM exports_audit WHERE capture_id = ?",
    capture.id
  )
  expect(auditRecord).toMatchExportAudit({
    captureId: capture.id,
    mode: "initial",
    errorFlag: 0,
  })
})
```

#### Scenario: Email Capture Export

```typescript
test("email capture → markdown export → metadata preservation", async () => {
  // Test email-specific frontmatter and content formatting
  // Verify From/To/Subject metadata preserved
  // Verify email body content properly escaped
})
```

### 7.2 Edge Cases & Error Scenarios

#### Scenario: Duplicate Export (Idempotency)

```typescript
test("duplicate export → skip write → audit duplicate_skip", async () => {
  // Export capture successfully
  // Export same capture again
  // Verify: second export skipped, audit logged
  // Verify: file content unchanged
})
```

#### Scenario: ULID Collision with Different Content

```typescript
test("ULID collision → content hash conflict → CRITICAL error", async () => {
  // Create file manually with same ULID, different content
  // Attempt export with conflicting content_hash
  // Verify: CRITICAL error, export halted
  // Verify: no audit record, detailed error log
})
```

#### Scenario: Filesystem Permission Denied

```typescript
test("EACCES error → recoverable error → cleanup temp file", async () => {
  // Mock vault directory as read-only
  // Attempt export
  // Verify: EACCES error with recoverable=true
  // Verify: no partial files, temp cleanup occurs
})
```

#### Scenario: Disk Full During Write

```typescript
test("ENOSPC error → non-recoverable → halt worker", async () => {
  // Mock filesystem to return ENOSPC on write
  // Attempt export
  // Verify: ENOSPC error with recoverable=false
  // Verify: worker halt triggered
  // Verify: temp file cleanup
})
```

### 7.3 Crash Recovery Scenarios

#### Scenario: Power Loss During fsync

```typescript
test("crash during fsync → no partial file → retry succeeds", async () => {
  // Start export, crash during fsync call
  // Verify: temp file exists, export file does not
  // Retry export with same capture
  // Verify: retry succeeds, file appears with correct content
})
```

#### Scenario: Process Kill During Rename

```typescript
test("process kill during rename → temp cleanup → retry success", async () => {
  // Start export, kill process during rename
  // Verify: temp file may exist (filesystem dependent)
  // Start new process, retry export
  // Verify: orphaned temp files cleaned up
  // Verify: export succeeds
})
```

### 7.4 Performance & Load Scenarios

#### Scenario: Sequential Export Performance

```typescript
test("50 sequential exports → latency within bounds", async () => {
  // Generate 50 different captures
  // Export sequentially, measure latencies
  // Verify: p95 < 50ms, p99 < 100ms
  // Verify: no performance degradation over time
})
```

#### Scenario: Large Content Export

```typescript
test("10KB capture → export within latency budget", async () => {
  // Create capture with 10KB content (large email)
  // Export and measure latency
  // Verify: still within latency bounds
  // Verify: content integrity preserved
})
```

## 8) Mock vs Real Adapter Strategy

### 8.1 Mock-First Components

#### Filesystem Operations (Unit Tests)

```typescript
// Use TestKit filesystem mocks for deterministic unit tests
import { createFaultInjector } from "@adhd-brain/testkit/fs"

const faultInjector = createFaultInjector()
// Mock atomic write sequence
faultInjector.mockAtomicWriteSequence({
  open: { success: true, fd: 3 },
  write: { success: true, bytesWritten: 1024 },
  fsync: { success: true },
  rename: { success: true },
})

// Test specific error scenarios
faultInjector.injectFileSystemError("ENOSPC", {
  operation: "fsync",
  message: "No space left on device",
})
```

**Rationale:** Filesystem operations are slow and non-deterministic. Mocking allows testing specific error codes (EACCES, ENOSPC, etc.) reliably.

#### External Dependencies

```typescript
// Use TestKit database mocks for unit tests
import { createMockDatabase } from "@adhd-brain/testkit/sqlite"

const mockDb = createMockDatabase()

// Use TestKit ULID generator for predictable IDs
import { createDeterministicUlid } from "@adhd-brain/testkit/ulid"
const deterministicUlid = createDeterministicUlid("01HZVM8YWRQT5J3M3K7YPTX9RZ")
```

**Rationale:** Database operations add complexity and state to unit tests. Mocks ensure tests focus on DirectExporter logic, not SQLite behavior.

### 8.2 Real Adapter Components

#### Filesystem Operations (Integration Tests)

```typescript
// Use real filesystem with temp directories
const tempVault = await TempVaultSetup.create()
const directExporter = new DirectExporter({
  vaultPath: tempVault.path,
  db: realSqliteDb,
})

// Test actual file operations
await directExporter.exportToVault(capture)
const fileExists = await fs.existsSync(exportPath)
```

**Rationale:** Integration tests must verify actual atomic rename behavior, filesystem permissions, and directory creation.

#### SQLite Database (Integration Tests)

```typescript
// Use in-memory SQLite for integration tests
const testDb = new Database(":memory:")
await testDb.exec(STAGING_LEDGER_SCHEMA)

// Real database operations
const auditRecord = await testDb.get(
  "SELECT * FROM exports_audit WHERE capture_id = ?",
  captureId
)
```

**Rationale:** SQLite schema constraints, foreign keys, and transaction behavior must be tested with real database.

### 8.3 TestKit Mock Patterns

#### Use Existing TestKit Mocks

```typescript
// Leverage existing filesystem mocks
import { createFaultInjector } from "@adhd-brain/testkit/fs"
const faultInjector = createFaultInjector()

// Leverage existing database mocks
import { createMockDatabase } from "@adhd-brain/testkit/sqlite"
const mockDb = createMockDatabase()
```

**Always Use TestKit Patterns** instead of creating custom mock implementations.

#### Suggest New TestKit Helpers

For gaps in TestKit coverage, propose new helpers instead of custom implementations:

```typescript
// PROPOSE: @adhd-brain/testkit/vault
export class VaultMock {
  mockExistingFile(ulid: string, contentHash: string): void
  mockCollision(ulid: string, differentHash: string): void
  mockPermissionDenied(path: string): void
}

// PROPOSE: @adhd-brain/testkit/timing
export class TimingMock {
  measureLatency<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; latency: number }>
  enforceLatencyBounds(bounds: { p95: number; p99: number }): Matcher
}
```

## 9) Test Data Requirements

### 9.1 Capture Test Data

#### Voice Capture Fixtures

```typescript
const VOICE_FIXTURES = {
  MINIMAL: {
    id: "01HZVM8YWRQT5J3M3K7YPTX9RZ",
    source: "voice",
    raw_content: "Test voice note",
    content_hash: computeSHA256("Test voice note"),
    meta_json: { duration_ms: 1500 },
    created_at: "2025-09-28T10:30:00.000Z",
  },

  LARGE_CONTENT: {
    id: "01HZVM8YWRQT5J3M3K7YPTX9RY",
    source: "voice",
    raw_content: "A".repeat(10 * 1024), // 10KB content
    content_hash: computeSHA256("A".repeat(10 * 1024)),
    meta_json: { duration_ms: 45000 },
    created_at: "2025-09-28T10:31:00.000Z",
  },

  SPECIAL_CHARS: {
    id: "01HZVM8YWRQT5J3M3K7YPTX9RX",
    source: "voice",
    raw_content: 'Content with "quotes" and \n newlines \t tabs',
    content_hash: computeSHA256(
      'Content with "quotes" and \n newlines \t tabs'
    ),
    meta_json: { duration_ms: 2500 },
    created_at: "2025-09-28T10:32:00.000Z",
  },
}
```

#### Email Capture Fixtures

```typescript
const EMAIL_FIXTURES = {
  SIMPLE: {
    id: "01HZVM8YWRQT5J3M3K7YPTX9RW",
    source: "email",
    raw_content: "Email body content",
    content_hash: computeSHA256("Email body content"),
    meta_json: {
      from: "test@example.com",
      subject: "Test Subject",
      received_at: "2025-09-28T10:30:00.000Z",
    },
    created_at: "2025-09-28T10:30:00.000Z",
  },
}
```

### 9.2 Golden Fixtures

#### Expected Markdown Output

```typescript
const EXPECTED_MARKDOWN = {
  VOICE_MINIMAL: `---
id: 01HZVM8YWRQT5J3M3K7YPTX9RZ
source: voice
captured_at: 2025-09-28T10:30:00.000Z
content_hash: ${VOICE_FIXTURES.MINIMAL.content_hash}
---

# Capture (Voice)

Test voice note

---

**Metadata:**
- Source: voice
- Captured: 2025-09-28 10:30 AM
- Export: 2025-09-28 10:30 AM`,

  EMAIL_SIMPLE: `---
id: 01HZVM8YWRQT5J3M3K7YPTX9RW
source: email
captured_at: 2025-09-28T10:30:00.000Z
content_hash: ${EMAIL_FIXTURES.SIMPLE.content_hash}
---

# Test Subject

Email body content

---

**Metadata:**
- Source: email (test@example.com)
- Captured: 2025-09-28 10:30 AM
- Export: 2025-09-28 10:30 AM`,
}
```

### 9.3 Error Scenario Data

#### Filesystem Error Conditions

```typescript
const ERROR_CONDITIONS = {
  EACCES: new Error("Permission denied"),
  ENOSPC: new Error("No space left on device"),
  EEXIST: new Error("File exists"),
  EROFS: new Error("Read-only file system"),
  ENETDOWN: new Error("Network is down"),
}
ERROR_CONDITIONS.EACCES.code = "EACCES"
ERROR_CONDITIONS.ENOSPC.code = "ENOSPC"
// ... etc
```

#### Collision Test Data

```typescript
const COLLISION_SCENARIOS = {
  DUPLICATE_CONTENT: {
    existingFile: {
      ulid: "01HZVM8YWRQT5J3M3K7YPTX9RZ",
      contentHash: "abc123...",
      content: "Same content",
    },
    newCapture: {
      id: "01HZVM8YWRQT5J3M3K7YPTX9RZ", // Same ULID
      content_hash: "abc123...", // Same hash
      raw_content: "Same content",
    },
    expectedResult: "duplicate_skip",
  },

  CONFLICT_CONTENT: {
    existingFile: {
      ulid: "01HZVM8YWRQT5J3M3K7YPTX9RZ",
      contentHash: "abc123...",
      content: "Original content",
    },
    newCapture: {
      id: "01HZVM8YWRQT5J3M3K7YPTX9RZ", // Same ULID
      content_hash: "def456...", // Different hash
      raw_content: "Different content",
    },
    expectedResult: "CRITICAL_ERROR",
  },
}
```

## 10) Success Criteria

### 10.1 Test Coverage Gates

#### Code Coverage Requirements

- **Unit tests:** 100% line coverage for pure functions
- **Integration tests:** 90% line coverage for DirectExporter class
- **Contract tests:** 100% interface coverage for all public APIs
- **Error scenarios:** 100% coverage of error classification logic

#### Risk Coverage Requirements

- **P0 risks:** 100% test coverage with TDD implementation
- **P1 risks:** 90% test coverage with integration tests
- **P2 risks:** Optional coverage based on business value

### 10.2 Performance Gates

#### Latency Requirements

```typescript
const PERFORMANCE_GATES = {
  EXPORT_LATENCY_P95: 50, // milliseconds
  EXPORT_LATENCY_P99: 100, // milliseconds
  MEMORY_USAGE_MAX: 10, // MB per export
  CLEANUP_LATENCY_MAX: 5, // milliseconds
}
```

#### Throughput Requirements (MPPP Scope)

- **Sequential exports:** 50 captures in < 5 seconds
- **Memory stability:** No memory leaks over 100 exports
- **Temp file cleanup:** Zero orphaned files after test completion

### 10.3 Reliability Gates

#### Atomicity Requirements

- **Zero partial files:** No .md files appear in vault with incomplete content
- **Temp file cleanup:** All .tmp files removed after export completion
- **Audit consistency:** Every vault file has corresponding audit record

#### Idempotency Requirements

- **Duplicate detection:** Same capture_id + content_hash → identical result
- **Retry safety:** Multiple export attempts produce single audit record
- **Content verification:** Exported file content matches capture raw_content

### 10.4 Error Handling Gates

#### Error Classification Accuracy

- **Recoverable errors:** EACCES, ENETDOWN correctly marked recoverable=true
- **Non-recoverable errors:** ENOSPC, EROFS correctly marked recoverable=false
- **Critical errors:** ULID conflicts halt export with detailed logging

#### Error Recovery Testing

- **Crash resilience:** Export retries succeed after process crash
- **Temp file recovery:** Orphaned temp files cleaned up on restart
- **State consistency:** No database inconsistencies after error recovery

## 11) Non-Goals (YAGNI Boundaries)

### 11.1 Deferred to Phase 2+

#### Advanced Error Recovery

- **Exponential backoff retry logic** - Direct export uses fail-fast approach
- **Circuit breaker patterns** - Single-user scenario doesn't require circuit breaking
- **Dead letter queue handling** - No background queue in direct export pattern

#### Performance Optimization

- **Concurrent export testing** - Sequential processing sufficient for MPPP scope
- **Batch export optimization** - Individual exports meet latency requirements
- **Memory pool management** - Standard Node.js memory management sufficient

#### Advanced Monitoring

- **Real-time metrics dashboards** - Local NDJSON logging sufficient for MPPP
- **Distributed tracing** - Single-process execution simplifies debugging
- **Health check endpoints** - CLI doctor command provides health assessment

### 11.2 Deferred to Phase 3+

#### Multi-Vault Features

- **Vault selection logic testing** - Single vault assumption in MPPP
- **Cross-vault deduplication** - Not required for single-user scenario
- **Vault-specific templates** - Fixed markdown format sufficient

#### Advanced Classification

- **PARA routing tests** - Manual filing through inbox/ in MPPP
- **Automatic tagging** - Content-based classification not in scope
- **Dynamic templates** - Fixed frontmatter structure sufficient

### 11.3 Explicitly Out of Scope

#### UI Testing

- **Visual regression tests** - Direct export is headless operation
- **User interaction tests** - No UI components in export pipeline
- **Accessibility testing** - Not applicable to file export operations

#### Network Testing

- **Distributed system testing** - Single-machine operation
- **Network partition simulation** - Local filesystem operations only
- **Load balancer testing** - No network components involved

#### Security Penetration Testing

- **SQL injection testing** - Prepared statements used, covered by SQLite tests
- **Path traversal attacks** - ULID validation prevents traversal
- **Privilege escalation** - File operations within user permissions

## 12) Related Documentation

### Primary References

- **Tech Spec:** [Direct Export Pattern Tech Spec](../cross-cutting/spec-direct-export-tech.md) - Implementation details
- **ADR 0013:** [MPPP Direct Export Pattern](../adr/0013-mppp-direct-export-pattern.md) - Decision rationale
- **ADR 0020:** [Foundation Direct Export Pattern](../adr/0020-foundation-direct-export-pattern.md) - Foundation patterns

### Architecture Context

- **Master PRD:** [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System requirements
- **Obsidian Bridge PRD:** [Obsidian Bridge PRD](../features/obsidian-bridge/prd-obsidian.md) - Product context
- **Capture Architecture:** [Capture Arch Spec](../features/capture/spec-capture-arch.md) - Upstream integration
- **Staging Ledger Tech:** [Staging Ledger Tech](../features/staging-ledger/spec-staging-tech.md) - Data source

### Testing Framework

- **TDD Guide:** [TDD Applicability Guide](../guides/guide-tdd-applicability.md) - Risk assessment framework
- **TestKit Usage:** [TestKit Usage Guide](../guides/guide-testkit-usage.md) - Implementation patterns
- **Test Strategy:** [Test Strategy Guide](../guides/guide-test-strategy.md) - Overall testing approach

### Development Tools

- **Phase 1 Testing:** [Phase 1 Testing Patterns](../guides/guide-phase1-testing-patterns.md) - MPPP-specific patterns
- **Error Recovery:** [Error Recovery Guide](../guides/guide-error-recovery.md) - Failure handling strategies

---

## Revision History

- **v1.0.0** (2025-09-28): Initial comprehensive test specification for Direct Export Pattern
  - Complete TDD applicability assessment with P0 risk coverage
  - Detailed test scenarios covering atomic write, idempotency, and error handling
  - Mock vs real adapter strategy with TestKit integration
  - Performance gates and success criteria aligned with tech spec
  - Comprehensive test data fixtures and golden file expectations
  - Clear YAGNI boundaries for Phase 1 MPPP scope
  - Integration with existing testing infrastructure and documentation

---

_Remember: These tests are your parachute for the critical path (data integrity), not the paint job (UI polish). Focus on behavior that could cause data loss, not implementation details that could change._
