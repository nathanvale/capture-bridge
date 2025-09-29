---
title: Obsidian Bridge Architecture Specification
status: draft
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-27
spec_type: architecture
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Obsidian Bridge — Architecture Specification

## Executive Summary

The **Obsidian Bridge** is the atomic write layer between the Staging Ledger and Obsidian vault. It ensures zero partial writes, zero vault corruption, and deterministic ULID-based filenames through temp-then-rename semantics. This architecture specification defines system placement, component boundaries, failure modes, and evolution paths for the atomic writer contract.

**Key Architectural Principle:** The bridge is a **thin, stateless adapter** between SQLite durability and filesystem atomicity—it writes once, writes correctly, or writes nothing at all.

### Alignment

- **Master PRD:** v2.3.0-MPPP, Section 4.3 (Obsidian Export)
- **Feature PRD:** prd-obsidian.md v1.0.0-MPPP
- **Tech Spec:** spec-obsidian-tech.md v1.0.0-MPPP
- **Test Spec:** spec-obsidian-test.md v1.0.0-MPPP

---

## 1. System Placement & Context

### 1.1 Architectural Position

The Obsidian Bridge sits between the **Staging Ledger** (SQLite durability layer) and the **Obsidian Vault** (canonical markdown storage):

```text
┌─────────────────────────────────────────────────────────────┐
│                    Capture Layer                            │
│  ┌──────────────┐              ┌──────────────┐            │
│  │ Voice Polling│              │ Email Polling│            │
│  │ (icloudctl)  │              │ (Gmail API)  │            │
│  └──────┬───────┘              └──────┬───────┘            │
│         │                             │                     │
│         └─────────────┬───────────────┘                     │
│                       ▼                                     │
│         ┌─────────────────────────────┐                    │
│         │   Staging Ledger (SQLite)   │                    │
│         │  • captures table           │                    │
│         │  • exports_audit table      │                    │
│         │  • Content hash dedup       │                    │
│         │  • Status tracking          │                    │
│         └─────────────┬───────────────┘                    │
│                       │                                     │
│                       ▼                                     │
│         ┌─────────────────────────────┐                    │
│         │   OBSIDIAN BRIDGE (THIS)    │ ◄── Stateless      │
│         │  • AtomicWriter contract    │                    │
│         │  • Temp-then-rename logic   │                    │
│         │  • ULID filename mapping    │                    │
│         │  • Export audit logging     │                    │
│         └─────────────┬───────────────┘                    │
│                       │                                     │
│                       ▼                                     │
│         ┌─────────────────────────────┐                    │
│         │   Obsidian Vault (APFS)     │                    │
│         │  • inbox/{ULID}.md files    │                    │
│         │  • .trash/ temp directory   │                    │
│         │  • Canonical knowledge      │                    │
│         └─────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Architectural Role

**What the Bridge IS:**

- **Atomic writer:** Guarantees all-or-nothing writes via POSIX rename semantics
- **Filename mapper:** Converts ULID capture IDs to deterministic markdown filenames
- **Sync-safe gateway:** Ensures Obsidian Sync/iCloud never sees partial writes
- **Audit trail recorder:** Logs every export attempt to `exports_audit` table

**What the Bridge IS NOT:**

- ❌ **Content transformer:** No markdown formatting (upstream responsibility)
- ❌ **Classification engine:** No PARA filing decisions (Phase 3+ feature)
- ❌ **State manager:** No retry logic in Phase 1 (see [Resilience Guide](../../guides/guide-resilience-patterns.md) for Phase 2+)
- ❌ **Validation layer:** Assumes well-formed input from Staging Ledger

### 1.3 Component Boundaries

**Strict Input Contract:**

```typescript
interface AtomicWriteInput {
  capture_id: string // ULID from captures.id (validated upstream)
  content: string // Formatted markdown with frontmatter
  vault_path: string // Absolute path to Obsidian vault root
}
```

**Strict Output Contract:**

```typescript
interface AtomicWriteResult {
  success: boolean
  export_path?: string // Relative path within vault (e.g., "inbox/01HZ.md")
  error?: AtomicWriteError
}
```

**Upstream Dependencies:**

- **Staging Ledger:** Provides ULID, formatted content, content_hash
- **Capture Layer:** Guarantees content is transcribed/normalized before export

**Downstream Dependencies:**

- **Filesystem:** POSIX-compliant atomic rename (APFS/ext4)
- **Obsidian Vault:** Writable `.trash/` and `inbox/` directories

---

## 2. Component Architecture

### 2.1 Core Components

```text
┌───────────────────────────────────────────────────────────┐
│              Obsidian Bridge Package                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │         AtomicWriter (Core Contract)                │ │
│  │  • writeAtomic(capture_id, content, vault_path)    │ │
│  │  • Orchestrates full write sequence                │ │
│  │  • Handles error recovery and cleanup              │ │
│  └────────────────────┬────────────────────────────────┘ │
│                       │                                   │
│         ┌─────────────┼─────────────┐                     │
│         │             │             │                     │
│         ▼             ▼             ▼                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │  Path    │  │ Collision│  │ Atomic   │               │
│  │ Resolver │  │ Detector │  │ Writer   │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│         │             │             │                     │
│         └─────────────┼─────────────┘                     │
│                       │                                   │
│                       ▼                                   │
│  ┌─────────────────────────────────────────────────────┐ │
│  │         Audit Logger (SQLite Interface)             │ │
│  │  • recordExportSuccess(capture_id, path)           │ │
│  │  • recordExportDuplicate(capture_id, path)         │ │
│  │  • recordExportFailure(capture_id, error)          │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

#### AtomicWriter (Orchestrator)

**Purpose:** Coordinate atomic write sequence with error recovery

**Responsibilities:**

- Validate input parameters (capture_id format, vault_path existence)
- Ensure `.trash/` and `inbox/` directories exist (idempotent creation)
- Orchestrate Path Resolver → Collision Detector → Atomic Writer → Audit Logger
- Handle error cleanup (temp file removal)
- Return structured result with success/error details

**Key Invariant:** Never expose partially written files to Obsidian

#### Path Resolver

**Purpose:** Map ULID capture IDs to filesystem paths

**Responsibilities:**

- Generate temp path: `{vault_path}/.trash/{capture_id}.tmp`
- Generate export path: `{vault_path}/inbox/{capture_id}.md`
- Validate capture_id format (26-char ULID regex)
- Prevent path traversal attacks

**Key Invariant:** Paths always on same filesystem (required for atomic rename)

#### Collision Detector

**Purpose:** Detect ULID filename collisions before write

**Responsibilities:**

- Check if export path already exists
- If exists, read file and compare content_hash
- Return collision result: NO_COLLISION | DUPLICATE | CONFLICT

**Key Invariant:** CONFLICT result (same ULID, different content) is CRITICAL ERROR

#### Atomic Writer (Low-Level)

**Purpose:** Perform atomic filesystem write with durability guarantees

**Responsibilities:**

- Write content to temp file in `.trash/`
- Call fsync to flush OS cache to disk
- Perform atomic rename from temp to export path
- Clean up temp file on any failure

**Key Invariant:** fsync MUST complete before rename

#### Audit Logger

**Purpose:** Record export events in `exports_audit` table

**Responsibilities:**

- Insert success records with export_path and timestamp
- Insert duplicate records with notes
- Link to capture via foreign key
- Never fail silently (log errors to `errors_log`)

**Key Invariant:** Every successful export has exactly one audit record

### 2.3 Data Flow Sequence

**Normal Success Path:**

```text
1. AtomicWriter.writeAtomic(capture_id, content, vault_path)
   │
   ├─► Path Resolver
   │   ├─► temp_path = ".trash/{capture_id}.tmp"
   │   └─► export_path = "inbox/{capture_id}.md"
   │
   ├─► Collision Detector
   │   ├─► Check export_path exists
   │   ├─► If NO_COLLISION → continue
   │   ├─► If DUPLICATE → skip write, record duplicate, return success
   │   └─► If CONFLICT → HALT, log CRITICAL, return error
   │
   ├─► Atomic Writer (Low-Level)
   │   ├─► fs.writeFile(temp_path, content)
   │   ├─► fs.fsync(temp_fd)  ◄── CRITICAL: durability guarantee
   │   └─► fs.rename(temp_path, export_path)  ◄── Atomic operation
   │
   ├─► Audit Logger
   │   └─► INSERT INTO exports_audit (capture_id, vault_path, ...)
   │
   └─► Return { success: true, export_path }
```

**Error Recovery Path:**

```text
1. AtomicWriter.writeAtomic(...) encounters error
   │
   ├─► Error Classification
   │   ├─► EACCES → Permission denied (retry per [File System Pattern](../../guides/guide-resilience-patterns.md#file-system-operations))
   │   ├─► ENOSPC → Disk full (halt per [Error Classification](../../guides/guide-resilience-patterns.md#error-classification))
   │   ├─► EEXIST → Collision after rename (check duplicate)
   │   ├─► EROFS → Read-only FS (halt per guide)
   │   ├─► ENETDOWN → Network mount (retry per [Network Pattern](../../guides/guide-resilience-patterns.md#network-errors))
   │   └─► EUNKNOWN → Log and fail
   │
   ├─► Cleanup Temp File
   │   └─► fs.unlink(temp_path) (idempotent, ignore ENOENT)
   │
   ├─► Log Error
   │   └─► INSERT INTO errors_log (capture_id, stage='export', ...)
   │
   └─► Return { success: false, error: { code, message } }
```

---

## 3. Dependencies & Contracts

### 3.1 Upstream Contracts (Staging Ledger)

**Required Input from Staging Ledger:**

```sql
-- Staging Ledger provides:
SELECT
  id AS capture_id,           -- ULID (26 chars, time-ordered)
  content_hash,               -- SHA-256 hex (64 chars)
  -- Content must be formatted markdown (frontmatter + body)
  -- Transcription must be complete (status != 'staged')
FROM captures
WHERE status IN ('transcribed', 'failed_transcription')
  AND id NOT IN (SELECT capture_id FROM exports_audit WHERE error_flag = 0);
```

**Guarantees Staging Ledger Must Provide:**

1. **Valid ULID:** Matches regex `^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$`
2. **Formatted Content:** Markdown with YAML frontmatter
3. **Content Hash Available:** SHA-256 computed and stored
4. **Foreign Key Integrity:** Capture exists before export attempt

**What Staging Ledger Does NOT Guarantee:**

- ❌ Vault path validity (Bridge must validate)
- ❌ Disk space availability (Bridge must handle ENOSPC)
- ❌ Write permissions (Bridge must handle EACCES)

### 3.2 Downstream Contracts (Filesystem)

**Required Filesystem Capabilities:**

1. **POSIX Atomic Rename:** `rename(2)` must be atomic on same filesystem
2. **fsync Durability:** `fsync(2)` must flush data to persistent storage
3. **Directory Writable:** `.trash/` and `inbox/` must be writable
4. **Same Filesystem:** Temp and export paths must be on same mount

**Supported Filesystems:**

| Filesystem         | Atomic Rename   | fsync Support | Status                |
| ------------------ | --------------- | ------------- | --------------------- |
| **APFS** (macOS)   | ✅ Yes          | ✅ Yes        | Primary target        |
| **ext4** (Linux)   | ✅ Yes          | ✅ Yes        | Supported             |
| **btrfs** (Linux)  | ✅ Yes          | ✅ Yes        | Supported             |
| **NTFS** (Windows) | ⚠️ Partial      | ⚠️ Partial    | Not supported (MPPP)  |
| **Network mounts** | ❌ No guarantee | ❌ Unreliable | Error path (ENETDOWN) |

### 3.3 SQLite Audit Contract

**Exported Audit Schema (from Staging Ledger):**

```sql
CREATE TABLE exports_audit (
    id TEXT PRIMARY KEY,
    capture_id TEXT NOT NULL,
    vault_path TEXT NOT NULL,       -- Format: "inbox/{ULID}.md"
    hash_at_export TEXT,            -- Content hash at time of export
    exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    mode TEXT,                      -- 'initial' | 'duplicate_skip'
    error_flag INTEGER DEFAULT 0,
    FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
);
```

**Bridge Audit Operations:**

```typescript
// Success case
await db.run(
  `
  INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
  VALUES (?, ?, ?, ?, 'initial')
`,
  [ulid(), capture_id, "inbox/${capture_id}.md", content_hash]
)

// Duplicate skip case
await db.run(
  `
  INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
  VALUES (?, ?, ?, ?, 'duplicate_skip')
`,
  [ulid(), capture_id, "inbox/${capture_id}.md", content_hash]
)

// Failure case (no audit record, use errors_log instead)
await db.run(
  `
  INSERT INTO errors_log (id, capture_id, stage, message)
  VALUES (?, ?, 'export', ?)
`,
  [ulid(), capture_id, error.message]
)
```

---

## 4. Failure Modes & Containment

### 4.1 Failure Classification

**P0 Failures (Data Loss Risk):**

| Failure              | Trigger                            | Containment                          | Recovery                                                                                 |
| -------------------- | ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Partial Write**    | Process crash mid-write            | Temp file in `.trash/` discarded     | Recovery per [Resilience Guide](../../guides/guide-resilience-patterns.md#atomic-writes) |
| **fsync Skip**       | Bug omits fsync call               | Potential data loss on power failure | TDD Required: fsync call verification                                                    |
| **ULID Collision**   | Same ULID, different content       | Halt export, log CRITICAL            | Manual investigation required                                                            |
| **Vault Corruption** | Concurrent writes, race conditions | Atomic rename prevents               | No recovery needed (design prevents)                                                     |

**P1 Failures (Operational Degradation):**

| Failure                 | Trigger                      | Containment                                                                                  | Recovery                                       |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **ENOSPC** (Disk Full)  | Vault disk full during write | Halt export worker                                                                           | Alert via `doctor` command, user frees space   |
| **EACCES** (Permission) | Vault directory not writable | Retry per [File System Pattern](../../guides/guide-resilience-patterns.md#permission-errors) | Alert via `doctor` command                     |
| **EROFS** (Read-Only)   | Vault on read-only mount     | Halt export worker                                                                           | Alert via `doctor` command, remount read-write |
| **ENETDOWN** (Network)  | Network mount disconnected   | Retry per [Network Pattern](../../guides/guide-resilience-patterns.md#network-mounts)        | Auto-recover when restored                     |

**P2 Failures (Logging Only):**

| Failure                | Trigger                    | Containment                                                                                 | Recovery                   |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| **Duplicate Export**   | Retry with same capture_id | Skip write per [Idempotency Pattern](../../guides/guide-resilience-patterns.md#idempotency) | No action needed           |
| **Temp File Orphaned** | Crash before cleanup       | File remains in `.trash/`                                                                   | `doctor --cleanup` removes |

### 4.2 Containment Strategies

#### 4.2.1 Atomic All-or-Nothing Contract

**Guarantee:** Export path either contains complete file OR does not exist

**Implementation:**

1. Write to temp file in `.trash/` (invisible to Obsidian)
2. Call fsync to ensure content on disk
3. Atomic rename to `inbox/` (POSIX guarantees atomicity)
4. If any step fails, temp file deleted, export path never created

**Verification in Tests:**

```typescript
// Test: Crash during write → no partial file in inbox
it("should not create partial files on crash", async () => {
  const crashDuringWrite = vi.fn().mockRejectedValue(new Error("CRASH"))

  const result = await atomicWriter.writeAtomic("ULID123", "content", "/vault")

  expect(result.success).toBe(false)
  expect(fs.existsSync("/vault/inbox/ULID123.md")).toBe(false) // ✅ No partial file
  expect(fs.existsSync("/vault/.trash/ULID123.tmp")).toBe(false) // ✅ Temp cleaned
})
```

#### 4.2.2 Idempotency via Content Hash

**Guarantee:** Same capture_id + content_hash → same export path, no duplicates

**Implementation:**

1. Before write, check if export path exists
2. If exists, read file and compute SHA-256 hash
3. Compare with input content_hash
4. If match → return success, record duplicate in audit
5. If mismatch → CRITICAL ERROR (ULID collision)

**Collision Handling:**

```typescript
enum CollisionResult {
  NO_COLLISION,
  DUPLICATE,
  CONFLICT,
}

async function checkCollision(
  export_path: string,
  content_hash: string
): Promise<CollisionResult> {
  if (!fs.existsSync(export_path)) {
    return CollisionResult.NO_COLLISION
  }

  const existing_content = await fs.readFile(export_path, "utf-8")
  const existing_hash = computeSHA256(existing_content)

  if (existing_hash === content_hash) {
    return CollisionResult.DUPLICATE // Safe to skip write
  } else {
    return CollisionResult.CONFLICT // CRITICAL: same ULID, different content
  }
}
```

#### 4.2.3 Error Boundary Isolation

**Design Principle:** Export failure must not corrupt Staging Ledger or Vault

**Isolation Mechanisms:**

1. **SQLite Transaction Safety:** Audit log writes in separate transaction
2. **Filesystem Safety:** Temp files never visible to Obsidian Sync
3. **Error Propagation:** Errors returned as structured results, never thrown
4. **Cleanup Guarantee:** Temp files always cleaned up (even on error)

**Error Boundary Example:**

```typescript
async function writeAtomic(
  capture_id: string,
  content: string,
  vault_path: string
): Promise<AtomicWriteResult> {
  let temp_path: string | undefined

  try {
    // Phase 1: Path resolution (cheap, no side effects)
    temp_path = resolveTempPath(vault_path, capture_id)
    const export_path = resolveExportPath(vault_path, capture_id)

    // Phase 2: Collision detection (read-only)
    const collision = await checkCollision(export_path, content_hash)
    if (collision === CollisionResult.CONFLICT) {
      // CRITICAL: Don't attempt write, log and fail
      await logCriticalError("ULID collision", { capture_id, export_path })
      return { success: false, error: { code: "EEXIST", message: "Collision" } }
    }
    if (collision === CollisionResult.DUPLICATE) {
      // Idempotent: Skip write, record duplicate
      await recordAuditDuplicate(capture_id, export_path)
      return { success: true, export_path }
    }

    // Phase 3: Atomic write (side effects contained)
    await writeAtomicWithFsync(temp_path, export_path, content)
    await recordAuditSuccess(capture_id, export_path)

    return { success: true, export_path }
  } catch (error) {
    // Error boundary: Cleanup and return structured error
    if (temp_path) {
      await cleanupTempFile(temp_path) // Idempotent
    }
    return handleWriteError(error, { capture_id, temp_path, export_path })
  }
}
```

### 4.3 Fault Injection Points (Phase 2 Testing)

**Test Hooks for Crash Simulation:**

```typescript
interface FaultInjectionHooks {
  beforeWrite?: () => Promise<void> // Crash before temp write
  afterWrite?: () => Promise<void> // Crash after write, before fsync
  afterFsync?: () => Promise<void> // Crash after fsync, before rename
  afterRename?: () => Promise<void> // Crash after rename, before audit
}

// Phase 2: Enable deterministic crash testing
const atomicWriter = new ObsidianAtomicWriter(vault_path, {
  faultHooks: {
    afterWrite: () => {
      throw new Error("SIMULATED_CRASH")
    },
  },
})
```

---

## 5. Performance Characteristics

### 5.1 Latency Budget

**Target:** < 50ms p95 for 1KB markdown file

**Breakdown:**

| Operation           | Target     | Justification                        |
| ------------------- | ---------- | ------------------------------------ |
| Path resolution     | < 1ms      | String concatenation only            |
| Collision detection | < 5ms      | Single fs.existsSync + optional read |
| Temp file write     | < 10ms     | Sequential write, no buffering       |
| **fsync call**      | < 15ms     | **Critical:** Flush OS cache to disk |
| Atomic rename       | < 5ms      | POSIX syscall, atomic on same FS     |
| Audit log write     | < 10ms     | Single SQLite INSERT                 |
| **Total**           | **< 46ms** | 4ms buffer for variability           |

### 5.2 Throughput Constraints

**MPPP Scope:** Sequential exports only (no concurrency)

**Design Rationale:**

- MPPP exports are synchronous (no outbox queue)
- Sequential processing simplifies error recovery
- Single-threaded avoids filesystem lock contention

**Phase 2+ Concurrency Triggers:**

- Daily capture volume > 200
- Export backlog depth > 20 for > 30 minutes
- p95 export latency > 100ms

### 5.3 Disk I/O Profile

**Write Amplification:**

- **Temp write:** 1x file size (`.trash/{ULID}.tmp`)
- **Rename:** 0x (metadata-only operation)
- **Total:** 1x write amplification (optimal)

**Read Operations:**

- **Collision detection:** 1x read if file exists (rare)
- **Normal case:** 0x reads (file doesn't exist)

**Disk Space Requirements:**

- **Temp file:** Held for < 50ms (transient)
- **Export file:** Permanent in vault
- **No duplication:** Temp file removed after rename

---

## 6. Evolution & Future Considerations

### 6.1 Extension Points

**Phase 2: Error Recovery Enhancements**

- **Retry logic:** Implement patterns from [Resilience Guide](../../guides/guide-resilience-patterns.md#file-system-operations)
- **Health monitoring:** Integrate with `doctor` command
- **Metrics collection:** Export latency, collision rate

**Phase 3: PARA Classification**

- **Export path override:** Support dynamic target folders
- **Template-based filenames:** Optional custom naming schemes
- **Conflict resolution:** Sibling file creation on collision

**Phase 5: Advanced Features**

- **Multi-vault support:** Multiple export destinations
- **Daily note integration:** Append to existing notes
- **Template expansion:** Dynamic frontmatter generation

### 6.2 Stability Triggers

**When to Revisit Architecture:**

1. **Collision detected in production:** ULID collision with different content
   - Action: Investigate ULID generator, consider BLAKE3 upgrade
2. **Export failure rate > 5%:** Persistent write errors
   - Action: Add retry logic per [Resilience Guide](../../guides/guide-resilience-patterns.md), health monitoring
3. **p95 latency > 100ms:** Performance degradation
   - Action: Profile fsync behavior, optimize audit logging
4. **Concurrency requirement:** Outbox pattern introduced
   - Action: Add filesystem locking, worker pool

### 6.3 Architectural Constraints (Locked Decisions)

**Will NOT Change (MPPP Scope):**

1. **ULID = Filename:** No separate filename generation logic
2. **Inbox-Only:** All exports go to `inbox/` (no classification)
3. **Temp in `.trash/`:** Leverages Obsidian's ignore behavior
4. **Single Vault:** No multi-vault support
5. **Atomic Rename Only:** No conflict resolution beyond atomicity

**May Change (Phase 2+):**

1. **Export path pattern:** Could support dynamic folders
2. **Audit schema:** May add fields per [Resilience Guide](../../guides/guide-resilience-patterns.md#audit-patterns)
3. **Concurrency model:** May introduce worker pool
4. **Hash algorithm:** May upgrade SHA-256 → BLAKE3

---

## 7. Testing Strategy (Architecture Level)

### 7.1 Component Testing

**Unit Test Coverage (Per Component):**

- **Path Resolver:** ULID validation, path traversal prevention
- **Collision Detector:** NO_COLLISION, DUPLICATE, CONFLICT paths
- **Atomic Writer:** fsync call, rename atomicity, temp cleanup
- **Audit Logger:** Foreign key enforcement, duplicate handling

### 7.2 Integration Testing

**End-to-End Scenarios:**

1. **Happy Path:** New capture → atomic write → audit logged
2. **Duplicate Path:** Retry handling per [Idempotency Pattern](../../guides/guide-resilience-patterns.md#idempotency)
3. **Collision Path:** ULID collision → CRITICAL error, no write
4. **Crash Recovery:** Kill process mid-write → no partial file, temp cleaned

### 7.3 Contract Testing

**Upstream Contract (Staging Ledger):**

- Validate ULID format from `captures.id`
- Verify formatted markdown input
- Test foreign key cascade deletes

**Downstream Contract (Filesystem):**

- Mock EACCES, ENOSPC, EROFS, ENETDOWN errors
- Verify fsync called before rename
- Confirm atomic rename behavior

**Audit Contract (SQLite):**

- Verify every export logged in `exports_audit`
- Test duplicate detection via `mode` column
- Validate foreign key constraints

---

## 8. Related Documents

- **PRD:** `prd-obsidian.md` (v1.0.0-MPPP) - Product requirements
- **Tech Spec:** `spec-obsidian-tech.md` (v1.0.0-MPPP) - Implementation details
- **Test Spec:** `spec-obsidian-test.md` (v1.0.0-MPPP) - Test strategy
- **Usage Guide:** `../../guides/guide-obsidian-bridge-usage.md` - Developer quick-start and troubleshooting
- **Master PRD:** `../../master/prd-master.md` (v2.3.0-MPPP) - System context
- **Staging Ledger PRD:** `../staging-ledger/prd-staging.md` - Audit table contract
- **TDD Guide:** `../../guides/tdd-applicability.md` - Risk assessment framework

**Related ADRs:**

- [ADR 0009: Atomic Write via Temp-Then-Rename Pattern](../../adr/0009-atomic-write-temp-rename-pattern.md) - Architectural rationale for atomicity guarantees
- [ADR 0010: ULID-Based Deterministic Filenames](../../adr/0010-ulid-deterministic-filenames.md) - Filename strategy and collision handling
- [ADR 0011: Inbox-Only Export Pattern](../../adr/0011-inbox-only-export-pattern.md) - Export path architecture decision

---

## 9. Open Questions & Decisions

### Resolved Decisions

✅ **Temp directory location:** `.trash/` (Obsidian ignores, same FS as inbox/)
✅ **Filename strategy:** ULID only (no timestamp prefix, no custom templates)
✅ **Collision policy:** Duplicate skip (same hash) vs. CRITICAL halt (different hash)
✅ **Audit granularity:** One record per export attempt (success or duplicate)
✅ **Error recovery:** Cleanup per [Recovery Pattern](../../guides/guide-resilience-patterns.md#cleanup-strategies)

### Remaining Questions (Phase 2+)

1. **Retry Strategy:** Parameters defined in [Resilience Guide](../../guides/guide-resilience-patterns.md#retry-parameters)
2. **Health Command Integration:** Which export metrics should `doctor` surface?
3. **Metrics Schema:** Which fields in NDJSON metrics logs? Sampling rate?
4. **Multi-Vault:** How to configure multiple export destinations if needed?

---

## 10. Revision History

- **v1.0.0-MPPP** (2025-09-27): Full architecture specification for Phase 1
  - System placement and data flow diagrams
  - Component responsibilities and boundaries
  - Upstream/downstream contracts
  - Failure mode taxonomy and containment strategies
  - Performance characteristics and evolution triggers
  - Test strategy alignment with TDD guide

---

## Appendix: The Nerdy Joke

The Obsidian Bridge is like a bouncer at an exclusive Markdown club: you get one chance to enter (atomic write), your ID is permanent (ULID filename), and if you try to sneak in twice with the same outfit (content hash), the bouncer remembers and waves you through without checking again. But if someone else shows up with _your_ ID wearing different clothes? That's a **CRITICAL ERROR**—call security and lock the vault! 🚪🔒

(Still smaller than your attention span window, which is reassuring.)
