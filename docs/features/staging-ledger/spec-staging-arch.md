---
title: Staging Ledger Architecture Specification
status: final
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-27
spec_type: architecture
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Staging Ledger — Architecture Specification

## 1. Executive Summary

### Purpose

This specification defines the **high-level component architecture** for the SQLite staging ledger—the durability backbone of ADHD Brain's capture system. It establishes how four minimal tables provide crash-safe staging, content-hash deduplication, immutable audit trails, and process resumption without becoming a parallel knowledge store.

### Scope

**In Scope:**

- Component model (4 tables, their relationships, state machines)
- Data flow from capture → staging → export
- Integration points with voice polling, email polling, transcription worker, export worker
- Crash recovery architecture and replay logic
- Deduplication strategy (SHA-256 content hash + channel-specific IDs)
- Performance targets (insert < 100ms, query < 50ms, recovery < 250ms)
- State machine for capture lifecycle

**Out of Scope:**

- Implementation details (see Tech Spec)
- Test strategies (see Test Spec)
- SQLite PRAGMAs and configuration (see Tech Spec)
- Detailed API contracts (see Tech Spec)

### Success Criteria

- Zero data loss over 50+ captures
- Duplicate detection prevents vault file collisions
- Crash recovery completes < 250ms
- Status state machine prevents invalid transitions
- All integration points clearly defined

### Alignment

This architecture implements:

- Master PRD v2.3.0-MPPP §4.2 (SQLite Staging Ledger Design)
- Roadmap v2.0.0-MPPP Phase 1 (Core Ingestion)
- Staging Ledger PRD v1.0.0-MPPP (all functional requirements)

---

## 2. System Context

### 2.1 Placement in Overall Architecture

The staging ledger sits **between capture sources and Obsidian vault export**, providing the durability layer that makes burst capture safe:

```text
┌─────────────────────────────────────────────────────────────┐
│                     Input Layer                             │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │  Voice Polling  │          │  Email Polling  │          │
│  │   (icloudctl)   │          │   (Gmail API)   │          │
│  └────────┬────────┘          └────────┬────────┘          │
│           │                             │                    │
│           └──────────┬─────────────────┘                    │
│                      ▼                                       │
├─────────────────────────────────────────────────────────────┤
│              SQLite Staging Ledger                          │
│  ┌───────────────────────────────────────────────────┐     │
│  │  captures       : Ephemeral staging + state       │     │
│  │  exports_audit  : Immutable export trail          │     │
│  │  errors_log     : Failure diagnostics             │     │
│  │  sync_state     : Poll cursor tracking            │     │
│  └───────────────────────────────────────────────────┘     │
│           │                                                  │
│           ▼                                                  │
├─────────────────────────────────────────────────────────────┤
│              Processing Pipeline                            │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │  Transcription  │          │ Content Hash    │          │
│  │  Worker         │          │ Deduplication   │          │
│  │  (Whisper)      │          │                 │          │
│  └────────┬────────┘          └────────┬────────┘          │
│           │                             │                    │
│           └──────────┬─────────────────┘                    │
│                      ▼                                       │
├─────────────────────────────────────────────────────────────┤
│              Export Worker                                  │
│  ┌─────────────────┐                                        │
│  │ Atomic Writer   │                                        │
│  │ (temp + rename) │                                        │
│  └────────┬────────┘                                        │
│           │                                                  │
│           ▼                                                  │
├─────────────────────────────────────────────────────────────┤
│              Obsidian Vault                                 │
│              inbox/<ulid>.md                                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Architectural Principles

1. **Durability First:** Every capture hits SQLite atomically before async work
2. **Minimal Schema:** 4 tables maximum, resist scope creep
3. **Status Machine:** Immutable terminal states prevent invalid transitions
4. **Late Hash Binding:** Voice captures stage before transcription completes
5. **Crash Safety:** WAL mode + atomic inserts enable seamless recovery
6. **Audit Transparency:** Forever-retained exports_audit for trust

---

## 3. Component Model

### 3.1 Core Tables (4-Table Hard Cap)

#### Table 1: captures (Ephemeral Staging)

**Purpose:** Temporary staging for in-flight captures with processing state

**Lifecycle:** Insert on capture → update on transcription → update on export → trim after 90 days (exported only)

**Key Characteristics:**

- ULID primary key (time-orderable, becomes vault filename)
- Nullable content_hash (late binding for voice transcripts)
- Status-driven state machine (immutable terminal states)
- JSON metadata per source (audio_fp, message_id, file paths)

**Relationships:**

- Parent to exports_audit (1:N - one capture may have multiple export attempts)
- Parent to errors_log (1:N - one capture may have multiple failures)

#### Table 2: exports_audit (Immutable Trail)

**Purpose:** Permanent record of every export attempt for transparency and debugging

**Lifecycle:** Insert on export attempt → never update → forever retention

**Key Characteristics:**

- Captures export mode (initial | duplicate_skip | placeholder)
- Snapshots content hash at export time
- Error flag for failed attempts
- Foreign key to captures table

**Relationships:**

- Child of captures (N:1 - many audits per capture)

#### Table 3: errors_log (Diagnostics)

**Purpose:** Structured failure tracking for debugging and health monitoring

**Lifecycle:** Insert on failure → optionally trim after 90 days (Phase 2+)

**Key Characteristics:**

- Links to specific capture (nullable for system-level errors)
- Categorizes by stage (poll | transcribe | export | backup)
- Timestamp for temporal analysis

**Relationships:**

- Child of captures (N:1 - many errors per capture, optional)

#### Table 4: sync_state (Cursors)

**Purpose:** Track poll cursors and checkpoints to prevent reprocessing

**Lifecycle:** Upsert on poll completion → forever retention

**Key Characteristics:**

- Key-value store (gmail_history_id, last_voice_poll)
- Updated timestamp for monitoring polling health
- Minimal rows (< 100 expected)

**Relationships:**

- Standalone (no foreign keys)

### 3.2 Component Relationships

```text
┌──────────────────────────────────────────────────────────┐
│                      captures                            │
│  ┌────────────────────────────────────────────────┐     │
│  │ id (PK, ULID)                                  │     │
│  │ source (voice | email)                         │     │
│  │ raw_content (text)                             │     │
│  │ content_hash (nullable until available)        │     │
│  │ status (state machine)                         │     │
│  │ meta_json (channel-specific metadata)          │     │
│  │ created_at, updated_at                         │     │
│  └────────────────────────────────────────────────┘     │
│           │                      │                        │
│           │ 1:N                  │ 1:N                    │
│           ▼                      ▼                        │
│  ┌────────────────┐    ┌────────────────────────┐       │
│  │ exports_audit  │    │    errors_log          │       │
│  │ (FK: capture_id│    │    (FK: capture_id)    │       │
│  │  immutable)    │    │    (diagnostic)        │       │
│  └────────────────┘    └────────────────────────┘       │
│                                                           │
│  ┌────────────────────────────────────────────────┐     │
│  │              sync_state                        │     │
│  │  (standalone - no foreign keys)                │     │
│  │  key-value cursor tracking                     │     │
│  └────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Architecture

### 4.1 Voice Capture Flow (Happy Path)

```text
┌─────────────────────────────────────────────────────────────┐
│  1. Voice Polling (icloudctl)                               │
│     - Detect new .m4a files                                 │
│     - Check APFS dataless status                            │
│     - Queue for sequential download                         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Staging Insert (ATOMIC - Durability Achieved)          │
│     INSERT INTO captures (id, source, raw_content, status,  │
│                           meta_json)                        │
│     VALUES (ulid(), 'voice', '', 'staged',                  │
│             '{"audio_fp": "sha256..."}')                    │
│     → COMMIT (< 100ms target)                               │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Transcription Worker (Whisper)                         │
│     - Download file if dataless (icloudctl)                 │
│     - Transcribe via Whisper medium model                   │
│     - Compute SHA-256 of transcript text                    │
│     - UPDATE captures SET content_hash = ?,                 │
│                           status = 'transcribed'            │
│       WHERE id = ?                                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Duplicate Check                                         │
│     SELECT id FROM captures                                 │
│     WHERE content_hash = ? AND id != ?                      │
│     → If match: UPDATE status = 'exported_duplicate'        │
│     → If no match: Proceed to export                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Export Worker (Atomic Write)                           │
│     - Write to temp file: inbox/.tmp-<ulid>.md              │
│     - fsync(temp_fd)                                        │
│     - rename(temp, inbox/<ulid>.md)                         │
│     - fsync(parent_dir)                                     │
│     → COMMIT                                                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Audit & Status Update                                   │
│     BEGIN TRANSACTION                                       │
│       INSERT INTO exports_audit (...)                       │
│       UPDATE captures SET status = 'exported'               │
│     COMMIT                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Voice Transcription Failure Flow

```text
┌─────────────────────────────────────────────────────────────┐
│  1-2. Same as happy path (staging insert)                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Transcription Failure (Whisper)                        │
│     - Whisper timeout / corrupted audio / etc.              │
│     - UPDATE captures SET status = 'failed_transcription'   │
│       WHERE id = ?                                          │
│     - INSERT INTO errors_log (capture_id, stage,            │
│                               message)                      │
│       VALUES (?, 'transcribe', 'Whisper timeout 30s')       │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Placeholder Export                                      │
│     - Write placeholder markdown:                           │
│       ---                                                   │
│       [TRANSCRIPTION_FAILED]                                │
│       Audio: /path/to/memo.m4a                              │
│       Error: Whisper timeout after 30s                      │
│       ---                                                   │
│     - Atomic write (temp + rename)                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Audit & Status Update                                   │
│     BEGIN TRANSACTION                                       │
│       INSERT INTO exports_audit (mode='placeholder',        │
│                                  error_flag=1)              │
│       UPDATE captures SET status = 'exported_placeholder'   │
│     COMMIT                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Email Capture Flow

```text
┌─────────────────────────────────────────────────────────────┐
│  1. Email Polling (Gmail API)                               │
│     - List new messages (query-based filtering)             │
│     - Fetch headers + plain text body                       │
│     - Extract metadata (from, subject, message_id)          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Content Hash Computation                                │
│     - Normalize body text (trim, consistent line endings)   │
│     - Compute SHA-256 of normalized text                    │
│     - Check for duplicate:                                  │
│       SELECT id FROM captures                               │
│       WHERE content_hash = ? OR                             │
│             json_extract(meta_json, '$.message_id') = ?     │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Staging Insert (ATOMIC)                                 │
│     INSERT INTO captures (id, source, raw_content,          │
│                           content_hash, status, meta_json)  │
│     VALUES (ulid(), 'email', body, hash, 'staged',          │
│             '{"message_id": "...", "from": "..."}')         │
│     → COMMIT (< 100ms target)                               │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Export or Skip                                          │
│     - If duplicate detected: UPDATE status =                │
│       'exported_duplicate', skip vault write                │
│     - If unique: Proceed to export (same as voice step 5-6) │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Crash Recovery Flow

```text
┌─────────────────────────────────────────────────────────────┐
│  1. Application Restart                                     │
│     - Startup sequence begins                               │
│     - Initialize SQLite connection                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Recovery Query                                          │
│     SELECT * FROM captures                                  │
│     WHERE status IN ('staged',                              │
│                      'transcribed',                         │
│                      'failed_transcription')                │
│     ORDER BY created_at ASC                                 │
│     → Returns rows not yet exported                         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Resume Processing                                       │
│     - For each row, determine next step:                    │
│       - status='staged' → Resume at transcription           │
│       - status='transcribed' → Resume at export             │
│       - status='failed_transcription' → Export placeholder  │
│     - Process sequentially (no parallel retries)            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4. User Notification                                       │
│     - Log: "Recovered N captures"                           │
│     - Continue normal operation                             │
└─────────────────────────────────────────────────────────────┘
```

**Recovery Time Target:** < 250ms for query + resume startup

**Recovery Guarantee:** Zero data loss (WAL mode ensures committed transactions survive crash)

---

## 5. State Machine Architecture

### 5.1 Comprehensive Capture Status State Machine

The `captures.status` field drives all processing logic and enforces lifecycle invariants. This state machine coordinates with error recovery, transcription, and export operations.

**Related Documentation:**

- [Error Recovery Guide](../../guides/guide-error-recovery.md) - Failure state transitions and retry logic
- [Whisper Transcription Guide](../../guides/guide-whisper-transcription.md) - Transcription states and timeouts
- [Gmail OAuth2 Setup Guide](../../guides/guide-gmail-oauth2-setup.md) - Email capture states
- [Direct Export Pattern](../../cross-cutting/spec-direct-export-tech.md) - Export state coordination
- [ADR-0004: Status-Driven State Machine](../../adr/0004-status-driven-state-machine.md) - State machine architecture decision
- [ADR-0014: Placeholder Export Immutability](../../adr/0014-placeholder-export-immutability.md) - Terminal state guarantees

```text
                       ┌─────────────────────────────────┐
                       │         INITIAL STATE           │
                       │           staged                │
                       │   (capture inserted to DB)      │
                       └──────────────┬──────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    │ SUCCESS PATH                      │ FAILURE PATH
                    ▼                                   ▼
         ┌──────────────────────┐          ┌──────────────────────┐
         │   TRANSCRIBED         │          │  FAILED_TRANSCRIPTION│
         │  (Whisper success)    │          │  (Whisper timeout/   │
         │  Hash: SHA-256 set    │          │   corrupt audio)     │
         │                       │          │  Hash: NULL          │
         └──────────┬────────────┘          └──────────┬───────────┘
                    │                                   │
                    │                                   │
                    ▼                                   ▼
         ┌──────────────────────┐          ┌──────────────────────┐
         │   Duplicate Check     │          │   PLACEHOLDER EXPORT │
         │   (query hash in DB)  │          │   (error recovery)   │
         │                       │          │   Immediate export   │
         └──────────┬────────────┘          └──────────┬───────────┘
                    │                                   │
           ┌────────┴────────┐                         │
           │ UNIQUE          │ DUPLICATE               │
           ▼                 ▼                         ▼
┌──────────────────┐ ┌──────────────────┐  ┌────────────────────────┐
│    EXPORTED      │ │ EXPORTED_DUPLICATE│  │ EXPORTED_PLACEHOLDER   │
│  (success)       │ │  (skip vault)     │  │  (degraded success)    │
│  Hash: SHA-256   │ │  Hash: SHA-256    │  │  Hash: NULL            │
│  Vault: written  │ │  Vault: skipped   │  │  Vault: placeholder.md │
└──────────────────┘ └──────────────────┘  └────────────────────────┘
    TERMINAL            TERMINAL                 TERMINAL
  (immutable)          (immutable)              (immutable)
```

**State Flow Narratives:**

**Voice Capture Happy Path:**

1. `staged` (file detected, audio fingerprint computed, DB insert) →
2. `transcribed` (Whisper success, SHA-256 computed, hash stored) →
3. Duplicate check (query by hash) →
4. `exported` (unique hash, Obsidian file written, audit logged)

**Voice Capture Failure Path:**

1. `staged` (file detected, audio fingerprint computed, DB insert) →
2. `failed_transcription` (Whisper timeout 30s OR corrupt audio detected) →
3. `exported_placeholder` (placeholder markdown written, audit logged with error_flag=1)

**Email Capture Happy Path:**

1. `staged` (email fetched, SHA-256 computed immediately, DB insert) →
2. Duplicate check (query by hash OR message_id) →
3. `exported` (unique hash, Obsidian file written, audit logged)

**Email Capture Duplicate Path:**

1. `staged` (email fetched, SHA-256 computed) →
2. Duplicate check (hash OR message_id match found) →
3. `exported_duplicate` (no vault write, audit logged with mode='duplicate_skip')

### 5.2 Status Definitions

| Status                 | Meaning                                  | Hash State                      | Next Allowed States                                   | Terminal? | Error Recovery                                                                                                         |
| ---------------------- | ---------------------------------------- | ------------------------------- | ----------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `staged`               | Capture inserted, awaiting processing    | NULL (voice) or SHA-256 (email) | transcribed, failed_transcription, exported_duplicate | No        | Retry transcription on crash (see [Error Recovery Guide](../../guides/guide-error-recovery.md))                        |
| `transcribed`          | Transcription complete, awaiting export  | SHA-256 set                     | exported, exported_duplicate                          | No        | Retry export on crash (idempotent via hash check)                                                                      |
| `failed_transcription` | Transcription failed, placeholder needed | NULL                            | exported_placeholder                                  | No        | No retry - export placeholder immediately (see [ADR-0014](../../adr/0014-placeholder-export-immutability.md))          |
| `exported`             | Successfully exported to vault           | SHA-256 set                     | None                                                  | **Yes**   | N/A - immutable success state                                                                                          |
| `exported_duplicate`   | Detected duplicate, no vault write       | SHA-256 set                     | None                                                  | **Yes**   | N/A - immutable success state (dedup working)                                                                          |
| `exported_placeholder` | Placeholder exported after failure       | NULL or audio_fp                | None                                                  | **Yes**   | N/A - permanent failure documented (see [Placeholder Immutability](../../adr/0014-placeholder-export-immutability.md)) |

### 5.3 Failure Branch Mapping

The following table maps failure scenarios to state transitions and recovery actions:

| Failure Scenario           | From State    | Error Type                    | To State                                        | Recovery Action                                  | Reference                                                             |
| -------------------------- | ------------- | ----------------------------- | ----------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| Whisper timeout (30s)      | `staged`      | `transcription.timeout`       | `failed_transcription` → `exported_placeholder` | Export placeholder immediately                   | [Whisper Guide](../../guides/guide-whisper-transcription.md)          |
| Corrupt audio file         | `staged`      | `transcription.corrupt_audio` | `failed_transcription` → `exported_placeholder` | Export placeholder immediately                   | [Error Recovery](../../guides/guide-error-recovery.md)                |
| Whisper OOM error          | `staged`      | `transcription.oom`           | `failed_transcription` → `exported_placeholder` | Export placeholder immediately                   | [Whisper Guide](../../guides/guide-whisper-transcription.md)          |
| iCloud dataless file       | `staged`      | `file.dataless_icloud`        | Retry in same state                             | Retry with exponential backoff (max 10 attempts) | [Error Recovery](../../guides/guide-error-recovery.md)                |
| Gmail token expired        | N/A (polling) | `auth.invalid_grant`          | N/A (system error)                              | Require user re-authentication                   | [Gmail OAuth2 Guide](../../guides/guide-gmail-oauth2-setup.md)        |
| Gmail rate limited         | N/A (polling) | `api.rate_limited`            | N/A (system error)                              | Exponential backoff, circuit breaker             | [Error Recovery](../../guides/guide-error-recovery.md)                |
| Duplicate hash detected    | `transcribed` | N/A (not error)               | `exported_duplicate`                            | Skip vault write, log audit                      | [Deduplication §6](spec-staging-arch.md#6-deduplication-architecture) |
| Duplicate message_id       | `staged`      | N/A (not error)               | `exported_duplicate`                            | Skip vault write, log audit                      | [Deduplication §6](spec-staging-arch.md#6-deduplication-architecture) |
| Vault unreachable          | `transcribed` | `export.vault_unreachable`    | Retry in same state                             | Retry with exponential backoff (max 5 attempts)  | [Error Recovery](../../guides/guide-error-recovery.md)                |
| Disk full                  | `transcribed` | `export.disk_full`            | Retry in same state                             | Alert user, retry after cleanup                  | [Error Recovery](../../guides/guide-error-recovery.md)                |
| App crash after insert     | `staged`      | N/A (crash)                   | Resume from `staged`                            | Query recoverable captures on startup            | [Crash Recovery §4.4](spec-staging-arch.md#44-crash-recovery-flow)    |
| App crash after transcribe | `transcribed` | N/A (crash)                   | Resume from `transcribed`                       | Query recoverable captures on startup            | [Crash Recovery §4.4](spec-staging-arch.md#44-crash-recovery-flow)    |

**Key Principles:**

1. **Transient errors** (network, rate limit, dataless file) → Retry in same state with backoff
2. **Permanent errors** (corrupt audio, OOM, missing file) → Transition to `failed_transcription` → Export placeholder
3. **Duplicates** (hash match, message_id match) → Transition to `exported_duplicate` (success, not error)
4. **Crash recovery** → Query by non-terminal status (`staged`, `transcribed`, `failed_transcription`) → Resume processing

### 5.4 State Transition Rules

**Immutability Rules:**

1. Once status begins with `exported*`, it is **immutable** (never updated again)
2. Hash may change **at most once** (NULL → SHA-256 on transcription)
3. Placeholder exports are **never edited** (no retrofill in MPPP)

**Validation Rules:**

```typescript
function validateTransition(current: Status, next: Status): boolean {
  // Terminal states cannot transition
  if (current.startsWith("exported")) {
    return false
  }

  // Staged can go to transcribed, failed, or duplicate
  if (current === "staged") {
    return [
      "transcribed",
      "failed_transcription",
      "exported_duplicate",
    ].includes(next)
  }

  // Transcribed can only go to exported states
  if (current === "transcribed") {
    return ["exported", "exported_duplicate"].includes(next)
  }

  // Failed transcription can only go to placeholder export
  if (current === "failed_transcription") {
    return next === "exported_placeholder"
  }

  return false
}
```

---

## 6. Deduplication Architecture

### 6.1 Deduplication Strategy

**Goal:** Prevent duplicate vault files while handling late-arriving hashes (voice transcripts)

**Approach:** Multi-layered duplicate detection using channel-specific IDs and content hashes

#### Layer 1: Channel-Native ID (Unique Index)

Prevents **reprocessing of same physical/logical item**:

```sql
CREATE UNIQUE INDEX captures_channel_native_uid ON captures(
  json_extract(meta_json, '$.channel'),
  json_extract(meta_json, '$.channel_native_id')
);
```

**Examples:**

- Voice: `('voice', '/path/to/memo.m4a')`
- Email: `('email', 'message-id@gmail.com')`

**Enforcement:** Database constraint violation on duplicate INSERT

#### Layer 2: Content Hash (SHA-256)

Prevents **duplicate content** across different items:

```sql
SELECT id FROM captures WHERE content_hash = ? LIMIT 1;
```

**Hash Normalization Process:**

1. Trim leading/trailing whitespace
2. Convert to consistent line endings (LF only)
3. Compute SHA-256 of normalized text
4. Store as 64-character hex string

**Voice-Specific Logic:**

- Hash may be NULL during `staged` status
- Audio fingerprint (SHA-256 of first 4MB) stored in meta_json
- Hash computed after transcription completes
- Duplicate check uses audio_fp until transcript available

**Email-Specific Logic:**

- Hash computed immediately (body text available)
- Message-ID also used for deduplication (Layer 1)
- Attachment count logged but not included in hash (MPPP scope)

### 6.2 Deduplication Flow

```text
┌─────────────────────────────────────────────────────────────┐
│  1. Pre-Insert Check (Layer 1: Channel-Native ID)          │
│     - Attempt INSERT with (channel, channel_native_id)      │
│     - If UNIQUE constraint violation:                       │
│       → Log: "Already staged, skip"                         │
│       → Return existing capture_id                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Pre-Export Check (Layer 2: Content Hash)               │
│     - Query: SELECT id FROM captures                        │
│       WHERE content_hash = ? AND id != ?                    │
│     - If match found:                                       │
│       → UPDATE status = 'exported_duplicate'                │
│       → INSERT exports_audit (mode='duplicate_skip')        │
│       → Skip vault write                                    │
│     - If no match:                                          │
│       → Proceed to export                                   │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Deduplication Performance

**Targets:**

- Layer 1 check: < 1ms (unique index lookup)
- Layer 2 check: < 10ms (content_hash index scan)

**Metrics:**

- `dedup_hits_total{layer=channel_id}` - Count of Layer 1 hits
- `dedup_hits_total{layer=content_hash}` - Count of Layer 2 hits
- `dedup_check_ms` - Query latency histogram

---

## 7. Integration Points

### 7.1 Upstream: Voice Capture Integration

**Component:** `packages/capture/src/voice-polling.ts`

**Contract:**

```typescript
interface VoiceCaptureInput {
  file_path: string // Apple Voice Memos path (never moved per ADR-0001)
  audio_fp: string // SHA-256 of first 4MB
  detected_at: Date // Poll timestamp
}

// Staging ledger provides:
function insertVoiceCapture(
  input: VoiceCaptureInput
): Promise<{ capture_id: string }>
```

**Data Flow:**

1. Voice polling detects new file
2. Compute audio fingerprint (icloudctl)
3. Call `insertVoiceCapture()`
4. Ledger returns ULID capture_id
5. Polling continues (transcription is async)

**Failure Handling:**

- If INSERT fails: Log error, skip file, continue polling
- If UNIQUE constraint violation: Skip (already staged)

### 7.2 Upstream: Email Capture Integration

**Component:** `packages/capture/src/email-polling.ts`

**Contract:**

```typescript
interface EmailCaptureInput {
  message_id: string // Gmail Message-ID
  from: string
  subject: string
  body_text: string // Plain text body
  received_at: Date
}

// Staging ledger provides:
function insertEmailCapture(
  input: EmailCaptureInput
): Promise<{ capture_id: string; is_duplicate: boolean }>
```

**Data Flow:**

1. Email polling fetches message
2. Normalize body text, compute SHA-256
3. Call `insertEmailCapture()`
4. Ledger returns capture_id + duplicate flag
5. If not duplicate, proceed to export

### 7.3 Downstream: Transcription Worker Integration

**Component:** `packages/capture/src/transcription-worker.ts`

**Contract:**

```typescript
interface TranscriptionUpdate {
  capture_id: string
  transcript_text: string // Whisper output
  content_hash: string // SHA-256 of transcript
}

// Staging ledger provides:
function updateTranscription(update: TranscriptionUpdate): Promise<void>
function markTranscriptionFailed(
  capture_id: string,
  error: string
): Promise<void>
```

**Data Flow:**

1. Worker queries for `status='staged'` captures
2. Transcribe audio via Whisper
3. On success: Call `updateTranscription()`
4. On failure: Call `markTranscriptionFailed()`
5. Ledger transitions status accordingly

### 7.4 Downstream: Export Worker Integration

**Component:** `packages/obsidian-bridge/src/export-worker.ts`

**Contract:**

```typescript
interface ExportInput {
  capture_id: string
  vault_path: string // inbox/<ulid>.md
  content: string // Markdown to write
  is_placeholder: boolean
}

// Staging ledger provides:
function recordExport(input: ExportInput): Promise<void>
function queryPendingExports(): Promise<Capture[]>
```

**Data Flow:**

1. Worker queries for `status IN ('transcribed', 'failed_transcription')`
2. Perform atomic vault write (temp + rename)
3. Call `recordExport()` to update audit + status
4. Continue to next capture

### 7.5 Integration: Health Command

**Component:** `packages/cli/src/commands/doctor.ts`

**Contract:**

```typescript
// Staging ledger provides:
interface HealthStatus {
  queue_depth: number // Count of pending captures
  last_backup: Date | null
  errors_24h: Array<{ stage: string; count: number }>
  placeholder_ratio_7d: number // Percentage
  database_size_mb: number
}

function getHealthStatus(): Promise<HealthStatus>
```

**Data Flow:**

1. Doctor command calls `getHealthStatus()`
2. Ledger executes diagnostic queries
3. Return structured health data
4. Doctor formats and displays results

---

## 8. Performance Architecture

### 8.1 Performance Targets

| Operation       | Target  | Percentile | Rationale                       |
| --------------- | ------- | ---------- | ------------------------------- |
| Capture insert  | < 100ms | p95        | Burst capture must feel instant |
| Duplicate check | < 10ms  | p95        | Pre-export validation, frequent |
| Recovery query  | < 50ms  | p95        | Startup time critical for UX    |
| Crash recovery  | < 250ms | p95        | Full restart → resume latency   |
| Backup creation | < 5s    | p95        | Hourly, non-blocking            |

### 8.2 Performance Design Decisions

**Why WAL Mode:**

- Concurrent reads during writes (non-blocking queries)
- Better crash recovery (smaller corruption window)
- Faster writes (no fsync per transaction in NORMAL mode)

**Why ULID Primary Key:**

- Time-ordered inserts (append-only B-tree, no fragmentation)
- Doubles as vault filename (no additional index needed)
- Lexicographically sortable (efficient `ORDER BY created_at`)

**Why Minimal Indexes:**

- Avoid write amplification (each index slows INSERT)
- Content hash UNIQUE index essential for deduplication
- Status index essential for recovery query
- Channel-native-ID index essential for idempotency

**Why Sequential Processing:**

- Avoids lock contention (single writer pattern)
- Simplifies crash recovery (no partial batch rollback)
- Sufficient for MPPP scope (< 200 captures/day)

### 8.3 Performance Monitoring

**Metrics:**

- `capture_staging_ms{source=voice|email}` - Insert latency
- `dedup_check_ms` - Hash query latency
- `recovery_query_ms` - Startup recovery time
- `backup_duration_ms` - Hourly backup latency

**Triggers to Optimize:**

- p95 insert > 100ms → Investigate index overhead
- p95 dedup > 10ms → Add composite index (status, content_hash)
- Recovery > 250ms → Add pagination to recovery query

---

## 9. Failure Modes & Recovery

### 9.1 Crash Scenarios

#### Crash 1: After Capture Insert, Before Transcription

**State:**

- captures row: `status='staged', content_hash=NULL`
- No exports_audit row
- No vault file

**Recovery:**

1. Query `WHERE status='staged'`
2. Resume transcription for all matches
3. Continue normal processing

**Invariant:** No data loss (insert committed before crash)

#### Crash 2: After Transcription, Before Export

**State:**

- captures row: `status='transcribed', content_hash=<sha256>`
- No exports_audit row
- No vault file

**Recovery:**

1. Query `WHERE status='transcribed'`
2. Resume export for all matches
3. Duplicate check prevents collision (idempotent)

**Invariant:** No duplicate vault files

#### Crash 3: After Temp File Write, Before Rename

**State:**

- captures row: `status='transcribed'`
- Temp file exists: `inbox/.tmp-<ulid>.md`
- No final vault file
- No exports_audit row

**Recovery:**

1. Query `WHERE status='transcribed'`
2. Detect orphaned temp file (> 5 min old)
3. Delete temp file (cleanup)
4. Retry export (idempotent write)

**Invariant:** No orphaned temp files persist

#### Crash 4: After Export, Before Audit Insert

**State:**

- captures row: `status='transcribed'` (not yet updated)
- Vault file exists: `inbox/<ulid>.md`
- No exports_audit row

**Recovery:**

1. Query `WHERE status='transcribed'`
2. Check if vault file exists
3. If exists: Insert audit retroactively, update status
4. If not exists: Retry export (idempotent)

**Invariant:** Audit trail eventually consistent

#### Crash 5: After Audit Insert, Before Status Update

**State:**

- captures row: `status='transcribed'` (not yet updated)
- Vault file exists
- exports_audit row exists

**Recovery:**

1. Query `WHERE status='transcribed'`
2. Cross-check exports_audit for matching capture_id
3. If audit exists: Update status to 'exported' (fix orphaned state)
4. If not: Resume export (already handled by Crash 4)

**Invariant:** No orphaned 'transcribed' rows with audit

### 9.2 Corruption Scenarios

#### Corruption 1: SQLite Database File Damaged

**Detection:**

- `PRAGMA integrity_check;` fails
- Application startup error

**Recovery:**

1. Restore from latest hourly backup
2. Replay captures since backup (if logs available)
3. Manual inspection of missing captures (error log)

**Prevention:** Hourly backups with verification

#### Corruption 2: Vault File Partially Written

**Detection:**

- Vault file exists but incomplete (no frontmatter end)
- Size mismatch (expected vs actual)

**Recovery:**

1. Query exports_audit for capture_id
2. Query captures for raw_content
3. Re-export (overwrite corrupt file)

**Prevention:** Atomic write (temp + rename + parent fsync)

### 9.3 Data Integrity Invariants

These invariants MUST hold at all times:

| #   | Invariant                    | Enforcement               | Recovery                        |
| --- | ---------------------------- | ------------------------- | ------------------------------- |
| 1   | No orphan audit rows         | FOREIGN KEY constraint    | Prevent at insert time          |
| 2   | Terminal states immutable    | Business logic validation | None (prevent transition)       |
| 3   | Hash mutates at most once    | Business logic validation | Reject re-transcription         |
| 4   | (channel, native_id) unique  | UNIQUE INDEX              | Constraint violation error      |
| 5   | Vault filename == capture.id | Convention + validation   | Re-export with correct ULID     |
| 6   | Backup before pruning        | Process ordering          | Escalation policy (pause prune) |

---

## 10. Decisions & Trade-offs

### 10.1 Architectural Decisions (Locked)

**Decision 1: 4-Table Hard Cap**

- **Why:** Prevent scope creep, staging is not a knowledge base
- **Trade-off:** May require creative schema-less JSON for future needs
- **Override:** Requires ADR approval

**Decision 2: Status-Driven State Machine**

- **Why:** Explicit state prevents invalid transitions, aids debugging
- **Trade-off:** More complex than boolean flags, requires validation
- **Alternative Considered:** Boolean columns (is_staged, is_exported) - rejected (implicit states error-prone)

**Decision 3: Late Hash Binding (Voice)**

- **Why:** Stage immediately (< 100ms), hash after transcription
- **Trade-off:** Duplicate detection delayed until transcription completes
- **Alternative Considered:** Block insert until transcription - rejected (kills burst capture UX)

**Decision 4: WAL Mode with NORMAL Synchronous**

- **Why:** Balance crash safety with performance
- **Trade-off:** Small window of data loss (< 1s) on OS crash
- **Alternative Considered:** FULL sync - rejected (too slow for burst capture)

**Decision 5: Sequential Processing**

- **Why:** Simplifies crash recovery, avoids lock contention
- **Trade-off:** Slower processing for high-volume bursts
- **Trigger to Revisit:** Backlog depth > 20 sustained 30m

### 10.2 YAGNI Boundaries

**Not Building (Explicit Deferrals):**

- ❌ Full-text search (FTS5) in staging ledger
- ❌ Embeddings or vector storage
- ❌ Knowledge graph relationships
- ❌ Real-time replication
- ❌ Query optimization (composite indexes beyond minimal set)
- ❌ Partial indexes (not needed yet)
- ❌ Concurrent transcription (sequential sufficient)

**Triggers to Revisit:**

| Feature                  | Trigger Condition                                         |
| ------------------------ | --------------------------------------------------------- |
| Composite indexes        | p95 query > 11s traced to index scan                      |
| Concurrent transcription | Backlog depth > 20 for > 30m                              |
| BLAKE3 dual-hash         | > 200 daily captures OR false duplicate incident          |
| FTS5 indexes             | User explicitly requests ledger search (not vault search) |

---

## 11. Observability Architecture

### 11.1 Metrics Collection

**Storage:** Local NDJSON (`./.metrics/YYYY-MM-DD.ndjson`)

**Activation:** `CAPTURE_METRICS=1` environment variable

**Privacy:** Local-only, no external transmission

**Core Metrics:**

```typescript
interface StagingMetrics {
  // Performance
  capture_staging_ms: number // Insert latency
  dedup_check_ms: number // Hash query latency
  recovery_query_ms: number // Startup recovery time
  backup_duration_ms: number // Hourly backup latency

  // Throughput
  captures_inserted_total: number // Counter
  captures_exported_total: number // Counter
  dedup_hits_total: number // Counter by layer

  // Queue Health
  transcription_queue_depth: number // Gauge (staged count)
  export_queue_depth: number // Gauge (transcribed count)

  // Failures
  export_failures_total: number // Counter
  transcription_failures_total: number // Counter
  placeholder_export_ratio: number // Daily aggregation

  // Backup
  backup_verification_result: string // "success" | "failure"
  backup_size_bytes: number // Gauge
}
```

### 11.2 Health Check Architecture

**Health Command:** `capture doctor`

**Checks Performed:**

1. **Database Connectivity:**
   - Open connection to SQLite
   - Verify schema version
   - Check foreign keys enabled

2. **Queue Depth:**
   - Count `status IN ('staged', 'transcribed', 'failed_transcription')`
   - Warn if > 10 pending

3. **Error Summary:**
   - Query errors_log WHERE created_at > NOW() - 24h
   - Group by stage
   - Display counts

4. **Backup Status:**
   - Query last backup timestamp
   - Verify backup file exists
   - Check last verification result

5. **Placeholder Ratio:**
   - Count exported_placeholder / total exports (last 7 days)
   - Warn if > 5%

6. **Storage Size:**
   - Query database file size
   - Warn if > 100MB
   - Error if > 500MB

**Output Format:**

```text
✓ SQLite connection: OK
✓ Foreign keys: Enabled
✓ Schema version: 1
✓ Last backup: 15 minutes ago (verified)
⚠ Errors (24h): 2 transcription failures
✓ Queue depth: 0 pending
✓ Placeholder ratio: 2% (target < 5%)
✓ Database size: 45 MB
```

---

## 12. Evolution & Scalability

### 12.1 Growth Assumptions

**MPPP Scope:**

- 10-50 captures per day
- < 10k total captures in first 6 months
- < 100MB database size
- Single user, single device

**Phase 3+ Assumptions:**

- 50-200 captures per day (ADHD power user)
- 10k-100k total captures (1-2 years)
- 100MB-500MB database size
- Still single user (no multi-device sync)

### 12.2 Scaling Triggers

| Metric             | Threshold      | Action                                           |
| ------------------ | -------------- | ------------------------------------------------ |
| Database size      | > 500MB        | Evaluate aggressive pruning or partitioning      |
| p95 insert latency | > 100ms        | Profile and optimize (index overhead?)           |
| Queue depth        | > 20 sustained | Consider concurrent transcription (ADR required) |
| Backup duration    | > 30s          | Evaluate incremental backup or compression       |
| False duplicate    | 1 incident     | Evaluate BLAKE3 dual-hash per ADR-0002           |

### 12.3 Schema Evolution

**Migration Strategy:**

- Append-only numbered migrations: `/migrations/0001_init.sql`
- Schema version stored in `sync_state` table: `('schema_version', '1')`
- No destructive changes without ADR approval
- Backward compatibility required for 1 major version

**Future Schema Changes:**

1. **BLAKE3 Dual-Hash (ADR-0002):**
   - Add `content_hash_blake3` column (nullable)
   - Backfill existing rows (batch job)
   - Switch dedup logic to prefer BLAKE3

2. **Composite Indexes (if needed):**
   - Add `(status, content_hash)` composite if p95 > 11s
   - Profile before adding (measure insert regression)

3. **Partial Indexes (if needed):**
   - Index only non-terminal statuses: `WHERE status NOT LIKE 'exported%'`
   - Reduces index size, improves write performance

---

## 13. Related Specifications

### Upstream Dependencies

| Document                                             | Relationship                |
| ---------------------------------------------------- | --------------------------- |
| [Master PRD v2.3.0-MPPP](../../master/prd-master.md) | Parent specification (§4.2) |
| [Roadmap v2.0.0-MPPP](../../master/roadmap.md)       | Phase 1-2 scope             |
| [Staging Ledger PRD v1.0.0-MPPP](./prd-staging.md)   | Requirements source         |

### Downstream Specifications

| Document                                           | Relationship                          |
| -------------------------------------------------- | ------------------------------------- |
| [Staging Ledger Tech Spec](./spec-staging-tech.md) | Implementation details (SQLite, APIs) |
| [Staging Ledger Test Spec](./spec-staging-test.md) | Test strategy and coverage            |

### Cross-Cutting

| Document                                                                                     | Relationship                       |
| -------------------------------------------------------------------------------------------- | ---------------------------------- |
| [TDD Applicability Guide](../../guides/guide-tdd-applicability.md)                           | Risk classification framework      |
| [ADR-0001: Voice File Sovereignty](../../adr/0001-voice-file-sovereignty.md)                 | Never move voice files             |
| [ADR-0002: Dual Hash Migration](../../adr/0002-dual-hash-migration.md)                       | SHA-256 → BLAKE3 path (superseded) |
| [ADR-0003: Four-Table Hard Cap](../../adr/0003-four-table-hard-cap.md)                       | Schema boundary enforcement        |
| [ADR-0004: Status-Driven State Machine](../../adr/0004-status-driven-state-machine.md)       | Capture lifecycle management       |
| [ADR-0005: WAL Mode Normal Sync](../../adr/0005-wal-mode-normal-sync.md)                     | SQLite durability configuration    |
| [ADR-0006: Late Hash Binding Voice](../../adr/0006-late-hash-binding-voice.md)               | Voice processing strategy          |
| [ADR-0007: 90-Day Retention Exported Only](../../adr/0007-90-day-retention-exported-only.md) | Data cleanup policy                |
| [ADR-0008: Sequential Processing MPPP](../../adr/0008-sequential-processing-mppp.md)         | Processing concurrency model       |

---

## 14. Open Questions

### Resolved

- ✅ **4-table cap:** Confirmed, no additional tables without ADR
- ✅ **Status state machine:** Confirmed, immutable terminal states
- ✅ **Late hash binding:** Confirmed for voice, immediate for email
- ✅ **WAL mode:** Confirmed with NORMAL sync

### Remaining

1. **Migration numbering:** Append-only numbered vs dated migrations?
   - **Recommendation:** `/migrations/0001_init.sql` pattern
   - **Decision Point:** First schema change (Phase 2+)

2. **Backup compression:** Gzip backups to save disk space?
   - **Current:** Uncompressed (24 × 100MB = 2.4GB)
   - **Trigger:** Disk space < 10GB available

3. **Concurrent transcription:** When to allow parallel Whisper jobs?
   - **Current:** Sequential only
   - **Trigger:** Backlog depth > 20 sustained 30m

---

## 15. Nerdy Joke Corner

The staging ledger is like a ADHD thought's DMV—everyone gets a number (ULID), waits in line (status='staged'), and eventually gets processed. Except here, the process actually works, there's no weird photo, and you can crash your car (app) without losing your place in line. Also SQLite is smaller than your browser's cookie cache, which is comforting when building a second brain. 🚗📝

---

## Document Version

**Version:** 0.1.0
**Status:** Draft - Ready for Review
**Last Updated:** 2025-09-27

### Alignment Checklist

- [x] Aligned with Master PRD v2.3.0-MPPP
- [x] Aligned with Roadmap v2.0.0-MPPP Phase 1
- [x] Aligned with Staging Ledger PRD v1.0.0-MPPP
- [x] 4-table hard cap enforced
- [x] State machine defined with immutable terminals
- [x] Integration points documented
- [x] Performance targets specified
- [x] Crash recovery architecture complete
- [x] Deduplication strategy detailed
- [x] YAGNI boundaries clear
- [x] Nerdy joke included

### Next Steps

1. Review with architecture team
2. Create [Staging Ledger Tech Spec](./spec-staging-tech.md)
3. Create [Staging Ledger Test Spec](./spec-staging-test.md)
4. Begin Phase 1 implementation

---

**End of Architecture Specification**
