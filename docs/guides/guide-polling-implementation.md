---
title: Polling Implementation Guide
status: approved
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
---

# Polling Implementation Guide

## Purpose

This guide helps developers implement sequential polling mechanisms for voice memo and email capture in the ADHD Brain system. It provides practical guidance for building CLI-triggered polling operations, managing sync state cursors, and implementing the orchestration layer that coordinates multiple capture channels without background services.

**Target Audience:** Backend developers implementing capture polling logic, CLI developers integrating polling commands, developers maintaining sequential processing constraints.

## When to Use This Guide

Use this guide when you need to:

- Implement voice memo polling from iCloud folder
- Implement Gmail API polling with history cursors
- Build CLI commands that trigger polling cycles
- Coordinate sequential processing across multiple channels
- Integrate polling logic into the capture package structure
- Debug polling failures or sync state corruption
- Implement optional continuous polling mode

**Related Features:** Capture package (`@capture-bridge/capture`), voice capture, email capture, CLI commands

**MPPP Constraints:** This guide enforces sequential processing only (no background workers, no concurrency, no separate apps/).

## Prerequisites

**Required Knowledge:**

- TypeScript/Node.js async/await patterns
- Monorepo package structure (4-package limit)
- Sequential processing constraints (no concurrency)
- SQLite database operations (sync_state table)
- File system polling patterns
- Gmail API history mechanism

**Required Tools:**

- Node.js v20+ with TypeScript
- Turborepo monorepo setup
- SQLite database with `sync_state` table
- `icloudctl` binary for voice polling (macOS)
- Gmail API credentials for email polling

**Required Setup:**

- Monorepo packages: `@capture-bridge/foundation`, `@capture-bridge/core`, `@capture-bridge/storage`, `@capture-bridge/capture`
- Environment variables: `VOICE_MEMOS_FOLDER`, `GMAIL_CREDENTIALS`, `DB_PATH`, `OBSIDIAN_VAULT`

## Quick Reference

**Key Commands:**

```bash
# Single poll cycles (CLI-triggered)
adhd capture voice           # Poll voice memos once
adhd capture email           # Poll email once
adhd capture poll --all      # Poll both sequentially

# Continuous mode (optional, single Node process)
adhd capture start --voice   # Start voice polling loop
adhd capture start --email   # Start email polling loop
adhd capture start --all     # Start both polling loops
adhd capture stop            # Stop all polling loops
```

**Package Structure:**

```
packages/@capture-bridge/capture/
├── src/
│   ├── pollers/
│   │   ├── voice-poller.ts          # Voice polling logic
│   │   ├── email-poller.ts          # Email polling logic
│   │   ├── polling-orchestrator.ts  # Sequential coordination
│   │   └── index.ts
│   ├── processors/
│   ├── exporters/
│   └── index.ts
```

**Core Principle:** Sequential processing only (semaphore=1), no background workers, all logic in capture package.

## Step-by-Step Instructions

### Step 1: Implement Voice Poller Class

**Goal:** Create single-cycle voice polling with iCloud file discovery

```typescript
// packages/@capture-bridge/capture/src/pollers/voice-poller.ts
import { CaptureItem } from "@capture-bridge/foundation"
import { DatabaseClient } from "@capture-bridge/storage"
import { DeduplicationService } from "@capture-bridge/core"

export interface VoicePollerConfig {
  folderPath: string // iCloud Voice Memos folder
  pollInterval?: number // Optional for continuous mode (default: 30s)
  sequential: true // MPPP constraint (no concurrency)
}

export class VoicePoller {
  constructor(
    private db: DatabaseClient,
    private dedup: DeduplicationService,
    private config: VoicePollerConfig
  ) {}

  /**
   * Single poll cycle (CLI-triggered)
   * Returns immediately after processing all new files
   */
  async pollOnce(): Promise<VoicePollResult> {
    const startTime = Date.now()
    const errors: Array<{ filePath: string; error: string }> = []

    // 1. Scan iCloud folder for .m4a files
    const files = await this.scanVoiceMemos()

    // 2. Process each file sequentially
    let filesProcessed = 0
    let duplicatesSkipped = 0

    for (const filePath of files) {
      try {
        // Check APFS dataless status
        await this.ensureFileDownloaded(filePath)

        // Compute fingerprint
        const fingerprint = await this.computeFingerprint(filePath)

        // Dedup check
        const isDupe = await this.dedup.isDuplicate({ audioFp: fingerprint })
        if (isDupe) {
          duplicatesSkipped++
          continue
        }

        // Stage capture
        await this.stageCapture(filePath, fingerprint)

        filesProcessed++
      } catch (error) {
        errors.push({ filePath, error: error.message })
      }
    }

    // 3. Update sync state
    await this.updateSyncState()

    return {
      filesFound: files.length,
      filesProcessed,
      duplicatesSkipped,
      errors,
      duration: Date.now() - startTime,
    }
  }

  private async scanVoiceMemos(): Promise<string[]> {
    const files = await fs.readdir(this.config.folderPath)
    return files
      .filter((f) => f.endsWith(".m4a"))
      .map((f) => path.join(this.config.folderPath, f))
      .sort() // Process oldest first
  }

  private async ensureFileDownloaded(filePath: string): Promise<void> {
    // Check if file is APFS dataless (iCloud placeholder)
    const status = await execAsync(`icloudctl check "${filePath}"`)

    if (status.includes("dataless")) {
      // Trigger download
      await execAsync(`icloudctl download "${filePath}"`)

      // Wait with backoff (max 30s)
      await this.waitForDownload(filePath)
    }
  }

  private async computeFingerprint(filePath: string): Promise<string> {
    // SHA-256 of first 4MB
    const buffer = await fs.readFile(filePath, {
      start: 0,
      end: 4 * 1024 * 1024,
    })
    return crypto.createHash("sha256").update(buffer).digest("hex")
  }
}
```

**Expected Output:**

```
✓ Processed 3 voice memos
  Duplicates skipped: 1
  Errors: 0
  Duration: 2.4s
```

### Step 2: Implement Email Poller Class

**Goal:** Create single-cycle email polling with Gmail history API

```typescript
// packages/@capture-bridge/capture/src/pollers/email-poller.ts
import { google } from "googleapis"
import { DatabaseClient } from "@capture-bridge/storage"
import { DeduplicationService } from "@capture-bridge/core"

export interface EmailPollerConfig {
  gmailCredentialsPath: string
  pollInterval?: number // Optional for continuous mode (default: 60s)
  sequential: true // MPPP constraint
}

export class EmailPoller {
  constructor(
    private db: DatabaseClient,
    private dedup: DeduplicationService,
    private config: EmailPollerConfig
  ) {}

  async pollOnce(): Promise<EmailPollResult> {
    const startTime = Date.now()
    const errors: Array<{ messageId: string; error: string }> = []

    // 1. Get current history cursor
    const cursor = await this.getCursor()

    // 2. Fetch new messages from Gmail API
    const gmail = google.gmail({ version: "v1", auth: this.oauth2Client })
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: cursor,
    })

    // 3. Extract message IDs
    const messageIds =
      history.data.history
        ?.flatMap((h) => h.messagesAdded || [])
        .map((ma) => ma.message!.id!)
        .filter(Boolean) || []

    // 4. Process each message sequentially
    let messagesProcessed = 0
    let duplicatesSkipped = 0

    for (const messageId of messageIds) {
      try {
        const message = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        })

        // Dedup check
        const isDupe = await this.dedup.isDuplicate({ messageId })
        if (isDupe) {
          duplicatesSkipped++
          continue
        }

        // Stage capture
        await this.stageCapture(message)

        messagesProcessed++
      } catch (error) {
        errors.push({ messageId, error: error.message })
      }
    }

    // 5. Update cursor
    const nextHistoryId = history.data.historyId!
    await this.updateCursor(nextHistoryId)

    return {
      messagesFound: messageIds.length,
      messagesProcessed,
      duplicatesSkipped,
      errors,
      duration: Date.now() - startTime,
    }
  }

  private async getCursor(): Promise<string> {
    const row = await this.db.get(
      `SELECT value FROM sync_state WHERE key = 'gmail_history_id'`
    )
    return row?.value || null
  }

  private async updateCursor(historyId: string): Promise<void> {
    await this.db.run(
      `UPDATE sync_state
       SET value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE key = 'gmail_history_id'`,
      [historyId]
    )
  }
}
```

### Step 3: Implement Polling Orchestrator

**Goal:** Coordinate sequential execution of multiple pollers

```typescript
// packages/@capture-bridge/capture/src/pollers/polling-orchestrator.ts
import { VoicePoller, EmailPoller } from "./index"
import { metricsCollector } from "@capture-bridge/foundation"

export class PollingOrchestrator {
  constructor(
    private voicePoller: VoicePoller,
    private emailPoller: EmailPoller
  ) {}

  /**
   * Run both pollers sequentially (voice → email)
   * CLI usage: `adhd capture poll --all`
   */
  async pollAll(): Promise<{ voice: VoicePollResult; email: EmailPollResult }> {
    const startTime = Date.now()

    // Sequential execution (MPPP requirement)
    const voiceResult = await this.voicePoller.pollOnce()
    const emailResult = await this.emailPoller.pollOnce()

    const duration = Date.now() - startTime

    // Emit metrics
    metricsCollector.duration("capture.poll_all.duration_ms", duration, {
      voice_files: voiceResult.filesProcessed,
      email_messages: emailResult.messagesProcessed,
    })

    return { voice: voiceResult, email: emailResult }
  }

  /**
   * Continuous polling mode (optional)
   * Simple Node process with setInterval()
   */
  async startContinuous(): Promise<void> {
    await this.voicePoller.startContinuous()
    await this.emailPoller.startContinuous()
  }

  async stop(): Promise<void> {
    await this.voicePoller.stop()
    await this.emailPoller.stop()
  }
}
```

### Step 4: Integrate with CLI Commands

**Goal:** Wire polling logic to CLI interface

```typescript
// packages/@capture-bridge/cli/src/commands/capture.ts
import {
  VoicePoller,
  EmailPoller,
  PollingOrchestrator,
} from "@capture-bridge/capture"
import { DatabaseClient } from "@capture-bridge/storage"
import { DeduplicationService } from "@capture-bridge/core"

export async function captureVoiceCommand() {
  const db = new DatabaseClient(process.env.DB_PATH)
  const dedup = new DeduplicationService(db)

  const voicePoller = new VoicePoller(db, dedup, {
    folderPath: process.env.VOICE_MEMOS_FOLDER,
    sequential: true,
  })

  const result = await voicePoller.pollOnce()

  console.log(`✓ Processed ${result.filesProcessed} voice memos`)
  console.log(`  Duplicates skipped: ${result.duplicatesSkipped}`)
  console.log(`  Errors: ${result.errors.length}`)
}

export async function captureEmailCommand() {
  const db = new DatabaseClient(process.env.DB_PATH)
  const dedup = new DeduplicationService(db)

  const emailPoller = new EmailPoller(db, dedup, {
    gmailCredentialsPath: process.env.GMAIL_CREDENTIALS,
    sequential: true,
  })

  const result = await emailPoller.pollOnce()

  console.log(`✓ Processed ${result.messagesProcessed} emails`)
  console.log(`  Duplicates skipped: ${result.duplicatesSkipped}`)
  console.log(`  Errors: ${result.errors.length}`)
}

export async function capturePollAllCommand() {
  const db = new DatabaseClient(process.env.DB_PATH)
  const dedup = new DeduplicationService(db)

  const orchestrator = new PollingOrchestrator(
    new VoicePoller(db, dedup, {
      folderPath: process.env.VOICE_MEMOS_FOLDER,
      sequential: true,
    }),
    new EmailPoller(db, dedup, {
      gmailCredentialsPath: process.env.GMAIL_CREDENTIALS,
      sequential: true,
    })
  )

  const { voice, email } = await orchestrator.pollAll()

  console.log(
    `✓ Voice: ${voice.filesProcessed} files, ${voice.duplicatesSkipped} dupes`
  )
  console.log(
    `✓ Email: ${email.messagesProcessed} messages, ${email.duplicatesSkipped} dupes`
  )
}
```

### Step 5: Implement Optional Continuous Mode

**Goal:** Add setInterval()-based continuous polling (optional feature)

```typescript
// Add to VoicePoller class
export class VoicePoller {
  private intervalId: NodeJS.Timeout | null = null

  async startContinuous(): Promise<void> {
    if (this.intervalId) return // Already running

    this.intervalId = setInterval(async () => {
      try {
        await this.pollOnce()
      } catch (error) {
        console.error("Poll cycle failed:", error)
      }
    }, this.config.pollInterval || 30000) // 30s default
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}
```

**CLI Usage:**

```bash
# Start continuous polling (runs until SIGTERM)
adhd capture start --voice

# In separate terminal, stop polling
adhd capture stop
```

## Common Patterns

### Pattern: Sync State Management

**Use Case:** Persist polling cursors for crash recovery

```typescript
export class SyncStateRepository {
  constructor(private db: DatabaseClient) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.query(
      "SELECT value FROM sync_state WHERE key = ?",
      [key]
    )
    return row?.value || null
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.query(
      "INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
      [key, value]
    )
  }
}

// Usage in poller
await syncState.set("last_voice_poll", new Date().toISOString())
await syncState.set("voice_last_file", "/path/to/last.m4a")
```

### Pattern: Sequential Processing Enforcement

**Use Case:** Prevent concurrent processing violations

```typescript
class TranscriptionQueue {
  private processing: boolean = false

  private async processNext(): Promise<void> {
    // Non-reentrant guard (prevents concurrency)
    if (this.processing) return

    if (this.queue.length === 0) return

    this.processing = true
    try {
      await this.transcribeJob(this.queue.shift()!)
    } finally {
      this.processing = false
      this.processNext() // Continue with next job
    }
  }
}
```

### Pattern: Direct Export (No Outbox)

**Use Case:** Synchronous vault writes without async queueing

```typescript
async function processVoiceFile(filePath: string): Promise<void> {
  // 1. Stage capture
  const captureId = await stageCapture({ filePath, source: "voice" })

  // 2. Transcribe
  const transcript = await transcribeAudio(filePath)

  // 3. Direct export (synchronous)
  await directExporter.export({
    captureId,
    content: transcript,
    vaultPath: `inbox/${captureId}.md`,
  })

  // 4. Update status
  await captureRepo.updateStatus(captureId, "exported")
}
```

### Anti-Pattern: Background Worker Processes

**Problem:** Violates MPPP 4-package limit and sequential processing constraint

```typescript
// ❌ WRONG: Separate worker package
import { VoicePoller } from "@capture-bridge/workers" // Package doesn't exist!

// ❌ WRONG: LaunchAgent/systemd background service
// No background daemons in MPPP!

// ✅ CORRECT: CLI-triggered polling in capture package
import { VoicePoller } from "@capture-bridge/capture"
await voicePoller.pollOnce() // Single cycle, exits
```

## Troubleshooting

### Error: iCloud File Not Downloaded

**Symptom:** Voice poller fails with "file not found" or "dataless" errors

**Cause:** APFS dataless placeholder not resolved

**Solution:**

```typescript
async function waitForDownload(
  filePath: string,
  maxWaitMs = 30000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const status = await execAsync(`icloudctl check "${filePath}"`)

    if (!status.includes("dataless")) {
      return // Download complete
    }

    // Exponential backoff
    const waitMs = Math.min(1000 * Math.pow(2, attempts), 5000)
    await sleep(waitMs)
  }

  throw new Error(`iCloud download timeout: ${filePath}`)
}
```

### Error: Gmail Cursor Corruption

**Symptom:** Email poller fails with 404 history not found

**Cause:** History ID older than retention window (~30 days)

**Solution:** Re-bootstrap cursor

```typescript
async function resetCursor(): Promise<void> {
  logger.warn("Resetting Gmail cursor due to invalid historyId")

  // Re-bootstrap
  const bootstrap = await gmailClient.bootstrap()

  // Update sync_state
  await db.run(
    `UPDATE sync_state SET value = ? WHERE key = 'gmail_history_id'`,
    [bootstrap.historyId]
  )

  // Log reset event
  await db.run(
    `INSERT OR REPLACE INTO sync_state (key, value)
     VALUES ('gmail_cursor_reset_at', ?)`,
    [new Date().toISOString()]
  )
}
```

### Error: Polling Loop Memory Leak

**Symptom:** Continuous mode consumes increasing memory over time

**Cause:** Missing cleanup in setInterval handler

**Solution:** Ensure proper cleanup

```typescript
async function startContinuous(): Promise<void> {
  this.intervalId = setInterval(async () => {
    try {
      await this.pollOnce()
    } catch (error) {
      console.error("Poll cycle failed:", error)
    } finally {
      // Force garbage collection hint
      if (global.gc) global.gc()
    }
  }, this.config.pollInterval)
}

async function stop(): Promise<void> {
  if (this.intervalId) {
    clearInterval(this.intervalId)
    this.intervalId = null

    // Flush pending operations
    await this.flushQueue()
  }
}
```

## Examples

### Example 1: Complete Voice Polling Flow

```typescript
import { VoicePoller } from "@capture-bridge/capture"
import { DatabaseClient } from "@capture-bridge/storage"
import { DeduplicationService } from "@capture-bridge/core"

async function runVoicePolling() {
  const db = new DatabaseClient("/Users/nathan/.capture-bridge/ledger.sqlite")
  const dedup = new DeduplicationService(db)

  const voicePoller = new VoicePoller(db, dedup, {
    folderPath:
      "/Users/nathan/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings",
    sequential: true,
  })

  console.log("Starting voice polling...")

  const result = await voicePoller.pollOnce()

  console.log(`✓ Scanned ${result.filesFound} files`)
  console.log(`✓ Processed ${result.filesProcessed} new files`)
  console.log(`✓ Skipped ${result.duplicatesSkipped} duplicates`)

  if (result.errors.length > 0) {
    console.error(`❌ ${result.errors.length} errors:`)
    result.errors.forEach((err) => {
      console.error(`  - ${err.filePath}: ${err.error}`)
    })
  }

  console.log(`Duration: ${result.duration}ms`)
}

runVoicePolling().catch(console.error)
```

### Example 2: Email Polling with Error Recovery

```typescript
import { EmailPoller } from "@capture-bridge/capture"

async function runEmailPollingWithRetry() {
  const emailPoller = new EmailPoller(db, dedup, {
    gmailCredentialsPath: "~/.config/capture-bridge/credentials.json",
    sequential: true,
  })

  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const result = await emailPoller.pollOnce()

      console.log(`✓ Processed ${result.messagesProcessed} emails`)
      return result
    } catch (error) {
      attempt++

      if (error.code === 404) {
        console.warn("Cursor invalid - re-bootstrapping...")
        await emailPoller.resetCursor()
        continue
      }

      if (error.code === 429) {
        const backoffMs = 1000 * Math.pow(2, attempt)
        console.warn(`Rate limited - backing off ${backoffMs}ms`)
        await sleep(backoffMs)
        continue
      }

      throw error // Non-retriable error
    }
  }

  throw new Error(`Email polling failed after ${maxRetries} attempts`)
}
```

## Related Documentation

**PRDs (Product Requirements):**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Section 11: Sequential Processing
- [Roadmap v2.0.0-MPPP](../master/roadmap.md) - Phase 1-2 scope
- [Capture Feature PRD](../features/capture/prd-capture.md) - Polling requirements
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Sync state table
- [CLI Feature PRD](../features/cli/prd-cli.md) - CLI polling commands

**Feature Specifications:**

- [Capture Architecture Spec](../features/capture/spec-capture-arch.md) - Capture design
- [Capture Tech Spec](../features/capture/spec-capture-tech.md) - Polling implementation
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Polling tests
- [Voice Capture Tech Spec](../features/capture/spec-capture-voice-tech.md) - Voice polling logic
- [Email Capture Tech Spec](../features/capture/spec-capture-email-tech.md) - Email polling logic
- [Polling Tech Spec](../features/capture/spec-capture-polling-tech.md) - Polling orchestration
- [Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md) - Sync state persistence
- [CLI Tech Spec](../features/cli/spec-cli-tech.md) - CLI integration

**Cross-Cutting Specifications:**

- [Foundation Monorepo Tech Spec](../cross-cutting/spec-foundation-monorepo-tech.md) - 4-package structure
- [Metrics Contract Tech Spec](../cross-cutting/spec-metrics-contract-tech.md) - Telemetry

**Guides (How-To):**

- [Gmail OAuth2 Setup Guide](./guide-gmail-oauth2-setup.md) - Email polling prerequisites
- [Whisper Transcription Guide](./guide-whisper-transcription.md) - Voice processing
- [Error Recovery Guide](./guide-error-recovery.md) - Polling error handling
- [Monorepo MPPP Guide](./guide-monorepo-mppp.md) - Package structure
- [Health Command Guide](./guide-health-command.md) - Polling health checks
- [Capture Debugging Guide](./guide-capture-debugging.md) - Polling troubleshooting

**ADRs (Architecture Decisions):**

- [ADR-0001: Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md) - Sequential processing rationale
- [ADR-0002: Dual Hash Migration](../adr/0002-dual-hash-migration.md) - Deduplication strategy

## Maintenance Notes

**When to Update:**

- Monorepo structure changes (4-package limit evolution)
- Sequential processing constraints change
- New capture channels added (SMS, Slack, etc.)
- icloudctl interface changes
- Gmail API version updates

**Known Limitations:**

- Sequential processing only (no concurrency in MPPP)
- CLI-triggered or simple setInterval (no systemd/PM2/LaunchAgent)
- Single user assumption (no multi-device coordination)
- No distributed locking (single-machine only)
- No queue persistence (in-memory only)

**Future Enhancements:**

- Concurrent processing (Phase 3+, when email volume > 100/day)
- Background worker orchestration (Phase 5+, multi-device)
- Queue persistence (BullMQ integration)
- Multi-device coordination (distributed locking)
- Health monitoring dashboard
