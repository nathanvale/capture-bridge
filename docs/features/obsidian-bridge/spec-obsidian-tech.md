---
title: Obsidian Bridge Tech Spec
status: draft
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-27
spec_type: tech
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

> ✅ **MVP SCOPE - ATOMIC WRITER IMPLEMENTATION** (Phase 1)

# Obsidian Bridge — Technical Specification

## 1) Scope & Interfaces

### 1.1 AtomicWriter Contract

**TypeScript Interface** (from PRD §5.1):

```typescript
export interface AtomicWriteResult {
  success: boolean
  export_path?: string
  error?: AtomicWriteError
}

export interface AtomicWriteError {
  code: "EACCES" | "ENOSPC" | "EEXIST" | "EROFS" | "ENETDOWN" | "EUNKNOWN"
  message: string
  temp_path?: string
  export_path?: string
}

export interface AtomicWriter {
  /**
   * Writes a capture to the vault atomically using temp-then-rename.
   *
   * @param capture_id - ULID from captures.id (becomes filename)
   * @param content - Formatted markdown content
   * @param vault_path - Absolute path to Obsidian vault root
   * @returns Result with export_path or error
   *
   * Invariants:
   * - filename = `{capture_id}.md` (no timestamp prefix)
   * - temp file written to `{vault_path}/.trash/{capture_id}.tmp`
   * - atomic rename to `{vault_path}/inbox/{capture_id}.md`
   * - on failure, temp file cleaned up
   * - fsync called before rename (durability guarantee)
   */
  writeAtomic(
    capture_id: string,
    content: string,
    vault_path: string
  ): Promise<AtomicWriteResult>
}
```

### 1.2 Public API Surface

**Exported Functions**:

```typescript
// Main atomic writer implementation
export class ObsidianAtomicWriter implements AtomicWriter {
  constructor(private readonly vault_path: string) {}

  async writeAtomic(
    capture_id: string,
    content: string,
    vault_path: string
  ): Promise<AtomicWriteResult>
}

// Path resolution utilities
export function resolveTempPath(vault_path: string, capture_id: string): string
export function resolveExportPath(
  vault_path: string,
  capture_id: string
): string

// Collision detection
export function checkCollision(
  export_path: string,
  content_hash: string
): Promise<CollisionResult>

// Temp file cleanup (used in error paths)
export function cleanupTempFile(temp_path: string): Promise<void>
```

### 1.3 CLI Integration

**Export Command** (future Phase 2):

```bash
# Synchronous export (MPPP direct-export, no outbox)
adhd export <capture_id> --vault=/path/to/vault

# Batch export (Phase 2+)
adhd export --all --vault=/path/to/vault
```

**Doctor Integration**:

```bash
adhd doctor
# Checks:
# - Vault path exists and is writable
# - .trash/ directory exists (created if missing)
# - inbox/ directory exists (created if missing)
# - No orphaned .tmp files in .trash/
```

---

## 2) Data & Storage

### 2.1 File System Layout

**Vault Directory Structure**:

```
{vault_path}/
├── .trash/              # Temp files written here first
│   ├── {ULID}.tmp       # Temporary write target
│   └── ...
├── inbox/               # Final atomic export destination
│   ├── {ULID}.md        # Atomically renamed from .trash/
│   └── ...
└── ... (other Obsidian vault content)
```

**Why `.trash/` for Temp Files**:

1. Obsidian ignores `.trash/` directory (no sync pollution)
2. Same filesystem as `inbox/` (guarantees atomic rename)
3. Easy cleanup of orphaned temp files via `doctor` command
4. Visual indicator of "not yet finalized" files

### 2.2 Temp Path Strategy (Checklist Item 1)

**Temp File Naming**:

- **Format**: `{vault_path}/.trash/{capture_id}.tmp`
- **Suffix**: `.tmp` (prevents Obsidian from attempting to parse)
- **Location**: Same filesystem as target (required for atomic rename)
- **Lifecycle**: Created → Written → fsync'd → Renamed → Deleted (on success) or Cleaned (on failure)

**Path Resolution Logic**:

```typescript
function resolveTempPath(vault_path: string, capture_id: string): string {
  // MUST be on same filesystem as export_path for atomic rename
  return path.join(vault_path, ".trash", `${capture_id}.tmp`)
}

function resolveExportPath(vault_path: string, capture_id: string): string {
  // Final destination in inbox/
  return path.join(vault_path, "inbox", `${capture_id}.md`)
}
```

**Directory Creation**:

```typescript
// Idempotent directory creation (called during writeAtomic)
async function ensureDirectories(vault_path: string): Promise<void> {
  const trash_dir = path.join(vault_path, ".trash")
  const inbox_dir = path.join(vault_path, "inbox")

  await fs.mkdir(trash_dir, { recursive: true })
  await fs.mkdir(inbox_dir, { recursive: true })
}
```

### 2.3 Markdown File Format

**Exported Markdown Structure**:

```markdown
---
id: { ULID }
source: { voice|email }
captured_at: { ISO8601 timestamp }
content_hash: { SHA-256 hex }
---

# {Title extracted from content or "Untitled Capture"}

{Transcription or email body}

---

**Metadata:**

- Source: {voice|email}
- Captured: {human-readable timestamp}
- Export: {export timestamp}
```

**Frontmatter Contract**:

- `id`: ULID from `captures.id` (immutable)
- `source`: `voice` or `email`
- `captured_at`: ISO8601 timestamp from `captures.captured_at`
- `content_hash`: SHA-256 hex from `captures.content_hash`

---

## 3) Control Flow

### 3.1 Atomic Write Sequence (Checklist Items 2, 5)

**Write Flow Diagram**:

```
┌─────────────────────┐
│ writeAtomic() called│
└──────────┬──────────┘
           │
           ▼
┌──────────────────────┐
│ ensureDirectories()  │  ← Idempotent, creates .trash/ and inbox/
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ resolveTempPath()    │  ← Returns {vault_path}/.trash/{capture_id}.tmp
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ fs.writeFile(temp)   │  ← Write content to temp file
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ fs.fsync(temp_fd)    │  ← **CRITICAL**: Flush to disk BEFORE rename
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ checkCollision()     │  ← Verify export_path doesn't exist with different content
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ fs.rename(temp, dst) │  ← Atomic rename (guaranteed by POSIX on same FS)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ fs.fsync(parent_dir) │  ← **CRITICAL**: Persist directory entry after rename
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ recordAudit()        │  ← Insert into exports_audit table
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ return { success }   │
└──────────────────────┘
```

### 3.2 fsync/rename Order (Checklist Item 2)

**Critical Ordering**:

1. **Write to temp file** (`fs.writeFile(temp_path, content)`)
2. **Force fsync** (`fs.fsync(temp_fd)`) ← **MUST happen before rename**
3. **Atomic rename** (`fs.rename(temp_path, export_path)`)
4. **Directory fsync** (`fs.fsync(parent_dir_fd)`) ← **MUST happen after rename** to persist directory entry

**Why fsync Before Rename**:

- Without fsync: Rename succeeds, but content may still be in OS cache
- Crash scenario: File appears in vault but is empty or truncated
- fsync guarantee: Content is on disk BEFORE file becomes visible to Obsidian

**Why Directory fsync After Rename**:

- On POSIX filesystems, `rename()` modifies the parent directory's metadata (adds new entry, removes old entry)
- Without directory fsync: Rename operation metadata may still be in OS cache
- Crash scenario: File data is on disk, but directory entry is missing (file effectively lost)
- Directory fsync guarantee: Directory entry is persisted, making the renamed file discoverable after crash
- Reference: SQLite, PostgreSQL, and ext4 robustness guides recommend this for full crash-safety

**Implementation**:

```typescript
async function writeAtomicWithFsync(
  temp_path: string,
  export_path: string,
  content: string
): Promise<void> {
  let fd: fs.FileHandle | undefined
  let dirFd: fs.FileHandle | undefined

  try {
    // 1. Write content to temp file
    fd = await fs.open(temp_path, "w")
    await fd.writeFile(content, "utf-8")

    // 2. CRITICAL: fsync before rename
    await fd.sync()

    // 3. Close file descriptor
    await fd.close()
    fd = undefined

    // 4. Atomic rename (now safe because content is on disk)
    await fs.rename(temp_path, export_path)

    // 5. CRITICAL: fsync parent directory to persist directory entry
    const parentDir = path.dirname(export_path)
    dirFd = await fs.open(parentDir, "r")
    await dirFd.sync()
    await dirFd.close()
    dirFd = undefined
  } catch (error) {
    // Cleanup temp file on any error
    if (fd !== undefined) {
      await fd.close().catch(() => {})
    }
    if (dirFd !== undefined) {
      await dirFd.close().catch(() => {})
    }
    await cleanupTempFile(temp_path)
    throw error
  }
}
```

### 3.3 Collision Policy (Checklist Item 3)

**Collision Detection Logic**:

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
  const exists = await fs.exists(export_path)

  if (!exists) {
    return CollisionResult.NO_COLLISION
  }

  // File exists, check if content matches
  const existing_content = await fs.readFile(export_path, "utf-8")
  const existing_hash = computeSHA256(existing_content)

  if (existing_hash === content_hash) {
    return CollisionResult.DUPLICATE
  } else {
    return CollisionResult.CONFLICT
  }
}
```

**Collision Handling Policy**:

| Collision Type   | Action                                         | Rationale                                                        |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| **NO_COLLISION** | Proceed with atomic write                      | Normal case, file doesn't exist                                  |
| **DUPLICATE**    | Skip write, audit with `mode='duplicate_skip'` | Idempotent retry, same content already exported                  |
| **CONFLICT**     | **HALT**, log CRITICAL error to `errors_log`   | ULID collision with different content = data integrity violation |

**Conflict Resolution**:

- **Automated**: None (requires manual investigation)
- **Logging**: Log to `errors_log` with severity `CRITICAL`
- **Audit Trail**: Record in `exports_audit` with `notes = "ULID conflict detected"`
- **Recovery**: Manual inspection required, may indicate:
  - Staging ledger corruption
  - ULID generator failure
  - Filesystem corruption

---

## 4) TDD Applicability Decision

### Risk Assessment

**Level**: **HIGH**

**Justification**:

1. Vault corruption = permanent data loss (no undo)
2. Partial writes = sync conflicts + user anxiety
3. ULID collisions with different content = integrity violation
4. fsync timing bugs = silent data loss until crash
5. Obsidian Sync race conditions = file conflicts

### Decision

**TDD Required**

### Test Strategy

**Unit Test Scope**:

- `resolveTempPath()` and `resolveExportPath()` (path correctness)
- `checkCollision()` (all 3 collision result paths)
- `cleanupTempFile()` (idempotency, error handling)
- Markdown formatting (frontmatter, content structure)

**Integration Test Scope**:

- End-to-end atomic write (temp → fsync → rename → audit)
- Crash recovery (kill process mid-write, verify no partial files in vault)
- Collision detection (write same capture_id twice, verify duplicate handling)
- Error path testing:
  - EACCES (permission denied)
  - ENOSPC (disk full)
  - EEXIST (collision conflict)
  - EROFS (read-only filesystem)
  - ENETDOWN (network mount failure)

**Contract Test Scope**:

- `exports_audit` foreign key cascade (delete capture → delete audit record)
- Temp file always in `.trash/`, never in `inbox/`
- Exported filename exactly matches `captures.id`
- fsync called before rename (requires low-level syscall tracing or mock)

### YAGNI Deferrals

**Not Testing (Phase 1)**:

- Multi-vault support (single vault assumption)
- Template-based filename generation (ULID only)
- Daily note backlinks (not in Phase 1 scope)
- PARA classification (deferred to Phase 3+)

### Triggers to Revisit

**Expand Test Coverage If**:

1. Export failure rate > 5% (indicates reliability regression)
2. Collision conflict detected in production (ULID collision observed)
3. Obsidian Sync conflicts reported by user (atomic rename not working)
4. Phase 2 introduces multi-vault support (needs new contract tests)

---

## 5) Risks & Mitigations

### 5.1 Failure Classification (Checklist Item 4)

**Error Taxonomy**:

| Error Code   | Category      | Description                      | Recovery Strategy                                            |
| ------------ | ------------- | -------------------------------- | ------------------------------------------------------------ |
| **EACCES**   | Permission    | Vault directory not writable     | Retry with exponential backoff (3x), then alert via `doctor` |
| **ENOSPC**   | Disk Full     | No space available for temp file | **HALT** export worker, alert via metrics                    |
| **EEXIST**   | Collision     | File exists (rare with ULID)     | Check content_hash, handle per collision policy              |
| **EROFS**    | Read-Only FS  | Vault on read-only filesystem    | **HALT** export worker, alert via `doctor`                   |
| **ENETDOWN** | Network Mount | Network drive disconnected       | Retry with backoff (5x), then fail with audit entry          |
| **EUNKNOWN** | Unknown       | Unexpected filesystem error      | Log to `errors_log`, retry once, then fail                   |

**Error Handling Strategy**:

```typescript
async function handleWriteError(
  error: NodeJS.ErrnoException,
  context: WriteContext
): Promise<AtomicWriteResult> {
  const error_code = error.code || "EUNKNOWN"

  switch (error_code) {
    case "EACCES":
      // Permission denied - retry with backoff
      await logError("EACCES", "Permission denied writing to vault", context)
      return {
        success: false,
        error: { code: "EACCES", message: error.message },
      }

    case "ENOSPC":
      // Disk full - critical failure, halt worker
      await logError("ENOSPC", "Disk full during export", context)
      await haltExportWorker("Disk full")
      return {
        success: false,
        error: { code: "ENOSPC", message: error.message },
      }

    case "EEXIST":
      // Collision detected during rename (shouldn't happen with ULID)
      const collision_result = await checkCollision(
        context.export_path,
        context.content_hash
      )
      if (collision_result === CollisionResult.DUPLICATE) {
        return { success: true, export_path: context.export_path } // Idempotent
      } else {
        await logCriticalError("ULID collision with different content", context)
        return {
          success: false,
          error: { code: "EEXIST", message: "ULID collision detected" },
        }
      }

    case "EROFS":
      // Read-only filesystem - halt worker
      await logError("EROFS", "Vault is read-only", context)
      await haltExportWorker("Read-only vault")
      return {
        success: false,
        error: { code: "EROFS", message: error.message },
      }

    case "ENETDOWN":
      // Network mount failure - retry with backoff
      await logError("ENETDOWN", "Network mount disconnected", context)
      return {
        success: false,
        error: { code: "ENETDOWN", message: error.message },
      }

    default:
      // Unknown error - log and fail
      await logError("EUNKNOWN", `Unexpected error: ${error.message}`, context)
      return {
        success: false,
        error: { code: "EUNKNOWN", message: error.message },
      }
  }
}
```

### 5.2 Side-Effects Guarantee (Checklist Item 5)

**Atomic All-or-Nothing Contract**:

**Success Case**:

1. File appears in `inbox/` with complete content
2. Audit record created in `exports_audit` table
3. No temp file remains in `.trash/`

**Failure Case**:

1. File **never** appears in `inbox/` (partial writes impossible)
2. Temp file cleaned up from `.trash/`
3. Error logged to `errors_log` (no audit record created)

**Invariant**:

```
IF export_path exists THEN content is complete AND audit record exists
```

**Implementation Guarantee**:

- `fs.rename()` is atomic on POSIX filesystems (APFS, ext4, btrfs)
- If rename fails mid-operation (power loss), filesystem guarantees:
  - Old path (temp file) or new path (export file) exists, never both
  - Content is never partially written (fsync before rename ensures this)

### 5.3 Idempotency Contract (Checklist Item 6)

**Idempotency Guarantee**:

```
writeAtomic(capture_id, content, vault_path) can be called N times safely
→ Same filename, same content, same audit record
```

**Key Properties**:

1. **Deterministic filename**: `captures.id` (ULID) → `{ULID}.md` (no timestamp prefix)
2. **Content hash dedup**: If file exists with same `content_hash`, skip write and return success
3. **Audit trail**: Duplicate exports recorded with `mode='duplicate_skip'` in `exports_audit`
4. **Retry safety**: Crash during export → retry is safe (temp file cleaned up, no partial writes)

**Retry Scenarios**:

| Scenario                               | Behavior                          | Audit Record                                 |
| -------------------------------------- | --------------------------------- | -------------------------------------------- |
| First export succeeds                  | File written, audit created       | `mode = 'initial'`                           |
| Retry with same content                | File exists, skip write           | `mode = 'duplicate_skip'`                    |
| Crash mid-write, then retry            | Temp file cleaned, retry succeeds | `mode = 'initial'` (only 1 record)           |
| Collision conflict (different content) | **HALT**, manual investigation    | No audit record (error logged to errors_log) |

**Allowed Mode Values**:

| Mode Value          | Meaning                                     | When Used                       |
| ------------------- | ------------------------------------------- | ------------------------------- |
| `'initial'`         | First successful export of this capture    | Normal export completion        |
| `'duplicate_skip'`  | Duplicate detected, write skipped           | Idempotent retry with same hash |

**Implementation**:

```typescript
async function writeAtomic(
  capture_id: string,
  content: string,
  vault_path: string
): Promise<AtomicWriteResult> {
  const temp_path = resolveTempPath(vault_path, capture_id)
  const export_path = resolveExportPath(vault_path, capture_id)

  // Idempotency check: If file exists with same content, return success
  const collision_result = await checkCollision(
    export_path,
    computeSHA256(content)
  )
  if (collision_result === CollisionResult.DUPLICATE) {
    await recordAuditDuplicate(capture_id, export_path)
    return { success: true, export_path }
  }

  if (collision_result === CollisionResult.CONFLICT) {
    await logCriticalError("ULID collision with different content", {
      capture_id,
      export_path,
    })
    return {
      success: false,
      error: { code: "EEXIST", message: "ULID collision detected" },
    }
  }

  // Proceed with atomic write (temp → fsync → rename)
  try {
    await writeAtomicWithFsync(temp_path, export_path, content)
    await recordAuditSuccess(capture_id, export_path)
    return { success: true, export_path }
  } catch (error) {
    await cleanupTempFile(temp_path)
    return await handleWriteError(error, { capture_id, temp_path, export_path })
  }
}
```

---

## 6) Rollout & Telemetry (local-only)

### 6.1 Feature Flags

**Phase 1 (No Flags)**:

- Atomic writer always enabled (no legacy fallback)
- MPPP direct-export (no outbox queue)

**Phase 2+ (Optional Flags)**:

- `EXPORT_ENABLE_FSYNC=1` (default: 1, can disable for testing)
- `EXPORT_TEMP_DIR=.trash` (default: `.trash`, configurable for testing)

### 6.2 Metrics & Counters

**Logged Metrics** (NDJSON to `~/.capture-bridge/metrics/`):

```json
{
  "event": "obsidian.export.success",
  "capture_id": "01HZVM8YWRQT5J3M3K7YPTX9RZ",
  "export_path": "inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md",
  "duration_ms": 23,
  "timestamp": "2025-09-27T10:30:45.123Z"
}

{
  "event": "obsidian.export.failure",
  "capture_id": "01HZVM8YWRQT5J3M3K7YPTX9RZ",
  "error_code": "EACCES",
  "error_message": "Permission denied",
  "temp_path": ".trash/01HZVM8YWRQT5J3M3K7YPTX9RZ.tmp",
  "timestamp": "2025-09-27T10:30:45.456Z"
}

{
  "event": "obsidian.export.duplicate",
  "capture_id": "01HZVM8YWRQT5J3M3K7YPTX9RZ",
  "export_path": "inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md",
  "timestamp": "2025-09-27T10:30:46.789Z"
}
```

**Counters**:

- `obsidian.export.attempts` (total export attempts)
- `obsidian.export.success` (successful exports)
- `obsidian.export.failure` (failed exports by error code)
- `obsidian.export.duplicate` (duplicate exports skipped)
- `obsidian.export.latency_p95` (95th percentile export time)

### 6.3 Health Checks

**Doctor Command Integration**:

```bash
adhd doctor
```

**Checks Performed**:

1. **Vault Path Exists**:
   - Severity: CRITICAL
   - Check: `fs.exists(vault_path)`
   - Remediation: "Configure vault path: `adhd config set vault_path /path/to/vault`"

2. **Vault Writable**:
   - Severity: CRITICAL
   - Check: `fs.access(vault_path, fs.constants.W_OK)`
   - Remediation: "Check vault permissions: `chmod u+w /path/to/vault`"

3. **Inbox Directory Exists**:
   - Severity: WARNING
   - Check: `fs.exists(vault_path/inbox)`
   - Remediation: "Run `adhd export` once to create inbox/ directory"

4. **Trash Directory Exists**:
   - Severity: WARNING
   - Check: `fs.exists(vault_path/.trash)`
   - Remediation: "Run `adhd export` once to create .trash/ directory"

5. **Orphaned Temp Files**:
   - Severity: INFO
   - Check: Count `.tmp` files in `.trash/`
   - Remediation: "Run `adhd doctor --cleanup` to remove orphaned temp files"

6. **Export Audit Consistency**:
   - Severity: WARNING
   - Check: Verify all `exports_audit` records point to existing files
   - Remediation: "Manual investigation required if missing files detected"

---

## 7) Related Documents

- **PRD**: `prd-obsidian.md` (v1.0.0-MPPP) - Product requirements and contracts
- **Arch Spec**: `spec-obsidian-arch.md` - System placement and failure modes
- **Test Spec**: `spec-obsidian-test.md` - Test strategy and coverage
- **Usage Guide**: `../../guides/guide-obsidian-bridge-usage.md` - Quick-start integration guide for developers
- **Master PRD**: `../../master/prd-master.md` (v2.3.0-MPPP) - Phase 1 context
- **Staging Ledger PRD**: `../staging-ledger/prd-staging.md` - Export audit table contract
- **TDD Guide**: `../../guides/tdd-applicability.md` - Risk assessment framework

**Related ADRs:**

- [ADR 0009: Atomic Write via Temp-Then-Rename Pattern](../../adr/0009-atomic-write-temp-rename-pattern.md) - Technical implementation of atomicity guarantees
- [ADR 0010: ULID-Based Deterministic Filenames](../../adr/0010-ulid-deterministic-filenames.md) - Filename generation and collision policy
- [ADR 0012: TDD Required for High-Risk Obsidian Bridge](../../adr/0012-tdd-required-high-risk.md) - Risk classification and testing requirements

---

## 8) Implementation Notes

### 8.1 File System Requirements

**Atomic Rename Guarantee**:

- Requires temp file and export file on **same filesystem**
- macOS: APFS guarantees atomic rename
- Linux: ext4, btrfs, xfs guarantee atomic rename
- Network mounts: **NOT GUARANTEED** (ENETDOWN error path required)

### 8.2 Performance Targets

**Export Latency**:

- Target: < 50ms p95 for 1KB markdown files
- Breakdown:
  - Write temp file: ~10ms
  - fsync: ~15ms
  - Rename: ~5ms
  - Audit record: ~10ms
  - Total: ~40ms (10ms buffer)

**Concurrency**:

- Single-threaded (MPPP direct-export)
- Phase 2+: Worker pool (max 5 concurrent exports)

### 8.3 Security Considerations

**Path Traversal Prevention**:

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

**Vault Path Validation**:

- Must be absolute path
- Must be within user's home directory (prevent writing to system directories)
- Must not be symlink (prevent symlink attacks)

---

## 9) Revision History

- **v1.0.0-MPPP** (2025-09-27): Phase 1 release version
  - Full tech spec aligned with PRD v1.0.0-MPPP and ARCH v1.0.0-MPPP
  - Atomic writer contracts with fsync/rename ordering
  - Collision policy and error handling taxonomy
  - TDD decision with HIGH risk classification
- **v0.2.0** (2025-09-27): Full tech spec expansion for Task 4.1 (atomic writer contracts)
- **v0.1.0** (2025-09-27): Initial draft stub
