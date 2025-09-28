---
title: Staging Ledger PRD
status: final
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-27
spec_type: prd
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Staging Ledger — Product Requirements Document

## 1. Executive Summary

### Product Vision

The **Staging Ledger** is the **durability backbone** of the ADHD Brain capture system—a minimal SQLite database that ensures **zero data loss** between capture and Obsidian vault export. It provides the critical staging layer that makes burst capture safe, enables deduplication, and maintains an immutable audit trail.

### Core Insight

Obsidian's markdown files are perfect for knowledge storage but terrible for capture durability. Writing directly to the vault risks corruption, sync conflicts, and data loss. The staging ledger solves this by providing:

1. **Atomic capture durability** - Every thought hits SQLite first (< 100ms)
2. **Content-hash deduplication** - No duplicate exports ever
3. **Process resumption** - Crash-safe with WAL mode
4. **Audit transparency** - Every export traceable forever

SQLite staging is like ADHD thought's waiting room—everyone gets a number (ULID), no one gets lost, and the important ones (deduped by hash) don't have to repeat themselves. Still smaller than your working memory window. 🏢

### Success Metric

**One Number:** Zero data loss over 50+ captures with < 100ms capture-to-staging time, proven through 7 days of production usage.

### Alignment with Master PRD

This PRD implements the **SQLite Staging Ledger** component from Master PRD v2.3.0-MPPP, Section 4.2. It delivers the durability foundation for Phase 1 (Core Ingestion) and Phase 2 (Hardening) as defined in Roadmap v2.0.0-MPPP.

---

## 2. Problem Definition

### The Durability Gap

Current ADHD capture approaches fail in these ways:

1. **Direct Vault Writes:** Risk corruption, conflicts, partial writes during crashes
2. **Memory-Only Staging:** Lose everything on crash (common in ADHD interrupt-heavy environments)
3. **Cloud Staging:** Privacy violation, network dependency, vendor lock-in
4. **Full Database:** Becomes parallel knowledge system (scope creep, maintenance burden)

### User Pain Points

**Nathan (Primary User):**

- "I just captured 5 thoughts in 30 seconds and the app crashed—did I lose them?"
- "I already captured this thought yesterday, but I can't remember—now I have duplicates everywhere"
- "My Obsidian vault has sync conflicts from interrupted writes—which version is correct?"
- "I want to see what failed during capture without digging through log files"

### Failure Modes We're Preventing

| Failure Mode | Without Staging | With Staging Ledger |
|--------------|-----------------|---------------------|
| **App crash mid-capture** | Thought lost forever | Staged row persists, resumes on restart |
| **Duplicate uncertainty** | Manual checking, anxiety | Content hash prevents duplicate exports |
| **Vault corruption** | Partial markdown files | Atomic writes only after staging complete |
| **Lost error context** | Opaque failures | Structured error log with capture linkage |
| **Sync conflicts** | Multiple partial writes | Single atomic export per capture |

---

## 3. User Personas & Jobs-to-be-Done

### Primary User: Nathan (ADHD Engineer)

**Context:**

- Burst capture patterns (3-5 thoughts in rapid succession)
- Interrupt-heavy environment (context switching every 3-7 minutes)
- High anxiety around lost thoughts
- Needs reliability over features

**Jobs-to-be-Done:**

1. **Durably stage thoughts** without waiting for transcription/processing
2. **Avoid duplicate anxiety** through automatic content-hash checking
3. **Resume after crashes** without losing any staged captures
4. **Debug failures** through structured error logs
5. **Trust the system** through audit trail transparency

### Secondary User: Future ADHD Knowledge Workers

**Shared Needs:**

- Capture durability (no lost thoughts)
- Deduplication (no duplicate vault entries)
- Audit trail (what happened, when)
- Fast staging (< 100ms, imperceptible)

**Variable Factors:**

- Technical comfort level
- Vault size and organization
- Capture volume (10-200 captures/day)

---

## 4. Scope Definition (MPPP Constraints)

### In Scope (Phase 1-2)

✅ **Core Tables (4 Maximum):**

- `captures` - Staging and processing state
- `exports_audit` - Immutable export audit trail
- `errors_log` - Failure tracking and diagnostics
- `sync_state` - Poll cursors and checkpoints

✅ **Durability Features:**

- SQLite WAL mode for crash safety
- Atomic inserts before async processing
- Content-hash based deduplication
- Foreign key constraints for referential integrity

✅ **Processing Features:**

- Status state machine (staged → transcribed → exported)
- Late hash binding for voice transcripts
- Placeholder export path for transcription failures
- Channel-native-ID uniqueness enforcement

✅ **Operational Features:**

- Hourly backup automation with verification
- 90-day retention policy for exported captures
- Error logging with capture linkage
- Metrics emission for observability

### Out of Scope (YAGNI Boundaries)

❌ **Not Building (Phase 3+ or Never):**

- Full-text search indexes (FTS5) - Obsidian has this
- Knowledge graph tables - Not a parallel brain
- Embeddings or vector storage - Deferred to Phase 5+
- Advanced query optimization - SQLite defaults sufficient
- Real-time replication - Single user assumption
- Sharding or partitioning - Scale not needed
- Additional tables beyond 4 - Hard cap enforced

❌ **Deferred Features with Triggers:**

| Feature | Defer Reason | Trigger to Revisit |
|---------|--------------|-------------------|
| BLAKE3 dual-hash | SHA-256 sufficient for MPPP | >200 daily captures OR false duplicate incident |
| Composite indexes | No performance regression yet | Query p95 > 11s AND traced to index scan |
| Partial indexes | Schema simplicity prioritized | Measured 5%+ latency regression over 5k rows |
| Error log pruning | Storage not constrained | errors_log file > 10MB persistent |

---

## 5. Functional Requirements

### 5.1 Schema Architecture

**4-Table Hard Cap:** No additional tables without ADR approval

#### Table 1: captures (Ephemeral Staging)

```sql
CREATE TABLE captures (
  id TEXT PRIMARY KEY,                 -- ULID (time-orderable, export filename)
  source TEXT NOT NULL,                -- 'voice' | 'email'
  raw_content TEXT NOT NULL,           -- Body or transcript (may be placeholder)
  content_hash TEXT UNIQUE,            -- SHA-256 (nullable until available)
  status TEXT NOT NULL,                -- State machine value
  meta_json TEXT,                      -- JSON metadata per source
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Status State Machine:**

```text
staged → transcribed → exported
      ↘ failed_transcription → exported_placeholder
staged (duplicate detected) → exported_duplicate
```

**Rules:**

- Terminal states start with `exported` (immutable)
- Hash may be NULL until transcription completes
- Duplicate detection pre-export sets `exported_duplicate`

#### Table 2: exports_audit (Immutable Trail)

```sql
CREATE TABLE exports_audit (
  id TEXT PRIMARY KEY,                 -- ULID
  capture_id TEXT NOT NULL,
  vault_path TEXT NOT NULL,            -- inbox/<ulid>.md
  hash_at_export TEXT,                 -- Snapshot or NULL for placeholder
  exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  mode TEXT,                           -- initial | duplicate_skip | placeholder
  error_flag INTEGER DEFAULT 0,
  FOREIGN KEY (capture_id) REFERENCES captures(id)
);
```

**Purpose:** Immutable record of every export attempt (forever retention)

#### Table 3: errors_log (Diagnostics)

```sql
CREATE TABLE errors_log (
  id TEXT PRIMARY KEY,
  capture_id TEXT,
  stage TEXT,                          -- poll | transcribe | export | backup | integrity
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (capture_id) REFERENCES captures(id)
);
```

**Purpose:** Structured failure tracking linked to captures

#### Table 4: sync_state (Cursors)

```sql
CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,                -- e.g. gmail_history_id, last_voice_poll
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose:** Track poll cursors to prevent reprocessing

### 5.2 Index Strategy

**Current Indexes (Minimal Set):**

```sql
-- Prevent duplicate staging of same physical/logical item
CREATE UNIQUE INDEX captures_channel_native_uid ON captures(
  json_extract(meta_json, '$.channel'),
  json_extract(meta_json, '$.channel_native_id')
);

-- Fast status filtering for pending exports
CREATE INDEX captures_status_idx ON captures(status);

-- Error stage grouping
CREATE INDEX errors_stage_idx ON errors_log(stage);

-- Audit trail lookup by capture
CREATE INDEX exports_capture_idx ON exports_audit(capture_id);
```

**Deferred Indexes:** Only add if query plan shows >5% latency regression

### 5.3 Content Hash Deduplication

**Hash Normalization Process:**

1. **Text Normalization:**
   - Trim leading/trailing whitespace
   - Convert to consistent line endings (LF)
   - Lowercase for comparison (original preserved)

2. **Hash Computation:**
   - Algorithm: SHA-256 (BLAKE3 deferred per ADR-0002)
   - Input: Normalized text + sorted attachment hashes
   - Output: 64-character hex string

3. **Duplicate Detection:**
   - Query `captures.content_hash` before export
   - If match found: Mark as `exported_duplicate`, skip vault write
   - If no match: Proceed with export

**Voice-Specific Rules:**

- Hash may be NULL during `staged` status (audio fingerprint in meta_json)
- Hash computed after transcription completes
- Hash mutates at most once (staged → transcribed)
- Duplicate detection uses audio fingerprint until transcript available

**Email-Specific Rules:**

- Hash computed immediately (body text available)
- Message-ID also used for deduplication
- Attachment count logged but not downloaded (Phase 2+)

### 5.4 SQLite Configuration

**PRAGMAs (Local-First Defaults):**

```sql
PRAGMA journal_mode = WAL;           -- Write-ahead logging
PRAGMA synchronous = NORMAL;         -- Balance safety/performance
PRAGMA foreign_keys = ON;            -- Referential integrity
PRAGMA busy_timeout = 5000;          -- 5s lock wait
PRAGMA wal_autocheckpoint = 1000;    -- Checkpoint every 1000 pages
```

**Rationale:**

- **WAL mode:** Crash-safe with concurrent reads
- **NORMAL sync:** Acceptable risk for local-only ledger
- **Foreign keys:** Prevent orphaned audit rows
- **Busy timeout:** Handle burst captures without SQLITE_BUSY

### 5.5 Backup & Verification

**Hourly Backup Flow:**

1. **Backup Creation:**

   ```sql
   .backup ./.backups/ledger-YYYYMMDD-HH.sqlite
   ```

2. **Integrity Check:**

   ```sql
   PRAGMA integrity_check;
   ```

3. **Logical Hash Verification:**
   - Compute SHA-256 of sorted `(id, status, content_hash)` from live DB
   - Compute same hash from backup
   - Compare hashes (mismatch = verification failure)

4. **Retention Policy:**
   - Keep last 24 hourly backups
   - Promote 1 per day to daily set (keep last 7)
   - Delete oldest after successful verification

5. **Failure Escalation:**
   - 1 failure: Warn (continue)
   - 2 consecutive: Mark health = `DEGRADED_BACKUP`
   - 3 consecutive: Pause pruning, continue ingestion

**Metrics Emitted:**

- `backup_verification_result{status=success|failure}`
- `backup_duration_ms`
- `backup_size_bytes`

### 5.6 Retention Policies

**Captures Table:**

- Trim only rows with status starting with `exported` after 90 days
- **Never auto-trim:** `staged`, `transcribed`, `failed_transcription`
- Rationale: Non-exported rows need manual inspection

**Exports Audit:**

- Retain forever (minimal footprint ~1MB per 10k exports)

**Errors Log:**

- Optionally trim > 90 days (deferred to Phase 2+)
- Trigger: File size > 10MB persistent

**Sync State:**

- Retain forever (< 100 rows expected)

---

## 6. User Workflows

### Workflow 1: Voice Capture (Happy Path)

**Scenario:** User records voice memo, app transcribes and exports to vault

```text
1. Voice polling detects new .m4a file
2. Insert capture row (status='staged', audio_fp in meta_json)
   → Durability achieved (< 100ms)
3. Download file via icloudctl (if dataless)
4. Transcribe via Whisper (medium model)
5. Update capture: content_hash + status='transcribed'
6. Check duplicate (query content_hash)
7. Export to vault: inbox/01HQW3P7XK.md
8. Insert exports_audit row
9. Update capture: status='exported'

Result: Thought safely in vault, audit trail complete
```

### Workflow 2: Voice Transcription Failure

**Scenario:** Whisper fails, but export still happens

```text
1-3. Same as happy path
4. Whisper transcription fails (corrupted audio, timeout)
5. Update capture: status='failed_transcription'
6. Export placeholder to vault:
   ---
   [TRANSCRIPTION_FAILED]
   Audio: /path/to/memo.m4a
   Error: Whisper timeout after 30s
   ---
7. Insert exports_audit (mode='placeholder', error_flag=1)
8. Insert errors_log (stage='transcribe', message='...')
9. Update capture: status='exported_placeholder'

Result: User sees placeholder, can retry manually
```

### Workflow 3: Duplicate Detection

**Scenario:** User captures same thought twice

```text
1. Email polling fetches message
2. Extract body text, compute content_hash
3. Insert capture row (status='staged')
4. Query: SELECT id FROM captures WHERE content_hash = ?
   → Match found (existing capture from yesterday)
5. Insert exports_audit (mode='duplicate_skip')
6. Update capture: status='exported_duplicate'
7. No vault write

Result: Zero anxiety—system knew it was duplicate
```

### Workflow 4: Crash Recovery

**Scenario:** App crashes mid-transcription

```text
1. User captures 3 voice memos rapidly
2. Memo 1 exported successfully (status='exported')
3. Memo 2 mid-transcription when crash occurs (status='staged')
4. Memo 3 not yet processed (status='staged')

--- CRASH ---

5. User restarts app
6. Query: SELECT * FROM captures WHERE status IN ('staged', 'transcribed', 'failed_transcription')
7. Resume processing for Memos 2 and 3
8. User sees notification: "Recovered 2 captures"

Result: Zero data loss, seamless recovery
```

### Workflow 5: Health Check (Doctor Command)

**Scenario:** User runs `capture doctor` to diagnose issues

```text
1. Run health command
2. Check captures table connectivity
3. Verify foreign key constraints enabled
4. Query errors_log for last 24 hours
5. Check last successful backup timestamp
6. Display queue depth (staged + transcribed count)
7. Show placeholder ratio (last 7 days)
8. Test vault path writability

Output:
✓ SQLite connection: OK
✓ Foreign keys: Enabled
✓ Last backup: 15 minutes ago (verified)
⚠ Errors (24h): 2 transcription failures
✓ Queue depth: 0 pending
✓ Placeholder ratio: 2% (target < 5%)
✓ Vault path: Writable

Result: User has visibility into system health
```

---

## 7. Non-Functional Requirements

### 7.1 Performance Targets

| Operation | Target | Measurement | Priority |
|-----------|--------|-------------|----------|
| Capture → SQLite insert | < 100ms | Time to first write | P0 |
| Duplicate check (hash query) | < 10ms | Query execution | P0 |
| Backup creation | < 5s | .backup command | P1 |
| Backup verification | < 10s | Hash computation | P1 |
| Retention cleanup (90d) | < 30s | DELETE batch | P2 |

**Monitoring:**

- `capture_staging_ms{source=voice|email}`
- `dedup_check_ms`
- `backup_duration_ms`

### 7.2 Reliability Requirements

| Aspect | Requirement | Verification Method |
|--------|-------------|---------------------|
| Durability | 100% capture retention | 50 captures with zero loss |
| Idempotency | Zero duplicate exports | Replay same capture 3x → 1 vault file |
| Atomicity | No partial writes | Crash mid-export → no temp files remain |
| Recovery | Auto-resume on restart | Kill process mid-transcription → restart → resume |
| Backup verification | 7 consecutive successes | Phase 2 hardening gate |

### 7.3 Storage Constraints

**SQLite Size Limits:**

- **Captures table:** ~50MB expected for 10k rows (trim at 90 days)
- **Exports audit:** ~10MB expected for 100k rows (forever retention)
- **Errors log:** ~5MB expected for 10k errors (optional trim)
- **Total database:** Warn at 100MB, hard limit 500MB

**Disk Space Requirements:**

- SQLite database: ~100MB average
- Backup retention: ~2.4GB (24 hourly × 100MB)
- Metrics logs: ~10MB per month (.ndjson files)

**Trigger to Revisit:** Total database > 500MB (evaluate partitioning or aggressive pruning)

### 7.4 Privacy & Security

**Local-First Guarantees:**

- No external network access from SQLite layer
- All data stored on local filesystem
- No cloud sync or replication
- Backup files remain local

**Data Integrity:**

- Foreign key constraints prevent orphans
- UNIQUE constraints prevent duplicate staging
- WAL mode prevents corruption on crash

**Access Control:**

- File system permissions (user-only read/write)
- No authentication layer (single user assumption)

### 7.5 Observability

**Metrics (Local NDJSON):**

- `capture_staging_ms{source}` - Time to insert
- `dedup_hits_total` - Duplicate detection count
- `export_failures_total` - Failed vault writes
- `transcription_queue_depth` - Pending transcriptions
- `placeholder_export_ratio` - Daily aggregation
- `backup_verification_result{status}` - Success/failure

**Activation:** `CAPTURE_METRICS=1` environment variable
**Storage:** `./.metrics/YYYY-MM-DD.ndjson`
**Privacy:** Local-only, no external transmission

---

## 8. Invariants & Contracts

### 8.1 Data Invariants (Must Never Violate)

| # | Invariant | Enforcement | Test Strategy |
|---|-----------|-------------|---------------|
| 1 | Export filename ULID == captures.id | Convention | Property test mapping |
| 2 | One non-placeholder export per capture | Status machine | Attempt double export → noop |
| 3 | (channel, channel_native_id) unique | UNIQUE INDEX | Duplicate insert → constraint error |
| 4 | Voice hash mutates at most once | Business rule | Re-transcription attempt → reject |
| 5 | Placeholder exports immutable | No mutation path | Update attempt → error |
| 6 | Backup verification before pruning | Process order | Fault injection validation |
| 7 | No orphan audit rows | FOREIGN KEY | Insert without capture → error |
| 8 | Non-exported rows never trimmed | Retention filter | Snapshot comparison test |

### 8.2 API Contracts

**Capture Insert:**

```typescript
interface CaptureInsert {
  id: string;              // ULID
  source: 'voice' | 'email';
  raw_content: string;
  content_hash?: string;   // Optional until available
  status: 'staged';        // Always starts staged
  meta_json: Record<string, unknown>;
}
// Returns: { success: boolean; id: string; }
```

**Duplicate Check:**

```typescript
interface DuplicateCheck {
  content_hash: string;
}
// Returns: { is_duplicate: boolean; existing_id?: string; }
```

**Export Audit:**

```typescript
interface ExportAudit {
  capture_id: string;
  vault_path: string;
  hash_at_export: string | null;
  mode: 'initial' | 'duplicate_skip' | 'placeholder';
}
// Returns: { success: boolean; audit_id: string; }
```

---

## 9. TDD Applicability Decision

**Per TDD Applicability Guide v1.0.0 (Section 2-3)**

### Risk Classification: HIGH

**Rationale:** Staging ledger failures cause data loss, duplicate anxiety, or vault corruption—all critical user trust violations.

### Decision: TDD Required (Test-Driven Development Mandatory)

**Why:**

- 💾 **Storage integrity:** SQLite schema, transactions, migrations
- 🔁 **Concurrency safety:** WAL mode, concurrent reads, atomic writes
- 🧠 **Core deduplication:** Content hash computation and duplicate detection
- 🔐 **Data durability:** No captures lost on crash

### Scope Under TDD

**Unit Tests (Required):**

- Content hash normalization (deterministic output)
- Status state machine transitions
- ULID generation and validation
- Text normalization functions
- Hash collision handling (theoretical)

**Integration Tests (Required):**

- Capture insert → duplicate check → export flow
- Crash recovery (staged → resume)
- Backup creation → verification flow
- Retention policy execution (90-day trim)
- Foreign key constraint enforcement

**Contract Tests (Required):**

- Capture insert API contract
- Duplicate check API contract
- Export audit API contract
- Error log API contract

**Fault Injection Tests (Phase 2):**

- Crash after capture insert
- Crash after transcription complete
- Crash before export write
- Crash after temp file write (pre-rename)
- Crash after audit insert (pre-status update)

### Out-of-Scope (YAGNI Deferrals)

**Not Testing Now:**

- Performance benchmarks (defer to Phase 2+ if p95 > 11s)
- Load testing (single user assumption)
- Concurrent write stress (sequential processing only)
- Multi-device sync (out of scope)
- Advanced query optimization (no regression yet)

### Trigger to Revisit TDD Scope

| Condition | Action |
|-----------|--------|
| Introduce concurrency | Add race condition tests |
| Add BLAKE3 dual-hash | Test hash migration path |
| Database size > 500MB | Add performance regression tests |
| False duplicate incident | Enhance hash collision testing |

---

## 10. Integration Points

### 10.1 Upstream Dependencies

**From Voice Capture:**

- Audio fingerprint (SHA-256 of first 4MB)
- Whisper transcript text
- File path reference (never moved per ADR-0001)
- Processing status updates

**From Email Capture:**

- Message-ID (native deduplication)
- Normalized body text
- Email metadata (from, subject, timestamp)
- Attachment count (not downloaded in MPPP)

### 10.2 Downstream Consumers

**To Obsidian Bridge:**

- Capture data for vault export
- Content hash for duplicate prevention
- Audit trail for transparency
- Error logs for diagnostics

**To CLI (Health Command):**

- Queue depth metrics
- Error log summary
- Backup verification status
- Retention policy status

### 10.3 Shared Components

**With Both Capture Channels:**

- Content hash computation (identical normalization)
- Duplicate detection logic (shared query)
- Export audit insertion (same API)
- Error logging (same structure)

---

## 11. Success Criteria & Acceptance Tests

### 11.1 Phase 1 Success Criteria (Core Ingestion)

**Core Functionality:**

- [ ] All 4 tables created with correct schema
- [ ] All indexes created and verified
- [ ] Foreign key constraints enforced
- [ ] WAL mode enabled and verified
- [ ] Content hash deduplication working

**Durability Tests:**

- [ ] 50 captures with zero data loss
- [ ] Crash recovery test: Kill mid-transcription → restart → resume
- [ ] Duplicate detection: Same content → single vault file
- [ ] Placeholder export: Transcription failure → placeholder written

**Performance Gates:**

- [ ] Capture insert < 100ms (p95)
- [ ] Duplicate check < 10ms (p95)
- [ ] Backup creation < 5s (p95)

### 11.2 Phase 2 Success Criteria (Hardening)

**Reliability Tests:**

- [ ] 7 consecutive successful backup verifications
- [ ] Retention policy: 90-day trim removes only exported rows
- [ ] Fault injection: All 5 crash points recover correctly
- [ ] Error logging: All failures captured with context

**Operational Readiness:**

- [ ] Health command reports accurate status
- [ ] Metrics collection working (local NDJSON)
- [ ] Backup retention policy enforced (24 hourly + 7 daily)

### 11.3 v1.0 Launch Criteria

**Production Validation:**

- [ ] 14 days personal usage (dogfooding)
- [ ] 50+ deduplicated captures validated
- [ ] Zero vault corruption events
- [ ] Zero data loss incidents
- [ ] All acceptance tests passing in CI

**Documentation Complete:**

- [ ] Schema reference published
- [ ] API contracts documented
- [ ] Troubleshooting guide written
- [ ] Migration path documented (future-proofing)

---

## 12. Risk Analysis & Mitigation

### 12.1 High-Priority Risks

| Risk | Impact | Probability | Mitigation | Status |
|------|--------|-------------|------------|--------|
| Data loss (crash during capture) | Critical | Medium | WAL mode + atomic insert | Required |
| SQLite corruption | Critical | Low | Hourly backups + verification | Required |
| Duplicate exports (dedup failure) | High anxiety | Low | SHA-256 hash + unique constraint | Required |
| Backup verification drift | High | Medium | Consecutive failure escalation | Required |
| Storage runaway growth | Medium | Low | 90-day retention + size monitoring | Required |

### 12.2 Medium-Priority Risks

| Risk | Impact | Probability | Mitigation | Status |
|------|--------|-------------|------------|--------|
| Hash collision (SHA-256) | Low | Extremely low | Accept risk (2^256 collision space) | Accepted |
| Performance degradation (> 10k captures) | Medium | Medium | Monitor p95, add indexes if needed | Monitor |
| Backup storage exhaustion | Low | Low | Retention policy enforcement | Automated |

### 12.3 Deferred Risks (Future Phases)

| Risk | Defer Reason | Revisit Trigger |
|------|--------------|-----------------|
| Multi-device sync conflicts | Single user assumption | Second device request |
| Advanced query performance | No regression observed | p95 > 11s traced to query |
| BLAKE3 migration complexity | SHA-256 sufficient for MPPP | >200 daily captures sustained |

---

## 13. Decisions (Locked)

### Directionality & Guardrails

**Locked Decisions (Cannot Change Without ADR):**

1. **4-Table Hard Cap:** No additional tables in MPPP scope
   - Rationale: Prevent scope creep, SQLite is staging not knowledge base
   - Override: Requires ADR approval + Master PRD update

2. **SHA-256 Content Hash:** Sufficient for Phase 1-2
   - Rationale: 2^256 collision space, battle-tested, widely supported
   - Migration Path: ADR-0002 defines BLAKE3 adoption if needed

3. **WAL Mode (NORMAL Sync):** Balance safety and performance
   - Rationale: Local-only ledger, acceptable crash window
   - Override: Only if data loss incidents occur

4. **90-Day Retention (Exported Only):** Non-exported rows preserved
   - Rationale: Manual inspection needed for failed captures
   - Override: Only if storage exceeds 500MB

5. **Foreign Key Constraints:** Always enabled
   - Rationale: Prevent orphaned audit rows, maintain integrity
   - Override: Never (data integrity critical)

**YAGNI Boundaries:**

- No full-text search (FTS5) in staging ledger
- No embeddings or vectors
- No graph relationships
- No real-time replication

---

## 14. Open Questions & Future Decisions

### Resolved (Master PRD v2.3.0-MPPP)

- ✅ **Hash algorithm:** SHA-256 (BLAKE3 deferred per ADR-0002)
- ✅ **Retention policy:** 90 days for exported, forever for audit
- ✅ **Table count:** 4 maximum (hard cap enforced)
- ✅ **Backup frequency:** Hourly with verification
- ✅ **Conflict resolution:** ULID filenames prevent collisions

### Remaining for Implementation

1. **Migration Strategy:** Append-only numbered migrations vs schema versioning?
   - Decision Point: First schema change in Phase 2+
   - Recommended: `/migrations/0001_init.sql` pattern

2. **Backup Compression:** Gzip backups to save space?
   - Current: Uncompressed (100MB × 24 = 2.4GB)
   - Trigger: Disk space < 10GB available

3. **Error Log Pruning:** Automatic trim after 90 days?
   - Current: Deferred (low priority)
   - Trigger: errors_log file > 10MB persistent

4. **Metrics Aggregation:** Daily rollups for long-term trends?
   - Current: Raw NDJSON only
   - Trigger: Phase 3+ dashboard request

---

## 15. Related Specifications

### Upstream (Dependencies)

| Document | Relationship |
|----------|--------------|
| [Master PRD v2.3.0-MPPP](../../master/prd-master.md) | Parent specification, Section 4.2 |
| [Roadmap v2.0.0-MPPP](../../master/roadmap.md) | Phase 1-2 delivery schedule |
| [Schema & Indexes](./schema-indexes.md) | Canonical schema reference |
| [TDD Applicability Guide](../../guides/guide-tdd-applicability.md) | Testing strategy framework |

### Downstream (Consumers)

| Document | Relationship |
|----------|--------------|
| [Staging Ledger Architecture Spec](./spec-staging-arch.md) | Component design details |
| [Staging Ledger Tech Spec](./spec-staging-tech.md) | Implementation details |
| [Staging Ledger Test Spec](./spec-staging-test.md) | Test strategy and cases |
| [Capture Feature PRD](../capture/prd-capture.md) | Voice + email ingestion |
| [Obsidian Bridge PRD](../obsidian-bridge/prd-obsidian.md) | Vault export integration |

### Cross-Cutting

| Document | Relationship |
|----------|--------------|
| [Error Recovery Guide](../../guides/guide-error-recovery.md) | Failure handling patterns |
| [ADR-0001: Voice File Sovereignty](../../adr/0001-voice-file-sovereignty.md) | No file relocation principle |
| [ADR-0002: Dual Hash Migration](../../adr/0002-dual-hash-migration.md) | SHA-256 → BLAKE3 path |
| [ADR-0003: Four-Table Hard Cap](../../adr/0003-four-table-hard-cap.md) | Schema boundary enforcement |
| [ADR-0004: Status-Driven State Machine](../../adr/0004-status-driven-state-machine.md) | Capture lifecycle management |
| [ADR-0005: WAL Mode Normal Sync](../../adr/0005-wal-mode-normal-sync.md) | SQLite durability configuration |
| [ADR-0006: Late Hash Binding Voice](../../adr/0006-late-hash-binding-voice.md) | Voice processing strategy |
| [ADR-0007: 90-Day Retention Exported Only](../../adr/0007-90-day-retention-exported-only.md) | Data cleanup policy |
| [ADR-0008: Sequential Processing MPPP](../../adr/0008-sequential-processing-mppp.md) | Processing concurrency model |
| [TestKit Usage Guide](../../guides/guide-testkit-usage.md) | Test isolation patterns |

---

## 16. Appendix: Query Examples

### Common Operations

**Insert Capture:**

```sql
INSERT INTO captures (id, source, raw_content, status, meta_json)
VALUES (?, ?, ?, 'staged', ?);
```

**Duplicate Check:**

```sql
SELECT id FROM captures WHERE content_hash = ? LIMIT 1;
```

**Resume Processing:**

```sql
SELECT * FROM captures
WHERE status IN ('staged', 'transcribed', 'failed_transcription')
ORDER BY created_at ASC;
```

**Error Summary (Last 24h):**

```sql
SELECT stage, COUNT(*) as count
FROM errors_log
WHERE created_at > datetime('now', '-1 day')
GROUP BY stage;
```

**Audit Trail for Capture:**

```sql
SELECT * FROM exports_audit WHERE capture_id = ?;
```

**Retention Cleanup:**

```sql
DELETE FROM captures
WHERE status LIKE 'exported%'
  AND created_at < datetime('now', '-90 days');
```

---

## 17. Document Version

**Version:** 1.0.0-MPPP
**Status:** Final - Ready for Implementation
**Last Updated:** 2025-09-27

### Alignment Verification

- [x] Aligned with Master PRD v2.3.0-MPPP
- [x] Aligned with Roadmap v2.0.0-MPPP
- [x] Schema matches schema-indexes.md (canonical reference)
- [x] TDD decision follows TDD Applicability Guide v1.0.0
- [x] YAGNI boundaries enforced (4 tables, no FTS, no vectors)
- [x] Phase 1-2 scope only (no classification, no inbox UI)
- [x] Success criteria measurable and testable
- [x] Nerdy joke included (Section 1, Executive Summary)

### Changelog

**v1.0.0-MPPP (2025-09-27):**

- Initial comprehensive PRD
- Aligned with MPPP scope reduction
- Incorporated schema-indexes.md as authoritative reference
- Added TDD Applicability Decision (HIGH risk, required)
- Defined all 4 tables, indexes, and constraints
- Established invariants and API contracts
- Documented all user workflows
- Set Phase 1-2 success criteria
- Added risk analysis with mitigations
- Locked architectural decisions

---

## 18. Sign-off Checklist

- [x] Problem clearly defined with failure modes
- [x] User personas and jobs-to-be-done documented
- [x] MPPP scope boundaries enforced (4 tables, no FTS)
- [x] Functional requirements complete (schema, indexes, flows)
- [x] Non-functional requirements measurable (performance, reliability)
- [x] TDD applicability decision documented (HIGH risk, required)
- [x] User workflows cover happy path and failures
- [x] Integration points with capture and export defined
- [x] Success criteria testable and specific
- [x] Risk analysis with mitigations
- [x] Locked decisions documented
- [x] Open questions tracked with triggers
- [x] Related specs referenced
- [x] Nerdy joke included

---

### Next Steps

1. **Begin Implementation (Phase 1, Week 1-2):**
   - Create SQLite schema with 4 tables
   - Implement content hash normalization
   - Build capture insert + duplicate check APIs
   - Write TDD test suite (unit + integration)

2. **Validate Walking Skeleton (Week 2):**
   - End-to-end test: Voice capture → staging → export
   - Crash recovery test: Kill mid-process → resume
   - Duplicate detection test: Same content → single file

3. **Phase 2 Hardening (Week 5-6):**
   - Implement hourly backup automation
   - Add backup verification with escalation
   - Validate fault injection at all crash points
   - 7 days dogfooding with zero data loss

### Success

This PRD delivers the **durability backbone** for ADHD Brain's capture system. The staging ledger ensures zero data loss, automatic deduplication, and audit transparency—all with a 4-table schema that's smaller than your working memory window. Ship it! 🚀
