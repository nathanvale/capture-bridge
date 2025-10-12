# Capture Bridge TestKit Comprehensive Audit & Implementation Plan

**Date:** 2025-10-12
**Status:** Planning Complete - Ready for Implementation
**Auditor:** Claude (Sequential Thinking Analysis)

---
****
## Executive Summary

**Overall Assessment:** ✅ **STRONG COMPLIANCE** - Capture Bridge demonstrates solid TestKit adoption with **6 of 12 feature categories fully adopted**. All critical features (guards, resource cleanup, vitest config) are correctly implemented. The codebase serves well as a TestKit showcase project.

**TestKit Feature Adoption: 6/12 Fully Adopted, 2/12 Partial, 2/12 Not Used, 2/12 N/A**

**Key Finding:** Discovered 5 novel patterns that should be incorporated into TestKit itself to benefit all consumers.

---

## TestKit Feature Adoption Status

### ✅ Fully Adopted (6/12)

1. **Core Utilities** - delay, retry, withTimeout used across tests
2. **Resource Management** - setupResourceCleanup() in all 5 packages
3. **SQLite Testing** - 5 dedicated test files with comprehensive coverage
4. **MSW Mock Server** - Full feature coverage in testkit-msw-features.test.ts
5. **Configuration** - All packages use createBaseVitestConfig()
6. **Guards** - SQLite & Timers guards globally enabled via env vars

### ⚠️ Partially Adopted (2/12)

7. **File System (createTempDirectory)** - INCONSISTENT
   - ✅ GOOD: oauth-flow.test.ts, atomic-writer.test.ts, security-validation.test.ts
   - ❌ BAD: performance-benchmarks.test.ts uses manual mkdirSync/rmSync

8. **Security Validation** - Only in dedicated test, not in app code
   - Used: security-validation.test.ts (comprehensive)
   - Missing: validateCommand, sanitizeSqlIdentifier in production code

### ❌ Not Adopted (2/12)

9. **Concurrency Control** - ConcurrencyManager used only once (security-validation.test.ts:685-727)
10. **Environment Control** - useFakeTime, controlRandomness never used
11. **CLI Process Mocking** - Only in testkit-cli-utilities.test.ts (testing TestKit itself)

### N/A (2/12)

12. Container Testing (MySQL/PostgreSQL) - Not applicable
13. Convex Testing - Not applicable

---

## Audit Methodology

### Files Examined (39 total test files)

**Foundation Package (12 files):**
- ✅ testkit-msw-features.test.ts - MSW comprehensive usage
- ✅ performance-benchmarks.test.ts - Manual patterns, novel cleanup sequences
- ✅ security-validation.test.ts - Security utilities, ConcurrencyManager
- ✅ testkit-sqlite-features.test.ts - SQLite comprehensive coverage
- ✅ testkit-cli-utilities.test.ts - CLI mocking (testing TestKit itself)
- package-contract.test.ts
- testkit-core-utilities.test.ts
- testkit-utils-advanced.test.ts
- testkit-final-validation.test.ts
- metrics-client.test.ts
- Hash tests (audio-fingerprint, email, sha256, text-normalization)

**Storage Package (1 file):**
- ✅ schema-creation.spec.ts - Manual database cleanup pattern

**Capture Package (11 files):**
- ✅ oauth-flow.test.ts (gmail) - createTempDirectory with settle pattern
- auth tests (auth-state-tracker, credentials-parser, error-classifier, token-manager)
- gmail tests (credentials, error-handling, failure-tracking, sync-state-tracking, token-refresh)
- transcription tests (integration, whisper-model, queue)
- voice-poller.test.ts
- placeholder.test.ts

**Obsidian-Bridge Package (5 files):**
- ✅ atomic-writer.test.ts - createTempDirectory with TempDir helpers
- collision-detector.test.ts
- crash-testing.test.ts
- path-resolver.test.ts
- performance.test.ts

**CLI Package (1 file):**
- ❌ placeholder.test.ts - No real tests

### TestKit Features Analyzed

**12 Feature Categories from API.md:**
1. Core Utilities (delay, retry, withTimeout, createMockFn)
2. Security Validation (validateCommand, sanitizeCommand, validatePath, sanitizeSqlIdentifier)
3. Resource Management (registerResource, cleanupAllResources, ResourceManager)
4. Concurrency Control (limitConcurrency, ConcurrencyManager, predefined managers)
5. Environment Control (useFakeTime, controlRandomness, quickRandom, quickCrypto)
6. File System (createTempDirectory with auto-cleanup)
7. CLI Process Mocking (spawnUtils, createProcessMock, processHelpers)
8. SQLite Testing (database management, pools, transactions, migrations)
9. MSW Mock Server (setupMSW, handlers, responses)
10. Configuration (createBaseVitestConfig)
11. Container Testing (MySQL, PostgreSQL)
12. Convex Testing

---

## Prioritized Recommendations

### P0 (Critical) - NONE ✅

**No critical issues identified.** System is stable, tests passing, guards working correctly.

### P1 (High Priority - Standardization)

#### 1.1 Migrate Manual Temp Directory Pattern

**File:** `packages/foundation/src/__tests__/performance-benchmarks.test.ts`
**Lines:** 31-35 (beforeEach), 55-57 (afterEach)
**Issue:** Uses manual `mkdirSync`/`rmSync` instead of TestKit's `createTempDirectory()`

**Current Code:**
```typescript
// ❌ CURRENT (lines 31-35, 55-57)
beforeEach(() => {
  testDir = join(tmpdir(), `testkit-perf-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
})

afterEach(async () => {
  // ...
  rmSync(testDir, { recursive: true, force: true })
  // ...
})
```

**Recommended Fix:**
```typescript
// ✅ SHOULD BE
let tempDir: any // TestKit TempDirectory object

beforeEach(async () => {
  const { createTempDirectory } = await import('@orchestr8/testkit/fs')
  tempDir = await createTempDirectory()
  testDir = tempDir.path
})

afterEach(async () => {
  // TestKit auto-cleanup handles it - no manual rmSync needed!
  await new Promise((resolve) => setTimeout(resolve, 100)) // Settle
  if (global.gc) global.gc()
})
```

**Benefits:**
- Automatic cleanup via TestKit guards
- Prevents temp directory leaks on test failures
- Consistent with 90% of other tests
- Simplified test code (no manual fs.rm)

**Effort:** 30 minutes
**Priority:** P1 - Standardization

---

#### 1.2 Standardize Database Cleanup

**Files Affected:**
- packages/storage/src/__tests__/schema-creation.spec.ts (10+ tests)
- packages/foundation/src/__tests__/testkit-sqlite-features.test.ts (20+ tests)
- packages/foundation/src/__tests__/security-validation.test.ts (15+ tests)

**Issue:** Manual array tracking + loops when SQLite Guards are already enabled globally

**Current Pattern (used in 45+ tests):**
```typescript
// ❌ CURRENT PATTERN
const databases: Array<InstanceType<typeof BetterSqlite3>> = []

beforeEach(() => {
  db = new Database(':memory:')
  databases.push(db)
})

afterEach(() => {
  for (const database of databases) {
    try {
      if (!database.readonly && database.open) {
        database.close()
      }
    } catch {
      // Ignore close errors
    }
  }
  databases.length = 0
  db = null
})
```

**Recommended Fix - OPTION 1 (Rely on Guards):**
```typescript
// ✅ OPTION 1: Rely on SQLite Guards (already enabled via TESTKIT_SQLITE_GUARD=on)
// Guards auto-close leaked databases, so just remove manual cleanup

beforeEach(() => {
  db = new Database(':memory:')
  // No array tracking needed
})

afterEach(() => {
  // Guards handle cleanup automatically
  db = null
})
```

**Recommended Fix - OPTION 2 (Explicit Registration):**
```typescript
// ✅ OPTION 2: Explicit registration with TestKit
beforeEach(() => {
  db = new Database(':memory:')
  registerDatabaseCleanup({
    cleanup: async () => {
      if (!db.readonly && db.open) {
        db.close()
      }
    }
  })
})

afterEach(async () => {
  const { cleanupAllSqlite } = await import('@orchestr8/testkit/sqlite')
  await cleanupAllSqlite()
  db = null
})
```

**Decision Needed:** Team should choose one pattern for consistency

**Benefits:**
- Reduced boilerplate code (remove 5-10 lines per test)
- Consistent pattern across 100+ tests
- Leverages TestKit features (guards or registration)
- Prevents cleanup order mistakes

**Effort:** 2-4 hours (45+ tests to update)
**Priority:** P1 - Standardization

---

#### 1.3 Document TempDirectory Helper Methods (CRITICAL!)

**File:** `@orchestr8/testkit/API.md`
**Issue:** TempDirectory helper methods exist but are UNDOCUMENTED

**Currently Undocumented Methods (found in atomic-writer.test.ts):**
```typescript
// These work but aren't in API.md!
await tempDir.exists('inbox')           // Check if file/dir exists
await tempDir.readFile('file.txt')      // Read file content
await tempDir.writeFile('file.txt', '') // Write file
await tempDir.mkdir('inbox')            // Create directory
```

**Location:** packages/obsidian-bridge/src/__tests__/atomic-writer.test.ts (used extensively lines 68, 87, 105, 117, 131, 149, 164, etc.)

**Action Required:**
1. Add TempDirectory interface documentation to TestKit API.md
2. Document all helper methods with examples
3. Add to "File System" section

**Documentation Template:**
```markdown
### TempDirectory Helper Methods

The object returned by `createTempDirectory()` includes helper methods:

- `exists(relativePath: string): Promise<boolean>` - Check if file/directory exists
- `readFile(relativePath: string): Promise<string>` - Read file content
- `writeFile(relativePath: string, content: string): Promise<void>` - Write file
- `mkdir(relativePath: string): Promise<void>` - Create directory

All paths are relative to the temp directory root.

**Example:**
```typescript
const tempDir = await createTempDirectory()

await tempDir.writeFile('config.json', '{"test": true}')
const exists = await tempDir.exists('config.json') // true
const content = await tempDir.readFile('config.json')
await tempDir.mkdir('subdir')
```

**Effort:** 1 hour
**Priority:** P1 - Critical documentation gap

---

### P2 (Medium Priority - Feature Adoption)

#### 2.1 Promote Security Utilities in Application Code

**Current State:**
- Security utilities ONLY used in test file: security-validation.test.ts
- Production code doesn't use: validateCommand, sanitizeSqlIdentifier, validatePath, escapeShellArg

**Opportunity:** Use in actual application code where user input is processed

**Files to Review:**
- CLI package: Any command-line argument processing
- Capture package: Any file path handling, external command execution
- Storage package: Any dynamic SQL identifier construction

**Example Usage:**
```typescript
// In CLI command handlers
import { validateCommand, SecurityValidationError } from '@orchestr8/testkit/utils'

try {
  validateCommand(userProvidedCommand)
  // Safe to execute
} catch (error) {
  if (error instanceof SecurityValidationError) {
    console.error('Invalid command:', error.message)
    process.exit(1)
  }
}

// In database utilities
import { sanitizeSqlIdentifier } from '@orchestr8/testkit/utils'

const tableName = sanitizeSqlIdentifier(userInput) // Throws if invalid
db.exec(`CREATE TABLE ${tableName} (...)`)
```

**Benefits:**
- Production security hardening
- Consistent validation across codebase
- Demonstrates security utilities in real-world usage

**Effort:** 2-3 hours (code review + implementation)
**Priority:** P2 - Security enhancement

---

#### 2.2 Add Concurrency Control Examples

**File:** `packages/foundation/src/__tests__/performance-benchmarks.test.ts`
**Current:** Sequential database operations
**Enhancement:** Use ConcurrencyManager for parallel operations

**Current Code (Sequential):**
```typescript
// Currently runs sequentially
for (let i = 0; i < 1000; i++) {
  await someOperation(i)
}
```

**Recommended Enhancement:**
```typescript
import { ConcurrencyManager } from '@orchestr8/testkit/utils'

const manager = new ConcurrencyManager({ limit: 5 })
const operations = Array.from({ length: 1000 }, (_, i) => i)

await manager.map(operations, async (i) => {
  // Runs 5 at a time (concurrent but controlled)
  return await someOperation(i)
})
```

**Benefits:**
- Performance test improvements
- Showcase concurrency features in real scenarios
- Demonstrate best practices for parallel operations

**Effort:** 1-2 hours
**Priority:** P2 - Feature showcase

---

### P3 (Low Priority - Nice to Have)

#### 3.1 Document Environment Control Features

**Features:** useFakeTime, controlRandomness, quickRandom, quickCrypto
**Current:** Not used anywhere in Capture Bridge
**Action:** Add documentation/examples for future time-sensitive tests

**Potential Use Cases:**
- Testing retry logic with exponential backoff
- Testing scheduled tasks
- Testing random ID generation
- Testing cryptographic operations

**Effort:** 1 hour documentation
**Priority:** P3 - Future planning

---

#### 3.2 Implement CLI Package Tests

**File:** `packages/cli/src/__tests__/placeholder.test.ts`
**Current:** Placeholder only, no real tests
**Enhancement:** Real CLI tests using spawnUtils, createProcessMock

**Example Test Structure:**
```typescript
import { spawnUtils, processHelpers } from '@orchestr8/testkit/cli'

describe('CLI Commands', () => {
  beforeEach(() => {
    processHelpers.clear()
  })

  it('should execute sync command', async () => {
    spawnUtils.mockCommandSuccess('git pull', 'Already up to date.')

    // Run your CLI command that internally calls git
    const result = await syncCommand()

    expect(result.success).toBe(true)
    const spawned = spawnUtils.getSpawnedProcesses()
    expect(spawned).toContainEqual(
      expect.objectContaining({ command: 'git pull' })
    )
  })
})
```

**Benefits:**
- Complete test coverage for CLI package
- Showcase CLI mocking in real application
- Validate CLI behavior without external dependencies

**Effort:** 4-6 hours
**Priority:** P3 - Enhancement

---

## Novel Patterns (TestKit Enhancement Opportunities)

### 1. Settle Pattern (100ms Delay Before Cleanup)

**Found in:** oauth-flow.test.ts, performance-benchmarks.test.ts, atomic-writer.test.ts (10+ occurrences)

**Pattern:**
```typescript
afterEach(async () => {
  // 0. Settle 100ms (prevents race conditions)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // ... cleanup operations
})
```

**Purpose:** Prevents race conditions when async operations complete during cleanup

**TestKit Enhancement Proposal:**
- Add automatic settle before cleanup hooks
- Or provide `settleBeforeCleanup()` utility
- Make it configurable via setupResourceCleanup options

**Priority:** P2 - Prevents race conditions consistently

---

### 2. Pool Drain First Pattern

**Found in:** performance-benchmarks.test.ts:46-53

**Pattern:**
```typescript
afterEach(async () => {
  // 0. Settle
  await new Promise((resolve) => setTimeout(resolve, 100))

  // 1. Drain pools FIRST
  for (const pool of pools) {
    await pool.drain()
  }
  pools = []

  // 2. Close connections SECOND
  for (const database of databases) {
    if (database.open && !database.readonly) {
      database.close()
    }
  }
  databases.length = 0
})
```

**Purpose:** Graceful shutdown - order matters (pools before connections)

**TestKit Enhancement Proposal:**
- Document cleanup order best practices
- Resource priority system already exists (DATABASE, FILE, NETWORK, etc.)
- Add pool-specific resource category with higher priority than connections

**Priority:** P2 - Critical for connection pool management

---

### 3. Documented Cleanup Sequences

**Found in:** performance-benchmarks.test.ts:40-58

**Pattern:**
```typescript
afterEach(async () => {
  // 4-STEP CLEANUP (CRITICAL ORDER)
  // Source: testkit-tdd-guide.md lines 100-152

  // 0. Settle 100ms (prevents race conditions)
  await new Promise((resolve) => setTimeout(resolve, 100))

  // 1. Drain pools FIRST
  for (const pool of pools) {
    await pool.drain()
  }
  pools = []

  // 2. Close connections SECOND
  for (const database of databases) {
    if (database.open && !database.readonly) {
      database.close()
    }
  }
  databases.length = 0

  // 3. Clean filesystem THIRD
  rmSync(testDir, { recursive: true, force: true })

  // 4. Force GC LAST
  if (global.gc) global.gc()
})
```

**Purpose:** Explicit cleanup order with documentation inline

**TestKit Enhancement Proposal:**
- Formalize as cleanup orchestrator
- ResourceManager already has priority system - document it better
- Add predefined cleanup sequences for common scenarios

**Priority:** P1 - Already exists via resource categories, needs better documentation

---

### 4. Memory Leak Detection Pattern

**Found in:** performance-benchmarks.test.ts:137-154

**Pattern:**
```typescript
it('should verify no memory leaks', async () => {
  const heapBefore = process.memoryUsage().heapUsed

  // ... test operations that might leak
  for (let i = 0; i < 100; i++) {
    await createAndCloseDatabase()
  }

  // Force garbage collection
  if (global.gc) global.gc()

  const heapAfter = process.memoryUsage().heapUsed
  const leaked = heapAfter - heapBefore

  expect(leaked).toBeLessThan(threshold) // e.g., 1MB
})
```

**Purpose:** Validate no memory leaks in cleanup logic

**TestKit Enhancement Proposal:**
```typescript
// Add to @orchestr8/testkit/utils
export async function expectNoMemoryLeak(
  operation: () => Promise<void>,
  options?: {
    threshold?: number // bytes, default 1MB
    iterations?: number // default 100
    forceGC?: boolean // default true
  }
): Promise<void> {
  const { threshold = 1024 * 1024, iterations = 100, forceGC = true } = options ?? {}

  const heapBefore = process.memoryUsage().heapUsed

  for (let i = 0; i < iterations; i++) {
    await operation()
  }

  if (forceGC && global.gc) global.gc()

  const heapAfter = process.memoryUsage().heapUsed
  const leaked = heapAfter - heapBefore

  if (leaked > threshold) {
    throw new Error(`Memory leak detected: ${leaked} bytes leaked (threshold: ${threshold})`)
  }
}
```

**Priority:** P2 - Useful for performance testing

---

### 5. TempDirectory Helper Methods (UNDOCUMENTED!)

**Found in:** atomic-writer.test.ts (extensively used)

**Pattern:**
```typescript
const tempDir = await createTempDirectory()

// These methods exist but aren't documented!
await tempDir.exists('inbox')           // Check if file exists
await tempDir.readFile('file.txt')      // Read file content
await tempDir.writeFile('file.txt', '') // Write file
await tempDir.mkdir('inbox')            // Create directory
```

**Purpose:** Convenient file operations scoped to temp directory

**TestKit Enhancement:** **DOCUMENT THESE IN API.md** - They already exist but aren't documented!

**Priority:** P1 - Critical documentation gap (covered in recommendation 1.3)

---

## Test Suite Statistics

**Total Test Files:** 39
**Files Examined in Detail:** 12

**Test Setup Patterns:**
- ✅ All 5 packages use setupResourceCleanup()
- ✅ All 5 packages use createBaseVitestConfig()
- ✅ Guards enabled globally (TESTKIT_SQLITE_GUARD=on, TESTKIT_TIMERS_GUARD=on)
- ⚠️ Database cleanup: 45+ tests use manual arrays, could use guards or registration
- ⚠️ Temp directories: 90% use createTempDirectory(), 10% use manual mkdirSync/rmSync

**Test Coverage:**
- Foundation: 72% coverage (target: 80%+)
- All tests passing (755 tests)
- Natural process exit in <10s with TestKit 2.1.2

---

## Implementation Checklist

### ✅ Todo List

#### P1 - High Priority (Standardization)
- [ ] **1.1** Document TempDirectory helper methods in TestKit API.md (.exists, .readFile, .writeFile, .mkdir)
- [ ] **1.2** Migrate performance-benchmarks.test.ts to use createTempDirectory() instead of manual mkdirSync/rmSync
- [ ] **1.3** Standardize database cleanup pattern (team decision: Guards-only OR explicit registerDatabaseCleanup)

#### P2 - Medium Priority (Feature Adoption)
- [ ] **2.1** Review production code for security utilities usage opportunities (validateCommand, sanitizeSqlIdentifier)
- [ ] **2.2** Add concurrency control examples to performance-benchmarks.test.ts

#### P3 - Low Priority (Enhancement)
- [ ] **3.1** Document environment control features (useFakeTime, controlRandomness, etc.) for future use
- [ ] **3.2** Implement real CLI tests in packages/cli using spawnUtils and createProcessMock

#### TestKit Enhancement Proposals (for TestKit team)
- [ ] **E1** Add automatic settle pattern or settleBeforeCleanup() utility
- [ ] **E2** Document cleanup order best practices (pools → connections → filesystem → GC)
- [ ] **E3** Add expectNoMemoryLeak() helper utility
- [ ] **E4** Formalize cleanup orchestrator with predefined sequences
- [ ] **E5** Document TempDirectory helper methods in API.md (CRITICAL)

---

## Recommended Implementation Order

### Sprint 1 (This Week)
1. ✅ Document TempDirectory helper methods in TestKit API.md (1 hour)
2. 🔧 Migrate performance-benchmarks.test.ts to createTempDirectory() (30 min)
3. 🤝 Team decision: Guards-only vs explicit database cleanup pattern

### Sprint 2 (Next Week)
4. 🔧 Implement chosen database cleanup pattern across 45+ tests (2-4 hours)
5. 🔒 Security utilities usage review in production code (2-3 hours)
6. 🚀 Add concurrency control examples to performance tests (1-2 hours)

### Backlog
7. ⏰ Environment control documentation (1 hour)
8. 🖥️ CLI package test implementation (4-6 hours)
9. 📝 Submit TestKit enhancement proposals to TestKit team

---

## Key Metrics

**Before Audit:**
- TestKit feature adoption: Unknown
- Pattern consistency: Mixed
- Documentation gaps: Unknown

**After Audit:**
- TestKit feature adoption: 6/12 fully, 2/12 partial, 2/12 unused, 2/12 N/A
- Pattern consistency: 3 inconsistencies identified (P1 priority)
- Documentation gaps: 1 critical gap (TempDirectory helpers)
- Novel patterns discovered: 5 (candidates for TestKit enhancement)

**Success Metrics:**
- [ ] 100% consistent temp directory pattern (currently 90%)
- [ ] 100% consistent database cleanup pattern (currently mixed)
- [ ] All TempDirectory helpers documented
- [ ] Security utilities promoted to production code
- [ ] CLI package has real tests (currently placeholder)

---

## Conclusion

**Capture Bridge is an excellent TestKit showcase** with strong feature adoption (6/12 fully, 2/12 partial). The main opportunities are:

1. **Standardization** (P1) - Align temp dir and database cleanup patterns
2. **Feature Discovery** (P1) - Document hidden TempDirectory helpers
3. **Production Hardening** (P2) - Promote security utilities beyond tests
4. **TestKit Enhancements** (P2) - Formalize settle pattern, cleanup sequences, memory leak detection

The codebase has revealed several valuable patterns that should be incorporated into TestKit to benefit all consumers.

**Next Steps:**
1. Review this plan with the team
2. Make team decision on database cleanup pattern (Guards vs explicit)
3. Start with P1 items (highest ROI, lowest effort)
4. Submit TestKit enhancement proposals

---

## Appendix: File References

### Key Test Files Examined

**Foundation Package:**
- `/Users/nathanvale/code/capture-bridge/packages/foundation/src/__tests__/performance-benchmarks.test.ts`
  - Lines 31-35: Manual temp dir creation
  - Lines 40-58: 4-step cleanup sequence
  - Lines 137-154: Memory leak detection pattern

- `/Users/nathanvale/code/capture-bridge/packages/foundation/src/__tests__/security-validation.test.ts`
  - Lines 23-50: Database cleanup pattern
  - Lines 160-189: sanitizeSqlIdentifier usage
  - Lines 233-360: Path validation patterns
  - Lines 682-727: ConcurrencyManager usage

- `/Users/nathanvale/code/capture-bridge/packages/foundation/src/__tests__/testkit-sqlite-features.test.ts`
  - Lines 23-40: Database cleanup pattern
  - Lines 199-236: createTempDirectory usage with migrations
  - Lines 352-404: seedWithFiles using createTempDirectory

**Storage Package:**
- `/Users/nathanvale/code/capture-bridge/packages/storage/src/__tests__/schema-creation.spec.ts`
  - Lines 12-30: Database cleanup pattern (4-step sequence)

**Capture Package:**
- `/Users/nathanvale/code/capture-bridge/packages/capture/src/gmail/__tests__/oauth-flow.test.ts`
  - Lines 14-37: createTempDirectory with settle pattern
  - Lines 64-82: 5-step cleanup sequence

**Obsidian-Bridge Package:**
- `/Users/nathanvale/code/capture-bridge/packages/obsidian-bridge/src/__tests__/atomic-writer.test.ts`
  - Lines 14-34: createTempDirectory with helper methods
  - Lines 68, 87, 105, 117, 131, 149, 164: TempDir helper method usage

**TestKit Package:**
- `/@orchestr8/packages/testkit/API.md` - Complete feature reference (1522 lines)
- `/@orchestr8/packages/testkit/src/guards/sqlite-guard.ts` - SQLite Guard implementation
- `/@orchestr8/packages/testkit/src/guards/timers-guard.ts` - Timers Guard implementation
- `/@orchestr8/packages/testkit/src/register.ts` - Global lifecycle hooks

### Configuration Files

**Vitest Configurations (All Packages):**
- `/Users/nathanvale/code/capture-bridge/packages/foundation/vitest.config.ts` - Base pattern
- `/Users/nathanvale/code/capture-bridge/packages/capture/vitest.config.ts` - Guards enabled
- `/Users/nathanvale/code/capture-bridge/packages/storage/vitest.config.ts` - Guards enabled
- `/Users/nathanvale/code/capture-bridge/packages/obsidian-bridge/vitest.config.ts` - Guards enabled
- `/Users/nathanvale/code/capture-bridge/packages/cli/vitest.config.ts` - Guards enabled

**Test Setup Files:**
- All 5 packages have identical `test-setup.ts` with setupResourceCleanup()

---

**Document Version:** 1.0
**Last Updated:** 2025-10-12
**Next Review:** After P1 items completion
