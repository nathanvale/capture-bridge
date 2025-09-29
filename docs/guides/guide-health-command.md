---
title: Health Command Guide
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-27
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Health Command Guide

## Purpose

The Health Command (`adhd capture doctor`) provides **comprehensive system diagnostics** for the ADHD Brain capture pipeline. This guide helps developers and users:

- Validate infrastructure readiness before using capture features
- Diagnose common issues with credentials, workers, and operational health
- Understand health check results and remediation steps
- Integrate health checks into automation scripts

**Target Audience:** System users, DevOps engineers, and automation script authors who need to validate or monitor system health.

## When to Use This Guide

Use this guide when:

- Setting up the ADHD Brain system for the first time
- Troubleshooting capture pipeline issues (voice or email)
- Validating system health after configuration changes
- Building monitoring or alerting scripts
- Investigating failed captures or polling delays

**Related Features:**
- [CLI Feature PRD](../features/cli/prd-cli.md) - Doctor command requirements
- [Health Command Tech Spec](../features/cli/spec-cli-tech.md#doctor-command) - Implementation details
- [Gmail OAuth2 Tech Spec](../features/capture/spec-capture-tech.md#gmail-oauth2) - Email credential health
- [Whisper Runtime Tech Spec](../features/capture/spec-capture-tech.md#whisper-transcription) - Transcription worker health

## Prerequisites

**Required:**
- ADHD Brain CLI installed and accessible (`adhd` command available)
- Basic understanding of command-line interfaces
- Familiarity with the capture pipeline (voice and email)

**Recommended:**
- [Master PRD](../master/prd-master.md) - System overview
- [Capture PRD](../features/capture/prd-capture.md) - Capture pipeline context

## Quick Reference

### Basic Commands

```bash
# Run all health checks (human-readable output)
adhd capture doctor

# JSON output for automation
adhd capture doctor --json

# Verbose mode (include diagnostic details)
adhd capture doctor --verbose

# Check specific category
adhd capture doctor --category=infrastructure
adhd capture doctor --category=credentials
adhd capture doctor --category=workers
adhd capture doctor --category=operational
```

### Exit Codes

| Exit Code | Status | Meaning |
|-----------|--------|---------|
| `0` | Healthy | All checks passed or info severity only |
| `1` | Warning | One or more checks have warnings |
| `2` | Critical | One or more checks failed critically |

### Health Check Categories

| Category | Purpose | Checks |
|----------|---------|--------|
| **Infrastructure** | Validate file system and database | Vault path, disk space, SQLite connectivity |
| **Credentials** | Verify authentication and permissions | Gmail OAuth2, icloudctl, Voice Memos access |
| **Workers** | Monitor worker health and performance | Whisper model, transcription queue, error rates |
| **Operational** | Track polling and backup status | Last poll timestamps, error logs, backup integrity |

## Step-by-Step Instructions

### Step 1: Run Initial Health Check

After installing the system, validate all components:

```bash
adhd capture doctor
```

**Expected Outcome:**
- Human-readable report with check results grouped by category
- Overall status summary (✅ Healthy, ⚠️ Warning, or ❌ Critical)
- Exit code 0 if all checks pass

**Example Output:**
```
Health Check Results
====================

✅ Infrastructure (4/4 passed)
  ✅ Vault Path Exists
  ✅ Vault Path Writable
  ✅ SQLite Database Connectivity (schema v1.0)
  ✅ Disk Space Available (45.2 GB available, 65% used)

✅ Credentials (3/3 passed)
  ✅ Gmail OAuth2 Authentication (expires in 45 min)
  ✅ icloudctl Availability
  ✅ Voice Memos Folder Readable (23 files)

Overall Status: ✅ Healthy
Total Checks: 14
Passed: 14
Warnings: 0
Critical: 0
```

### Step 2: Diagnose Warnings

If you see warnings (exit code 1), review the remediation hints:

```bash
adhd capture doctor
```

**Example Warning Output:**
```
⚠️ Infrastructure (3/4 passed, 1 warning)
  ✅ Vault Path Exists
  ✅ Vault Path Writable
  ✅ SQLite Database Connectivity
  ⚠️  Disk Space Available (4.5 GB available, 92% used)
      → Free up disk space. Only 4.5 GB available.
```

**Remediation Action:**
1. Review the remediation hint (indicated by →)
2. Apply the suggested fix
3. Re-run health check to verify

### Step 3: Fix Critical Issues

If you see critical issues (exit code 2), resolve them before using the system:

```bash
adhd capture doctor
```

**Example Critical Output:**
```
❌ Credentials (2/3 passed, 1 critical)
  ❌ Gmail OAuth2 Authentication
      Gmail token.json not found - authentication required
      → Run: adhd capture email init
  ✅ icloudctl Availability
  ✅ Voice Memos Folder Readable
```

**Remediation Action:**
1. Execute the suggested command: `adhd capture email init`
2. Follow authentication prompts
3. Re-run health check to verify: `adhd capture doctor`

### Step 4: Use JSON Mode for Automation

For monitoring scripts, use JSON output:

```bash
adhd capture doctor --json > health-report.json
```

**JSON Schema:**
```json
{
  "schemaVersion": "1.0",
  "overallStatus": "healthy",
  "exitCode": 0,
  "summary": {
    "totalChecks": 14,
    "passed": 14,
    "warnings": 0,
    "critical": 0,
    "executionTimeMs": 234,
    "timestamp": "2025-09-27T10:30:00.000Z"
  },
  "checks": [
    {
      "checkId": "vault_path_exists",
      "name": "Vault Path Exists",
      "category": "infrastructure",
      "status": "healthy",
      "severity": "critical",
      "message": "Vault path exists: /Users/nathan/Obsidian/vault",
      "duration": 2,
      "timestamp": "2025-09-27T10:30:00.050Z"
    }
  ],
  "systemInfo": {
    "platform": "darwin",
    "osVersion": "14.3.0",
    "nodeVersion": "v20.10.0"
  }
}
```

**Script Example:**
```bash
#!/bin/bash
adhd capture doctor --json

if [ $? -eq 0 ]; then
  echo "System healthy"
elif [ $? -eq 1 ]; then
  echo "System has warnings"
  exit 1
else
  echo "System critical"
  exit 2
fi
```

### Step 5: Filter by Category

Check specific subsystems:

```bash
# Check only credentials
adhd capture doctor --category=credentials

# Check only workers
adhd capture doctor --category=workers
```

**Use Case:** After updating Gmail credentials, verify only credential health without running full diagnostics.

## Common Patterns

### Pattern 1: Pre-Flight Check

**Scenario:** Validate system health before starting capture workers.

```bash
#!/bin/bash
# pre-flight.sh - Run before starting capture workers

adhd capture doctor --category=infrastructure
if [ $? -ne 0 ]; then
  echo "Infrastructure issues detected. Fix before starting workers."
  exit 1
fi

adhd capture doctor --category=credentials
if [ $? -ne 0 ]; then
  echo "Credential issues detected. Re-authenticate before starting workers."
  exit 1
fi

echo "Pre-flight checks passed. Starting workers..."
```

### Pattern 2: Periodic Health Monitoring

**Scenario:** Monitor system health every 5 minutes via cron.

```bash
# Add to crontab: */5 * * * * /path/to/health-monitor.sh
#!/bin/bash
# health-monitor.sh

adhd capture doctor --json > /tmp/adhd-health.json

if [ $? -eq 2 ]; then
  # Critical issue detected - send alert
  echo "CRITICAL: ADHD Brain health check failed" | mail -s "Health Alert" admin@example.com
fi
```

### Pattern 3: Post-Deployment Validation

**Scenario:** Verify system health after configuration changes.

```bash
#!/bin/bash
# deploy-validate.sh

echo "Validating deployment..."
adhd capture doctor --verbose

if [ $? -eq 0 ]; then
  echo "✅ Deployment validated successfully"
else
  echo "❌ Deployment validation failed"
  exit 1
fi
```

### Anti-Patterns to Avoid

**❌ Don't ignore warnings:**
```bash
# BAD: Ignoring exit codes
adhd capture doctor > /dev/null 2>&1
# System may be degraded but script continues
```

**✅ Do handle exit codes:**
```bash
# GOOD: Check exit codes and respond
adhd capture doctor
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "Health issues detected (exit code: $EXIT_CODE)"
  adhd capture doctor --verbose  # Get detailed output
  exit $EXIT_CODE
fi
```

**❌ Don't run health checks during active operations:**
```bash
# BAD: Health check while workers are processing
transcription_worker &
adhd capture doctor  # May report transient issues
```

**✅ Do run health checks before starting operations:**
```bash
# GOOD: Validate health first, then start workers
adhd capture doctor
if [ $? -eq 0 ]; then
  transcription_worker &
fi
```

## Troubleshooting

### Common Error: "Vault path does not exist"

**Symptom:**
```
❌ Vault Path Exists
    Vault path does not exist: /Users/nathan/Obsidian/vault
    → Create vault directory: mkdir -p "/Users/nathan/Obsidian/vault"
```

**Solution:**
1. Create the vault directory: `mkdir -p "/Users/nathan/Obsidian/vault"`
2. Verify configuration: Check `vault_path` in config
3. Re-run health check: `adhd capture doctor --category=infrastructure`

### Common Error: "Gmail token.json not found"

**Symptom:**
```
❌ Gmail OAuth2 Authentication
    Gmail token.json not found - authentication required
    → Run: adhd capture email init
```

**Solution:**
1. Initialize Gmail authentication: `adhd capture email init`
2. Follow OAuth2 browser prompts
3. Verify token created: `ls ~/.adhd-brain/gmail-token.json`
4. Re-run health check: `adhd capture doctor --category=credentials`

### Common Warning: "Disk space low"

**Symptom:**
```
⚠️ Disk Space Available (4.5 GB available, 92% used)
   → Free up disk space. Only 4.5 GB available.
```

**Solution:**
1. Check largest files: `du -sh ~/Obsidian/vault/* | sort -rh | head -10`
2. Archive or delete old captures
3. Clean up backups: `ls -lh ./.backups/*.sqlite`
4. Re-run health check: `adhd capture doctor --category=infrastructure`

### Common Warning: "Transcription queue backlog"

**Symptom:**
```
⚠️ Transcription Queue Depth (25 jobs)
   → Transcription queue backlog detected. System is processing sequentially.
```

**Solution:**
1. Check queue depth: `adhd ledger status`
2. Wait for queue to drain (transcription is sequential)
3. Check error logs if queue not progressing: `adhd ledger dlq`
4. Re-run health check: `adhd capture doctor --category=workers`

### Common Error: "Voice Memos folder not accessible"

**Symptom:**
```
❌ Voice Memos Folder Readable
    Voice Memos folder not accessible: Permission denied
    → Check Full Disk Access permissions in System Settings > Privacy & Security
```

**Solution:**
1. Open **System Settings** > **Privacy & Security** > **Full Disk Access**
2. Add Terminal.app (or your CLI environment)
3. Restart terminal
4. Re-run health check: `adhd capture doctor --category=credentials`

### Debugging Tips

**Enable verbose mode for diagnostic details:**
```bash
adhd capture doctor --verbose
```

**Check specific category to isolate issue:**
```bash
# If Gmail polling fails, check credentials only
adhd capture doctor --category=credentials
```

**Review error logs for context:**
```bash
adhd ledger errors --last=24h
adhd ledger dlq
```

**Verify configuration paths:**
```bash
# Check vault path
echo $ADHD_VAULT_PATH
ls -ld "$(adhd config get vault_path)"

# Check database path
ls -lh ~/.adhd-brain/ledger.sqlite
```

## Examples

### Example 1: Healthy System Output

```
Health Check Results
====================

✅ Infrastructure (4/4 passed)
  ✅ Vault Path Exists
  ✅ Vault Path Writable
  ✅ SQLite Database Connectivity (schema v1.0)
  ✅ Disk Space Available (45.2 GB available, 65% used)

✅ Credentials (3/3 passed)
  ✅ Gmail OAuth2 Authentication (expires in 45 min)
  ✅ icloudctl Availability
  ✅ Voice Memos Folder Readable (23 files)

✅ Workers (3/3 passed)
  ✅ Whisper Model Available (1500 MB)
  ✅ Transcription Queue Depth (2 jobs)
  ✅ Transcription Error Rate (1.2%, 45 jobs in 24h)

✅ Operational (4/4 passed)
  ✅ Voice Polling Status (last poll 2 min ago)
  ✅ Email Polling Status (last poll 1 min ago)
  ✅ Error Log Summary (0 errors in last 24 hours)
  ✅ Backup Integrity (24 backups found, latest: 30 min ago)

Summary
-------
Overall Status: ✅ Healthy
Total Checks: 14
Passed: 14
Warnings: 0
Critical: 0
Execution Time: 234ms

All systems operational.
```

### Example 2: System with Warnings

```
Health Check Results
====================

✅ Infrastructure (3/4 passed, 1 warning)
  ✅ Vault Path Exists
  ✅ Vault Path Writable
  ✅ SQLite Database Connectivity (schema v1.0)
  ⚠️  Disk Space Available (4.5 GB available, 92% used)
      → Free up disk space. Only 4.5 GB available.

⚠️ Workers (2/3 passed, 1 warning)
  ✅ Whisper Model Available (1500 MB)
  ⚠️  Transcription Queue Depth (25 jobs)
      → Transcription queue backlog detected. System is processing sequentially.
  ✅ Transcription Error Rate (3.2%, 45 jobs in 24h)

Summary
-------
Overall Status: ⚠️  Warning
Total Checks: 14
Passed: 12
Warnings: 2
Critical: 0
Execution Time: 245ms

Action Required: Review warnings above.
Exit Code: 1
```

### Example 3: Critical Issues Detected

```
Health Check Results
====================

❌ Infrastructure (3/4 passed, 1 critical)
  ✅ Vault Path Exists
  ✅ Vault Path Writable
  ❌ SQLite Database Connectivity
      SQLite connection failed: ENOENT: no such file
      → Check database file exists and is readable: ls -lh "~/.adhd-brain/ledger.sqlite"
  ✅ Disk Space Available (45.2 GB available, 65% used)

❌ Credentials (2/3 passed, 1 critical)
  ❌ Gmail OAuth2 Authentication
      Gmail token.json not found - authentication required
      → Run: adhd capture email init
  ✅ icloudctl Availability
  ✅ Voice Memos Folder Readable (23 files)

Summary
-------
Overall Status: ❌ Critical
Total Checks: 14
Passed: 11
Warnings: 0
Critical: 2
Execution Time: 189ms

CRITICAL ISSUES DETECTED
Please resolve the critical issues listed above before using the system.
Exit Code: 2
```

### Example 4: JSON Output for Automation

```bash
$ adhd capture doctor --json | jq '.summary'
```

**Output:**
```json
{
  "totalChecks": 14,
  "passed": 14,
  "warnings": 0,
  "critical": 0,
  "executionTimeMs": 234,
  "timestamp": "2025-09-27T10:30:00.000Z"
}
```

### Example 5: Category Filtering

```bash
$ adhd capture doctor --category=credentials
```

**Output:**
```
Health Check Results
====================

✅ Credentials (3/3 passed)
  ✅ Gmail OAuth2 Authentication (expires in 45 min)
  ✅ icloudctl Availability
  ✅ Voice Memos Folder Readable (23 files)

Summary
-------
Overall Status: ✅ Healthy
Total Checks: 3
Passed: 3
Warnings: 0
Critical: 0
```

## Related Documentation

**PRDs and Specs:**
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System-wide health requirements
- [CLI Feature PRD](../features/cli/prd-cli.md) - Doctor command requirements
- [Health Command Tech Spec](../features/cli/spec-cli-tech.md#doctor-command) - Implementation details
- [Gmail OAuth2 Tech Spec](../features/capture/spec-capture-tech.md#gmail-oauth2) - Email credential health
- [Whisper Runtime Tech Spec](../features/capture/spec-capture-tech.md#whisper-transcription) - Transcription worker health

**Related Guides:**
- [Backup Verification Guide](./guide-backup-verification.md) - Backup integrity validation and escalation
- [Backup Restore Guide](./guide-backup-restore-drill.md) - Restore procedures post-health failure
- [Capture Debugging Guide](./guide-capture-debugging.md) - Troubleshooting capture pipeline
- [Test Strategy Guide](./guide-test-strategy.md) - Testing health checks

**External Resources:**
- [Gmail API OAuth2 Setup](https://developers.google.com/gmail/api/auth/about-auth) - Gmail authentication
- [SQLite Documentation](https://www.sqlite.org/docs.html) - Database troubleshooting

## Maintenance Notes

**When to Update This Guide:**
- New health checks added to the system
- Exit code behavior changes
- JSON schema version increments
- New remediation patterns discovered
- Common troubleshooting scenarios identified

**Known Limitations:**
- Health checks are point-in-time diagnostics (no historical trend analysis)
- Auto-remediation (`--fix` flag) deferred to Phase 2+
- Check timeouts are global (5s default), not configurable per-check
- Alerting integrations not supported (local-only command)

**Future Enhancements:**
- Historical trend tracking for monitoring dashboards
- Auto-remediation capability for common issues
- Custom check plugins and extensibility
- Webhook notifications for critical failures