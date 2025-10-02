---
title: Capture Debugging Guide
status: approved
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Capture Debugging Guide

## Purpose

This guide provides comprehensive debugging strategies for the ADHD Brain capture system, covering both voice memo and email capture channels. It helps developers diagnose and resolve common failure modes, performance issues, and data integrity problems across the entire capture pipeline (polling → staging → enrichment → export).

**Target Audience:** Developers debugging capture failures, operations engineers troubleshooting production issues, QA engineers investigating test failures.

## When to Use This Guide

Use this guide when:

- Voice memos are not being captured or transcribed
- Email messages are missing from the inbox export
- Duplicate detection is failing (false positives or false negatives)
- Transcription is timing out or producing incorrect results
- Export to Obsidian vault is failing or creating corrupted files
- Polling loops are consuming excessive resources
- Recovery after crashes is not working correctly
- Performance is degrading (high latency, queue backlog growth)

**Links to Related Documentation:**

- [Error Recovery Guide](./guide-error-recovery.md) - Retry orchestration and error classification
- [Polling Implementation Guide](./guide-polling-implementation.md) - Polling architecture and sync state
- [Whisper Transcription Guide](./guide-whisper-transcription.md) - Transcription debugging
- **[Voice Capture Debugging Guide](./guide-voice-capture-debugging.md) - Voice memo specific troubleshooting** (APFS dataless files, iCloud sync, voice memo metadata, iOS sync detection)
- [Capture Tech Spec](../features/capture/spec-capture-tech.md) - Implementation details
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Test patterns
- [Direct Export Pattern](../cross-cutting/spec-direct-export-tech.md) - Export mechanics

## Prerequisites

**Required Knowledge:**

- Understanding of the capture pipeline stages (polling → staging → enrichment → export)
- Familiarity with SQLite database structure (4-table schema)
- Basic understanding of content hashing (SHA-256) and deduplication logic
- Knowledge of macOS Voice Memos app and iCloud file structure
- Understanding of Gmail API OAuth2 authentication flow

**Required Tools:**

- SQLite CLI (`sqlite3`) for database inspection
- `icloudctl` binary for voice file operations (macOS)
- `jq` for parsing NDJSON metrics files
- `rg` (ripgrep) for log file analysis
- macOS Activity Monitor or `top` for resource monitoring

**Required Access:**

- Read/write access to SQLite database file
- Read access to Voice Memos folder (`~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/`)
- Access to Gmail API credentials and OAuth2 tokens
- Read/write access to Obsidian vault (`inbox/` folder)
- Access to metrics files (`.metrics/*.ndjson`)
- Access to error logs (`errors_log` table)

## Quick Reference

**TL;DR - Debugging Checklist:**

```bash
# 1. Check capture pipeline health
adhd capture doctor

# 2. Inspect staging ledger state
sqlite3 ~/.capture-bridge/staging.db "SELECT id, status, source, created_at FROM captures ORDER BY created_at DESC LIMIT 10;"

# 3. Check for errors in last 24 hours
sqlite3 ~/.capture-bridge/staging.db "SELECT stage, error_type, COUNT(*) FROM errors_log WHERE created_at > datetime('now', '-1 day') GROUP BY stage, error_type;"

# 4. Verify voice file accessibility
icloudctl list --folder ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/

# 5. Check Gmail API connectivity
adhd capture email --dry-run

# 6. Review recent metrics
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "capture.time_to_export_ms")' | jq -s 'max_by(.value)'

# 7. Check vault export integrity
ls -lht ~/Documents/ObsidianVault/inbox/ | head -20
```

**Common Failure Modes & Quick Fixes:**

| Symptom                     | Most Likely Cause          | Quick Fix                                      |
| --------------------------- | -------------------------- | ---------------------------------------------- |
| Voice memos not captured    | iCloud dataless files      | Run `adhd capture voice --force-download`      |
| Email not polling           | OAuth2 token expired       | Run `adhd capture email --reauth`              |
| Transcription timeouts      | Large audio files (>10min) | Check Whisper model size, reduce to `small`    |
| Duplicate detection failing | Content hash mismatch      | Verify text normalization consistency          |
| Export failures             | Vault path permissions     | Check `OBSIDIAN_VAULT` env var and permissions |
| High latency                | Queue backlog growth       | Check `transcription_queue_depth` metric       |
| Crash recovery stalled      | Staging ledger corruption  | Run `adhd capture doctor --repair`             |

## Debugging Workflow

### Phase 1: Initial Diagnosis

**Step 1: Run Health Check**

The `adhd capture doctor` command provides comprehensive system health diagnostics:

```bash
adhd capture doctor
```

**Expected output:**

```
✅ Staging Ledger: OK (4 tables, WAL mode enabled)
✅ Voice Folder: Accessible (47 files found)
✅ Gmail API: Connected (last poll: 2 minutes ago)
✅ Whisper Model: Loaded (medium, 1.5GB)
✅ Obsidian Vault: Writable (inbox/ folder exists)
✅ Backup Verification: Passing (last success: 30 minutes ago)

📊 Pipeline Statistics (last 24h):
  - Total captures: 23 (voice: 18, email: 5)
  - Duplicates detected: 2
  - Transcription failures: 0
  - Export failures: 0
  - Average latency: 7.2s (voice), 1.8s (email)

⚠️  Warnings:
  - Transcription queue depth: 3 (backlog detected)
  - Placeholder export ratio: 6.2% (above 5% threshold)
```

**Step 2: Identify Failure Stage**

Use the staging ledger to identify where captures are getting stuck:

```bash
# Check capture status distribution
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  status,
  source,
  COUNT(*) as count,
  MAX(created_at) as most_recent
FROM captures
WHERE created_at > datetime('now', '-1 day')
GROUP BY status, source
ORDER BY status, source;
EOF
```

**Example output identifying stuck captures:**

```
status                | source  | count | most_recent
----------------------|---------|-------|------------------------
staged                | voice   | 5     | 2025-09-28 14:32:11
transcribed           | voice   | 12    | 2025-09-28 14:45:03
exported              | voice   | 8     | 2025-09-28 14:40:22
exported              | email   | 5     | 2025-09-28 14:38:55
exported_placeholder  | voice   | 2     | 2025-09-28 13:20:18
```

**Analysis:** 5 voice captures stuck in `staged` status (not progressing to `transcribed`).

**Step 3: Check Error Log**

Query the `errors_log` table for recent failures:

```bash
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  capture_id,
  stage,
  error_type,
  error_message,
  attempt_number,
  created_at
FROM errors_log
WHERE created_at > datetime('now', '-1 hour')
ORDER BY created_at DESC
LIMIT 20;
EOF
```

**Example output:**

```
capture_id            | stage         | error_type           | error_message                    | attempt_number | created_at
----------------------|---------------|----------------------|----------------------------------|----------------|------------------------
01JTEST123XYZ        | transcription | operation.timeout    | Whisper timeout after 30s        | 3              | 2025-09-28 14:32:45
01JTEST456ABC        | transcription | operation.timeout    | Whisper timeout after 30s        | 2              | 2025-09-28 14:30:12
01JTEST789DEF        | email_poll    | api.rate_limited     | Gmail quota exceeded             | 1              | 2025-09-28 14:25:33
```

**Analysis:** Transcription timeouts are the primary failure mode.

### Phase 2: Stage-Specific Debugging

## Voice Capture Debugging

### Symptom: Voice Memos Not Being Discovered

**Diagnosis Steps:**

1. **Verify Voice Memos folder accessibility:**

```bash
# Check folder exists and has files
ls -lh ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/

# Check for dataless files (iCloud not downloaded)
icloudctl list --folder ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/ | grep "dataless"
```

**Common issues:**

- Folder path incorrect (check `VOICE_MEMOS_FOLDER` env var)
- iCloud Drive disabled in System Preferences
- Voice Memos app not syncing (open app, wait for sync)
- File system permissions denied

**Fix:**

```bash
# Force download all dataless files
icloudctl download --folder ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/ --recursive

# Verify download completed
icloudctl list --folder ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/ | grep -v "dataless"
```

2. **Check sync state cursor:**

```bash
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  channel,
  last_cursor,
  last_poll_at,
  items_processed
FROM sync_state
WHERE channel = 'voice';
EOF
```

**Expected output:**

```
channel | last_cursor        | last_poll_at        | items_processed
--------|--------------------|--------------------|----------------
voice   | 2025-09-28T14:30Z  | 2025-09-28 14:30:15| 47
```

**Issue:** If `last_cursor` is in the future or `last_poll_at` is stale (>5 minutes ago), sync state is corrupted.

**Fix:**

```bash
# Reset sync state cursor (will re-poll all files)
sqlite3 ~/.capture-bridge/staging.db "UPDATE sync_state SET last_cursor = datetime('now', '-1 hour') WHERE channel = 'voice';"

# Trigger manual poll
adhd capture voice
```

3. **Verify file fingerprinting:**

```bash
# Check if audio fingerprints are being computed
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  id,
  json_extract(meta_json, '$.audio_fp') as audio_fingerprint,
  json_extract(meta_json, '$.channel_native_id') as audio_path
FROM captures
WHERE source = 'voice'
AND created_at > datetime('now', '-1 hour')
ORDER BY created_at DESC
LIMIT 5;
EOF
```

**Expected output:**

```
id                    | audio_fingerprint                                  | audio_path
----------------------|----------------------------------------------------|----------------------------------
01JTEST123XYZ        | sha256_a1b2c3d4e5f6...                            | /path/to/voice-memo-1.m4a
01JTEST456ABC        | sha256_f6e5d4c3b2a1...                            | /path/to/voice-memo-2.m4a
```

**Issue:** If `audio_fingerprint` is NULL, fingerprinting failed (likely due to file read permissions or corrupted audio).

**Fix:**

```bash
# Check file permissions
ls -l $(sqlite3 ~/.capture-bridge/staging.db "SELECT json_extract(meta_json, '$.channel_native_id') FROM captures WHERE source = 'voice' AND json_extract(meta_json, '$.audio_fp') IS NULL LIMIT 1;")

# Verify file integrity
ffprobe -v error -show_format -show_streams <audio_path>

# If corrupted, quarantine and skip
sqlite3 ~/.capture-bridge/staging.db "UPDATE captures SET meta_json = json_set(meta_json, '$.integrity.quarantine', 1) WHERE id = '<capture_id>';"
```

### Symptom: Voice File Sovereignty Violations

**Context:** Voice files should NEVER be moved or renamed (per ADR-0001). If files are missing from their original paths, sovereignty is violated.

**Diagnosis:**

```bash
# Check for missing voice files
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  id,
  json_extract(meta_json, '$.channel_native_id') as audio_path,
  status
FROM captures
WHERE source = 'voice'
AND status NOT IN ('exported', 'exported_duplicate', 'exported_placeholder')
ORDER BY created_at DESC;
EOF
```

**For each audio_path, verify existence:**

```bash
# Check if file exists at original path
for path in $(sqlite3 ~/.capture-bridge/staging.db "SELECT json_extract(meta_json, '$.channel_native_id') FROM captures WHERE source = 'voice' AND status = 'staged';"); do
  if [ ! -f "$path" ]; then
    echo "MISSING: $path"
  fi
done
```

**Common causes:**

- User manually deleted voice memo in Voice Memos app
- iCloud storage optimization removed local file (dataless)
- File system permissions changed
- Voice Memos app bug relocated file

**Fix strategies:**

1. **If file is dataless:**

```bash
icloudctl download --file "$path"
```

2. **If file is permanently deleted:**

```bash
# Mark as quarantined, export placeholder
sqlite3 ~/.capture-bridge/staging.db <<EOF
UPDATE captures
SET meta_json = json_set(meta_json, '$.integrity.quarantine', 1, '$.integrity.quarantine_reason', 'missing_file')
WHERE source = 'voice'
AND json_extract(meta_json, '$.channel_native_id') = '$path';
EOF

# Trigger placeholder export
adhd capture export-placeholders
```

3. **If file was relocated by system:**

```bash
# Search for file by fingerprint
find ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/ -name "*.m4a" -exec sh -c 'sha256sum {} | head -c 64' \; | grep "$audio_fingerprint"

# If found, update path in staging ledger
sqlite3 ~/.capture-bridge/staging.db "UPDATE captures SET meta_json = json_set(meta_json, '$.channel_native_id', '$new_path') WHERE id = '$capture_id';"
```

### Symptom: Transcription Timeouts or Failures

**Diagnosis:**

```bash
# Check recent transcription failures
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  c.id,
  json_extract(c.meta_json, '$.channel_native_id') as audio_path,
  e.error_type,
  e.error_message,
  e.attempt_number
FROM captures c
JOIN errors_log e ON c.id = e.capture_id
WHERE c.source = 'voice'
AND e.stage = 'transcription'
AND e.created_at > datetime('now', '-1 hour')
ORDER BY e.created_at DESC;
EOF
```

**Common failure modes:**

#### 1. **Timeout Errors (`operation.timeout`)**

**Cause:** Audio file too long for Whisper model timeout (default 30s).

**Check audio duration:**

```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$audio_path"
```

**Fix strategies:**

```bash
# Option 1: Increase timeout for long files (configure in Whisper runtime)
export WHISPER_TIMEOUT_MS=60000  # 60 seconds

# Option 2: Use smaller Whisper model (faster but less accurate)
export WHISPER_MODEL=small  # Default is 'medium'

# Option 3: Skip transcription, export placeholder
adhd capture export-placeholders --capture-id "$capture_id"
```

#### 2. **Corrupt Audio Files (`validation.corrupt_input`)**

**Verification:**

```bash
# Check if ffmpeg can decode the file
ffmpeg -v error -i "$audio_path" -f null - 2>&1
```

**If corrupted:**

```bash
# Mark as quarantined
sqlite3 ~/.capture-bridge/staging.db "UPDATE captures SET meta_json = json_set(meta_json, '$.integrity.quarantine', 1, '$.integrity.quarantine_reason', 'corrupt_audio') WHERE id = '$capture_id';"

# Export placeholder
adhd capture export-placeholders --capture-id "$capture_id"
```

#### 3. **Whisper Runtime Errors (`operation.oom`, `operation.crash`)**

**Check system resources:**

```bash
# Monitor memory usage during transcription
top -l 1 | grep -E "(PhysMem|whisper)"

# Check available disk space (Whisper models are 1-3GB)
df -h ~/.cache/whisper/
```

**Fix:**

```bash
# Free up memory
killall -9 whisper  # Kill hung Whisper processes

# Use smaller model
export WHISPER_MODEL=tiny  # Smallest model, ~75MB

# Restart capture process
adhd capture start --voice
```

### Symptom: Duplicate Voice Memos Not Being Detected

**Context:** Deduplication relies on audio fingerprints (first 4MB SHA-256) to detect duplicates before transcription.

**Diagnosis:**

```bash
# Find captures with identical audio fingerprints
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  json_extract(meta_json, '$.audio_fp') as audio_fingerprint,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(id, ', ') as capture_ids
FROM captures
WHERE source = 'voice'
GROUP BY json_extract(meta_json, '$.audio_fp')
HAVING COUNT(*) > 1;
EOF
```

**Expected output (if duplicates exist):**

```
audio_fingerprint                              | duplicate_count | capture_ids
-----------------------------------------------|-----------------|------------------------------------
sha256_a1b2c3d4e5f6...                        | 2               | 01JTEST123, 01JTEST456
```

**Issue:** If no results but user reports duplicates, fingerprinting may be inconsistent.

**Verification:**

```bash
# Manually compute fingerprint for a file
head -c 4194304 "$audio_path" | sha256sum

# Compare with stored fingerprint
sqlite3 ~/.capture-bridge/staging.db "SELECT json_extract(meta_json, '$.audio_fp') FROM captures WHERE json_extract(meta_json, '$.channel_native_id') = '$audio_path';"
```

**If fingerprints don't match:**

1. File was modified after initial fingerprinting (rare)
2. Fingerprinting logic has a bug (file read truncation)
3. File is dataless and was re-downloaded (different bytes)

**Fix:**

```bash
# Recompute fingerprints for all staged captures
adhd capture recompute-fingerprints --source voice --status staged

# Re-run deduplication
adhd capture deduplicate --source voice
```

## Email Capture Debugging

### Symptom: Gmail Messages Not Being Polled

**Diagnosis Steps:**

1. **Check Gmail API connectivity:**

```bash
# Test Gmail API with dry-run
adhd capture email --dry-run
```

**Expected output:**

```
Gmail API: Connected
Account: user@gmail.com
Messages in label [INBOX]: 47
New messages since last poll: 3
```

**Common errors:**

- `auth.invalid_grant` - OAuth2 token expired or revoked
- `api.quota_exceeded` - Daily API quota exceeded (10,000 requests/day free tier)
- `api.rate_limited` - Rate limit hit (250 requests/user/second)
- `network.timeout` - Network connectivity issue

2. **Check OAuth2 token validity:**

```bash
# Inspect stored OAuth2 token
cat ~/.capture-bridge/gmail-credentials.json | jq '.expiry_date'

# Check if expired (expiry_date < current timestamp)
date +%s
```

**If expired:**

```bash
# Trigger re-authentication
adhd capture email --reauth

# Follow OAuth2 flow in browser
```

3. **Check Gmail API quota:**

```bash
# View quota usage (requires Google Cloud Console access)
# https://console.cloud.google.com/apis/api/gmail.googleapis.com/quotas

# Check for quota exceeded errors
sqlite3 ~/.capture-bridge/staging.db "SELECT COUNT(*) FROM errors_log WHERE error_type = 'api.quota_exceeded' AND created_at > datetime('now', '-1 day');"
```

**If quota exceeded:**

- Wait for quota reset (daily at midnight Pacific Time)
- Reduce polling frequency (increase poll interval)
- Request quota increase in Google Cloud Console

4. **Check sync state cursor:**

```bash
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  channel,
  last_cursor,
  last_poll_at,
  items_processed
FROM sync_state
WHERE channel = 'email';
EOF
```

**Expected output:**

```
channel | last_cursor    | last_poll_at        | items_processed
--------|----------------|--------------------|----------------
email   | history_12345  | 2025-09-28 14:30:22| 128
```

**Issue:** If `last_cursor` is NULL or `last_poll_at` is stale, sync state is corrupted.

**Fix:**

```bash
# Reset sync state (will re-fetch recent emails)
sqlite3 ~/.capture-bridge/staging.db "UPDATE sync_state SET last_cursor = NULL WHERE channel = 'email';"

# Trigger manual poll
adhd capture email
```

### Symptom: Duplicate Emails Not Being Detected

**Context:** Email deduplication uses message ID (Gmail `id` field) and content hash (SHA-256 of normalized body text).

**Diagnosis:**

```bash
# Find captures with identical message IDs
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  json_extract(meta_json, '$.message_id') as message_id,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(id, ', ') as capture_ids
FROM captures
WHERE source = 'email'
GROUP BY json_extract(meta_json, '$.message_id')
HAVING COUNT(*) > 1;
EOF
```

**If duplicates are NOT being detected:**

1. **Message ID not being stored:**

```bash
# Check if message_id is NULL
sqlite3 ~/.capture-bridge/staging.db "SELECT COUNT(*) FROM captures WHERE source = 'email' AND json_extract(meta_json, '$.message_id') IS NULL;"
```

**Fix:** Verify Gmail API response includes `id` field.

2. **Content hash inconsistency:**

```bash
# Find emails with identical content but different hashes
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  raw_content,
  content_hash,
  COUNT(*) as count
FROM captures
WHERE source = 'email'
GROUP BY raw_content
HAVING COUNT(*) > 1;
EOF
```

**Likely cause:** Text normalization inconsistency (whitespace, HTML stripping).

**Fix:**

```bash
# Recompute content hashes with consistent normalization
adhd capture recompute-hashes --source email
```

### Symptom: Email Body Extraction Failures

**Diagnosis:**

```bash
# Check for empty or truncated email bodies
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  id,
  json_extract(meta_json, '$.message_id') as message_id,
  LENGTH(raw_content) as body_length,
  json_extract(meta_json, '$.subject') as subject
FROM captures
WHERE source = 'email'
AND LENGTH(raw_content) < 10
AND created_at > datetime('now', '-1 day');
EOF
```

**Common issues:**

1. **HTML-only emails with no plain text part:**

```bash
# Check if email has only HTML part
# (Requires inspecting Gmail API response payload)
adhd capture email --message-id "$message_id" --debug
```

**Fix:** Implement HTML-to-text conversion in email capture logic.

2. **Large email bodies truncated:**

```bash
# Check if Gmail snippet was used instead of full body
sqlite3 ~/.capture-bridge/staging.db "SELECT raw_content FROM captures WHERE id = '$capture_id';"
```

**Expected:** Full email body, not just snippet.

**Fix:** Ensure Gmail API call uses `format=full` parameter.

## Transcription Pipeline Debugging

### Symptom: Transcription Queue Backlog Growth

**Diagnosis:**

```bash
# Check transcription queue depth over time
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "transcription_queue_depth")' | jq -s 'sort_by(.timestamp) | .[] | {timestamp, value}'
```

**Expected output:**

```json
{"timestamp": "2025-09-28T14:00:00Z", "value": 2}
{"timestamp": "2025-09-28T14:05:00Z", "value": 3}
{"timestamp": "2025-09-28T14:10:00Z", "value": 5}
{"timestamp": "2025-09-28T14:15:00Z", "value": 8}
```

**Issue:** Queue depth increasing over time (backlog growth).

**Root causes:**

1. **Transcription slower than capture rate:**

```bash
# Calculate average transcription duration
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "transcription.duration_ms")' | jq -s 'add / length'

# Calculate capture rate (captures per minute)
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "capture.voice.staging_ms")' | jq -s 'length / 60'
```

**If transcription_avg_ms > (60000 / capture_rate_per_min), backlog will grow.**

**Fix:**

```bash
# Option 1: Use faster Whisper model
export WHISPER_MODEL=small  # Faster, less accurate

# Option 2: Increase transcription timeout (allow longer processing)
export WHISPER_TIMEOUT_MS=60000

# Option 3: Rate-limit capture polling
export VOICE_POLL_INTERVAL_MS=60000  # Poll every 60s instead of 30s
```

2. **Transcription failures causing retries:**

```bash
# Check transcription failure rate
sqlite3 ~/.capture-bridge/staging.db "SELECT COUNT(*) FROM errors_log WHERE stage = 'transcription' AND created_at > datetime('now', '-1 hour');"
```

**If failure rate >10%:**

```bash
# Investigate failure reasons
sqlite3 ~/.capture-bridge/staging.db "SELECT error_type, COUNT(*) FROM errors_log WHERE stage = 'transcription' GROUP BY error_type;"

# Address specific failure types (timeouts, OOM, corrupt audio)
```

### Symptom: Transcription Producing Incorrect Results

**Diagnosis:**

```bash
# Sample recent transcriptions
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  id,
  raw_content,
  json_extract(meta_json, '$.channel_native_id') as audio_path
FROM captures
WHERE source = 'voice'
AND status = 'transcribed'
ORDER BY created_at DESC
LIMIT 5;
EOF
```

**Manual verification:**

```bash
# Listen to audio file
open "$audio_path"

# Compare with transcription text
echo "$raw_content"
```

**Common issues:**

1. **Whisper model too small (low accuracy):**

```bash
# Check current model
echo $WHISPER_MODEL

# Upgrade to larger model
export WHISPER_MODEL=large  # Best accuracy, slower

# Re-transcribe failed captures
adhd capture retranscribe --capture-id "$capture_id"
```

2. **Poor audio quality (background noise, low volume):**

```bash
# Analyze audio quality
ffmpeg -i "$audio_path" -af "volumedetect" -f null - 2>&1 | grep "mean_volume"
```

**If mean_volume < -30dB:**

- Audio too quiet, Whisper may struggle
- Advise user to record closer to microphone
- Consider audio normalization preprocessing (Phase 2+)

3. **Non-English audio:**

```bash
# Check if Whisper detected language
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "transcription.duration_ms" and .tags.capture_id == "'$capture_id'")' | jq '.tags.detected_language'
```

**Fix:**

```bash
# Configure Whisper for specific language
export WHISPER_LANGUAGE=es  # Spanish

# Re-transcribe
adhd capture retranscribe --capture-id "$capture_id"
```

## Deduplication Logic Debugging

### Symptom: False Positive Duplicates (Unique Captures Marked as Duplicates)

**Diagnosis:**

```bash
# Find captures marked as duplicate
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  c1.id as duplicate_id,
  c1.content_hash as duplicate_hash,
  c1.raw_content as duplicate_content,
  c2.id as original_id,
  c2.content_hash as original_hash,
  c2.raw_content as original_content
FROM captures c1
JOIN exports_audit ea ON c1.id = ea.capture_id
JOIN captures c2 ON c1.content_hash = c2.content_hash AND c2.id != c1.id
WHERE c1.status = 'exported_duplicate'
AND ea.mode = 'duplicate_skip'
ORDER BY c1.created_at DESC
LIMIT 5;
EOF
```

**Manual verification:**

```bash
# Compare raw_content of both captures
diff <(echo "$duplicate_content") <(echo "$original_content")
```

**If content is actually different:**

**Likely cause:** Hash collision (extremely rare with SHA-256) OR text normalization bug.

**Verification:**

```bash
# Recompute content hashes manually
echo -n "$duplicate_content" | sha256sum
echo -n "$original_content" | sha256sum

# Compare with stored hashes
echo "Stored duplicate hash: $duplicate_hash"
echo "Stored original hash: $original_hash"
```

**If manual hashes differ from stored hashes:**

- Text normalization inconsistency (whitespace, encoding)
- Hash computation bug

**Fix:**

```bash
# Recompute all content hashes with corrected logic
adhd capture recompute-hashes --all

# Re-run deduplication
adhd capture deduplicate --all

# Unmark false duplicate
sqlite3 ~/.capture-bridge/staging.db "UPDATE captures SET status = 'transcribed' WHERE id = '$duplicate_id';"

# Trigger export
adhd capture export --capture-id "$duplicate_id"
```

### Symptom: False Negative Duplicates (Duplicates Not Detected)

**Diagnosis:**

```bash
# Find captures with identical content but different hashes
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  raw_content,
  COUNT(DISTINCT content_hash) as unique_hashes,
  COUNT(*) as total_captures,
  GROUP_CONCAT(DISTINCT content_hash, ' | ') as hashes
FROM captures
GROUP BY raw_content
HAVING COUNT(DISTINCT content_hash) > 1;
EOF
```

**If results found:**

**Issue:** Same content producing different hashes (normalization inconsistency).

**Common causes:**

1. **Whitespace differences:**

```bash
# Check for leading/trailing whitespace
sqlite3 ~/.capture-bridge/staging.db "SELECT id, LENGTH(raw_content), LENGTH(TRIM(raw_content)) FROM captures WHERE id IN ('$id1', '$id2');"
```

2. **Unicode normalization differences:**

```bash
# Check for Unicode encoding differences
echo "$content1" | hexdump -C > content1.hex
echo "$content2" | hexdump -C > content2.hex
diff content1.hex content2.hex
```

**Fix:**

```bash
# Implement consistent text normalization:
# - Trim leading/trailing whitespace
# - Normalize Unicode to NFC form
# - Collapse multiple spaces to single space
# - Remove null bytes

# Recompute all content hashes
adhd capture recompute-hashes --all

# Re-run deduplication to mark duplicates
adhd capture deduplicate --all
```

## Export Pipeline Debugging

### Symptom: Export to Vault Failing

**Diagnosis:**

```bash
# Check recent export failures
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  e.capture_id,
  e.error_type,
  e.error_message,
  c.status
FROM errors_log e
JOIN captures c ON e.capture_id = c.id
WHERE e.stage = 'export'
AND e.created_at > datetime('now', '-1 hour')
ORDER BY e.created_at DESC;
EOF
```

**Common error types:**

#### 1. **Filesystem Errors (`filesystem.permission_denied`, `filesystem.disk_full`)**

```bash
# Check vault path permissions
ls -ld "$OBSIDIAN_VAULT/inbox/"

# Check available disk space
df -h "$OBSIDIAN_VAULT"
```

**Fix:**

```bash
# Fix permissions
chmod 755 "$OBSIDIAN_VAULT/inbox/"

# Free up disk space if needed
rm -rf ~/.cache/whisper/old-models/  # Remove old Whisper models
```

#### 2. **Atomic Write Failures (`operation.crash`)**

**Diagnosis:**

```bash
# Check for leftover temp files
ls -lh "$OBSIDIAN_VAULT/inbox/.tmp-*"
```

**Issue:** Temp files indicate incomplete atomic write (crash during fsync or rename).

**Fix:**

```bash
# Remove temp files
rm "$OBSIDIAN_VAULT/inbox/.tmp-*"

# Retry export
adhd capture export --capture-id "$capture_id"
```

#### 3. **ULID Collision (`validation.ulid_collision`)**

**Diagnosis:**

```bash
# Check for ULID collisions (extremely rare)
ls "$OBSIDIAN_VAULT/inbox/" | sort | uniq -d
```

**If collision detected:**

```bash
# Verify collision is real (not just duplicate detection)
sqlite3 ~/.capture-bridge/staging.db "SELECT id, content_hash, status FROM captures WHERE id IN ('$ulid1', '$ulid2');"

# If different content_hash, genuine collision (Phase 1: halt)
echo "CRITICAL: ULID collision detected. Halting export."
exit 1
```

### Symptom: Exported Markdown Files Corrupted

**Diagnosis:**

```bash
# Check recent exports
ls -lht "$OBSIDIAN_VAULT/inbox/" | head -10

# Inspect file content
cat "$OBSIDIAN_VAULT/inbox/<ulid>.md"
```

**Common issues:**

1. **Incomplete front matter:**

```bash
# Check for valid YAML front matter
head -20 "$OBSIDIAN_VAULT/inbox/<ulid>.md" | grep -E "^---$" | wc -l
```

**Expected:** 2 lines (opening and closing `---`).

**If not 2:** Front matter is incomplete or malformed.

2. **Binary data in markdown:**

```bash
# Check for non-text characters
file "$OBSIDIAN_VAULT/inbox/<ulid>.md"
```

**Expected:** `ASCII text` or `UTF-8 Unicode text`.

**If binary:** Raw audio data or binary metadata leaked into export.

**Fix:**

```bash
# Re-export with corrected formatting
sqlite3 ~/.capture-bridge/staging.db "UPDATE captures SET status = 'transcribed' WHERE id = '<capture_id>';"
adhd capture export --capture-id "<capture_id>"
```

### Symptom: Placeholder Exports Not Being Created

**Context:** When transcription fails permanently, placeholder exports should be created (per ADR-0014).

**Diagnosis:**

```bash
# Check for failed transcriptions without placeholder exports
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  c.id,
  c.status,
  COUNT(e.id) as error_count,
  MAX(e.created_at) as last_error
FROM captures c
JOIN errors_log e ON c.id = e.capture_id
WHERE c.source = 'voice'
AND c.status = 'failed_transcription'
AND e.stage = 'transcription'
GROUP BY c.id
HAVING COUNT(e.id) >= 5;  -- Max retry attempts
EOF
```

**Expected:** These captures should have `status = 'exported_placeholder'`.

**If still `failed_transcription`:**

```bash
# Manually trigger placeholder export
adhd capture export-placeholders --capture-id "$capture_id"

# Verify placeholder created
ls "$OBSIDIAN_VAULT/inbox/<capture_id>.md"

# Check content
cat "$OBSIDIAN_VAULT/inbox/<capture_id>.md" | grep "Placeholder Export"
```

## Performance Debugging

### Symptom: High End-to-End Latency

**Diagnosis:**

```bash
# Check p95 latency by source
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "capture.time_to_export_ms")' | jq -s 'group_by(.tags.source) | map({source: .[0].tags.source, p95: (sort_by(.value) | .[length * 0.95 | floor].value)})'
```

**Expected output:**

```json
[
  { "source": "voice", "p95": 8200 },
  { "source": "email", "p95": 2100 }
]
```

**Target:** Voice <11s, Email <3.5s (per Master PRD).

**If exceeding target:**

**Breakdown by stage:**

```bash
# Voice staging latency
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "capture.voice.staging_ms")' | jq -s 'sort_by(.value) | .[length * 0.95 | floor].value'

# Transcription latency
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "transcription.duration_ms")' | jq -s 'sort_by(.value) | .[length * 0.95 | floor].value'

# Export latency
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "export.write_ms")' | jq -s 'sort_by(.value) | .[length * 0.95 | floor].value'
```

**Identify bottleneck:**

- If staging >500ms: File I/O bottleneck (dataless downloads, fingerprinting)
- If transcription >7000ms: Whisper performance issue (model too large, long audio)
- If export >50ms: Vault write bottleneck (disk I/O, fsync latency)

**Fix strategies:**

```bash
# Reduce staging latency
export AUDIO_FINGERPRINT_BYTES=2097152  # 2MB instead of 4MB

# Reduce transcription latency
export WHISPER_MODEL=small  # Faster model

# Reduce export latency
# (Export latency is typically bounded by fsync; minimal optimization possible)
```

### Symptom: High Memory Usage

**Diagnosis:**

```bash
# Monitor Node.js process memory
top -l 1 -pid $(pgrep -f "adhd capture") | grep -E "(MEM|adhd)"

# Check for memory leaks
node --expose-gc --trace-gc packages/@capture-bridge/cli/dist/index.js capture start --all
```

**Common causes:**

1. **Whisper model loaded multiple times:**

```bash
# Check Whisper process count
ps aux | grep -c whisper
```

**Expected:** 1 process.

**If multiple:** Memory leak, Whisper not being released.

**Fix:**

```bash
# Kill hung Whisper processes
killall -9 whisper

# Restart capture with proper cleanup
adhd capture start --voice
```

2. **Large audio files in memory:**

```bash
# Check if audio files are being buffered in memory
ls -lh ~/Library/Group\ Containers/group.com.apple.VoiceMemos.shared/Recordings/*.m4a | sort -k5 -hr | head -5
```

**If files >50MB:** May cause memory pressure.

**Fix:** Implement streaming audio processing (Phase 2+).

## Recovery & Integrity Debugging

### Symptom: Crash Recovery Not Working

**Diagnosis:**

```bash
# Query recoverable captures
sqlite3 ~/.capture-bridge/staging.db <<EOF
SELECT
  id,
  source,
  status,
  created_at
FROM captures
WHERE status NOT IN ('exported', 'exported_duplicate', 'exported_placeholder')
ORDER BY created_at ASC;
EOF
```

**Expected:** Captures should be in `staged`, `transcribed`, or `failed_transcription` status.

**If stuck in intermediate states:**

```bash
# Check for WAL mode (crash recovery requires WAL)
sqlite3 ~/.capture-bridge/staging.db "PRAGMA journal_mode;"
```

**Expected:** `wal`.

**If not WAL:**

```bash
# Enable WAL mode
sqlite3 ~/.capture-bridge/staging.db "PRAGMA journal_mode=WAL;"

# Restart capture process
adhd capture start --all
```

**Verify recovery logic:**

```bash
# Simulate crash and recovery
adhd capture start --voice &
PID=$!
sleep 10
kill -9 $PID  # Simulate crash

# Restart and check recovery
adhd capture start --voice

# Verify no captures lost
sqlite3 ~/.capture-bridge/staging.db "SELECT COUNT(*) FROM captures WHERE status NOT IN ('exported', 'exported_duplicate', 'exported_placeholder');"
```

### Symptom: Staging Ledger Corruption

**Diagnosis:**

```bash
# Run SQLite integrity check
sqlite3 ~/.capture-bridge/staging.db "PRAGMA integrity_check;"
```

**Expected output:** `ok`.

**If corruption detected:**

```bash
# Attempt automatic repair
sqlite3 ~/.capture-bridge/staging.db ".recover" > recovered.sql

# Create new database from recovered SQL
mv ~/.capture-bridge/staging.db ~/.capture-bridge/staging.db.corrupt
sqlite3 ~/.capture-bridge/staging.db < recovered.sql

# Verify recovery
sqlite3 ~/.capture-bridge/staging.db "SELECT COUNT(*) FROM captures;"
```

**If recovery fails:**

```bash
# Restore from backup
cp ~/.capture-bridge/backups/staging-hourly-latest.db ~/.capture-bridge/staging.db

# Verify restore
adhd capture doctor
```

## Advanced Debugging Techniques

### Enable Debug Logging

```bash
# Enable verbose debug output
export DEBUG=adhd:*
export LOG_LEVEL=debug

# Run capture with debug logging
adhd capture start --all 2>&1 | tee capture-debug.log

# Filter for specific component
export DEBUG=adhd:capture:voice
adhd capture voice
```

### Trace System Calls

```bash
# Trace file system operations (macOS)
sudo dtruss -f -t open,read,write,fsync -p $(pgrep -f "adhd capture")

# Trace network calls (Gmail API)
sudo tcpdump -i en0 -A 'host gmail.googleapis.com'
```

### Profile Performance

```bash
# Generate CPU profile
node --prof packages/@capture-bridge/cli/dist/index.js capture start --voice
node --prof-process isolate-*.log > cpu-profile.txt

# Generate heap snapshot
node --inspect packages/@capture-bridge/cli/dist/index.js capture start --voice
# Open chrome://inspect in Chrome, take heap snapshot
```

### Metrics Analysis Scripts

```bash
# Calculate p50, p95, p99 latency
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "capture.time_to_export_ms")' | jq -s 'sort_by(.value) | {p50: .[length * 0.5 | floor].value, p95: .[length * 0.95 | floor].value, p99: .[length * 0.99 | floor].value}'

# Plot latency over time (requires gnuplot)
cat .metrics/$(date +%Y-%m-%d).ndjson | jq 'select(.metric == "capture.time_to_export_ms") | [.timestamp, .value] | @csv' -r > latency.csv
gnuplot -e "set datafile separator ','; plot 'latency.csv' with lines"
```

## Related Documentation

- [Error Recovery Guide](./guide-error-recovery.md) - Retry policies and DLQ
- [Polling Implementation Guide](./guide-polling-implementation.md) - Polling architecture
- [Whisper Transcription Guide](./guide-whisper-transcription.md) - Transcription internals
- **[Voice Capture Debugging Guide](./guide-voice-capture-debugging.md) - Voice memo specific troubleshooting** (APFS dataless files, iCloud sync, voice memo metadata, iOS sync detection, advanced debugging techniques)
- [Capture PRD](../features/capture/prd-capture.md) - Product requirements
- [Capture Tech Spec](../features/capture/spec-capture-tech.md) - Technical details
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Test strategies
- [Direct Export Pattern](../cross-cutting/spec-direct-export-tech.md) - Export mechanics
- [ADR-0001: Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md) - Voice file handling
- [ADR-0006: Late Hash Binding](../adr/0006-late-hash-binding-voice.md) - Content hash timing

## Appendix: Common Error Codes

### Error Type Taxonomy

| Error Type                     | Retriable | Common Causes                    | Fix Strategy                     |
| ------------------------------ | --------- | -------------------------------- | -------------------------------- |
| `network.timeout`              | Yes       | Network latency, server overload | Retry with backoff               |
| `network.connection_refused`   | Yes       | Service down, firewall           | Check service status             |
| `api.rate_limited`             | Yes       | Quota exceeded                   | Wait for reset, reduce rate      |
| `api.quota_exceeded`           | Yes       | Daily limit hit                  | Wait for reset, request increase |
| `api.auth_invalid`             | No        | Token expired                    | Re-authenticate                  |
| `operation.timeout`            | Yes       | Long processing time             | Increase timeout, optimize       |
| `operation.oom`                | No        | Insufficient memory              | Free memory, use smaller model   |
| `operation.crash`              | No        | Unexpected error                 | Review logs, report bug          |
| `validation.corrupt_input`     | No        | Malformed data                   | Quarantine, skip                 |
| `filesystem.permission_denied` | No        | Access denied                    | Fix permissions                  |
| `filesystem.disk_full`         | No        | Out of space                     | Free disk space                  |

### Exit Codes

| Exit Code | Meaning             | Action                             |
| --------- | ------------------- | ---------------------------------- |
| 0         | Success             | None                               |
| 1         | General error       | Check logs                         |
| 2         | Configuration error | Verify environment variables       |
| 3         | Database error      | Run `adhd capture doctor --repair` |
| 4         | API error           | Check API credentials              |
| 5         | File system error   | Check permissions                  |
| 137       | Killed (OOM)        | Free memory, reduce load           |

---

**Last Updated:** 2025-09-28
**Version:** 1.0.0
**Author:** Nathan
**Status:** Approved
