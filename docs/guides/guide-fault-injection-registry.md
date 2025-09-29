---
title: Fault Injection Hook Registry Guide
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Fault Injection Hook Registry Guide

## Purpose

This guide provides an **authoritative registry** of all fault injection hooks used for systematic crash testing in the ADHD Brain capture pipeline. It catalogs hook IDs, crash scenarios, code locations, expected error types, recovery behaviors, and test coverage to ensure comprehensive resilience validation.

**Target Audience:** Developers implementing crash matrix tests, debugging recovery behavior, or adding new fault injection points.

**Activation Timeline:** Phase 2 Hardening (Weeks 5-6) - referenced during test authoring

## When to Use This Guide

Use this guide when:

- **Writing crash matrix tests** - Reference hook IDs and expected behaviors
- **Implementing new capture channels** - Add fault injection hooks for new error scenarios
- **Debugging recovery behavior** - Map crash points to code locations
- **Validating test coverage** - Ensure all hooks exercised by tests
- **Documenting error scenarios** - Catalog new failure modes
- **Reviewing resilience posture** - Audit crash scenario completeness

**Related Features:**

- [Crash Matrix Test Plan Guide](./guide-crash-matrix-test-plan.md) - Systematic crash testing procedures
- [Error Recovery Guide](./guide-error-recovery.md) - Error taxonomy and retry orchestration
- [Capture PRD](../features/capture/prd-capture.md) - Capture pipeline architecture
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Durability and state machine

## Prerequisites

**Required Knowledge:**

- Understanding of MPPP (Multi-Pass Processing Pipeline) execution model
- Familiarity with fault injection testing principles
- Knowledge of staging ledger state machine transitions
- Basic TypeScript/JavaScript async/await patterns

**Required Setup:**

- ADHD Brain development environment with test framework
- Access to capture pipeline codebase
- Understanding of crash matrix test plan (see related guide)

**Related Documentation:**

- [Master PRD Section 10.3](../master/prd-master.md) - Crash Recovery Requirements
- [Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md) - State transition logic
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Test coverage requirements

## Quick Reference

### Hook Naming Convention

**Format:** `HOOK-{COMPONENT}-{SCENARIO}-{NUMBER}`

**Components:**

- `VOICE` - Voice capture polling, transcription, export
- `EMAIL` - Email capture auth, polling, export
- `LEDGER` - Staging ledger writes, dedup, audit
- `EXPORT` - Vault export (atomic writes, collision handling)

**Scenario Examples:**

- `POLL` - Polling worker crash
- `AUTH` - Authentication/credential failure
- `TRANS` - Transcription processing
- `WRITE` - Database or file write operation
- `DEDUP` - Deduplication logic
- `RENAME` - Atomic rename operation

**Example Hook IDs:**

- `HOOK-VOICE-POLL-001` - Voice polling encounters APFS dataless file
- `HOOK-EMAIL-AUTH-002` - Gmail OAuth2 token refresh failure
- `HOOK-EXPORT-WRITE-003` - Atomic write permission denied

### Hook Metadata Template

````markdown
#### HOOK-{COMPONENT}-{SCENARIO}-{NUMBER}: {Description}

**Component:** {Voice Capture | Email Capture | Staging Ledger | Export}
**Scenario:** {Brief description of crash point}
**Code Location:** `{package}/{file}:{line-number}`
**Expected Error:** `{ERROR_TYPE}` (from error taxonomy)
**Recovery Behavior:** {Retry | Halt | Skip | DLQ}
**State Before Crash:** {SQLite commit state, filesystem state}
**State After Crash:** {Expected state on recovery}
**Test Coverage:**

- `{test-file}::{test-case-name}`
- `crash-matrix.test.ts::HOOK-{ID}`

**Crash Trigger:**

```typescript
// Example fault injection code
if (
  process.env.CAPTURE_FAULT_INJECTION === "1" &&
  process.env.CAPTURE_FAULT_POINT === "hook-id"
) {
  throw new Error("FAULT_INJECTION")
}
```
````

**Validation Assertions:**

- Vault file count == 1 (idempotency)
- Audit row count == 1
- Status terminal (`exported`)
- Temp files cleaned up

````

## Hook Registry

### Voice Capture Hooks

#### HOOK-VOICE-POLL-001: APFS Dataless File Detected

**Component:** Voice Capture (Polling Worker)

**Scenario:** Polling encounters iCloud placeholder file (APFS dataless) that requires download

**Code Location:** `packages/capture/src/voice/poller.ts:145` *(placeholder - TBD during implementation)*

**Expected Error:** `FILE_DATALESS` (transient, retriable)

**Recovery Behavior:** Retry with exponential backoff (60s, 120s, 240s). Download triggered automatically by macOS on subsequent access.

**State Before Crash:**
- Voice memo file detected in poll directory
- File marked as dataless by APFS (iCloud placeholder)
- No staging ledger row created yet

**State After Crash:**
- Next poll cycle detects same file
- Idempotency check via audio fingerprint (first 4MB when available)
- Single ledger row created after successful download

**Test Coverage:**
- `voice-poll.test.ts::handles APFS dataless files with retry`
- `crash-matrix.test.ts::HOOK-VOICE-POLL-001`

**Crash Trigger:**

```typescript
// In voice polling worker
const fileInfo = await icloudctl.checkFileStatus(voiceFile);
if (fileInfo.isDataless && process.env.CAPTURE_FAULT_INJECTION === '1') {
  if (process.env.CAPTURE_FAULT_POINT === 'HOOK-VOICE-POLL-001') {
    process.exit(137); // Simulate crash before download retry
  }
}
````

**Validation Assertions:**

- After recovery: File downloaded successfully
- Capture inserted with `status='staged'`
- Audio fingerprint unique (no duplicate capture)
- Poll cursor advances (file not reprocessed infinitely)

---

#### HOOK-VOICE-TRANS-002: Whisper Transcription Timeout

**Component:** Voice Capture (Transcription Worker)

**Scenario:** Whisper transcription exceeds 5-minute timeout (long audio file)

**Code Location:** `packages/capture/src/voice/transcriber.ts:89` _(placeholder)_

**Expected Error:** `TRANSCRIPTION_TIMEOUT` (transient with single retry)

**Recovery Behavior:** Single retry with same timeout. On second failure, export placeholder `[TRANSCRIPTION_FAILED]` and mark `status='exported_placeholder'`.

**State Before Crash:**

- Capture inserted with `status='staged'`
- Transcription job started (Whisper process spawned)
- Timeout watchdog active (5 minutes)

**State After Crash:**

- Capture row remains `status='staged'` (transcription not committed)
- Next worker poll detects pending transcription
- Retry once, then fallback to placeholder export

**Test Coverage:**

- `voice-transcription.test.ts::handles timeout with retry and placeholder`
- `crash-matrix.test.ts::HOOK-VOICE-TRANS-002`

**Crash Trigger:**

```typescript
// In transcription worker
const transcriptPromise = whisper.transcribe(audioPath)
const timeoutPromise = sleep(5 * 60 * 1000) // 5 minutes

const result = await Promise.race([transcriptPromise, timeoutPromise])
if (result === "TIMEOUT" && process.env.CAPTURE_FAULT_INJECTION === "1") {
  if (process.env.CAPTURE_FAULT_POINT === "HOOK-VOICE-TRANS-002") {
    process.exit(137) // Crash before retry logic
  }
}
```

**Validation Assertions:**

- After recovery: Retry attempt logged
- On second timeout: Placeholder exported
- Capture status: `exported_placeholder`
- Vault file contains: `[TRANSCRIPTION_FAILED]`
- No orphaned Whisper processes

---

#### HOOK-VOICE-EXPORT-003: Vault Write Permission Denied

**Component:** Voice Capture (Export to Vault)

**Scenario:** Atomic write to vault fails due to EACCES (permission denied)

**Code Location:** `packages/export/src/atomic-writer.ts:67` _(placeholder)_

**Expected Error:** `EXPORT_PERMISSION_DENIED` (permanent error)

**Recovery Behavior:** Move to DLQ (Dead Letter Queue), no retry. Capture remains `status='transcribed'`, can be manually exported after fixing permissions.

**State Before Crash:**

- Capture row: `status='transcribed'`, content_hash populated
- Temp file written: `.tmp-{ulid}.md` in vault inbox
- Atomic rename not yet executed

**State After Crash:**

- Temp file present (cleanup on next worker poll)
- Capture row: `status='transcribed'` (unchanged)
- Error logged to `errors_log` table
- No audit row created (export failed)

**Test Coverage:**

- `export-atomic-writer.test.ts::handles permission denied as permanent error`
- `crash-matrix.test.ts::HOOK-VOICE-EXPORT-003`

**Crash Trigger:**

```typescript
// In atomic writer
try {
  await fs.rename(tempPath, finalPath)
} catch (error) {
  if (error.code === "EACCES" && process.env.CAPTURE_FAULT_INJECTION === "1") {
    if (process.env.CAPTURE_FAULT_POINT === "HOOK-VOICE-EXPORT-003") {
      process.exit(137) // Crash before DLQ handling
    }
  }
}
```

**Validation Assertions:**

- After recovery: Capture in DLQ (manual intervention required)
- Error logged: `EXPORT_PERMISSION_DENIED`
- Temp file cleaned up on next poll
- No duplicate export attempts

---

### Email Capture Hooks

#### HOOK-EMAIL-AUTH-001: OAuth2 Token Expired

**Component:** Email Capture (Gmail OAuth2 Authentication)

**Scenario:** OAuth2 access token expired, refresh token invalid/revoked

**Code Location:** `packages/capture/src/email/gmail-auth.ts:123` _(placeholder)_

**Expected Error:** `AUTH_TOKEN_EXPIRED` (retriable with refresh, permanent if refresh fails)

**Recovery Behavior:** Attempt token refresh once. If refresh fails (401 or 403), halt email polling and alert user to re-authenticate via `adhd auth gmail`.

**State Before Crash:**

- Gmail API call fails with 401 Unauthorized
- Refresh token exists in credentials store
- No captures affected yet (pre-fetch stage)

**State After Crash:**

- Next poll detects auth failure
- Attempts token refresh via OAuth2 flow
- If successful: Resume polling
- If failed: Halt email worker, alert via `adhd doctor`

**Test Coverage:**

- `email-auth.test.ts::handles token expiration with refresh`
- `email-auth.test.ts::handles refresh failure as permanent`
- `crash-matrix.test.ts::HOOK-EMAIL-AUTH-001`

**Crash Trigger:**

```typescript
// In Gmail auth handler
try {
  await gmail.users.messages.list({ userId: "me" })
} catch (error) {
  if (error.status === 401 && process.env.CAPTURE_FAULT_INJECTION === "1") {
    if (process.env.CAPTURE_FAULT_POINT === "HOOK-EMAIL-AUTH-001") {
      process.exit(137) // Crash before token refresh
    }
  }
}
```

**Validation Assertions:**

- After recovery: Token refresh attempted
- If refresh success: Polling resumes
- If refresh fail: Worker halted, `adhd doctor` shows `AUTH_REQUIRED`
- No duplicate API calls during retry

---

#### HOOK-EMAIL-POLL-002: Gmail API Rate Limit

**Component:** Email Capture (Polling Worker)

**Scenario:** Gmail API returns 429 Too Many Requests (rate limit exceeded)

**Code Location:** `packages/capture/src/email/gmail-poller.ts:78` _(placeholder)_

**Expected Error:** `API_RATE_LIMIT` (transient, retriable with backoff)

**Recovery Behavior:** Exponential backoff with jitter (60s, 120s, 240s, 480s). Circuit breaker opens after 3 consecutive failures (pauses polling for 15 minutes).

**State Before Crash:**

- Gmail API list request sent
- Rate limit quota exhausted (429 response)
- No captures affected yet

**State After Crash:**

- Next poll waits for backoff period
- Circuit breaker tracks consecutive failures
- After 3 failures: Circuit opens, polling paused 15 minutes
- After cooldown: Half-open state (single test request)

**Test Coverage:**

- `email-poll.test.ts::handles rate limit with exponential backoff`
- `email-poll.test.ts::circuit breaker opens after 3 failures`
- `crash-matrix.test.ts::HOOK-EMAIL-POLL-002`

**Crash Trigger:**

```typescript
// In Gmail polling worker
try {
  const response = await gmail.users.messages.list({ userId: "me" })
} catch (error) {
  if (error.status === 429 && process.env.CAPTURE_FAULT_INJECTION === "1") {
    if (process.env.CAPTURE_FAULT_POINT === "HOOK-EMAIL-POLL-002") {
      process.exit(137) // Crash before backoff sleep
    }
  }
}
```

**Validation Assertions:**

- After recovery: Backoff sleep applied
- Circuit breaker state correct (closed → open after 3 failures)
- No thundering herd on recovery (jitter applied)
- Polling resumes after cooldown

---

#### HOOK-EMAIL-EXPORT-003: Duplicate Email Detected

**Component:** Email Capture (Deduplication Layer)

**Scenario:** Email with same Message-ID already processed (duplicate poll)

**Code Location:** `packages/capture/src/email/email-processor.ts:134` _(placeholder)_

**Expected Error:** Not an error - expected idempotency behavior

**Recovery Behavior:** Skip export, update metadata only. Mark as `exported_duplicate` in captures table. No vault write.

**State Before Crash:**

- Email fetched from Gmail API
- Message-ID checked against `captures.meta_json->>'message_id'`
- Duplicate detected (row exists)

**State After Crash:**

- Next poll re-fetches same message (cursor unchanged)
- Duplicate check repeats
- Skip export, increment dedup counter

**Test Coverage:**

- `email-dedup.test.ts::handles duplicate message-id as skip`
- `crash-matrix.test.ts::HOOK-EMAIL-EXPORT-003`

**Crash Trigger:**

```typescript
// In email deduplication layer
const existingCapture = await ledger.checkDuplicate({
  message_id: email.id,
  content_hash: emailHash,
})

if (existingCapture && process.env.CAPTURE_FAULT_INJECTION === "1") {
  if (process.env.CAPTURE_FAULT_POINT === "HOOK-EMAIL-EXPORT-003") {
    process.exit(137) // Crash before updating metadata
  }
}
```

**Validation Assertions:**

- After recovery: Duplicate detected again
- No second vault file created
- Metadata updated (e.g., last_seen_at)
- Poll cursor advances (email marked processed)

---

### Staging Ledger Hooks

#### HOOK-LEDGER-WRITE-001: Unique Constraint Violation (ULID Collision)

**Component:** Staging Ledger (Capture Insert)

**Scenario:** ULID collision on `captures.id` (astronomically rare, but handled)

**Code Location:** `packages/staging-ledger/src/ledger.ts:89` _(placeholder)_

**Expected Error:** `SQLITE_CONSTRAINT` (UNIQUE constraint failed: captures.id)

**Recovery Behavior:** Regenerate ULID and retry insert once. If second failure, DLQ (likely database corruption).

**State Before Crash:**

- ULID generated for new capture
- Insert attempted: `INSERT INTO captures (...) VALUES (?)`
- Unique constraint violation detected

**State After Crash:**

- Next worker poll detects missing capture (not committed)
- Regenerate ULID (timestamp component advances)
- Retry insert with new ULID

**Test Coverage:**

- `staging-ledger.test.ts::handles ULID collision with retry`
- `crash-matrix.test.ts::HOOK-LEDGER-WRITE-001`

**Crash Trigger:**

```typescript
// In staging ledger insert
try {
  await db.run('INSERT INTO captures (id, ...) VALUES (?, ...)', [ulid, ...]);
} catch (error) {
  if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('captures.id')) {
    if (process.env.CAPTURE_FAULT_INJECTION === '1') {
      if (process.env.CAPTURE_FAULT_POINT === 'HOOK-LEDGER-WRITE-001') {
        process.exit(137); // Crash before ULID regeneration
      }
    }
  }
}
```

**Validation Assertions:**

- After recovery: New ULID generated
- Insert succeeds with different ULID
- No data loss (content preserved)
- Original capture not duplicated

---

#### HOOK-LEDGER-DEDUP-002: Hash Collision (SHA-256)

**Component:** Staging Ledger (Deduplication Layer)

**Scenario:** SHA-256 hash collision on `captures.content_hash` (theoretical, cryptographically unlikely)

**Code Location:** `packages/staging-ledger/src/dedup.ts:67` _(placeholder)_

**Expected Error:** Not an error - deduplication working as designed

**Recovery Behavior:** Treat as duplicate (skip export). Log collision for audit trail. In production, manual review if suspected false positive.

**State Before Crash:**

- Content hash computed: SHA-256 of normalized text
- Hash lookup: `SELECT id FROM captures WHERE content_hash = ?`
- Match found (collision)

**State After Crash:**

- Next poll re-processes same content
- Hash collision detected again
- Skip export consistently (idempotent)

**Test Coverage:**

- `dedup.test.ts::handles hash collision as duplicate`
- `crash-matrix.test.ts::HOOK-LEDGER-DEDUP-002`

**Crash Trigger:**

```typescript
// In deduplication layer
const existingCapture = await db.get(
  "SELECT id FROM captures WHERE content_hash = ?",
  [contentHash]
)

if (existingCapture && process.env.CAPTURE_FAULT_INJECTION === "1") {
  if (process.env.CAPTURE_FAULT_POINT === "HOOK-LEDGER-DEDUP-002") {
    process.exit(137) // Crash before skip logic
  }
}
```

**Validation Assertions:**

- After recovery: Collision detected again
- Export skipped (no vault file)
- Dedup counter incremented
- Audit log entry created

---

#### HOOK-LEDGER-AUDIT-003: Audit Insert After Export Success

**Component:** Staging Ledger (Export Audit Trail)

**Scenario:** Crash after vault write succeeds but before audit row inserted

**Code Location:** `packages/staging-ledger/src/audit.ts:45` _(placeholder)_

**Expected Error:** None (transient crash point)

**Recovery Behavior:** Next poll detects exported file without audit row. Insert retroactive audit entry with `mode='recovery'`.

**State Before Crash:**

- Vault file written: `inbox/{ulid}.md`
- Atomic rename completed
- Audit row not yet inserted

**State After Crash:**

- Vault file exists (permanent)
- Capture row: `status='transcribed'` (not updated to `exported`)
- No audit row for this capture

**Test Coverage:**

- `export-recovery.test.ts::handles missing audit row after successful export`
- `crash-matrix.test.ts::HOOK-LEDGER-AUDIT-003`

**Crash Trigger:**

```typescript
// In export audit logger
try {
  await db.run(
    'INSERT INTO exports_audit (capture_id, vault_path, ...) VALUES (?, ?, ...)',
    [captureId, vaultPath, ...]
  );

  if (process.env.CAPTURE_FAULT_INJECTION === '1') {
    if (process.env.CAPTURE_FAULT_POINT === 'HOOK-LEDGER-AUDIT-003') {
      process.exit(137); // Crash before status update
    }
  }
} catch (error) {
  // Error handling
}
```

**Validation Assertions:**

- After recovery: Audit row inserted (retroactive)
- Capture status updated: `exported`
- Vault file untouched (already permanent)
- Idempotency maintained (no duplicate audit)

---

### Export Hooks

#### HOOK-EXPORT-WRITE-001: Temp File Write Failure (Disk Full)

**Component:** Export (Atomic Writer - Temp Stage)

**Scenario:** Writing temp file fails due to ENOSPC (no space left on device)

**Code Location:** `packages/export/src/atomic-writer.ts:123` _(placeholder)_

**Expected Error:** `EXPORT_DISK_FULL` (permanent error until space freed)

**Recovery Behavior:** Move to DLQ, no retry. Alert via `adhd doctor --category=infrastructure`. Manual intervention: free disk space, then retry DLQ items.

**State Before Crash:**

- Capture ready for export: `status='transcribed'`
- Temp file write started: `.tmp-{ulid}.md`
- Disk full error encountered

**State After Crash:**

- Partial temp file may exist (deleted on next poll)
- Capture row: `status='transcribed'` (unchanged)
- Error logged: `EXPORT_DISK_FULL`
- Worker pauses exports until space available

**Test Coverage:**

- `export-atomic-writer.test.ts::handles disk full as permanent error`
- `crash-matrix.test.ts::HOOK-EXPORT-WRITE-001`

**Crash Trigger:**

```typescript
// In atomic writer temp stage
try {
  await fs.writeFile(tempPath, content)
} catch (error) {
  if (error.code === "ENOSPC" && process.env.CAPTURE_FAULT_INJECTION === "1") {
    if (process.env.CAPTURE_FAULT_POINT === "HOOK-EXPORT-WRITE-001") {
      process.exit(137) // Crash before DLQ handling
    }
  }
}
```

**Validation Assertions:**

- After recovery: Capture in DLQ
- Error logged with disk space details
- Partial temp file cleaned up
- Export worker paused until space freed

---

#### HOOK-EXPORT-RENAME-002: Atomic Rename Failure (EEXIST)

**Component:** Export (Atomic Writer - Rename Stage)

**Scenario:** Atomic rename fails due to EEXIST (target file already exists, collision)

**Code Location:** `packages/export/src/atomic-writer.ts:145` _(placeholder)_

**Expected Error:** `EXPORT_FILE_EXISTS` (should never happen with ULID, indicates bug or external interference)

**Recovery Behavior:** Log error, halt export, alert via `adhd doctor`. Manual investigation required (filesystem corruption or external writes to inbox).

**State Before Crash:**

- Temp file written: `.tmp-{ulid}.md`
- Atomic rename attempted: `rename(.tmp-{ulid}.md, {ulid}.md)`
- Target file exists (EEXIST)

**State After Crash:**

- Temp file remains (not cleaned up)
- Target file exists (created externally?)
- Capture row: `status='transcribed'`
- Export halted for investigation

**Test Coverage:**

- `export-atomic-writer.test.ts::detects external file collision`
- `crash-matrix.test.ts::HOOK-EXPORT-RENAME-002`

**Crash Trigger:**

```typescript
// In atomic writer rename stage
try {
  await fs.rename(tempPath, finalPath)
} catch (error) {
  if (error.code === "EEXIST" && process.env.CAPTURE_FAULT_INJECTION === "1") {
    if (process.env.CAPTURE_FAULT_POINT === "HOOK-EXPORT-RENAME-002") {
      process.exit(137) // Crash before investigation
    }
  }
}
```

**Validation Assertions:**

- After recovery: Collision logged
- Temp file preserved for inspection
- Export worker halted (manual resolution)
- No data loss (capture preserved in ledger)

---

#### HOOK-EXPORT-CLEANUP-003: Temp File Cleanup Failure

**Component:** Export (Atomic Writer - Cleanup Stage)

**Scenario:** Cleanup of old temp files fails (permissions or disk error)

**Code Location:** `packages/export/src/atomic-writer.ts:178` _(placeholder)_

**Expected Error:** `CLEANUP_FAILED` (warning only, non-blocking)

**Recovery Behavior:** Log warning, continue operations. Temp files accumulate until manual cleanup or permissions fixed. Monitor via `adhd doctor --category=operational`.

**State Before Crash:**

- Export succeeded (vault file permanent)
- Audit row inserted
- Cleanup attempted: `rm .tmp-*`
- Cleanup fails (EACCES or EIO)

**State After Crash:**

- Vault file permanent (success)
- Temp files remain (accumulate over time)
- Warning logged: `CLEANUP_FAILED`
- Operations continue (non-critical failure)

**Test Coverage:**

- `export-cleanup.test.ts::handles cleanup failure as warning`
- `crash-matrix.test.ts::HOOK-EXPORT-CLEANUP-003`

**Crash Trigger:**

```typescript
// In atomic writer cleanup stage
try {
  await fs.unlink(tempPath)
} catch (error) {
  if (process.env.CAPTURE_FAULT_INJECTION === "1") {
    if (process.env.CAPTURE_FAULT_POINT === "HOOK-EXPORT-CLEANUP-003") {
      process.exit(137) // Crash during cleanup
    }
  }
}
```

**Validation Assertions:**

- After recovery: Export complete (vault file exists)
- Temp file remains (orphaned)
- Warning logged (not error)
- Health check shows `DEGRADED_CLEANUP` (info severity)

---

## Hook Coverage Matrix

| Component          | Total Hooks | Test Coverage    | Status      |
| ------------------ | ----------- | ---------------- | ----------- |
| **Voice Capture**  | 3           | 3/3 (100%)       | ✅ Planned  |
| **Email Capture**  | 3           | 3/3 (100%)       | ✅ Planned  |
| **Staging Ledger** | 3           | 3/3 (100%)       | ✅ Planned  |
| **Export**         | 3           | 3/3 (100%)       | ✅ Planned  |
| **Total**          | **12**      | **12/12 (100%)** | ✅ Complete |

**Coverage Status Legend:**

- ✅ **Planned** - Hook documented, test case specified (not yet implemented)
- 🟡 **Partial** - Hook implemented, test case incomplete
- ✅ **Complete** - Hook implemented, test passing, coverage validated
- 🔴 **Missing** - Hook identified but not documented or tested

## Hook Implementation Patterns

### Pattern 1: Transient Error with Exponential Backoff

**Use Case:** Network errors, rate limits, temporary resource unavailability

**Example Hooks:** `HOOK-EMAIL-POLL-002` (rate limit), `HOOK-VOICE-POLL-001` (dataless file)

**Implementation:**

```typescript
// Retry configuration
const retryConfig = {
  maxAttempts: 3,
  baseDelay: 60_000, // 60 seconds
  maxDelay: 480_000, // 8 minutes
  jitter: true, // Add randomization to prevent thundering herd
}

// Retry with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  hookId?: string
): Promise<T> {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      // Fault injection hook
      if (
        process.env.CAPTURE_FAULT_INJECTION === "1" &&
        process.env.CAPTURE_FAULT_POINT === hookId
      ) {
        process.exit(137)
      }

      return await operation()
    } catch (error) {
      if (attempt === config.maxAttempts) {
        throw error // Max attempts reached
      }

      // Calculate backoff with jitter
      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt - 1),
        config.maxDelay
      )
      const jitteredDelay = config.jitter
        ? delay * (0.5 + Math.random() * 0.5)
        : delay

      await sleep(jitteredDelay)
    }
  }
}
```

### Pattern 2: Permanent Error with DLQ

**Use Case:** Permission errors, invalid credentials, disk full

**Example Hooks:** `HOOK-VOICE-EXPORT-003` (permission denied), `HOOK-EXPORT-WRITE-001` (disk full)

**Implementation:**

```typescript
// Move to Dead Letter Queue
async function handlePermanentError(
  captureId: string,
  error: Error,
  hookId?: string
): Promise<void> {
  // Fault injection hook
  if (
    process.env.CAPTURE_FAULT_INJECTION === "1" &&
    process.env.CAPTURE_FAULT_POINT === hookId
  ) {
    process.exit(137)
  }

  // Log to errors_log table
  await db.run(
    `INSERT INTO errors_log (capture_id, error_type, error_message, is_retriable, dlq_at)
     VALUES (?, ?, ?, 0, datetime('now'))`,
    [captureId, error.name, error.message]
  )

  // Alert via health check
  logger.error(`Permanent error for capture ${captureId}: ${error.message}`)

  // Manual intervention required
  // User must fix underlying issue, then retry via: adhd retry dlq
}
```

### Pattern 3: Idempotency Check Before Retry

**Use Case:** Ensure recovery doesn't duplicate data

**Example Hooks:** All hooks (universal pattern)

**Implementation:**

```typescript
// Check if operation already completed (idempotency)
async function ensureIdempotent(
  captureId: string,
  hookId?: string
): Promise<boolean> {
  // Fault injection hook
  if (
    process.env.CAPTURE_FAULT_INJECTION === "1" &&
    process.env.CAPTURE_FAULT_POINT === hookId
  ) {
    process.exit(137)
  }

  // Check staging ledger for completion
  const capture = await db.get("SELECT status FROM captures WHERE id = ?", [
    captureId,
  ])

  // Terminal statuses indicate completion
  if (
    ["exported", "exported_placeholder", "exported_duplicate"].includes(
      capture.status
    )
  ) {
    logger.info(`Capture ${captureId} already completed, skipping retry`)
    return true // Already done, skip retry
  }

  return false // Needs retry
}
```

### Pattern 4: Circuit Breaker for External APIs

**Use Case:** Prevent cascading failures from external service outages

**Example Hooks:** `HOOK-EMAIL-AUTH-001` (Gmail OAuth), `HOOK-EMAIL-POLL-002` (Gmail API)

**Implementation:**

```typescript
// Circuit breaker states: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
class CircuitBreaker {
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED"
  private failureCount = 0
  private lastFailureTime: number | null = null

  private readonly threshold = 3 // Open after 3 failures
  private readonly cooldown = 15 * 60 * 1000 // 15 minutes

  async execute<T>(operation: () => Promise<T>, hookId?: string): Promise<T> {
    // Check circuit state
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime! >= this.cooldown) {
        this.state = "HALF_OPEN"
      } else {
        throw new Error("Circuit breaker open, operation blocked")
      }
    }

    try {
      // Fault injection hook
      if (
        process.env.CAPTURE_FAULT_INJECTION === "1" &&
        process.env.CAPTURE_FAULT_POINT === hookId
      ) {
        process.exit(137)
      }

      const result = await operation()

      // Success: reset circuit
      this.failureCount = 0
      this.state = "CLOSED"

      return result
    } catch (error) {
      this.failureCount++
      this.lastFailureTime = Date.now()

      if (this.failureCount >= this.threshold) {
        this.state = "OPEN"
        logger.error(
          `Circuit breaker opened after ${this.failureCount} failures`
        )
      }

      throw error
    }
  }
}
```

## How to Add New Hooks

### Step 1: Identify Crash Point

**Questions to Answer:**

- What operation is being performed? (poll, write, auth, export)
- What can go wrong? (network, permissions, disk, corruption)
- Is the error transient or permanent?
- What is the expected recovery behavior?

**Example:** Adding hook for "Whisper model file missing"

### Step 2: Assign Hook ID

**Format:** `HOOK-{COMPONENT}-{SCENARIO}-{NUMBER}`

**Example:** `HOOK-VOICE-TRANS-004` (4th voice transcription hook)

### Step 3: Document Hook Metadata

Use the template from "Quick Reference" section:

```markdown
#### HOOK-VOICE-TRANS-004: Whisper Model File Missing

**Component:** Voice Capture (Transcription Worker)
**Scenario:** Whisper model file not found at expected path
**Code Location:** `packages/capture/src/voice/transcriber.ts:45`
**Expected Error:** `MODEL_FILE_MISSING` (permanent, setup error)
**Recovery Behavior:** Halt transcription, alert via `adhd doctor`, user must download model
...
```

### Step 4: Implement Fault Injection

```typescript
// At crash point in code
if (
  process.env.CAPTURE_FAULT_INJECTION === "1" &&
  process.env.CAPTURE_FAULT_POINT === "HOOK-VOICE-TRANS-004"
) {
  process.exit(137)
}
```

### Step 5: Write Test Case

```typescript
// In crash-matrix.test.ts
test("HOOK-VOICE-TRANS-004: Whisper model missing", async () => {
  // Setup: Remove model file
  await fs.unlink("/path/to/whisper-medium.bin")

  // Trigger: Start transcription with fault injection
  process.env.CAPTURE_FAULT_INJECTION = "1"
  process.env.CAPTURE_FAULT_POINT = "HOOK-VOICE-TRANS-004"

  const result = await transcribeVoice("test-audio.m4a")

  // Assert: Error detected, worker halted
  expect(result.error).toBe("MODEL_FILE_MISSING")
  expect(await workerStatus()).toBe("HALTED")
  expect(await doctorCheck("transcription")).toBe("CRITICAL")
})
```

### Step 6: Update Coverage Matrix

Add entry to "Hook Coverage Matrix" table and update test count.

## Maintenance

### When to Update This Guide

- **New crash scenarios identified** - Add hook entries for new failure modes
- **Code locations change** - Update file paths and line numbers after refactoring
- **Recovery behavior modified** - Update retry logic, DLQ handling, or escalation
- **Test coverage changes** - Mark hooks as complete/partial/missing
- **Hook deprecated** - Move to "Deprecated Hooks" section (below)

### Hook Location Validation

**Quarterly Task:** Validate all hook code locations still accurate

```bash
# Script to validate hook locations (example)
for hook in $(grep "Code Location:" guide-fault-injection-registry.md | cut -d'`' -f2); do
  file=$(echo "$hook" | cut -d':' -f1)
  line=$(echo "$hook" | cut -d':' -f2)

  if [ -f "$file" ]; then
    echo "✅ $file exists"
  else
    echo "❌ $file MISSING - update hook documentation"
  fi
done
```

### Known Limitations (MPPP Scope)

- **Code locations are placeholders** - Updated during Phase 1 implementation
- **No automated hook verification** - Manual validation required
- **No hook coverage reporting** - Coverage tracked manually in matrix table
- **No dynamic hook discovery** - Hooks must be manually added to this guide

## Deprecated Hooks

_(None yet - hooks will be moved here when recovery behavior changes make them obsolete)_

### Example Deprecation Entry

```markdown
#### HOOK-VOICE-POLL-000: Manual File Polling (DEPRECATED)

**Deprecated Date:** 2025-10-15
**Reason:** Replaced by iCloud-aware polling (HOOK-VOICE-POLL-001)
**Migration:** All tests updated to use HOOK-VOICE-POLL-001
```

## Related Documentation

### Core References

- [Crash Matrix Test Plan Guide](./guide-crash-matrix-test-plan.md) - Systematic crash testing procedures (REQUIRED companion)
- [Error Recovery Guide](./guide-error-recovery.md) - Error taxonomy and retry orchestration patterns
- [Master PRD Section 10.3](../master/prd-master.md) - Crash Recovery Requirements

### Related Guides

- [TestKit Usage Guide](./guide-testkit-usage.md) - TestKit fault injection utilities and patterns
- [Health Command Guide](./guide-health-command.md) - Post-crash health validation
- [Capture Debugging Guide](./guide-capture-debugging.md) - Worker troubleshooting and log analysis
- [Test Strategy Guide](./guide-test-strategy.md) - Overall testing philosophy

### Technical Specs

- [Capture Test Spec](../features/capture/spec-capture-test.md) - Test coverage requirements
- [Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md) - State machine and recovery logic
- [Atomic Writer Spec](../features/obsidian-bridge/spec-obsidian-tech.md) - Export idempotency guarantees

## Maintenance Notes

### Future Enhancements (Phase 2+)

- **Automated hook discovery** - Parse codebase for fault injection points
- **Hook coverage dashboard** - Visual report of tested vs. untested hooks
- **Dynamic hook ID generation** - Generate hook IDs from code annotations
- **Hook execution telemetry** - Track how often each hook triggers in tests
- **Cross-reference validation** - Ensure all hooks referenced in crash matrix guide exist
