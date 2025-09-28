# Master PRD v2.3.0-MPPP: ADHD Capture Bridge for Obsidian

_Status: source of truth • Directionality: one-way (staging → Obsidian)_

## 1. Executive Summary

### Product Vision

Build a **zero-friction capture layer** with a **durable staging ledger** that bridges the gap between ADHD thoughts and Obsidian's PARA-organized vault, ensuring no thought is lost and organization is automatic.

### Core Insight

Obsidian excels at knowledge management but fails at rapid capture. This system provides Obsidian's missing capture layer with a **SQLite staging ledger** for durability and deduplication, while keeping Obsidian markdown as the canonical knowledge store.

### Assumptions

- **Single user** running on **macOS Sonoma+** (APFS dataless file support required)
- **Local Obsidian vault** path resolvable and writable
- **iCloud Voice Memos** enabled with download capability
- **Gmail API OAuth2 credentials** available (credentials.json from Google Console)
- **Swift toolchain** available (fallback to prebuilt universal binary for icloudctl)

### Whisper Integration Note

Transcription powered by **Whisper medium model**, running **locally only** with **sequential job processing** (no parallel transcription). Swift helper (`icloudctl`) manages APFS dataless file downloads and audio fingerprinting.

### Success Metric

**One Number:** Time from thought to safely staged < 3 seconds, to filed Obsidian note < 10 seconds, with zero data loss.

## 2. Problem Definition

### The ADHD-Obsidian Paradox

- **Obsidian's Strength:** Perfect for organizing knowledge with PARA method
- **Obsidian's Weakness:** No capture durability, requires conscious filing decisions
- **ADHD Reality:** Thoughts evaporate during app switching, crashes lose everything
- **Current Workarounds:** Multiple capture apps → sync conflicts, lost thoughts, abandoned tools

### The Durability Gap

Current capture tools either:

1. **Write directly to Obsidian:** Risk corruption, conflicts, partial writes
2. **Use separate databases:** Become parallel knowledge systems (scope creep)
3. **Use cloud services:** Privacy concerns, network dependency

Our solution: **Minimal SQLite staging** - just enough database for safety, not enough to become a second brain.

### Failure Modes We're Preventing

1. **Capture Loss:** App crash, Obsidian sync conflict, interrupted writes
2. **Duplicate Anxiety:** "Did I already capture this?" → duplicate notes everywhere
3. **Inbox Blindness:** Can't query unfiled items efficiently
4. **Vault Corruption:** Partial writes, sync conflicts, race conditions

## 3. User Persona

### Primary: Nathan (You)

- **Context:** Software engineer with ADHD, existing Obsidian PARA vault
- **Pain Points:** Lost thoughts during crashes, duplicate captures, inbox overwhelm
- **Capture Patterns:** Burst capture (multiple thoughts rapidly), interrupt-heavy environment
- **Technical Comfort:** High—comfortable with SQLite, understands transactions
- **Privacy Requirement:** Absolute—local-first, no external dependencies

### Secondary: ADHD Knowledge Workers

- **Context:** Researchers, writers, engineers using Obsidian + PARA
- **Shared Needs:** Capture durability, automatic deduplication, fast inbox processing
- **Variable:** Technical expertise, existing vault structure

## 4. Core Architecture

### 4.1 Three-Layer Architecture

```text
┌──────────────────────────────┐
│     Input Layer              │ Voice / Email
├──────────────────────────────┤
│   SQLite Staging Ledger      │ ← Durability + Deduplication
│   ┌────────────────────┐     │
│   │ captures table     │     │ ULID, content_hash, raw_content
│   │ exports_audit      │     │ Export history + paths
│   │ errors_log         │     │ Failure tracking
│   │ sync_state         │     │ Poll cursor tracking
│   └────────────────────┘     │
├──────────────────────────────┤
│   Processing Pipeline        │ Transcribe, normalize, deduplicate
├──────────────────────────────┤
│   Obsidian Vault            │ Canonical markdown storage (inbox/)
└──────────────────────────────┘
```text

### 4.2 SQLite Staging Ledger Design

#### Purpose & Constraints

- **Durability:** Survive crashes, never lose captures
- **Idempotency:** Content hash prevents duplicate vault writes
- **Scope Limit:** 4 tables maximum, not a knowledge graph
- **Retention:** Audit log forever (minimal), captures until exported
- **File sovereignty (Voice Memos):** Files remain in
  "~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/".
  We never move, rename, or duplicate them; the ledger stores only path, fingerprints, and processing state. iCloud downloads fetch bytes in place; the canonical path does not change.

**SQLite PRAGMAs (local-first defaults)**

- journal_mode=WAL
- synchronous=NORMAL
- foreign_keys=ON
- busy_timeout=5000
- wal_autocheckpoint=1000

**Backups:** hourly `.backup` to `./.backups/ledger-YYYYMMDD-HH.sqlite`
Retain 24 hourly + 7 daily; verify with a checksum and restore test weekly.
Backup verification escalation policy (see Reliability Section): 1 failure = warn; 2 consecutive = `DEGRADED_BACKUP`; 3 consecutive pauses pruning but ingestion continues.

#### Core Tables (Minimal Schema)

```sql
-- Incoming captures (temporary staging)
CREATE TABLE captures (
    id TEXT PRIMARY KEY,           -- ULID for time-ordering
    source TEXT NOT NULL,           -- 'voice' | 'email'
    raw_content TEXT NOT NULL,
    content_hash TEXT UNIQUE,       -- SHA-256, nullable until transcription complete
    status TEXT NOT NULL,           -- state machine: staged | transcribed | failed_transcription | exported | exported_duplicate | exported_placeholder
    meta_json JSON,                 -- file_path, audio_fp, message_id, from, subject, channel_native_id
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Enforce uniqueness of native identifiers per channel (prevents pathological reprocessing)
CREATE UNIQUE INDEX IF NOT EXISTS captures_channel_native_uid ON captures(
  json_extract(meta_json, '$.channel'),
  json_extract(meta_json, '$.channel_native_id')
);

-- Export audit trail (minimal)
CREATE TABLE exports_audit (
    id TEXT PRIMARY KEY,
    capture_id TEXT NOT NULL,
    vault_path TEXT NOT NULL,       -- Format: "inbox/ulid.md"
    hash_at_export TEXT,
    exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    mode TEXT,                      -- 'initial' | 'duplicate_skip'
    error_flag INTEGER DEFAULT 0,
    FOREIGN KEY (capture_id) REFERENCES captures(id)
);

-- Error logging
CREATE TABLE errors_log (
    id TEXT PRIMARY KEY,
    capture_id TEXT,
    stage TEXT,                     -- 'poll' | 'transcribe' | 'export'
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (capture_id) REFERENCES captures(id)
);

-- Poll cursor tracking
CREATE TABLE sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Examples: ('gmail_history_id', '12345'), ('last_voice_poll', '2025-09-27T10:30:00Z')
```

### 4.3 Content Hash Strategy

#### Hash Normalization

```typescript
interface HashableContent {
  text: string;           // Normalized (trimmed, consistent line endings)
  attachments: Array<{
    name: string;
    size: number;
    hash: string;         // Individual file hash
  }>;
  
  computeHash(): string { 
    // Deterministic hash including all attachments
    const normalized = normalizeText(this.text);
    const attachmentHashes = this.attachments
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => a.hash)
      .join('');
    return sha256(normalized + attachmentHashes);
  }
}
```

### 4.4 Capture Flow with Staging

**Voice Capture (v3.1 Ledger Pattern):**

```
1. Poll Apple path → detect new files
2. Check APFS dataless status (via icloudctl)
3. Queue download (semaphore=1, sequential)
4. Insert ledger row (status='staged')
5. Transcribe via Whisper (medium model, local)
6. Update row: content_hash + status='transcribed' (or status='failed_transcription' on failure)
7. Export to vault (inbox/ulid.md) (placeholder `[TRANSCRIPTION_FAILED]` if failure)
8. Insert exports_audit row
9. Update captures status to:
  - `exported` (normal)
  - `exported_placeholder` (if transcription failed)
```

**Email Capture:**

```
1. Poll Gmail API → list new messages
2. Fetch body + headers
3. Normalize text
4. Calculate content_hash
5. Duplicate check (hash + message_id)
6. Insert capture row (status='staged')
7. Export to vault (inbox/ulid.md)
8. Insert exports_audit row
9. Update captures status='exported' or 'exported_duplicate'
```

**Export Path Format:**

- Pattern: `vault_root/inbox/ulid.md`
- ULID filenames prevent collisions
- Flat inbox folder structure (PARA methodology)
- No classification, no daily note linking

## 5. Functional Requirements

### 5.1 Capture Channels (MPPP Scope)

#### Voice Capture (Primary)

- **Polling:** Periodic scan of Apple Voice Memos directory
- **Stage 1:** Detect new .m4a files via APFS-aware ledger (icloudctl)
  - Detect **dataless/local** state
  - **Sequential** download (semaphore=1) with **exponential backoff + jitter**
  - **Skip** files with iCloud conflicts; log error prominently
- **Stage 2:** Insert capture row (status='staged', audio_fp in meta_json)
- **Stage 3:** Transcribe via Whisper medium model (local, sequential)
  - Single retry on failure
  - Placeholder export if transcription fails: `[TRANSCRIPTION_FAILED]` (no retrofill in MPPP)
- **Stage 4:** Update row with content_hash (SHA-256 of transcript text)
- **Stage 5:** Export to vault (inbox/ulid.md) via atomic writer
- **Location policy:** In-place reference only — never copy/move Apple Voice Memos; we store **path + fingerprint** in SQLite
- **Durability:** First-4MB audio **fingerprint** (SHA-256) + SQLite WAL
- **Retention:** Processing state retained **90 days**, audit log forever

#### Email Capture

- **Activation:** Periodic poll (Gmail API with OAuth2)
- **Stage 1:** List new messages (query-based filtering optional, default: all)
- **Stage 2:** Fetch full message (headers + plain text body)
- **Stage 3:** Extract metadata (from, subject, message_id) → meta_json
- **Stage 4:** Normalize body text
- **Stage 5:** Calculate content_hash (SHA-256 of normalized body)
- **Stage 6:** Duplicate check (hash + message_id)
- **Stage 7:** Insert capture row (status='staged')
- **Stage 8:** Export to vault (inbox/ulid.md)
- **Attachment Handling:** Log count only; skip download (Phase 2+ feature)
- **Durability:** Message-ID ensures deduplication across polls

### 5.2 Deduplication Logic

```typescript
interface DeduplicationStrategy {
  checkDuplicate(content: HashableContent): boolean {
    // Query SQLite for existing hash
    const existing = db.query(
      'SELECT id FROM captures WHERE content_hash = ?',
      [content.computeHash()]
    );
    
    if (existing) {
      // Update metadata, don't create duplicate
      return true;
    }
    return false;
  }
}
```

#### Channel-specific hash inputs

- voice: sha256(first_4MB_audio) [+ sha256(transcript) when available]
- web: canonical_url || normalized_article_text || selection_hash
- email: Message-ID || normalized_body || attachment_hashes_sorted
- quick_text: normalized_text

### 5.3 Health Command

**CLI Infrastructure & Serviceability Check:** `capture doctor`

**Infrastructure Validation:**

- Validate vault path exists and is writable
- Check SQLite database connectivity and schema version
- Verify Gmail API authentication status (token.json valid)
- Test icloudctl availability and permissions
- Confirm Whisper model availability (medium.pt)

**Serviceability Diagnostics:**

- Report last successful poll timestamps (voice/email)
- Display error log summary (last 24 hours)
- Check metrics collection status (`CAPTURE_METRICS=1`)
- Validate backup integrity (last hourly backup)
- Test export pathway (temp file write to vault)

**Operational Health:**

- SQLite WAL file size and checkpoint status
- Disk space available (vault path and .metrics directory)
- Memory usage patterns (if telemetry enabled)

### 5.4 Conflict Resolution

**ULID Filenames Prevent Collisions:**

All exports use ULID filenames (`01HQW3P7XKZM2YJVT8YFGQSZ4M.md`), which are globally unique and time-ordered. No conflict resolution logic needed. If a file somehow exists, append `-retry` suffix and log warning.

## 6. Non-Functional Requirements

### 6.1 Performance Targets

| Operation | Target | Measurement |
|-----------|---------|------------|
| Capture → SQLite | < 100ms | Time to hash + insert |
| Voice Capture Cycle | < 10s | Poll → transcribe → export |
| Email Capture Cycle | < 3s | Poll → extract → export |
| Duplicate Check | < 10ms | Hash lookup |

### 6.2 Reliability Requirements

| Aspect | Requirement | Implementation |
|--------|-------------|----------------|
| Durability | 100% capture retention | Write-ahead log in SQLite |
| Idempotency | Zero duplicate files | Content hash checking |
| Atomicity | No partial writes | Temp file + rename pattern |
| Recovery | Auto-resume on crash | Process state in captures table |
| Backup | Hourly SQLite backup | Automated .backup command + verification (integrity + hash compare) |
| Path immutability | No relocations/renames performed by system | In-place access; reference by path + fingerprint |

### 6.2.1 Backup & Verification Policy (Consolidated)

**Backup Schedule:**
- **Frequency:** Hourly automated backups using SQLite `.backup` command
- **Location:** `${VAULT_ROOT}/.adhd-brain/.backups/ledger-YYYYMMDD-HH.sqlite`
- **Retention:** 24 hourly snapshots + 7 daily snapshots (oldest hourly pruned after 24h)

**Verification Protocol:**
- **Integrity Check:** SQLite `PRAGMA integrity_check` on each backup
- **Hash Compare:** SHA-256 checksum of backup file vs. live database
- **Restore Test:** Weekly full restore to temporary database + query validation
- **Metric:** `backup_verification_result` (success | failure) logged to metrics

**Escalation Policy (Consecutive Failures):**

| Failures | Status | Action |
|----------|--------|--------|
| 1 failure | `WARN` | Log warning, continue normal operations |
| 2 consecutive | `DEGRADED_BACKUP` | Alert via `capture doctor`, continue operations |
| 3 consecutive | `HALT_PRUNING` | Pause 90-day pruning, preserve all captures, continue ingestion |

**Recovery from Degraded State:**
- Automatic recovery on next successful backup verification
- Manual intervention via `capture doctor --force-backup` to validate backups
- Escalation resets to `WARN` after single success

### 6.3 Storage Constraints

```yaml
SQLite Size Limits:
  captures: Trim exported rows (status begins with 'exported') after 90 days; never auto-trim non-exported or failed rows
  exports_audit: Retain forever (minimal footprint)
  errors_log: Trim after 90 days
  total_size: Warn at 100MB, hard limit 500MB

Attachment Handling:
  max_size: 25MB per file (future)
  storage: File system reference, not BLOB
  cleanup: Remove orphaned after vault write (future)
```

### 6.4 Telemetry & Observability

**Status:** Basic observability included in MPPP

Essential metrics for operational visibility and debugging:

**Core Metrics (Local Only):**

- `capture_voice_staging_ms` - Time to stage voice memo
- `capture_email_staging_ms` - Time to stage email
- `transcription_duration_ms` - Whisper processing time
- `export_write_ms` - Vault file write duration
- `dedup_hits_total` - Duplicate detection count
- `export_failures_total` - Failed vault writes
- `poll_voice_duration_ms` - Voice polling cycle time
- `poll_email_duration_ms` - Email polling cycle time
- `capture_time_to_export_ms` - End-to-end latency per capture (monotonic clock)
- `transcription_queue_depth` - Queue depth snapshot each poll
- `placeholder_export_ratio` - Aggregated daily ratio
- `backup_verification_result` - success/failure event metric

**Storage:** Newline-delimited JSON in `./.metrics/YYYY-MM-DD.ndjson` (rotated daily)
**Privacy:** Local-only, no external transmission
**Activation:** `CAPTURE_METRICS=1` environment variable

## 7. User Workflows

### Workflow 1: Burst Capture (ADHD Pattern)

```text
1. Series of rapid thoughts
2. Cmd+Shift+Space repeatedly
3. Each immediately saved to SQLite
4. Deduplication prevents repeats
5. Background processing queues all
6. Obsidian updated when ready
7. Zero thoughts lost
```text

### Workflow 2: Crash Recovery

```text
1. Mid-capture, app crashes
2. Restart application
3. Scan `captures` for non-exported statuses (`staged`, `transcribed`, `failed_transcription`)
4. Resume processing automatically
5. User notification: "Recovered 3 captures"
6. Continue where left off
```

### Workflow 3: Health Check

```
1. Run `capture doctor` command
2. Verify vault path exists and writable
3. Check SQLite database connectivity
4. Validate Gmail API authentication status
5. Test icloudctl availability and permissions
6. Review error log summary (last 24 hours)
7. Confirm last successful poll timestamps
```

## 8. Export Strategy (No Classification)

### Direct Export to Vault

**MPPP Scope:** No PARA classification, no daily note linking. Raw capture → vault immediately.

**Export Path Format:**

- Pattern: `vault_root/inbox/ulid.md`
- ULID filenames prevent collisions
- Flat inbox folder structure (PARA methodology)
- No automatic categorization or tagging

**Minimal Frontmatter:**

```yaml
---
created: 2025-09-27T10:30:00Z
source: voice | email
capture_id: 01HQW3P7XKZM2YJVT8YFGQSZ4M
---
```

**Future Phases (Deferred):**

- PARA classification (Phase 3+)
- Daily note append (Phase 3+)
- AI-powered categorization (Phase 5+)

## 9. Testing Strategy (TDD Required)

### TDD Applicability Decision

| Component | Risk Class | TDD Required? | Rationale |
|-----------|-----------|---------------|-----------|
| Hash normalization | High | Yes | Determinism critical for dedup |
| Duplicate suppression | High | Yes | Core durability promise |
| Late hash binding (voice) | High | Yes | Transcript updates must be safe |
| Export idempotency | High | Yes | Re-run must not create duplicates |
| Whisper failure → placeholder | Medium | Yes | Graceful degradation path |
| Fault injection recovery | High | Yes | Validates crash invariants |
| CLI argument parsing | Low | No | Standard library, visual testing sufficient |
| Load/performance soak | N/A | Deferred | Phase 2+ only |
| Threaded ingestion | N/A | Deferred | Sequential in MPPP |

**Trigger to revisit:** Introduction of concurrency or async outbox patterns.
Additional triggers:

- Transcription backlog depth > 20 (sustained 30m) OR p95 wait > 2× p95 transcription duration → consider concurrency.
- Placeholder export ratio >5% rolling 7d → evaluate retrofill append mechanism.
- Daily captures > 200 or credible false duplicate → evaluate dual-hash (ADR-0002).

### Test Categories by Risk

| Priority | Category | Coverage Target |
|----------|----------|-----------------|
| P0 - Required | Data integrity | 100% |
| P0 - Required | Deduplication | 100% |
| P0 - Required | Atomic writes | 100% |
| P1 - Recommended | Error recovery | 80% |
| P2 - Optional | CLI output formatting | 60% |

## 10. Risk Analysis & Mitigation

### Technical Risks (Mitigated by Staging)

| Risk | Impact | Mitigation |
|------|--------|------------|
| Capture loss (process crash) | High | Atomic insert before async work; WAL mode |
| Duplicate exports | Medium anxiety | Hash + message_id/audio_fp check |
| Transcription failure | Medium | Placeholder export ensures continuity |
| Backup verification drift | High | Consecutive failure escalation + pause pruning |
| Silent latency backlog growth | Medium | Queue depth + p95 metrics with trigger thresholds |
| Gmail/IMAP auth failure loops | Medium | Cap consecutive failures + alert |
| Disk path misconfig (vault) | High | Pre-start validation + fail-fast |

### Remaining Risks (Deferred)

| Risk | Impact | Mitigation Plan |
|------|--------|-----------------|
| SQLite corruption | Low | Hourly backups, verify with checksum |
| Hash collisions | Extremely low | SHA-256 sufficient for MPPP |
| Storage growth | Low | 90-day cleanup policy |
| Multi-device divergence | N/A | Out of scope (single user) |

## 11. Implementation Roadmap

### Phase 1: Core Ingestion (MPPP Foundation)

**Foundation Components:**

- [ ] Monorepo structure (pnpm workspaces + Turbo)
- [ ] Shared configs (TypeScript, ESLint, Prettier)
- [ ] SQLite schema implementation
- [ ] Content hash implementation (SHA-256)
- [ ] Atomic file writer
- [ ] TestKit integration
- [ ] Basic telemetry infrastructure (local metrics collection)

**Voice Capture Pipeline:**

- [ ] icloudctl integration for APFS dataless handling
- [ ] Voice memo polling (sequential)
- [ ] Whisper transcription (medium model, local)
- [ ] Voice file sovereignty (reference-only, never move)
- [ ] Export to vault (inbox/ flat structure)

**Email Capture Pipeline:**

- [ ] Gmail API OAuth2 setup
- [ ] Email polling (Gmail API)
- [ ] Plain text extraction
- [ ] Email deduplication (message_id + hash)
- [ ] Export to vault (inbox/ flat structure)

**Testing Strategy:**

- ✅ TestKit's built-in isolation (in-memory SQLite)
- ✅ MSW for API mocks (auto-cleanup)
- ✅ Sequential processing only (no port coordination needed)
- ✅ Fault injection hook scaffold (Phase 2 activation)

### Phase 2: Hardening & Reliability

**Error Handling & Recovery:**

- [ ] Error recovery and retry logic
- [ ] Graceful failure handling (Whisper placeholder export)
- [ ] Backup verification (hourly + restore test)
- [ ] Storage cleanup policies (90-day trim)
- [ ] Fault injection crash matrix validation (all hook points)

**Operational Readiness:**

- [ ] Infrastructure health command (`capture doctor`)
- [ ] Beta release validation (personal dogfooding)

### Phase 3+: Future Enhancements (YAGNI - Deferred)

**Not building now:**

- ❌ PARA classification (Phase 3+)
- ❌ Daily note linking (Phase 3+)
- ❌ Inbox UI (Phase 5+)
- ❌ AI/ML features (Ollama, Chroma, embeddings)
- ❌ Web clipper
- ❌ Quick text capture
- ❌ Browser extensions
- ❌ Advanced metrics dashboards (basic observability included in MVP)

**Trigger to revisit:**

- Classification: Manual organization takes > 10 min/day for 2 weeks
- Daily note linking: User explicitly requests feature
- Inbox UI: Batch processing need emerges after 1000+ captures

## 12. Success Criteria

### MVP Definition (End Phase 1)

**Core Functionality:**

- [ ] Voice capture operational (poll → transcribe → export)
- [ ] Email capture operational (poll → extract → export)
- [ ] Deduplication working (hash + message_id/audio_fp)
- [ ] Export to vault (inbox/ flat structure)
- [ ] Audit trail complete
- [ ] Basic observability metrics
- [ ] Infrastructure health command functional

**Test Infrastructure:**

- [ ] TestKit integrated across all packages
- [ ] In-memory database tests passing
- [ ] MSW mocks with auto-cleanup working
- [ ] Test suite runs in < 30 seconds
- [ ] Zero test conflicts with parallel execution

**Quality Gates:**

- [ ] All tests pass in parallel (using TestKit isolation)
- [ ] Zero data loss in 50 real captures
- [ ] CI/CD green for 5 consecutive runs

### Production Ready (End Phase 2)

**Reliability & Operations:**

- [ ] Both capture channels stable
- [ ] Error recovery working (Whisper failure → placeholder)
- [ ] Backup verification passing
- [ ] 99.9% durability proven (50+ captures)
- [ ] 7 days without data loss
- [ ] All fault injection hooks validated (crash → restart → no duplication / loss)
- [ ] Consecutive successful backup verifications ≥ 7

### v1.0 Launch (Production Deployment)

**Validation Criteria:**

- [ ] 14 days personal usage
- [ ] 50+ deduplicated captures validated
- [ ] Zero vault corruption events
- [ ] Performance targets met (< 10s voice cycle, < 3s email cycle)
- [ ] Documentation complete

## 13. Architecture Decisions Record

👉 Related ADRs live in [/docs/adr](../adr). Key decisions documented:

- [ADR-0001: Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md) - Never move/copy Apple Voice Memos
- [ADR-0003: Four-Table Hard Cap](../adr/0003-four-table-hard-cap.md) - Core durability architecture
- [ADR-0008: Sequential Processing MPPP](../adr/0008-sequential-processing-mppp.md) - No concurrency in MPPP scope
- [ADR-0011: Inbox-Only Export Pattern](../adr/0011-inbox-only-export-pattern.md) - No classification in MPPP, direct vault export

### Decision: SQLite Staging Ledger

- **Status:** Decided
- **Why:** Durability, deduplication, efficient inbox queries
- **Alternatives Rejected:**
  - Direct vault writes (corruption risk)
  - Full database (scope creep)
  - Cloud service (privacy violation)
- **Consequences:** Small complexity increase, massive reliability gain

### Decision: Content Hash Deduplication  

- **Status:** Decided
- **Why:** Prevent duplicate files, reduce anxiety
- **Implementation:** SHA-256 of normalized text + attachments
- **Trade-off:** Small compute cost for peace of mind

### Decision: Automatic Conflict Resolution

- **Status:** Decided (v2.2)
- **Why:** Don't interrupt flow for conflicts
- **Implementation:** Always create timestamped siblings
- **Future:** Optional review UI (not v1)

## 14. Constraints & YAGNI Boundaries

### What We're Building (MPPP Scope)

✅ Voice capture (poll + Whisper transcription)
✅ Email capture (Gmail API polling)
✅ SQLite staging ledger (4 tables max)
✅ Content hash deduplication
✅ Direct export to vault (inbox/ flat structure)
✅ Audit trail (exports_audit, errors_log)
✅ Health command (`capture doctor`)

### What We're NOT Building

**Explicitly Deferred (Phase 3+):**

- ❌ PARA classification (manual organization sufficient initially)
- ❌ Daily note linking (direct export only)
- ❌ Inbox UI (no manual triage needed in MPPP)
- ❌ Attachment download/storage (log count only)

**Out of Scope (Phase 5+ or Never):**

- ❌ Full-text search in SQLite (Obsidian has this)
- ❌ Knowledge graph in database
- ❌ Sync between devices (single user assumption)
- ❌ Version control
- ❌ Collaboration features
- ❌ Advanced metrics dashboards (basic observability included in MVP)
- ❌ Web clipper
- ❌ Quick text capture
- ❌ Browser extensions
- ❌ AI/ML features (Ollama, Chroma, embeddings)

**Architectural Boundaries:**

- 4 tables maximum (captures, exports_audit, errors_log, sync_state)
- No embeddings/vectors
- No full-text indexes
- Sequential processing only (no concurrency in MPPP)
- Voice file sovereignty (reference-only, never move/copy Apple files)

### Storage Boundaries

```yaml
SQLite scope:
  - Temporary staging only
  - Minimal audit records
  - Trim processed captures after 90 days
  - No permanent content storage
  - No embeddings/vectors

Obsidian remains:
  - Canonical knowledge store
  - Search provider
  - Graph builder
  - Organization system

Voice Memos:
  - Referenced in place (native Apple path)
  - Never moved/renamed by system
  - Vault stores metadata only
```

## 15. Open Questions → Decisions

### Resolved in v2.3.0-MPPP

- ✅ **Conflict policy:** ULID filenames prevent collisions (no siblings needed)
- ✅ **Staging scope:** 4 tables maximum, not knowledge base
- ✅ **Hash algorithm:** SHA-256 (sufficient for MPPP)
- ✅ **Retention policy:** Audit log forever, captures trimmed after 90 days
  - Clarified: Only exported rows (status starts with `exported`) are trimmed; failed or un-exported rows require manual inspection.
- ✅ **Email provider:** Gmail API with OAuth2
- ✅ **Export structure:** inbox/ flat folder (PARA methodology)
- ✅ **Health command:** Included in MPPP
- ✅ **Metrics collection:** Deferred to Phase 2+
- ✅ **No retrofill for failed transcripts in MPPP:** Placeholder stays immutable
- ✅ **Unique (channel, channel_native_id) constraint:** Enforced via index to suppress duplicate staging
- ✅ **Monotonic timing for latency metrics:** `performance.now()` for durations, UTC ISO timestamps for logs
- ✅ **Backup verification escalation:** 1 warn / 2 degraded / 3 pause pruning (see Section 6.2.1)
- ✅ **Fault injection hooks defined (Phase 2):** Deterministic crash simulation
- ✅ **Classification:** Deferred to Phase 3+
- ✅ **Daily note linking:** Deferred to Phase 3+

### Remaining for Tech Specs

1. **Backup strategy:** Hourly frequency confirmed, retention details in storage ops spec
2. **Migration approach:** Schema versioning strategy (defer to first schema change)
3. **Poll intervals:** Voice 30s, Email 60s (configurable)
4. **Whisper model distribution:** Prebuilt binary vs on-demand download

**Trigger to revisit RAG/embeddings:**
Enable when semantic search usage > 10 queries/day for 7 consecutive days, or when keyword search fail rate > 20% week-over-week.

## 16. Nerdy Joke Corner

SQLite staging is like a ADHD thoughts' waiting room—everyone gets a number (ULID), no one gets lost, and the important ones (deduped by hash) don't have to repeat themselves. Meanwhile, Obsidian is the nice organized office where thoughts go to live permanently once they're processed. Still smaller than your attention span, which is comforting. 🏢📝

## 16.1 Optional Reading List

- ADR-0001 Voice File Sovereignty (`docs/adr/0001-voice-file-sovereignty.md`)
- ADR-0002 Dual Hash Migration (`docs/adr/0002-dual-hash-migration.md`)
- Capture Feature PRD (`../features/capture/prd-capture.md`)
- Staging Ledger PRD (`../features/staging-ledger/prd-staging.md`)
- TDD Applicability Guide (`../guides/tdd-applicability.md`)
- TestKit Usage Guide (`../guides/guide-testkit-usage.md`)

## 16.2 Clarifying Questions (Current Open Set)

1. Any requirement to promote Basic Observability from Slice 4 to Slice 1? (Currently intentionally deferred — confirm retention)
2. Do we want to codify hash normalization (quoted reply stripping) now or defer to Phase 2?
3. Should `capture text` remain deferred explicitly in all feature docs to avoid accidental early implementation?
4. Any need to surface vault disk usage thresholds as health command warnings in Phase 1?

---

## 17. Related Specifications

Core and supporting documents refining this Master PRD:

| Doc | Purpose |
|-----|---------|
| [Capture Feature PRD](../features/capture/prd-capture.md) | Feature scope, flows, success criteria |
| [Capture Architecture Spec](../features/capture/spec-capture-arch.md) | Component model, data model, performance + failure modes |
| [Capture Tech Spec](../features/capture/spec-capture-tech.md) | Implementation details, APIs, error handling |
| [CLI Tech Spec](../cross-cutting/foundation/spec-cli-tech.md) | Command contracts, layering, error model |
| [CLI Test Spec](../cross-cutting/foundation/spec-cli-test.md) | Exit codes, schema stability, perf gates |
| [TestKit Tech Spec](../cross-cutting/spec-testkit-tech.md) | Test isolation, fixtures, cleanup |
| [ADR-0001 Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md) | Never copy/move Apple Voice Memos |
| [ADR-0002 Dual Hash Migration](../adr/0002-dual-hash-migration.md) | Phased SHA-256 → BLAKE3 adoption strategy |

> Note: Inbox feature was deferred to Phase 5+ per 2025-09-27 scope reduction (no manual triage needed for MVP).

Advancement rule: Implementation MUST NOT begin for features whose spec/ADR status is below "accepted" or "living" unless explicitly marked experimental.

---

## Document Version

- **Version:** 2.3.0-MPPP
- **Status:** Final - Ready for Implementation
- **Last Updated:** 2025-09-27
- **Key Changes:** MPPP scope clarification, removed classification/daily note linking, simplified roadmap

### Changelog

### v2.3.0-MPPP (2025-09-27)

- Trimmed scope to voice + email ingestion only
- Removed PARA classification (deferred to Phase 3+)
- Removed daily note linking (deferred to Phase 3+)
- Removed inbox UI constructs (deferred to Phase 5+)
- Updated performance targets (cycle times instead of classification)
- Updated reliability requirements (removed outbox retry references)
- Updated storage constraints (90-day trim policy)
- Changed telemetry to "Deferred to Phase 2+"
- Replaced "Daily Inbox Zero" workflow with "Health Check" workflow
- Replaced PARA Integration section with "Export Strategy (No Classification)"
- Replaced test code blocks with TDD Applicability Decision table
- Simplified risk analysis (removed "via Staging" column)
- Trimmed roadmap from 5 phases to 2 phases (Core Ingestion + Hardening)
- Updated success criteria (removed inbox processing, updated timelines)
- Consolidated YAGNI into single authoritative list
- Updated open questions with all MPPP decisions
- Removed "Appendix: SQLite Query Examples" section
- Fixed broken spec references (removed ingestion-core, fixed CLI paths)

### v2.2.0 (2024-11-15)

- SQLite staging ledger fully integrated
- Conflict resolution strategy defined
- Voice file sovereignty principle established

## Sign-off Checklist

- [x] MPPP scope clearly defined
- [x] Deduplication strategy defined
- [x] TDD applicability table included
- [x] YAGNI boundaries consolidated
- [x] Risk mitigation simplified
- [x] Performance targets updated
- [x] Roadmap trimmed to 2 phases
- [x] Broken spec references fixed
- [x] Export structure clarified (inbox/ flat)

---

### Next Steps

1. **Begin Phase 1: Core Ingestion** (Weeks 1-4)
2. **Set up monorepo foundation** (pnpm + Turbo + TestKit)
3. **Implement voice capture** (icloudctl + Whisper)
4. **Implement email capture** (Gmail API OAuth2)
5. **Validate with 50+ real captures** (zero data loss)

### Success

This PRD now focuses on the **minimum viable durability layer**: voice + email capture with zero data loss, no premature optimization, no classification complexity. The staging ledger ensures ADHD burst capture patterns work reliably. Organization comes later. Ship it! 🚀
