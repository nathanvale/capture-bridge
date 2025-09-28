---
title: Obsidian Bridge Quick-Start Usage Guide
status: draft
owner: spec-librarian
version: 1.0.0
date: 2025-09-28
doc_type: guide
---

# Obsidian Bridge Quick-Start Usage Guide

## Purpose

This guide provides a 5-minute implementer primer for developers integrating the Obsidian Bridge atomic writer. You'll learn how to safely export captures from the Staging Ledger to your Obsidian vault with zero partial writes, zero vault corruption, and deterministic ULID-based filenames.

**Target Audience:** Developers implementing capture export functionality in the ADHD Brain CLI or other integrations.

## When to Use This Guide

Use this guide when you need to:

- Export staged captures to an Obsidian vault atomically
- Implement retry-safe export operations
- Handle filesystem errors gracefully
- Integrate with the Staging Ledger audit trail
- Debug export failures or partial writes

**Prerequisites:** Familiarity with Staging Ledger schema, ULID identifiers, and atomic filesystem operations.

## Prerequisites

Before using the Obsidian Bridge, ensure:

1. **Staging Ledger initialized** with captures table populated
2. **Vault path configured** and accessible with write permissions
3. **Node.js 20+** runtime environment
4. **Understanding of atomic write guarantees** (temp-then-rename pattern)
5. **Familiarity with ULID identifiers** from Staging Ledger

**Required Packages:**
```bash
pnpm add @adhd-brain/obsidian-bridge @adhd-brain/staging-ledger
```

## Quick Reference - 3-Minute Implementation

### Step 1: Install and Import

```typescript
import { ObsidianAtomicWriter } from '@adhd-brain/obsidian-bridge';
import { Database } from '@adhd-brain/staging-ledger';
```

### Step 2: Initialize Writer

```typescript
const vault_path = '/Users/nathan/vault'; // Absolute path to Obsidian vault
const db = new Database('~/.adhd-brain/staging.db');
const writer = new ObsidianAtomicWriter(vault_path, db);
```

### Step 3: Export Capture

```typescript
// Retrieve capture from staging ledger
const capture = await db.getCapture(capture_id);

// Format capture as markdown
const content = formatMarkdownExport(capture);

// Atomic write with automatic retry handling
const result = await writer.writeAtomic(
  capture.id,        // ULID (becomes filename)
  content,           // Formatted markdown
  vault_path
);

if (result.success) {
  console.log(`Exported to: ${result.export_path}`);
  // Example: "Exported to: inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md"
} else {
  console.error(`Export failed: ${result.error?.code} - ${result.error?.message}`);
}
```

## Step-by-Step Instructions

### Step 1: Set Up Environment

**Configure Vault Path:**

```typescript
import * as path from 'path';
import * as fs from 'fs/promises';

// Resolve vault path (supports tilde expansion)
const vault_path = path.resolve(process.env.OBSIDIAN_VAULT_PATH || '~/vault');

// Verify vault exists and is writable
try {
  await fs.access(vault_path, fs.constants.W_OK);
} catch (error) {
  throw new Error(`Vault path not writable: ${vault_path}`);
}
```

**Expected Vault Structure:**

```
{vault_path}/
├── .trash/              # Temp files written here first (auto-created)
│   ├── {ULID}.tmp       # Temporary write target
│   └── ...
├── inbox/               # Final atomic export destination (auto-created)
│   ├── {ULID}.md        # Atomically renamed from .trash/
│   └── ...
└── ... (other Obsidian vault content)
```

### Step 2: Format Markdown Content

**Use Standard Formatting Function:**

```typescript
function formatMarkdownExport(capture: Capture): string {
  const frontmatter = `---
id: ${capture.id}
source: ${capture.source}
captured_at: ${capture.captured_at}
content_hash: ${capture.content_hash}
---`;

  const title = extractTitle(capture.content) || 'Untitled Capture';

  const body = capture.source === 'voice'
    ? formatVoiceCapture(capture)
    : formatEmailCapture(capture);

  const metadata = `---

**Metadata:**
- Source: ${capture.source === 'voice' ? 'Voice Recording' : 'Email'}
- Captured: ${new Date(capture.captured_at).toUTCString()}
- Export: ${new Date().toUTCString()}`;

  return `${frontmatter}\n\n# ${title}\n\n${body}\n${metadata}`;
}
```

**Example Output:**

```markdown
---
id: 01HZVM8YWRQT5J3M3K7YPTX9RZ
source: voice
captured_at: 2025-09-27T10:00:00Z
content_hash: a1b2c3d4e5f6
---

# Voice Capture

Remember to buy groceries for the weekend party

---

**Metadata:**
- Source: Voice Recording
- Captured: Wed, 27 Sep 2025 10:00:00 GMT
- Export: Sat, 28 Sep 2025 14:30:00 GMT
```

### Step 3: Perform Atomic Write

**Basic Export:**

```typescript
const result = await writer.writeAtomic(
  capture.id,
  content,
  vault_path
);

// Check result
if (result.success) {
  console.log(`✅ Export successful: ${result.export_path}`);
} else {
  console.error(`❌ Export failed: ${result.error?.code}`);
}
```

**With Error Handling:**

```typescript
try {
  const result = await writer.writeAtomic(capture.id, content, vault_path);

  if (!result.success) {
    switch (result.error?.code) {
      case 'EACCES':
        // Permission denied - check vault permissions
        throw new Error(`Permission denied writing to vault: ${vault_path}`);

      case 'ENOSPC':
        // Disk full - alert user to free space
        throw new Error('Disk full - please free space and retry');

      case 'EEXIST':
        // ULID collision with different content (CRITICAL)
        throw new Error(`CRITICAL: ULID collision detected for ${capture.id}`);

      case 'EROFS':
        // Read-only filesystem - remount or check vault location
        throw new Error('Vault is on read-only filesystem');

      case 'ENETDOWN':
        // Network mount failure - retry later
        throw new Error('Network mount disconnected - will retry');

      default:
        throw new Error(`Unknown error: ${result.error?.message}`);
    }
  }

  return result.export_path;
} catch (error) {
  console.error('Export failed:', error);
  throw error;
}
```

### Step 4: Verify Export Success

**Check Audit Trail:**

```typescript
// Query exports_audit table to verify export recorded
const auditRecord = db.prepare(`
  SELECT * FROM exports_audit
  WHERE capture_id = ?
  ORDER BY exported_at DESC
  LIMIT 1
`).get(capture_id);

if (auditRecord) {
  console.log(`Export audit: ${auditRecord.mode} at ${auditRecord.exported_at}`);
  // Example: "Export audit: initial at 2025-09-28T14:30:00Z"
}
```

**Verify File Exists:**

```typescript
import * as fs from 'fs/promises';

const export_path = path.join(vault_path, 'inbox', `${capture.id}.md`);

try {
  const stats = await fs.stat(export_path);
  console.log(`File exists: ${export_path} (${stats.size} bytes)`);
} catch (error) {
  console.error('File not found - export may have failed');
}
```

## Common Patterns

### Pattern: Export with Automatic Retry

**Use Case:** Handle transient errors (EACCES, ENETDOWN) with exponential backoff.

```typescript
async function exportWithRetry(
  capture_id: string,
  content: string,
  vault_path: string,
  maxRetries: number = 3
): Promise<string> {
  const writer = new ObsidianAtomicWriter(vault_path, db);
  let lastError: AtomicWriteError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await writer.writeAtomic(capture_id, content, vault_path);

    if (result.success) {
      return result.export_path!;
    }

    lastError = result.error;

    // Only retry transient errors
    const retryableCodes = ['EACCES', 'ENETDOWN'];
    if (!retryableCodes.includes(result.error?.code || '')) {
      throw new Error(`Non-retryable error: ${result.error?.code}`);
    }

    // Exponential backoff: 1s, 2s, 4s
    const delayMs = Math.pow(2, attempt - 1) * 1000;
    console.log(`Retry ${attempt}/${maxRetries} after ${delayMs}ms...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error(`Export failed after ${maxRetries} retries: ${lastError?.message}`);
}
```

### Pattern: Batch Export

**Use Case:** Export multiple captures sequentially with progress tracking.

```typescript
async function batchExport(
  capture_ids: string[],
  vault_path: string
): Promise<{ success: string[], failed: string[] }> {
  const writer = new ObsidianAtomicWriter(vault_path, db);
  const results = { success: [], failed: [] };

  for (const [index, capture_id] of capture_ids.entries()) {
    console.log(`Exporting ${index + 1}/${capture_ids.length}: ${capture_id}`);

    try {
      const capture = await db.getCapture(capture_id);
      const content = formatMarkdownExport(capture);
      const result = await writer.writeAtomic(capture_id, content, vault_path);

      if (result.success) {
        results.success.push(capture_id);
      } else {
        console.error(`Failed: ${result.error?.code} - ${result.error?.message}`);
        results.failed.push(capture_id);
      }
    } catch (error) {
      console.error(`Exception exporting ${capture_id}:`, error);
      results.failed.push(capture_id);
    }
  }

  console.log(`Batch export complete: ${results.success.length} succeeded, ${results.failed.length} failed`);
  return results;
}
```

### Pattern: Idempotent Retry

**Use Case:** Safely retry exports knowing duplicates are handled automatically.

```typescript
async function idempotentExport(
  capture_id: string,
  vault_path: string
): Promise<'exported' | 'duplicate' | 'failed'> {
  const writer = new ObsidianAtomicWriter(vault_path, db);

  const capture = await db.getCapture(capture_id);
  const content = formatMarkdownExport(capture);

  const result = await writer.writeAtomic(capture_id, content, vault_path);

  if (result.success) {
    // Check if this was a duplicate export
    const auditRecord = db.prepare(`
      SELECT mode FROM exports_audit
      WHERE capture_id = ?
      ORDER BY exported_at DESC
      LIMIT 1
    `).get(capture_id);

    return auditRecord?.mode === 'duplicate_skip' ? 'duplicate' : 'exported';
  }

  return 'failed';
}
```

### Pattern: Export with Content Hash Verification

**Use Case:** Verify exported content matches staging ledger hash.

```typescript
import * as crypto from 'crypto';

function computeSHA256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function exportWithVerification(
  capture_id: string,
  vault_path: string
): Promise<boolean> {
  const writer = new ObsidianAtomicWriter(vault_path, db);

  // Get capture and compute expected hash
  const capture = await db.getCapture(capture_id);
  const content = formatMarkdownExport(capture);
  const expectedHash = computeSHA256(content);

  // Perform atomic write
  const result = await writer.writeAtomic(capture_id, content, vault_path);

  if (!result.success) {
    return false;
  }

  // Read exported file and verify hash
  const exportPath = path.join(vault_path, result.export_path!);
  const exportedContent = await fs.readFile(exportPath, 'utf-8');
  const actualHash = computeSHA256(exportedContent);

  if (actualHash !== expectedHash) {
    console.error(`Hash mismatch: expected ${expectedHash}, got ${actualHash}`);
    return false;
  }

  return true;
}
```

## Troubleshooting

### Problem: Permission Denied (EACCES)

**Symptom:** Export fails with `EACCES` error code.

**Causes:**
- Vault directory not writable by current user
- `.trash/` or `inbox/` directories have restrictive permissions
- macOS sandbox restrictions (if running in sandboxed context)

**Solution:**

```bash
# Check vault permissions
ls -la /path/to/vault

# Fix permissions (make vault writable)
chmod u+w /path/to/vault
chmod u+w /path/to/vault/.trash
chmod u+w /path/to/vault/inbox

# Verify write access
touch /path/to/vault/.trash/test.tmp && rm /path/to/vault/.trash/test.tmp
```

**Code Fix:**

```typescript
// Add permission check before export
try {
  await fs.access(vault_path, fs.constants.W_OK);
} catch (error) {
  throw new Error(`Vault not writable: ${vault_path}. Run: chmod u+w ${vault_path}`);
}
```

### Problem: Disk Full (ENOSPC)

**Symptom:** Export fails with `ENOSPC` error code.

**Causes:**
- Vault disk has insufficient free space
- Filesystem quota exceeded
- Temp directory on different mount point (rare)

**Solution:**

```bash
# Check disk space on vault mount
df -h /path/to/vault

# Free space (example: delete old files)
rm -rf /path/to/vault/.trash/*.tmp

# Check vault size
du -sh /path/to/vault
```

**Code Fix:**

```typescript
// Add disk space check before export
import { statfs } from 'fs/promises';

async function checkDiskSpace(vault_path: string, minFreeMB: number = 100): Promise<boolean> {
  const stats = await statfs(vault_path);
  const freeMB = (stats.bavail * stats.bsize) / (1024 * 1024);

  if (freeMB < minFreeMB) {
    throw new Error(`Insufficient disk space: ${freeMB.toFixed(2)} MB free, need ${minFreeMB} MB`);
  }

  return true;
}

// Use before export
await checkDiskSpace(vault_path);
const result = await writer.writeAtomic(capture_id, content, vault_path);
```

### Problem: ULID Collision (EEXIST)

**Symptom:** Export fails with `EEXIST` error code and "ULID collision detected" message.

**Causes:**
- **CRITICAL:** Same ULID with different content (data integrity violation)
- Extremely rare (~1 in 1 billion with proper ULID generation)
- May indicate ULID generator failure or staging ledger corruption

**Solution:**

```bash
# 1. Investigate collision in staging ledger
sqlite3 ~/.adhd-brain/staging.db
SELECT id, content_hash, created_at FROM captures WHERE id = '01HZVM8YWRQT5J3M3K7YPTX9RZ';

# 2. Check existing file in vault
cat /path/to/vault/inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md

# 3. Verify content hashes match
# If hashes differ → CRITICAL ERROR, manual investigation required
```

**Diagnostic Script:**

```typescript
async function diagnoseULIDCollision(capture_id: string, vault_path: string): Promise<void> {
  // Get capture from staging ledger
  const capture = await db.getCapture(capture_id);
  const expectedHash = capture.content_hash;

  // Read existing file from vault
  const export_path = path.join(vault_path, 'inbox', `${capture_id}.md`);
  const existingContent = await fs.readFile(export_path, 'utf-8');
  const actualHash = computeSHA256(existingContent);

  console.log(`Expected hash: ${expectedHash}`);
  console.log(`Actual hash:   ${actualHash}`);
  console.log(`Match: ${expectedHash === actualHash}`);

  if (expectedHash !== actualHash) {
    console.error('CRITICAL: ULID collision with different content!');
    console.error('This indicates data corruption. Manual investigation required.');
    console.error(`1. Review staging ledger: ${capture_id}`);
    console.error(`2. Review vault file: ${export_path}`);
    console.error(`3. Check ULID generator integrity`);
  } else {
    console.log('Hash match - safe to skip duplicate export.');
  }
}
```

### Problem: Orphaned Temp Files

**Symptom:** Files with `.tmp` extension accumulate in `.trash/` directory.

**Causes:**
- Process crash during export (normal)
- Export worker killed mid-write
- Filesystem errors during cleanup

**Solution:**

```bash
# Manual cleanup (safe - temp files are never finalized)
rm -f /path/to/vault/.trash/*.tmp

# Automated cleanup with adhd doctor command
adhd doctor --cleanup

# Check for orphaned files
find /path/to/vault/.trash -name "*.tmp" -mtime +1 -ls
```

**Automated Cleanup Script:**

```typescript
async function cleanupOrphanedTempFiles(vault_path: string): Promise<number> {
  const trash_dir = path.join(vault_path, '.trash');
  const files = await fs.readdir(trash_dir);

  let cleanedCount = 0;

  for (const file of files) {
    if (file.endsWith('.tmp')) {
      const temp_path = path.join(trash_dir, file);

      // Check if file is older than 1 hour (safe to delete)
      const stats = await fs.stat(temp_path);
      const ageMs = Date.now() - stats.mtimeMs;

      if (ageMs > 3600000) { // 1 hour
        await fs.unlink(temp_path);
        cleanedCount++;
        console.log(`Cleaned orphaned temp file: ${file}`);
      }
    }
  }

  return cleanedCount;
}
```

### Problem: Network Mount Disconnected (ENETDOWN)

**Symptom:** Export fails with `ENETDOWN` error code.

**Causes:**
- Vault on network mount (iCloud Drive, NAS, etc.)
- Network mount temporarily unavailable
- Obsidian Sync folder disconnected

**Solution:**

```bash
# Check mount status
mount | grep /path/to/vault

# Remount network drive (example for macOS)
diskutil unmount /path/to/vault
diskutil mount /path/to/vault

# Test write access
touch /path/to/vault/.trash/test.tmp && rm /path/to/vault/.trash/test.tmp
```

**Code Fix:**

```typescript
// Retry with exponential backoff for network errors
async function exportWithNetworkRetry(
  capture_id: string,
  content: string,
  vault_path: string
): Promise<string> {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await writer.writeAtomic(capture_id, content, vault_path);

    if (result.success) {
      return result.export_path!;
    }

    if (result.error?.code === 'ENETDOWN' && attempt < maxRetries) {
      const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, 16s, 32s
      console.log(`Network mount unavailable, retrying in ${delayMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    throw new Error(`Export failed: ${result.error?.message}`);
  }

  throw new Error('Export failed after network retries');
}
```

## Examples

### Real-World Usage: CLI Export Command

**Scenario:** Implement `adhd export <capture-id>` CLI command.

```typescript
import { Command } from 'commander';
import { ObsidianAtomicWriter } from '@adhd-brain/obsidian-bridge';
import { Database } from '@adhd-brain/staging-ledger';
import * as path from 'path';

const program = new Command();

program
  .command('export <capture-id>')
  .description('Export a capture to Obsidian vault')
  .option('-v, --vault <path>', 'Vault path', process.env.OBSIDIAN_VAULT_PATH)
  .option('--retry <count>', 'Retry attempts', '3')
  .action(async (captureId: string, options) => {
    const vault_path = path.resolve(options.vault);
    const db = new Database('~/.adhd-brain/staging.db');
    const writer = new ObsidianAtomicWriter(vault_path, db);

    try {
      // Retrieve capture
      const capture = await db.getCapture(captureId);
      if (!capture) {
        console.error(`Capture not found: ${captureId}`);
        process.exit(1);
      }

      // Format markdown
      const content = formatMarkdownExport(capture);

      // Export with retry
      const result = await exportWithRetry(
        captureId,
        content,
        vault_path,
        parseInt(options.retry)
      );

      console.log(`✅ Exported to: ${result}`);
    } catch (error) {
      console.error(`❌ Export failed:`, error.message);
      process.exit(1);
    }
  });

program.parse();
```

### Real-World Usage: Batch Export Script

**Scenario:** Export all pending captures nightly.

```typescript
#!/usr/bin/env node
import { ObsidianAtomicWriter } from '@adhd-brain/obsidian-bridge';
import { Database } from '@adhd-brain/staging-ledger';

async function batchExportPending() {
  const vault_path = process.env.OBSIDIAN_VAULT_PATH;
  const db = new Database('~/.adhd-brain/staging.db');
  const writer = new ObsidianAtomicWriter(vault_path, db);

  // Query pending captures (transcribed but not exported)
  const pending = db.prepare(`
    SELECT id FROM captures
    WHERE status = 'transcribed'
    AND id NOT IN (SELECT capture_id FROM exports_audit)
    ORDER BY created_at ASC
  `).all();

  console.log(`Found ${pending.length} pending captures`);

  let exported = 0;
  let failed = 0;

  for (const { id } of pending) {
    try {
      const capture = await db.getCapture(id);
      const content = formatMarkdownExport(capture);
      const result = await writer.writeAtomic(id, content, vault_path);

      if (result.success) {
        exported++;
        console.log(`✅ Exported ${id}`);
      } else {
        failed++;
        console.error(`❌ Failed ${id}: ${result.error?.code}`);
      }
    } catch (error) {
      failed++;
      console.error(`❌ Exception ${id}:`, error.message);
    }
  }

  console.log(`\nBatch export complete:`);
  console.log(`  Exported: ${exported}`);
  console.log(`  Failed:   ${failed}`);
}

batchExportPending().catch(console.error);
```

## Related Documentation

### Primary Specifications
- **[PRD](../features/obsidian-bridge/prd-obsidian.md)** - Product requirements and user jobs-to-be-done
- **[Architecture Spec](../features/obsidian-bridge/spec-obsidian-arch.md)** - System design and failure modes
- **[Tech Spec](../features/obsidian-bridge/spec-obsidian-tech.md)** - Implementation details and contracts
- **[Test Spec](../features/obsidian-bridge/spec-obsidian-test.md)** - Testing patterns and coverage requirements

### Cross-Cutting Guides
- **[Error Recovery Guide](./guide-error-recovery.md)** - Retry orchestration patterns for transient failures
- **[Backup Verification Guide](./guide-backup-verification.md)** - Vault backup verification strategies
- **[Health Command Guide](./guide-health-command.md)** - Health check implementation for export validation
- **[Crash Matrix Test Plan](./guide-crash-matrix-test-plan.md)** - Crash simulation testing for atomic writes

### Related ADRs
- **[ADR-0001: Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md)** - File referencing patterns (applies to vault writes)

### Staging Ledger Integration
- **[Staging Ledger PRD](../features/staging-ledger/prd-staging.md)** - Audit trail contract and export status
- **[Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md)** - Database schema and foreign keys

## Maintenance Notes

### When to Update This Guide

**Update Required:**
- New error codes added to AtomicWriter contract
- Export path patterns change (e.g., PARA classification added in Phase 3+)
- Retry strategy changes (exponential backoff parameters)
- New troubleshooting scenarios discovered in production

**Update Triggers:**
- Export failure rate > 5% (indicates new error patterns)
- ULID collision detected in production (add diagnostic procedures)
- User reports vault corruption (refine troubleshooting steps)
- Phase 2+ features ship (multi-vault support, template-based filenames)

### Known Limitations

**Phase 1 Constraints:**
- Sequential exports only (no concurrency)
- Single vault support (no multi-vault configuration)
- ULID-only filenames (no custom templates)
- Inbox-only exports (no PARA classification)

**Future Enhancements (Phase 2+):**
- Concurrent export worker pool
- Retry backoff configuration
- Health monitoring integration
- Export performance metrics

### Migration Paths

**From Direct Filesystem Writes:**

If migrating from direct vault writes:

1. Replace `fs.writeFile()` with `AtomicWriter.writeAtomic()`
2. Add error handling for all 6 error codes (EACCES, ENOSPC, etc.)
3. Update audit trail to use `exports_audit` table
4. Test crash recovery (kill process mid-export, verify no partial writes)

**To Multi-Vault (Phase 3+):**

When multi-vault support ships:

1. Update vault path from string to configuration object
2. Add vault selection logic (default vault vs. specified vault)
3. Update audit trail with vault identifier
4. Test export path resolution across multiple vaults

---

**Document Version:** 1.0.0
**Last Updated:** 2025-09-28
**Reviewed By:** spec-librarian
**Next Review:** After Phase 1 implementation complete or 2026-01-01