---
title: Obsidian Bridge Test Specification
status: draft
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-27
spec_type: test
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Obsidian Bridge — Test Specification

## 1. Executive Summary

This test specification defines comprehensive testing for the **Obsidian Bridge** atomic writer component, ensuring zero partial writes, zero vault corruption, and deterministic ULID-based filenames. Tests verify atomic temp-then-rename semantics, collision handling, and audit trail integrity through TDD-driven development.

**Key Testing Principle:** The bridge is a **critical data integrity component** requiring 100% coverage of atomic write operations, collision detection, and failure recovery paths.

### Alignment

- **Feature PRD:** prd-obsidian.md v1.0.0-MPPP
- **Architecture Spec:** spec-obsidian-arch.md v1.0.0-MPPP
- **Tech Spec:** spec-obsidian-tech.md v1.0.0-MPPP
- **TDD Guide:** ../../guides/tdd-applicability.md v1.0.0
- **TestKit Guide:** ../../guides/guide-testkit-usage.md v0.1.0

---

## 2. TDD Applicability Decision

### Risk Assessment

**Risk Level:** **HIGH**

**Justification:**
- **Data loss risk:** Vault corruption = permanent data loss (P0 failure mode)
- **Sync conflicts:** Partial writes create Obsidian Sync conflicts + user anxiety
- **Integrity violations:** ULID collisions with different content = data corruption
- **Atomicity failures:** fsync timing bugs = silent data loss until crash
- **File system races:** Concurrent access during atomic rename operations

### TDD Decision

**Decision:** **TDD Required**

**Scope Under TDD:**
- **Unit Tests:** AtomicWriter contract, path resolution, collision detection, content formatting
- **Integration Tests:** End-to-end atomic write with filesystem, SQLite audit trail integration
- **Contract Tests:** `exports_audit` foreign key constraints, filesystem atomicity guarantees

**Out-of-Scope (YAGNI):**
- Multi-vault support (single vault assumption in Phase 1)
- Template-based filename generation (ULID-only in Phase 1)
- Daily note backlinks (deferred to Phase 3+)
- PARA classification (deferred to Phase 3+)
- Visual UI testing (no UI component in atomic writer)

**Trigger to Revisit:**
- Export failure rate > 5% (indicates reliability regression)
- ULID collision detected in production (requires investigation)
- Obsidian Sync conflicts reported (atomic rename not working)
- Phase 2 introduces multi-vault support (needs new contract tests)

---

## 3. Test Strategy & Coverage

### 3.1 Test Pyramid Structure

| Test Layer | Purpose | Coverage Target | Tooling |
|------------|---------|-----------------|---------|
| **Unit Tests** | Pure logic, path resolution, collision detection | 100% | Vitest + TestKit |
| **Integration Tests** | End-to-end atomic write + audit trail | 100% critical paths | Vitest + TestKit/fs + TestKit/sqlite |
| **Contract Tests** | SQLite foreign keys, filesystem atomicity | 100% | Vitest + TestKit/sqlite |
| **Failure Tests** | Error handling, crash recovery | 100% error paths | Vitest + TestKit mocks |

### 3.2 Critical Test Categories

#### P0 Tests (Data Integrity - Required)

1. **Atomic Write Guarantees**
   - Temp file → fsync → rename sequence
   - No partial files visible during write
   - Crash recovery leaves no partial writes
   - All-or-nothing export guarantee

2. **Collision Detection & Handling**
   - NO_COLLISION: Normal write path
   - DUPLICATE: Same ULID + same content hash → skip write
   - CONFLICT: Same ULID + different content hash → CRITICAL error

3. **Audit Trail Integrity**
   - Every successful export logged in `exports_audit`
   - Foreign key constraints enforced
   - Duplicate exports marked correctly
   - Failed exports logged to `errors_log`

4. **Content Hash Deduplication**
   - SHA-256 computation deterministic
   - Content normalization consistent
   - Idempotent retry behavior

#### P1 Tests (Operational Reliability - Recommended)

1. **Error Recovery Paths**
   - EACCES (permission denied) → retry eligible
   - ENOSPC (disk full) → halt worker
   - EROFS (read-only filesystem) → halt worker
   - ENETDOWN (network mount) → retry eligible

2. **Filesystem Edge Cases**
   - Directory creation (idempotent)
   - Temp file cleanup on failure
   - Export path validation
   - Cross-filesystem mount detection

#### P2 Tests (Edge Cases - Optional)

1. **Performance Characteristics**
   - Export latency < 50ms p95
   - Memory usage during large file writes
   - Concurrent write detection (Phase 2+)

### 3.3 TestKit Integration Strategy

**⚠️ TestKit Standardization Required:**
All tests MUST use TestKit patterns per [TestKit Standardization Guide](../../guides/guide-testkit-standardization.md). Custom mocks using `vi.spyOn` are forbidden. Use TestKit fault injection for error scenarios.

**Primary TestKit Domains Used:**

1. **File System Domain** (`@template/testkit/fs`)
   - `createTempDirectory()` for isolated vault testing
   - `useTempDirectory()` for auto-cleanup test setup
   - `assertFileExists()` for export verification
   - `createFileSnapshot()` for content comparison

2. **SQLite Domain** (`@template/testkit/sqlite`)
   - `createMemoryUrl()` for isolated database testing
   - `applyTestPragmas()` for test-optimized SQLite
   - `withTransaction()` for audit trail testing
   - `resetDatabase()` for test isolation

3. **Environment Domain** (`@template/testkit/env`)
   - `useFakeTimers()` for timestamp control
   - `controlRandomness()` for deterministic ULID generation
   - `setSystemTime()` for audit timestamp testing

4. **Utils Domain** (`@template/testkit/utils`)
   - `delay()` for async operation testing
   - `retry()` for error recovery testing
   - `withTimeout()` for performance validation

**TestKit Pattern Usage:**

```typescript
// Standard test setup pattern
import { createTempDirectory, createMemoryUrl, useFakeTimers, controlRandomness } from '@template/testkit'

beforeEach(async () => {
  // Isolated filesystem
  const tempVault = await createTempDirectory({ prefix: 'obsidian-test-' })

  // Isolated database
  const dbUrl = createMemoryUrl()
  const db = new Database(dbUrl)
  applyTestPragmas(db)

  // Deterministic behavior
  useFakeTimers({ now: new Date('2025-09-27T10:00:00Z') })
  controlRandomness(12345)
})
```

---

## 4. Test Scenarios & Acceptance Criteria

### 4.1 Unit Test Scenarios

#### Test Suite: Path Resolution (`path-resolver.test.ts`)

**Test Cases:**

```typescript
describe('Path Resolution', () => {
  it('should generate correct temp path from ULID', () => {
    const result = resolveTempPath('/vault', '01HZVM8YWRQT5J3M3K7YPTX9RZ')
    expect(result).toBe('/vault/.trash/01HZVM8YWRQT5J3M3K7YPTX9RZ.tmp')
  })

  it('should generate correct export path from ULID', () => {
    const result = resolveExportPath('/vault', '01HZVM8YWRQT5J3M3K7YPTX9RZ')
    expect(result).toBe('/vault/inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
  })

  it('should reject invalid ULID format', () => {
    expect(() => resolveTempPath('/vault', 'invalid-ulid')).toThrow('Invalid capture_id format')
    expect(() => resolveTempPath('/vault', '../../../etc/passwd')).toThrow('Invalid capture_id format')
  })

  it('should handle special characters in vault path', () => {
    const result = resolveTempPath('/vault with spaces', '01HZVM8YWRQT5J3M3K7YPTX9RZ')
    expect(result).toBe('/vault with spaces/.trash/01HZVM8YWRQT5J3M3K7YPTX9RZ.tmp')
  })
})
```

#### Test Suite: Collision Detection (`collision-detector.test.ts`)

**Test Cases:**

```typescript
describe('Collision Detection', () => {
  it('should return NO_COLLISION when file does not exist', async () => {
    const result = await checkCollision('/nonexistent/file.md', 'hash123')
    expect(result).toBe(CollisionResult.NO_COLLISION)
  })

  it('should return DUPLICATE when file exists with same content hash', async () => {
    // Setup: Create file with known content
    const tempDir = await createTempDirectory()
    const content = 'test content'
    const hash = computeSHA256(content)
    await tempDir.writeFile('test.md', content)

    const result = await checkCollision(tempDir.getPath('test.md'), hash)
    expect(result).toBe(CollisionResult.DUPLICATE)
  })

  it('should return CONFLICT when file exists with different content hash', async () => {
    // Setup: Create file with different content
    const tempDir = await createTempDirectory()
    await tempDir.writeFile('test.md', 'original content')

    const differentHash = computeSHA256('different content')
    const result = await checkCollision(tempDir.getPath('test.md'), differentHash)
    expect(result).toBe(CollisionResult.CONFLICT)
  })
})
```

#### Test Suite: Content Formatting (`markdown-formatter.test.ts`)

**Test Cases:**

```typescript
describe('Markdown Formatting', () => {
  it('should format voice capture with correct frontmatter', () => {
    const capture = {
      id: '01HZVM8YWRQT5J3M3K7YPTX9RZ',
      source: 'voice',
      content: 'This is a test transcription',
      content_hash: 'abc123',
      captured_at: '2025-09-27T10:00:00Z'
    }

    const result = formatMarkdownExport(capture)

    expect(result).toContain('---')
    expect(result).toContain('id: 01HZVM8YWRQT5J3M3K7YPTX9RZ')
    expect(result).toContain('source: voice')
    expect(result).toContain('content_hash: abc123')
    expect(result).toContain('This is a test transcription')
  })

  it('should format email capture with correct metadata', () => {
    const capture = {
      id: '01HZVM8YWRQT5J3M3K7YPTX9RZ',
      source: 'email',
      content: 'Email body content',
      content_hash: 'def456',
      captured_at: '2025-09-27T10:00:00Z',
      meta_json: { from: 'test@example.com', subject: 'Test Subject' }
    }

    const result = formatMarkdownExport(capture)

    expect(result).toContain('source: email')
    expect(result).toContain('From: test@example.com')
    expect(result).toContain('Subject: Test Subject')
  })
})
```

### 4.2 Integration Test Scenarios

#### Test Suite: Atomic Write Operations (`atomic-writer.integration.test.ts`)

**Test Cases:**

```typescript
describe('Atomic Write Operations', () => {
  let tempVault: TempDirectory
  let db: Database
  let atomicWriter: ObsidianAtomicWriter

  beforeEach(async () => {
    tempVault = await createTempDirectory({ prefix: 'vault-' })
    db = new Database(createMemoryUrl())
    applyTestPragmas(db)
    await setupCapturesTable(db)
    atomicWriter = new ObsidianAtomicWriter(tempVault.path, db)

    useFakeTimers({ now: new Date('2025-09-27T10:00:00Z') })
  })

  it('should perform complete atomic write with audit trail', async () => {
    const capture_id = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
    const content = '---\nid: test\n---\nTest content'

    const result = await atomicWriter.writeAtomic(capture_id, content, tempVault.path)

    // Verify success
    expect(result.success).toBe(true)
    expect(result.export_path).toBe('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')

    // Verify file exists with correct content
    const exportPath = tempVault.getPath('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    assertFileExists(exportPath)
    const fileContent = await tempVault.readFile('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    expect(fileContent).toBe(content)

    // Verify no temp file remains
    const tempPath = tempVault.getPath('.trash/01HZVM8YWRQT5J3M3K7YPTX9RZ.tmp')
    expect(fs.existsSync(tempPath)).toBe(false)

    // Verify audit trail
    const auditRecord = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').get(capture_id)
    expect(auditRecord).toBeDefined()
    expect(auditRecord.vault_path).toBe('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    expect(auditRecord.mode).toBe('initial')
  })

  it('should handle duplicate export idempotently', async () => {
    const capture_id = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
    const content = '---\nid: test\n---\nTest content'

    // First export
    const result1 = await atomicWriter.writeAtomic(capture_id, content, tempVault.path)
    expect(result1.success).toBe(true)

    // Second export (duplicate)
    const result2 = await atomicWriter.writeAtomic(capture_id, content, tempVault.path)
    expect(result2.success).toBe(true)
    expect(result2.export_path).toBe('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')

    // Verify only one file exists
    const files = await tempVault.listFiles('inbox')
    expect(files).toHaveLength(1)

    // Verify two audit records (initial + duplicate)
    const auditRecords = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ? ORDER BY exported_at').all(capture_id)
    expect(auditRecords).toHaveLength(2)
    expect(auditRecords[0].mode).toBe('initial')
    expect(auditRecords[1].mode).toBe('duplicate_skip')
  })

  it('should detect and halt on ULID collision with different content', async () => {
    const capture_id = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
    const content1 = '---\nid: test\n---\nOriginal content'
    const content2 = '---\nid: test\n---\nDifferent content'

    // First export
    const result1 = await atomicWriter.writeAtomic(capture_id, content1, tempVault.path)
    expect(result1.success).toBe(true)

    // Second export with different content (CRITICAL ERROR)
    const result2 = await atomicWriter.writeAtomic(capture_id, content2, tempVault.path)
    expect(result2.success).toBe(false)
    expect(result2.error?.code).toBe('EEXIST')
    expect(result2.error?.message).toContain('ULID collision')

    // Verify original file unchanged
    const fileContent = await tempVault.readFile('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    expect(fileContent).toBe(content1)

    // Verify error logged
    const errorRecord = db.prepare('SELECT * FROM errors_log WHERE capture_id = ? AND stage = ?').get(capture_id, 'export')
    expect(errorRecord).toBeDefined()
    expect(errorRecord.message).toContain('ULID collision')
  })
})
```

#### Test Suite: Crash Recovery (`crash-recovery.integration.test.ts`)

**Crash Simulation Procedures:**

For complete crash simulation methodology and fault injection hook usage, refer to:
- [Crash Matrix Test Plan Guide](../../guides/guide-crash-matrix-test-plan.md) - Systematic crash testing approach
- [Fault Injection Registry](../../guides/guide-fault-injection-registry.md) - Available crash points and hooks

**Test Cases:**

```typescript
describe('Crash Recovery', () => {
  it('should leave no partial files on crash during write', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())
    applyTestPragmas(db)
    await setupCapturesTable(db)

    // ✅ Use TestKit fault injection (not vi.spyOn)
    const faultInjector = createFaultInjector()
    faultInjector.injectWriteError(new Error('CRASH'))

    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db, { faultInjector })
    const result = await atomicWriter.writeAtomic('01HZVM8YWRQT5J3M3K7YPTX9RZ', 'content', tempVault.path)

    // Verify failure
    expect(result.success).toBe(false)

    // Verify no partial file in inbox
    const inboxFiles = await tempVault.listFiles('inbox')
    expect(inboxFiles).toHaveLength(0)

    // Verify no temp file remains
    const trashFiles = await tempVault.listFiles('.trash')
    expect(trashFiles).toHaveLength(0)

    // Verify no audit record created
    const auditRecords = db.prepare('SELECT * FROM exports_audit').all()
    expect(auditRecords).toHaveLength(0)

    // Cleanup happens automatically with TestKit
  })

  it('should clean up temp file on crash during fsync', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())

    // ✅ Use TestKit fault injection (not vi.spyOn)
    const faultInjector = createFaultInjector()
    faultInjector.injectFsyncError(new Error('FSYNC_CRASH'))

    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db, { faultInjector })
    const result = await atomicWriter.writeAtomic('01HZVM8YWRQT5J3M3K7YPTX9RZ', 'content', tempVault.path)

    expect(result.success).toBe(false)

    // Verify temp file cleaned up
    const tempPath = tempVault.getPath('.trash/01HZVM8YWRQT5J3M3K7YPTX9RZ.tmp')
    expect(fs.existsSync(tempPath)).toBe(false)

    // Cleanup happens automatically with TestKit
  })

  it('should handle process restart with pending exports', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())
    applyTestPragmas(db)
    await setupCapturesTable(db)

    // Insert capture that was staged but not exported
    const capture_id = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
    db.prepare('INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)').run(
      capture_id, 'voice', 'test content', 'transcribed'
    )

    // Simulate restart - should detect and export pending capture
    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db)
    const pendingCaptures = db.prepare('SELECT * FROM captures WHERE status = ? AND id NOT IN (SELECT capture_id FROM exports_audit)').all('transcribed')

    expect(pendingCaptures).toHaveLength(1)
    expect(pendingCaptures[0].id).toBe(capture_id)

    // Resume export
    const content = formatMarkdownExport(pendingCaptures[0])
    const result = await atomicWriter.writeAtomic(capture_id, content, tempVault.path)

    expect(result.success).toBe(true)
    assertFileExists(tempVault.getPath('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md'))
  })
})
```

### 4.3 Contract Test Scenarios

#### Test Suite: SQLite Audit Contract (`audit-contract.test.ts`)

**Test Cases:**

```typescript
describe('SQLite Audit Contract', () => {
  let db: Database

  beforeEach(async () => {
    db = new Database(createMemoryUrl())
    applyTestPragmas(db)
    await setupStagingLedgerSchema(db)
  })

  it('should enforce foreign key constraint on exports_audit', async () => {
    // Try to insert audit record without corresponding capture
    expect(() => {
      db.prepare('INSERT INTO exports_audit (id, capture_id, vault_path) VALUES (?, ?, ?)').run(
        'audit1', 'nonexistent_capture', 'inbox/test.md'
      )
    }).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('should cascade delete audit records when capture is deleted', async () => {
    const capture_id = '01HZVM8YWRQT5J3M3K7YPTX9RZ'

    // Insert capture
    db.prepare('INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)').run(
      capture_id, 'voice', 'test', 'exported'
    )

    // Insert audit record
    db.prepare('INSERT INTO exports_audit (id, capture_id, vault_path) VALUES (?, ?, ?)').run(
      'audit1', capture_id, 'inbox/test.md'
    )

    // Verify audit record exists
    const auditBefore = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').get(capture_id)
    expect(auditBefore).toBeDefined()

    // Delete capture
    db.prepare('DELETE FROM captures WHERE id = ?').run(capture_id)

    // Verify audit record was cascade deleted
    const auditAfter = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').get(capture_id)
    expect(auditAfter).toBeUndefined()
  })

  it('should allow multiple audit records for same export (initial + duplicate)', async () => {
    const capture_id = '01HZVM8YWRQT5J3M3K7YPTX9RZ'

    // Insert capture
    db.prepare('INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)').run(
      capture_id, 'voice', 'test', 'exported'
    )

    // Insert first audit record
    db.prepare('INSERT INTO exports_audit (id, capture_id, vault_path, mode) VALUES (?, ?, ?, ?)').run(
      'audit1', capture_id, 'inbox/test.md', 'initial'
    )

    // Insert second audit record (duplicate detection, allowed)
    db.prepare('INSERT INTO exports_audit (id, capture_id, vault_path, mode) VALUES (?, ?, ?, ?)').run(
      'audit2', capture_id, 'inbox/test.md', 'duplicate_skip'
    )

    // Both records should exist
    const auditRecords = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').all(capture_id)
    expect(auditRecords).toHaveLength(2)
    expect(auditRecords[0].mode).toBe('initial')
    expect(auditRecords[1].mode).toBe('duplicate_skip')
  })
})
```

### 4.4 Error Handling Test Scenarios

#### Test Suite: Filesystem Errors (`filesystem-errors.test.ts`)

**Test Cases:**

```typescript
describe('Filesystem Error Handling', () => {
  it('should handle EACCES (permission denied) gracefully', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())

    // Make vault read-only
    await fs.chmod(tempVault.path, 0o444)

    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db)
    const result = await atomicWriter.writeAtomic('01HZVM8YWRQT5J3M3K7YPTX9RZ', 'content', tempVault.path)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('EACCES')
    expect(result.error?.message).toContain('permission denied')

    // Verify error logged
    const errorRecord = db.prepare('SELECT * FROM errors_log WHERE stage = ?').get('export')
    expect(errorRecord).toBeDefined()
    expect(errorRecord.message).toContain('permission denied')

    // Restore permissions for cleanup
    await fs.chmod(tempVault.path, 0o755)
  })

  it('should handle ENOSPC (disk full) by halting worker', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())

    // ✅ Use TestKit fault injection (not vi.spyOn)
    const faultInjector = createFaultInjector()
    faultInjector.injectWriteError(
      Object.assign(new Error('No space left on device'), { code: 'ENOSPC' })
    )

    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db, { faultInjector })
    const result = await atomicWriter.writeAtomic('01HZVM8YWRQT5J3M3K7YPTX9RZ', 'content', tempVault.path)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('ENOSPC')

    // Verify worker halt logged
    const errorRecord = db.prepare('SELECT * FROM errors_log WHERE message LIKE ?').get('%disk full%')
    expect(errorRecord).toBeDefined()

    // Cleanup automatic with TestKit
  })

  it('should handle EROFS (read-only filesystem) by halting worker', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())

    // ✅ Use TestKit fault injection (not vi.spyOn)
    const faultInjector = createFaultInjector()
    faultInjector.injectWriteError(
      Object.assign(new Error('Read-only file system'), { code: 'EROFS' })
    )

    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db, { faultInjector })
    const result = await atomicWriter.writeAtomic('01HZVM8YWRQT5J3M3K7YPTX9RZ', 'content', tempVault.path)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('EROFS')

    // Cleanup automatic with TestKit
  })

  it('should handle ENETDOWN (network mount failure) with retry eligibility', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())

    // ✅ Use TestKit fault injection (not vi.spyOn)
    const faultInjector = createFaultInjector()
    faultInjector.injectWriteError(
      Object.assign(new Error('Network is down'), { code: 'ENETDOWN' })
    )

    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db, { faultInjector })
    const result = await atomicWriter.writeAtomic('01HZVM8YWRQT5J3M3K7YPTX9RZ', 'content', tempVault.path)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('ENETDOWN')

    // Verify error marked as retry eligible
    const errorRecord = db.prepare('SELECT * FROM errors_log WHERE message LIKE ?').get('%network%')
    expect(errorRecord).toBeDefined()

    // Cleanup automatic with TestKit
  })
})
```

---

## 5. Performance & Load Testing

### 5.1 Performance Benchmarks

#### Test Suite: Export Performance (`performance.test.ts`)

**Performance Requirements:**
- Export time < 50ms p95 for 1KB markdown files
- Memory usage < 10MB during export
- Disk I/O: 1x write amplification (temp file only)

**Test Cases:**

```typescript
describe('Export Performance', () => {
  it('should complete export within 50ms p95', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())
    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db)

    const measurements = []
    const iterations = 100

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now()

      const result = await atomicWriter.writeAtomic(
        `01HZVM8YWRQT5J3M3K7YPTX9R${i.toString().padStart(2, '0')}`,
        'x'.repeat(1024), // 1KB content
        tempVault.path
      )

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(result.success).toBe(true)
      measurements.push(duration)
    }

    measurements.sort((a, b) => a - b)
    const p95Index = Math.floor(iterations * 0.95)
    const p95Latency = measurements[p95Index]

    expect(p95Latency).toBeLessThan(50) // 50ms target
  })

  it('should handle large markdown files efficiently', async () => {
    const tempVault = await createTempDirectory()
    const db = new Database(createMemoryUrl())
    const atomicWriter = new ObsidianAtomicWriter(tempVault.path, db)

    // Test with 100KB markdown file
    const largeContent = 'x'.repeat(100 * 1024)

    const startTime = performance.now()
    const result = await atomicWriter.writeAtomic('01HZVM8YWRQT5J3M3K7YPTX9RZ', largeContent, tempVault.path)
    const endTime = performance.now()

    expect(result.success).toBe(true)
    expect(endTime - startTime).toBeLessThan(200) // 200ms for large files

    // Verify file written correctly
    const fileContent = await tempVault.readFile('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    expect(fileContent).toBe(largeContent)
  })
})
```

### 5.2 Concurrent Access Testing (Phase 2+)

**Note:** Sequential processing only in Phase 1, but prepare test infrastructure for Phase 2.

```typescript
describe('Concurrent Access (Phase 2)', () => {
  it.skip('should handle concurrent writes to different files safely', async () => {
    // Deferred to Phase 2 when concurrency is introduced
  })

  it.skip('should detect and prevent concurrent writes to same ULID', async () => {
    // Deferred to Phase 2 when worker pool is implemented
  })
})
```

---

## 6. Test Data & Fixtures

### 6.1 Test Fixtures

#### Golden Captures Dataset

**File:** `fixtures/golden-captures.json`

```json
{
  "voice_capture_simple": {
    "id": "01HZVM8YWRQT5J3M3K7YPTX9RZ",
    "source": "voice",
    "raw_content": "Remember to buy groceries",
    "content_hash": "a1b2c3d4e5f6",
    "status": "transcribed",
    "captured_at": "2025-09-27T10:00:00Z",
    "meta_json": {
      "file_path": "/voice/recording1.m4a",
      "audio_fp": "abc123",
      "duration_ms": 3000
    }
  },
  "email_capture_simple": {
    "id": "01HZVM8YWRQT5J3M3K7YPTX9S0",
    "source": "email",
    "raw_content": "Meeting notes from project sync",
    "content_hash": "g7h8i9j0k1l2",
    "status": "staged",
    "captured_at": "2025-09-27T11:00:00Z",
    "meta_json": {
      "message_id": "msg123",
      "from": "colleague@company.com",
      "subject": "Project Sync Notes"
    }
  },
  "large_voice_capture": {
    "id": "01HZVM8YWRQT5J3M3K7YPTX9S1",
    "source": "voice",
    "raw_content": "Lorem ipsum dolor sit amet, consectetur adipiscing elit...".repeat(100),
    "content_hash": "m3n4o5p6q7r8",
    "status": "transcribed",
    "captured_at": "2025-09-27T12:00:00Z"
  }
}
```

#### Expected Markdown Outputs

**File:** `fixtures/expected-markdown-exports.json`

```json
{
  "voice_export_formatted": "---\nid: 01HZVM8YWRQT5J3M3K7YPTX9RZ\nsource: voice\ncaptured_at: 2025-09-27T10:00:00Z\ncontent_hash: a1b2c3d4e5f6\n---\n\n# Voice Capture\n\nRemember to buy groceries\n\n---\n\n**Metadata:**\n- Source: Voice Recording\n- Captured: 2025-09-27 10:00:00 UTC\n- Duration: 3.0 seconds",
  "email_export_formatted": "---\nid: 01HZVM8YWRQT5J3M3K7YPTX9S0\nsource: email\ncaptured_at: 2025-09-27T11:00:00Z\ncontent_hash: g7h8i9j0k1l2\n---\n\n# Email: Project Sync Notes\n\n**From:** colleague@company.com  \n**Subject:** Project Sync Notes\n\nMeeting notes from project sync"
}
```

### 6.2 Test Database Schema

#### Schema Setup Helper

```typescript
async function setupStagingLedgerSchema(db: Database): Promise<void> {
  // captures table
  db.exec(`
    CREATE TABLE captures (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      raw_content TEXT NOT NULL,
      content_hash TEXT UNIQUE,
      status TEXT NOT NULL,
      meta_json JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // exports_audit table
  db.exec(`
    CREATE TABLE exports_audit (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL,
      vault_path TEXT NOT NULL,
      hash_at_export TEXT,
      exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      mode TEXT,
      error_flag INTEGER DEFAULT 0,
      FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
    )
  `)

  // errors_log table
  db.exec(`
    CREATE TABLE errors_log (
      id TEXT PRIMARY KEY,
      capture_id TEXT,
      stage TEXT,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (capture_id) REFERENCES captures(id)
    )
  `)

  // Enable foreign keys
  db.pragma('foreign_keys = ON')
}
```

### 6.3 Fault Injection Helpers

#### ✅ TestKit Fault Injection (Replaces Custom Mocks)

**⚠️ ANTI-PATTERN REMOVED:** The previous `createFilesystemMocks()` function using `vi.spyOn` has been replaced with TestKit fault injection patterns per [TestKit Standardization Guide](../../guides/guide-testkit-standardization.md).

```typescript
// ✅ CORRECT: TestKit fault injection
import { createFaultInjector } from '@adhd-brain/testkit/fault-injection'

describe('Filesystem Error Handling', () => {
  let faultInjector: FaultInjector
  let tempVault: TempDirectory
  let atomicWriter: ObsidianAtomicWriter

  beforeEach(async () => {
    faultInjector = createFaultInjector()
    tempVault = await createTempDirectory()
    atomicWriter = new ObsidianAtomicWriter(tempVault.path, db, { faultInjector })
  })

  afterEach(async () => {
    await tempVault.cleanup()
    // Fault injector auto-resets between tests
  })

  test('handles disk full error (ENOSPC)', async () => {
    faultInjector.injectWriteError(
      Object.assign(new Error('No space left on device'), { code: 'ENOSPC' })
    )

    const result = await atomicWriter.writeAtomic('01HZVM...', 'content', tempVault.path)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('ENOSPC')
  })

  test('handles permission denied (EACCES)', async () => {
    faultInjector.injectWriteError(
      Object.assign(new Error('Permission denied'), { code: 'EACCES' })
    )

    const result = await atomicWriter.writeAtomic('01HZVM...', 'content', tempVault.path)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('EACCES')
  })

  test('handles network mount failure (ENETDOWN)', async () => {
    faultInjector.injectWriteError(
      Object.assign(new Error('Network is down'), { code: 'ENETDOWN' })
    )

    const result = await atomicWriter.writeAtomic('01HZVM...', 'content', tempVault.path)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('ENETDOWN')
  })

  test('handles fsync crash', async () => {
    faultInjector.injectFsyncError(new Error('FSYNC_CRASH'))

    const result = await atomicWriter.writeAtomic('01HZVM...', 'content', tempVault.path)

    expect(result.success).toBe(false)
    // Temp file should be cleaned up
    expect(await tempVault.exists('.trash/*.tmp')).toBe(false)
  })
})
```

**Key Advantages of TestKit Fault Injection:**
- ✅ No manual `vi.spyOn` cleanup required
- ✅ Automatic reset between tests
- ✅ Type-safe error injection
- ✅ Consistent with monorepo testing standards
- ✅ Reusable across all packages

**See Also:**
- [Fault Injection Registry](../../guides/guide-fault-injection-registry.md) - Complete error code catalog
- [TestKit Standardization Guide](../../guides/guide-testkit-standardization.md) - Migration patterns

---

## 7. Test Execution & CI/CD

### 7.1 Test Commands

```bash
# Run all Obsidian Bridge tests
pnpm test obsidian-bridge

# Run specific test suites
pnpm test obsidian-bridge/unit
pnpm test obsidian-bridge/integration
pnpm test obsidian-bridge/contract

# Run with coverage
pnpm test obsidian-bridge --coverage

# Run performance tests
pnpm test obsidian-bridge/performance

# Run crash recovery tests
pnpm test obsidian-bridge/crash-recovery
```

### 7.2 CI/CD Pipeline Integration

**GitHub Actions Workflow:**

```yaml
name: Obsidian Bridge Tests

on:
  push:
    paths:
      - 'packages/obsidian-bridge/**'
      - 'packages/staging-ledger/**'
  pull_request:
    paths:
      - 'packages/obsidian-bridge/**'

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install

      # Unit tests (fast)
      - name: Run unit tests
        run: pnpm test obsidian-bridge/unit --reporter=verbose

      # Integration tests (slower)
      - name: Run integration tests
        run: pnpm test obsidian-bridge/integration --reporter=verbose

      # Contract tests (database)
      - name: Run contract tests
        run: pnpm test obsidian-bridge/contract --reporter=verbose

      # Performance benchmarks
      - name: Run performance tests
        run: pnpm test obsidian-bridge/performance --reporter=verbose

      # Coverage report
      - name: Generate coverage
        run: pnpm test obsidian-bridge --coverage --reporter=verbose

      # Upload coverage to Codecov
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

### 7.3 Test Isolation & Cleanup

**Test Setup Pattern:**

```typescript
// Global test setup (vitest.setup.ts)
import '@template/testkit/register'
import { setupMSWGlobal } from '@template/testkit/msw'

// Setup MSW with empty handlers (tests add their own)
setupMSWGlobal([])

// Per-test isolation (each test file)
beforeEach(async () => {
  // Reset time to deterministic baseline
  useFakeTimers({ now: new Date('2025-09-27T10:00:00Z') })

  // Reset randomness to deterministic seed
  controlRandomness(12345)

  // Clean up any remaining temp directories
  await cleanupAllTempDirectories()
})

afterEach(async () => {
  // Restore real timers
  vi.useRealTimers()

  // Restore real randomness
  vi.restoreAllMocks()

  // Ensure all temp resources cleaned up
  expect(getTempDirectoryCount()).toBe(0)
})
```

---

## 8. Success Criteria & Quality Gates

### 8.1 Test Coverage Requirements

| Component | Coverage Target | Metric |
|-----------|----------------|--------|
| **AtomicWriter Core** | 100% | Line coverage |
| **Path Resolution** | 100% | Branch coverage |
| **Collision Detection** | 100% | All collision types tested |
| **Error Handling** | 100% | All error codes tested |
| **Audit Trail** | 100% | All audit modes tested |
| **Content Formatting** | 95% | Edge cases covered |

### 8.2 Performance Gates

| Test | Requirement | Tolerance |
|------|-------------|-----------|
| **Export Latency** | < 50ms p95 | ±5ms |
| **Memory Usage** | < 10MB peak | ±2MB |
| **Disk I/O** | 1x write amplification | No higher |
| **Test Suite Runtime** | < 30 seconds total | ±5 seconds |

### 8.3 Reliability Gates

| Test Category | Success Rate | Requirement |
|---------------|--------------|-------------|
| **Unit Tests** | 100% | All tests pass |
| **Integration Tests** | 100% | All tests pass |
| **Contract Tests** | 100% | All tests pass |
| **Crash Recovery** | 100% | No data loss |
| **Error Handling** | 100% | Graceful degradation |

### 8.4 Quality Metrics

**Test Quality Indicators:**

1. **Deterministic Results:** All tests pass consistently in CI/CD
2. **Fast Feedback:** Unit tests complete in < 5 seconds
3. **Isolated Tests:** Tests can run in any order without conflicts
4. **Clear Failures:** Test failures clearly indicate root cause
5. **Maintainable:** Tests survive refactoring without changes

**Red Flag Indicators:**

- Any test requires specific execution order
- Flaky tests (intermittent failures)
- Test runtime > 30 seconds total
- Coverage regression below 95%
- Performance regression > 10%

---

## 9. Future Test Considerations

### 9.1 Phase 2 Enhancements

**Retry Logic Testing (Phase 2):**
- Exponential backoff verification
- Max retry limit enforcement
- Backoff jitter randomization

**Metrics Collection Testing (Phase 2):**
- NDJSON log format validation
- Metric accuracy verification
- Local-only privacy compliance

**Health Command Integration (Phase 2):**
- Vault validation testing
- Orphaned file detection
- Export consistency checks

### 9.2 Phase 3+ Testing

**PARA Classification Testing (Phase 3+):**
- Dynamic export path resolution
- Template-based filename generation
- Conflict resolution beyond atomicity

**Multi-Vault Support Testing (Phase 5+):**
- Cross-vault export testing
- Vault configuration validation
- Concurrent vault write testing

### 9.3 Long-term Monitoring

**Production Testing Hooks:**
- Canary testing infrastructure
- A/B testing for performance optimizations
- Real-world usage metrics validation
- User-reported issue reproduction testing

---

## 10. Related Documents

- **Feature PRD:** `prd-obsidian.md` (v1.0.0-MPPP) - Requirements and acceptance criteria
- **Architecture Spec:** `spec-obsidian-arch.md` (v1.0.0-MPPP) - System design and failure modes
- **Tech Spec:** `spec-obsidian-tech.md` (v1.0.0-MPPP) - Implementation details and contracts
- **Usage Guide:** `../../guides/guide-obsidian-bridge-usage.md` - Developer integration patterns and examples
- **Master PRD:** `../../master/prd-master.md` (v2.3.0-MPPP) - System context
- **Staging Ledger PRD:** `../staging-ledger/prd-staging.md` - Database contract requirements
- **TDD Guide:** `../../guides/tdd-applicability.md` (v1.0.0) - TDD decision framework
- **TestKit Guide:** `../../guides/guide-testkit-usage.md` (v0.1.0) - Testing utilities reference

**Related ADRs:**
- [ADR 0009: Atomic Write via Temp-Then-Rename Pattern](../../adr/0009-atomic-write-temp-rename-pattern.md) - Testing requirements for atomicity guarantees
- [ADR 0010: ULID-Based Deterministic Filenames](../../adr/0010-ulid-deterministic-filenames.md) - Test scenarios for collision detection and idempotency
- [ADR 0011: Inbox-Only Export Pattern](../../adr/0011-inbox-only-export-pattern.md) - Test implications of single-directory export strategy
- [ADR 0012: TDD Required for High-Risk Obsidian Bridge](../../adr/0012-tdd-required-high-risk.md) - Risk classification driving comprehensive test coverage

---

## 11. Revision History

- **v1.0.0-MPPP** (2025-09-27): Complete test specification for Phase 1
  - TDD applicability decision with HIGH risk classification
  - Comprehensive unit, integration, and contract test scenarios
  - TestKit integration strategy with domain-specific patterns
  - Performance benchmarks and reliability requirements
  - Test data fixtures and mock helpers
  - CI/CD pipeline integration
  - Success criteria and quality gates
  - Future testing considerations for Phase 2+

---

## 12. Cross-Feature Integration Tests

### 12.1 Pipeline Integration with Staging Ledger

These tests verify the atomic handoff between the staging ledger and Obsidian bridge components, ensuring P0 cross-feature risks are covered.

#### Test Suite: Staging Ledger → Obsidian Bridge Integration
```typescript
describe('Staging Ledger → Obsidian Bridge Integration', () => {
  let ledger: StagingLedger
  let atomicWriter: ObsidianAtomicWriter
  let tempVault: TempDirectory

  beforeEach(async () => {
    tempVault = await createTempDirectory({ prefix: 'vault-integration-' })
    ledger = createTestLedger()
    atomicWriter = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    useFakeTimers({ now: new Date('2025-09-27T10:00:00Z') })
    controlRandomness(12345)
  })

  afterEach(async () => {
    ledger.close()
    await tempVault.cleanup()
    vi.useRealTimers()
  })

  it('maintains transactional integrity during export pipeline', async () => {
    // === STAGE 1: Set up staged capture ===
    const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
    const content = 'Test content for transactional integrity'
    const contentHash = computeContentHash(content)

    await ledger.insertCapture({
      id: captureId,
      source: 'email',
      raw_content: content,
      content_hash: contentHash,
      meta_json: {
        channel: 'email',
        channel_native_id: 'msg_123',
        from: 'test@example.com',
        subject: 'Test Subject'
      }
    })

    // === STAGE 2: Export via atomic writer ===
    const markdownContent = formatCaptureMarkdown(await ledger.getCapture(captureId))
    const exportResult = await atomicWriter.writeAtomic(captureId, markdownContent, tempVault.path)

    expect(exportResult.success).toBe(true)
    expect(exportResult.export_path).toBe('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')

    // === STAGE 3: Record export in staging ledger ===
    await ledger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: false
    })

    // === STAGE 4: Verify transactional consistency ===
    // Check capture status updated
    const exportedCapture = await ledger.getCapture(captureId)
    expect(exportedCapture?.status).toBe('exported')

    // Check audit record created
    const auditRecords = await ledger.getExportAudits(captureId)
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0]).toMatchObject({
      capture_id: captureId,
      vault_path: 'inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md',
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: 0
    })

    // Check vault file exists and has correct content
    const vaultFile = tempVault.getPath('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    assertFileExists(vaultFile)

    const fileContent = await tempVault.readFile('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    expect(fileContent).toContain(content)
    expect(fileContent).toContain('id: 01HZVM8YWRQT5J3M3K7YPTX9RZ')
    expect(fileContent).toContain('From: test@example.com')
  })

  it('handles duplicate export detection across components', async () => {
    const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
    const content = 'Duplicate test content'
    const contentHash = computeContentHash(content)

    // Stage capture
    await ledger.insertCapture({
      id: captureId,
      source: 'voice',
      raw_content: content,
      content_hash: contentHash,
      meta_json: {
        channel: 'voice',
        channel_native_id: '/path/test.m4a',
        audio_fp: 'test_fingerprint'
      }
    })

    // === FIRST EXPORT ===
    const markdownContent = formatCaptureMarkdown(await ledger.getCapture(captureId))

    const firstExport = await atomicWriter.writeAtomic(captureId, markdownContent, tempVault.path)
    expect(firstExport.success).toBe(true)

    await ledger.recordExport(captureId, {
      vault_path: firstExport.export_path,
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: false
    })

    // === SECOND EXPORT (DUPLICATE) ===
    const secondExport = await atomicWriter.writeAtomic(captureId, markdownContent, tempVault.path)
    expect(secondExport.success).toBe(true) // Should succeed but detect duplicate

    await ledger.recordExport(captureId, {
      vault_path: secondExport.export_path,
      hash_at_export: contentHash,
      mode: 'duplicate_skip',
      error_flag: false
    })

    // === VERIFICATION ===
    // Only one file should exist
    const vaultFiles = await tempVault.listFiles('inbox')
    expect(vaultFiles).toHaveLength(1)

    // Two audit records should exist (initial + duplicate)
    const auditRecords = await ledger.getExportAudits(captureId)
    expect(auditRecords).toHaveLength(2)
    expect(auditRecords[0].mode).toBe('initial')
    expect(auditRecords[1].mode).toBe('duplicate_skip')

    // Capture should remain in exported state
    const capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe('exported')
  })

  it('handles ULID collision detection between components', async () => {
    const conflictingULID = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
    const content1 = 'Original content'
    const content2 = 'Different content with same ULID'
    const hash1 = computeContentHash(content1)
    const hash2 = computeContentHash(content2)

    // === FIRST CAPTURE WITH ULID ===
    await ledger.insertCapture({
      id: conflictingULID,
      source: 'email',
      raw_content: content1,
      content_hash: hash1,
      meta_json: { channel: 'email', channel_native_id: 'msg_1' }
    })

    const markdown1 = formatCaptureMarkdown(await ledger.getCapture(conflictingULID))
    const export1 = await atomicWriter.writeAtomic(conflictingULID, markdown1, tempVault.path)
    expect(export1.success).toBe(true)

    await ledger.recordExport(conflictingULID, {
      vault_path: export1.export_path,
      hash_at_export: hash1,
      mode: 'initial',
      error_flag: false
    })

    // === SECOND CAPTURE WITH SAME ULID (CONFLICT) ===
    // This simulates a ULID collision scenario (extremely rare but must be handled)
    const markdown2 = formatCaptureMarkdown({
      id: conflictingULID,
      source: 'email',
      raw_content: content2,
      content_hash: hash2,
      meta_json: { channel: 'email', channel_native_id: 'msg_2' }
    })

    const export2 = await atomicWriter.writeAtomic(conflictingULID, markdown2, tempVault.path)
    expect(export2.success).toBe(false) // Should fail due to content conflict
    expect(export2.error?.code).toBe('EEXIST')
    expect(export2.error?.message).toContain('ULID collision')

    // === VERIFICATION ===
    // Original file should remain unchanged
    const vaultContent = await tempVault.readFile('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    expect(vaultContent).toContain(content1)
    expect(vaultContent).not.toContain(content2)

    // Only one audit record should exist
    const auditRecords = await ledger.getExportAudits(conflictingULID)
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0].mode).toBe('initial')

    // Error should be logged
    const errorLogs = await ledger.getErrorLogs()
    const collisionError = errorLogs.find(log =>
      log.capture_id === conflictingULID && log.message.includes('ULID collision')
    )
    expect(collisionError).toBeDefined()
  })
})
```

### 12.2 End-to-End Export Pipeline Tests

#### Test Suite: Multi-Source Export Pipeline
```typescript
describe('Multi-Source Export Pipeline', () => {
  let ledger: StagingLedger
  let atomicWriter: ObsidianAtomicWriter
  let tempVault: TempDirectory

  beforeEach(async () => {
    tempVault = await createTempDirectory({ prefix: 'pipeline-' })
    ledger = createTestLedger()
    atomicWriter = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    useFakeTimers({ now: new Date('2025-09-27T10:00:00Z') })
  })

  afterEach(async () => {
    ledger.close()
    await tempVault.cleanup()
    vi.useRealTimers()
  })

  it('processes mixed voice and email captures in pipeline order', async () => {
    // === SET UP MIXED CAPTURES ===
    const captures = [
      {
        id: '01VOICE001',
        source: 'voice',
        content: 'Voice memo about project planning',
        meta: { channel: 'voice', channel_native_id: '/path/memo1.m4a', audio_fp: 'fp_1' }
      },
      {
        id: '01EMAIL001',
        source: 'email',
        content: 'Email about meeting agenda',
        meta: { channel: 'email', channel_native_id: 'msg_1', from: 'manager@company.com' }
      },
      {
        id: '01VOICE002',
        source: 'voice',
        content: 'Voice memo with task reminder',
        meta: { channel: 'voice', channel_native_id: '/path/memo2.m4a', audio_fp: 'fp_2' }
      }
    ]

    // Stage all captures
    for (const capture of captures) {
      await ledger.insertCapture({
        id: capture.id,
        source: capture.source as 'voice' | 'email',
        raw_content: capture.content,
        content_hash: computeContentHash(capture.content),
        meta_json: capture.meta
      })
    }

    // === PROCESS EXPORTS ===
    for (const capture of captures) {
      const captureData = await ledger.getCapture(capture.id)
      const markdownContent = formatCaptureMarkdown(captureData)

      const exportResult = await atomicWriter.writeAtomic(capture.id, markdownContent, tempVault.path)
      expect(exportResult.success).toBe(true)

      await ledger.recordExport(capture.id, {
        vault_path: exportResult.export_path,
        hash_at_export: computeContentHash(capture.content),
        mode: 'initial',
        error_flag: false
      })
    }

    // === VERIFICATION ===
    // All files should exist in vault
    const vaultFiles = await tempVault.listFiles('inbox')
    expect(vaultFiles).toHaveLength(3)
    expect(vaultFiles).toContain('01VOICE001.md')
    expect(vaultFiles).toContain('01EMAIL001.md')
    expect(vaultFiles).toContain('01VOICE002.md')

    // All captures should be exported
    const allCaptures = await ledger.getAllCaptures()
    expect(allCaptures.every(c => c.status === 'exported')).toBe(true)

    // Verify content specificity
    const voiceContent = await tempVault.readFile('inbox/01VOICE001.md')
    expect(voiceContent).toContain('Voice memo about project planning')
    expect(voiceContent).toContain('source: voice')

    const emailContent = await tempVault.readFile('inbox/01EMAIL001.md')
    expect(emailContent).toContain('Email about meeting agenda')
    expect(emailContent).toContain('source: email')
    expect(emailContent).toContain('From: manager@company.com')
  })

  it('handles concurrent multi-source exports without race conditions', async () => {
    // Create captures from multiple sources
    const captureSpecs = [
      { id: ulid(), source: 'voice', content: 'Concurrent voice 1' },
      { id: ulid(), source: 'email', content: 'Concurrent email 1' },
      { id: ulid(), source: 'voice', content: 'Concurrent voice 2' },
      { id: ulid(), source: 'email', content: 'Concurrent email 2' },
      { id: ulid(), source: 'voice', content: 'Concurrent voice 3' }
    ]

    // Stage all captures
    for (const spec of captureSpecs) {
      await ledger.insertCapture({
        id: spec.id,
        source: spec.source as 'voice' | 'email',
        raw_content: spec.content,
        content_hash: computeContentHash(spec.content),
        meta_json: {
          channel: spec.source,
          channel_native_id: spec.source === 'voice' ? `/path/${spec.id}.m4a` : `msg_${spec.id}`
        }
      })
    }

    // Export all concurrently
    const exportPromises = captureSpecs.map(async (spec) => {
      const captureData = await ledger.getCapture(spec.id)
      const markdownContent = formatCaptureMarkdown(captureData)

      const exportResult = await atomicWriter.writeAtomic(spec.id, markdownContent, tempVault.path)

      if (exportResult.success) {
        await ledger.recordExport(spec.id, {
          vault_path: exportResult.export_path,
          hash_at_export: computeContentHash(spec.content),
          mode: 'initial',
          error_flag: false
        })
      }

      return { spec, result: exportResult }
    })

    const results = await Promise.allSettled(exportPromises)

    // All exports should succeed
    const successful = results.filter(r => r.status === 'fulfilled')
    expect(successful).toHaveLength(5)

    // Verify all files exist
    const vaultFiles = await tempVault.listFiles('inbox')
    expect(vaultFiles).toHaveLength(5)

    // Verify all captures exported
    const finalCaptures = await ledger.getAllCaptures()
    expect(finalCaptures.every(c => c.status === 'exported')).toBe(true)

    // Verify audit trail integrity
    for (const spec of captureSpecs) {
      const auditRecords = await ledger.getExportAudits(spec.id)
      expect(auditRecords).toHaveLength(1)
      expect(auditRecords[0].mode).toBe('initial')
    }
  })
})
```

### 12.3 TestKit Patterns for Cross-Feature Integration

**Required Cross-Feature Test Utilities:**

```typescript
// Cross-feature integration utilities
import { createTestLedger } from '@adhd-brain/staging-ledger/test-utils'
import { ObsidianAtomicWriter } from '@adhd-brain/obsidian-bridge'
import { createTempDirectory, assertFileExists } from '@orchestr8/testkit/fs'
import { useFakeTimers, controlRandomness } from '@orchestr8/testkit/env'

// Content formatters for different capture types
function formatCaptureMarkdown(capture: CaptureRecord): string {
  if (capture.source === 'voice') {
    return formatVoiceMarkdown(capture)
  } else if (capture.source === 'email') {
    return formatEmailMarkdown(capture)
  }
  throw new Error(`Unsupported capture source: ${capture.source}`)
}

function formatVoiceMarkdown(capture: CaptureRecord): string {
  const metadata = capture.meta_json || {}
  return `---
id: ${capture.id}
source: voice
captured_at: ${capture.created_at}
content_hash: ${capture.content_hash}
audio_file: ${metadata.channel_native_id || 'unknown'}
---

# Voice Capture

${capture.raw_content}

---

**Metadata:**
- Source: Voice Recording
- Audio File: ${metadata.channel_native_id || 'N/A'}
- Audio Fingerprint: ${metadata.audio_fp || 'N/A'}
- Captured: ${capture.created_at}`
}

function formatEmailMarkdown(capture: CaptureRecord): string {
  const metadata = capture.meta_json || {}
  return `---
id: ${capture.id}
source: email
captured_at: ${capture.created_at}
content_hash: ${capture.content_hash}
message_id: ${metadata.channel_native_id || 'unknown'}
---

# Email: ${metadata.subject || 'No Subject'}

**From:** ${metadata.from || 'Unknown'}
**Subject:** ${metadata.subject || 'No Subject'}

${capture.raw_content}`
}

// Custom matchers for cross-feature testing
expect.extend({
  async toHaveConsistentPipelineState(ledger: StagingLedger, captureId: string, expectedState: string) {
    const capture = await ledger.getCapture(captureId)
    const auditRecords = await ledger.getExportAudits(captureId)

    const captureStateMatch = capture?.status === expectedState
    const auditConsistent = expectedState === 'exported' ? auditRecords.length > 0 : auditRecords.length === 0

    return {
      pass: captureStateMatch && auditConsistent,
      message: () => `Expected capture ${captureId} to have consistent pipeline state: ${expectedState}`
    }
  },

  async toHaveValidExportChain(ledger: StagingLedger, tempVault: any, captureId: string) {
    const capture = await ledger.getCapture(captureId)
    const auditRecords = await ledger.getExportAudits(captureId)

    if (!capture || auditRecords.length === 0) {
      return { pass: false, message: () => 'Missing capture or audit records' }
    }

    const vaultPath = path.join(tempVault.path, auditRecords[0].vault_path)
    const fileExists = await fs.access(vaultPath).then(() => true).catch(() => false)

    return {
      pass: capture.status === 'exported' && fileExists,
      message: () => `Expected complete export chain for ${captureId}`
    }
  }
})
```

---

## 10. Performance Regression Detection (P1)

### 10.1 Latency Regression Gates

Performance regression gates ensure that the Obsidian Bridge maintains P0 atomic write requirements and prevents performance degradation over time.

**Risk Classification: P1** - Performance regressions in atomic write operations impact user experience and export reliability.

```typescript
describe('Performance Regression Detection (P1)', () => {
  test('detects p95 latency regression for atomic write operations', async () => {
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Define baseline (from real measurements)
    const BASELINE_P95 = 50 // ms
    const REGRESSION_THRESHOLD = 75 // 50% regression = failure

    const latencies: number[] = []

    // Run operation 100 times
    for (let i = 0; i < 100; i++) {
      const captureId = ulid()
      const content = `# Test Export ${i}\n\nContent for performance testing ${i}`
      const contentHash = computeContentHash(content)

      const start = performance.now()

      await bridge.writeAtomic(captureId, content, contentHash, {
        source: 'voice',
        captured_at: new Date().toISOString(),
        transcribed_at: new Date().toISOString()
      })

      latencies.push(performance.now() - start)
    }

    // Calculate p95
    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    // Gate: fail if regression > 50%
    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)

    // Log metrics for tracking
    console.log(`Atomic write P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })

  test('detects p95 latency regression for collision detection', async () => {
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Pre-create files to test collision detection
    for (let i = 0; i < 50; i++) {
      const captureId = ulid()
      await bridge.writeAtomic(captureId, `Test content ${i}`, computeContentHash(`Test content ${i}`), {
        source: 'email',
        captured_at: new Date().toISOString()
      })
    }

    const BASELINE_P95 = 2 // ms
    const REGRESSION_THRESHOLD = 3 // 50% regression = failure
    const latencies: number[] = []

    // Test collision detection performance
    for (let i = 0; i < 100; i++) {
      const existingCaptureId = ulid() // New ULID, no collision expected
      const content = `Collision test ${i}`
      const start = performance.now()

      const result = await bridge.checkCollision(existingCaptureId, content)

      latencies.push(performance.now() - start)
    }

    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)
    console.log(`Collision detection P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })

  test('detects p95 latency regression for audit trail write', async () => {
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    const BASELINE_P95 = 5 // ms
    const REGRESSION_THRESHOLD = 7 // 40% regression = failure
    const latencies: number[] = []

    // Test audit trail write performance
    for (let i = 0; i < 100; i++) {
      const captureId = ulid()
      const start = performance.now()

      await ledger.recordExport(captureId, {
        vault_path: `inbox/${captureId}.md`,
        hash_at_export: computeContentHash(`Test ${i}`),
        mode: 'initial',
        error_flag: false
      })

      latencies.push(performance.now() - start)
    }

    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)
    console.log(`Audit trail write P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })

  test('detects throughput regression for export operations', async () => {
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Baseline: 20 operations/second
    const BASELINE_THROUGHPUT = 20
    const MIN_THROUGHPUT = 15 // 25% regression = failure

    // Run for 10 seconds
    const duration = 10_000
    let operationsCompleted = 0
    const startTime = Date.now()

    while (Date.now() - startTime < duration) {
      const captureId = ulid()
      await bridge.writeAtomic(captureId, `Throughput test ${operationsCompleted}`,
        computeContentHash(`Throughput test ${operationsCompleted}`), {
        source: 'voice',
        captured_at: new Date().toISOString()
      })
      operationsCompleted++
    }

    const actualDuration = Date.now() - startTime
    const throughput = (operationsCompleted / actualDuration) * 1000 // ops/sec

    // Gate: fail if throughput drops > 25%
    expect(throughput).toBeGreaterThan(MIN_THROUGHPUT)

    console.log(`Export throughput: ${throughput.toFixed(1)} ops/sec (baseline: ${BASELINE_THROUGHPUT})`)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })

  test('detects memory leak during sustained exports', async () => {
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Force garbage collection before test
    if (global.gc) global.gc()

    const heapBefore = process.memoryUsage().heapUsed

    // Run 1,000 operations
    for (let i = 0; i < 1_000; i++) {
      const captureId = ulid()
      await bridge.writeAtomic(captureId, `Memory test ${i}`,
        computeContentHash(`Memory test ${i}`), {
        source: 'email',
        captured_at: new Date().toISOString()
      })

      // Simulate normal cleanup
      if (i % 100 === 0) {
        await ledger.getExportAudits(captureId) // Typical query pattern
      }
    }

    // Force garbage collection after test
    if (global.gc) global.gc()

    const heapAfter = process.memoryUsage().heapUsed
    const heapGrowth = heapAfter - heapBefore

    // Gate: heap growth < 5MB for 1k operations
    expect(heapGrowth).toBeLessThan(5 * 1024 * 1024)

    console.log(`Heap growth: ${(heapGrowth / 1024 / 1024).toFixed(2)}MB for 1k operations`)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })
})
```

---

## 11. Enhanced Cross-Feature Integration with Failure Injection (P1)

### 11.1 Full Pipeline Integration with Fault Injection

Cross-feature integration tests with failure injection ensure robust error handling and recovery across the obsidian bridge and other components.

```typescript
describe('Full Pipeline Integration with Fault Injection (P1)', () => {
  let testPipeline: TestPipeline

  beforeEach(async () => {
    testPipeline = new TestPipeline()
    await testPipeline.setup()
  })

  afterEach(async () => {
    await testPipeline.cleanup()
  })

  test('handles vault filesystem failure during atomic write', async () => {
    // Setup: Successful capture ready for export
    const captureId = await testPipeline.completeCaptureFlow('/icloud/test.m4a')

    // Inject: Filesystem failure during temp file write
    testPipeline.injectFault('vault-write', 'ENOSPC')

    // Attempt export
    const result = await testPipeline.attemptExport(captureId)

    // Verify: Export fails cleanly
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('ENOSPC')

    // Verify: No partial files exist
    const vaultFiles = await testPipeline.getVault().listFiles()
    expect(vaultFiles.filter(f => f.includes('tmp'))).toHaveLength(0)

    // Verify: Staging ledger unchanged
    const capture = await testPipeline.getStagingLedger().getCapture(captureId)
    expect(capture.status).toBe('transcribed')

    // Verify: Error logged with context
    const errors = await testPipeline.getErrorLog()
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'VAULT_WRITE_FAILED',
      severity: 'critical',
      message: expect.stringContaining('disk full'),
      component: 'obsidian-bridge'
    }))
  })

  test('handles concurrent exports with atomic guarantee', async () => {
    // Setup: Multiple captures ready for export
    const captureIds = []
    for (let i = 0; i < 5; i++) {
      const id = await testPipeline.completeCaptureFlow(`/icloud/memo${i}.m4a`)
      captureIds.push(id)
    }

    // Concurrent export attempts
    const exportPromises = captureIds.map(id =>
      testPipeline.attemptExport(id)
    )

    const results = await Promise.all(exportPromises)

    // Verify: All exports succeeded
    expect(results.every(r => r.success)).toBe(true)

    // Verify: No partial files from race conditions
    const vaultFiles = await testPipeline.getVault().listFiles()
    const mdFiles = vaultFiles.filter(f => f.endsWith('.md'))
    expect(mdFiles).toHaveLength(5)

    // Verify: No temp files remain
    const tempFiles = vaultFiles.filter(f => f.includes('tmp'))
    expect(tempFiles).toHaveLength(0)

    // Verify: All audit records created
    for (const captureId of captureIds) {
      const auditRecords = await testPipeline.getStagingLedger().getExportAudits(captureId)
      expect(auditRecords).toHaveLength(1)
      expect(auditRecords[0].mode).toBe('initial')
    }
  })

  test('handles staging ledger failure during audit write', async () => {
    // Setup: Successful capture
    const captureId = await testPipeline.completeCaptureFlow('/icloud/test.m4a')

    // Inject: Database lock during audit write
    testPipeline.injectFault('audit-write', 'SQLITE_BUSY')

    // Attempt export
    const result = await testPipeline.attemptExport(captureId)

    // Verify: Export retries with backoff
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('AUDIT_WRITE_FAILED')

    // Clear fault and retry
    testPipeline.clearFaults()

    const retryResult = await testPipeline.attemptExport(captureId)
    expect(retryResult.success).toBe(true)

    // Verify: Final state is consistent
    const capture = await testPipeline.getStagingLedger().getCapture(captureId)
    expect(capture.status).toBe('exported')

    const auditRecords = await testPipeline.getStagingLedger().getExportAudits(captureId)
    expect(auditRecords).toHaveLength(1)
  })

  test('handles ULID collision with different content gracefully', async () => {
    // Setup: First capture with specific ULID
    const fixedUlid = '01HWZQK5H0000000000000000G'
    const firstContent = 'First capture content'

    await testPipeline.exportWithUlid(fixedUlid, firstContent)

    // Inject: Force same ULID for different content
    const secondContent = 'Second capture content (different)'
    testPipeline.injectFault('ulid-collision', fixedUlid)

    // Attempt second export with different content
    const result = await testPipeline.attemptExportWithUlid(fixedUlid, secondContent)

    // Verify: Collision detected and handled
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('ULID_CONTENT_CONFLICT')

    // Verify: First file unchanged
    const vaultFile = await testPipeline.getVault().readFile(`inbox/${fixedUlid}.md`)
    expect(vaultFile).toContain(firstContent)
    expect(vaultFile).not.toContain(secondContent)

    // Verify: Conflict logged for investigation
    const errors = await testPipeline.getErrorLog()
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'ULID_CONTENT_CONFLICT',
      severity: 'critical',
      message: expect.stringContaining('ULID collision with different content'),
      ulid: fixedUlid
    }))
  })

  test('handles filesystem permission changes during export', async () => {
    // Setup: Successful capture
    const captureId = await testPipeline.completeCaptureFlow('/icloud/test.m4a')

    // Make vault read-only during export
    testPipeline.injectFault('vault-permission', 'READ_ONLY')

    // Attempt export
    const result = await testPipeline.attemptExport(captureId)

    // Verify: Permission error handled gracefully
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('VAULT_PERMISSION_DENIED')

    // Verify: Descriptive error message
    expect(result.error.message).toContain('vault directory is not writable')
    expect(result.error.message).toContain('check permissions')

    // Verify: No partial files created
    const vaultFiles = await testPipeline.getVault().listFiles()
    expect(vaultFiles).toHaveLength(0)

    // Restore permissions and retry
    testPipeline.clearFaults()

    const retryResult = await testPipeline.attemptExport(captureId)
    expect(retryResult.success).toBe(true)
  })
})
```

---

## 12. Load Testing Patterns (P1)

### 12.1 Sustained Load Testing

```typescript
describe('Sustained Load (P1)', () => {
  test('handles 1000 exports over 10 minutes', async () => {
    const loadTest = new LoadTestHarness()
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Configuration
    const totalOperations = 1000
    const duration = 10 * 60 * 1000 // 10 minutes
    const interval = duration / totalOperations

    // Run sustained load
    const results = await loadTest.runSustained({
      operation: async (iteration) => {
        const captureId = ulid()
        const content = `# Sustained Load Test ${iteration}\n\nContent for export ${iteration}`
        const start = performance.now()

        await bridge.writeAtomic(captureId, content, computeContentHash(content), {
          source: 'voice',
          captured_at: new Date().toISOString()
        })

        return {
          duration: performance.now() - start,
          success: true,
          memory: process.memoryUsage().heapUsed,
          iteration
        }
      },
      count: totalOperations,
      interval
    })

    // Verify: No performance degradation over time
    const firstHalf = results.slice(0, 500).map(r => r.duration)
    const secondHalf = results.slice(500).map(r => r.duration)

    const firstHalfP95 = percentile(firstHalf, 95)
    const secondHalfP95 = percentile(secondHalf, 95)

    // Second half should not be > 50% slower than first half
    expect(secondHalfP95).toBeLessThan(firstHalfP95 * 1.5)

    // Verify: No memory growth
    const memoryGrowth = results[results.length - 1].memory - results[0].memory
    expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024) // < 20MB growth

    // Verify: All operations succeeded
    const failures = results.filter(r => !r.success)
    expect(failures).toHaveLength(0)

    // Verify: All files exist in vault
    const vaultFiles = await listDirectory(path.join(tempVault.path, 'inbox'))
    expect(vaultFiles.filter(f => f.endsWith('.md'))).toHaveLength(1000)

    console.log(`Sustained export load: ${firstHalfP95.toFixed(2)}ms → ${secondHalfP95.toFixed(2)}ms P95`)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })

  test('maintains vault integrity under sustained load', async () => {
    const loadTest = new LoadTestHarness()
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Run concurrent export operations
    const concurrentPromises = Array.from({ length: 10 }, async (_, threadId) => {
      const threadResults = []

      for (let i = 0; i < 50; i++) {
        const captureId = ulid()
        const operationId = `${threadId}_${i}`

        try {
          await bridge.writeAtomic(captureId,
            `# Thread ${threadId} Export ${i}\n\nContent for operation ${operationId}`,
            computeContentHash(`Thread ${threadId} Export ${i}`), {
            source: 'email',
            captured_at: new Date().toISOString()
          })

          threadResults.push({ operationId, success: true })
        } catch (error) {
          threadResults.push({ operationId, success: false, error: error.message })
        }
      }

      return threadResults
    })

    const allResults = await Promise.all(concurrentPromises)
    const flatResults = allResults.flat()

    // Verify: All operations succeeded
    const failures = flatResults.filter(r => !r.success)
    expect(failures).toHaveLength(0)

    // Verify: Vault consistency
    const vaultFiles = await listDirectory(path.join(tempVault.path, 'inbox'))
    const mdFiles = vaultFiles.filter(f => f.endsWith('.md'))
    expect(mdFiles).toHaveLength(500) // 10 threads × 50 operations

    // Verify: No temp files remain
    const tempFiles = vaultFiles.filter(f => f.includes('tmp'))
    expect(tempFiles).toHaveLength(0)

    // Verify: All audit records created
    const auditCount = await ledger.db.prepare('SELECT COUNT(*) as count FROM exports_audit').get()
    expect(auditCount.count).toBe(500)

    // Verify: Database integrity
    const integrityCheck = await ledger.db.get(`PRAGMA integrity_check`)
    expect(integrityCheck.integrity_check).toBe('ok')

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })
})

describe('Burst Load (P1)', () => {
  test('handles 100 exports in 10 seconds', async () => {
    const loadTest = new LoadTestHarness()
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Run burst load - 100 operations as fast as possible over 10 seconds
    const startTime = Date.now()
    const endTime = startTime + 10_000

    const results = []
    let operationCount = 0

    while (Date.now() < endTime && operationCount < 100) {
      const captureId = ulid()
      const start = performance.now()

      try {
        await bridge.writeAtomic(captureId,
          `# Burst Test ${operationCount}\n\nBurst export content ${operationCount}`,
          computeContentHash(`Burst Test ${operationCount}`), {
          source: 'voice',
          captured_at: new Date().toISOString()
        })

        results.push({
          duration: performance.now() - start,
          success: true,
          operationCount
        })
      } catch (error) {
        results.push({
          duration: performance.now() - start,
          success: false,
          error: error.message,
          operationCount
        })
      }

      operationCount++
    }

    // Verify: No data loss
    const successCount = results.filter(r => r.success).length
    expect(successCount).toBe(Math.min(100, operationCount))

    // Verify: Reasonable latency under burst load
    const p95 = percentile(results.map(r => r.duration), 95)
    expect(p95).toBeLessThan(150) // Allow 3x baseline under burst (50ms * 3)

    // Verify: All files exist and are valid
    const vaultFiles = await listDirectory(path.join(tempVault.path, 'inbox'))
    const mdFiles = vaultFiles.filter(f => f.endsWith('.md'))
    expect(mdFiles).toHaveLength(successCount)

    // Verify: No temp files remain
    const tempFiles = vaultFiles.filter(f => f.includes('tmp'))
    expect(tempFiles).toHaveLength(0)

    console.log(`Burst export load: ${results.length} operations, P95: ${p95.toFixed(2)}ms`)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })
})

describe('Resource Exhaustion (P1)', () => {
  test('handles graceful degradation approaching disk limit', async () => {
    const loadTest = new LoadTestHarness()
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Simulate low disk space scenario
    loadTest.setAvailableDiskSpace(10 * 1024 * 1024) // 10MB available

    // Create large content exports
    const largeContent = 'x'.repeat(500 * 1024) // 500KB per export

    const results = []
    for (let i = 0; i < 25; i++) { // Should exceed disk space
      try {
        const captureId = ulid()
        await bridge.writeAtomic(captureId,
          `# Large Export ${i}\n\n${largeContent}`,
          computeContentHash(`Large Export ${i}\n\n${largeContent}`), {
          source: 'voice',
          captured_at: new Date().toISOString()
        })

        results.push({ success: true, operation: i })
      } catch (error) {
        results.push({ success: false, operation: i, error: error.message })
        break
      }
    }

    // Verify: System detects low space and fails gracefully
    const lastResult = results[results.length - 1]
    if (!lastResult.success) {
      expect(lastResult.error).toContain('disk space')

      // Verify: Error provides actionable guidance
      expect(lastResult.error).toContain('free up space')
    }

    // Verify: No partial files from failed writes
    const vaultFiles = await listDirectory(tempVault.path)
    const tempFiles = vaultFiles.filter(f => f.includes('tmp'))
    expect(tempFiles).toHaveLength(0)

    // Verify: Database remains consistent
    const integrityCheck = await ledger.db.get(`PRAGMA integrity_check`)
    expect(integrityCheck.integrity_check).toBe('ok')

    // Verify: System can recover after space is freed
    loadTest.setAvailableDiskSpace(1024 * 1024 * 1024) // Restore 1GB

    const recoveryResult = await bridge.writeAtomic(ulid(),
      '# Recovery Test\n\nRecovery export after disk space freed',
      computeContentHash('Recovery Test'), {
      source: 'voice',
      captured_at: new Date().toISOString()
    })

    expect(recoveryResult.success).toBe(true)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })

  test('handles inode exhaustion gracefully', async () => {
    const loadTest = new LoadTestHarness()
    const tempVault = await createTempDirectory()
    const ledger = createTestLedger()
    const bridge = new ObsidianAtomicWriter(tempVault.path, ledger.db)

    // Simulate inode exhaustion
    loadTest.setAvailableInodes(1000)

    const results = []
    for (let i = 0; i < 1200; i++) { // Should exceed inode limit
      try {
        const captureId = ulid()
        await bridge.writeAtomic(captureId,
          `# Inode Test ${i}\n\nTesting inode exhaustion`,
          computeContentHash(`Inode Test ${i}`), {
          source: 'email',
          captured_at: new Date().toISOString()
        })

        results.push({ success: true, operation: i })
      } catch (error) {
        results.push({ success: false, operation: i, error: error.message })

        if (error.message.includes('inode') || error.message.includes('ENOSPC')) {
          break
        }
      }
    }

    // Verify: Inode exhaustion detected
    const lastResult = results[results.length - 1]
    if (!lastResult.success) {
      expect(lastResult.error).toMatch(/inode|ENOSPC/)
    }

    // Verify: No partial files remain
    const vaultFiles = await listDirectory(tempVault.path)
    const tempFiles = vaultFiles.filter(f => f.includes('tmp'))
    expect(tempFiles).toHaveLength(0)

    await cleanupTempDirectory(tempVault)
    ledger.close()
  })
})
```

### 12.2 Load Test Infrastructure Extensions

```typescript
class LoadTestHarness {
  private diskSpaceLimit?: number
  private inodeLimit?: number

  setAvailableDiskSpace(bytes: number) {
    this.diskSpaceLimit = bytes
    // Mock filesystem to respect disk space limit
  }

  setAvailableInodes(count: number) {
    this.inodeLimit = count
    // Mock filesystem to respect inode limit
  }

  async runSustained(config: {
    operation: (iteration: number) => Promise<LoadTestResult>
    count: number
    interval: number
  }): Promise<LoadTestResult[]> {
    const results = []

    for (let i = 0; i < config.count; i++) {
      const startTime = Date.now()

      try {
        const result = await config.operation(i)
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          iteration: i,
          duration: Date.now() - startTime
        })
      }

      // Wait for next interval
      const elapsed = Date.now() - startTime
      const waitTime = Math.max(0, config.interval - elapsed)
      if (waitTime > 0) {
        await delay(waitTime)
      }
    }

    return results
  }

  async checkVaultIntegrity(vaultPath: string): Promise<{ valid: boolean, issues: string[] }> {
    const issues = []

    try {
      // Check for temp files
      const files = await listDirectory(vaultPath)
      const tempFiles = files.filter(f => f.includes('tmp'))
      if (tempFiles.length > 0) {
        issues.push(`Found ${tempFiles.length} temp files`)
      }

      // Check for malformed markdown files
      const mdFiles = files.filter(f => f.endsWith('.md'))
      for (const file of mdFiles) {
        const content = await fs.readFile(path.join(vaultPath, file), 'utf-8')
        if (!content.startsWith('---') || !content.includes('---\n\n#')) {
          issues.push(`Malformed markdown file: ${file}`)
        }
      }

    } catch (error) {
      issues.push(`Vault access error: ${error.message}`)
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }
}

interface LoadTestResult {
  success: boolean
  duration: number
  memory?: number
  iteration?: number
  error?: string
  operationCount?: number
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.floor(sorted.length * (p / 100))
  return sorted[index]
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function listDirectory(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath)
  } catch (error) {
    return []
  }
}
```

---

## Appendix: The Nerdy Testing Joke

The Obsidian Bridge test suite is like a paranoid security guard at a bank vault: it checks your ID three times (ULID validation), makes sure you're not smuggling anything weird (content hash verification), escorts you through the proper entrance only (temp-then-rename), and keeps a detailed log of everyone who entered and when they left (audit trail). And just like a good security guard, it never takes coffee breaks during atomic operations—because that's when the heists happen! 🏦🔒

Now with performance testing, it's also like a speed camera that measures how fast each transaction goes through the vault door. If exports start moving slower than molasses in January, the performance regression gates will sound the alarm faster than your ADHD brain can say "wait, what was I exporting again?" 📊⚡

(The test suite runs faster than your ADHD attention span, which is measured in microseconds of deterministic bliss.)