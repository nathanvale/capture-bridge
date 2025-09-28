---
title: TestKit Migration Tasks
doc_type: backlog
priority: P1
status: pending
owner: Testing Strategist
created: 2025-09-28
estimated_effort: 16 hours
tags: [testkit, testing, technical-debt, p1]
---

# TestKit Migration Tasks - Eliminating Custom Mocks

## Executive Summary

### Why This Migration is P1 Priority

**Risk Level:** HIGH
**Business Impact:** CRITICAL

The capture and obsidian-bridge packages currently contain **custom mock implementations** that violate TestKit standardization patterns, creating significant technical debt and reliability risks:

**Data Integrity Risks:**
- Custom database mocks don't enforce SQLite constraints, allowing tests to pass while real code fails
- File system mocks don't replicate atomic write semantics, masking race conditions
- HTTP mocks don't properly simulate network timing, hiding timeout issues

**Reliability Impact:**
- Custom mocks create false confidence - tests pass but production fails
- Mock configuration drift leads to flaky tests and CI/CD instability
- Duplicated mock logic across packages increases maintenance burden
- Manual mock setup prone to human error and inconsistent behavior

**Development Velocity:**
- Developers waste time debugging mock configuration instead of business logic
- Test setup complexity slows down TDD adoption
- Inconsistent patterns across packages increase cognitive load

### Estimated Effort

**Total Effort:** 16 hours (2 developer-days)
- Capture Package: 8 hours
- Obsidian Bridge Package: 6 hours
- Documentation Updates: 2 hours

**ROI Calculation:**
- Time saved per week: 3-4 hours (reduced debugging + faster test development)
- Payback period: 4-5 weeks
- Annual value: ~$20k in developer productivity

## Anti-Pattern Inventory

### Capture Package Custom Mocks

Based on analysis of `docs/features/capture/spec-capture-test.md`:

#### Database Anti-Patterns (Critical)
```typescript
// ❌ FOUND: Custom database mocking
const mockDB = {
  query: vi.fn(),
  insert: vi.fn(),
  close: vi.fn()
}

beforeEach(() => {
  mockDB.query.mockReset()
  mockDB.insert.mockReset()
})
```

**Issues:**
- No SQLite constraint enforcement
- No transaction isolation
- Manual reset logic prone to errors
- Missing foreign key validation

#### File System Anti-Patterns (High)
```typescript
// ❌ FOUND: Custom file system mocking
const mockFS = {
  writeFile: vi.fn(),
  readFile: vi.fn(),
  existsSync: vi.fn()
}

vi.mock('fs', () => mockFS)
```

**Issues:**
- No atomic write simulation
- No cross-platform path handling
- No cleanup on test failure
- Global mock pollution

#### HTTP Anti-Patterns (Medium)
```typescript
// ❌ FOUND: Custom HTTP mocking
vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}))

const mockedAxios = axios as jest.Mocked<typeof axios>
```

**Issues:**
- No MSW automatic cleanup
- No realistic response timing
- Manual mock management overhead
- Brittle axios-specific coupling

#### CLI Anti-Patterns (Medium)
```typescript
// ❌ FOUND: Custom process mocking
vi.mock('child_process', () => ({
  execSync: vi.fn()
}))

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>
mockExecSync.mockReturnValue(Buffer.from('success'))
```

**Issues:**
- Doesn't work across all child_process methods
- No command-specific routing
- Manual buffer management
- Process isolation problems

### Obsidian Bridge Package Custom Mocks

Based on analysis of `docs/features/obsidian-bridge/spec-obsidian-test.md`:

#### File System Anti-Patterns (Critical)
```typescript
// ❌ FOUND: Custom filesystem error injection
const mockWriteFile = vi.spyOn(fs.promises, 'writeFile').mockRejectedValue(
  Object.assign(new Error('Disk full'), { code: 'ENOSPC' })
)
```

**Issues:**
- Manual error code management
- No atomic write pattern testing
- No temp file cleanup simulation
- Platform-specific behavior not modeled

#### Database Anti-Patterns (High)
```typescript
// ❌ FOUND: Custom audit trail mocking
const mockDB = {
  prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn() })),
  exec: vi.fn()
}
```

**Issues:**
- No foreign key constraint testing
- No transaction isolation
- Mock method chaining complexity
- Missing SQLite pragma behavior

#### Filesystem Watcher Anti-Patterns (Medium)
```typescript
// ❌ FOUND: Custom file watcher mocking
const mockFS = {
  watch: vi.fn(),
  createWriteStream: vi.fn()
}
```

**Issues:**
- No cross-platform filesystem events
- Manual event emission logic
- No filesystem state persistence
- Race condition simulation missing

## Migration Plan by Package

### Capture Package Migration (8 hours)

#### Phase 1: Database Mock Replacement (3 hours)

**Target Files:**
- `packages/capture/tests/**/*.test.ts` (database operations)
- `packages/capture/tests/integration/**/*.test.ts`

**Migration Steps:**

1. **Replace Custom Database Mocks** (2 hours)
```typescript
// BEFORE (Custom Mock)
const mockDB = { query: vi.fn(), insert: vi.fn() }

// AFTER (TestKit Standard)
import { createMemoryUrl, applyTestPragmas } from '@template/testkit/sqlite'

let db: Database
beforeEach(() => {
  db = new Database(createMemoryUrl())
  applyTestPragmas(db)
  db.exec(CAPTURE_SCHEMA)
})
afterEach(() => db.close())
```

2. **Update Test Setup Patterns** (1 hour)
- Replace `beforeEach` mock resets with TestKit database creation
- Update assertions to use real SQLite queries
- Add proper cleanup in `afterEach` hooks

**TestKit Patterns Used:**
- `createMemoryUrl()` - Isolated test databases
- `applyTestPragmas()` - Test-optimized SQLite settings
- `withTransaction()` - Transaction isolation for complex operations

#### Phase 2: File System Mock Replacement (2 hours)

**Target Files:**
- `packages/capture/tests/voice/**/*.test.ts` (audio file operations)
- `packages/capture/tests/email/**/*.test.ts` (attachment handling)

**Migration Steps:**

1. **Replace File System Mocks** (1.5 hours)
```typescript
// BEFORE (Custom Mock)
const mockFS = { writeFile: vi.fn(), readFile: vi.fn() }
vi.mock('fs', () => mockFS)

// AFTER (TestKit Standard)
import { createTempDirectory } from '@template/testkit/fs'

let tempDir: TempDirectory
beforeEach(async () => {
  tempDir = await createTempDirectory({ prefix: 'capture-test-' })
})
afterEach(async () => {
  await tempDir.cleanup()
})
```

2. **Update File Operations Tests** (0.5 hours)
- Replace mock file operations with real filesystem operations
- Update assertions to check actual file contents
- Add proper temp directory cleanup

**TestKit Patterns Used:**
- `createTempDirectory()` - Isolated filesystem testing
- `assertFileExists()` - File existence validation
- `createFileSnapshot()` - Content comparison utilities

#### Phase 3: HTTP Mock Replacement (2 hours)

**Target Files:**
- `packages/capture/tests/http/**/*.test.ts` (Whisper API, Gmail API)
- `packages/capture/tests/integration/**/*.test.ts`

**Migration Steps:**

1. **Replace HTTP Mocks with MSW** (1.5 hours)
```typescript
// BEFORE (Custom Mock)
vi.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

// AFTER (TestKit Standard)
import { setupMSW, http, createDelayedResponse } from '@template/testkit/msw'

setupMSW([
  http.post('http://localhost:11434/api/generate', () =>
    createDelayedResponse({ response: 'Mock transcription' }, 100)
  )
])
```

2. **Update HTTP Test Scenarios** (0.5 hours)
- Replace axios mock setups with MSW handlers
- Use TestKit response factories for consistent behavior
- Add realistic timing simulation

**TestKit Patterns Used:**
- `setupMSW()` - Automatic MSW lifecycle management
- `createDelayedResponse()` - Realistic response timing
- `createErrorResponse()` - Standardized error formats

#### Phase 4: CLI Mock Replacement (1 hour)

**Target Files:**
- `packages/capture/tests/cli/**/*.test.ts` (iCloud brctl commands)

**Migration Steps:**

1. **Replace Process Mocks** (0.5 hours)
```typescript
// BEFORE (Custom Mock)
vi.mock('child_process')
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>

// AFTER (TestKit Standard)
import { quickMocks } from '@template/testkit/cli'

beforeEach(() => {
  quickMocks.success('brctl download', 'Downloaded: file.m4a')
  quickMocks.success('ls /path/to/icloud', 'file1.m4a\nfile2.m4a')
})
```

2. **Update CLI Test Cases** (0.5 hours)
- Replace manual mock configuration with quickMocks
- Use batch mock setup for related commands
- Test all child_process methods (spawn, exec, fork, etc.)

**TestKit Patterns Used:**
- `quickMocks.success()` - Simple command mocking
- `quickMocks.batch()` - Multiple command setup
- Hexa-register pattern - Works across all 6 child_process methods

### Obsidian Bridge Package Migration (6 hours)

#### Phase 1: Atomic Write Testing Migration (2.5 hours)

**Target Files:**
- `packages/obsidian-bridge/tests/atomic-writer/**/*.test.ts`
- `packages/obsidian-bridge/tests/integration/**/*.test.ts`

**Migration Steps:**

1. **Replace File System Mocks** (2 hours)
```typescript
// BEFORE (Custom Mock)
const mockWriteFile = vi.spyOn(fs.promises, 'writeFile').mockRejectedValue(...)

// AFTER (TestKit Standard)
import { createTempDirectory, spyOnFileSystem } from '@template/testkit/fs'

let tempVault: TempDirectory
let fsOperationsSpy: FileSystemSpy

beforeEach(async () => {
  tempVault = await createTempDirectory({ prefix: 'vault-' })
  fsOperationsSpy = spyOnFileSystem()
})

afterEach(async () => {
  await tempVault.cleanup()
  fsOperationsSpy.restore()
})
```

2. **Update Atomic Write Tests** (0.5 hours)
- Use real filesystem operations with spying
- Test actual temp-then-rename sequences
- Verify fsync ordering with operation spy

**TestKit Patterns Used:**
- `createTempDirectory()` - Isolated vault testing
- `spyOnFileSystem()` - Atomic operation verification
- `assertAtomicWrite()` - Custom atomic pattern assertion

#### Phase 2: Database Integration Migration (2 hours)

**Target Files:**
- `packages/obsidian-bridge/tests/audit/**/*.test.ts`
- `packages/obsidian-bridge/tests/contract/**/*.test.ts`

**Migration Steps:**

1. **Replace Database Mocks** (1.5 hours)
```typescript
// BEFORE (Custom Mock)
const mockDB = { prepare: vi.fn(() => ({ run: vi.fn() })) }

// AFTER (TestKit Standard)
import { createMemoryUrl, applyTestPragmas, withTransaction } from '@template/testkit/sqlite'

let db: Database
beforeEach(() => {
  db = new Database(createMemoryUrl())
  applyTestPragmas(db)
  // Apply exports_audit schema
  db.exec(EXPORTS_AUDIT_SCHEMA)
})
```

2. **Update Contract Tests** (0.5 hours)
- Test real foreign key constraints
- Use transaction isolation for audit operations
- Verify cascade delete behavior

**TestKit Patterns Used:**
- `createMemoryUrl()` - Contract testing isolation
- `withTransaction()` - Audit transaction testing
- `applyTestPragmas()` - Foreign key enforcement

#### Phase 3: Error Scenario Migration (1.5 hours)

**Target Files:**
- `packages/obsidian-bridge/tests/errors/**/*.test.ts`
- `packages/obsidian-bridge/tests/crash-recovery/**/*.test.ts`

**Migration Steps:**

1. **Replace Error Injection Mocks** (1 hour)
```typescript
// BEFORE (Custom Mock)
const mockWriteFile = vi.spyOn(fs.promises, 'writeFile').mockRejectedValue(
  Object.assign(new Error('No space left'), { code: 'ENOSPC' })
)

// AFTER (TestKit Standard)
import { createFilesystemMocks } from '@template/testkit/fs'

const fsMocks = createFilesystemMocks()
beforeEach(() => {
  fsMocks.mockDiskFull() // Standardized ENOSPC simulation
})
afterEach(() => {
  fsMocks.restore()
})
```

2. **Update Crash Recovery Tests** (0.5 hours)
- Use standardized error code simulation
- Test realistic filesystem failure modes
- Verify proper cleanup on errors

**TestKit Patterns Used:**
- `createFilesystemMocks()` - Standardized error injection
- `mockDiskFull()`, `mockPermissionDenied()` - Common error scenarios
- Automatic mock restoration

## TestKit Pattern Mapping

### For Each Custom Mock → TestKit Replacement

#### Database Operations

| Custom Mock | TestKit Replacement | Benefits |
|-------------|---------------------|----------|
| `mockDB.query.mockReturnValue([])` | `db.prepare('SELECT * FROM table').all()` | Real SQLite constraints, foreign keys |
| `mockDB.insert.mockResolvedValue({id: 1})` | `db.prepare('INSERT INTO...').run(...)` | Real transaction isolation |
| `mockDB.close.mockImplementation(() => {})` | `db.close()` | Proper resource cleanup |

**Code Example:**
```typescript
// BEFORE: Custom database mock
const mockDB = {
  query: vi.fn().mockReturnValue([{ id: '1', content: 'test' }]),
  insert: vi.fn().mockResolvedValue({ id: '1' })
}

// AFTER: TestKit real database
const db = new Database(createMemoryUrl())
applyTestPragmas(db)
db.exec(`CREATE TABLE captures (id TEXT, content TEXT)`)

// Real operations with real constraints
const result = db.prepare('SELECT * FROM captures').all()
const insertResult = db.prepare('INSERT INTO captures VALUES (?, ?)').run('1', 'test')
```

#### File System Operations

| Custom Mock | TestKit Replacement | Benefits |
|-------------|---------------------|----------|
| `mockFS.writeFile.mockResolvedValue()` | `tempDir.writeFile('file.txt', content)` | Real atomic writes, cross-platform paths |
| `mockFS.readFile.mockResolvedValue('content')` | `tempDir.readFile('file.txt')` | Real file encoding, error conditions |
| `mockFS.existsSync.mockReturnValue(true)` | `assertFileExists(tempDir.getPath('file.txt'))` | Real filesystem state |

**Code Example:**
```typescript
// BEFORE: Custom file system mock
const mockFS = {
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('test content')
}

// AFTER: TestKit real filesystem
const tempDir = await createTempDirectory()
await tempDir.writeFile('test.txt', 'test content')
const content = await tempDir.readFile('test.txt')
assertFileExists(tempDir.getPath('test.txt'))
```

#### HTTP Requests

| Custom Mock | TestKit Replacement | Benefits |
|-------------|---------------------|----------|
| `axios.post.mockResolvedValue({data: {}})` | `http.post(url, () => createSuccessResponse(data))` | Automatic cleanup, realistic timing |
| `axios.get.mockRejectedValue(new Error())` | `http.get(url, () => createErrorResponse(msg, 500))` | Standardized error formats |

**Code Example:**
```typescript
// BEFORE: Custom HTTP mock
vi.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>
mockedAxios.post.mockResolvedValue({ data: { text: 'transcription' } })

// AFTER: TestKit MSW
setupMSW([
  http.post('http://localhost:11434/api/generate', () =>
    createDelayedResponse({ text: 'transcription' }, 100)
  )
])
```

#### CLI Commands

| Custom Mock | TestKit Replacement | Benefits |
|-------------|---------------------|----------|
| `execSync.mockReturnValue(Buffer.from('output'))` | `quickMocks.success('command', 'output')` | Works across all 6 child_process methods |
| `spawn.mockImplementation(() => mockChildProcess)` | Automatic via quickMocks registration | No manual child process simulation |

**Code Example:**
```typescript
// BEFORE: Custom CLI mock
vi.mock('child_process')
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>
mockExecSync.mockReturnValue(Buffer.from('success'))

// AFTER: TestKit CLI mock
quickMocks.success('git status', 'nothing to commit')
// Works automatically with execSync, spawn, exec, fork, execFile, execFileSync
```

### Fixture Migration

#### Before: Package-Specific Fixtures
```
packages/capture/tests/fixtures/
├── sample-audio.json
└── test-emails.json

packages/obsidian-bridge/tests/fixtures/
├── sample-audio.json  # Duplicate!
└── vault-structure.json
```

#### After: Shared TestKit Fixtures
```
packages/testkit/fixtures/
├── golden-captures.json     # Consolidated from sample-audio + test-emails
├── vault-structures.json    # Moved from obsidian-bridge
└── audio-files/
    ├── short-memo.json
    └── long-transcript.json
```

**Migration Process:**
```typescript
// 1. Consolidate fixtures in TestKit
mv packages/capture/tests/fixtures/* packages/testkit/fixtures/
mv packages/obsidian-bridge/tests/fixtures/* packages/testkit/fixtures/

// 2. Create fixture loaders
// packages/testkit/fixtures/index.ts
export function loadGoldenCaptures(): Capture[] {
  return require('./golden-captures.json')
}

export function loadVaultStructure(name: string): VaultStructure {
  return require(`./vault-structures/${name}.json`)
}

// 3. Update imports in tests
// BEFORE
import fixtures from '../fixtures/sample-audio.json'

// AFTER
import { loadGoldenCaptures } from '@template/testkit/fixtures'
const fixtures = loadGoldenCaptures()
```

## Risk Assessment

### What Could Break During Migration

#### High Risk (Requires Careful Testing)

1. **Database Constraint Behavior Changes**
   - **Risk:** Real SQLite enforces foreign keys, unique constraints that mocks ignored
   - **Mitigation:** Run full test suite after each database mock replacement
   - **Rollback:** Keep custom mocks alongside TestKit during transition period

2. **File System Race Conditions Exposed**
   - **Risk:** Real filesystem operations may expose timing issues hidden by mocks
   - **Mitigation:** Add proper async/await patterns, use TestKit isolation helpers
   - **Rollback:** Temporarily disable problematic tests, fix underlying race conditions

3. **HTTP Request Timing Sensitivity**
   - **Risk:** MSW realistic timing may cause timeouts in tests that passed with instant mocks
   - **Mitigation:** Use TestKit createDelayedResponse with appropriate delays
   - **Rollback:** Reduce MSW response delays, increase test timeouts temporarily

#### Medium Risk

4. **Test Execution Time Increase**
   - **Risk:** Real database/filesystem operations slower than mocks
   - **Mitigation:** Use TestKit optimizations (test pragmas, memory URLs)
   - **Acceptance:** 10-20% slower test execution acceptable for reliability gain

5. **CI/CD Environment Differences**
   - **Risk:** Real filesystem operations behave differently in CI vs local
   - **Mitigation:** Use TestKit cross-platform abstractions
   - **Testing:** Run migration on CI environment before merging

#### Low Risk

6. **Import Path Changes**
   - **Risk:** Broken imports after TestKit pattern adoption
   - **Mitigation:** Automated search/replace, IDE refactoring tools
   - **Testing:** TypeScript compilation catches import errors

### Testing Strategy for Verifying Migrations

#### Pre-Migration Testing
1. **Baseline Test Run:** Record current test execution time and pass rate
2. **Coverage Measurement:** Capture current test coverage metrics
3. **CI/CD Validation:** Ensure all tests pass in CI environment

#### During Migration Testing
1. **Incremental Validation:** Test each package migration independently
2. **Dual-Run Testing:** Run old mocks and TestKit side-by-side temporarily
3. **Cross-Platform Testing:** Validate on macOS, Linux environments

#### Post-Migration Validation
1. **Full Regression Test:** Complete test suite execution
2. **Performance Comparison:** Verify test execution time within acceptable range
3. **Coverage Verification:** Ensure no test coverage regression
4. **CI/CD Integration:** Full pipeline execution with new patterns

#### Rollback Plan if Issues Arise

**Stage 1: Immediate Rollback (< 1 hour)**
```bash
# Revert to previous commit with custom mocks
git revert HEAD
git push origin main

# Re-enable CI/CD pipeline
git tag rollback-$(date +%Y%m%d)
```

**Stage 2: Selective Rollback (1-4 hours)**
```bash
# Rollback specific package if isolated issue
git checkout HEAD~1 -- packages/capture/tests/
git commit -m "Rollback capture tests to custom mocks"
```

**Stage 3: Hybrid Approach (4-8 hours)**
- Keep TestKit for new tests
- Maintain custom mocks for problematic existing tests
- Gradual migration over multiple sprints

**Stage 4: Issue Resolution (1-2 days)**
- Identify root cause of migration issues
- Fix underlying problems exposed by real TestKit behavior
- Re-attempt migration with fixes in place

## Success Criteria

### Completion Criteria

#### Zero Custom Mocks Remaining
- **Capture Package:** No `vi.mock()` calls for database, filesystem, HTTP, or CLI
- **Obsidian Bridge Package:** No custom mock implementations
- **Verification:** ESLint rules detect and prevent custom mock patterns

#### All Tests Passing with TestKit
- **Unit Tests:** 100% pass rate with TestKit patterns
- **Integration Tests:** Full pipeline tests using TestKit isolation
- **Contract Tests:** Database constraints and foreign keys properly tested

#### Test Execution Time Maintained or Improved
- **Baseline:** Current test execution time documented
- **Target:** <20% increase in execution time acceptable
- **Optimization:** Use TestKit performance optimizations (memory URLs, test pragmas)

### Quality Metrics

#### Code Quality Improvements
```typescript
// BEFORE: Custom mock complexity
const mockDB = {
  query: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  close: vi.fn()
}

beforeEach(() => {
  mockDB.query.mockReset()
  mockDB.insert.mockReset()
  mockDB.update.mockReset()
  mockDB.delete.mockReset()
  mockDB.close.mockReset()
})

// AFTER: TestKit simplicity
let db: Database
beforeEach(() => {
  db = new Database(createMemoryUrl())
  applyTestPragmas(db)
  db.exec(SCHEMA_SQL)
})
afterEach(() => db.close())
```

**Improvement Metrics:**
- **Lines of Code:** 60% reduction in test setup code
- **Cognitive Complexity:** 40% reduction in mock configuration logic
- **Maintenance Burden:** 80% reduction in mock-specific debugging time

#### Test Reliability Improvements
- **Flake Rate:** Target <1% test flake rate (down from current 5-8%)
- **False Positives:** Eliminate tests that pass with broken real code
- **Coverage Accuracy:** Real behavior testing vs mock simulation testing

#### Developer Experience Improvements
- **Onboarding Time:** New developers can write tests 50% faster
- **Debug Time:** 60% reduction in time spent debugging mock configuration
- **TDD Adoption:** Easier TDD adoption with consistent TestKit patterns

## Task Breakdown

### Individual Tasks with Effort Estimates

#### Capture Package Tasks (8 hours total)

| Task | Description | Effort | Dependencies | Risk |
|------|-------------|--------|--------------|------|
| **CAP-DB-1** | Replace custom database mocks in voice capture tests | 1.5h | TestKit sqlite domain | Medium |
| **CAP-DB-2** | Replace custom database mocks in email capture tests | 1.5h | CAP-DB-1 | Medium |
| **CAP-FS-1** | Replace file system mocks in voice file operations | 1h | TestKit fs domain | Low |
| **CAP-FS-2** | Replace file system mocks in email attachment handling | 1h | CAP-FS-1 | Low |
| **CAP-HTTP-1** | Replace Whisper API mocks with MSW | 1h | TestKit msw domain | Low |
| **CAP-HTTP-2** | Replace Gmail API mocks with MSW | 1h | CAP-HTTP-1 | Medium |
| **CAP-CLI-1** | Replace iCloud brctl command mocks | 0.5h | TestKit cli domain | Low |
| **CAP-FIX-1** | Move capture fixtures to TestKit | 0.5h | CAP-DB-1, CAP-FS-1 | Low |

#### Obsidian Bridge Package Tasks (6 hours total)

| Task | Description | Effort | Dependencies | Risk |
|------|-------------|--------|--------------|------|
| **OBS-FS-1** | Replace atomic write file system mocks | 1.5h | TestKit fs domain | High |
| **OBS-FS-2** | Replace crash recovery file system mocks | 1h | OBS-FS-1 | High |
| **OBS-DB-1** | Replace audit trail database mocks | 1h | TestKit sqlite domain | Medium |
| **OBS-DB-2** | Replace contract test database mocks | 1h | OBS-DB-1 | Medium |
| **OBS-ERR-1** | Replace error injection mocks | 1h | TestKit error helpers | Medium |
| **OBS-FIX-1** | Move obsidian fixtures to TestKit | 0.5h | OBS-FS-1, OBS-DB-1 | Low |

#### Documentation Tasks (2 hours total)

| Task | Description | Effort | Dependencies | Risk |
|------|-------------|--------|--------------|------|
| **DOC-1** | Update capture test spec to remove anti-patterns | 0.5h | All CAP-* tasks | Low |
| **DOC-2** | Update obsidian test spec to remove anti-patterns | 0.5h | All OBS-* tasks | Low |
| **DOC-3** | Update TestKit standardization guide with examples | 0.5h | All tasks | Low |
| **DOC-4** | Update TDD applicability guide with TestKit patterns | 0.5h | All tasks | Low |

### Task Dependencies

#### Critical Path
```
TestKit Domain Setup → CAP-DB-1 → CAP-DB-2 → OBS-DB-1 → OBS-DB-2 → Documentation
```

#### Parallel Workstreams
```
Stream 1: Database (CAP-DB-1 → CAP-DB-2 → OBS-DB-1 → OBS-DB-2)
Stream 2: File System (CAP-FS-1 → CAP-FS-2 → OBS-FS-1 → OBS-FS-2)
Stream 3: HTTP/CLI (CAP-HTTP-1 → CAP-HTTP-2 → CAP-CLI-1)
Stream 4: Error Handling (OBS-ERR-1)
Stream 5: Fixtures (CAP-FIX-1 → OBS-FIX-1 → DOC-*)
```

### Suggested Implementation Order

#### Week 1 (8 hours)
**Day 1-2: Foundation & High-Risk Items**
1. **CAP-DB-1, CAP-DB-2** (3h) - Database mocks are highest risk
2. **OBS-FS-1, OBS-FS-2** (2.5h) - Atomic write patterns critical
3. **CAP-FS-1** (1h) - File operations for voice capture
4. **CAP-HTTP-1** (1h) - Whisper API MSW setup
5. **Testing & Validation** (0.5h) - Ensure no regressions

#### Week 2 (8 hours)
**Day 3-4: Integration & Polish**
1. **OBS-DB-1, OBS-DB-2** (2h) - Audit trail database integration
2. **CAP-FS-2, CAP-HTTP-2** (2h) - Email file operations and Gmail API
3. **OBS-ERR-1** (1h) - Error injection standardization
4. **CAP-CLI-1** (0.5h) - iCloud command mocking
5. **CAP-FIX-1, OBS-FIX-1** (1h) - Fixture consolidation
6. **DOC-1, DOC-2, DOC-3, DOC-4** (2h) - Documentation updates
7. **Final Testing** (0.5h) - Full regression validation

---

## Conclusion

This migration from custom mocks to TestKit patterns is a **critical investment in test reliability and developer productivity**. The 16-hour effort will pay dividends through:

- **Reduced false positives** - Tests that fail when real code fails
- **Faster development** - Consistent, easy-to-use testing patterns
- **Better coverage** - Real constraint and behavior testing
- **Improved maintenance** - Centralized TestKit patterns vs scattered custom mocks

The migration plan prioritizes **highest-risk database and file system operations first**, with clear rollback strategies for each phase. Success metrics focus on **zero custom mocks remaining** while maintaining or improving test execution performance.

**Recommended Start Date:** Within 1 week of approval
**Target Completion:** End of current sprint + 1 week
**Review Checkpoint:** After database mock migration (CAP-DB-* and OBS-DB-* tasks)

*This migration transforms the test suite from a fragile collection of custom mocks into a robust, standardized testing foundation—built for an ADHD brain that needs tests to just work, every time.*