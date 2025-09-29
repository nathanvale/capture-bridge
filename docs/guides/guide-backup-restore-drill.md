---
title: Backup Restore Drill Runbook
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Backup Restore Drill Runbook

## Purpose

This operational runbook provides **step-by-step procedures** for restoring the ADHD Brain SQLite staging ledger from backup. It ensures safe, validated restoration with **zero data loss**, **rollback capability**, and **verification checklists** to confirm restore success.

**Target Audience:** System administrators, DevOps engineers, and users performing disaster recovery or database migration.

## When to Use This Runbook

Use this runbook when:

- **Database corruption detected** via `adhd doctor` health checks
- **Accidental data deletion** (e.g., manual database modification gone wrong)
- **Migration to new machine** (transferring ADHD Brain to new system)
- **Disaster recovery testing** (periodic restore drills to validate backup integrity)
- **Rollback after failed migration** (reverting to pre-migration state)
- **Recovery from backup verification failures** (3+ consecutive failures)

**Do NOT use this runbook for:**

- Normal database migrations (use `adhd migrate` instead)
- Schema updates (handled by migration system)
- Performance tuning (no restore required)

**Related Documentation:**

- [Backup Verification Guide](./guide-backup-verification.md) - Pre-restore integrity validation
- [Master PRD Section 6.2.1](../master/prd-master.md) - Backup & Verification Policy
- [Health Command Guide](./guide-health-command.md) - Post-restore validation
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Database schema reference

## Prerequisites

**Critical Requirements:**

- ✅ Backup file available and verified (run `adhd backup verify --file <backup>` first)
- ✅ Terminal access with `adhd` CLI available
- ✅ All capture workers stopped (prevents concurrent writes during restore)
- ✅ Sufficient disk space (2x database size for safety net backup)

**Recommended:**

- Familiarity with SQLite database operations
- Understanding of staging ledger schema (4 tables: captures, exports_audit, errors_log, sync_state)
- Access to Obsidian vault for export validation
- Backup of current database (automatic safety net in this runbook)

**Time Estimates:**

- Small database (<10MB): 2-3 minutes
- Medium database (10-100MB): 5-10 minutes
- Large database (100MB+): 10-20 minutes

## Quick Reference

### Full Restore Procedure (Copy-Paste Safe)

```bash
# ⚠️  READ ENTIRE RUNBOOK BEFORE EXECUTING ⚠️
# This procedure overwrites your current database

# Step 1: Stop all capture workers
adhd capture stop --all

# Step 2: Verify backup integrity (REQUIRED)
adhd backup verify --file <backup-path>

# Step 3: Create safety net (backup current database)
cp ~/.adhd-brain.db ~/.adhd-brain.db.pre-restore-$(date +%Y%m%d-%H%M%S)

# Step 4: Restore from backup
cp <backup-path> ~/.adhd-brain.db

# Step 5: Validate restoration
adhd doctor --component=database

# Step 6: Restart capture workers
adhd capture start

# Step 7: Verify capture pipeline operational
adhd capture status
```

### Recovery Time Objectives (RTO/RPO)

| Metric                             | Target      | Description                                             |
| ---------------------------------- | ----------- | ------------------------------------------------------- |
| **RTO** (Recovery Time Objective)  | < 5 minutes | Time from detection to full operational restore         |
| **RPO** (Recovery Point Objective) | < 24 hours  | Maximum data loss (last successful hourly backup)       |
| **Validation Time**                | < 2 minutes | Post-restore health check duration                      |
| **Rollback Time**                  | < 1 minute  | Time to revert to pre-restore state if validation fails |

## Step-by-Step Instructions

### Step 0: Pre-Restore Checklist (CRITICAL)

**Before executing any restore commands, verify:**

- [ ] **Backup file identified** - Know exact path and timestamp
- [ ] **Backup verified** - Run `adhd backup verify --file <backup>` successfully
- [ ] **Capture workers stopped** - Confirm no active polling or transcription
- [ ] **Disk space available** - At least 2x current database size
- [ ] **Vault accessible** - Obsidian vault path exists and writable
- [ ] **Terminal access** - Logged in with correct user permissions
- [ ] **Runbook read** - Understand entire procedure before starting

**If ANY item above is not checked, STOP and resolve before proceeding.**

### Step 1: Stop All Capture Workers

**Purpose:** Prevent concurrent writes to database during restore (prevents corruption).

```bash
# Stop all capture workers (voice, email)
adhd capture stop --all

# Expected output:
# ✅ Voice capture worker stopped
# ✅ Email capture worker stopped
# All capture workers stopped successfully
```

**Verification:**

```bash
# Verify no capture processes running
ps aux | grep adhd | grep capture

# Expected output: (empty - no capture processes)
```

**Troubleshooting:**

- If workers don't stop gracefully, force kill: `pkill -9 -f "adhd capture"`
- Check for orphaned processes: `pgrep -f "adhd capture"`

**Expected Duration:** 5-10 seconds

### Step 2: Verify Backup Integrity (REQUIRED)

**Purpose:** Ensure backup is not corrupt before overwriting live database.

```bash
# Run backup verification on target backup file
adhd backup verify --file <backup-path>

# Example:
adhd backup verify --file ~/.obsidian-vault/.adhd-brain/.backups/ledger-20250928-14.sqlite

# Expected output:
# ✅ Backup verified: ledger-20250928-14.sqlite
# ✅ Integrity check: PASSED
# ✅ Schema validation: PASSED (4 tables)
# ✅ Foreign key validation: PASSED
# Verification Status: SUCCESS
```

**Critical Decision Point:**

- ✅ **SUCCESS** → Proceed to Step 3
- ❌ **FAILURE** → **STOP** - Do not restore corrupt backup. Try previous backup:

```bash
# List available backups (newest first)
ls -lt ~/.obsidian-vault/.adhd-brain/.backups/ | head -10

# Verify next most recent backup
adhd backup verify --file <previous-backup>
```

**Expected Duration:** 10-30 seconds

### Step 3: Create Safety Net (Backup Current Database)

**Purpose:** Enable rollback if restore fails or restores wrong data.

```bash
# Backup current database with timestamp
SAFETY_NET="$HOME/.adhd-brain.db.pre-restore-$(date +%Y%m%d-%H%M%S)"
cp ~/.adhd-brain.db "${SAFETY_NET}"

# Verify safety net created
ls -lh "${SAFETY_NET}"

# Expected output:
# -rw-r--r--  1 user  staff   2.4M Sep 28 14:30 /Users/user/.adhd-brain.db.pre-restore-20250928-143045
```

**Critical:** Do not skip this step. It's your only rollback option if restore fails.

**Expected Duration:** 5-10 seconds

### Step 4: Restore from Backup

**Purpose:** Overwrite live database with verified backup.

```bash
# Restore backup to live database location
cp <backup-path> ~/.adhd-brain.db

# Example:
cp ~/.obsidian-vault/.adhd-brain/.backups/ledger-20250928-14.sqlite ~/.adhd-brain.db

# Verify file replaced
ls -lh ~/.adhd-brain.db

# Expected output:
# -rw-r--r--  1 user  staff   2.4M Sep 28 14:31 /Users/user/.adhd-brain.db
```

**Verification:**

```bash
# Verify database readable
sqlite3 ~/.adhd-brain.db "SELECT COUNT(*) FROM captures;"

# Expected output: (integer count of captures)
# Example: 1234
```

**Expected Duration:** 5-15 seconds (depends on database size)

### Step 5: Validate Restoration (Health Check)

**Purpose:** Confirm database schema intact, queries functional, no corruption.

```bash
# Run comprehensive health check on database component
adhd doctor --component=database

# Expected output:
# ✅ Database file exists and readable
# ✅ SQLite integrity check: PASSED
# ✅ Schema validation: 4 tables present
# ✅ Foreign key validation: PASSED
# ✅ Query validation: Sample queries successful
# Database Status: HEALTHY
```

**Detailed Validation:**

```bash
# Verify table counts
sqlite3 ~/.adhd-brain.db <<EOF
SELECT 'captures', COUNT(*) FROM captures
UNION ALL
SELECT 'exports_audit', COUNT(*) FROM exports_audit
UNION ALL
SELECT 'errors_log', COUNT(*) FROM errors_log
UNION ALL
SELECT 'sync_state', COUNT(*) FROM sync_state;
EOF

# Expected output:
# captures|1234
# exports_audit|1234
# errors_log|23
# sync_state|2
```

**Critical Decision Point:**

- ✅ **HEALTHY** → Proceed to Step 6
- ❌ **UNHEALTHY** → **ROLLBACK** - Go to "Rollback Procedure" section

**Expected Duration:** 30-60 seconds

### Step 6: Restart Capture Workers

**Purpose:** Resume capture pipeline operations (voice/email polling).

```bash
# Restart all capture workers
adhd capture start

# Expected output:
# ✅ Voice capture worker started (PID: 12345)
# ✅ Email capture worker started (PID: 12346)
# All capture workers started successfully
```

**Verification:**

```bash
# Verify workers running
adhd capture status

# Expected output:
# Voice Capture: RUNNING (last poll: 2025-09-28 14:32:15)
# Email Capture: RUNNING (last poll: 2025-09-28 14:32:18)
```

**Expected Duration:** 5-10 seconds

### Step 7: Validate Capture Pipeline Operational

**Purpose:** Ensure end-to-end pipeline functional post-restore.

```bash
# Check capture pipeline status
adhd capture status --verbose

# Expected output:
# Voice Capture: RUNNING
#   Last poll: 2025-09-28 14:32:15
#   Pending exports: 3
#   Last successful export: 2025-09-28 14:30:00
#
# Email Capture: RUNNING
#   Last poll: 2025-09-28 14:32:18
#   Pending exports: 0
#   Last successful export: 2025-09-28 14:25:00
```

**Functional Test (Optional but Recommended):**

```bash
# Trigger test capture to verify end-to-end pipeline
echo "Test capture post-restore" | adhd capture text --test

# Verify export to vault
ls -lt ~/obsidian-vault/inbox/ | head -5

# Expected: New file with recent timestamp
```

**Expected Duration:** 30-60 seconds

## Validation Checklist

After restore completes, verify all items pass:

### Database Health

- [ ] Health check passes: `adhd doctor --component=database` returns `HEALTHY`
- [ ] Capture count matches expected: `sqlite3 ~/.adhd-brain.db "SELECT COUNT(*) FROM captures;"`
- [ ] Export audit count matches captures: `sqlite3 ~/.adhd-brain.db "SELECT COUNT(*) FROM exports_audit;"`
- [ ] No orphaned captures: `adhd capture orphans` returns empty
- [ ] Foreign keys valid: `sqlite3 ~/.adhd-brain.db "PRAGMA foreign_key_check;"` returns empty

### Worker Health

- [ ] Voice capture running: `adhd capture status | grep "Voice Capture: RUNNING"`
- [ ] Email capture running: `adhd capture status | grep "Email Capture: RUNNING"`
- [ ] Last poll timestamp recent (< 5 minutes ago)
- [ ] No error logs in last 5 minutes: `tail -n 50 /var/log/adhd-capture.log | grep ERROR`

### Vault Health

- [ ] Obsidian vault path accessible: `ls ~/obsidian-vault/inbox/`
- [ ] Recent exports visible: `ls -lt ~/obsidian-vault/inbox/ | head -10`
- [ ] Export file count reasonable (matches audit count ±10)
- [ ] No `.tmp-*` files present: `ls ~/obsidian-vault/inbox/.tmp-* 2>/dev/null` returns empty

### Operational Health

- [ ] Test capture succeeds: `echo "test" | adhd capture text --test`
- [ ] Last export timestamp reasonable: `adhd export status`
- [ ] Metrics emitting: `tail ~/.adhd-brain/.metrics/$(date +%Y-%m-%d).ndjson`
- [ ] No degraded status: `adhd doctor --json | jq '.overall_status'` returns `"healthy"`

**If all items checked, restore is SUCCESSFUL. Remove safety net:**

```bash
# Optional: Remove pre-restore backup after 24h validation period
rm ~/.adhd-brain.db.pre-restore-*
```

**If ANY item fails, proceed to Rollback Procedure.**

## Rollback Procedure

### When to Rollback

Rollback to pre-restore state if:

- ❌ Health check fails after restore (`adhd doctor` reports errors)
- ❌ Capture count differs significantly from expected (>10% variance)
- ❌ Capture workers fail to start or crash immediately
- ❌ Validation queries fail (foreign key violations, schema errors)
- ❌ End-to-end test capture fails
- ❌ Exported file count doesn't match audit table

### Rollback Steps (Copy-Paste Safe)

```bash
# ⚠️  ROLLBACK PROCEDURE - Reverting to pre-restore state ⚠️

# Step 1: Stop capture workers (prevent writes)
adhd capture stop --all

# Step 2: Identify safety net backup
ls -lt ~/.adhd-brain.db.pre-restore-* | head -1

# Expected output:
# -rw-r--r--  1 user  staff   2.4M Sep 28 14:30 /Users/user/.adhd-brain.db.pre-restore-20250928-143045

# Step 3: Remove failed restore
rm ~/.adhd-brain.db

# Step 4: Restore from safety net
cp ~/.adhd-brain.db.pre-restore-* ~/.adhd-brain.db

# Step 5: Validate rollback
adhd doctor --component=database

# Expected output:
# ✅ Database Status: HEALTHY

# Step 6: Restart capture workers
adhd capture start

# Step 7: Verify operational
adhd capture status
```

**Rollback Time:** < 1 minute (faster than initial restore)

**Post-Rollback Actions:**

1. Investigate why restore failed (check backup integrity)
2. Review error logs: `tail -n 100 /var/log/adhd-capture.log`
3. Try restoring from different backup (earlier timestamp)
4. If all backups fail, report issue and investigate root cause

## Common Scenarios

### Scenario 1: Database Corruption Detected

**Symptom:** `adhd doctor` reports database corruption

```bash
# Symptom:
adhd doctor --component=database

# Output:
# 🔴 Database integrity check: FAILED
# Error: database disk image is malformed
```

**Resolution:**

```bash
# Step 1: Stop workers
adhd capture stop --all

# Step 2: Identify last good backup (verify multiple backups)
for backup in $(ls -t ~/.obsidian-vault/.adhd-brain/.backups/ledger-*.sqlite | head -5); do
  echo "Verifying: $backup"
  adhd backup verify --file "$backup"
done

# Step 3: Use first backup that passes verification
# Follow full restore procedure above
```

### Scenario 2: Migration to New Machine

**Symptom:** Setting up ADHD Brain on new computer

```bash
# Step 1: Copy entire backup directory to new machine
scp -r old-machine:~/.obsidian-vault/.adhd-brain/.backups/ ~/.obsidian-vault/.adhd-brain/

# Step 2: Identify most recent backup
ls -lt ~/.obsidian-vault/.adhd-brain/.backups/ | head -1

# Step 3: Verify backup
adhd backup verify --file <backup-path>

# Step 4: Restore (no safety net needed on new machine)
cp <backup-path> ~/.adhd-brain.db

# Step 5: Validate
adhd doctor --component=database

# Step 6: Start capture workers
adhd capture start
```

### Scenario 3: Accidental Data Deletion

**Symptom:** Captures deleted or modified incorrectly

```bash
# Example: Accidentally deleted all staged captures
sqlite3 ~/.adhd-brain.db "DELETE FROM captures WHERE status = 'staged';"

# Recovery:

# Step 1: Stop workers immediately
adhd capture stop --all

# Step 2: Find backup BEFORE deletion
# (Use hourly backups, find one 1-2 hours before mistake)
ls -lt ~/.obsidian-vault/.adhd-brain/.backups/ | grep "ledger-$(date +%Y%m%d)"

# Step 3: Verify backup has deleted data
sqlite3 <backup-path> "SELECT COUNT(*) FROM captures WHERE status = 'staged';"

# Expected: Non-zero count (confirms backup has data)

# Step 4: Follow full restore procedure
# (Creates safety net of corrupted state, then restores)
```

### Scenario 4: Restore Test Drill (No Actual Restore)

**Purpose:** Validate backup restoration process without affecting live system

```bash
# Restore to temporary database for validation
RESTORE_TEST_DB="/tmp/adhd-brain-restore-test-$(date +%Y%m%d-%H%M%S).db"

# Step 1: Verify backup
adhd backup verify --file <backup-path>

# Step 2: Restore to temp location
cp <backup-path> "${RESTORE_TEST_DB}"

# Step 3: Validate temp database
sqlite3 "${RESTORE_TEST_DB}" "PRAGMA integrity_check;"
sqlite3 "${RESTORE_TEST_DB}" "SELECT COUNT(*) FROM captures;"
sqlite3 "${RESTORE_TEST_DB}" "PRAGMA foreign_key_check;"

# Step 4: Cleanup
rm "${RESTORE_TEST_DB}"

# Expected output: All checks pass (no actual restore performed)
```

## Troubleshooting

### Problem: Health check fails after restore

**Symptom:** `adhd doctor --component=database` reports errors post-restore

**Possible Causes:**

- Backup was corrupt (verification skipped or failed)
- Database file permissions incorrect
- SQLite version mismatch (backup created with newer SQLite)

**Resolution:**

```bash
# Step 1: Check file permissions
ls -l ~/.adhd-brain.db

# Expected: -rw-r--r-- (user readable/writable)

# Step 2: Fix permissions if needed
chmod 644 ~/.adhd-brain.db

# Step 3: Verify SQLite version compatibility
sqlite3 --version

# Expected: 3.40+ (minimum supported version)

# Step 4: Run detailed integrity check
sqlite3 ~/.adhd-brain.db "PRAGMA integrity_check;"

# If "ok" → permissions issue (fixed)
# If errors → corrupt backup → ROLLBACK
```

### Problem: Capture count differs from expected

**Symptom:** Restored capture count significantly different from expected

**Possible Causes:**

- Backup older than expected (RPO mismatch)
- Backup from wrong database (test vs. production)
- Data loss between backup and failure

**Resolution:**

```bash
# Step 1: Check backup timestamp
ls -l <backup-path>

# Verify timestamp matches expectation

# Step 2: Calculate expected data loss (RPO)
# Hourly backups → up to 1 hour of captures lost
# Example: If failure at 14:30, last backup at 14:00, expect ~1 hour missing

# Step 3: Verify last capture timestamp in restored DB
sqlite3 ~/.adhd-brain.db "SELECT MAX(created_at) FROM captures;"

# Expected: Timestamp close to backup timestamp

# Step 4: If backup timestamp correct, data loss is expected (within RPO)
# If backup timestamp wrong, rollback and use correct backup
```

### Problem: Capture workers fail to start

**Symptom:** `adhd capture start` fails or workers crash immediately

**Possible Causes:**

- Database schema migration needed (restored older version)
- Corrupted sync_state table (poll cursors invalid)
- File permissions prevent worker access

**Resolution:**

```bash
# Step 1: Check migration status
adhd migrate status

# Expected: All migrations applied

# Step 2: Apply missing migrations if needed
adhd migrate up

# Step 3: Reset sync_state (clears poll cursors)
sqlite3 ~/.adhd-brain.db "UPDATE sync_state SET cursor = NULL;"

# Step 4: Restart workers
adhd capture start

# Step 5: Monitor logs for errors
tail -f /var/log/adhd-capture.log
```

### Problem: Export file count doesn't match audit table

**Symptom:** Vault file count differs from exports_audit row count

**Possible Causes:**

- Manual vault file deletion (orphaned audit rows)
- Failed export cleanup (temp files not removed)
- Vault path changed after backup (exports to wrong location)

**Resolution:**

```bash
# Step 1: Check vault path configuration
adhd config get vault_path

# Expected: Correct Obsidian vault path

# Step 2: Count vault files vs. audit rows
VAULT_FILES=$(ls ~/obsidian-vault/inbox/*.md | wc -l)
AUDIT_ROWS=$(sqlite3 ~/.adhd-brain.db "SELECT COUNT(*) FROM exports_audit;")

echo "Vault files: ${VAULT_FILES}"
echo "Audit rows: ${AUDIT_ROWS}"

# Step 3: If audit > vault → orphaned audit rows (acceptable, ledger is source of truth)
# If vault > audit → orphaned files (cleanup needed)

# Step 4: Cleanup orphaned vault files (if needed)
adhd export cleanup --orphaned
```

## Examples

### Example 1: Full Restore from Corruption

```bash
# Scenario: Database corrupted, restoring from hourly backup

# Detected via health check:
$ adhd doctor --component=database
🔴 Database integrity check: FAILED
Error: database disk image is malformed

# Execute restore:
$ adhd capture stop --all
✅ All workers stopped

$ adhd backup verify --file ~/.obsidian-vault/.adhd-brain/.backups/ledger-20250928-14.sqlite
✅ Verification Status: SUCCESS

$ cp ~/.adhd-brain.db ~/.adhd-brain.db.pre-restore-20250928-143045
$ cp ~/.obsidian-vault/.adhd-brain/.backups/ledger-20250928-14.sqlite ~/.adhd-brain.db

$ adhd doctor --component=database
✅ Database Status: HEALTHY

$ adhd capture start
✅ All workers started

$ adhd capture status
Voice Capture: RUNNING (last poll: 2025-09-28 14:32:15)
Email Capture: RUNNING (last poll: 2025-09-28 14:32:18)

# Restore complete, 45 minutes of data recovered (RPO met)
```

### Example 2: Restore Test Drill (Monthly Practice)

```bash
# Scenario: Monthly restore test drill (no actual restore)

$ RESTORE_TEST="/tmp/adhd-restore-drill-$(date +%Y%m%d).db"

$ adhd backup verify --file ~/.obsidian-vault/.adhd-brain/.backups/ledger-20250928-14.sqlite
✅ Verification Status: SUCCESS

$ cp ~/.obsidian-vault/.adhd-brain/.backups/ledger-20250928-14.sqlite "${RESTORE_TEST}"

$ sqlite3 "${RESTORE_TEST}" "PRAGMA integrity_check;"
ok

$ sqlite3 "${RESTORE_TEST}" "SELECT COUNT(*) FROM captures;"
1234

$ sqlite3 "${RESTORE_TEST}" "PRAGMA foreign_key_check;"
(empty - no violations)

$ rm "${RESTORE_TEST}"

# Restore drill successful - backup verified restorable
```

## Related Documentation

### Core References

- [Backup Verification Guide](./guide-backup-verification.md) - Pre-restore integrity checks (REQUIRED reading)
- [Master PRD v2.3.0-MPPP Section 6.2.1](../master/prd-master.md) - Backup & Verification Policy
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Database schema and durability requirements

### Related Guides

- [Health Command Guide](./guide-health-command.md) - Post-restore validation via `adhd doctor`
- [Error Recovery Guide](./guide-error-recovery.md) - Error classification and recovery patterns
- [Capture Debugging Guide](./guide-capture-debugging.md) - Worker troubleshooting

### Technical Specs

- [Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md) - Backup/restore API implementation
- [CLI Doctor Tech Spec](../features/cli/spec-cli-tech.md#doctor-command) - Health check implementation

## Maintenance Notes

### When to Update This Runbook

- Restore procedure changes (e.g., new validation steps)
- RTO/RPO targets modified
- Backup location or retention policy changes
- New health checks added to `adhd doctor`
- Migration system changes (schema upgrade process)

### Known Limitations (MPPP Scope)

- **No automated restore triggers** - Manual procedure only
- **No incremental restore** - Full database replacement only
- **No point-in-time recovery** - Hourly backup granularity only
- **No cloud backup sync** - Local backups only (manual remote copy required)
- **No rollback validation** - Safety net assumed valid (not verified)

### Future Enhancements (Phase 2+)

- Automated restore triggers on critical health check failures
- Point-in-time recovery using WAL archives
- Cloud backup sync (encrypted, privacy-preserving)
- Incremental restore (apply delta since backup)
- Restore progress tracking and ETA
- Automated post-restore smoke tests
- Blue-green restore (parallel validation before swap)
