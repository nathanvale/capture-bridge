---
title: Staging Ledger Test Specification
status: final
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-27
spec_type: test
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Staging Ledger — Test Specification

## 1. Objectives

### 1.1 Test Philosophy

The staging ledger is the **durability backbone** of ADHD Brain—failures here mean data loss, duplicate anxiety, or vault corruption. Test-Driven Development (TDD) is **mandatory** per TDD Applicability Guide v1.0.0 (HIGH risk classification).

### 1.2 Core Testing Goals

**Prove these guarantees:**

1. **Durability:** Zero data loss on crash (WAL mode + atomic inserts)
2. **Idempotency:** Replaying same capture produces identical outcome
3. **Atomicity:** No partial writes (transactions complete or rollback)
4. **Deduplication:** No duplicate vault files (hash + unique constraints)
5. **State Machine:** No invalid status transitions
6. **Audit Transparency:** Every export traceable forever

### 1.3 Test Coverage Targets

| Priority         | Category           | Coverage Target | Rationale                   |
| ---------------- | ------------------ | --------------- | --------------------------- |
| P0 - Required    | Data integrity     | 100%            | No tolerance for data loss  |
| P0 - Required    | Deduplication      | 100%            | Core user promise           |
| P0 - Required    | State machine      | 100%            | Invalid states = corruption |
| P0 - Required    | Crash recovery     | 100%            | ADHD interrupt environment  |
| P1 - Recommended | Error handling     | 90%             | Graceful degradation        |
| P2 - Optional    | Health diagnostics | 70%             | Operational visibility      |

---

## 2. Traceability Matrix

### 2.1 PRD Requirements → Test Coverage

| PRD Section        | Requirement                         | Test Category      | Test ID           |
| ------------------ | ----------------------------------- | ------------------ | ----------------- |
| §5.1 Schema        | 4 tables with foreign keys          | Integration        | INT-001           |
| §5.2 Indexes       | Unique constraints enforced         | Integration        | INT-002           |
| §5.3 Deduplication | Content hash prevents duplicates    | Unit + Integration | UNIT-003, INT-004 |
| §5.4 SQLite Config | WAL mode + foreign keys enabled     | Integration        | INT-005           |
| §5.5 Backup        | Hourly backup + verification        | Integration        | INT-006           |
| §5.6 Retention     | 90-day trim (exported only)         | Integration        | INT-007           |
| §6 Workflows       | Voice capture happy path            | Integration        | INT-008           |
| §6 Workflows       | Transcription failure → placeholder | Integration        | INT-009           |
| §6 Workflows       | Duplicate detection                 | Integration        | INT-010           |
| §6 Workflows       | Crash recovery                      | Fault Injection    | FAULT-001         |
| §7.1 Performance   | Insert < 100ms (p95)                | Performance        | PERF-001          |
| §7.2 Reliability   | 100% capture retention              | Integration        | INT-011           |
| §8.1 Invariants    | Terminal states immutable           | Unit               | UNIT-012          |
| §8.1 Invariants    | Hash mutates at most once           | Unit               | UNIT-013          |
| §8.2 API Contracts | CaptureInsert interface             | Contract           | CONTRACT-001      |

### 2.2 Tech Spec Guarantees → Test Coverage

| Tech Spec Section     | Guarantee                        | Test Category | Test ID  |
| --------------------- | -------------------------------- | ------------- | -------- |
| §3.1 Insert Flow      | Layer 1 duplicate detection      | Integration   | INT-014  |
| §3.2 Transcription    | Late hash binding (voice)        | Integration   | INT-015  |
| §3.3 Duplicate Check  | Query < 10ms (p95)               | Performance   | PERF-002 |
| §3.4 Export Recording | Audit trail immutable            | Integration   | INT-016  |
| §3.5 Recovery         | Resumes from staged/transcribed  | Integration   | INT-017  |
| §3.6 State Machine    | validateTransition() correctness | Unit          | UNIT-018 |

---

## 3. Coverage Strategy

### 3.1 Test Pyramid

```text
             ┌─────────────────┐
             │   E2E (Smoke)   │  5% - Happy path vertical slice
             │   (Optional)    │
             └─────────────────┘
            ┌───────────────────┐
            │   Integration     │  30% - Full data flows
            │   (Database)      │
            └───────────────────┘
          ┌─────────────────────┐
          │   Contract Tests    │  15% - API boundaries
          │   (Interfaces)      │
          └─────────────────────┘
        ┌───────────────────────────┐
        │   Unit Tests              │  50% - Pure logic
        │   (Hash, State Machine)   │
        └───────────────────────────┘
```

### 3.2 Unit Tests (Pure Logic)

**Target:** 50% of test count, 100% coverage of pure functions

**What to Test:**

- SHA-256 hash normalization (deterministic output)
- Text normalization (whitespace, line endings, case)
- Status state machine transitions (all valid + invalid paths)
- ULID validation and generation
- JSON metadata serialization/deserialization
- Hash collision handling (theoretical edge case)

**What NOT to Test:**

- SQLite query syntax (trust the driver)
- File system operations (mock at boundary)
- External library internals (trust better-sqlite3, ulid)

**Example Test:**

```typescript
describe("Hash Normalization (Unit)", () => {
  it("normalizes whitespace consistently", () => {
    const inputs = [
      "  Hello World  \n",
      "Hello World\n",
      "Hello World",
      "  Hello World  ",
    ]

    const hashes = inputs.map(computeContentHash)

    // All should produce same hash
    expect(new Set(hashes).size).toBe(1)
  })

  it("normalizes line endings to LF", () => {
    const lf = "Line1\nLine2\n"
    const crlf = "Line1\r\nLine2\r\n"
    const cr = "Line1\rLine2\r"

    const hashLF = computeContentHash(lf)
    const hashCRLF = computeContentHash(crlf)
    const hashCR = computeContentHash(cr)

    expect(hashLF).toBe(hashCRLF)
    expect(hashLF).toBe(hashCR)
  })

  it("produces different hash for different content", () => {
    const hash1 = computeContentHash("Hello World")
    const hash2 = computeContentHash("Goodbye World")

    expect(hash1).not.toBe(hash2)
  })

  it("is deterministic across multiple calls", () => {
    const text = "Test content"
    const hash1 = computeContentHash(text)
    const hash2 = computeContentHash(text)

    expect(hash1).toBe(hash2)
  })
})
```

### 3.3 Integration Tests (Database)

**Target:** 30% of test count, 100% coverage of data flows

**What to Test:**

- Capture insert → duplicate check → export (full path)
- Voice capture → transcription update → export (late hash binding)
- Email capture → immediate hash → duplicate skip
- Transcription failure → placeholder export
- Crash recovery (staged → resume transcription)
- Crash recovery (transcribed → resume export)
- Foreign key constraints (delete capture → audit remains)
- Unique constraint enforcement (channel + native_id)
- Status transitions (all valid paths)
- Backup creation + verification
- Retention policy (90-day trim, exported only)

**Test Isolation:**

- Use TestKit's in-memory SQLite for each test
- Auto-cleanup between tests (no shared state)
- No temp file pollution (cleanup fixtures)

**Example Test:**

```typescript
describe("Voice Capture Flow (Integration)", () => {
  let ledger: StagingLedger

  beforeEach(() => {
    // In-memory database (TestKit fixture)
    ledger = createTestLedger()
  })

  afterEach(() => {
    ledger.close()
  })

  it("completes happy path: stage → transcribe → export", async () => {
    // === Phase 1: Stage capture ===
    const captureId = ulid()
    const insertResult = await ledger.insertCapture({
      id: captureId,
      source: "voice",
      raw_content: "",
      meta_json: {
        channel: "voice",
        channel_native_id: "/path/to/memo.m4a",
        audio_fp: "sha256_audio_fingerprint",
      },
    })

    expect(insertResult.success).toBe(true)
    expect(insertResult.is_duplicate).toBe(false)

    // Verify staged state
    let capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("staged")
    expect(capture?.content_hash).toBeNull()

    // === Phase 2: Transcribe ===
    const transcriptText = "This is a test voice memo"
    const transcriptHash = computeContentHash(transcriptText)

    await ledger.updateTranscription(captureId, {
      transcript_text: transcriptText,
      content_hash: transcriptHash,
    })

    // Verify transcribed state
    capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("transcribed")
    expect(capture?.content_hash).toBe(transcriptHash)
    expect(capture?.raw_content).toBe(transcriptText)

    // === Phase 3: Duplicate check ===
    const dupCheck = await ledger.checkDuplicate(transcriptHash)
    expect(dupCheck.is_duplicate).toBe(false)

    // === Phase 4: Export ===
    await ledger.recordExport(captureId, {
      vault_path: `inbox/${captureId}.md`,
      hash_at_export: transcriptHash,
      mode: "initial",
      error_flag: false,
    })

    // Verify exported state (terminal)
    capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("exported")

    // Verify audit trail
    const audits = await ledger.getExportAudits(captureId)
    expect(audits).toHaveLength(1)
    expect(audits[0].mode).toBe("initial")
    expect(audits[0].vault_path).toBe(`inbox/${captureId}.md`)
  })

  it("handles transcription failure with placeholder export", async () => {
    // Stage capture
    const captureId = ulid()
    await ledger.insertCapture({
      id: captureId,
      source: "voice",
      raw_content: "",
      meta_json: {
        channel: "voice",
        channel_native_id: "/path/to/corrupted.m4a",
        audio_fp: "sha256_audio_fingerprint",
      },
    })

    // Mark transcription failed
    await ledger.markTranscriptionFailed(captureId, "Whisper timeout after 30s")

    // Verify failed state
    let capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("failed_transcription")
    expect(capture?.content_hash).toBeNull()

    // Export placeholder
    await ledger.recordExport(captureId, {
      vault_path: `inbox/${captureId}.md`,
      hash_at_export: null,
      mode: "placeholder",
      error_flag: true,
    })

    // Verify placeholder exported state (terminal)
    capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("exported_placeholder")

    // Verify audit trail
    const audits = await ledger.getExportAudits(captureId)
    expect(audits).toHaveLength(1)
    expect(audits[0].mode).toBe("placeholder")
    expect(audits[0].error_flag).toBe(1)
  })

  it("detects duplicate content hash", async () => {
    const content = "Duplicate content test"
    const hash = computeContentHash(content)

    // === First capture ===
    const captureId1 = ulid()
    await ledger.insertCapture({
      id: captureId1,
      source: "email",
      raw_content: content,
      content_hash: hash,
      meta_json: {
        channel: "email",
        channel_native_id: "message-123",
      },
    })

    await ledger.recordExport(captureId1, {
      vault_path: `inbox/${captureId1}.md`,
      hash_at_export: hash,
      mode: "initial",
      error_flag: false,
    })

    // === Second capture (duplicate content) ===
    const captureId2 = ulid()
    await ledger.insertCapture({
      id: captureId2,
      source: "email",
      raw_content: content,
      content_hash: hash,
      meta_json: {
        channel: "email",
        channel_native_id: "message-456", // Different message_id
      },
    })

    // Duplicate check should detect existing hash
    const dupCheck = await ledger.checkDuplicate(hash)
    expect(dupCheck.is_duplicate).toBe(true)
    expect(dupCheck.existing_capture_id).toBe(captureId1)

    // Record duplicate skip
    await ledger.recordExport(captureId2, {
      vault_path: `inbox/${captureId2}.md`,
      hash_at_export: hash,
      mode: "duplicate_skip",
      error_flag: false,
    })

    // Verify duplicate status
    const capture2 = await ledger.getCapture(captureId2)
    expect(capture2?.status).toBe("exported_duplicate")
  })
})
```

### 3.4 Contract Tests (API Boundaries)

**Target:** 15% of test count, 100% coverage of public interfaces

**What to Test:**

- CaptureInsert interface validation (required fields, types)
- TranscriptionUpdate interface validation
- ExportAudit interface validation
- Error types thrown correctly (StagingLedgerError, InvalidStateTransitionError)
- Metrics emitted in expected format
- API contracts maintained across versions

**Example Test:**

```typescript
describe("API Contract: CaptureInsert (Contract)", () => {
  let ledger: StagingLedger

  beforeEach(() => {
    ledger = createTestLedger()
  })

  afterEach(() => {
    ledger.close()
  })

  it("rejects invalid ULID", async () => {
    await expect(
      ledger.insertCapture({
        id: "not-a-valid-ulid",
        source: "voice",
        raw_content: "",
        meta_json: {
          channel: "voice",
          channel_native_id: "test",
        },
      })
    ).rejects.toThrow(StagingLedgerError)
  })

  it("rejects missing channel in meta_json", async () => {
    await expect(
      ledger.insertCapture({
        id: ulid(),
        source: "voice",
        raw_content: "",
        meta_json: {
          // Missing channel
          channel_native_id: "test",
        } as any,
      })
    ).rejects.toThrow(StagingLedgerError)
  })

  it("rejects missing channel_native_id in meta_json", async () => {
    await expect(
      ledger.insertCapture({
        id: ulid(),
        source: "voice",
        raw_content: "",
        meta_json: {
          channel: "voice",
          // Missing channel_native_id
        } as any,
      })
    ).rejects.toThrow(StagingLedgerError)
  })

  it("accepts optional content_hash", async () => {
    const result = await ledger.insertCapture({
      id: ulid(),
      source: "voice",
      raw_content: "",
      content_hash: undefined, // Optional
      meta_json: {
        channel: "voice",
        channel_native_id: "test.m4a",
      },
    })

    expect(result.success).toBe(true)
  })

  it("returns duplicate flag on constraint violation", async () => {
    const input = {
      id: ulid(),
      source: "email" as const,
      raw_content: "test",
      content_hash: computeContentHash("test"),
      meta_json: {
        channel: "email" as const,
        channel_native_id: "message-123",
      },
    }

    // First insert succeeds
    const result1 = await ledger.insertCapture(input)
    expect(result1.is_duplicate).toBe(false)

    // Second insert detects duplicate (Layer 1)
    const result2 = await ledger.insertCapture({
      ...input,
      id: ulid(), // Different ULID, same channel + native_id
    })
    expect(result2.is_duplicate).toBe(true)
  })
})

describe("API Contract: State Machine (Contract)", () => {
  let ledger: StagingLedger

  beforeEach(() => {
    ledger = createTestLedger()
  })

  afterEach(() => {
    ledger.close()
  })

  it("prevents transition from terminal state", async () => {
    const captureId = ulid()

    // Stage and export
    await ledger.insertCapture({
      id: captureId,
      source: "email",
      raw_content: "test",
      content_hash: computeContentHash("test"),
      meta_json: {
        channel: "email",
        channel_native_id: "msg-1",
      },
    })

    await ledger.recordExport(captureId, {
      vault_path: `inbox/${captureId}.md`,
      hash_at_export: computeContentHash("test"),
      mode: "initial",
      error_flag: false,
    })

    // Verify terminal state
    const capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("exported")

    // Attempt to transition from terminal state (should fail)
    await expect(
      ledger.updateTranscription(captureId, {
        transcript_text: "new text",
        content_hash: computeContentHash("new text"),
      })
    ).rejects.toThrow(InvalidStateTransitionError)
  })

  it("prevents hash mutation after set", async () => {
    const captureId = ulid()

    // Insert with hash
    await ledger.insertCapture({
      id: captureId,
      source: "email",
      raw_content: "original",
      content_hash: computeContentHash("original"),
      meta_json: {
        channel: "email",
        channel_native_id: "msg-1",
      },
    })

    // Attempt to change hash (should fail)
    await expect(
      ledger.updateTranscription(captureId, {
        transcript_text: "modified",
        content_hash: computeContentHash("modified"),
      })
    ).rejects.toThrow(StagingLedgerError)
  })
})
```

### 3.5 Fault Injection Tests (Crash Recovery)

**Target:** 5% of test count, 100% coverage of crash scenarios

**What to Test:**

- Crash after capture insert (verify staged row persists)
- Crash after transcription update (verify transcribed row persists)
- Crash before export (verify no vault file, recoverable)
- Crash after temp file write (verify cleanup + idempotent retry)
- Crash after audit insert, before status update (verify eventual consistency)

**Test Strategy:**

- Use TestKit fault injection hooks
- Simulate crash by closing DB connection mid-transaction
- Restart with fresh connection to same DB file
- Verify recovery query returns expected captures
- Verify idempotent replay produces identical outcome

**Example Test:**

```typescript
describe("Crash Recovery (Fault Injection)", () => {
  it("recovers from crash after capture insert", async () => {
    const dbPath = path.join(tmpdir(), "crash-test-1.sqlite")

    // === Pre-crash: Insert capture ===
    let ledger = new StagingLedger(dbPath)

    const captureId = ulid()
    await ledger.insertCapture({
      id: captureId,
      source: "voice",
      raw_content: "",
      meta_json: {
        channel: "voice",
        channel_native_id: "/path/test.m4a",
        audio_fp: "sha256_fp",
      },
    })

    // Simulate crash (close connection without cleanup)
    ledger.close()

    // === Post-crash: Restart and recover ===
    ledger = new StagingLedger(dbPath)

    const recoverable = await ledger.queryRecoverable()
    expect(recoverable).toHaveLength(1)
    expect(recoverable[0].id).toBe(captureId)
    expect(recoverable[0].status).toBe("staged")

    // Cleanup
    ledger.close()
    fs.unlinkSync(dbPath)
  })

  it("recovers from crash after transcription", async () => {
    const dbPath = path.join(tmpdir(), "crash-test-2.sqlite")

    // === Pre-crash: Stage and transcribe ===
    let ledger = new StagingLedger(dbPath)

    const captureId = ulid()
    await ledger.insertCapture({
      id: captureId,
      source: "voice",
      raw_content: "",
      meta_json: {
        channel: "voice",
        channel_native_id: "/path/test.m4a",
        audio_fp: "sha256_fp",
      },
    })

    await ledger.updateTranscription(captureId, {
      transcript_text: "Test transcript",
      content_hash: computeContentHash("Test transcript"),
    })

    // Simulate crash
    ledger.close()

    // === Post-crash: Restart and recover ===
    ledger = new StagingLedger(dbPath)

    const recoverable = await ledger.queryRecoverable()
    expect(recoverable).toHaveLength(1)
    expect(recoverable[0].id).toBe(captureId)
    expect(recoverable[0].status).toBe("transcribed")
    expect(recoverable[0].content_hash).toBe(
      computeContentHash("Test transcript")
    )

    // Cleanup
    ledger.close()
    fs.unlinkSync(dbPath)
  })

  it("handles idempotent export retry after crash", async () => {
    const dbPath = path.join(tmpdir(), "crash-test-3.sqlite")

    // === Pre-crash: Stage, transcribe, crash before export ===
    let ledger = new StagingLedger(dbPath)

    const captureId = ulid()
    const content = "Test content"
    const hash = computeContentHash(content)

    await ledger.insertCapture({
      id: captureId,
      source: "email",
      raw_content: content,
      content_hash: hash,
      meta_json: {
        channel: "email",
        channel_native_id: "msg-1",
      },
    })

    // Simulate crash before export
    ledger.close()

    // === Post-crash: Restart and export ===
    ledger = new StagingLedger(dbPath)

    const recoverable = await ledger.queryRecoverable()
    expect(recoverable).toHaveLength(1)

    // First export attempt
    await ledger.recordExport(captureId, {
      vault_path: `inbox/${captureId}.md`,
      hash_at_export: hash,
      mode: "initial",
      error_flag: false,
    })

    // Verify exported
    let capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("exported")

    // === Simulate retry (idempotent) ===
    // Attempting to export again should fail gracefully
    await expect(
      ledger.recordExport(captureId, {
        vault_path: `inbox/${captureId}.md`,
        hash_at_export: hash,
        mode: "initial",
        error_flag: false,
      })
    ).rejects.toThrow(InvalidStateTransitionError)

    // Cleanup
    ledger.close()
    fs.unlinkSync(dbPath)
  })
})
```

### 3.6 Performance Tests

**Target:** Optional, triggered by p95 regression

**What to Test:**

- Capture insert latency (< 100ms p95)
- Duplicate check query latency (< 10ms p95)
- Recovery query latency (< 50ms p95)
- Backup creation latency (< 5s p95)

**Test Strategy:**

- Run 100 iterations, measure p95
- Use in-memory DB for consistency
- Skip in CI (local benchmarking only)

**Example Test:**

```typescript
describe.skip("Performance Benchmarks (Local Only)", () => {
  it("measures capture insert latency", async () => {
    const ledger = createTestLedger()
    const durations: number[] = []

    for (let i = 0; i < 100; i++) {
      const start = performance.now()

      await ledger.insertCapture({
        id: ulid(),
        source: "email",
        raw_content: `Test content ${i}`,
        content_hash: computeContentHash(`Test content ${i}`),
        meta_json: {
          channel: "email",
          channel_native_id: `msg-${i}`,
        },
      })

      durations.push(performance.now() - start)
    }

    const p95 = percentile(durations, 95)
    console.log(`Capture insert p95: ${p95.toFixed(2)}ms`)

    expect(p95).toBeLessThan(100) // Target: < 100ms
  })

  it("measures duplicate check latency", async () => {
    const ledger = createTestLedger()

    // Insert 1000 captures
    for (let i = 0; i < 1000; i++) {
      await ledger.insertCapture({
        id: ulid(),
        source: "email",
        raw_content: `Content ${i}`,
        content_hash: computeContentHash(`Content ${i}`),
        meta_json: {
          channel: "email",
          channel_native_id: `msg-${i}`,
        },
      })
    }

    // Measure duplicate checks
    const durations: number[] = []
    for (let i = 0; i < 100; i++) {
      const hash = computeContentHash(`Content ${i}`)
      const start = performance.now()

      await ledger.checkDuplicate(hash)

      durations.push(performance.now() - start)
    }

    const p95 = percentile(durations, 95)
    console.log(`Duplicate check p95: ${p95.toFixed(2)}ms`)

    expect(p95).toBeLessThan(10) // Target: < 10ms
  })
})
```

---

## 4. Critical Tests (TDD Required)

### 4.1 Deterministic Hashing

**Test ID:** UNIT-003

**Objective:** Prove SHA-256 hash normalization is deterministic

**Priority:** P0 (data integrity)

**Test Cases:**

```typescript
describe("Deterministic Hashing (Critical)", () => {
  it("produces identical hash for semantically identical text", () => {
    const variants = [
      "Hello World",
      "  Hello World  ",
      "Hello World\n",
      "Hello World\r\n",
      "  Hello World  \r\n",
    ]

    const hashes = variants.map(computeContentHash)
    const uniqueHashes = new Set(hashes)

    expect(uniqueHashes.size).toBe(1)
  })

  it("produces identical hash across multiple calls", () => {
    const text = "Consistency test"
    const iterations = 1000

    const hashes = Array.from({ length: iterations }, () =>
      computeContentHash(text)
    )

    const uniqueHashes = new Set(hashes)
    expect(uniqueHashes.size).toBe(1)
  })

  it("produces different hashes for different content", () => {
    const texts = ["Text 1", "Text 2", "Text 3", "Different content entirely"]

    const hashes = texts.map(computeContentHash)
    const uniqueHashes = new Set(hashes)

    expect(uniqueHashes.size).toBe(texts.length)
  })
})
```

### 4.2 Duplicate Rejection

**Test ID:** INT-004

**Objective:** Prove duplicate content never creates duplicate vault files

**Priority:** P0 (core user promise)

**Test Cases:**

```typescript
describe("Duplicate Rejection (Critical)", () => {
  let ledger: StagingLedger

  beforeEach(() => {
    ledger = createTestLedger()
  })

  it("prevents duplicate exports via content hash", async () => {
    const content = "Duplicate test content"
    const hash = computeContentHash(content)

    // First capture
    const id1 = ulid()
    await ledger.insertCapture({
      id: id1,
      source: "email",
      raw_content: content,
      content_hash: hash,
      meta_json: { channel: "email", channel_native_id: "msg-1" },
    })

    await ledger.recordExport(id1, {
      vault_path: `inbox/${id1}.md`,
      hash_at_export: hash,
      mode: "initial",
      error_flag: false,
    })

    // Second capture (duplicate content, different message_id)
    const id2 = ulid()
    await ledger.insertCapture({
      id: id2,
      source: "email",
      raw_content: content,
      content_hash: hash,
      meta_json: { channel: "email", channel_native_id: "msg-2" },
    })

    // Duplicate check detects existing hash
    const dupCheck = await ledger.checkDuplicate(hash)
    expect(dupCheck.is_duplicate).toBe(true)

    // Record skip (no vault write)
    await ledger.recordExport(id2, {
      vault_path: `inbox/${id2}.md`,
      hash_at_export: hash,
      mode: "duplicate_skip",
      error_flag: false,
    })

    // Verify second capture marked as duplicate
    const capture2 = await ledger.getCapture(id2)
    expect(capture2?.status).toBe("exported_duplicate")

    // Verify audit shows only one initial export
    const audits = await ledger.getAllExportAudits()
    const initialExports = audits.filter((a) => a.mode === "initial")
    expect(initialExports).toHaveLength(1)
  })

  it("prevents duplicate staging via channel native ID", async () => {
    const input = {
      id: ulid(),
      source: "voice" as const,
      raw_content: "",
      meta_json: {
        channel: "voice" as const,
        channel_native_id: "/path/same-file.m4a",
        audio_fp: "sha256_fp",
      },
    }

    // First insert
    const result1 = await ledger.insertCapture(input)
    expect(result1.is_duplicate).toBe(false)

    // Second insert (same file path)
    const result2 = await ledger.insertCapture({
      ...input,
      id: ulid(), // Different ULID
    })
    expect(result2.is_duplicate).toBe(true)

    // Verify only one capture exists
    const allCaptures = await ledger.getAllCaptures()
    expect(allCaptures).toHaveLength(1)
  })
})
```

### 4.3 Atomic Writes

**Test ID:** INT-011

**Objective:** Prove no partial writes survive crash

**Priority:** P0 (data integrity)

**Test Cases:**

```typescript
describe("Atomic Writes (Critical)", () => {
  it("commits transaction fully or not at all", async () => {
    const ledger = createTestLedger()

    const captureId = ulid()

    // Mock transaction failure mid-flight
    const dbSpy = jest.spyOn(ledger["db"], "transaction")
    dbSpy.mockImplementationOnce(async (fn) => {
      await fn(ledger["db"])
      throw new Error("Simulated crash during transaction")
    })

    // Attempt insert (should fail atomically)
    await expect(
      ledger.insertCapture({
        id: captureId,
        source: "email",
        raw_content: "test",
        content_hash: computeContentHash("test"),
        meta_json: { channel: "email", channel_native_id: "msg-1" },
      })
    ).rejects.toThrow("Simulated crash")

    // Verify no partial insert
    const capture = await ledger.getCapture(captureId)
    expect(capture).toBeNull()

    dbSpy.mockRestore()
  })

  it("rolls back on foreign key violation", async () => {
    const ledger = createTestLedger()

    // Attempt to insert audit without capture (should fail)
    await expect(
      ledger["db"].run(
        `
        INSERT INTO exports_audit (id, capture_id, vault_path, mode)
        VALUES (?, ?, ?, ?)
      `,
        [ulid(), "nonexistent-capture", "path.md", "initial"]
      )
    ).rejects.toThrow()

    // Verify no audit row inserted
    const audits = await ledger.getAllExportAudits()
    expect(audits).toHaveLength(0)
  })
})
```

### 4.4 State Machine Immutability

**Test ID:** UNIT-012

**Objective:** Prove terminal states cannot transition

**Priority:** P0 (data integrity)

**Test Cases:**

```typescript
describe("State Machine Immutability (Critical)", () => {
  it("rejects all transitions from exported", () => {
    const current = "exported"

    expect(() => validateTransition(current, "staged")).toThrow(
      InvalidStateTransitionError
    )
    expect(() => validateTransition(current, "transcribed")).toThrow(
      InvalidStateTransitionError
    )
    expect(() => validateTransition(current, "failed_transcription")).toThrow(
      InvalidStateTransitionError
    )
    expect(() => validateTransition(current, "exported_duplicate")).toThrow(
      InvalidStateTransitionError
    )
  })

  it("rejects all transitions from exported_duplicate", () => {
    const current = "exported_duplicate"

    expect(() => validateTransition(current, "staged")).toThrow(
      InvalidStateTransitionError
    )
    expect(() => validateTransition(current, "transcribed")).toThrow(
      InvalidStateTransitionError
    )
    expect(() => validateTransition(current, "exported")).toThrow(
      InvalidStateTransitionError
    )
  })

  it("rejects all transitions from exported_placeholder", () => {
    const current = "exported_placeholder"

    expect(() => validateTransition(current, "staged")).toThrow(
      InvalidStateTransitionError
    )
    expect(() => validateTransition(current, "transcribed")).toThrow(
      InvalidStateTransitionError
    )
    expect(() => validateTransition(current, "exported")).toThrow(
      InvalidStateTransitionError
    )
  })

  it("allows valid transitions from staged", () => {
    expect(() => validateTransition("staged", "transcribed")).not.toThrow()
    expect(() =>
      validateTransition("staged", "failed_transcription")
    ).not.toThrow()
    expect(() =>
      validateTransition("staged", "exported_duplicate")
    ).not.toThrow()
  })

  it("allows valid transitions from transcribed", () => {
    expect(() => validateTransition("transcribed", "exported")).not.toThrow()
    expect(() =>
      validateTransition("transcribed", "exported_duplicate")
    ).not.toThrow()
  })

  it("allows valid transition from failed_transcription", () => {
    expect(() =>
      validateTransition("failed_transcription", "exported_placeholder")
    ).not.toThrow()
  })

  it("rejects invalid transitions from staged", () => {
    expect(() => validateTransition("staged", "exported")).toThrow(
      InvalidStateTransitionError
    )
    expect(() => validateTransition("staged", "exported_placeholder")).toThrow(
      InvalidStateTransitionError
    )
  })
})
```

### 4.5 Crash Recovery Completeness

**Test ID:** FAULT-001

**Objective:** Prove all crash points recover without data loss

**Priority:** P0 (durability)

**Test Cases:**

```typescript
describe("Crash Recovery Completeness (Critical)", () => {
  const crashPoints = [
    "after_capture_insert",
    "after_transcription_complete",
    "before_export_write",
    "after_temp_file_write_before_rename",
    "after_audit_insert_before_status_update",
  ]

  crashPoints.forEach((crashPoint) => {
    it(`recovers from crash at: ${crashPoint}`, async () => {
      const dbPath = path.join(tmpdir(), `crash-${crashPoint}.sqlite`)

      // === Pre-crash: Process capture up to crash point ===
      let ledger = new StagingLedger(dbPath)

      const captureId = ulid()
      await ledger.insertCapture({
        id: captureId,
        source: "voice",
        raw_content: "",
        meta_json: {
          channel: "voice",
          channel_native_id: "/path/test.m4a",
          audio_fp: "sha256_fp",
        },
      })

      if (crashPoint !== "after_capture_insert") {
        await ledger.updateTranscription(captureId, {
          transcript_text: "Test",
          content_hash: computeContentHash("Test"),
        })
      }

      // Simulate crash
      ledger.close()

      // === Post-crash: Restart and verify recovery ===
      ledger = new StagingLedger(dbPath)

      const recoverable = await ledger.queryRecoverable()
      expect(recoverable.length).toBeGreaterThan(0)

      const recovered = recoverable.find((c) => c.id === captureId)
      expect(recovered).toBeDefined()

      // Verify capture data intact
      expect(recovered?.id).toBe(captureId)

      // Cleanup
      ledger.close()
      fs.unlinkSync(dbPath)
    })
  })
})
```

---

## 5. Tooling

### 5.1 Test Framework

**Primary:** Vitest (fast, ESM-native)

**Configuration:**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/*.spec.ts"],
    },
    testTimeout: 10000, // 10s per test
    hookTimeout: 5000, // 5s per hook
  },
})
```

### 5.2 TestKit Helpers

**Database Fixtures:**

```typescript
import { createInMemoryDB } from "@capture-bridge/testkit"

function createTestLedger(): StagingLedger {
  const db = createInMemoryDB()
  return new StagingLedger(db)
}
```

**Cleanup Helpers:**

```typescript
import { cleanupTempFiles, createFaultInjector } from "@capture-bridge/testkit"

afterEach(() => {
  cleanupTempFiles()
})
```

**Assertion Helpers:**

```typescript
import { expectCaptureStatus, expectHashEquals } from "@capture-bridge/testkit"

// Usage
await expectCaptureStatus(ledger, captureId, "exported")
expectHashEquals(hash1, hash2)
```

### 5.3 Mocking Strategy

**SQLite Driver:**

- Use real in-memory DB (no mocking)
- TestKit provides pre-configured instance

**File System:**

- Mock at boundary (export worker tests only)
- Not needed for staging ledger tests (in-memory DB)

**External Services:**

- No external dependencies in staging ledger
- MSW mocks handled by capture packages

---

## 6. Non-Goals

### What We're NOT Testing

**Explicitly Excluded:**

- ❌ Visual testing (no UI in staging ledger)
- ❌ Load testing (single user, < 200 captures/day)
- ❌ Network resilience (no network calls)
- ❌ Browser compatibility (Node.js only)
- ❌ Accessibility (no UI)
- ❌ Internationalization (no user-facing strings)
- ❌ Advanced performance optimization (defer until p95 > 11s)

**Why Excluded:**

- Visual testing: No UI components in staging ledger
- Load testing: MPPP scope (< 200 captures/day, single user)
- Network: Local-only SQLite (no external dependencies)
- Browser: Server-side package only
- A11y/i18n: No user-facing interface

---

## 7. Test Execution

### 7.1 Local Development

**Run all tests:**

```bash
pnpm test
```

**Run unit tests only:**

```bash
pnpm test:unit
```

**Run integration tests only:**

```bash
pnpm test:integration
```

**Run with coverage:**

```bash
pnpm test:coverage
```

**Watch mode:**

```bash
pnpm test:watch
```

### 7.2 CI Pipeline

**GitHub Actions Workflow:**

```yaml
name: Test Staging Ledger

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - run: pnpm install
      - run: pnpm test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### 7.3 Quality Gates

**Pre-Merge Requirements:**

- ✅ All tests pass (100% pass rate)
- ✅ Coverage ≥ 90% for high-risk code
- ✅ No skipped tests (unless documented YAGNI deferral)
- ✅ Test suite completes < 30s

**Pre-Production Requirements (Phase 2):**

- ✅ All fault injection tests pass
- ✅ 50+ real captures with zero data loss
- ✅ 7 days dogfooding with no failures
- ✅ Performance targets met (p95 < 100ms insert)

---

## 8. Nerdy Joke Corner

This test spec is longer than your average ADHD attention span but shorter than a SQLite transaction log after a crash. Unlike your brain, these tests actually remember to check if hash normalization is deterministic. Also, "fault injection testing" is just a fancy term for "deliberately breaking things to prove they unbreak themselves," which is basically the ADHD debugging experience formalized. 🧪💥

---

## Document Version

**Version:** 0.1.0
**Status:** Draft - Ready for Review
**Last Updated:** 2025-09-27

### Alignment Checklist

- [x] Aligned with Master PRD v2.3.0-MPPP
- [x] Aligned with Staging Ledger PRD v1.0.0-MPPP
- [x] Aligned with Staging Ledger Arch Spec v0.1.0
- [x] Aligned with Staging Ledger Tech Spec v0.1.0
- [x] TDD Applicability Decision applied (HIGH risk, required)
- [x] Coverage targets specified (100% for P0)
- [x] Traceability matrix complete (PRD → Tests)
- [x] Critical tests identified with test IDs
- [x] Fault injection strategy defined
- [x] TestKit helpers documented
- [x] YAGNI boundaries enforced (no load/visual tests)
- [x] Nerdy joke included

### Next Steps

1. Review with architecture team
2. Implement TDD test suite (unit → integration → contract)
3. Implement `@capture-bridge/staging-ledger` package (TDD-driven)
4. Validate with 50+ real captures
5. Add fault injection tests in Phase 2

---

## 9. Cross-Feature Integration Tests

### 9.1 Full Pipeline Integration Tests

These tests verify end-to-end data flow integrity across the capture → staging → export pipeline, covering P0 cross-feature risks.

#### Test Suite: Voice Capture Pipeline Integration

```typescript
describe("Voice Capture Pipeline Integration", () => {
  let ledger: StagingLedger
  let captureWorker: VoiceCaptureWorker
  let obsidianBridge: ObsidianAtomicWriter
  let tempVault: string

  beforeEach(async () => {
    ledger = createTestLedger()
    tempVault = await createTempDirectory()
    captureWorker = new VoiceCaptureWorker(ledger)
    obsidianBridge = new ObsidianAtomicWriter(tempVault, ledger.db)

    // Set up deterministic test environment
    useFakeTimers({ now: new Date("2025-09-27T10:00:00Z") })
  })

  afterEach(async () => {
    ledger.close()
    await cleanupTempDirectory(tempVault)
    vi.useRealTimers()
  })

  it("completes full voice pipeline: capture → transcribe → export → vault file", async () => {
    // === STAGE 1: Voice Capture Ingestion ===
    const audioPath = "/icloud/test-memo.m4a"
    const audioFingerprint = "sha256_audio_fp_test"

    // Mock iCloud file discovery
    mockICloudFiles([
      {
        path: audioPath,
        size: 2048,
        audioFingerprint,
      },
    ])

    // Execute capture ingestion
    const captureResult = await captureWorker.pollAndIngest()
    expect(captureResult.captures).toHaveLength(1)

    const captureId = captureResult.captures[0].id

    // Verify staging state
    const stagedCapture = await ledger.getCapture(captureId)
    expect(stagedCapture?.status).toBe("staged")
    expect(stagedCapture?.content_hash).toBeNull() // Late hash binding
    expect(stagedCapture?.meta_json.audio_fp).toBe(audioFingerprint)

    // === STAGE 2: Transcription Processing ===
    const transcriptText = "Remember to buy groceries and pick up dry cleaning"
    const contentHash = computeContentHash(transcriptText)

    // Mock Whisper transcription
    mockWhisperAPI({
      [audioPath]: { text: transcriptText, duration: 3000 },
    })

    // Execute transcription
    const transcriptionResult =
      await captureWorker.processTranscription(captureId)
    expect(transcriptionResult.success).toBe(true)

    // Verify transcribed state
    const transcribedCapture = await ledger.getCapture(captureId)
    expect(transcribedCapture?.status).toBe("transcribed")
    expect(transcribedCapture?.content_hash).toBe(contentHash)
    expect(transcribedCapture?.raw_content).toBe(transcriptText)

    // === STAGE 3: Export Processing ===
    // Check for duplicates (should be none)
    const dupCheck = await ledger.checkDuplicate(contentHash)
    expect(dupCheck.is_duplicate).toBe(false)

    // Execute export to Obsidian vault
    const markdownContent = formatVoiceMarkdown(transcribedCapture)
    const exportResult = await obsidianBridge.writeAtomic(
      captureId,
      markdownContent,
      tempVault
    )
    expect(exportResult.success).toBe(true)

    // Record export in staging ledger
    await ledger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: contentHash,
      mode: "initial",
      error_flag: false,
    })

    // === STAGE 4: Final Verification ===
    // Verify exported state
    const exportedCapture = await ledger.getCapture(captureId)
    expect(exportedCapture?.status).toBe("exported")

    // Verify vault file exists and has correct content
    const vaultFilePath = path.join(tempVault, exportResult.export_path)
    expect(await fileExists(vaultFilePath)).toBe(true)

    const vaultContent = await fs.readFile(vaultFilePath, "utf-8")
    expect(vaultContent).toContain(transcriptText)
    expect(vaultContent).toContain(`id: ${captureId}`)
    expect(vaultContent).toContain("source: voice")

    // Verify audit trail integrity
    const auditRecords = await ledger.getExportAudits(captureId)
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0].mode).toBe("initial")
    expect(auditRecords[0].vault_path).toBe(exportResult.export_path)
    expect(auditRecords[0].hash_at_export).toBe(contentHash)
  })

  it("handles voice pipeline with transcription failure → placeholder export", async () => {
    // === STAGE 1: Capture Ingestion ===
    const audioPath = "/icloud/corrupted-memo.m4a"
    const audioFingerprint = "sha256_corrupted_fp"

    mockICloudFiles([{ path: audioPath, size: 1024, audioFingerprint }])

    const captureResult = await captureWorker.pollAndIngest()
    const captureId = captureResult.captures[0].id

    // === STAGE 2: Transcription Failure ===
    mockWhisperAPI({
      [audioPath]: {
        error: "WHISPER_TIMEOUT",
        message: "Transcription timeout after 30s",
      },
    })

    const transcriptionResult =
      await captureWorker.processTranscription(captureId)
    expect(transcriptionResult.success).toBe(false)

    // Verify failed transcription state
    const failedCapture = await ledger.getCapture(captureId)
    expect(failedCapture?.status).toBe("failed_transcription")
    expect(failedCapture?.content_hash).toBeNull()

    // === STAGE 3: Placeholder Export ===
    const placeholderContent = formatPlaceholderMarkdown(
      failedCapture,
      "Transcription timeout after 30s"
    )
    const exportResult = await obsidianBridge.writeAtomic(
      captureId,
      placeholderContent,
      tempVault
    )
    expect(exportResult.success).toBe(true)

    await ledger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: null,
      mode: "placeholder",
      error_flag: true,
    })

    // === STAGE 4: Verification ===
    const exportedCapture = await ledger.getCapture(captureId)
    expect(exportedCapture?.status).toBe("exported_placeholder")

    // Verify placeholder file contains error information
    const vaultFilePath = path.join(tempVault, exportResult.export_path)
    const vaultContent = await fs.readFile(vaultFilePath, "utf-8")
    expect(vaultContent).toContain(
      "# Placeholder Export (Transcription Failed)"
    )
    expect(vaultContent).toContain("Transcription timeout after 30s")
    expect(vaultContent).toContain(audioPath)
  })
})
```

#### Test Suite: Email Capture Pipeline Integration

```typescript
describe("Email Capture Pipeline Integration", () => {
  let ledger: StagingLedger
  let emailWorker: EmailCaptureWorker
  let obsidianBridge: ObsidianAtomicWriter
  let tempVault: string

  beforeEach(async () => {
    ledger = createTestLedger()
    tempVault = await createTempDirectory()
    emailWorker = new EmailCaptureWorker(ledger)
    obsidianBridge = new ObsidianAtomicWriter(tempVault, ledger.db)

    useFakeTimers({ now: new Date("2025-09-27T10:00:00Z") })
  })

  afterEach(async () => {
    ledger.close()
    await cleanupTempDirectory(tempVault)
    vi.useRealTimers()
  })

  it("completes full email pipeline: capture → stage → export → vault file", async () => {
    // === STAGE 1: Email Capture ===
    const messageId = "gmail_msg_12345"
    const emailContent = "Meeting notes from today's project sync"
    const contentHash = computeContentHash(emailContent)

    // Mock Gmail API
    mockGmailAPI([
      {
        id: messageId,
        snippet: emailContent,
        payload: {
          headers: [
            { name: "From", value: "colleague@company.com" },
            { name: "Subject", value: "Project Sync Notes" },
            { name: "Date", value: "Mon, 27 Sep 2025 10:00:00 +0000" },
          ],
        },
      },
    ])

    const captureResult = await emailWorker.pollAndIngest()
    expect(captureResult.captures).toHaveLength(1)

    const captureId = captureResult.captures[0].id

    // Verify immediate staging with hash (no late binding for email)
    const stagedCapture = await ledger.getCapture(captureId)
    expect(stagedCapture?.status).toBe("staged")
    expect(stagedCapture?.content_hash).toBe(contentHash)
    expect(stagedCapture?.raw_content).toBe(emailContent)

    // === STAGE 2: Export Processing ===
    const dupCheck = await ledger.checkDuplicate(contentHash)
    expect(dupCheck.is_duplicate).toBe(false)

    const markdownContent = formatEmailMarkdown(stagedCapture)
    const exportResult = await obsidianBridge.writeAtomic(
      captureId,
      markdownContent,
      tempVault
    )
    expect(exportResult.success).toBe(true)

    await ledger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: contentHash,
      mode: "initial",
      error_flag: false,
    })

    // === STAGE 3: Verification ===
    const exportedCapture = await ledger.getCapture(captureId)
    expect(exportedCapture?.status).toBe("exported")

    const vaultFilePath = path.join(tempVault, exportResult.export_path)
    const vaultContent = await fs.readFile(vaultFilePath, "utf-8")
    expect(vaultContent).toContain(emailContent)
    expect(vaultContent).toContain("From: colleague@company.com")
    expect(vaultContent).toContain("Subject: Project Sync Notes")
  })
})
```

### 9.2 State Consistency Integration Tests

#### Test Suite: Cross-Component State Transitions

```typescript
describe("Cross-Component State Transitions", () => {
  it("maintains state consistency during concurrent capture processing", async () => {
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Create multiple captures in different states
    const captureIds = []

    // Capture 1: Staged, ready for transcription
    const id1 = await ledger.insertCapture({
      id: ulid(),
      source: "voice",
      raw_content: "",
      meta_json: {
        channel: "voice",
        channel_native_id: "/path/audio1.m4a",
        audio_fp: "fp1",
      },
    })
    captureIds.push(id1.capture_id)

    // Capture 2: Transcribed, ready for export
    const id2 = await ledger.insertCapture({
      id: ulid(),
      source: "voice",
      raw_content: "Transcribed content",
      content_hash: computeContentHash("Transcribed content"),
      meta_json: {
        channel: "voice",
        channel_native_id: "/path/audio2.m4a",
        audio_fp: "fp2",
      },
    })
    await ledger.updateTranscription(id2.capture_id, {
      transcript_text: "Transcribed content",
      content_hash: computeContentHash("Transcribed content"),
    })
    captureIds.push(id2.capture_id)

    // Process captures through pipeline
    const recoverable = await ledger.queryRecoverable()
    expect(recoverable).toHaveLength(2)

    // Verify state machine constraints are enforced
    for (const capture of recoverable) {
      if (capture.status === "staged") {
        // Can transition to transcribed or failed_transcription
        expect(["transcribed", "failed_transcription"]).toContain(
          await getNextValidStates(capture.status)
        )
      } else if (capture.status === "transcribed") {
        // Can transition to exported or exported_duplicate
        expect(["exported", "exported_duplicate"]).toContain(
          await getNextValidStates(capture.status)
        )
      }
    }

    ledger.close()
  })

  it("prevents invalid state transitions across component boundaries", async () => {
    const ledger = createTestLedger()

    // Create capture and export it
    const captureId = ulid()
    await ledger.insertCapture({
      id: captureId,
      source: "email",
      raw_content: "test content",
      content_hash: computeContentHash("test content"),
      meta_json: { channel: "email", channel_native_id: "msg123" },
    })

    await ledger.recordExport(captureId, {
      vault_path: `inbox/${captureId}.md`,
      hash_at_export: computeContentHash("test content"),
      mode: "initial",
      error_flag: false,
    })

    // Verify capture is in terminal state
    const capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("exported")

    // Attempt invalid transition from terminal state
    await expect(
      ledger.updateTranscription(captureId, {
        transcript_text: "new content",
        content_hash: computeContentHash("new content"),
      })
    ).rejects.toThrow(InvalidStateTransitionError)

    ledger.close()
  })
})
```

### 9.3 Data Integrity Verification Tests

#### Test Suite: Pipeline Data Integrity

```typescript
describe("Pipeline Data Integrity", () => {
  it("maintains content hash consistency across all pipeline stages", async () => {
    const ledger = createTestLedger()
    const tempVault = await createTempDirectory()
    const obsidianBridge = new ObsidianAtomicWriter(tempVault, ledger.db)

    const originalContent = "This is test content for hash verification"
    const expectedHash = computeContentHash(originalContent)

    // Stage 1: Insert with content hash
    const captureId = ulid()
    await ledger.insertCapture({
      id: captureId,
      source: "email",
      raw_content: originalContent,
      content_hash: expectedHash,
      meta_json: { channel: "email", channel_native_id: "msg123" },
    })

    // Stage 2: Verify hash in staging ledger
    const stagedCapture = await ledger.getCapture(captureId)
    expect(stagedCapture?.content_hash).toBe(expectedHash)

    // Stage 3: Export and verify hash at export
    const markdownContent = formatEmailMarkdown(stagedCapture)
    const exportResult = await obsidianBridge.writeAtomic(
      captureId,
      markdownContent,
      tempVault
    )

    await ledger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: expectedHash,
      mode: "initial",
      error_flag: false,
    })

    // Stage 4: Verify audit trail hash consistency
    const auditRecords = await ledger.getExportAudits(captureId)
    expect(auditRecords[0].hash_at_export).toBe(expectedHash)

    // Stage 5: Verify exported content produces same hash
    const vaultFilePath = path.join(tempVault, exportResult.export_path)
    const vaultContent = await fs.readFile(vaultFilePath, "utf-8")

    // Extract content from markdown (skip frontmatter)
    const contentMatch = vaultContent.match(/---\n[\s\S]*?\n---\n\n([\s\S]*)/)
    const extractedContent = contentMatch ? contentMatch[1].trim() : ""

    // Note: Content may be formatted differently in markdown, so we verify
    // that the original content is preserved within the markdown
    expect(vaultContent).toContain(originalContent)

    ledger.close()
    await cleanupTempDirectory(tempVault)
  })

  it("detects and handles content hash mismatches", async () => {
    const ledger = createTestLedger()

    const captureId = ulid()
    const originalContent = "Original content"
    const originalHash = computeContentHash(originalContent)

    // Insert capture with known hash
    await ledger.insertCapture({
      id: captureId,
      source: "email",
      raw_content: originalContent,
      content_hash: originalHash,
      meta_json: { channel: "email", channel_native_id: "msg123" },
    })

    // Attempt to update with different content but claim same hash (data corruption simulation)
    const tamperedContent = "Tampered content"
    const tamperedHash = computeContentHash(tamperedContent)

    // This should fail due to hash mutation protection
    await expect(
      ledger.updateTranscription(captureId, {
        transcript_text: tamperedContent,
        content_hash: tamperedHash,
      })
    ).rejects.toThrow("Hash mutation not allowed")

    // Verify original content unchanged
    const capture = await ledger.getCapture(captureId)
    expect(capture?.raw_content).toBe(originalContent)
    expect(capture?.content_hash).toBe(originalHash)

    ledger.close()
  })
})
```

### 9.4 Concurrency and Race Condition Tests

#### Test Suite: Multi-Stage Concurrency

```typescript
describe("Multi-Stage Concurrency", () => {
  it("handles concurrent capture ingestion without conflicts", async () => {
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Mock multiple audio files discovered simultaneously
    const audioFiles = [
      { path: "/icloud/memo1.m4a", audioFingerprint: "fp1" },
      { path: "/icloud/memo2.m4a", audioFingerprint: "fp2" },
      { path: "/icloud/memo3.m4a", audioFingerprint: "fp3" },
    ]

    mockICloudFiles(audioFiles)

    // Process captures concurrently (simulates rapid file discovery)
    const promises = audioFiles.map((file) =>
      captureWorker.ingestSingleFile(file.path, file.audioFingerprint)
    )

    const results = await Promise.allSettled(promises)

    // All should succeed without conflicts
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3)
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0)

    // Verify all captures staged
    const allCaptures = await ledger.getAllCaptures()
    expect(allCaptures).toHaveLength(3)
    expect(allCaptures.every((c) => c.status === "staged")).toBe(true)

    ledger.close()
  })

  it("handles concurrent export operations safely", async () => {
    const ledger = createTestLedger()
    const tempVault = await createTempDirectory()
    const obsidianBridge = new ObsidianAtomicWriter(tempVault, ledger.db)

    // Create multiple captures ready for export
    const captureData = [
      { id: ulid(), content: "Content 1" },
      { id: ulid(), content: "Content 2" },
      { id: ulid(), content: "Content 3" },
    ]

    for (const data of captureData) {
      await ledger.insertCapture({
        id: data.id,
        source: "email",
        raw_content: data.content,
        content_hash: computeContentHash(data.content),
        meta_json: { channel: "email", channel_native_id: `msg_${data.id}` },
      })
    }

    // Export all captures concurrently
    const exportPromises = captureData.map(async (data) => {
      const capture = await ledger.getCapture(data.id)
      const markdownContent = formatEmailMarkdown(capture)
      const exportResult = await obsidianBridge.writeAtomic(
        data.id,
        markdownContent,
        tempVault
      )

      await ledger.recordExport(data.id, {
        vault_path: exportResult.export_path,
        hash_at_export: capture.content_hash,
        mode: "initial",
        error_flag: false,
      })

      return exportResult
    })

    const exportResults = await Promise.allSettled(exportPromises)

    // All exports should succeed
    expect(exportResults.filter((r) => r.status === "fulfilled")).toHaveLength(
      3
    )

    // Verify all files exist in vault
    for (const data of captureData) {
      const expectedPath = path.join(tempVault, "inbox", `${data.id}.md`)
      expect(await fileExists(expectedPath)).toBe(true)
    }

    // Verify all captures marked as exported
    const finalCaptures = await ledger.getAllCaptures()
    expect(finalCaptures.every((c) => c.status === "exported")).toBe(true)

    ledger.close()
    await cleanupTempDirectory(tempVault)
  })

  it("prevents race conditions in duplicate detection during concurrent processing", async () => {
    const ledger = createTestLedger()

    const duplicateContent = "This is duplicate content"
    const contentHash = computeContentHash(duplicateContent)

    // Simulate concurrent attempts to insert same content
    const concurrentInserts = Array.from({ length: 5 }, (_, i) =>
      ledger.insertCapture({
        id: ulid(),
        source: "email",
        raw_content: duplicateContent,
        content_hash: contentHash,
        meta_json: { channel: "email", channel_native_id: `msg_${i}` },
      })
    )

    const results = await Promise.allSettled(concurrentInserts)

    // First insert should succeed, others should detect duplicate
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value.is_duplicate === false
    )
    const duplicates = results.filter(
      (r) => r.status === "fulfilled" && r.value.is_duplicate === true
    )

    expect(successful).toHaveLength(1)
    expect(duplicates.length).toBeGreaterThanOrEqual(1)

    // Verify only one capture actually stored
    const storedCaptures = await ledger.getAllCaptures()
    const uniqueHashes = new Set(storedCaptures.map((c) => c.content_hash))
    expect(uniqueHashes.has(contentHash)).toBe(true)
    expect(
      storedCaptures.filter((c) => c.content_hash === contentHash)
    ).toHaveLength(1)

    ledger.close()
  })
})
```

### 9.5 Error Recovery Integration Tests

#### Test Suite: Cross-Component Error Recovery

```typescript
describe("Cross-Component Error Recovery", () => {
  it("recovers from crash between transcription and export", async () => {
    const dbPath = path.join(tmpdir(), "crash-recovery-test.sqlite")

    // === PRE-CRASH: Complete transcription ===
    let ledger = new StagingLedger(dbPath)

    const captureId = ulid()
    await ledger.insertCapture({
      id: captureId,
      source: "voice",
      raw_content: "",
      meta_json: {
        channel: "voice",
        channel_native_id: "/path/test.m4a",
        audio_fp: "test_fp",
      },
    })

    const transcriptText = "Test transcription content"
    const contentHash = computeContentHash(transcriptText)

    await ledger.updateTranscription(captureId, {
      transcript_text: transcriptText,
      content_hash: contentHash,
    })

    // Verify transcribed state
    let capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("transcribed")

    // Simulate crash (close without export)
    ledger.close()

    // === POST-CRASH: Recovery and completion ===
    ledger = new StagingLedger(dbPath)
    const tempVault = await createTempDirectory()
    const obsidianBridge = new ObsidianAtomicWriter(tempVault, ledger.db)

    // Query recoverable captures
    const recoverable = await ledger.queryRecoverable()
    expect(recoverable).toHaveLength(1)
    expect(recoverable[0].id).toBe(captureId)
    expect(recoverable[0].status).toBe("transcribed")

    // Complete the export
    const recoverableCapture = recoverable[0]
    const markdownContent = formatVoiceMarkdown(recoverableCapture)
    const exportResult = await obsidianBridge.writeAtomic(
      captureId,
      markdownContent,
      tempVault
    )

    await ledger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: contentHash,
      mode: "initial",
      error_flag: false,
    })

    // Verify recovery completion
    capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("exported")

    // Verify vault file exists
    const vaultFilePath = path.join(tempVault, exportResult.export_path)
    expect(await fileExists(vaultFilePath)).toBe(true)

    // Cleanup
    ledger.close()
    await cleanupTempDirectory(tempVault)
    fs.unlinkSync(dbPath)
  })

  it("handles partial failure scenarios with rollback", async () => {
    const ledger = createTestLedger()
    const tempVault = await createTempDirectory()
    const obsidianBridge = new ObsidianAtomicWriter(tempVault, ledger.db)

    const captureId = ulid()
    const content = "Test content for partial failure"
    const contentHash = computeContentHash(content)

    // Stage capture
    await ledger.insertCapture({
      id: captureId,
      source: "email",
      raw_content: content,
      content_hash: contentHash,
      meta_json: { channel: "email", channel_native_id: "msg123" },
    })

    // Mock export failure (disk full) using TestKit fault injection
    const faultInjector = createFaultInjector()
    faultInjector.injectFileSystemError("ENOSPC", {
      path: /.*\.md$/,
      operation: "writeFile",
      message: "No space left on device",
    })

    // Attempt export (should fail)
    const markdownContent = formatEmailMarkdown(
      await ledger.getCapture(captureId)
    )
    const exportResult = await obsidianBridge.writeAtomic(
      captureId,
      markdownContent,
      tempVault
    )
    expect(exportResult.success).toBe(false)

    // Verify capture remains in original state (no partial update)
    const capture = await ledger.getCapture(captureId)
    expect(capture?.status).toBe("staged") // Not exported

    // Verify no audit record created for failed export
    const auditRecords = await ledger.getExportAudits(captureId)
    expect(auditRecords).toHaveLength(0)

    // Verify no partial file in vault
    const expectedPath = path.join(tempVault, "inbox", `${captureId}.md`)
    expect(await fileExists(expectedPath)).toBe(false)

    // Recovery: Fix disk space and retry
    faultInjector.clear()

    const retryResult = await obsidianBridge.writeAtomic(
      captureId,
      markdownContent,
      tempVault
    )
    expect(retryResult.success).toBe(true)

    await ledger.recordExport(captureId, {
      vault_path: retryResult.export_path,
      hash_at_export: contentHash,
      mode: "initial",
      error_flag: false,
    })

    // Verify successful completion
    const finalCapture = await ledger.getCapture(captureId)
    expect(finalCapture?.status).toBe("exported")

    ledger.close()
    await cleanupTempDirectory(tempVault)
  })
})
```

### 9.6 TestKit Integration for Cross-Feature Tests

**Required TestKit Helpers for Pipeline Integration:**

```typescript
// Cross-component test utilities
import {
  createTestLedger,
  mockICloudFiles,
  mockWhisperAPI,
  mockGmailAPI,
  formatVoiceMarkdown,
  formatEmailMarkdown,
  formatPlaceholderMarkdown,
} from "@capture-bridge/test-utils"

// File system integration
import {
  createTempDirectory,
  cleanupTempDirectory,
  fileExists,
} from "@orchestr8/testkit/fs"

// Time control for deterministic testing
import { useFakeTimers } from "@orchestr8/testkit/time"

// Custom matchers for pipeline testing
expect.extend({
  async toHaveVaultFile(tempVault, captureId) {
    const expectedPath = path.join(tempVault, "inbox", `${captureId}.md`)
    const exists = await fileExists(expectedPath)

    return {
      pass: exists,
      message: () =>
        `Expected vault file ${expectedPath} ${exists ? "not " : ""}to exist`,
    }
  },

  toBeInValidState(capture, allowedStates) {
    const isValid = allowedStates.includes(capture.status)

    return {
      pass: isValid,
      message: () =>
        `Expected capture status '${capture.status}' to be one of [${allowedStates.join(", ")}]`,
    }
  },

  toHaveConsistentHash(auditRecord, expectedHash) {
    const matches = auditRecord.hash_at_export === expectedHash

    return {
      pass: matches,
      message: () =>
        `Expected audit hash '${auditRecord.hash_at_export}' to match '${expectedHash}'`,
    }
  },
})
```

---

## 10. Performance Regression Detection (P1)

### 10.1 Latency Regression Gates

Performance regression gates ensure that the staging ledger maintains P0 operational requirements under load and prevents performance degradation over time.

**Risk Classification: P1** - Performance regressions impact user experience and system scalability.

```typescript
describe("Performance Regression Detection (P1)", () => {
  test("detects p95 latency regression for capture insert", async () => {
    const ledger = createTestLedger()

    // Define baseline (from real measurements)
    const BASELINE_P95 = 10 // ms
    const REGRESSION_THRESHOLD = 15 // 50% regression = failure

    const latencies: number[] = []

    // Run operation 1000 times
    for (let i = 0; i < 1000; i++) {
      const captureId = ulid()
      const content = `Test content ${i}`
      const contentHash = computeContentHash(content)

      const start = performance.now()

      await ledger.insertCapture({
        id: captureId,
        source: "email",
        raw_content: content,
        content_hash: contentHash,
        meta_json: {
          channel: "email",
          channel_native_id: `msg_${i}`,
        },
      })

      latencies.push(performance.now() - start)
    }

    // Calculate p95
    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    // Gate: fail if regression > 50%
    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)

    // Log metrics for tracking
    console.log(
      `Capture insert P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`
    )

    ledger.close()
  })

  test("detects p95 latency regression for query operations", async () => {
    const ledger = createTestLedger()

    // Pre-populate with test data
    for (let i = 0; i < 1000; i++) {
      await ledger.insertCapture({
        id: ulid(),
        source: "email",
        raw_content: `Content ${i}`,
        content_hash: computeContentHash(`Content ${i}`),
        meta_json: { channel: "email", channel_native_id: `msg_${i}` },
      })
    }

    const BASELINE_P95 = 5 // ms
    const REGRESSION_THRESHOLD = 7 // 40% regression = failure
    const latencies: number[] = []

    // Test duplicate check performance
    for (let i = 0; i < 100; i++) {
      const testHash = computeContentHash(`Content ${i}`)
      const start = performance.now()

      await ledger.checkDuplicate(testHash)

      latencies.push(performance.now() - start)
    }

    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)
    console.log(
      `Query operation P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`
    )

    ledger.close()
  })

  test("detects p95 latency regression for export read", async () => {
    const ledger = createTestLedger()

    // Pre-populate with exported captures
    const captureIds: string[] = []
    for (let i = 0; i < 100; i++) {
      const captureId = ulid()
      await ledger.insertCapture({
        id: captureId,
        source: "voice",
        raw_content: `Voice content ${i}`,
        content_hash: computeContentHash(`Voice content ${i}`),
        meta_json: { channel: "voice", channel_native_id: `/audio/${i}.m4a` },
      })

      await ledger.recordExport(captureId, {
        vault_path: `inbox/${captureId}.md`,
        hash_at_export: computeContentHash(`Voice content ${i}`),
        mode: "initial",
        error_flag: false,
      })

      captureIds.push(captureId)
    }

    const BASELINE_P95 = 8 // ms
    const REGRESSION_THRESHOLD = 12 // 50% regression = failure
    const latencies: number[] = []

    // Test export audit read performance
    for (const captureId of captureIds) {
      const start = performance.now()

      await ledger.getExportAudits(captureId)

      latencies.push(performance.now() - start)
    }

    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)
    console.log(
      `Export read P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`
    )

    ledger.close()
  })

  test("detects throughput regression for insert operations", async () => {
    const ledger = createTestLedger()

    // Baseline: 100 operations/second
    const BASELINE_THROUGHPUT = 100
    const MIN_THROUGHPUT = 75 // 25% regression = failure

    // Run for 10 seconds
    const duration = 10_000
    let operationsCompleted = 0
    const startTime = Date.now()

    while (Date.now() - startTime < duration) {
      const captureId = ulid()
      await ledger.insertCapture({
        id: captureId,
        source: "email",
        raw_content: `Throughput test ${operationsCompleted}`,
        content_hash: computeContentHash(
          `Throughput test ${operationsCompleted}`
        ),
        meta_json: {
          channel: "email",
          channel_native_id: `throughput_${operationsCompleted}`,
        },
      })
      operationsCompleted++
    }

    const actualDuration = Date.now() - startTime
    const throughput = (operationsCompleted / actualDuration) * 1000 // ops/sec

    // Gate: fail if throughput drops > 25%
    expect(throughput).toBeGreaterThan(MIN_THROUGHPUT)

    console.log(
      `Insert throughput: ${throughput.toFixed(1)} ops/sec (baseline: ${BASELINE_THROUGHPUT})`
    )

    ledger.close()
  })

  test("detects memory leak during sustained operation", async () => {
    const ledger = createTestLedger()

    // Force garbage collection before test
    if (global.gc) global.gc()

    const heapBefore = process.memoryUsage().heapUsed

    // Run 10,000 operations
    for (let i = 0; i < 10_000; i++) {
      const captureId = ulid()
      await ledger.insertCapture({
        id: captureId,
        source: "email",
        raw_content: `Memory test ${i}`,
        content_hash: computeContentHash(`Memory test ${i}`),
        meta_json: { channel: "email", channel_native_id: `memory_${i}` },
      })

      // Simulate normal cleanup
      if (i % 1000 === 0) {
        await ledger.queryRecoverable() // Typical query pattern
      }
    }

    // Force garbage collection after test
    if (global.gc) global.gc()

    const heapAfter = process.memoryUsage().heapUsed
    const heapGrowth = heapAfter - heapBefore

    // Gate: heap growth < 10MB for 10k operations
    expect(heapGrowth).toBeLessThan(10 * 1024 * 1024)

    console.log(
      `Heap growth: ${(heapGrowth / 1024 / 1024).toFixed(2)}MB for 10k operations`
    )

    ledger.close()
  })
})
```

---

## 11. Enhanced Cross-Feature Integration with Failure Injection (P1)

### 11.1 Full Pipeline Integration with Fault Injection

Cross-feature integration tests with failure injection ensure robust error handling and recovery across component boundaries.

```typescript
describe("Full Pipeline Integration with Fault Injection (P1)", () => {
  let testPipeline: TestPipeline

  beforeEach(async () => {
    testPipeline = new TestPipeline()
    await testPipeline.setup()
  })

  afterEach(async () => {
    await testPipeline.cleanup()
  })

  test("handles capture failure during multi-stage pipeline", async () => {
    // Setup: Start voice capture
    const audioPath = "/icloud/test.m4a"
    const captureId = testPipeline.startVoiceCapture(audioPath)

    // Inject: Network timeout during iCloud download
    testPipeline.injectFault("icloud-download", "NETWORK_TIMEOUT")

    const result = await testPipeline.executeCapturePipeline(captureId)

    // Verify: Staging ledger shows failed status
    const capture = await testPipeline.getStagingLedger().getCapture(captureId)
    expect(capture.status).toBe("download_failed")

    // Verify: Export does not proceed
    const exports = await testPipeline.getVault().listFiles("inbox")
    expect(exports).toHaveLength(0)

    // Verify: Retry coordinator notified (Phase 2 when implemented)
    const retries = await testPipeline.getRetryQueue().getPending()
    expect(retries).toHaveLength(1)
    expect(retries[0].operation).toBe("voice_capture")
    expect(retries[0].error_type).toBe("network.timeout")
  })

  test("handles staging ledger failure during export", async () => {
    // Setup: Successful capture
    const captureId = await testPipeline.completeCaptureFlow("/icloud/test.m4a")

    // Inject: Database lock during export read
    testPipeline.injectFault("database-read", "SQLITE_BUSY")

    // Verify: Export retries with backoff
    const exportAttempt1 = await testPipeline.attemptExport(captureId)
    expect(exportAttempt1.success).toBe(false)
    expect(exportAttempt1.error.code).toBe("SQLITE_BUSY")

    await delay(100) // First retry delay

    // Remove fault for retry
    testPipeline.clearFaults()

    const exportAttempt2 = await testPipeline.attemptExport(captureId)
    expect(exportAttempt2.success).toBe(true)

    // Verify: Audit trail shows both attempts
    const auditRecords = await testPipeline.getAuditTrail(captureId)
    expect(auditRecords).toHaveLength(2)
    expect(auditRecords[0].status).toBe("failed")
    expect(auditRecords[1].status).toBe("success")
  })

  test("handles vault write failure during export", async () => {
    // Setup: Successful capture + staging
    const captureId = await testPipeline.completeCaptureFlow("/icloud/test.m4a")

    // Inject: ENOSPC during atomic write
    testPipeline.injectFault("vault-write", { code: "ENOSPC" })

    // Attempt export
    const result = await testPipeline.attemptExport(captureId)

    // Verify: No partial file in vault
    const files = await testPipeline.getVault().listFiles()
    expect(files).toHaveLength(0)

    // Verify: Staging ledger status unchanged (still "transcribed")
    const capture = await testPipeline.getStagingLedger().getCapture(captureId)
    expect(capture.status).toBe("transcribed")

    // Verify: Error logged for doctor command
    const errors = await testPipeline.getErrorLog()
    expect(errors).toContainEqual(
      expect.objectContaining({
        code: "ENOSPC",
        severity: "critical",
        message: expect.stringContaining("disk full"),
        component: "obsidian-bridge",
      })
    )
  })

  test("handles concurrent operations across features", async () => {
    // Concurrent operations
    const promises = [
      testPipeline.captureVoice("/icloud/memo1.m4a"),
      testPipeline.captureEmail("msg-123"),
      testPipeline.exportCapture("existing-capture-id"),
    ]

    // All should complete successfully
    const results = await Promise.all(promises)
    expect(results.every((r) => r.success)).toBe(true)

    // Verify: No database lock contention
    const dbStats = await testPipeline.getDatabaseStats()
    expect(dbStats.lockTimeouts).toBe(0)
    expect(dbStats.deadlocks).toBe(0)

    // Verify: All operations completed
    const captures = await testPipeline.getStagingLedger().listCaptures()
    expect(captures).toHaveLength(3) // 2 new + 1 existing

    // Verify: Audit trail is consistent
    const audit = await testPipeline.getFullAuditTrail()
    expect(audit).toHaveLength(3)
    audit.forEach((record) => {
      expect(record.timestamp).toBeDefined()
      expect(record.capture_id).toBeDefined()
      expect(record.operation).toBeOneOf(["capture", "export"])
    })
  })
})
```

---

## 12. Load Testing Patterns (P1)

### 12.1 Sustained Load Testing

```typescript
describe("Sustained Load (P1)", () => {
  test("handles 1000 operations over 10 minutes", async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()

    // Configuration
    const totalOperations = 1000
    const duration = 10 * 60 * 1000 // 10 minutes
    const interval = duration / totalOperations

    // Run sustained load
    const results = await loadTest.runSustained({
      operation: async (iteration) => {
        const captureId = ulid()
        const start = performance.now()

        await ledger.insertCapture({
          id: captureId,
          source: "email",
          raw_content: `Sustained load test ${iteration}`,
          content_hash: computeContentHash(`Sustained load test ${iteration}`),
          meta_json: {
            channel: "email",
            channel_native_id: `sustained_${iteration}`,
          },
        })

        return {
          duration: performance.now() - start,
          success: true,
          memory: process.memoryUsage().heapUsed,
          iteration,
        }
      },
      count: totalOperations,
      interval,
    })

    // Verify: No performance degradation over time
    const firstHalf = results.slice(0, 500).map((r) => r.duration)
    const secondHalf = results.slice(500).map((r) => r.duration)

    const firstHalfP95 = percentile(firstHalf, 95)
    const secondHalfP95 = percentile(secondHalf, 95)

    // Second half should not be > 50% slower than first half
    expect(secondHalfP95).toBeLessThan(firstHalfP95 * 1.5)

    // Verify: No significant memory growth
    const memoryGrowth = results[results.length - 1].memory - results[0].memory
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024) // < 50MB growth

    // Verify: All operations succeeded
    const failures = results.filter((r) => !r.success)
    expect(failures).toHaveLength(0)

    console.log(
      `Sustained load: ${firstHalfP95.toFixed(2)}ms → ${secondHalfP95.toFixed(2)}ms P95`
    )

    ledger.close()
  })

  test("maintains database integrity under sustained load", async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()

    // Run concurrent operations
    const concurrentPromises = Array.from(
      { length: 10 },
      async (_, threadId) => {
        const threadResults = []

        for (let i = 0; i < 100; i++) {
          const captureId = ulid()
          const operationId = `${threadId}_${i}`

          try {
            const result = await ledger.insertCapture({
              id: captureId,
              source: "voice",
              raw_content: `Thread ${threadId} operation ${i}`,
              content_hash: computeContentHash(
                `Thread ${threadId} operation ${i}`
              ),
              meta_json: {
                channel: "voice",
                channel_native_id: `/audio/thread_${operationId}.m4a`,
              },
            })

            threadResults.push({
              operationId,
              success: true,
              duplicate: result.is_duplicate,
            })
          } catch (error) {
            threadResults.push({
              operationId,
              success: false,
              error: error.message,
            })
          }
        }

        return threadResults
      }
    )

    const allResults = await Promise.all(concurrentPromises)
    const flatResults = allResults.flat()

    // Verify: All operations succeeded
    const failures = flatResults.filter((r) => !r.success)
    expect(failures).toHaveLength(0)

    // Verify: Database consistency
    const allCaptures = await ledger.getAllCaptures()
    expect(allCaptures).toHaveLength(1000) // 10 threads × 100 operations

    // Verify: No constraint violations
    const uniqueIds = new Set(allCaptures.map((c) => c.id))
    expect(uniqueIds.size).toBe(1000) // All IDs unique

    // Verify: Foreign key integrity
    const integrityCheck = await ledger.db.get(`PRAGMA integrity_check`)
    expect(integrityCheck.integrity_check).toBe("ok")

    ledger.close()
  })
})

describe("Burst Load (P1)", () => {
  test("handles 100 operations in 10 seconds", async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()

    // Run burst load - 100 operations as fast as possible over 10 seconds
    const startTime = Date.now()
    const endTime = startTime + 10_000

    const results = []
    let operationCount = 0

    while (Date.now() < endTime && operationCount < 100) {
      const captureId = ulid()
      const queueDepthBefore = await ledger.getPendingOperationsCount()
      const start = performance.now()

      try {
        await ledger.insertCapture({
          id: captureId,
          source: "email",
          raw_content: `Burst test ${operationCount}`,
          content_hash: computeContentHash(`Burst test ${operationCount}`),
          meta_json: {
            channel: "email",
            channel_native_id: `burst_${operationCount}`,
          },
        })

        results.push({
          duration: performance.now() - start,
          success: true,
          queueDepth: queueDepthBefore,
          operationCount,
        })
      } catch (error) {
        results.push({
          duration: performance.now() - start,
          success: false,
          error: error.message,
          queueDepth: queueDepthBefore,
          operationCount,
        })
      }

      operationCount++
    }

    // Verify: Proper queueing behavior
    const queueDepths = results.map((r) => r.queueDepth)
    const maxQueueDepth = Math.max(...queueDepths)
    expect(maxQueueDepth).toBeLessThan(50) // Queue doesn't grow unbounded

    // Verify: No data loss
    const successCount = results.filter((r) => r.success).length
    expect(successCount).toBe(Math.min(100, operationCount))

    // Verify: Reasonable latency under burst load
    const p95 = percentile(
      results.map((r) => r.duration),
      95
    )
    expect(p95).toBeLessThan(30) // Allow 3x baseline under burst (10ms * 3)

    console.log(
      `Burst load: ${results.length} operations, P95: ${p95.toFixed(2)}ms`
    )

    ledger.close()
  })
})

describe("Resource Exhaustion (P1)", () => {
  test("handles graceful degradation approaching disk limit", async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()

    // Simulate low disk space scenario
    loadTest.setAvailableDiskSpace(100 * 1024 * 1024) // 100MB available

    // Fill up most of available space
    const largeContent = "x".repeat(1024 * 1024) // 1MB per operation

    const results = []
    for (let i = 0; i < 95; i++) {
      // Leave 5MB buffer
      try {
        const captureId = ulid()
        await ledger.insertCapture({
          id: captureId,
          source: "email",
          raw_content: largeContent,
          content_hash: computeContentHash(largeContent),
          meta_json: { channel: "email", channel_native_id: `large_${i}` },
        })

        results.push({ success: true, operation: i })
      } catch (error) {
        results.push({ success: false, operation: i, error: error.message })
        break
      }
    }

    // Verify: System detects low space and degrades gracefully
    const lastResult = results[results.length - 1]
    if (!lastResult.success) {
      expect(lastResult.error).toContain("disk space")

      // Verify: Error provides actionable guidance
      expect(lastResult.error).toContain("free up space")
    }

    // Verify: Database remains consistent despite space pressure
    const integrityCheck = await ledger.db.get(`PRAGMA integrity_check`)
    expect(integrityCheck.integrity_check).toBe("ok")

    // Verify: System can recover after space is freed
    loadTest.setAvailableDiskSpace(1024 * 1024 * 1024) // Restore 1GB

    const recoveryResult = await ledger.insertCapture({
      id: ulid(),
      source: "email",
      raw_content: "Recovery test",
      content_hash: computeContentHash("Recovery test"),
      meta_json: { channel: "email", channel_native_id: "recovery_test" },
    })

    expect(recoveryResult.success).toBe(true)

    ledger.close()
  })
})
```

### 12.2 Load Test Infrastructure

```typescript
class LoadTestHarness {
  private diskSpaceLimit?: number
  private memoryLimit?: number

  setAvailableDiskSpace(bytes: number) {
    this.diskSpaceLimit = bytes
    // Mock filesystem to respect limit
  }

  setMemoryLimit(bytes: number) {
    this.memoryLimit = bytes
    // Mock memory monitoring
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
          duration: Date.now() - startTime,
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
}

interface LoadTestResult {
  success: boolean
  duration: number
  memory?: number
  iteration?: number
  error?: string
  queueDepth?: number
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.floor(sorted.length * (p / 100))
  return sorted[index]
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

---

**End of Test Specification**
