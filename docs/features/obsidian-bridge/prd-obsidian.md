---
title: Obsidian Bridge PRD
status: living
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-28
spec_type: prd
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Obsidian Bridge — Product Requirements Document

## 1. Executive Summary

### Product Vision

The **Obsidian Bridge** is the **atomic write layer** between the Staging Ledger and Obsidian vault—ensuring zero partial writes, zero vault corruption, and deterministic ULID-based filenames. It transforms staged captures into properly formatted markdown files with atomic temp-then-rename semantics.

### Core Insight

Writing directly to an Obsidian vault risks:

1. Partial writes during crashes
2. Sync conflicts with Obsidian Sync/iCloud
3. Duplicate files with slightly different names
4. Lost metadata during manual filing

The Obsidian Bridge solves this by providing:

1. **Atomic writes** - Temp file → rename (no partial writes ever)
2. **ULID filenames** - Deterministic, time-orderable, collision-resistant
3. **Idempotent exports** - Same capture → same filename (retry safe)
4. **Audit trail** - Export success/failure logged to `exports_audit`

### Success Metric

**One Number:** Zero partial writes over 100 exports with < 50ms p95 export time, proven through 7 days of production usage.

### Alignment with Master PRD

This PRD implements the **Obsidian Export** component from Master PRD v2.3.0-MPPP, Section 4.3. It delivers the vault write safety for Phase 1 (Core Ingestion) as defined in Roadmap v2.0.0-MPPP.

---

## 2. Problem Definition

### The Vault Safety Gap

Current approaches to writing Obsidian files fail in these ways:

1. **Direct Writes:** Risk partial files if process crashes mid-write
2. **Non-Atomic Renames:** Obsidian Sync can catch file in transition
3. **Timestamp Filenames:** Collisions possible, no dedup guarantee
4. **No Audit Trail:** Can't verify which captures were exported successfully

### User Pain Points

**Nathan (Primary User):**

- "My vault has partial markdown files from interrupted exports—which are valid?"
- "I exported the same capture twice with different filenames—now I have duplicates"
- "Obsidian Sync created conflicts because it saw the file during write"
- "I can't verify which staged captures actually made it to the vault"

### Failure Modes We're Preventing

| Failure Mode          | Without Atomic Bridge           | With Obsidian Bridge                      |
| --------------------- | ------------------------------- | ----------------------------------------- |
| **Crash mid-write**   | Partial markdown file in vault  | Temp file discarded, vault unchanged      |
| **Duplicate exports** | Multiple files for same capture | ULID ensures same filename on retry       |
| **Sync conflicts**    | Obsidian catches file mid-write | Atomic rename = file appears complete     |
| **Lost audit trail**  | No record of export success     | `exports_audit` table tracks every export |

---

## 3. User Personas & Jobs-to-be-Done

### Primary User: Nathan (ADHD Engineer)

**Context:**

- Obsidian vault is canonical knowledge store
- iCloud Drive or Obsidian Sync enabled
- High anxiety around vault corruption
- Needs reliability over features

**Jobs-to-be-Done:**

1. **Export captures atomically** without risking vault corruption
2. **Avoid duplicate files** through deterministic ULID filenames
3. **Resume after crashes** knowing partial writes never hit vault
4. **Verify exports** through audit trail in staging ledger
5. **Trust the system** through temp-then-rename safety

### Secondary User: Future ADHD Knowledge Workers

**Shared Needs:**

- Vault safety (no corrupted files)
- Deduplication (no duplicate filenames)
- Audit trail (what was exported, when)
- Fast exports (< 50ms, imperceptible)

**Variable Factors:**

- Vault location (iCloud, Obsidian Sync, Dropbox)
- Vault size and organization
- Export volume (10-200 exports/day)

---

## 4. Scope Definition (MPPP Constraints)

### In Scope (Phase 1)

✅ **Atomic Writer Contract:**

- TypeScript interface: `AtomicWrite(capture_id, content, vault_path) → Result<export_path>`
- Temp file creation in `.trash/` directory
- Atomic rename to `inbox/{ULID}.md`
- ULID = capture.id (deterministic, collision-resistant)

✅ **Export Operations:**

- Markdown formatting with frontmatter
- ULID-based filename (`{capture.id}.md`)
- Temp-then-rename for atomicity
- Export audit record creation

✅ **Error Handling:**

- Vault write permission errors
- Disk full errors
- ULID collision detection (retry with new ULID)
- Temp file cleanup on failure

✅ **Invariants:**

- Export filename exactly matches capture.id (ULID)
- No file appears in vault until completely written
- Every export recorded in `exports_audit` table
- Same capture → same filename (idempotent)

### Out of Scope (YAGNI Boundaries)

❌ **Not Building (Phase 1):**

- PARA classification or smart filing
- Daily note integration or backlinks
- Inbox triage UI
- Template-based filename generation
- Conflict resolution beyond atomic writes
- Multiple vault support
- Obsidian plugin integration

❌ **Deferred Features with Triggers:**

| Feature                  | Defer Reason                | Trigger to Revisit                      |
| ------------------------ | --------------------------- | --------------------------------------- |
| BLAKE3 for content hash  | SHA-256 sufficient          | Measured collision OR >1000 exports/day |
| Vault write retry logic  | Atomic rename = single-shot | >5% export failure rate                 |
| Template-based filenames | ULID sufficient for Phase 1 | User requests custom naming in Phase 2  |
| Daily note backlinks     | Not in Phase 1 scope        | Phase 3 inbox triage implementation     |

---

## 5. Functional Requirements

### 5.1 Atomic Writer Contract

**TypeScript Interface:**

```typescript
export interface AtomicWriteResult {
  success: boolean
  export_path?: string
  error?: string
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
   */
  writeAtomic(
    capture_id: string,
    content: string,
    vault_path: string
  ): Promise<AtomicWriteResult>
}
```

### 5.2 Export Path Resolution

**Filename Format:**

- `{vault_path}/inbox/{ULID}.md`
- ULID sourced from `captures.id` (no generation at export time)
- Example: `/Users/nathan/vault/inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md`

**Collision Handling:**

If `fs.existsSync(export_path)`:

1. Check if existing file matches content_hash
2. If match → mark as `exported_duplicate`, return success
3. If mismatch → CRITICAL ERROR, halt, log to errors_log
   - **Rationale:** ULID collision with different content = data integrity violation
   - **Recovery:** Manual investigation required

### 5.3 Temp-Then-Rename Atomicity

**Write Sequence:**

1. `temp_path = {vault_path}/.trash/{capture_id}.tmp`
2. `fs.writeFileSync(temp_path, content)`
3. `fs.renameSync(temp_path, export_path)` (atomic on APFS/ext4)
4. Record success in `exports_audit` table

**Error Handling:**

- **EACCES (permission denied):** Log to errors_log, retry with exponential backoff
- **ENOSPC (disk full):** Log to errors_log, halt export worker
- **EEXIST (file exists after rename):** See collision handling above
- **Other errors:** Log to errors_log, mark capture as `failed_export`

### 5.4 Export Audit Trail

**Linked Table:** `exports_audit` (see Staging Ledger PRD §5.2)

**Contract:**

```sql
-- Foreign key constraint enforced
FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
```

**Audit Record Created:**

- On successful export → `exports_audit.export_path` = `inbox/{ULID}.md`
- On ULID collision → `exports_audit.notes` = "Duplicate detected, skipped"
- On write failure → Record in `errors_log` instead (no audit entry)

---

## 6. Non-Functional Requirements

### 6.1 Performance

- **Export time:** < 50ms p95 for 1KB markdown files
- **Disk I/O:** Single write + rename (no redundant reads)
- **Vault lock:** < 5ms holding exclusive write lock

### 6.2 Reliability

- **Atomic guarantee:** 100% of exports either complete or leave no trace
- **Collision resistance:** < 1 collision per 1 billion ULIDs (per spec)
- **Idempotency:** Same capture_id → same filename → same audit record

### 6.3 Privacy

- No network requests (local vault writes only)
- No telemetry beyond local `.metrics/` NDJSON
- No cloud dependencies

### 6.4 Accessibility

- Markdown files fully accessible to screen readers
- ULID filenames sortable chronologically
- No binary formats or proprietary encodings

---

## 7. TDD Applicability Decision

### Risk Assessment

- **Risk Level:** HIGH
- **Justification:**
  - Vault corruption = data loss (P0 failure mode)
  - Partial writes = sync conflicts + user anxiety
  - ULID collisions with different content = integrity violation

### TDD Decision

- **Decision:** TDD Required
- **Scope:**
  - Unit tests: Atomic write contract, filename generation, collision detection
  - Integration tests: End-to-end export with temp file verification
  - Contract tests: `exports_audit` table foreign key constraints

### Test Coverage Requirements

- **Unit:** 100% coverage for `AtomicWriter.writeAtomic()`
- **Integration:** Happy path + EACCES, ENOSPC, EEXIST error paths
- **Contract:** Verify foreign key cascade deletes work correctly

**Reference:** See Staging Ledger PRD §9 for TDD pattern template.

---

## 8. Locked Decisions

### Directionality & Guardrails

1. **ULID = Filename:** No separate filename generation logic (reduces moving parts)
2. **Inbox-Only (Phase 1):** No PARA classification, all exports → `inbox/`
3. **Temp in .trash/:** Obsidian ignores `.trash/` directory (no sync pollution)
4. **Single Vault:** No multi-vault support (YAGNI, single user assumption)
5. **No Conflict Resolution:** Rely on atomic rename + ULID determinism

### Invariants & Contracts

**Invariants:**

- `export_path` filename exactly matches `captures.id`
- Temp file never visible to Obsidian Sync
- Every export logged in `exports_audit` OR `errors_log` (never lost)

**Contracts:**

- Staging Ledger provides `captures.id` as ULID
- Obsidian Bridge consumes `content_hash` for dedup
- Export audit table linked via foreign key

---

## 9. Open Questions

None. All Phase 1 scope decisions locked.

---

## 10. Success Criteria

### Phase 1 Success Criteria

1. **Zero partial writes** over 100 exports with crash testing
2. **Zero ULID collisions** in 7 days of production usage
3. **100% export audit coverage** (every export tracked)
4. **< 50ms p95 export time** measured via metrics

### Master PRD Success Criteria Alignment

This PRD maps to Master PRD v2.3.0-MPPP §11.1:

- ✅ "Export to vault" = Atomic writer operational
- ✅ Linked test: `test-obsidian-atomic-write.spec.ts`

---

## 11. Related Documents

- Master PRD: `../../master/prd-master.md` (v2.3.0-MPPP)
- Staging Ledger PRD: `../staging-ledger/prd-staging.md` (for `exports_audit` contract)
- Roadmap: `../../master/roadmap.md` (v2.0.0-MPPP)
- Specs: `spec-obsidian-arch.md`, `spec-obsidian-tech.md`, `spec-obsidian-test.md`
- Usage Guide: `../../guides/guide-obsidian-bridge-usage.md` - Developer quick-start for atomic writer integration

**Related ADRs:**

- [ADR 0009: Atomic Write via Temp-Then-Rename Pattern](../../adr/0009-atomic-write-temp-rename-pattern.md) - Rationale for temp-then-rename atomicity strategy
- [ADR 0010: ULID-Based Deterministic Filenames](../../adr/0010-ulid-deterministic-filenames.md) - Decision to use ULID as exact filename
- [ADR 0011: Inbox-Only Export Pattern](../../adr/0011-inbox-only-export-pattern.md) - Phase 1 decision to export to single inbox directory
- [ADR 0012: TDD Required for High-Risk Obsidian Bridge](../../adr/0012-tdd-required-high-risk.md) - Testing strategy for vault operations

---

## 12. Revision History

- **v1.0.0-MPPP** (2025-09-28): Promoted to living status (P2-2 phase)
- **v1.0.0-MPPP** (2025-09-27): Full PRD expansion for Phase 1 scope
- **v0.1.0** (2025-09-27): Initial draft stub
