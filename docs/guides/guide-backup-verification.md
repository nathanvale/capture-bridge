---
title: Backup Verification Guide
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Backup Verification Guide

## Purpose

This guide provides step-by-step procedures for setting up and running **automated backup verification** for the ADHD Brain SQLite staging ledger. Backup verification ensures that hourly backups are not silently corrupted, missing, or invalid, preventing catastrophic data loss scenarios during disaster recovery.

**Target Audience:** System administrators, DevOps engineers, and users implementing backup policies for the ADHD Brain capture system.

## When to Use This Guide

Use this guide when:

- Setting up the ADHD Brain system for the first time (backup configuration)
- Configuring automated backup verification schedules (cron jobs)
- Validating backup integrity before relying on backups for recovery
- Troubleshooting backup verification failures
- Integrating backup checks into monitoring or alerting systems
- Responding to backup verification escalation alerts

**Related Features:**
- [Master PRD Section 6.2.1](../master/prd-master.md) - Backup & Verification Policy
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Database schema and durability requirements
- [Health Command Guide](./guide-health-command.md) - Integration with `adhd doctor` command
- [Backup Restore Guide](./guide-backup-restore-drill.md) - Post-verification restore procedures

## Prerequisites

**Required:**
- ADHD Brain system installed with SQLite staging ledger initialized
- SQLite3 CLI tool available (`sqlite3` command)
- Access to backup directory (default: `${VAULT_ROOT}/.adhd-brain/.backups/`)
- Basic understanding of cron scheduling (for automation)

**Recommended:**
- Familiarity with SQLite `PRAGMA` commands
- Understanding of SHA-256 checksums for file integrity
- Knowledge of backup retention policies (24 hourly + 7 daily)

## Quick Reference

### TL;DR Commands

```bash
# Run immediate verification of last backup
adhd backup verify --last

# Schedule daily automatic verification (2 AM local time)
adhd backup verify --schedule daily

# Verify specific backup file
adhd backup verify --file ~/.obsidian-vault/.adhd-brain/.backups/ledger-20250928-14.sqlite

# Check verification status and history
adhd backup verify --status

# Force backup creation + verification (manual trigger)
adhd backup verify --force-backup
```

### Verification Decision Tree

```text
Backup File Exists?
    ↓ NO → FAILURE: Alert immediately, halt pruning
    ↓ YES
SQLite Integrity Check Passes?
    ↓ NO → FAILURE: Alert immediately, halt pruning
    ↓ YES
Schema Validation (4 tables)?
    ↓ NO → FAILURE: Alert immediately, halt pruning
    ↓ YES
Checksum Matches Live DB?
    ↓ NO → WARNING: Size drift, investigate
    ↓ YES
Backup Size Within 10% Variance?
    ↓ NO → WARNING: Log drift, continue
    ↓ YES
SUCCESS → Log metrics, no action
```

## Step-by-Step Instructions

### Step 1: Configure Backup Destination

Ensure the backup directory exists and is writable:

```bash
# Default backup location
export BACKUP_DIR="${VAULT_ROOT}/.adhd-brain/.backups"

# Create backup directory if not exists
mkdir -p "${BACKUP_DIR}"

# Verify write permissions
touch "${BACKUP_DIR}/test.tmp" && rm "${BACKUP_DIR}/test.tmp"
```

**Expected Outcome:** Backup directory exists with correct permissions.

**Troubleshooting:** If permission denied, check vault ownership and file system permissions.

### Step 2: Run Initial Verification (Manual)

Before relying on automated verification, run a manual check to validate the setup:

```bash
# Trigger immediate backup + verification
adhd backup verify --force-backup

# Expected output:
# ✅ Backup created: ledger-20250928-14.sqlite (2.4 MB)
# ✅ Integrity check: PASSED (PRAGMA integrity_check)
# ✅ Schema validation: PASSED (4 tables found)
# ✅ Checksum validation: PASSED (SHA-256 match)
# ✅ Size variance: 2% (within threshold)
#
# Verification Status: SUCCESS
```

**Expected Outcome:** All checks pass with `SUCCESS` status.

**Troubleshooting:** See "Common Problems" section below if any checks fail.

### Step 3: Configure Automated Verification Schedule

Set up cron job for daily verification (recommended: 2:00 AM local time):

```bash
# Open crontab editor
crontab -e

# Add verification schedule (daily at 2 AM)
0 2 * * * /usr/local/bin/adhd backup verify --last >> /var/log/adhd-backup-verify.log 2>&1

# Alternative: Hourly verification (after hourly backup at :05 past the hour)
5 * * * * /usr/local/bin/adhd backup verify --last >> /var/log/adhd-backup-verify.log 2>&1
```

**Expected Outcome:** Cron job scheduled and running on schedule.

**Verification:** Check logs after first scheduled run:

```bash
tail -f /var/log/adhd-backup-verify.log
```

### Step 4: Monitor Verification Logs

Verification results are logged to metrics and system logs:

```bash
# Check verification metrics (NDJSON format)
cat ~/.adhd-brain/.metrics/$(date +%Y-%m-%d).ndjson | grep backup_verification

# Expected output:
# {"metric":"backup_verification_result","value":"success","timestamp":"2025-09-28T14:05:00Z"}
# {"metric":"backup_verification_duration_ms","value":245,"timestamp":"2025-09-28T14:05:00Z"}
# {"metric":"backup_last_verified_at","value":"2025-09-28T14:05:00Z","timestamp":"2025-09-28T14:05:00Z"}
```

**Metrics Emitted:**

| Metric | Type | Description |
|--------|------|-------------|
| `backup.verification.success` | Counter | Successful verification count |
| `backup.verification.failure` | Counter (by error type) | Failed verification count |
| `backup.verification.duration_ms` | Histogram | Verification execution time |
| `backup.last_verified_at` | Timestamp | Last successful verification |

### Step 5: Respond to Verification Failures

Follow the escalation policy based on consecutive failure count:

#### 1 Failure: WARN Status

```bash
# Check doctor command for backup health
adhd doctor --category=operational

# Expected output:
# ⚠️  Backup Verification: WARN (1 consecutive failure)
# Last successful verification: 2025-09-28 12:00:00
# Action: Monitor next verification cycle
```

**Action:** Log warning, continue normal operations. No immediate intervention required.

#### 2 Consecutive Failures: DEGRADED_BACKUP Status

```bash
# Doctor command shows degraded state
adhd doctor --category=operational

# Expected output:
# 🔴 Backup Verification: DEGRADED_BACKUP (2 consecutive failures)
# Last successful verification: 2025-09-27 14:00:00
# Action: Investigate backup integrity issues
```

**Action:** Alert via doctor command, continue operations. Begin investigation:

1. Check backup file exists and is not empty
2. Verify SQLite integrity manually: `sqlite3 <backup> "PRAGMA integrity_check;"`
3. Review error logs: `tail -n 50 /var/log/adhd-backup-verify.log`

#### 3 Consecutive Failures: HALT_PRUNING Status

```bash
# Doctor command shows critical state
adhd doctor --category=operational

# Expected output:
# 🚨 Backup Verification: HALT_PRUNING (3 consecutive failures)
# Last successful verification: 2025-09-26 14:00:00
# Action: CRITICAL - Manual intervention required
# Status: Pruning paused, ingestion continues
```

**Action:** Immediate manual intervention required:

1. **Halt capture pruning** (system automatically pauses 90-day cleanup)
2. **Preserve all captures** (no automatic trimming until resolved)
3. **Continue ingestion** (capture pipeline not affected)
4. **Manual verification:**

```bash
# Force new backup creation
adhd backup verify --force-backup

# If successful, escalation resets automatically
# If still failing, restore from last known good backup (see Backup Restore Guide)
```

## Integrity Check Steps (Under the Hood)

The `adhd backup verify` command performs these checks sequentially:

### Check 1: File Existence

```bash
# Verify backup file exists
ls -lh "${BACKUP_DIR}/ledger-$(date +%Y%m%d-%H).sqlite"
```

**Failure:** `FILE_NOT_FOUND` - Backup process failed or file deleted.

### Check 2: SQLite Integrity Check

```bash
# Run SQLite's built-in integrity check
sqlite3 "${BACKUP_FILE}" "PRAGMA integrity_check;"

# Expected output: "ok"
# Failure output: List of corrupted pages/tables
```

**Failure:** `INTEGRITY_FAILURE` - Database corruption detected.

### Check 3: Schema Validation

```bash
# Verify all 4 required tables exist
sqlite3 "${BACKUP_FILE}" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Expected output:
# captures
# errors_log
# exports_audit
# sync_state
```

**Failure:** `SCHEMA_MISMATCH` - Missing tables or migration failure.

### Check 4: Foreign Key Validation

```bash
# Check referential integrity
sqlite3 "${BACKUP_FILE}" "PRAGMA foreign_key_check;"

# Expected output: (empty - no violations)
```

**Failure:** `FK_VIOLATION` - Orphaned references detected.

### Check 5: Checksum Validation (Optional)

```bash
# Compare SHA-256 checksums (backup vs live DB)
BACKUP_HASH=$(shasum -a 256 "${BACKUP_FILE}" | awk '{print $1}')
LIVE_HASH=$(shasum -a 256 ~/.adhd-brain.db | awk '{print $1}')

# Note: Hashes will differ if live DB has writes since backup
# This check validates backup is not empty/truncated
```

**Warning:** `HASH_MISMATCH` - Expected if writes occurred since backup. Verify backup size is reasonable.

### Check 6: Size Variance Check

```bash
# Verify backup size within 10% of live database
BACKUP_SIZE=$(stat -f%z "${BACKUP_FILE}")
LIVE_SIZE=$(stat -f%z ~/.adhd-brain.db)
VARIANCE=$((100 * (BACKUP_SIZE - LIVE_SIZE) / LIVE_SIZE))

# Expected: Variance between -10% and +10%
```

**Warning:** `SIZE_DRIFT` - Backup significantly smaller/larger than expected. Investigate if variance > 10%.

## Success Criteria

A backup passes verification when:

- ✅ Backup file exists and is readable
- ✅ SQLite `PRAGMA integrity_check` returns `ok`
- ✅ All 4 tables present: `captures`, `exports_audit`, `errors_log`, `sync_state`
- ✅ No foreign key violations detected
- ✅ Backup size within 10% variance of live database
- ✅ (Optional) Restoration smoke test passes (weekly recommended)

## Escalation Policy Summary

| Failures | Status | Action | Pruning | Ingestion |
|----------|--------|--------|---------|-----------|
| 0 | `HEALTHY` | No action | Active | Active |
| 1 | `WARN` | Log warning | Active | Active |
| 2 | `DEGRADED_BACKUP` | Alert via doctor | Active | Active |
| 3+ | `HALT_PRUNING` | Manual intervention | **PAUSED** | Active |

**Recovery:** Automatic reset to `WARN` after single successful verification.

## Common Patterns

### Pattern 1: Daily Verification with Email Alerts

```bash
# Cron job with email notification on failure
0 2 * * * /usr/local/bin/adhd backup verify --last || echo "Backup verification failed" | mail -s "ADHD Brain Backup Alert" admin@example.com
```

### Pattern 2: Pre-Restore Verification

Always verify backup integrity before restore:

```bash
# Step 1: Verify backup
adhd backup verify --file <backup-path>

# Step 2: Only proceed if SUCCESS
if [ $? -eq 0 ]; then
  adhd backup restore --file <backup-path>
else
  echo "Backup verification failed - do not restore"
  exit 1
fi
```

### Pattern 3: Integration with Health Check

```bash
# Run doctor command to check backup health
adhd doctor --category=operational --json | jq '.checks[] | select(.name=="backup_verification")'

# Expected output:
# {
#   "name": "backup_verification",
#   "status": "healthy",
#   "last_success": "2025-09-28T14:05:00Z",
#   "consecutive_failures": 0
# }
```

## Troubleshooting

### Problem: Verification fails with "database locked"

**Symptom:** `SQLITE_BUSY: database is locked`

**Cause:** Capture workers or export processes are writing to the database during verification.

**Solution:**

```bash
# Option 1: Retry verification (backup uses WAL mode, should succeed on retry)
adhd backup verify --last --retry 3

# Option 2: Schedule verification during low-activity period (e.g., 2 AM)
# Option 3: Temporarily stop capture workers (not recommended)
```

### Problem: Backup file missing

**Symptom:** `FILE_NOT_FOUND: Backup file does not exist`

**Cause:** Hourly backup process failed or file was deleted.

**Solution:**

```bash
# Check backup process logs
grep "backup" /var/log/adhd-capture.log

# Force manual backup creation
adhd backup verify --force-backup

# Verify backup directory permissions
ls -la ~/.obsidian-vault/.adhd-brain/.backups/
```

### Problem: Integrity check fails

**Symptom:** `INTEGRITY_FAILURE: Database corruption detected`

**Cause:** Disk corruption, incomplete backup, or write failure.

**Solution:**

```bash
# Step 1: Check disk health
diskutil verifyVolume /

# Step 2: Attempt recovery from previous backup
adhd backup restore --file <previous-good-backup>

# Step 3: If all backups corrupted, restore from daily snapshot
ls -lt ~/.obsidian-vault/.adhd-brain/.backups/ | grep daily

# Step 4: Report issue and investigate root cause (disk failure?)
```

### Problem: Schema mismatch (missing tables)

**Symptom:** `SCHEMA_MISMATCH: Expected 4 tables, found 3`

**Cause:** Backup captured during migration or incomplete schema initialization.

**Solution:**

```bash
# Verify live database schema
sqlite3 ~/.adhd-brain.db ".schema"

# If live DB correct, retry backup
adhd backup verify --force-backup

# If live DB also missing tables, run migrations
adhd migrate --up
```

## Examples

### Example 1: First-Time Setup

```bash
# Step 1: Install ADHD Brain and initialize database
adhd init

# Step 2: Verify backup directory created
ls -la ~/.obsidian-vault/.adhd-brain/.backups/

# Step 3: Run first manual verification
adhd backup verify --force-backup

# Expected output:
# ✅ Backup created: ledger-20250928-14.sqlite (1.2 MB)
# ✅ All integrity checks passed
# Verification Status: SUCCESS

# Step 4: Schedule automated verification
crontab -e
# Add: 0 2 * * * /usr/local/bin/adhd backup verify --last

# Step 5: Verify cron job scheduled
crontab -l | grep backup
```

### Example 2: Weekly Restore Test

```bash
# Run weekly restore test to temporary database
adhd backup verify --restore-test

# Expected output:
# ✅ Backup verified: ledger-20250928-14.sqlite
# ✅ Restore test: Creating temporary database
# ✅ Restore test: Restored 1,234 captures
# ✅ Restore test: Query validation passed
# ✅ Restore test: Cleanup complete
# Verification Status: SUCCESS (with restore test)
```

### Example 3: Investigating Degraded State

```bash
# Scenario: 2 consecutive failures detected

# Step 1: Check doctor command
adhd doctor --category=operational

# Output:
# 🔴 Backup Verification: DEGRADED_BACKUP (2 consecutive failures)

# Step 2: Check error logs
tail -n 100 /var/log/adhd-backup-verify.log

# Step 3: Manual verification with verbose output
adhd backup verify --last --verbose

# Step 4: If backup corrupt, restore from previous
adhd backup restore --file ledger-20250927-14.sqlite

# Step 5: Verify restoration successful
adhd doctor --category=infrastructure
```

## Related Documentation

### Core References
- [Master PRD v2.3.0-MPPP Section 6.2.1](../master/prd-master.md) - Backup & Verification Policy (authoritative)
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Database schema and requirements
- [Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md) - Backup API implementation

### Related Guides
- [Backup Restore Guide](./guide-backup-restore-drill.md) - Step-by-step restore procedures
- [Health Command Guide](./guide-health-command.md) - Integration with `adhd doctor`
- [Error Recovery Guide](./guide-error-recovery.md) - Error classification and retry logic

### Technical Specs
- [CLI Doctor Tech Spec](../features/cli/spec-cli-tech.md#doctor-command) - Health check implementation

## Maintenance Notes

### When to Update This Guide

- Backup verification logic changes (e.g., new integrity checks added)
- Escalation policy modified (failure thresholds or actions)
- New verification commands added to CLI
- Metrics schema changes (new metrics emitted)

### Known Limitations

- **MPPP Scope:** Weekly restore test not implemented (manual process documented)
- **Checksum validation:** SHA-256 comparison only warns on mismatch (writes during backup cause false positives)
- **Email alerts:** Not built-in to CLI (requires cron job email configuration)
- **Backup encryption:** Not implemented (backups stored in plaintext)

### Future Enhancements (Phase 2+)

- Automated email/SMS alerts on `DEGRADED_BACKUP` status
- Weekly automated restore tests with validation queries
- Backup encryption at rest (AES-256)
- Remote backup sync to cloud storage (optional, privacy-preserving)
- Backup size trend analysis and anomaly detection