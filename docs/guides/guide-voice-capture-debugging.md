---
title: Voice Capture Debugging Guide
status: approved
owner: Nathan
version: 1.0.0
date: 2025-09-29
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 3.0.0
---

# Voice Capture Debugging Guide

## Purpose

This guide helps developers diagnose and resolve issues with voice memo capture, particularly APFS dataless file handling, iCloud synchronization, and transcription failures. It provides systematic debugging approaches for common failure modes and performance issues specific to macOS Voice Memos integration.

**Target Audience:**

- Developers debugging voice capture failures
- Operations engineers troubleshooting production issues
- QA engineers testing voice memo scenarios

## When to Use This Guide

Use this guide when encountering:

- Voice memos not being captured or processed
- APFS dataless file download failures
- iCloud synchronization issues
- Transcription failures or timeouts
- Duplicate voice memos in vault
- Missing or corrupted audio files
- Performance degradation with large libraries

## Prerequisites

**Required Tools:**

- macOS terminal with admin access
- `xattr` command for extended attributes
- `ffprobe` for audio file inspection
- `sqlite3` for database queries
- `log` command for system logs
- `fs_usage` for file system monitoring

**Required Access:**

- Voice Memos folder: `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/`
- SQLite database: `./.adhd-brain/ledger.sqlite`
- Logs directory: `./.metrics/`
- iCloud status via `brctl` (Requires SIP disabled for full access)

## Quick Diagnostic Commands

```bash
# Check voice memo folder contents
ls -la ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/

# Count voice memos (including dataless)
find ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/ -name "*.m4a" | wc -l

# Find dataless files (placeholders)
find ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/ -name ".*.m4a.icloud" -o -size -1k

# Check extended attributes for iCloud status
xattr -l ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/*.m4a

# Monitor file system activity in Voice Memos folder
sudo fs_usage -w -f filesystem | grep VoiceMemos

# Check capture status in database
sqlite3 ./.adhd-brain/ledger.sqlite "SELECT status, COUNT(*) FROM captures WHERE source_type='voice' GROUP BY status;"

# View recent errors
sqlite3 ./.adhd-brain/ledger.sqlite "SELECT * FROM errors_log WHERE operation='voice_capture' ORDER BY created_at DESC LIMIT 10;"
```

## Common Issues and Solutions

### Issue 1: Voice Memos Not Being Detected

**Symptoms:**

- No voice memos appear in capture queue
- Polling reports 0 files found
- `adhd capture doctor` shows no voice activity

**Diagnostic Steps:**

1. **Verify folder permissions:**

```bash
# Check folder exists and is readable
ls -ld ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/
# Expected: drwxr-xr-x with your user as owner

# Fix permissions if needed
chmod 755 ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/
```

2. **Check for Voice Memos.app installation:**

```bash
# Verify app exists
ls -la /System/Applications/VoiceMemos.app
# or
ls -la /Applications/VoiceMemos.app

# Check if voice memos service is running
pgrep -l VoiceMemos
```

3. **Verify iCloud sync status:**

```bash
# Check if folder is managed by iCloud
xattr ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/ | grep com.apple.icloud

# Check Bird daemon (iCloud sync) status
brctl status | grep VoiceMemos
```

**Solution Matrix:**

| Root Cause           | Solution                                      |
| -------------------- | --------------------------------------------- |
| Folder doesn't exist | Open Voice Memos.app once to create structure |
| Permission denied    | Fix permissions with `chmod 755`              |
| iCloud disabled      | Enable iCloud Drive in System Preferences     |
| Wrong path in config | Update `VOICE_MEMO_PATH` environment variable |

### Issue 2: APFS Dataless File Download Failures

**Symptoms:**

- Files show as 0 bytes or very small size
- "File not downloaded" errors in logs
- Transcription fails with "file unreadable"

**Diagnostic Steps:**

1. **Identify dataless files:**

```bash
# Find placeholder files
find ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/ \
  \( -name ".*.icloud" -o -size -1k \) -ls

# Check specific file status
stat -f "%z %N" ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/*.m4a | sort -n
```

2. **Check iCloud download status:**

```bash
# View extended attributes
xattr -l [voice_memo_file.m4a] | grep -E "downloading|progress"

# Force download via Finder (opens Finder at file location)
open -R [voice_memo_file.m4a]

# Monitor download progress
log stream --predicate 'subsystem == "com.apple.bird"' | grep -i download
```

3. **Test icloudctl helper:**

```bash
# Check if icloudctl is installed
which icloudctl || echo "icloudctl not found"

# Test file status check
icloudctl status "~/Library/Group Containers/.../Recording.m4a"

# Attempt manual download
icloudctl download "~/Library/Group Containers/.../Recording.m4a" --timeout 60
```

**Common Failure Modes:**

| Error                         | Cause                      | Solution                   |
| ----------------------------- | -------------------------- | -------------------------- |
| `NSURLErrorDomain -1009`      | Network offline            | Check network connectivity |
| `NSUbiquitousErrorDomain 507` | iCloud storage full        | Free up iCloud space       |
| `POSIX error 1`               | Permission denied          | Fix file permissions       |
| `Timeout after 60s`           | Slow network or large file | Increase timeout or retry  |

### Issue 3: Transcription Failures

**Symptoms:**

- Placeholder exports instead of transcribed content
- "Whisper model not found" errors
- Transcription timeouts

**Diagnostic Steps:**

1. **Verify Whisper model installation:**

```bash
# Check model file exists
ls -lh ~/.adhd-brain/models/whisper-medium.pt
# Expected: ~1.5GB file

# Verify model checksum
shasum -a 256 ~/.adhd-brain/models/whisper-medium.pt

# Re-download if corrupted
pnpm whisper-download medium
```

2. **Test audio file integrity:**

```bash
# Verify audio file is valid
ffprobe -v error [voice_memo.m4a]

# Check audio duration
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 [voice_memo.m4a]

# Extract first 30 seconds for testing
ffmpeg -i [voice_memo.m4a] -t 30 -c copy test_clip.m4a
```

3. **Monitor resource usage during transcription:**

```bash
# Watch memory usage
while true; do ps aux | grep whisper | grep -v grep; sleep 1; done

# Check system resources
top -l 1 | head -n 10

# Monitor swap usage (indicates memory pressure)
vm_stat | grep -E "Pages (free|active|inactive|speculative|wired)"
```

**Troubleshooting Decision Tree:**

```
Transcription fails?
├── Check model exists (1.5GB)
│   ├── No → Download model
│   └── Yes → Verify checksum
├── Check audio file valid
│   ├── No → Export placeholder
│   └── Yes → Check duration
├── Duration > 5 minutes?
│   ├── Yes → Increase timeout
│   └── No → Check memory
└── Memory > 3GB used?
    ├── Yes → Kill and retry later
    └── No → Check Whisper logs
```

### Issue 4: Duplicate Voice Memos

**Symptoms:**

- Same voice memo exported multiple times
- Duplicate entries in staging ledger
- Fingerprint mismatch warnings

**Diagnostic Steps:**

1. **Check for duplicate captures:**

```sql
-- Find duplicate external_refs
SELECT external_ref, COUNT(*) as count
FROM captures
WHERE source_type = 'voice'
GROUP BY external_ref
HAVING count > 1;

-- Find duplicate content hashes
SELECT content_hash, COUNT(*) as count
FROM captures
WHERE content_hash IS NOT NULL
GROUP BY content_hash
HAVING count > 1;
```

2. **Verify fingerprint consistency:**

```bash
# Compute fingerprint for specific file
head -c 4194304 [voice_memo.m4a] | shasum -a 256

# Compare with database
sqlite3 ./.adhd-brain/ledger.sqlite \
  "SELECT external_fingerprint FROM captures WHERE external_ref LIKE '%[filename]%'"
```

3. **Check for file modifications:**

```bash
# Get file modification times
stat -f "%Sm %N" ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/*.m4a

# Monitor for file changes
fswatch ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/
```

**Resolution Steps:**

1. Remove duplicate captures from database
2. Clear fingerprint cache
3. Re-run deduplication check
4. Verify ULID generation uniqueness

## Performance Troubleshooting

### Large Library Performance Issues

**Symptoms:**

- Polling takes > 30 seconds
- High memory usage during scan
- Database queries slow

**Optimization Checklist:**

1. **Enable incremental scanning:**

```typescript
// Use checkpoint-based scanning
const lastScan = await loadCheckpoint()
const modifiedFiles = await getModifiedSince(lastScan)
```

2. **Optimize database indexes:**

```sql
-- Check existing indexes
.indexes captures

-- Add index for voice memo queries if missing
CREATE INDEX IF NOT EXISTS idx_captures_voice
ON captures(source_type, external_ref)
WHERE source_type = 'voice';

-- Analyze database for query optimization
ANALYZE captures;
```

3. **Implement caching:**

```typescript
// Use LRU cache for fingerprints
const fingerprintCache = new LRU({ max: 10000 })

// Cache hit ratio monitoring
console.log(`Cache hit ratio: ${cache.hits / (cache.hits + cache.misses)}`)
```

4. **Batch processing:**

```typescript
// Process in batches of 50
const BATCH_SIZE = 50
for (let i = 0; i < files.length; i += BATCH_SIZE) {
  const batch = files.slice(i, i + BATCH_SIZE)
  await processBatch(batch)
  await sleep(100) // Yield to event loop
}
```

## Advanced Debugging Techniques

### System-Level Tracing

**DTrace for file system operations:**

```bash
# Trace all file operations in Voice Memos folder
sudo dtrace -n 'syscall::open*:entry /execname == "node"/ { printf("%s %s", execname, copyinstr(arg0)); }'

# Monitor iCloud daemon activity
sudo dtrace -n 'proc:::exec-success /execname == "bird"/ { trace(execname); }'
```

**System logs analysis:**

```bash
# Stream Voice Memos related logs
log stream --predicate 'process == "VoiceMemos" OR subsystem CONTAINS "com.apple.VoiceMemos"'

# Search historical logs
log show --predicate 'process == "VoiceMemos"' --last 1h

# iCloud sync logs
log show --predicate 'subsystem == "com.apple.bird"' --last 1h | grep -i voice
```

### Database Forensics

```sql
-- Analyze capture patterns
SELECT
  DATE(created_at) as date,
  COUNT(*) as captures,
  SUM(CASE WHEN status = 'exported' THEN 1 ELSE 0 END) as exported,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
FROM captures
WHERE source_type = 'voice'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;

-- Find problematic files
SELECT
  c.id,
  c.external_ref,
  c.status,
  e.error_message,
  e.created_at as error_time
FROM captures c
LEFT JOIN errors_log e ON c.id = e.capture_id
WHERE c.source_type = 'voice'
  AND c.status = 'error'
ORDER BY e.created_at DESC;

-- Trace state transitions
SELECT
  id,
  status,
  json_extract(meta_json, '$.state_history') as history,
  updated_at
FROM captures
WHERE id = ?;
```

## Health Check Implementation

```typescript
async function voiceCaptureHealthCheck(): Promise<HealthReport> {
  const checks = {
    folderAccessible: false,
    hasVoiceMemos: false,
    icloudConnected: false,
    whisperModelReady: false,
    databaseHealthy: false,
    recentCaptures: false,
  }

  // Check folder access
  try {
    await fs.access(VOICE_MEMO_PATH, fs.constants.R_OK)
    checks.folderAccessible = true
  } catch (error) {
    logger.error("Voice memo folder not accessible", { error })
  }

  // Check for voice memos
  const files = await glob(`${VOICE_MEMO_PATH}/*.m4a`)
  checks.hasVoiceMemos = files.length > 0

  // Check iCloud status
  try {
    const status = await icloudctl.checkConnection()
    checks.icloudConnected = status.connected
  } catch (error) {
    logger.error("iCloud check failed", { error })
  }

  // Check Whisper model
  const modelPath = "~/.adhd-brain/models/whisper-medium.pt"
  checks.whisperModelReady = await fs
    .access(modelPath)
    .then(() => true)
    .catch(() => false)

  // Check database
  const dbStats = await db.get(
    'SELECT COUNT(*) as count FROM captures WHERE source_type = "voice"'
  )
  checks.databaseHealthy = dbStats.count >= 0

  // Check recent activity
  const recent = await db.get(`
    SELECT COUNT(*) as count
    FROM captures
    WHERE source_type = 'voice'
      AND created_at > datetime('now', '-24 hours')
  `)
  checks.recentCaptures = recent.count > 0

  return {
    healthy: Object.values(checks).every((v) => v),
    checks,
    recommendations: generateRecommendations(checks),
  }
}
```

## Monitoring and Alerting

### Key Metrics to Monitor

```typescript
// Critical metrics for voice capture
const VOICE_METRICS = {
  // Latency metrics
  voice_poll_duration_ms: { threshold: 5000, alert: "Slow polling" },
  voice_download_duration_ms: { threshold: 60000, alert: "Download timeout" },
  transcription_duration_ms: {
    threshold: 300000,
    alert: "Transcription timeout",
  },

  // Error metrics
  voice_download_failures: {
    threshold: 3,
    window: "1h",
    alert: "High download failure rate",
  },
  transcription_failures: {
    threshold: 5,
    window: "1h",
    alert: "High transcription failure rate",
  },
  placeholder_export_ratio: { threshold: 0.05, alert: "Too many placeholders" },

  // Volume metrics
  voice_queue_depth: { threshold: 50, alert: "Queue backing up" },
  dataless_file_ratio: { threshold: 0.3, alert: "Many files not downloaded" },
}
```

### Alert Conditions

```typescript
function checkAlertConditions(metrics: Metrics): Alert[] {
  const alerts: Alert[] = []

  // Check download failures
  if (metrics.downloadFailures > 3) {
    alerts.push({
      severity: "HIGH",
      message: "Voice memo downloads failing repeatedly",
      action: "Check network and iCloud status",
    })
  }

  // Check transcription performance
  if (metrics.avgTranscriptionTime > 60000) {
    alerts.push({
      severity: "MEDIUM",
      message: "Transcription taking too long",
      action: "Check Whisper model and system resources",
    })
  }

  // Check placeholder ratio
  const placeholderRatio = metrics.placeholders / metrics.totalExports
  if (placeholderRatio > 0.05) {
    alerts.push({
      severity: "HIGH",
      message: `${(placeholderRatio * 100).toFixed(1)}% exports are placeholders`,
      action: "Investigate transcription failures",
    })
  }

  return alerts
}
```

## Testing Scenarios

### Manual Test Cases

1. **APFS Dataless File Handling:**
   - Evict a file using Finder (Remove Download)
   - Run voice capture
   - Verify file downloads and processes

2. **Network Interruption:**
   - Start voice capture
   - Disable WiFi during download
   - Verify graceful failure and retry

3. **Large File Processing:**
   - Record 30+ minute voice memo
   - Verify transcription completes or times out gracefully

4. **Concurrent Access:**
   - Open Voice Memos.app
   - Run capture simultaneously
   - Verify no conflicts or corruption

### Automated Test Helpers

```bash
#!/bin/bash
# test-voice-capture.sh

echo "Voice Capture Test Suite"
echo "========================"

# Test 1: Folder access
echo -n "1. Checking folder access... "
if [ -d "$HOME/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/" ]; then
  echo "✓"
else
  echo "✗ Folder not found"
  exit 1
fi

# Test 2: Find voice memos
echo -n "2. Looking for voice memos... "
COUNT=$(find "$HOME/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/" -name "*.m4a" | wc -l)
echo "Found $COUNT files"

# Test 3: Check for dataless files
echo -n "3. Checking for dataless files... "
DATALESS=$(find "$HOME/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/" -size -1k -name "*.m4a" | wc -l)
echo "Found $DATALESS dataless files"

# Test 4: Database check
echo -n "4. Checking database... "
if sqlite3 ./.adhd-brain/ledger.sqlite "SELECT COUNT(*) FROM captures WHERE source_type='voice';" > /dev/null 2>&1; then
  echo "✓"
else
  echo "✗ Database error"
  exit 1
fi

# Test 5: Whisper model
echo -n "5. Checking Whisper model... "
if [ -f "$HOME/.adhd-brain/models/whisper-medium.pt" ]; then
  SIZE=$(du -h "$HOME/.adhd-brain/models/whisper-medium.pt" | cut -f1)
  echo "✓ ($SIZE)"
else
  echo "✗ Model not found"
fi

echo ""
echo "Test complete!"
```

## Recovery Procedures

### Corrupted Database Recovery

```bash
# Backup current database
cp ./.adhd-brain/ledger.sqlite ./.adhd-brain/ledger.sqlite.backup

# Check integrity
sqlite3 ./.adhd-brain/ledger.sqlite "PRAGMA integrity_check;"

# If corrupted, recover what's possible
sqlite3 ./.adhd-brain/ledger.sqlite ".dump" | sqlite3 ./.adhd-brain/ledger_recovered.sqlite

# Rebuild indexes
sqlite3 ./.adhd-brain/ledger_recovered.sqlite "REINDEX;"
```

### Reset Voice Capture State

```sql
-- Clear error state for voice captures
UPDATE captures
SET status = 'staged',
    meta_json = json_set(meta_json, '$.retry_count', 0)
WHERE source_type = 'voice'
  AND status = 'error';

-- Clear errors log
DELETE FROM errors_log
WHERE capture_id IN (
  SELECT id FROM captures WHERE source_type = 'voice'
);

-- Reset sync checkpoint
UPDATE sync_state
SET last_checkpoint = datetime('now', '-7 days')
WHERE source = 'voice_poller';
```

## Related Documentation

- [Capture Tech Spec](../features/capture/spec-capture-tech.md) - APFS handling implementation and voice memo referencing
- [Capture Architecture Spec](../features/capture/spec-capture-arch.md) - High-level capture system design
- [Capture Test Spec](../features/capture/spec-capture-test.md) - APFS dataless file test patterns
- [Whisper Transcription Guide](./guide-whisper-transcription.md) - Transcription troubleshooting
- [Polling Implementation Guide](./guide-polling-implementation.md) - Polling patterns
- [Error Recovery Guide](./guide-error-recovery.md) - General error handling
- [General Capture Debugging Guide](./guide-capture-debugging.md) - Capture system debugging overview
- [ADR-0001: Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md) - File handling policy

## Maintenance Notes

**When to Update This Guide:**

- New failure modes discovered in production
- Changes to Voice Memos.app behavior in macOS updates
- Updates to iCloud sync mechanisms
- New debugging tools or techniques identified

**Known Limitations:**

- Cannot force iCloud downloads programmatically without user interaction
- Some system logs require SIP disabled for full access
- Voice Memos database schema is undocumented and may change

---

_Last Updated: 2025-09-29_
_Version: 1.0.0_
