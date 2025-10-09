---
title: Direct Export Pattern Tech Spec
status: draft
owner: Nathan
version: 1.1.0
date: 2025-09-28
spec_type: tech
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
prd_reference: docs/features/obsidian-bridge/prd-obsidian.md
---

> ✅ **MPPP FOUNDATION PATTERN** (Phase 1-2)

# Direct Export Pattern — Technical Specification

## Executive Summary

The **Direct Export Pattern** is a synchronous, atomic file-write strategy that replaces the deferred outbox/queue pattern for MPPP scope. It provides immediate, deterministic export from Staging Ledger to Obsidian vault with guaranteed atomicity and idempotency. This pattern enables sequential capture processing with minimal latency while maintaining zero-loss durability guarantees.

**Key Design Principle:** Write once, write correctly, or write nothing at all—no background workers, no retry queues, no async complexity until Phase 2+ metrics prove it's needed.

**Related ADR:** [ADR 0020: Foundation Direct Export Pattern](../adr/0020-foundation-direct-export-pattern.md)

### Alignment

- **Master PRD:** v2.3.0-MPPP, Section 4.3 (Obsidian Export)
- **Capture Arch:** spec-capture-arch.md (references direct export replacing outbox)
- **Obsidian Bridge:** spec-obsidian-arch.md, spec-obsidian-tech.md (atomic write implementation)
- **TDD Guide:** guides/tdd-applicability.md (risk assessment framework)

---

## 1) Scope & Interfaces

### 1.1 What Direct Export IS

**Direct Export** is a synchronous export pattern where:

1. **Capture processing invokes export immediately** (no queue, no background worker)
2. **Export completes before processing continues** (blocking call)
3. **Atomic file write guarantees** (temp → fsync → rename)
4. **Idempotent retries** (same capture_id + content_hash → same file)
5. **SQLite audit trail** (exports_audit table records all attempts)

**When to Use:**

- **Sequential processing workloads** (< 200 captures/day)
- **Low-latency requirements** (< 10s capture-to-file)
- **Simple error handling** (fail-fast with audit trail)
- **Phase 1-2 MPPP scope** (before concurrency needs)

### 1.2 What Direct Export IS NOT

❌ **Outbox queue pattern** - No background workers, no delayed processing
❌ **Async/concurrent exports** - Single-threaded, blocking calls
❌ **Retry logic** - Failures return immediately (error recovery in Phase 2)
❌ **Multi-vault support** - Single Obsidian vault only
❌ **Template-based rendering** - Fixed markdown format (ULID filename)

### 1.3 Public API Contract

```typescript
/**
 * Direct export interface - synchronous atomic write to vault
 */
export interface DirectExporter {
  /**
   * Export a capture to Obsidian vault immediately.
   *
   * @param capture - Capture record from staging ledger
   * @returns Result with export path or error
   *
   * Guarantees:
   * - Blocks until export completes or fails
   * - Atomic write (no partial files)
   * - Idempotent (retries safe)
   * - Audit record logged for all attempts
   * - < 50ms p95 latency for 1KB files
   */
  exportToVault(capture: CaptureRecord): Promise<ExportResult>
}

export interface CaptureRecord {
  id: string // ULID from captures.id
  source: "voice" | "email"
  raw_content: string // Transcribed text or email body
  content_hash: string // SHA-256 hex
  meta_json: Record<string, unknown>
  created_at: string // ISO8601 timestamp
}

export interface ExportResult {
  success: boolean
  export_path?: string // Relative to vault root (e.g., "inbox/01HZ.md")
  mode?: "initial" | "duplicate_skip"
  error?: ExportError
}

export interface ExportError {
  code: "EACCES" | "ENOSPC" | "EEXIST" | "EROFS" | "ENETDOWN" | "EUNKNOWN"
  message: string
  temp_path?: string
  export_path?: string
  recoverable: boolean // true = retry eligible, false = halt worker
}
```

### 1.4 CLI Integration

```bash
# Direct export (MPPP pattern) - synchronous blocking call
adhd capture voice  # → transcribe → export directly (no queue)
adhd capture email  # → normalize → export directly (no queue)

# Doctor command integration
adhd doctor
# Checks:
# - Last successful export timestamp
# - Export failure rate (last 24 hours)
# - Orphaned temp files in .trash/
# - Export audit consistency
```

---

## 2) Data & Storage

### 2.1 File System Layout

```
{vault_path}/
├── .trash/              # Temp files (atomic write staging area)
│   ├── {ULID}.tmp       # Temporary write target
│   └── ...
├── inbox/               # Direct export destination (flat structure)
│   ├── {ULID}.md        # Atomically written markdown files
│   └── ...
└── ... (other Obsidian vault content)
```

**Design Rationale:**

- `.trash/` directory chosen because:
  - Obsidian ignores it (no sync pollution)
  - Same filesystem as `inbox/` (atomic rename guarantee)
  - Easy orphan cleanup via doctor command
  - Visual indicator of "not yet finalized" status
- `inbox/` directory uses flat structure:
  - Aligns with PARA methodology (inbox → manual filing)
  - No year/month folders (deferred to Phase 3+)
  - ULID filenames prevent collisions

### 2.2 ULID Filename Strategy

**Filename Format:** `{ULID}.md`

Example: `01HZVM8YWRQT5J3M3K7YPTX9RZ.md`

**ULID Properties:**

- **26 characters** (uppercase alphanumeric)
- **Time-ordered** (first 48 bits = millisecond timestamp)
- **Globally unique** (122 bits entropy)
- **Lexicographically sortable** (natural chronological ordering)

**Collision Probability:**

- Theoretical: 2^122 unique IDs
- Practical: Zero collisions for < 10M captures (birthday paradox negligible)
- Detection: Content hash comparison on rare collision

**Path Resolution:**

```typescript
function resolveTempPath(vault_path: string, capture_id: string): string {
  // Validate ULID format (prevents path traversal)
  if (!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/.test(capture_id)) {
    throw new Error("Invalid ULID format")
  }

  return path.join(vault_path, ".trash", `${capture_id}.tmp`)
}

function resolveExportPath(vault_path: string, capture_id: string): string {
  if (!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/.test(capture_id)) {
    throw new Error("Invalid ULID format")
  }

  return path.join(vault_path, "inbox", `${capture_id}.md`)
}
```

### 2.3 Markdown Export Format

**Exported File Structure:**

```markdown
---
id: 01HZVM8YWRQT5J3M3K7YPTX9RZ
source: voice
captured_at: 2025-09-27T10:30:45.123Z
content_hash: a1b2c3d4e5f6...
---

# Capture Title (Extracted or "Untitled")

{Transcribed content or email body}

---

**Metadata:**

- Source: voice | email
- Captured: 2025-09-27 10:30 AM
- Export: 2025-09-27 10:30 AM
```

**Frontmatter Contract:**

| Field          | Type    | Required | Description                             |
| -------------- | ------- | -------- | --------------------------------------- |
| `id`           | ULID    | Yes      | Immutable capture ID (matches filename) |
| `source`       | Enum    | Yes      | `voice` or `email`                      |
| `captured_at`  | ISO8601 | Yes      | Original capture timestamp              |
| `content_hash` | SHA-256 | Yes      | Content hash for deduplication          |

### 2.4 SQLite Audit Trail

**Export Audit Schema:**

```sql
CREATE TABLE exports_audit (
    id TEXT PRIMARY KEY,
    capture_id TEXT NOT NULL,
    vault_path TEXT NOT NULL,       -- Format: "inbox/{ULID}.md"
                                     -- ⚠️ Technical debt: Should be export_path (historical naming)
    hash_at_export TEXT,            -- Content hash at time of export
    exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    mode TEXT,                      -- 'initial' | 'duplicate_skip'
    error_flag INTEGER DEFAULT 0,
    FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
);

-- Performance index for duplicate detection
CREATE INDEX idx_exports_capture ON exports_audit(capture_id);
CREATE INDEX idx_exports_timestamp ON exports_audit(exported_at);
```

**Field Naming Note:**

The `vault_path` field is named for historical reasons (early implementation used "vault_path" term). Semantically, it stores the **export path relative to vault root** (e.g., `inbox/{ULID}.md`), so `export_path` would be more accurate. However, renaming would require a schema migration which is deferred to avoid disrupting existing audit data. Documentation uses both terms interchangeably, with preference for `export_path` in new code.

**Audit Record Lifecycle:**

1. **Initial Export:** Insert with `mode='initial'`, `error_flag=0`
2. **Duplicate Skip:** Insert with `mode='duplicate_skip'`, `error_flag=0`
3. **Export Failure:** Log to `errors_log` instead (no audit record)

---

## 3) Control Flow

### 3.1 Direct Export Sequence Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│              Capture Processing (Sequential)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Process Capture       │  ← Voice transcription OR email normalization
                │ (raw_content ready)   │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Compute content_hash  │  ← SHA-256(normalized content)
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Update captures table │  ← SET content_hash, status='transcribed'
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ DirectExporter.export │  ← **SYNCHRONOUS BLOCKING CALL**
                └───────────┬───────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
    ┌─────────────────┐       ┌─────────────────┐
    │ SUCCESS         │       │ FAILURE         │
    │ - File in vault │       │ - No vault write│
    │ - Audit logged  │       │ - Error logged  │
    │ - Continue      │       │ - Halt/retry    │
    └─────────────────┘       └─────────────────┘
```

### 3.2 Atomic Write Flow (Internal)

**AtomicWriter Internal Sequence:**

```
DirectExporter.exportToVault(capture)
    │
    ├─► Format markdown content
    │   └─► Build frontmatter + body
    │
    ├─► Check duplicate (filesystem-first idempotency)
    │   ├─► Read vault file: {vault_path}/inbox/{ULID}.md
    │   ├─► If missing: continue with export
    │   ├─► If exists: compute content hash
    │   │   ├─► If hash matches: return { success: true, mode: 'duplicate_skip' }
    │   │   └─► If hash differs: return { success: false, error: 'CONFLICT' }
    │   └─► **Self-heal:** If audit says exported but file missing, re-export
    │
    ├─► Ensure directories exist
    │   ├─► mkdir -p {vault_path}/.trash
    │   └─► mkdir -p {vault_path}/inbox
    │
    ├─► Write to temp file
    │   ├─► path = {vault_path}/.trash/{ULID}.tmp
    │   ├─► fd = fs.open(path, 'w')
    │   ├─► fs.write(fd, content)
    │   └─► **fs.fsync(fd)** ◄── CRITICAL: durability guarantee
    │
    ├─► Atomic rename
    │   ├─► src = {vault_path}/.trash/{ULID}.tmp
    │   ├─► dst = {vault_path}/inbox/{ULID}.md
    │   └─► **fs.rename(src, dst)** ◄── Atomic operation (POSIX)
    │
    ├─► **Durability:** fsync parent directory
    │   ├─► fd = fs.open({vault_path}/inbox, 'r')
    │   ├─► **fs.fsync(fd)** ◄── Persist directory entry
    │   └─► fs.close(fd)
    │
    ├─► Record audit
    │   └─► INSERT INTO exports_audit (...)
    │
    └─► Return { success: true, export_path: "inbox/{ULID}.md" }
```

### 3.3 fsync/rename Ordering (Critical Guarantee)

**Ordering Contract:**

```typescript
// CRITICAL: fsync MUST happen before rename, and directory fsync after
async function atomicWriteWithFsync(
  temp_path: string,
  export_path: string,
  content: string
): Promise<void> {
  let fd: number | undefined

  try {
    // 1. Write content to temp file
    fd = await fs.open(temp_path, "w")
    await fs.write(fd, content, 0, "utf-8")

    // 2. **CRITICAL**: fsync file before rename
    //    Ensures content is on disk BEFORE file becomes visible
    await fs.fsync(fd)

    // 3. Close file descriptor
    await fs.close(fd)
    fd = undefined

    // 4. Atomic rename (safe because content is on disk)
    await fs.rename(temp_path, export_path)

    // 5. **CRITICAL**: fsync parent directory after rename
    //    Ensures directory entry is persisted (SQLite/PostgreSQL robustness practice)
    const parentDir = path.dirname(export_path)
    const dirFd = await fs.open(parentDir, 'r')
    await fs.fsync(dirFd)
    await fs.close(dirFd)
  } catch (error) {
    // Cleanup temp file on any error
    if (fd !== undefined) {
      await fs.close(fd).catch(() => {})
    }
    await cleanupTempFile(temp_path)
    throw error
  }
}
```

**Why fsync File Before Rename:**

- **Without fsync:** Rename succeeds, but content may still be in OS cache
- **Crash scenario:** File appears in vault but is empty or truncated
- **fsync guarantee:** Content is on disk BEFORE file becomes visible to Obsidian Sync

**Why fsync Directory After Rename:**

- **Without directory fsync:** Rename updates directory entry, but entry may not be persisted
- **Crash scenario:** File data is on disk, but directory entry is lost → file effectively disappears
- **Directory fsync guarantee:** Directory entry is durable, file remains accessible after crash
- **Source:** SQLite/PostgreSQL robustness guides (industry best practice for crash-safety)

---

## 4) TDD Applicability Decision

### Risk Assessment

**Risk Class:** **HIGH**

**Justification:**

This code handles critical durability guarantees for user data export to Obsidian vault. Per [TDD Applicability Guide](../../guides/guide-tdd-applicability.md), this qualifies as HIGH risk due to:

1. **💾 Storage/Data Integrity:** Vault corruption = permanent data loss (no undo for Obsidian notes)
2. **🔐 User Trust:** Partial writes = sync conflicts that damage user confidence
3. **🧠 Core Cognition:** ULID collisions = integrity violation (same filename, different content)
4. **🔁 Concurrency/Durability:** fsync timing bugs = silent data loss (only visible after crash)
5. **⚠️ Cascading Failures:** Sequential processing = blocking failures (single failure halts all exports)

**Related High-Risk Components:**

- [Staging Ledger Tech Spec](../../features/staging-ledger/spec-staging-tech.md) - upstream data source with audit trail
- [Obsidian Bridge Tech Spec](../../features/obsidian-bridge/spec-obsidian-tech.md) - atomic write implementation

### Decision

**TDD REQUIRED** (Test-Driven Development, red-green-refactor cycle)

**Rationale:**

- Failures cause **permanent data loss** (High Risk criteria met)
- Atomic guarantees are **non-negotiable** for Obsidian Sync compatibility
- fsync/rename ordering bugs are **silent until crash** (requires proactive testing)
- Export idempotency is **critical for retry safety** (Phase 2 requirement)

### Test Scope

#### Unit Tests (Required)

**Path Resolution & Security:**

- ✅ Valid ULID → correct temp/export paths
- ✅ Invalid ULID → error (prevents path traversal attacks)
- ✅ Special characters → sanitized or rejected
- ✅ Path traversal attempts → blocked (security boundary)

**Collision Detection:**

- ✅ NO_COLLISION path (file doesn't exist, safe to proceed)
- ✅ DUPLICATE path (same content_hash, idempotent success)
- ✅ CONFLICT path (different content_hash, critical error)

**Markdown Formatting:**

- ✅ Frontmatter structure (YAML valid, Obsidian compatible)
- ✅ Content escaping (special chars, newlines, quotes)
- ✅ Timestamp formatting (ISO8601, timezone-aware)
- ✅ Metadata contract (id, source, captured_at, content_hash)

**Temp File Cleanup:**

- ✅ Cleanup on success (temp file removed atomically)
- ✅ Cleanup on failure (idempotent, no double-delete)
- ✅ Cleanup ignores ENOENT (already removed by another process)
- ✅ Cleanup on process crash (recovery via doctor command)

**Hash Computation:**

- ✅ SHA-256 deterministic (same input → same hash)
- ✅ UTF-8 encoding normalization
- ✅ Hex output format (lowercase, 64 chars)

#### Integration Tests (Required)

**End-to-End Atomic Write:**

- ✅ New capture → temp → fsync → rename → audit (happy path)
- ✅ Duplicate capture → skip write, audit logged as `duplicate_skip`
- ✅ Crash mid-write → no partial file in vault, temp cleaned
- ✅ Export latency < 50ms p95 (performance gate from PRD)
- ✅ Content integrity verification (read-back hash matches)

**Error Path Testing (All errno values):**

- ✅ EACCES (permission denied) → structured error, retry eligible
- ✅ ENOSPC (disk full) → halt worker, alert via metrics
- ✅ EEXIST (collision) → check hash, handle per policy (DUPLICATE vs CONFLICT)
- ✅ EROFS (read-only filesystem) → halt worker, alert via doctor
- ✅ ENETDOWN (network mount disconnected) → retry eligible with backoff
- ✅ EUNKNOWN (unexpected error) → log, fail-safe behavior

**Idempotency Contract:**

- ✅ Retry same capture → same file, no duplicates in vault
- ✅ Duplicate exports logged with `mode='duplicate_skip'` (filesystem-first check)
- ✅ **Self-heal test:** File deleted externally → retry re-exports (2nd audit record with `mode='initial'`)
- ✅ Crash → retry → recovery successful with audit trail
- ✅ Concurrent retries (Phase 2) → last-write-wins semantic

**Directory Creation:**

- ✅ First export creates `.trash/` and `inbox/` (idempotent mkdir)
- ✅ Existing directories handled gracefully (no error)
- ✅ Permission denied on mkdir → structured error

#### Contract Tests (Required)

**Staging Ledger Contract:**

- ✅ ULID format validation from `captures.id` (26 chars, alphanumeric)
- ✅ Content hash availability before export (SHA-256 computed)
- ✅ Foreign key cascade (delete capture → delete audit record)
- ✅ Audit table schema matches expected contract (mode field present)

**Filesystem Contract:**

- ✅ fsync called before rename (syscall trace or mock verification)
- ✅ Temp file always in `.trash/`, never in `inbox/` (directory isolation)
- ✅ Exported filename exactly matches `captures.id` (no timestamp prefix)
- ✅ Atomic rename guarantee (POSIX requirement, same filesystem)
- ✅ Rename failure leaves no partial files (all-or-nothing)

**Audit Contract:**

- ✅ Every successful export logged in `exports_audit` (mode='initial')
- ✅ Duplicate exports logged with `mode='duplicate_skip'`
- ✅ Failed exports NOT logged in audit (error_log only)
- ✅ Foreign key constraints enforced (cascade on delete)
- ✅ Audit timestamp matches export timestamp (within 100ms)

**Obsidian Bridge Contract:**

- ✅ Cross-references [spec-obsidian-tech.md](../../features/obsidian-bridge/spec-obsidian-tech.md) for AtomicWriter interface
- ✅ Markdown format matches Obsidian expectations (frontmatter, body, footer)
- ✅ ULID filenames prevent collisions (birthday paradox negligible for < 10M captures)

### YAGNI Deferrals

**Not Testing (Phase 1 MPPP Scope):**

- ❌ Multi-vault support (single vault assumption, user_config.vault_path only)
- ❌ Template-based filenames (ULID deterministic only, no user customization)
- ❌ Daily note backlinks (not in Phase 1 scope, deferred to Phase 3+)
- ❌ PARA classification (manual filing via inbox/, no auto-routing)
- ❌ Retry logic with exponential backoff (fail-fast in Phase 1, retry in Phase 2)
- ❌ Concurrent exports (sequential processing only, worker pool in Phase 2+)
- ❌ Performance profiling under load (< 200 captures/day in MPPP, optimization deferred)
- ❌ Network mount reliability (ENETDOWN error path exists, but no retry testing)

**Deferred to Phase 2+:**

- ⏳ Retry queue testing (requires background worker implementation)
- ⏳ Concurrency testing (requires worker pool, lock contention scenarios)
- ⏳ Performance benchmarks (throughput > 200 captures/day)
- ⏳ Multi-vault routing logic (requires vault_id selection)

### Triggers to Revisit

**Expand Test Coverage If:**

1. **Export failure rate > 5%** in production (reliability regression detected)
2. **ULID collision detected** (integrity violation observed, requires investigation)
3. **Obsidian Sync conflicts reported** (atomic rename not working as expected)
4. **Phase 2 introduces retry logic** (need retry-specific tests for exponential backoff)
5. **Phase 2 introduces concurrency** (need lock contention, race condition tests)
6. **Daily capture volume exceeds 200** (performance testing required)
7. **Network mount support required** (need ENETDOWN retry logic testing)
8. **User requests PARA auto-classification** (need routing logic tests)

**Regression Testing Triggers:**

- Post-incident: Export failures causing user data loss
- Post-deployment: Changes to AtomicWriter, fsync ordering, or rename logic
- Quarterly: Verify test coverage still matches risk profile

---

## 5) Dependencies & Contracts

### 5.1 Upstream Contract (Staging Ledger)

**Required Inputs:**

```sql
-- Staging Ledger must provide:
SELECT
  id AS capture_id,           -- ULID (26 chars, time-ordered)
  source,                     -- 'voice' | 'email'
  raw_content,                -- Transcribed text or email body
  content_hash,               -- SHA-256 hex (64 chars)
  meta_json,                  -- JSON metadata
  created_at                  -- ISO8601 timestamp
FROM captures
WHERE status = 'transcribed'  -- Only export after transcription
  AND id NOT IN (
    SELECT capture_id FROM exports_audit WHERE error_flag = 0
  );
```

**Guarantees Staging Ledger MUST Provide:**

1. **Valid ULID:** Matches regex `^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$`
2. **Content Hash Available:** SHA-256 computed and stored before export
3. **Raw Content Ready:** Voice transcription OR email normalization complete
4. **Foreign Key Integrity:** Capture exists before export attempt

**What Staging Ledger Does NOT Guarantee:**

- ❌ Vault path validity (DirectExporter must validate)
- ❌ Disk space availability (DirectExporter must handle ENOSPC)
- ❌ Write permissions (DirectExporter must handle EACCES)

### 5.2 Downstream Contract (Filesystem)

**Required Filesystem Capabilities:**

1. **POSIX Atomic Rename:** `rename(2)` must be atomic on same filesystem
2. **fsync Durability:** `fsync(2)` must flush data to persistent storage
3. **Directory Writable:** `.trash/` and `inbox/` must be writable
4. **Same Filesystem:** Temp and export paths must be on same mount

**Supported Filesystems:**

| Filesystem         | Atomic Rename   | fsync Support | Status                |
| ------------------ | --------------- | ------------- | --------------------- |
| **APFS** (macOS)   | ✅ Yes          | ✅ Yes        | Primary target (MPPP) |
| **ext4** (Linux)   | ✅ Yes          | ✅ Yes        | Supported (Phase 2+)  |
| **btrfs** (Linux)  | ✅ Yes          | ✅ Yes        | Supported (Phase 2+)  |
| **NTFS** (Windows) | ⚠️ Partial      | ⚠️ Partial    | Not supported (MPPP)  |
| **Network mounts** | ❌ No guarantee | ❌ Unreliable | Error path (ENETDOWN) |

### 5.3 External Dependencies

**None** - Direct Export Pattern has zero external dependencies:

- ❌ No background worker framework
- ❌ No message queue system
- ❌ No async job library
- ❌ No distributed locking
- ✅ Pure Node.js fs module
- ✅ SQLite via better-sqlite3

---

## 6) Risks & Mitigations

### 6.1 Conflict Resolution (DUPLICATE vs CONFLICT)

**Collision Detection Strategy (Filesystem-First):**

The collision detector **always checks the actual vault file first**, ignoring the audit table. This enables self-healing when files are externally deleted.

```typescript
enum CollisionResult {
  NO_COLLISION, // File doesn't exist, safe to write
  DUPLICATE, // File exists with identical content_hash
  CONFLICT, // File exists with DIFFERENT content_hash (CRITICAL ERROR)
}

async function checkCollision(
  export_path: string,
  content_hash: string
): Promise<CollisionResult> {
  // ⚠️ CRITICAL: Check filesystem FIRST, not audit table
  // This enables self-heal when files are externally deleted
  try {
    // Try to read the existing file from vault
    const existing_content = await fs.readFile(export_path, "utf-8")

    // File exists, check if content matches
    const existing_hash = computeSHA256(existing_content)

    if (existing_hash === content_hash) {
      return CollisionResult.DUPLICATE
    } else {
      return CollisionResult.CONFLICT
    }
  } catch (error) {
    // If file doesn't exist (ENOENT), no collision
    if (error.code === 'ENOENT') {
      return CollisionResult.NO_COLLISION
    }

    // Other errors (EACCES, etc.) treated as conflicts for safety
    return CollisionResult.CONFLICT
  }
}
```

**Why Filesystem-First?**

- **Self-healing:** If audit says exported but file missing → re-export automatically
- **Source of truth:** Vault filesystem is reality, audit is just a log
- **Idempotency:** Safe to retry exports even if audit state is stale

**Collision Handling Policy:**

| Collision Type   | Action                                    | Rationale                                                        |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| **NO_COLLISION** | Proceed with atomic write                 | Normal case, file doesn't exist                                  |
| **DUPLICATE**    | Skip write, log audit as `duplicate_skip` | Idempotent retry, same content already exported                  |
| **CONFLICT**     | **HALT**, log CRITICAL error              | ULID collision with different content = data integrity violation |

**Conflict Resolution:**

- **Automated:** None (requires manual investigation)
- **Logging:** Log to `errors_log` with severity `CRITICAL`
- **Audit Trail:** Record in `exports_audit` with notes `ULID conflict detected`
- **Recovery:** Manual inspection required, may indicate:
  - Staging ledger corruption
  - ULID generator failure
  - Filesystem corruption

### 6.2 Error Classification & Recovery

**Error Taxonomy:**

| Error Code   | Category          | Recoverable | Action                                         |
| ------------ | ----------------- | ----------- | ---------------------------------------------- |
| **EACCES**   | Permission denied | Yes         | Retry with backoff (Phase 2), alert via doctor |
| **ENOSPC**   | Disk full         | No          | **HALT** worker, alert immediately             |
| **EEXIST**   | ULID collision    | Conditional | Check hash, HALT if CONFLICT                   |
| **EROFS**    | Read-only FS      | No          | **HALT** worker, alert immediately             |
| **ENETDOWN** | Network mount     | Yes         | Retry with backoff (Phase 2)                   |
| **EUNKNOWN** | Unknown error     | No          | Log and fail                                   |

**Phase 1 vs Phase 2 Retry Semantics:**

Per [ADR-0013 (MPPP Direct Export Pattern)](../../adr/0013-mppp-direct-export-pattern.md), Phase 1 uses **fail-fast semantics** with no automatic retry logic:

- **Phase 1 (MPPP)**: All export failures return immediately with `success: false`. The `recoverable` flag indicates whether the error **could** be retried in Phase 2, but **no automatic retry happens in Phase 1**. Manual intervention required for all failures.

- **Phase 2 (Future)**: Recoverable errors (EACCES, ENETDOWN) will be automatically retried with exponential backoff. Non-recoverable errors (ENOSPC, EROFS) will still halt processing immediately.

**Rationale**: MPPP scope prioritizes simplicity and immediate feedback over automated retry complexity. The `recoverable` flag is forward-looking metadata that Phase 2 error handlers will use to determine retry eligibility.

**Error Handling Flow:**

```typescript
async function handleExportError(
  error: NodeJS.ErrnoException,
  context: ExportContext
): Promise<ExportResult> {
  const error_code = error.code || "EUNKNOWN"

  // Log to errors_log table
  await db.run(
    `
    INSERT INTO errors_log (id, capture_id, stage, message)
    VALUES (?, ?, 'export', ?)
  `,
    [ulid(), context.capture_id, error.message]
  )

  switch (error_code) {
    case "EACCES":
      return {
        success: false,
        error: {
          code: "EACCES",
          message: "Permission denied writing to vault",
          recoverable: true,
        },
      }

    case "ENOSPC":
      await haltExportWorker("Disk full")
      return {
        success: false,
        error: {
          code: "ENOSPC",
          message: "No space available in vault",
          recoverable: false,
        },
      }

    case "EEXIST":
      const collision = await checkCollision(
        context.export_path,
        context.content_hash
      )
      if (collision === CollisionResult.DUPLICATE) {
        // Idempotent: treat as success
        await recordAuditDuplicate(context.capture_id, context.export_path)
        return { success: true, mode: "duplicate_skip" }
      } else {
        await logCriticalError("ULID collision with different content", context)
        return {
          success: false,
          error: {
            code: "EEXIST",
            message: "ULID collision detected",
            recoverable: false,
          },
        }
      }

    case "EROFS":
      await haltExportWorker("Vault is read-only")
      return {
        success: false,
        error: {
          code: "EROFS",
          message: "Vault is read-only",
          recoverable: false,
        },
      }

    case "ENETDOWN":
      return {
        success: false,
        error: {
          code: "ENETDOWN",
          message: "Network mount disconnected",
          recoverable: true,
        },
      }

    default:
      return {
        success: false,
        error: {
          code: "EUNKNOWN",
          message: error.message,
          recoverable: false,
        },
      }
  }
}
```

### 6.3 Atomic Guarantees

**All-or-Nothing Contract:**

**Success Case:**

1. File appears in `inbox/` with complete content
2. Audit record created in `exports_audit` table
3. No temp file remains in `.trash/`

**Failure Case:**

1. File **never** appears in `inbox/` (partial writes impossible)
2. Temp file cleaned up from `.trash/`
3. Error logged to `errors_log` (no audit record created)

**Invariant:**

```
IF export_path exists THEN content is complete AND audit record exists
```

**Implementation Guarantee:**

- `fs.rename()` is atomic on POSIX filesystems (APFS, ext4, btrfs)
- If rename fails mid-operation (power loss), filesystem guarantees:
  - Old path (temp file) or new path (export file) exists, never both
  - Content is never partially written (fsync before rename ensures this)

### 6.4 Idempotency Contract

**Idempotency Guarantee:**

```
exportToVault(capture) can be called N times safely
→ Same filename, same content, same audit record
```

**Key Properties:**

1. **Deterministic filename:** `captures.id` (ULID) → `{ULID}.md` (no timestamp prefix)
2. **Filesystem-first dedup:** Collision detection reads actual vault file, not audit table (enables self-healing)
3. **Content hash comparison:** If file exists with same `content_hash`, skip write and return success
4. **Audit trail:** Duplicate exports recorded as `mode='duplicate_skip'`
5. **Retry safety:** Crash during export → retry is safe (temp file cleaned up, no partial writes)

**Self-Healing Behavior:**

If the audit table says a capture was exported but the vault file is missing (external deletion, sync conflict, filesystem corruption), the next export attempt will **re-export the file** instead of skipping. This is because collision detection checks the actual filesystem first, not the audit table.

**Retry Scenarios:**

| Scenario                               | Behavior                                | Audit Record                                  |
| -------------------------------------- | --------------------------------------- | --------------------------------------------- |
| First export succeeds                  | File written, audit created             | `mode='initial'`                              |
| Retry with same content                | File exists, skip write                 | `mode='duplicate_skip'`                       |
| Crash mid-write, then retry            | Temp file cleaned, retry succeeds       | `mode='initial'` (only 1 record)              |
| File deleted externally, then retry    | **Self-heal**: File re-exported         | New `mode='initial'` record (2nd audit entry) |
| Collision conflict (different content) | **HALT**, manual investigation required | No audit record (error log only)              |

---

## 7) Rollout & Telemetry (local-only)

### 7.1 Performance Characteristics

**Latency Budget:**

Target: **< 50ms p95** for 1KB markdown file

**Breakdown:**

| Operation           | Target     | Justification                             |
| ------------------- | ---------- | ----------------------------------------- |
| Path resolution     | < 1ms      | String concatenation only                 |
| Collision detection | < 5ms      | Async file read + hash comparison         |
| Temp file write     | < 10ms     | Sequential write, no buffering            |
| **fsync call**      | < 15ms     | **Critical:** Flush OS cache to disk      |
| Atomic rename       | < 5ms      | POSIX syscall, atomic on same FS          |
| Audit log write     | < 10ms     | Single SQLite INSERT                      |
| **Total**           | **< 46ms** | 4ms buffer for variability                |

**Throughput Constraints:**

**MPPP Scope:** Sequential exports only (no concurrency)

**Design Rationale:**

- MPPP exports are synchronous (no outbox queue)
- Sequential processing simplifies error recovery
- Single-threaded avoids filesystem lock contention

**Phase 2+ Concurrency Triggers:**

- Daily capture volume > 200
- Export backlog depth > 20 for > 30 minutes
- p95 export latency > 100ms

### 7.2 Metrics Collection

**Logged Metrics (NDJSON to `~/.capture-bridge/metrics/`):**

```json
{
  "event": "export.direct.success",
  "capture_id": "01HZVM8YWRQT5J3M3K7YPTX9RZ",
  "export_path": "inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md",
  "duration_ms": 23,
  "mode": "initial",
  "timestamp": "2025-09-27T10:30:45.123Z"
}

{
  "event": "export.direct.duplicate",
  "capture_id": "01HZVM8YWRQT5J3M3K7YPTX9RZ",
  "export_path": "inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md",
  "timestamp": "2025-09-27T10:30:46.789Z"
}

{
  "event": "export.direct.failure",
  "capture_id": "01HZVM8YWRQT5J3M3K7YPTX9RZ",
  "error_code": "EACCES",
  "error_message": "Permission denied",
  "temp_path": ".trash/01HZVM8YWRQT5J3M3K7YPTX9RZ.tmp",
  "recoverable": true,
  "timestamp": "2025-09-27T10:30:45.456Z"
}
```

**Counters:**

- `export.direct.attempts` (total export attempts)
- `export.direct.success` (successful exports)
- `export.direct.failure` (failed exports by error code)
- `export.direct.duplicate` (duplicate exports skipped)
- `export.direct.latency_p95` (95th percentile export time)

### 7.3 Health Command Integration

**Doctor Command Checks:**

```bash
adhd doctor
```

**Export-Specific Checks:**

1. **Vault Path Exists:**
   - Severity: CRITICAL
   - Check: `await fs.access(vault_path, fs.constants.F_OK)`
   - Remediation: "Configure vault path: `adhd config set vault_path /path/to/vault`"

2. **Vault Writable:**
   - Severity: CRITICAL
   - Check: `await fs.access(vault_path, fs.constants.W_OK)`
   - Remediation: "Check vault permissions: `chmod u+w /path/to/vault`"

3. **Inbox Directory Exists:**
   - Severity: WARNING
   - Check: `await fs.access(path.join(vault_path, 'inbox'), fs.constants.F_OK)`
   - Remediation: "Run export to create inbox/ directory (auto-created on first export)"

4. **Trash Directory Exists:**
   - Severity: WARNING
   - Check: `await fs.access(path.join(vault_path, '.trash'), fs.constants.F_OK)`
   - Remediation: "Run export to create .trash/ directory (auto-created on first export)"

5. **Orphaned Temp Files:**
   - Severity: INFO
   - Check: Count `.tmp` files in `.trash/`
   - Remediation: "Run `adhd doctor --cleanup` to remove orphaned temp files"

6. **Export Audit Consistency:**
   - Severity: WARNING
   - Check: Verify all `exports_audit` records point to existing files
   - Remediation: "Manual investigation required if missing files detected"

7. **Export Failure Rate:**
   - Severity: WARNING
   - Check: Count errors in `errors_log` where `stage='export'` (last 24 hours)
   - Remediation: "Check error logs: `adhd logs --stage=export --last=24h`"

---

## 8) YAGNI Boundaries

### 8.1 What's Included (MPPP Scope)

✅ **Synchronous blocking exports** (no async workers)
✅ **ULID filenames** (deterministic, time-ordered)
✅ **Atomic temp-then-rename** (no partial writes)
✅ **Content hash deduplication** (idempotent retries)
✅ **SQLite audit trail** (exports_audit table)
✅ **Flat inbox structure** (no year/month folders)
✅ **Single vault support** (no multi-vault)
✅ **Sequential processing** (no concurrency)

### 8.2 What's Deferred (Phase 2+)

**Error Recovery (Phase 2):**

- ⏳ Retry logic with exponential backoff
- ⏳ Error recovery hooks (EACCES, ENETDOWN)
- ⏳ Health monitoring integration
- ⏳ Metrics-based alerting

**Performance (Phase 2):**

- ⏳ Concurrent exports (worker pool)
- ⏳ Batch export operations
- ⏳ Performance profiling

**Features (Phase 3+):**

- ⏳ PARA classification (dynamic export paths)
- ⏳ Template-based filenames (custom naming schemes)
- ⏳ Daily note integration (append to existing notes)
- ⏳ Multi-vault support (multiple export destinations)

### 8.3 What's Out of Scope (Phase 5+ or Never)

❌ **Outbox queue pattern** (replaced by direct export)
❌ **Background workers** (synchronous processing sufficient)
❌ **Distributed locking** (single-user assumption)
❌ **Network retry frameworks** (simple error handling)
❌ **Template rendering engines** (fixed markdown format)
❌ **Dynamic classification engines** (manual filing)

### 8.4 Stability Triggers (When to Revisit)

**Expand Pattern If:**

1. **Daily capture volume > 200** (concurrency needed)
2. **Export backlog > 20 sustained** (async queue needed)
3. **p95 latency > 100ms** (performance optimization needed)
4. **Export failure rate > 5%** (retry logic needed)
5. **Multi-vault requirement** (Phase 3+ feature request)

**Deprecate Pattern If:**

1. **Concurrency requirement introduced** (migrate to outbox pattern)
2. **Distributed processing needed** (multi-instance deployment)
3. **Complex retry logic needed** (background worker framework)

---

## 9) Related Documents

- **PRD:** `../features/obsidian-bridge/prd-obsidian.md` (v1.0.0-MPPP) - Product requirements
- **Arch Spec:** `../features/obsidian-bridge/spec-obsidian-arch.md` - System placement and failure modes
- **Tech Spec:** `../features/obsidian-bridge/spec-obsidian-tech.md` - AtomicWriter implementation
- **Test Spec:** `../features/obsidian-bridge/spec-obsidian-test.md` - Test strategy
- **Master PRD:** `../master/prd-master.md` (v2.3.0-MPPP) - System context
- **Capture Arch:** `../features/capture/spec-capture-arch.md` - Capture processing context
- **Staging Ledger PRD:** `../features/staging-ledger/prd-staging.md` - Audit table contract
- **TDD Guide:** `../guides/tdd-applicability.md` - Risk assessment framework

---

## 10) Implementation Notes

### 10.1 Directory Creation (Idempotent)

```typescript
async function ensureDirectories(vault_path: string): Promise<void> {
  const trash_dir = path.join(vault_path, ".trash")
  const inbox_dir = path.join(vault_path, "inbox")

  // Idempotent: mkdir -p behavior (no error if exists)
  await fs.mkdir(trash_dir, { recursive: true })
  await fs.mkdir(inbox_dir, { recursive: true })
}
```

### 10.2 Temp File Cleanup (Idempotent)

```typescript
async function cleanupTempFile(temp_path: string): Promise<void> {
  try {
    await fs.unlink(temp_path)
  } catch (error) {
    // Idempotent: ignore ENOENT (file already removed)
    if (error.code !== "ENOENT") {
      throw error
    }
  }
}
```

### 10.3 Content Hash Computation

```typescript
import crypto from "crypto"

function computeSHA256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex")
}
```

### 10.4 Security Considerations

**Path Traversal Prevention:**

```typescript
function validateCaptureId(capture_id: string): boolean {
  // ULID format: 26 characters, alphanumeric
  const ulid_regex = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/
  return ulid_regex.test(capture_id)
}

function resolveTempPath(vault_path: string, capture_id: string): string {
  if (!validateCaptureId(capture_id)) {
    throw new Error("Invalid capture_id format")
  }

  // Safe to concatenate (no path traversal possible with validated ULID)
  return path.join(vault_path, ".trash", `${capture_id}.tmp`)
}
```

**Vault Path Validation:**

- Must be absolute path
- Must be within user's home directory (prevent writing to system directories)
- Must not be symlink (prevent symlink attacks)

---

## 11) Revision History

- **v1.1.0** (2025-09-28): Enhanced TDD Applicability section (P2-1 task completion)
  - Added explicit risk classification icons (💾 🔐 🧠 🔁 ⚠️)
  - Added cross-references to related high-risk components (Staging Ledger, Obsidian Bridge)
  - Expanded rationale with specific criteria from TDD Guide
  - Enhanced unit test scope with security boundaries (path traversal prevention)
  - Added hash computation test requirements
  - Expanded integration tests with content integrity verification
  - Added comprehensive contract tests for all three interfaces (Staging Ledger, Filesystem, Audit)
  - Added Obsidian Bridge contract cross-reference
  - Detailed YAGNI deferrals with explicit scope boundaries (Phase 1 vs Phase 2+)
  - Added specific triggers for test coverage expansion (8 conditions)
  - Added regression testing triggers (post-incident, post-deployment, quarterly)
  - Full alignment with guide-tdd-applicability.md framework

- **v1.0.0** (2025-09-27): Complete technical specification for Direct Export Pattern
  - Pattern definition and scope
  - ULID filename strategy
  - Atomic write guarantees (fsync → rename)
  - Collision detection (DUPLICATE vs CONFLICT)
  - Error taxonomy and handling
  - Performance characteristics (< 50ms p95)
  - TDD applicability decision
  - YAGNI boundaries (Phase 1-2 scope)
  - Health command integration
  - Related documents and alignment

---

## Appendix: The Nerdy Joke

The Direct Export Pattern is like a ADHD-friendly express checkout lane: you grab your thought (capture), scan it immediately (no queue), and put it directly in the bag (vault)—no waiting, no background workers trying to "optimize" your shopping experience. The fsync call is like the cashier actually putting your receipt in the bag before closing it, so if the power goes out mid-transaction, you don't end up with an empty bag and a charge on your card. Still simpler than your attention span, which is reassuring. 🛒💨
