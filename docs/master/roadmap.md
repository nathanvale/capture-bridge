# ADHD Brain Capture System — Product Roadmap v3.0.0

_Status: Authoritative Source of Truth_
_Version: 3.0.0 (Generated from Complete Documentation Analysis)_
_Last Updated: 2025-10-09_
_Master PRD Alignment: v2.3.0-MPPP_
_Implementation Status: Phase 1, Slice 1.1 in progress (1/6 capabilities complete)_

## Executive Summary

This roadmap represents the **definitive capability breakdown** for the ADHD Brain capture system—a zero-friction capture layer with durable staging ledger that bridges ADHD thought patterns to Obsidian's PARA vault. Built from first-principles analysis of all PRDs, specs, ADRs, and guides.

### Success Metric

**One Number**: Thought → safely staged < 3s, staged → exported note < 10s, **zero data loss** over 50+ captures across 7 days production usage.

### Implementation Progress

**Phase 1, Slice 1.1** (Week 1): Foundation & Monorepo Setup

- ✅ MONOREPO_STRUCTURE: Complete (2025-09-28)
- ⏳ SQLITE_SCHEMA: Not started
- ⏳ CONTENT_HASH_IMPLEMENTATION: Not started
- ⏳ ATOMIC_FILE_WRITER: Not started
- ⏳ TESTKIT_INTEGRATION: Not started
- ⏳ METRICS_INFRASTRUCTURE: Not started

**Build Metrics**:

- ✅ Build time: ~4.5s (target < 30s)
- ✅ Test time: ~171ms (target < 30s)
- ✅ Zero circular dependencies verified

### Scope Boundaries (MPPP)

**Building Now:**

- ✅ Voice capture (poll → transcribe → export)
- ✅ Email capture (poll → normalize → export)
- ✅ SQLite staging ledger (4 tables: captures, exports_audit, errors_log, sync_state)
- ✅ Content hash deduplication (SHA-256)
- ✅ Direct export to vault (inbox/ flat structure)
- ✅ Atomic writes (temp-then-rename pattern)
- ✅ Health monitoring (`capture doctor`)
- ✅ Local metrics (NDJSON, opt-in)

**Explicitly Deferred:**

- ❌ PARA classification (Phase 3+)
- ❌ Daily note linking (Phase 3+)
- ❌ Inbox triage UI (Phase 5+)
- ❌ Quick text capture (Phase 5+)
- ❌ Web clipper (Phase 5+)
- ❌ Multi-device sync (out of scope)
- ❌ AI/ML features (Phase 5+)

---

## Roadmap Structure

The roadmap is organized into **2 phases** with **capabilities grouped into time-boxed slices** (1-2 weeks each):

- **Phase 1: Core Ingestion** (Weeks 1-4) — Build MPPP foundation
- **Phase 2: Operational Hardening** (Weeks 5-6) — Production readiness

Each capability includes:

- **ID**: UPPER_SNAKE_CASE identifier
- **Title**: Human-readable name
- **Category**: foundation | capture | process | output
- **Risk**: Low | Medium | High
- **TDD**: Required | Recommended | Optional
- **Dependencies**: Other capabilities that must complete first
- **Acceptance Criteria**: Measurable success conditions
- **Related Specs**: Architecture, tech, test specifications
- **Related ADRs**: Architectural decision records
- **Related Guides**: Implementation patterns and best practices
- **Test Verification**: Specific test files that prove completion

---

## Phase 1: Core Ingestion (MPPP Foundation)

**Objective**: Establish the minimal viable capture → staging → export pipeline with zero data loss.

**Duration**: 4 weeks
**Success Gate**: 50 captures with zero data loss, all tests green, walking skeleton functional

### Slice 1.1: Foundation & Monorepo Setup (Week 1)

**Theme**: Establish ADHD-optimized monorepo foundation with external test infrastructure

**Capabilities**:

#### MONOREPO_STRUCTURE ✅

- **Title**: Monorepo Package Structure & Build Pipeline
- **Category**: foundation
- **Risk**: Medium
- **TDD**: Recommended
- **Dependencies**: []
- **Description**: Set up pnpm workspaces + Turbo monorepo with 4-package hard cap (foundation, storage, capture, cli). External @orchestr8/testkit for test isolation. Shared configs (TypeScript, ESLint, Prettier).
- **Acceptance Criteria**:
  - [x] 4 packages defined: @capture-bridge/foundation, @capture-bridge/storage, @capture-bridge/capture, @capture-bridge/cli
  - [x] Turbo pipeline configured (build, test, lint)
  - [x] Shared tsconfig.base.json, eslint.config.js, prettier.config.js
  - [x] Build time < 30s
  - [x] Test time < 30s
  - [x] Setup time < 5 minutes
  - [x] Zero circular dependencies verified
- **Related Specs**:
  - docs/cross-cutting/spec-foundation-monorepo-arch.md
  - docs/cross-cutting/spec-foundation-monorepo-tech.md
  - docs/cross-cutting/spec-foundation-monorepo-test.md
- **Related ADRs**:
  - ADR-0019: Monorepo Tooling Stack (pnpm + Turbo + TSUP)
- **Related Guides**:
  - docs/guides/guide-monorepo-mppp.md
- **Test Verification**:
  - packages/foundation/tests/monorepo-structure.spec.ts

#### SQLITE_SCHEMA

- **Title**: SQLite Staging Ledger Schema & Indexes
- **Category**: foundation
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [MONOREPO_STRUCTURE]
- **Description**: Create 4-table schema (captures, exports_audit, errors_log, sync_state) with WAL mode, foreign key constraints, indexes for performance. ULID primary keys, status state machine, content hash deduplication support.
- **Acceptance Criteria**:
  - [ ] All 4 tables created with correct schema
  - [ ] Foreign key constraints enforced (captures ← exports_audit, errors_log)
  - [ ] Indexes created: captures_status_idx, captures_channel_native_uid, errors_stage_idx, exports_capture_idx
  - [ ] WAL mode enabled (journal_mode=WAL)
  - [ ] synchronous=NORMAL, foreign_keys=ON, busy_timeout=5000
  - [ ] Schema version tracking in sync_state table
  - [ ] PRAGMA integrity_check passes
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-arch.md
  - docs/features/staging-ledger/spec-staging-tech.md
  - docs/features/staging-ledger/schema-indexes.md
- **Related ADRs**:
  - ADR-0003: Four-Table Hard Cap
  - ADR-0004: Status-Driven State Machine
  - ADR-0005: WAL Mode Normal Sync
  - ADR-0010: ULID-Based Deterministic Filenames
- **Related Guides**:
  - docs/guides/guide-tdd-applicability.md
- **Test Verification**:
  - packages/storage/tests/schema-creation.spec.ts
  - packages/storage/tests/foreign-key-constraints.spec.ts
  - packages/storage/tests/index-performance.spec.ts

#### CONTENT_HASH_IMPLEMENTATION

- **Title**: Content Hash Normalization & Computation (SHA-256)
- **Category**: foundation
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [MONOREPO_STRUCTURE]
- **Description**: Deterministic SHA-256 hash computation with text normalization (trim, consistent line endings, lowercase for comparison). Supports voice audio fingerprinting (first 4MB) and email body hashing. Idempotent and reproducible.
- **Acceptance Criteria**:
  - [ ] Text normalization function (trim, LF line endings)
  - [ ] SHA-256 hash computation (64-char hex output)
  - [ ] Audio fingerprint (first 4MB SHA-256)
  - [ ] Email body hash (Message-ID + normalized text)
  - [ ] 100% deterministic (same input → same hash)
  - [ ] Hash collision handling (log critical error)
  - [ ] Performance: < 10ms for 1KB text, < 50ms for 4MB audio
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-tech.md
  - docs/features/capture/spec-capture-tech.md
- **Related ADRs**:
  - ADR-0002: Dual Hash Migration (superseded, SHA-256 only)
  - ADR-0006: Late Hash Binding for Voice
- **Related Guides**:
  - docs/guides/guide-tdd-applicability.md
- **Test Verification**:
  - packages/foundation/tests/content-hash-normalization.spec.ts
  - packages/foundation/tests/hash-determinism.spec.ts

#### ATOMIC_FILE_WRITER

- **Title**: Atomic File Writer (Temp-Then-Rename Pattern)
- **Category**: output
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [MONOREPO_STRUCTURE]
- **Description**: Atomic write implementation using POSIX temp-then-rename semantics. Writes to .trash/ temp file, fsyncs, renames to inbox/{ULID}.md. Zero partial writes guarantee, Obsidian Sync compatible.
- **Acceptance Criteria**:
  - [ ] Write to temp path: {vault}/.trash/{ulid}.tmp
  - [ ] fsync() before rename
  - [ ] Atomic rename to {vault}/inbox/{ulid}.md
  - [ ] Temp file cleanup on failure
  - [ ] ULID collision detection (same filename, different content → CRITICAL)
  - [ ] Duplicate detection (same content hash → skip write)
  - [ ] Performance: < 50ms p95 for 1KB file
  - [ ] Zero partial writes verified with crash testing
- **Related Specs**:
  - docs/features/obsidian-bridge/spec-obsidian-arch.md
  - docs/features/obsidian-bridge/spec-obsidian-tech.md
- **Related ADRs**:
  - ADR-0009: Atomic Write via Temp-Then-Rename Pattern
  - ADR-0010: ULID-Based Deterministic Filenames
  - ADR-0011: Inbox-Only Export Pattern
  - ADR-0020: Foundation Direct Export Pattern
- **Related Guides**:
  - docs/guides/guide-obsidian-bridge-usage.md
- **Test Verification**:
  - packages/obsidian-bridge/tests/atomic-write.spec.ts
  - packages/obsidian-bridge/tests/crash-recovery.spec.ts

#### TESTKIT_INTEGRATION

- **Title**: TestKit Integration & Test Infrastructure
- **Category**: foundation
- **Risk**: Medium
- **TDD**: N/A (test infrastructure)
- **Dependencies**: [MONOREPO_STRUCTURE]
- **Description**: Integrate external @orchestr8/testkit for in-memory SQLite, MSW mocks, fixture management. Parallel test execution without port conflicts or file system collisions. Auto-cleanup after each test.
- **Acceptance Criteria**:
  - [ ] @orchestr8/testkit installed and configured
  - [ ] In-memory SQLite fixtures working
  - [ ] MSW setup for API mocks (Gmail API)
  - [ ] Auto-cleanup verified (no temp files, no leaked connections)
  - [ ] Parallel test execution working (no conflicts)
  - [ ] Test suite runs < 30 seconds
  - [ ] Zero flaky tests (5 consecutive clean runs)
- **Related Specs**:
  - docs/cross-cutting/spec-foundation-monorepo-test.md
- **Related ADRs**:
  - ADR-0019: Monorepo Tooling Stack
- **Related Guides**:
  - docs/guides/guide-testkit-usage.md
  - docs/guides/guide-testkit-standardization.md
  - docs/guides/guide-phase1-testing-patterns.md
- **Test Verification**:
  - All test files across all packages

#### METRICS_INFRASTRUCTURE

- **Title**: Local Metrics Collection (NDJSON)
- **Category**: foundation
- **Risk**: Low
- **TDD**: Optional
- **Dependencies**: [MONOREPO_STRUCTURE]
- **Description**: Local-only metrics collection using newline-delimited JSON files. Opt-in via CAPTURE_METRICS=1 environment variable. Daily log rotation, additive-only schema evolution. No external transmission.
- **Acceptance Criteria**:
  - [ ] NDJSON writer for .metrics/YYYY-MM-DD.ndjson
  - [ ] Daily log rotation (new file per day)
  - [ ] Opt-in activation (CAPTURE_METRICS=1)
  - [ ] Core metrics defined: capture_staging_ms, dedup_hits_total, export_failures_total, transcription_duration_ms
  - [ ] Monotonic clock for durations (performance.now())
  - [ ] ISO 8601 timestamps (UTC)
  - [ ] Schema version field in every record
  - [ ] No external network calls
- **Related Specs**:
  - docs/cross-cutting/spec-metrics-contract-tech.md
  - docs/cross-cutting/spec-metrics-contract-tech-test.md
- **Related ADRs**:
  - ADR-0021: Local-Only NDJSON Metrics Strategy
- **Related Guides**:
  - docs/guides/guide-testkit-usage.md
- **Test Verification**:
  - packages/metrics/tests/ndjson-writer.spec.ts
  - packages/metrics/tests/log-rotation.spec.ts

**Slice 1.1 Exit Criteria**:

- [ ] All 6 capabilities complete (1/6: MONOREPO_STRUCTURE ✅)
- [x] Monorepo builds in < 30s (✅ ~4.5s)
- [x] All tests pass in < 30s (✅ ~171ms)
- [x] Zero circular dependencies
- [ ] Walking skeleton: insert → query → export path testable

---

### Slice 1.2: Voice Capture Pipeline (Week 2)

**Theme**: Build voice memo polling → staging → transcription → export flow

**Capabilities**:

#### VOICE_POLLING_ICLOUD

- **Title**: Voice Memo Polling (iCloud + APFS Dataless Detection)
- **Category**: capture
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [SQLITE_SCHEMA, CONTENT_HASH_IMPLEMENTATION]
- **Description**: Poll Apple Voice Memos directory (~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/) for new .m4a files. Detect APFS dataless status via icloudctl. Sequential download (semaphore=1) with exponential backoff. Audio fingerprint (first 4MB SHA-256) for early dedup.
- **Acceptance Criteria**:
  - [ ] Poll directory every 30 seconds (configurable)
  - [ ] Detect new .m4a files (mtime check + sync_state cursor)
  - [ ] APFS dataless detection via icloudctl
  - [ ] Sequential download (no parallel, semaphore=1)
  - [ ] Exponential backoff on iCloud failure (1s, 2s, 4s, cap at 60s)
  - [ ] Skip files with iCloud conflicts (log error prominently)
  - [ ] Audio fingerprint (first 4MB SHA-256) computed before staging
  - [ ] Channel-native-id = file path (uniqueness constraint)
  - [ ] Insert capture row (status='staged', audio_fp in meta_json)
  - [ ] Performance: < 150ms p95 staging time
- **Related Specs**:
  - docs/features/capture/spec-capture-arch.md
  - docs/features/capture/spec-capture-tech.md
- **Related ADRs**:
  - ADR-0001: Voice File Sovereignty (never move/copy Apple files)
  - ADR-0006: Late Hash Binding for Voice
  - ADR-0008: Sequential Processing MPPP
- **Related Guides**:
  - docs/guides/guide-polling-implementation.md
  - docs/guides/guide-capture-debugging.md
- **Test Verification**:
  - packages/capture/tests/voice-polling.spec.ts
  - packages/capture/tests/apfs-dataless-detection.spec.ts

#### WHISPER_TRANSCRIPTION

- **Title**: Whisper Transcription (Medium Model, Local)
- **Category**: process
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [VOICE_POLLING_ICLOUD]
- **Description**: Transcribe voice memos using Whisper medium model running locally. Sequential processing (one at a time). Single retry on failure. Placeholder export on transcription failure (`[TRANSCRIPTION_FAILED]`).
- **Acceptance Criteria**:
  - [ ] Whisper medium model loaded (medium.pt)
  - [ ] Sequential transcription (no parallel, MPPP constraint)
  - [ ] Single retry on failure (timeout, corrupted audio)
  - [ ] Timeout: 30 seconds per transcription
  - [ ] Update capture: content_hash + status='transcribed' on success
  - [ ] Update capture: status='failed_transcription' on failure
  - [ ] Insert errors_log on failure (stage='transcribe', message)
  - [ ] Placeholder export on failure (see PLACEHOLDER_EXPORT)
  - [ ] Performance: < 10s average transcription time
  - [ ] Queue depth metric: transcription_queue_depth
- **Related Specs**:
  - docs/features/capture/spec-capture-tech.md
  - docs/features/capture/spec-capture-test.md
- **Related ADRs**:
  - ADR-0006: Late Hash Binding for Voice
  - ADR-0008: Sequential Processing MPPP
  - ADR-0014: Placeholder Export Immutability
- **Related Guides**:
  - docs/guides/guide-whisper-transcription.md
  - docs/guides/guide-error-recovery.md
- **Test Verification**:
  - packages/capture/tests/whisper-transcription.spec.ts
  - packages/capture/tests/transcription-failure.spec.ts

#### DEDUPLICATION_LOGIC

- **Title**: Duplicate Detection & Suppression
- **Category**: process
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [CONTENT_HASH_IMPLEMENTATION, SQLITE_SCHEMA]
- **Description**: Prevent duplicate exports using content hash (SHA-256) and channel-native-id uniqueness. Voice uses audio fingerprint until transcript available, then transcript hash. Email uses Message-ID + body hash.
- **Acceptance Criteria**:
  - [ ] Query: SELECT id FROM captures WHERE content_hash = ? AND id != ?
  - [ ] Voice duplicate check: audio_fp (staged) → transcript hash (transcribed)
  - [ ] Email duplicate check: Message-ID (primary) OR body hash (fallback)
  - [ ] Unique constraint enforced: (channel, channel_native_id)
  - [ ] Mark duplicate: status='exported_duplicate'
  - [ ] Insert exports_audit (mode='duplicate_skip')
  - [ ] No vault write on duplicate
  - [ ] Performance: < 10ms duplicate check
  - [ ] Metric: dedup_hits_total counter
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-tech.md
  - docs/features/capture/spec-capture-tech.md
- **Related ADRs**:
  - ADR-0006: Late Hash Binding for Voice
- **Related Guides**:
  - docs/guides/guide-tdd-applicability.md
- **Test Verification**:
  - packages/staging-ledger/tests/deduplication.spec.ts
  - packages/staging-ledger/tests/hash-collision-handling.spec.ts

#### DIRECT_EXPORT_VOICE

- **Title**: Voice Direct Export to Vault (Synchronous)
- **Category**: output
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [WHISPER_TRANSCRIPTION, ATOMIC_FILE_WRITER, DEDUPLICATION_LOGIC]
- **Description**: Synchronous export of transcribed voice captures to Obsidian vault. Atomic write to inbox/{ULID}.md with minimal frontmatter. Export audit trail. Status update to 'exported'.
- **Acceptance Criteria**:
  - [ ] Trigger: capture status='transcribed' AND duplicate check passed
  - [ ] Generate markdown: frontmatter (created, source, capture_id) + transcript
  - [ ] Atomic write to inbox/{capture.id}.md
  - [ ] Insert exports_audit (capture_id, vault_path, hash_at_export, mode='initial')
  - [ ] Update captures: status='exported'
  - [ ] Performance: < 1s export time
  - [ ] Zero partial writes (verified with crash testing)
  - [ ] Metric: export_write_ms histogram
- **Related Specs**:
  - docs/features/obsidian-bridge/spec-obsidian-tech.md
  - docs/cross-cutting/spec-direct-export-tech.md
- **Related ADRs**:
  - ADR-0011: Inbox-Only Export Pattern
  - ADR-0013: MPPP Direct Export Pattern
  - ADR-0020: Foundation Direct Export Pattern
- **Related Guides**:
  - docs/guides/guide-obsidian-bridge-usage.md
- **Test Verification**:
  - packages/obsidian-bridge/tests/voice-export-e2e.spec.ts

#### PLACEHOLDER_EXPORT

- **Title**: Placeholder Export (Transcription Failure Fallback)
- **Category**: output
- **Risk**: Medium
- **TDD**: Required
- **Dependencies**: [WHISPER_TRANSCRIPTION, ATOMIC_FILE_WRITER]
- **Description**: Export placeholder markdown file when transcription fails. Immutable placeholder (no retrofill in MPPP). Includes error message and original audio path reference.
- **Acceptance Criteria**:
  - [ ] Trigger: capture status='failed_transcription'
  - [ ] Generate placeholder markdown: `[TRANSCRIPTION_FAILED]` + audio path + error message
  - [ ] Atomic write to inbox/{capture.id}.md
  - [ ] Insert exports_audit (capture_id, vault_path, hash_at_export=NULL, mode='placeholder', error_flag=1)
  - [ ] Update captures: status='exported_placeholder'
  - [ ] No retrofit mechanism (MPPP immutability constraint)
  - [ ] Metric: placeholder_export_ratio (daily aggregation)
- **Related Specs**:
  - docs/features/capture/spec-capture-tech.md
  - docs/features/obsidian-bridge/spec-obsidian-tech.md
- **Related ADRs**:
  - ADR-0014: Placeholder Export Immutability
- **Related Guides**:
  - docs/guides/guide-error-recovery.md
  - docs/guides/guide-whisper-transcription.md
- **Test Verification**:
  - packages/capture/tests/placeholder-export.spec.ts

#### CAPTURE_STATE_MACHINE

- **Title**: Capture Status State Machine
- **Category**: process
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [SQLITE_SCHEMA]
- **Description**: Enforce legal state transitions for capture lifecycle. Immutable terminal states (exported\*). Prevent invalid transitions. Support crash recovery replay.
- **Acceptance Criteria**:
  - [ ] States: staged → transcribed → exported
  - [ ] States: staged → failed_transcription → exported_placeholder
  - [ ] States: staged → exported_duplicate (duplicate detected before transcription)
  - [ ] Terminal states: exported, exported_duplicate, exported_placeholder (immutable)
  - [ ] Validate transitions at service layer (throw error on invalid)
  - [ ] Recovery: query non-terminal states on startup → resume processing
  - [ ] Status index for fast filtering: CREATE INDEX captures_status_idx ON captures(status)
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-arch.md
- **Related ADRs**:
  - ADR-0004: Status-Driven State Machine
  - ADR-0014: Placeholder Export Immutability
- **Related Guides**:
  - docs/guides/guide-error-recovery.md
- **Test Verification**:
  - packages/staging-ledger/tests/state-machine.spec.ts
  - packages/staging-ledger/tests/invalid-transitions.spec.ts

**Slice 1.2 Exit Criteria**:

- [ ] All 6 capabilities complete
- [ ] Voice capture end-to-end working (poll → transcribe → export)
- [ ] Transcription failure → placeholder export working
- [ ] Duplicate detection preventing duplicate exports
- [ ] State machine preventing invalid transitions
- [ ] Zero data loss in 10 real voice captures

---

### Slice 1.3: Email Capture Pipeline (Week 3)

**Theme**: Build email polling → staging → normalization → export flow

**Capabilities**:

#### GMAIL_OAUTH2_SETUP

- **Title**: Gmail API OAuth2 Authentication
- **Category**: capture
- **Risk**: Medium
- **TDD**: Recommended
- **Dependencies**: [SQLITE_SCHEMA]
- **Description**: OAuth2 authentication flow for Gmail API access. credentials.json + token.json pattern. Automatic token refresh. Error handling for auth failures.
- **Acceptance Criteria**:
  - [ ] credentials.json file parsing (Google Console)
  - [ ] OAuth2 authorization flow (first-time setup)
  - [ ] token.json storage (local file)
  - [ ] Automatic token refresh (before expiry)
  - [ ] Error handling: invalid credentials, revoked token, rate limit
  - [ ] Store last successful auth in sync_state table
  - [ ] Cap consecutive auth failures (> 5 → halt email polling, alert via doctor)
- **Related Specs**:
  - docs/features/capture/spec-capture-tech.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-gmail-oauth2-setup.md
  - docs/guides/guide-polling-implementation.md
- **Test Verification**:
  - packages/capture/tests/gmail-oauth2.spec.ts (MSW mocks)

#### EMAIL_POLLING_GMAIL

- **Title**: Email Polling (Gmail API)
- **Category**: capture
- **Risk**: Medium
- **TDD**: Required
- **Dependencies**: [GMAIL_OAUTH2_SETUP, SQLITE_SCHEMA]
- **Description**: Poll Gmail API for new messages. History-based polling using gmail_history_id cursor. Pagination support. Rate limit handling. Message-ID deduplication before staging.
- **Acceptance Criteria**:
  - [ ] Poll Gmail API every 60 seconds (configurable)
  - [ ] History-based polling (gmail.users.history.list)
  - [ ] Store cursor in sync_state: ('gmail_history_id', <value>)
  - [ ] Pagination handling (nextPageToken)
  - [ ] Rate limit backoff (built into googleapis library)
  - [ ] Fetch full message (headers + plain text body)
  - [ ] Extract metadata: from, subject, message_id → meta_json
  - [ ] Duplicate check: Message-ID uniqueness (channel_native_id)
  - [ ] Insert capture row (status='staged', source='email')
  - [ ] Performance: < 200ms p95 staging time
- **Related Specs**:
  - docs/features/capture/spec-capture-arch.md
  - docs/features/capture/spec-capture-tech.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-gmail-oauth2-setup.md
  - docs/guides/guide-polling-implementation.md
- **Test Verification**:
  - packages/capture/tests/email-polling.spec.ts (MSW mocks)

#### EMAIL_NORMALIZATION

- **Title**: Email Body Normalization & Hash Computation
- **Category**: process
- **Risk**: Medium
- **TDD**: Required
- **Dependencies**: [EMAIL_POLLING_GMAIL, CONTENT_HASH_IMPLEMENTATION]
- **Description**: Normalize email body text (strip HTML, extract plain text, normalize whitespace). Compute SHA-256 content hash. Attachment count logging (no download in MPPP).
- **Acceptance Criteria**:
  - [ ] Strip HTML tags (extract plain text)
  - [ ] Normalize whitespace (trim, consistent line endings)
  - [ ] Compute SHA-256 content hash (deterministic)
  - [ ] Update capture: content_hash + raw_content
  - [ ] Attachment count logged in meta_json (no download)
  - [ ] Performance: < 50ms for 10KB email
  - [ ] Deterministic: same email → same hash
- **Related Specs**:
  - docs/features/capture/spec-capture-tech.md
- **Related ADRs**: (none specific)
- **Related Guides**: (none specific)
- **Test Verification**:
  - packages/capture/tests/email-normalization.spec.ts

#### DIRECT_EXPORT_EMAIL

- **Title**: Email Direct Export to Vault (Synchronous)
- **Category**: output
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [EMAIL_NORMALIZATION, ATOMIC_FILE_WRITER, DEDUPLICATION_LOGIC]
- **Description**: Synchronous export of normalized email captures to Obsidian vault. Atomic write to inbox/{ULID}.md with minimal frontmatter. Export audit trail. Status update to 'exported'.
- **Acceptance Criteria**:
  - [ ] Trigger: capture status='staged' (email) AND duplicate check passed
  - [ ] Generate markdown: frontmatter (created, source, capture_id, from, subject) + body
  - [ ] Atomic write to inbox/{capture.id}.md
  - [ ] Insert exports_audit (capture_id, vault_path, hash_at_export, mode='initial')
  - [ ] Update captures: status='exported'
  - [ ] Performance: < 1s export time
  - [ ] Zero partial writes (verified with crash testing)
  - [ ] Metric: export_write_ms histogram
- **Related Specs**:
  - docs/features/obsidian-bridge/spec-obsidian-tech.md
  - docs/cross-cutting/spec-direct-export-tech.md
- **Related ADRs**:
  - ADR-0011: Inbox-Only Export Pattern
  - ADR-0013: MPPP Direct Export Pattern
  - ADR-0020: Foundation Direct Export Pattern
- **Related Guides**:
  - docs/guides/guide-obsidian-bridge-usage.md
- **Test Verification**:
  - packages/obsidian-bridge/tests/email-export-e2e.spec.ts

**Slice 1.3 Exit Criteria**:

- [ ] All 4 capabilities complete
- [ ] Email capture end-to-end working (poll → normalize → export)
- [ ] Message-ID deduplication working
- [ ] Both voice + email capture channels operational
- [ ] Zero data loss in 10 real email captures

---

### Slice 1.4: CLI & Health Monitoring (Week 4)

**Theme**: User interface and operational visibility

**Capabilities**:

#### CLI_FOUNDATION

- **Title**: CLI Argument Parsing & Command Registry
- **Category**: foundation
- **Risk**: Low
- **TDD**: Optional
- **Dependencies**: [MONOREPO_STRUCTURE]
- **Description**: CLI entry point using Commander.js for command parsing, Zod for validation. Command registry, help text, error handling. JSON output mode (--json).
- **Acceptance Criteria**:
  - [ ] Commander.js setup (v12+)
  - [ ] Zod validation schemas
  - [ ] Command registry: capture, doctor, ledger
  - [ ] Help text for all commands
  - [ ] Error handling with structured codes (CLI_INPUT_INVALID, CLI_DB_UNAVAILABLE, etc.)
  - [ ] JSON output mode (--json flag)
  - [ ] Exit code registry (0=success, 1=error, 2=invalid input, etc.)
  - [ ] Performance: < 150ms cold start
- **Related Specs**:
  - docs/features/cli/spec-cli-arch.md
  - docs/features/cli/spec-cli-tech.md
- **Related ADRs**:
  - ADR-0015: CLI Library Stack Selection
  - ADR-0016: CLI as Feature Architecture
  - ADR-0017: JSON Output Contract Stability
  - ADR-0018: CLI Exit Code Registry Pattern
- **Related Guides**:
  - docs/guides/guide-health-command.md
  - docs/guides/guide-cli-doctor-implementation.md
- **Test Verification**:
  - packages/cli/tests/argument-parsing.spec.ts
  - packages/cli/tests/command-registry.spec.ts

#### CLI_CAPTURE_COMMANDS

- **Title**: CLI Capture Commands (voice, email manual triggers)
- **Category**: capture
- **Risk**: Low
- **TDD**: Optional
- **Dependencies**: [CLI_FOUNDATION, VOICE_POLLING_ICLOUD, EMAIL_POLLING_GMAIL]
- **Description**: Manual capture commands for testing and development. `adhd capture voice <path>`, `adhd capture email <path>`. Thin wrappers around capture services.
- **Acceptance Criteria**:
  - [ ] Command: `adhd capture voice <file_path>`
  - [ ] Command: `adhd capture email <file_path>` (Phase 3)
  - [ ] Validate file exists and readable
  - [ ] Call capture service (voice polling or email ingestion)
  - [ ] Return capture ID and status
  - [ ] JSON output mode support (--json)
  - [ ] Error handling: file not found, permissions, invalid format
- **Related Specs**:
  - docs/features/cli/spec-cli-tech.md
- **Related ADRs**:
  - ADR-0016: CLI as Feature Architecture
- **Related Guides**: (none specific)
- **Test Verification**:
  - packages/cli/tests/capture-voice-command.spec.ts

#### CLI_LEDGER_COMMANDS

- **Title**: CLI Ledger Inspection Commands (list, inspect)
- **Category**: capture
- **Risk**: Low
- **TDD**: Optional
- **Dependencies**: [CLI_FOUNDATION, SQLITE_SCHEMA]
- **Description**: Ledger inspection commands for debugging. `adhd ledger list`, `adhd ledger inspect <id>`. Query staging ledger, format output (human/JSON).
- **Acceptance Criteria**:
  - [ ] Command: `adhd ledger list [--status=<status>] [--limit=N]`
  - [ ] Command: `adhd ledger inspect <capture_id>`
  - [ ] Query captures table (filter by status, limit)
  - [ ] Display: id, source, status, created_at, content_hash (truncated)
  - [ ] JSON output mode support (--json)
  - [ ] Inspect shows: full capture row + exports_audit + errors_log
  - [ ] Performance: < 50ms for 1000 rows
- **Related Specs**:
  - docs/features/cli/spec-cli-tech.md
- **Related ADRs**:
  - ADR-0017: JSON Output Contract Stability
- **Related Guides**: (none specific)
- **Test Verification**:
  - packages/cli/tests/ledger-list-command.spec.ts

#### DOCTOR_HEALTH_CHECKS

- **Title**: Health Command (capture doctor)
- **Category**: foundation
- **Risk**: Medium
- **TDD**: Recommended
- **Dependencies**: [CLI_FOUNDATION, SQLITE_SCHEMA]
- **Description**: Infrastructure health checks and serviceability diagnostics. Validate vault path, SQLite connectivity, Gmail auth, icloudctl availability, Whisper model, error log summary, backup status.
- **Acceptance Criteria**:
  - [ ] Command: `adhd doctor [--json]`
  - [ ] Check: Vault path exists and writable
  - [ ] Check: SQLite database accessible (PRAGMA integrity_check)
  - [ ] Check: Gmail API authentication status (token.json valid)
  - [ ] Check: icloudctl binary available and executable
  - [ ] Check: Whisper model file exists (medium.pt)
  - [ ] Check: Last successful poll timestamps (voice/email)
  - [ ] Check: Error log summary (last 24 hours)
  - [ ] Check: Backup status (last hourly backup timestamp)
  - [ ] Check: Queue depth (staged + transcribed count)
  - [ ] Check: Placeholder ratio (last 7 days)
  - [ ] Check: Disk space (vault path and .metrics directory)
  - [ ] Output: Pass/Warn/Fail status for each check
  - [ ] Exit code: 0 if all pass, 1 if any fail, 2 if critical fail
- **Related Specs**:
  - docs/features/cli/spec-cli-tech.md
  - docs/features/cli/spec-cli-test.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-health-command.md
  - docs/guides/guide-cli-doctor-implementation.md
- **Test Verification**:
  - packages/cli/tests/doctor-command.spec.ts
  - packages/cli/tests/doctor-failure-scenarios.spec.ts

**Slice 1.4 Exit Criteria**:

- [ ] All 4 capabilities complete
- [ ] CLI commands functional (capture, ledger, doctor)
- [ ] Doctor command detects common issues
- [ ] JSON output mode working
- [ ] Exit codes stable and documented

---

## Phase 1 Success Criteria (MPPP Complete)

**Gate to Phase 2:**

### Core Functionality

- [ ] Voice capture operational (poll → transcribe → export)
- [ ] Email capture operational (poll → extract → export)
- [ ] Deduplication working (hash + message_id/audio_fp)
- [ ] Export to vault (inbox/ flat structure)
- [ ] Audit trail complete (exports_audit table)
- [ ] Basic observability metrics (local NDJSON)
- [ ] Infrastructure health command functional

### Test Infrastructure

- [ ] TestKit integrated across all packages
- [ ] In-memory database tests passing
- [ ] MSW mocks with auto-cleanup working
- [ ] Test suite runs in < 30 seconds
- [ ] Zero test conflicts with parallel execution

### Quality Gates

- [ ] All tests pass in parallel (using TestKit isolation)
- [ ] Zero data loss in 50 real captures (25 voice + 25 email)
- [ ] CI/CD green for 5 consecutive runs
- [ ] Build time < 30s
- [ ] No circular dependencies

### Walking Skeleton Validation

- [ ] End-to-end: Record voice memo → poll → transcribe → export to vault
- [ ] End-to-end: Forward email → poll → normalize → export to vault
- [ ] Crash recovery: Kill process mid-transcription → restart → resume
- [ ] Duplicate detection: Same content → single vault file
- [ ] Placeholder export: Transcription failure → placeholder written

---

## Phase 2: Operational Hardening (Production Readiness)

**Objective**: Achieve production-grade reliability and operational visibility.

**Duration**: 2 weeks
**Success Gate**: 7 days of zero data loss, all fault injection tests passing, 99.9% durability proven

### Slice 2.1: Error Recovery & Fault Tolerance (Week 5)

**Theme**: Graceful failure handling and crash recovery

**Capabilities**:

#### CRASH_RECOVERY_MECHANISM

- **Title**: Startup Reconciliation & Resume Processing
- **Category**: process
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [CAPTURE_STATE_MACHINE, SQLITE_SCHEMA]
- **Description**: On startup, scan for non-terminal captures and resume processing. Timeout recovery for stuck states. Quarantine for missing voice files. No user intervention required.
- **Acceptance Criteria**:
  - [ ] Startup query: SELECT \* FROM captures WHERE status IN ('staged', 'transcribed', 'failed_transcription')
  - [ ] Resume processing for all non-terminal captures
  - [ ] Timeout detection: captures stuck in same state > 10 minutes
  - [ ] Quarantine flag for missing voice files (file not found)
  - [ ] User notification: "Recovered N captures" (if N > 0)
  - [ ] Performance: < 250ms recovery time for 1000 rows
  - [ ] Zero duplicate exports during recovery
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-arch.md
  - docs/features/capture/spec-capture-tech.md
- **Related ADRs**:
  - ADR-0004: Status-Driven State Machine
- **Related Guides**:
  - docs/guides/guide-error-recovery.md
  - docs/guides/guide-crash-matrix-test-plan.md
- **Test Verification**:
  - packages/staging-ledger/tests/crash-recovery.spec.ts
  - packages/staging-ledger/tests/timeout-recovery.spec.ts

#### ERROR_LOGGING_STRUCTURED

- **Title**: Structured Error Logging & Diagnostics
- **Category**: foundation
- **Risk**: Medium
- **TDD**: Recommended
- **Dependencies**: [SQLITE_SCHEMA]
- **Description**: Structured error logging to errors_log table. Link errors to specific captures. Categorize by stage (poll, transcribe, export, backup). Surfaced by doctor command.
- **Acceptance Criteria**:
  - [ ] Insert errors_log on any failure
  - [ ] Fields: id, capture_id (nullable), stage, message, created_at
  - [ ] Stages: poll, transcribe, export, backup, integrity
  - [ ] Link to capture via foreign key (optional)
  - [ ] Doctor command shows error summary (last 24 hours)
  - [ ] Group by stage: SELECT stage, COUNT(\*) FROM errors_log WHERE created_at > datetime('now', '-1 day') GROUP BY stage
  - [ ] Optional trim after 90 days (Phase 3+)
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-tech.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-error-recovery.md
  - docs/guides/guide-health-command.md
- **Test Verification**:
  - packages/staging-ledger/tests/error-logging.spec.ts

#### TRANSCRIPTION_RETRY_LOGIC

- **Title**: Transcription Single Retry on Failure
- **Category**: process
- **Risk**: Medium
- **TDD**: Required
- **Dependencies**: [WHISPER_TRANSCRIPTION, ERROR_LOGGING_STRUCTURED]
- **Description**: Single retry on transcription failure (timeout, corrupted audio). If both attempts fail, export placeholder. Log error to errors_log.
- **Acceptance Criteria**:
  - [ ] Single retry on Whisper failure (timeout, error)
  - [ ] Retry after 5 second delay
  - [ ] If retry succeeds: proceed normally (status='transcribed')
  - [ ] If retry fails: status='failed_transcription' → placeholder export
  - [ ] Insert errors_log on failure (stage='transcribe', message)
  - [ ] Metric: transcription_retry_count counter
- **Related Specs**:
  - docs/features/capture/spec-capture-tech.md
- **Related ADRs**:
  - ADR-0014: Placeholder Export Immutability
- **Related Guides**:
  - docs/guides/guide-error-recovery.md
  - docs/guides/guide-whisper-transcription.md
- **Test Verification**:
  - packages/capture/tests/transcription-retry.spec.ts

#### VAULT_WRITE_ERROR_HANDLING

- **Title**: Vault Write Error Handling (EACCES, ENOSPC, etc.)
- **Category**: output
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [ATOMIC_FILE_WRITER, ERROR_LOGGING_STRUCTURED]
- **Description**: Handle vault write errors gracefully. Classify errors (permission, disk full, read-only fs). Log to errors_log. Clean up temp files. Retry eligible errors (EACCES, ENETDOWN).
- **Acceptance Criteria**:
  - [ ] Error classification: EACCES, ENOSPC, EEXIST, EROFS, ENETDOWN, EUNKNOWN
  - [ ] EACCES → retry with exponential backoff (max 3 attempts)
  - [ ] ENOSPC → halt export worker, log CRITICAL error
  - [ ] EEXIST → check duplicate (collision detection)
  - [ ] EROFS → halt export worker, log CRITICAL error
  - [ ] ENETDOWN → retry (network mount failure)
  - [ ] Clean up temp file on all errors (fs.unlink, idempotent)
  - [ ] Insert errors_log (capture_id, stage='export', message)
  - [ ] Doctor command surfaces export errors
- **Related Specs**:
  - docs/features/obsidian-bridge/spec-obsidian-tech.md
  - docs/features/obsidian-bridge/spec-obsidian-test.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-error-recovery.md
- **Test Verification**:
  - packages/obsidian-bridge/tests/vault-write-errors.spec.ts

#### FAULT_INJECTION_FRAMEWORK

- **Title**: Fault Injection Hook Registry for Testing
- **Category**: foundation
- **Risk**: Medium
- **TDD**: Required (for Phase 2 activation)
- **Dependencies**: [CRASH_RECOVERY_MECHANISM]
- **Description**: Deterministic fault injection hooks for crash simulation. Activate fault points: pre-transcription, post-transcription, pre-export, post-export, post-audit. Validate recovery paths.
- **Acceptance Criteria**:
  - [ ] Fault injection registry: registerFaultHook(name, handler)
  - [ ] Fault points: pre-transcription, post-transcription, pre-export, post-export, post-audit
  - [ ] Simulated crashes: process.exit(1)
  - [ ] Activation: FAULT_INJECT=<fault_point> environment variable
  - [ ] Test suite: crash at each fault point → restart → verify no data loss
  - [ ] All 5 fault points tested
  - [ ] Zero data loss, zero duplicate exports
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-test.md
  - docs/features/capture/spec-capture-test.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-fault-injection-registry.md
  - docs/guides/guide-crash-matrix-test-plan.md
- **Test Verification**:
  - packages/staging-ledger/tests/fault-injection-crash-matrix.spec.ts

**Slice 2.1 Exit Criteria**:

- [ ] All 5 capabilities complete
- [ ] Crash recovery working (restart → resume)
- [ ] Error logging structured and queryable
- [ ] Transcription retry working
- [ ] Vault write errors handled gracefully
- [ ] All fault injection points tested (5/5)

---

### Slice 2.2: Backup Verification & Data Retention (Week 6)

**Theme**: Data durability and long-term reliability

**Capabilities**:

#### HOURLY_BACKUP_AUTOMATION

- **Title**: Hourly SQLite Backup Automation
- **Category**: foundation
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [SQLITE_SCHEMA]
- **Description**: Automated hourly backup using SQLite .backup command. Store in ./.backups/ directory with timestamp naming. Retention policy: 24 hourly + 7 daily.
- **Acceptance Criteria**:
  - [ ] Backup every hour (cron or setInterval)
  - [ ] Backup command: .backup ./.backups/ledger-YYYYMMDD-HH.sqlite
  - [ ] Timestamp-based naming (ISO 8601 datetime)
  - [ ] Retention policy: keep last 24 hourly
  - [ ] Daily promotion: copy 1 per day to daily set (keep last 7)
  - [ ] Prune oldest after successful verification
  - [ ] Performance: < 5s backup creation
  - [ ] Metric: backup_duration_ms histogram
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-tech.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-backup-verification.md
  - docs/guides/guide-backup-restore-drill.md
- **Test Verification**:
  - packages/staging-ledger/tests/hourly-backup.spec.ts

#### BACKUP_VERIFICATION_PROTOCOL

- **Title**: Backup Integrity Check & Hash Compare
- **Category**: foundation
- **Risk**: High
- **TDD**: Required
- **Dependencies**: [HOURLY_BACKUP_AUTOMATION]
- **Description**: Verify backup integrity using PRAGMA integrity_check and SHA-256 hash comparison. Weekly full restore test. Escalation policy for consecutive failures (1 warn, 2 degraded, 3 pause pruning).
- **Acceptance Criteria**:
  - [ ] Integrity check: PRAGMA integrity_check on backup file
  - [ ] Hash compare: SHA-256 of backup vs live database
  - [ ] Weekly restore test: restore to temp database + query validation
  - [ ] Escalation policy: 1 failure = warn, 2 consecutive = DEGRADED_BACKUP, 3 consecutive = HALT_PRUNING
  - [ ] Automatic recovery on next successful verification
  - [ ] Manual intervention: `capture doctor --force-backup`
  - [ ] Performance: < 10s verification time
  - [ ] Metric: backup_verification_result{status=success|failure}
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-tech.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-backup-verification.md
  - docs/guides/guide-backup-restore-drill.md
- **Test Verification**:
  - packages/staging-ledger/tests/backup-verification.spec.ts
  - packages/staging-ledger/tests/backup-escalation-policy.spec.ts

#### RETENTION_POLICY_90DAY

- **Title**: 90-Day Retention Policy (Exported Captures Only)
- **Category**: foundation
- **Risk**: Medium
- **TDD**: Required
- **Dependencies**: [SQLITE_SCHEMA, BACKUP_VERIFICATION_PROTOCOL]
- **Description**: Trim exported captures after 90 days. Never auto-trim non-exported or failed rows. Pause pruning if backup verification fails 3 consecutive times.
- **Acceptance Criteria**:
  - [ ] Trim query: DELETE FROM captures WHERE status LIKE 'exported%' AND created_at < datetime('now', '-90 days')
  - [ ] Never trim: status IN ('staged', 'transcribed', 'failed_transcription')
  - [ ] Pause pruning if backup verification fails 3 consecutive times
  - [ ] Resume pruning after successful verification
  - [ ] Manual override: `capture ledger prune --force` (Phase 3+)
  - [ ] Performance: < 30s trim time for 10k rows
  - [ ] Metric: retention_cleanup_rows_deleted counter
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-tech.md
- **Related ADRs**:
  - ADR-0007: 90-Day Retention for Exported Captures Only
- **Related Guides**: (none specific)
- **Test Verification**:
  - packages/staging-ledger/tests/retention-policy.spec.ts
  - packages/staging-ledger/tests/retention-pause-on-backup-failure.spec.ts

#### STORAGE_SIZE_MONITORING

- **Title**: Storage Size Monitoring & Alerts
- **Category**: foundation
- **Risk**: Low
- **TDD**: Optional
- **Dependencies**: [SQLITE_SCHEMA, METRICS_INFRASTRUCTURE]
- **Description**: Monitor SQLite database size. Warn at 100MB, hard limit 500MB. Surface in doctor command. Metrics for observability.
- **Acceptance Criteria**:
  - [ ] Query database size: SELECT page_count \* page_size FROM pragma_page_count(), pragma_page_size()
  - [ ] Warn threshold: 100MB
  - [ ] Hard limit: 500MB (halt ingestion)
  - [ ] Doctor command displays: database size, warn/critical status
  - [ ] Check disk space: vault path and .metrics directory
  - [ ] Warn if disk space < 10GB
  - [ ] Metric: database_size_bytes gauge
- **Related Specs**:
  - docs/features/staging-ledger/spec-staging-tech.md
- **Related ADRs**: (none specific)
- **Related Guides**:
  - docs/guides/guide-health-command.md
- **Test Verification**:
  - packages/staging-ledger/tests/storage-monitoring.spec.ts

**Slice 2.2 Exit Criteria**:

- [ ] All 4 capabilities complete
- [ ] Hourly backups automated and verified
- [ ] Backup verification escalation policy working
- [ ] 90-day retention policy active
- [ ] Storage size monitoring functional
- [ ] 7 consecutive successful backup verifications

---

## Phase 2 Success Criteria (Production Ready)

**Gate to v1.0 Launch:**

### Reliability & Operations

- [ ] Both capture channels stable (voice + email)
- [ ] Error recovery working (Whisper failure → placeholder)
- [ ] Backup verification passing (7 consecutive)
- [ ] Retention policy active (90-day trim)
- [ ] 99.9% durability proven (50+ captures)
- [ ] 7 days without data loss
- [ ] All fault injection hooks validated (5/5 crash points)
- [ ] Consecutive successful backup verifications ≥ 7

### Test Coverage

- [ ] Fault injection: All 5 crash points recover correctly
- [ ] Error logging: All failures captured with context
- [ ] Crash recovery: staged → resume without user intervention
- [ ] Backup verification: integrity_check + hash compare passing
- [ ] Retention policy: exported rows trimmed, non-exported preserved

### Operational Readiness

- [ ] Health command reports accurate status
- [ ] Metrics collection working (local NDJSON)
- [ ] Backup retention policy enforced (24 hourly + 7 daily)
- [ ] Doctor command detects 95%+ of common issues

### Production Validation

- [ ] 14 days personal usage (dogfooding)
- [ ] 50+ deduplicated captures validated
- [ ] Zero vault corruption events
- [ ] Zero data loss incidents
- [ ] All acceptance tests passing in CI

---

## Phase 3+ Deferred Features (Triggers to Revisit)

**Not Building in Phase 1-2:**

### PARA Classification (Phase 3+)

- **Trigger**: Manual organization takes > 10 min/day for 2 weeks
- **Requires**: Intelligence layer, classification service, PARA filing logic

### Daily Note Linking (Phase 3+)

- **Trigger**: User explicitly requests feature
- **Requires**: Daily note detection, backlink insertion, template system

### Inbox Triage UI (Phase 5+)

- **Trigger**: Inbox backlog > 300 items persistent
- **Requires**: Batch review interface, keyboard shortcuts, quick actions

### Quick Text Capture (Phase 5+)

- **Trigger**: Manual note creation > 10/day for 7 days
- **Requires**: Hotkey binding, text input dialog, burst capture UX

### Web Clipper (Phase 5+)

- **Trigger**: User explicitly requests feature
- **Requires**: Browser extension, readability parsing, attachment handling

### Attachment Download/Storage (Phase 3+)

- **Trigger**: User requests attachment preservation
- **Requires**: Email attachment download, file storage, vault linking

### Advanced Metrics Dashboard (Phase 5+)

- **Trigger**: Phase 3+ observability needs
- **Requires**: Metrics aggregation, dashboard UI, trend analysis

### RAG/Embeddings (Phase 5+)

- **Trigger**: Semantic search usage > 10 queries/day for 7 consecutive days OR keyword search fail rate > 20% week-over-week
- **Requires**: Ollama integration, Chroma vector store, embedding pipeline

---

## Technical Debt Backlog

**Purpose**: Track P2 quality improvements that don't block MPPP delivery

**Prioritization**: Address post-Phase 1 completion or when developer capacity allows

### TEST_DB_CLEANUP_MIGRATION

- **Title**: Test Database Cleanup - In-Memory Migration
- **Category**: foundation (test infrastructure)
- **Priority**: P2 (Developer Experience)
- **Risk**: Medium
- **TDD**: Optional (test infrastructure improvement)
- **Dependencies**: [TESTKIT_INTEGRATION, MONOREPO_STRUCTURE]
- **Description**: Migrate 9 storage package test files from shared memory SQLite (`createMemoryUrl()`) to true in-memory databases (`:memory:`) to eliminate 55+ file handle leaks that prevent Vitest from exiting cleanly.
- **Acceptance Criteria**:
  - [ ] All 114 storage package tests pass after migration
  - [ ] Vitest exits cleanly without timeout wrapper (`timeout --signal=KILL 30`)
  - [ ] Zero file handles remain after test completion (`lsof` count = 0)
  - [ ] No test execution time regression (≤ baseline performance)
  - [ ] All 9 test files migrated to `:memory:` pattern
  - [ ] No flaky tests in 5 consecutive runs
  - [ ] Cleanup sequence remains 5-step compliant (TestKit pattern)
  - [ ] Code simplified (removed dynamic imports where possible)
- **Related Specs**:
  - docs/features/testing/spec-test-db-cleanup-tech.md
  - docs/cross-cutting/spec-foundation-monorepo-test.md
  - docs/features/staging-ledger/spec-staging-tech.md
- **Related ADRs**: (none directly - could create ADR-0031: True In-Memory Databases for Test Isolation)
- **Related Guides**:
  - .claude/rules/testkit-tdd-guide-condensed.md (5-step cleanup pattern)
  - docs/guides/guide-testkit.md (TestKit usage patterns)
  - docs/guides/guide-phase1-testing-patterns.md
- **Test Verification**:
  - All 9 migrated test files in packages/storage/src/__tests__/
  - Verification: `lsof -p $(pgrep -f vitest) | grep -i sqlite | wc -l` should return 0
- **Trigger to Escalate**:
  - Developer friction becomes significant (multiple complaints)
  - Vitest hang causes CI/CD failures
  - File handle leak spreads to other packages
  - Phase 1 extends beyond Week 4 (capacity becomes available)
- **Implementation Window**: Post-Phase 1 completion OR opportunistically during Phase 1 if high developer friction
- **Estimated Effort**: 1-2 hours (simple find/replace migration per spec)

---

## Capability Summary Statistics

**Total Capabilities**: 29 (MPPP) + 1 (Technical Debt)

**By Phase**:

- Phase 1: 20 capabilities (69.0%)
- Phase 2: 9 capabilities (31.0%)
- Phase 3+: Deferred (out of scope)
- Technical Debt: 1 capability (non-blocking)

**By Category**:

- Foundation: 10 capabilities (34.5%)
- Capture: 7 capabilities (24.1%)
- Process: 6 capabilities (20.7%)
- Output: 6 capabilities (20.7%)

**By Risk Level**:

- High: 15 capabilities (51.7%)
- Medium: 10 capabilities (34.5%)
- Low: 4 capabilities (13.8%)

**By TDD Requirement**:

- Required: 20 capabilities (69.0%)
- Recommended: 5 capabilities (17.2%)
- Optional: 4 capabilities (13.8%)

---

## Dependencies & Constraints

### Critical Path Dependencies

**Foundation Layer** (must complete first):

1. MONOREPO_STRUCTURE
2. SQLITE_SCHEMA
3. CONTENT_HASH_IMPLEMENTATION
4. ATOMIC_FILE_WRITER

**Capture Layer** (depends on foundation):

1. VOICE_POLLING_ICLOUD → WHISPER_TRANSCRIPTION → DIRECT_EXPORT_VOICE
2. EMAIL_POLLING_GMAIL → EMAIL_NORMALIZATION → DIRECT_EXPORT_EMAIL

**Process Layer** (orthogonal to capture):

1. DEDUPLICATION_LOGIC (shared by both channels)
2. CAPTURE_STATE_MACHINE (shared by both channels)

**Output Layer** (depends on foundation + capture):

1. DIRECT_EXPORT_VOICE (voice-specific)
2. DIRECT_EXPORT_EMAIL (email-specific)
3. PLACEHOLDER_EXPORT (voice failure path)

### Resource Constraints

**MPPP Hard Constraints**:

- Maximum 4 packages (foundation, storage, capture, cli)
- Maximum 4 tables (captures, exports_audit, errors_log, sync_state)
- Build time < 30s
- Test time < 30s
- Setup time < 5 minutes
- Sequential processing only (no parallelism)

**Performance Constraints**:

- Capture → staging < 100ms (p95)
- Duplicate check < 10ms (p95)
- Export write < 50ms (p95)
- Transcription < 10s average
- CLI cold start < 150ms (p95)

**Quality Constraints**:

- Zero circular dependencies
- 100% test coverage for High-risk capabilities
- Zero flaky tests (5 consecutive clean runs)
- Idempotent operations (retry-safe)

---

## ADR & Guide Traceability

### High-Risk Capabilities → ADRs

**VOICE_POLLING_ICLOUD**:

- ADR-0001: Voice File Sovereignty
- ADR-0006: Late Hash Binding for Voice
- ADR-0008: Sequential Processing MPPP

**SQLITE_SCHEMA**:

- ADR-0003: Four-Table Hard Cap
- ADR-0004: Status-Driven State Machine
- ADR-0005: WAL Mode Normal Sync
- ADR-0010: ULID-Based Deterministic Filenames

**CONTENT_HASH_IMPLEMENTATION**:

- ADR-0002: Dual Hash Migration (superseded, SHA-256 only)
- ADR-0006: Late Hash Binding for Voice

**ATOMIC_FILE_WRITER**:

- ADR-0009: Atomic Write via Temp-Then-Rename Pattern
- ADR-0010: ULID-Based Deterministic Filenames
- ADR-0011: Inbox-Only Export Pattern
- ADR-0020: Foundation Direct Export Pattern

**WHISPER_TRANSCRIPTION**:

- ADR-0006: Late Hash Binding for Voice
- ADR-0008: Sequential Processing MPPP
- ADR-0014: Placeholder Export Immutability

### High-Risk/TDD Required → Guides

**VOICE_POLLING_ICLOUD**:

- guide-polling-implementation.md
- guide-capture-debugging.md
- guide-tdd-applicability.md

**WHISPER_TRANSCRIPTION**:

- guide-whisper-transcription.md
- guide-error-recovery.md

**DEDUPLICATION_LOGIC**:

- guide-tdd-applicability.md

**ATOMIC_FILE_WRITER**:

- guide-obsidian-bridge-usage.md

**CRASH_RECOVERY_MECHANISM**:

- guide-error-recovery.md
- guide-crash-matrix-test-plan.md

**FAULT_INJECTION_FRAMEWORK**:

- guide-fault-injection-registry.md
- guide-crash-matrix-test-plan.md

**HOURLY_BACKUP_AUTOMATION**:

- guide-backup-verification.md
- guide-backup-restore-drill.md

**BACKUP_VERIFICATION_PROTOCOL**:

- guide-backup-verification.md
- guide-backup-restore-drill.md

**DOCTOR_HEALTH_CHECKS**:

- guide-health-command.md
- guide-cli-doctor-implementation.md

**TESTKIT_INTEGRATION**:

- guide-testkit-usage.md
- guide-testkit-standardization.md
- guide-phase1-testing-patterns.md

**CLI_FOUNDATION**:

- guide-health-command.md
- guide-cli-doctor-implementation.md

**GMAIL_OAUTH2_SETUP**:

- guide-gmail-oauth2-setup.md
- guide-polling-implementation.md

**MONOREPO_STRUCTURE**:

- guide-monorepo-mppp.md

---

## Glossary

| Term                     | Definition                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **MPPP**                 | Minimum Publishable Product Pair (Phase 1 scope: voice + email capture)                      |
| **ULID**                 | Universally Unique Lexicographically Sortable Identifier (time-ordered, collision-resistant) |
| **WAL Mode**             | Write-Ahead Logging (SQLite journal mode for crash safety + concurrency)                     |
| **Content Hash**         | SHA-256 hash of normalized content (for deduplication)                                       |
| **Audio Fingerprint**    | SHA-256 hash of first 4MB of audio file (early voice dedup)                                  |
| **Channel Native ID**    | Source-specific unique identifier (file path for voice, message_id for email)                |
| **Status State Machine** | Capture lifecycle: staged → transcribed → exported (immutable terminal states)               |
| **Placeholder Export**   | Markdown file exported when transcription fails (`[TRANSCRIPTION_FAILED]`)                   |
| **Direct Export**        | Synchronous export to vault (no outbox queue in MPPP)                                        |
| **Atomic Write**         | Temp-then-rename pattern (zero partial writes guarantee)                                     |
| **Fault Injection**      | Deterministic crash simulation for testing recovery paths                                    |
| **TDD**                  | Test-Driven Development (required for high-risk capabilities)                                |

---

## Revision History

- **v3.0.1** (2025-10-09): Added Technical Debt Backlog section
  - Integrated TEST_DB_CLEANUP_MIGRATION capability from spec-test-db-cleanup-tech.md
  - Classified as P2 (non-blocking developer experience improvement)
  - Linked to TESTKIT_INTEGRATION and monorepo foundation
  - Documented triggers for priority escalation
  - Cross-referenced with TestKit guides and storage specs

- **v3.0.0** (2025-09-28): Complete roadmap rebuild from documentation analysis
  - Generated from comprehensive PRD/spec/ADR/guide analysis
  - 29 capabilities across 2 phases (Phase 1: 20, Phase 2: 9)
  - Full traceability: acceptance criteria, specs, ADRs, guides, tests
  - Risk classification: 51.7% High, 34.5% Medium, 13.8% Low
  - TDD requirements: 69.0% Required, 17.2% Recommended, 13.8% Optional
  - Dependency graph validated (zero circular dependencies)
  - MPPP scope boundaries enforced (4 packages, 4 tables, sequential processing)

- **v2.0.0-MPPP** (2025-09-27): MPPP scope reduction
  - Removed PARA classification, daily note linking, inbox UI
  - Focused on voice + email capture with direct export

- **v1.0.0** (2024-11-15): Initial roadmap

---

## Next Steps

1. **Begin Phase 1, Slice 1.1** (Week 1):
   - Set up monorepo structure (pnpm + Turbo)
   - Create SQLite schema (4 tables)
   - Implement content hash functions (SHA-256)
   - Build atomic file writer
   - Integrate TestKit
   - Set up metrics infrastructure

2. **Validate Walking Skeleton** (End of Week 2):
   - Voice capture: record → poll → transcribe → export
   - End-to-end test with real voice memo
   - Verify zero data loss

3. **Continue Phase 1 Execution** (Weeks 3-4):
   - Complete email capture pipeline
   - Build CLI interface
   - Implement health monitoring

4. **Phase 2 Hardening** (Weeks 5-6):
   - Error recovery and fault tolerance
   - Backup verification automation
   - 7 days dogfooding with zero data loss

5. **v1.0 Launch** (After 14 days production usage):
   - All acceptance criteria met
   - All tests green
   - Zero data loss proven
   - Documentation complete

6. **Technical Debt Cleanup** (Post-Phase 1, optional):
   - Migrate storage tests to `:memory:` databases
   - Eliminate Vitest file handle leaks
   - Improve developer experience

---

**Status**: Ready for Implementation
**Approval**: Nathan (Product Owner)
**Review**: Recommended quarterly alignment check against Master PRD
