# Capture Bridge - Master PRD Quick Reference

**Purpose**: Essential product context - condensed from 9.9k to 2k tokens
**Full Version**: `docs/master/prd-master.md` (read for schemas, workflows, detailed requirements)
**Version**: v2.3.0-MPPP (Minimum Pivotable Product Phase)
**Last Updated**: 2025-10-08

---

## Product Vision (MPPP Scope)

**One-liner**: Zero-friction ADHD capture layer → SQLite staging ledger → Obsidian vault

**Success Metric**: Thought to staged < 3s, to Obsidian note < 10s, zero data loss

**Core Flow**:
```
Voice/Email → SQLite Staging → Dedup → Export → vault/inbox/{ulid}.md
```

**Key Insight**: Obsidian excels at organization but fails at durable capture. We provide the missing durability layer without becoming a second brain.

---

## Architecture Essentials

### Three-Layer Stack
```
Input Layer:        Voice Memos (APFS dataless) | Gmail API
Staging Layer:      SQLite (4 tables max, WAL mode)
Output Layer:       Obsidian vault (markdown, inbox/ only)
```

### Four-Table Hard Cap
1. **captures**: Temporary staging (ULID, content_hash, status, meta_json)
2. **exports_audit**: Export history forever (minimal footprint)
3. **errors_log**: Failure tracking (90-day retention)
4. **sync_state**: Poll cursors (gmail_history_id, last_voice_poll)

**Full schemas**: [prd-master.md:121-169]

### Core Principles
- **Durability**: SQLite WAL mode, atomic inserts before async work
- **Idempotency**: content_hash prevents duplicate exports
- **Deduplication**: SHA-256 hash of normalized content
- **Voice File Sovereignty**: Reference-only, never move/copy Apple files (ADR-0001)
- **Sequential Processing**: No concurrency in MPPP (ADR-0008)

---

## Capture Channels (MPPP Only)

### Voice Capture
```
1. Poll Apple Voice Memos directory
2. Check APFS dataless status (icloudctl)
3. Queue download (semaphore=1, sequential)
4. Insert ledger (status='staged')
5. Transcribe (Whisper medium, local, sequential)
6. Update ledger (content_hash, status='transcribed' or 'failed_transcription')
7. Export to vault/inbox/{ulid}.md
8. Audit log + status='exported' or 'exported_placeholder'
```
**Full flow**: [prd-master.md:197-212]

### Email Capture
```
1. Poll Gmail API
2. Fetch body + headers
3. Normalize text → calculate content_hash
4. Duplicate check (hash + message_id)
5. Insert ledger (status='staged')
6. Export to vault/inbox/{ulid}.md
7. Audit log + status='exported' or 'exported_duplicate'
```
**Full flow**: [prd-master.md:214-226]

### Export Format
```markdown
vault_root/inbox/{ulid}.md

---
created: 2025-09-27T10:30:00Z
source: voice | email
capture_id: 01HQW3P7XKZM2YJVT8YFGQSZ4M
---

[transcribed content or [TRANSCRIPTION_FAILED]]
```

---

## Performance Targets

| Operation           | Target  | Measurement                |
| ------------------- | ------- | -------------------------- |
| Capture → SQLite    | < 100ms | Time to hash + insert      |
| Voice Capture Cycle | < 10s   | Poll → transcribe → export |
| Email Capture Cycle | < 3s    | Poll → extract → export    |
| Duplicate Check     | < 10ms  | Hash lookup                |

---

## Reliability Requirements

| Aspect      | Requirement              | Implementation                    |
| ----------- | ------------------------ | --------------------------------- |
| Durability  | 100% capture retention   | SQLite WAL mode                   |
| Idempotency | Zero duplicate files     | content_hash checking             |
| Atomicity   | No partial writes        | Temp file + rename pattern        |
| Recovery    | Auto-resume on crash     | Process state in captures table   |
| Backup      | Hourly SQLite backup     | .backup + verification + checksum |
| Paths       | Never move/rename files  | Reference by path + fingerprint   |

**Backup policy**: [prd-master.md:351-378]
**Escalation**: 1 fail=warn, 2 consecutive=degraded, 3 consecutive=pause pruning

---

## Storage Constraints

```yaml
SQLite:
  captures: Trim exported rows after 90 days (never auto-trim failed/non-exported)
  exports_audit: Retain forever
  errors_log: Trim after 90 days
  total_size: Warn at 100MB, hard limit 500MB

Voice Memos:
  Referenced in place (native Apple path)
  Never moved/renamed by system
  Ledger stores: path + fingerprint + state
```

---

## MPPP Scope (What We're Building)

✅ **In Scope**:
- Voice capture (poll + Whisper transcription)
- Email capture (Gmail API polling)
- SQLite staging ledger (4 tables max)
- Content hash deduplication (SHA-256)
- Direct export to vault/inbox/ (flat structure)
- Audit trail (exports_audit, errors_log)
- Health command (`capture doctor`)
- Basic telemetry (local metrics, `CAPTURE_METRICS=1`)

❌ **Explicitly Deferred** (Phase 3+):
- PARA classification (manual organization sufficient initially)
- Daily note linking (direct export only)
- Inbox UI (no manual triage needed)
- Attachment download/storage (log count only)

❌ **Out of Scope** (Phase 5+ or Never):
- Full-text search in SQLite (Obsidian has this)
- Knowledge graph in database
- Sync between devices (single user)
- Version control
- Collaboration features
- Advanced metrics dashboards
- Web clipper
- Quick text capture
- Browser extensions
- AI/ML features (Ollama, Chroma, embeddings)

**Full YAGNI boundaries**: [prd-master.md:696-758]

---

## Testing Strategy (TDD Required)

| Component                     | Risk Class | TDD Required? | Coverage |
| ----------------------------- | ---------- | ------------- | -------- |
| Hash normalization            | High       | Yes           | 100%     |
| Duplicate suppression         | High       | Yes           | 100%     |
| Late hash binding (voice)     | High       | Yes           | 100%     |
| Export idempotency            | High       | Yes           | 100%     |
| Whisper failure → placeholder | Medium     | Yes           | 100%     |
| Fault injection recovery      | High       | Yes           | 100%     |
| CLI argument parsing          | Low        | No            | Visual   |

**Full TDD guide**: `.claude/rules/testkit-tdd-guide-condensed.md`

---

## Key Architecture Decisions (ADRs)

- **ADR-0001**: Voice File Sovereignty (never move/copy Apple Voice Memos)
- **ADR-0003**: Four-Table Hard Cap (core durability architecture)
- **ADR-0008**: Sequential Processing MPPP (no concurrency in MPPP scope)
- **ADR-0011**: Inbox-Only Export Pattern (no classification, direct vault export)

**Full ADRs**: `docs/adr/`

---

## Health Command

`capture doctor` validates:

**Infrastructure**:
- Vault path exists and writable
- SQLite database connectivity + schema version
- Gmail API auth status (token.json valid)
- icloudctl availability + permissions
- Whisper model availability (medium.pt)

**Serviceability**:
- Last successful poll timestamps (voice/email)
- Error log summary (last 24 hours)
- Metrics collection status
- Backup integrity (last hourly backup)
- Export pathway test (temp file write)

**Operational**:
- SQLite WAL file size + checkpoint status
- Disk space (vault + .metrics directories)
- Memory usage patterns (if telemetry enabled)

**Full spec**: [prd-master.md:297-322]

---

## Workflows (Quick Reference)

### Burst Capture (ADHD Pattern)
```
Rapid thoughts → Each saved to SQLite → Dedup prevents repeats →
Background queue → Obsidian updated → Zero thoughts lost
```

### Crash Recovery
```
Mid-capture crash → Restart → Scan non-exported statuses →
Resume processing → Notify "Recovered N captures" → Continue
```

**Full workflows**: [prd-master.md:420-455]

---

## Metrics (Basic Observability)

**Local-only metrics** (`CAPTURE_METRICS=1`):
- `capture_voice_staging_ms`, `capture_email_staging_ms`
- `transcription_duration_ms`, `export_write_ms`
- `dedup_hits_total`, `export_failures_total`
- `capture_time_to_export_ms` (end-to-end latency)
- `transcription_queue_depth` (snapshot each poll)
- `placeholder_export_ratio` (daily aggregate)
- `backup_verification_result` (success/failure)

**Storage**: `./.metrics/YYYY-MM-DD.ndjson` (rotated daily)

**Full metrics spec**: [prd-master.md:395-418]

---

## Success Criteria (Milestones)

### MVP (End Phase 1)
- [ ] Voice + email capture operational
- [ ] Deduplication working (hash + message_id/audio_fp)
- [ ] Export to vault/inbox/ functional
- [ ] TestKit integrated, tests pass in parallel
- [ ] Zero data loss in 50 real captures

### Production Ready (End Phase 2)
- [ ] Error recovery working (Whisper failure → placeholder)
- [ ] Backup verification passing
- [ ] 99.9% durability proven (50+ captures)
- [ ] 7 days without data loss
- [ ] Fault injection hooks validated

### v1.0 Launch
- [ ] 14 days personal usage
- [ ] 50+ deduplicated captures validated
- [ ] Zero vault corruption events
- [ ] Performance targets met
- [ ] Documentation complete

**Full roadmap**: [prd-master.md:542-612]

---

## When to Read Full PRD

**Trigger conditions for reading full `prd-master.md`:**

1. **Implementing SQL schemas** (lines 121-169)
   - Need complete CREATE TABLE statements
   - Understanding indexes and foreign keys
   - SQLite PRAGMA configuration

2. **Understanding capture flows** (lines 197-234)
   - Full pseudocode with error handling
   - State machine transitions
   - Retry logic and backoff strategies

3. **Implementing deduplication** (lines 270-296)
   - Hash normalization algorithm
   - Channel-specific hash inputs
   - Duplicate check implementation

4. **Risk analysis** (lines 519-541)
   - Full risk matrix with mitigations
   - Failure modes and recovery strategies
   - Technical debt tracking

5. **Related specifications** (lines 813-831)
   - Links to feature PRDs
   - Architecture specs
   - Tech specs (CLI, capture, etc.)

6. **Decision context** (lines 663-695, 760-789)
   - ADR summaries and rationale
   - Alternatives rejected
   - Trade-off analysis

---

**Token Count**: ~2,000 tokens
**Compression Ratio**: 80% reduction from full PRD
**Full PRD**: `docs/master/prd-master.md` (9.9k tokens, 895 lines)
