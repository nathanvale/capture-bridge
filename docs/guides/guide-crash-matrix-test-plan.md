---
title: Crash Matrix Test Plan Guide
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-27
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Crash Matrix Test Plan Guide

## Purpose

This guide provides a systematic approach to validate that every intentional crash point (fault injection hook) in the ADHD Brain capture pipeline results in safe, idempotent recovery with no data loss, no duplicate vault exports, and consistent ledger state transitions.

**Target Audience:** Developers implementing or validating resilience testing for voice and email capture workflows.

**Activation Timeline:** Phase 2 Hardening (Weeks 5-6)

## When to Use This Guide

Use this guide when:

- Implementing fault injection testing for capture pipelines
- Validating recovery behavior after process crashes
- Adding new durability boundaries that require crash testing
- Debugging idempotency issues in export workflows
- Ensuring no silent data loss in staging-to-export transitions

**Related Features:** Voice capture, email capture, staging ledger, Obsidian bridge export pipeline

## Prerequisites

**Required Knowledge:**
- Understanding of MPPP (Multi-Pass Processing Pipeline) sequential execution model
- Familiarity with SQLite transaction boundaries and WAL mode
- Knowledge of staging ledger state machine (`staged` → `transcribed` → `exported`)
- Basic understanding of fault injection testing principles

**Required Setup:**
- Working ADHD Brain development environment
- Test fixtures for voice audio and email payloads
- SQLite database with staging ledger schema
- Access to Obsidian inbox directory for file validation

**Related Documentation:**
- [Fault Injection Hook Registry](./guide-fault-injection-registry.md) - Authoritative hook catalog (REQUIRED)
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md)
- [Capture PRD](../features/capture/prd-capture.md)
- [Master Roadmap: State & Invariants](../master/roadmap.md)

## Quick Reference

**TL;DR - Core Testing Flow:**

1. Set `CAPTURE_FAULT_INJECTION=1` and `CAPTURE_FAULT_POINT=<hook>`
2. Trigger single capture (voice or email)
3. Observe process crash (exit code 137)
4. Restart without fault injection
5. Assert: One vault file, one audit row, terminal status, no orphans

**Key Assertions:**
- Vault file count with ULID prefix == 1 (idempotency)
- Audit row count per capture_id == 1 (no duplicates)
- Temp file glob `.tmp-*` empty (cleanup)
- Status terminal (`exported` or `exported_placeholder`)
- Hash immutable if transcribed before crash

## Step-by-Step Instructions

### Step 1: Review Hook Inventory

Consult the authoritative hook inventory to understand each crash point:

| Hook Key | Stage | Description | Expected Pre-Crash Commit Boundary |
|----------|-------|-------------|------------------------------------|
| `after_capture_insert` | staging | Row inserted with `status='staged'` | Capture row durable (WAL) |
| `after_transcription_complete` | transcription | Transcript + hash updated; `status='transcribed'` | Updated row durable |
| `before_export_write` | export | About to write temp file | Ledger unchanged since last status update |
| `after_temp_file_write_before_rename` | export | Temp file written, not yet renamed | Temp file present; no audit row yet |
| `after_audit_insert_before_status_update` | export | Audit row inserted, status not finalized | Audit row durable, capture still prior state |

### Step 2: Configure Fault Injection Environment

Set environment variables to enable fault injection:

```bash
export CAPTURE_FAULT_INJECTION=1
export CAPTURE_FAULT_POINT=after_capture_insert  # Or any hook key
```

### Step 3: Trigger Capture Event

Execute exactly one capture per channel:

**For Voice:**
```bash
# Use small fixture audio file
cp fixtures/test-voice-10s.m4a ~/watched-folder/voice/
```

**For Email:**
```bash
# Use fixture message payload
adhd capture email --fixture fixtures/test-email.json
```

### Step 4: Observe Process Crash

Allow the process to crash at the configured hook point. Expected behavior:
- Process exits with code 137 (or configured exit code)
- Hook triggered exactly once (check `fault_injection_triggered_total` metric if implemented)

### Step 5: Restart and Validate Recovery

Restart the process with fault injection disabled:

```bash
unset CAPTURE_FAULT_INJECTION
unset CAPTURE_FAULT_POINT
# Restart main process
```

Observe recovery behavior according to the hook-specific expectations.

### Step 6: Execute Core Assertions

Run assertions for the specific hook being tested:

| Hook | On Restart Expect | Assertions |
|------|-------------------|------------|
| after_capture_insert | Capture reprocessed from status='staged' | No duplicate export, one final audit row |
| after_transcription_complete | Export proceeds; status→exported* | Hash stable; no second transcription attempt logged |
| before_export_write | Export completes from prior status | Exactly one vault file; no orphan temp |
| after_temp_file_write_before_rename | Temp file cleanup or rename completion | No partial file; final audit row present |
| after_audit_insert_before_status_update | Status updated to exported* | No second audit row; status terminal |

`exported*` may be `exported` or `exported_placeholder` depending on simulated success/failure path.

### Step 7: Repeat for All Hooks

Iterate through each hook in the inventory, executing Steps 2-6 for comprehensive coverage.

## Common Patterns

### Pattern: Idempotent Export Validation

```bash
# Count vault files with specific ULID prefix
vault_files=$(ls inbox/ULID_PREFIX*.md 2>/dev/null | wc -l)
[[ $vault_files -eq 1 ]] || echo "FAIL: Expected 1 vault file, got $vault_files"
```

### Pattern: Audit Row Uniqueness Check

```sql
SELECT COUNT(*) FROM exports_audit WHERE capture_id = ?;
-- Expected: 1
```

### Pattern: Temp File Cleanup Verification

```bash
# After stabilization period (1 second)
sleep 1
temp_files=$(ls inbox/.tmp-* 2>/dev/null | wc -l)
[[ $temp_files -eq 0 ]] || echo "FAIL: Found $temp_files orphan temp files"
```

### Pattern: Hash Immutability Check

```sql
-- Before crash
SELECT hash FROM staging_ledger WHERE id = ? AND status = 'transcribed';
-- After restart
SELECT hash FROM staging_ledger WHERE id = ?;
-- Both hashes must match exactly
```

### Best Practices

- Use small test fixtures to minimize test execution time
- Run matrix tests in isolated environment (separate test database/vault)
- Store test results as JSON artifacts for trend analysis
- Always disable fault injection after test completion
- Verify log output for unexpected errors or warnings

### Anti-Patterns to Avoid

- Testing multiple hooks simultaneously (obscures failure source)
- Skipping hash immutability checks (silent data corruption risk)
- Ignoring temp file cleanup (disk space leaks)
- Assuming single test run proves idempotency (run 3x minimum)

## Troubleshooting

### Problem: Process Does Not Crash at Expected Hook

**Symptoms:** Process completes successfully despite fault injection enabled

**Solutions:**
1. Verify `CAPTURE_FAULT_INJECTION=1` is set in process environment (not just parent shell)
2. Check hook key spelling matches code exactly (case-sensitive)
3. Confirm capture event actually reaches the hook point (add debug logging)
4. Ensure fault injection code is compiled/deployed in current build

### Problem: Duplicate Exports After Restart

**Symptoms:** Multiple vault files with similar ULID prefixes

**Solutions:**
1. Check status transition logic for missing idempotency guards
2. Verify audit row insertion occurs within same transaction as status update
3. Review export path for missing status checks before write
4. Examine logs for multiple recovery attempts due to crash loop

### Problem: Orphan Temp Files Remain

**Symptoms:** `.tmp-*` files persist after process restart

**Solutions:**
1. Verify cleanup code executes in startup recovery path
2. Check for exception handling gaps in export cleanup
3. Ensure temp file naming convention matches cleanup glob pattern
4. Add explicit cleanup step to recovery sequence

### Problem: Hash Changes After Transcription Crash

**Symptoms:** Hash differs between pre-crash and post-restart transcription

**Solutions:**
1. Review transcription service for non-deterministic behavior (timestamps, metadata)
2. Check if transcription is re-running instead of resuming
3. Verify hash calculation excludes volatile fields
4. Ensure transcript is durably persisted before hash is committed

## Examples

### Example 1: Testing `after_capture_insert` Hook

```bash
# Setup
export CAPTURE_FAULT_INJECTION=1
export CAPTURE_FAULT_POINT=after_capture_insert

# Trigger
cp fixtures/voice-test-10s.m4a ~/watched/voice/

# Process crashes with exit code 137

# Restart
unset CAPTURE_FAULT_INJECTION
unset CAPTURE_FAULT_POINT
npm start  # or appropriate start command

# Validate
# Expected: Capture reprocessed, single export, one audit row
sqlite3 staging.db "SELECT status FROM staging_ledger WHERE id='<capture_id>'"
# Should show: exported or exported_placeholder

ls inbox/ULID_*.md | wc -l
# Should show: 1
```

### Example 2: Placeholder Path Validation (Forced Transcription Failure)

```bash
# Setup to force transcription failure
export CAPTURE_FAULT_INJECTION=1
export CAPTURE_FAULT_POINT=after_capture_insert
export FORCE_TRANSCRIPTION_FAILURE=1

# Trigger voice capture
cp fixtures/voice-test-10s.m4a ~/watched/voice/

# After restart, validate placeholder export
ls inbox/ULID_*-placeholder.md | wc -l
# Should show: 1

sqlite3 staging.db "SELECT status FROM staging_ledger WHERE id='<capture_id>'"
# Should show: exported_placeholder
```

### Example 3: Automated Matrix Harness (Conceptual)

```bash
#!/bin/bash
# crash-matrix-runner.sh

HOOKS=(
  "after_capture_insert"
  "after_transcription_complete"
  "before_export_write"
  "after_temp_file_write_before_rename"
  "after_audit_insert_before_status_update"
)

export CRASH_MATRIX=1

for hook in "${HOOKS[@]}"; do
  echo "Testing hook: $hook"

  export CAPTURE_FAULT_INJECTION=1
  export CAPTURE_FAULT_POINT="$hook"

  # Trigger capture, wait for crash
  trigger_capture_and_wait

  # Restart and validate
  unset CAPTURE_FAULT_INJECTION
  restart_and_validate "$hook"

  # Record results
  record_hook_result "$hook" "$?"
done

generate_matrix_report
```

## Scope and Limitations

### In Scope

- Voice and email pipelines with single-process sequential execution (MPPP)
- All five hooks in the authoritative inventory
- Idempotency, audit uniqueness, temp file cleanup validation
- Hash immutability verification
- Placeholder export path testing (forced transcription failure)

### Out of Scope (YAGNI)

- Multi-process or distributed crash scenarios (Phase 3+)
- Concurrent transcription queue analysis (Phase 3+)
- Retrofill mutation tests (future only if adopted)
- Semantic consistency checks of transcript content (unit tests handle separately)

## Core Assertions Reference

Every hook test must validate:

1. **Idempotency:** Count of vault files with ULID prefix == 1
2. **No Duplicate Audit:** `SELECT COUNT(*) FROM exports_audit WHERE capture_id=?` == 1
3. **No Orphan Temp:** Glob `inbox/.tmp-*` empty after stabilization period (1s)
4. **Status Terminal:** `status LIKE 'exported%'`
5. **Hash Immutability:** If status was `transcribed` before crash, hash identical after restart
6. **No Silent Loss:** Every staged capture eventually reaches terminal or error with explicit record

## Auxiliary Validation

Additional test scenarios to strengthen confidence:

- **Sequential Double Crash:** Run same hook twice → still exactly one export
- **Mid-Placeholder Crash:** Inject crash during placeholder path → placeholder exported once
- **Backup During Crash:** Simulate backup at `before_export_write` → ensure backup does not contain partially exported state (audit row absent is acceptable)

## Harness Design Outline

```
┌─────────────────────────────────────────┐
│  Wrapper Script (crash-matrix-runner)   │
│  - Sets env vars (FAULT_POINT)          │
│  - Spawns main process                   │
│  - Detects exit code match               │
│  - Records hook outcome JSON             │
│  - Restarts for next hook                │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Main Process (with fault injection)    │
│  - Executes capture pipeline             │
│  - Crashes at configured hook            │
│  - Exits with code 137                   │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Restart Sequence (fault injection off) │
│  - Recovers from crash                   │
│  - Validates assertions                  │
│  - Updates aggregate report              │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Final Summary Report                    │
│  - PASS/FAIL per hook                    │
│  - Assertion counts                      │
│  - Recovery duration metrics             │
│  - Artifact: .crash-matrix/report.json  │
└─────────────────────────────────────────┘
```

## Metrics Collected (Optional)

- `fault_injection_triggered_total`: Increments once per intentional crash
- `recovery_ms`: Per-hook recovery duration (time from restart start → terminal status)

These metrics can be used for performance regression detection and reliability trending.

## Exit Criteria (Definition of Done)

The Crash Matrix test suite is considered complete when:

- ✅ 100% hooks exercised with green assertions
- ✅ Zero flaky outcomes across 3 consecutive full matrix runs
- ✅ Placeholder path tested at least once (forced transcription failure)
- ✅ Report stored as artifact (`./.crash-matrix/report-<timestamp>.json`)
- ✅ All core assertions pass for every hook
- ✅ No orphan temp files remain after any test

## Future Extension Triggers

Add a new hook to the crash matrix only when:

- New intermediate durability boundary introduced (e.g., concurrency scheduler, outbox queue)
- PR includes both hook implementation and documentation update
- Matrix expansion occurs before merge (no deferral)

Each added hook requires full matrix re-run to validate comprehensive coverage.

## Related Documentation

**PRDs and Specs:**
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md)
- [Staging Ledger Architecture](../features/staging-ledger/spec-staging-arch.md)
- [Staging Ledger Test Spec](../features/staging-ledger/spec-staging-test.md)
- [Capture PRD](../features/capture/prd-capture.md)
- [Capture Test Spec](../features/capture/spec-capture-test.md)

**Roadmap and Master Documents:**
- [Master Roadmap: State & Invariants](../master/roadmap.md)
- [Master PRD: Testing Strategy Triggers](../master/prd-master.md)

**Related Guides:**
- [Fault Injection Hook Registry](./guide-fault-injection-registry.md) - Authoritative hook catalog with implementation patterns
- [Error Recovery Guide](./guide-error-recovery.md) - Error classification and retry orchestration
- [TestKit Usage Guide](./guide-testkit-usage.md) - TestKit utilities for crash testing
- [Phase 1 Testing Patterns](./guide-phase1-testing-patterns.md)
- [Test Strategy](./guide-test-strategy.md)
- [Capture Debugging](./guide-capture-debugging.md)

**Schema References:**
- [Schema & Indexes: Export Status Machine](../features/staging-ledger/schema-indexes.md)

## Maintenance Notes

**When to Update This Guide:**

- New hook added to fault injection inventory
- Core assertions evolve or new invariants discovered
- Harness implementation reveals gaps in validation logic
- Phase 3+ introduces concurrency requiring expanded scope
- Exit criteria thresholds change based on production learnings

**Known Limitations:**

- Sequential execution model (MPPP) only; concurrent scenarios deferred
- No automatic hook discovery (manual inventory maintenance required)
- Requires manual fixture management for voice/email test data
- Recovery duration metrics are optional (not enforcement-gated)

**Next Actions:**

Implement harness after initial end-to-end path is stable (post Slice 2, pre Phase 2 resilience work).

---

**Document Version History:**
- 1.0.0 (2025-09-27): Initial guide standardization following template pattern