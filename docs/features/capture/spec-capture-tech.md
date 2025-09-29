---
title: Capture Ingestion Core Technical Specification
status: approved
owner: Nathan
version: 0.3.0
date: 2025-09-29
spec_type: tech
master_prd_version: 2.3.0-MPPP
roadmap_version: 3.0.0
---

# Capture Ingestion Core Spec v0.3.0

Source of Truth Alignment: Anchored to `docs/master/prd-master.md` (Master PRD v2.3.0-MPPP), ADR-0001 Voice File Sovereignty, and `docs/cross-cutting/spec-direct-export-tech.md` (Direct Export Pattern).

Related Guides:

- [Voice Capture Debugging Guide](../../guides/guide-voice-capture-debugging.md) for troubleshooting APFS dataless files, iCloud sync issues, transcription failures, and voice memo metadata extraction.
- [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md) for conceptual resilience patterns and strategies for all external services.

**MPPP Scope:** This spec covers capture ingestion through staging ledger. For export behavior (staging → Obsidian vault), see [Direct Export Pattern Tech Spec](../../cross-cutting/spec-direct-export-tech.md).

## 1. Executive Summary

This spec hardens the earliest segment of the capture pipeline: turning raw user input (voice memo reference, email) into a **durable, idempotent, queryable staging record** ready for export. It defines the canonical capture envelope, the ingestion state machine, SHA-256 hashing & dedup semantics, recovery guarantees, and minimal metrics. **Export to vault is handled by the Direct Export Pattern** (separate spec). It deliberately excludes higher-level classification, PARA intelligence, or plugin behaviors (YAGNI).

**Key Resilience Enhancements (v0.3.0):**

- **Gmail API:** Follows [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md#gmail-api) Section 2 - Rate limiting, exponential backoff, OAuth refresh strategies
- **iCloud Downloads:** Implements [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md#icloud-downloads) Section 3 - APFS-specific patterns, progressive timeouts, circuit breakers
- **Whisper Transcription:** Uses [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md#whisper-transcription) Section 4 - Cost controls, chunking strategies, caching patterns
- **ADHD-Friendly:** All operations follow [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md#adhd-considerations) Section 6 - Clear feedback, automatic recovery
- **Production-Ready:** All resilience patterns standardized per central guide

Goal: No user action should take >3s to become "safely staged" with zero chance of loss, and ingestion must be replay-safe after crashes.

## 2. Scope

In Scope:

- Canonical capture envelope (fields, invariants, evolution rules)
- SHA-256 hashing strategy + duplicate detection semantics
- Ingestion state machine (pre-export) and transitions (DISCOVERED → READY)
- Voice Memo referencing: path + fingerprints (no relocation) per ADR-0001
- File sovereignty & integrity checks (existence, size, SHA-256 fingerprint)
- Crash/restart recovery + idempotent replay of partially processed captures
- Local-only metrics (dev flag) & minimal logging taxonomy
- Performance and concurrency boundaries (sequential processing)
- TDD applicability matrix (P0 integrity focus)

Out of Scope (deferred / other specs):

- **Export to vault** (see Direct Export Pattern Tech Spec)
- PARA classification logic
- UI/Inbox triage surface
- Whisper transcription internals (separate guide)
- CLI command surface details (separate CLI core spec)
- Embeddings / semantic search / RAG (deferred Phase 5+)
- Plugin architecture / event hooks (deferred)

## 3. Problem Statement

The Master PRD establishes durability, idempotency, and a minimal staging ledger as foundational. What is still underspecified is the **precise shape and lifecycle** of an individual capture prior to export, how we represent external voice memo files safely (ADR-0001), and how we ensure SHA-256 hashing provides deterministic deduplication without compromising existing data or integrity guarantees.

## 4. Goals & Non-Goals

Goals:

1. Deterministic canonical envelope enabling future channel unification.
2. Idempotent ingestion across crashes, restarts, and partial writes.
3. Strong, fast hashing enabling early dedup without waiting for enrichment.
4. Explicit trigger conditions for future hash algorithm changes (deferred to Phase 2+).
5. Recovery model requiring **no manual intervention** under normal failures.
6. Voice memo references remain immutable (path + fingerprint only).

Non-Goals (YAGNI):

- Streaming transcript partial commits.
- Multi-node coordination (single-host assumption for v1).
- Fine-grained per-field schema migrations (use additive JSON metadata for evolution).

## 5. Architecture Overview (Delta)

MPPP SQLite tables: `captures`, `exports_audit`, `errors_log`, `sync_state` (4-table limit per Master PRD). This spec:

- Refines meaning of `captures.status` for pre-classification ingestion.
- Adds a channel-neutral `ingest_state` (virtual / derivable) clarifying transitions before a capture is eligible for export.
- Introduces a canonical envelope serialization for hashing.
- Defines recovery scanning order at startup.
- **Export behavior:** Direct synchronous export to `vault_root/inbox/ulid.md` per [Direct Export Pattern](../../cross-cutting/spec-direct-export-tech.md).

### 5.1 Canonical Capture Envelope

| Field                | Type        | Required    | Description                                            |
| -------------------- | ----------- | ----------- | ------------------------------------------------------ |
| id                   | ULID string | yes         | Time-sortable primary key                              |
| source_type          | enum        | yes         | `voice`, `text`, `web`, `email`                        |
| raw_content          | string      | conditional | Text body (empty for pre‑transcript voice)             |
| external_ref         | string      | conditional | Absolute file path (voice) or URL (web)                |
| external_fingerprint | string      | conditional | `sha256(first_N_bytes)` for voice (config default 4MB) |
| content_hash         | string      | yes         | SHA-256 hash of canonical serialization (see below)    |
| size_bytes           | integer     | conditional | For external asset (voice) at discovery time           |
| metadata             | JSON        | optional    | Channel-specific additive fields                       |
| ingest_state         | virtual     | yes         | Derived; see state machine                             |
| created_at           | datetime    | yes         | Insert timestamp                                       |
| capture_time         | datetime    | optional    | User-intended timestamp (if provided)                  |

Canonical serialization (ordered keys, UTF-8, newline-delimited):

```text
id:<id>
source_type:<source_type>
raw_content_sha256:<sha256(raw_content || '')>
external_ref:<external_ref || ''>
external_fingerprint:<external_fingerprint || ''>
size_bytes:<size_bytes || 0>
metadata_canonical_sha256:<sha256(stableJson(metadata || {}))>
version:1
```

`content_hash = sha256(serialization)`

Rationale: Small, stable, cheap to recompute; SHA-256 provides deterministic hashing with negligible collision probability for MPPP scope (< 1000 captures/year).

### 5.2 State Machine (Pre-Export, MPPP)

States (linear, minimal branching - **export happens outside this spec**):

1. DISCOVERED – Inserted into `captures` with provisional fields, hash computed.
2. VERIFIED – External reference (if any) exists & fingerprint acquired.
3. STAGED – Durable; safe to proceed to enrichment (voice) or direct export (email).
4. ENRICHING – (Voice only) Transcription pending.
5. READY – Content hash available; eligible for direct export.

Simplification vs earlier outline: `HASHED` folded into DISCOVERED (hash computed synchronously on insert). Transcription does not block STAGED—only ENRICHING if required. **Export to vault is handled by Direct Export Pattern** (see `spec-direct-export-tech.md`).

Transition Rules:

| From       | To        | Trigger                                                 | Failure Handling                                                                                                  |
| ---------- | --------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| DISCOVERED | VERIFIED  | External file stat / path resolution success            | Retry per [iCloud Downloads pattern](../../guides/guide-resilience-patterns.md#icloud-downloads) if dataless      |
| VERIFIED   | STAGED    | Fingerprint persisted (and size_bytes recorded)         | Mark quarantine if fingerprint mismatch on recheck                                                                |
| STAGED     | ENRICHING | Voice capture requires transcription                    | Timeout per [Whisper pattern](../../guides/guide-resilience-patterns.md#whisper-transcription) → revert to STAGED |
| ENRICHING  | READY     | Transcript captured (content_hash computed)             | Error handling per [Resilience Guide](../../guides/guide-resilience-patterns.md) fallback patterns                |
| STAGED     | READY     | Non-voice / no enrichment required (content_hash ready) | N/A                                                                                                               |
| READY      | (export)  | Direct export invoked (external to this spec)           | See [Direct Export Pattern](../../cross-cutting/spec-direct-export-tech.md) for error handling                    |

**Placeholder Export Immutability (MPPP):** When transcription fails and placeholder export occurs (`exported_placeholder` status), the placeholder markdown file is **immutable** in Phase 1. No retrofill mechanism exists to update placeholder exports with successful retries. This simplification ensures Phase 1 export idempotency remains deterministic.

**Trigger to Revisit:** If placeholder export ratio exceeds 5% rolling 7-day average (per Master PRD), implement retrofill append mechanism in Phase 2.

State Persistence Strategy: We do not add a new column; instead `captures.status` continues (`staged | transcribed | exported | exported_duplicate | exported_placeholder | error`). The finer-grain ingest_state is derived from metadata flags:

- `metadata.verification.ok` boolean
- `metadata.fingerprint.sha` (SHA-256)
- `metadata.enrichment.transcript.status`

Advantages: Avoids schema churn; easy additive evolution. **Note:** `exported*` states are set by Direct Export Pattern (external to this spec).

## 6. Hashing Strategy (SHA-256, MPPP)

**MPPP Decision:** SHA-256 for all content hashing and deduplication (per Master PRD v2.3.0-MPPP and ADR-0002).

**Hash Usage:**

1. **Content Hash:** SHA-256 of canonical envelope serialization (see §5.1)
2. **Voice Fingerprint:** SHA-256 of first 4MB of audio file (early dedup before transcription)
3. **Email Body:** SHA-256 of normalized text content (after HTML stripping)

**Collision & Integrity:** SHA-256 provides negligible collision probability for MPPP scope (< 1000 captures/year). Duplicate detection relies solely on `content_hash` uniqueness constraint in SQLite.

**Future Consideration (Phase 2+):** BLAKE3 migration deferred per ADR-0002 (faster parallel hashing for burst capture patterns). Trigger: Daily capture volume > 200 OR p95 hashing latency > 25ms.

## 7. Voice Memo Referencing (ADR-0001)

Policy Recap:

- Never move/rename Apple Voice Memo files.
- We reference canonical path within group container.
- We fingerprint only the first configurable N bytes (default 4MB) for speed + early dedup heuristics; full file integrity can be optionally validated async.
- iCloud dataless files trigger a download via Swift helper; ingestion remains in DISCOVERED until VERIFIED.

Integrity Measures:

- Re-verify size + partial fingerprint during recovery scan; mismatch → quarantine flag `metadata.integrity.quarantine=true`.

### 7.1 APFS Dataless File Detection & Handling

**Context:** macOS stores Voice Memos in iCloud-synced folders. Files may exist as "dataless" placeholders (`.icloud` files or files with NSURLIsUbiquitousItemKey flag) that download on-demand when accessed.

**Debugging Note:** For comprehensive troubleshooting of dataless file issues, download failures, and iCloud sync problems, see [Voice Capture Debugging Guide](../../guides/guide-voice-capture-debugging.md) Section 2 (APFS Dataless File Download Failures).

**Resilience Strategy:** This section follows the iCloud Downloads patterns from [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md) Section 3. The retry logic, timeouts, and circuit breakers follow the documented patterns for APFS-specific considerations and sequential download requirements.

**Detection Strategy:**

```typescript
import {
  ExponentialBackoff,
  CircuitBreaker,
  ProgressiveTimeout,
  TimeoutController,
  RetryOrchestrator,
  // Resilience components will be imported from appropriate packages
  // following the patterns documented in the Resilience Patterns Guide

interface APFSFileStatus {
  exists: boolean;
  isDataless: boolean;
  isDownloading: boolean;
  downloadProgress?: number; // 0-100
  downloadError?: string;
  fileSize?: number;
  lastError?: Date;
}

async function detectAPFSStatus(filePath: string): Promise<APFSFileStatus> {
  // Step 1: Check if file exists at all
  const exists = await fs.access(filePath).then(() => true).catch(() => false);
  if (!exists) {
    // Check for .icloud placeholder file
    const icloudPath = `${path.dirname(filePath)}/.${path.basename(filePath)}.icloud`;
    const hasPlaceholder = await fs.access(icloudPath).then(() => true).catch(() => false);

    return {
      exists: hasPlaceholder,
      isDataless: hasPlaceholder,
      isDownloading: false,
      downloadError: hasPlaceholder ? undefined : 'File not found'
    };
  }

  // Step 2: Check extended attributes for iCloud state
  const xattrs = await getExtendedAttributes(filePath);

  // Common iCloud extended attributes:
  // com.apple.metadata:com_apple_clouddocs_downloading - file is downloading
  // com.apple.metadata:kMDItemIsScreenCapture - not relevant for voice memos
  // com.apple.quarantine - security attribute, not iCloud related

  const isDownloading = xattrs.has('com.apple.metadata:com_apple_clouddocs_downloading');

  // Step 3: Stat the file to check size (dataless files report size 0 or small stub)
  const stats = await fs.stat(filePath);
  const isDataless = stats.size < 1024 && !isDownloading; // Less than 1KB likely dataless

  // Step 4: For definitive check, use NSFileManager via Swift helper
  const nsStatus = await icloudctl.checkFileStatus(filePath);

  return {
    exists: true,
    isDataless: nsStatus.isUbiquitousItem && !nsStatus.isDownloaded,
    isDownloading: nsStatus.isDownloading || isDownloading,
    downloadProgress: nsStatus.percentDownloaded,
    fileSize: stats.size,
    lastError: undefined
  };
}
```

**Handling Strategy:**

```typescript
enum DatalessHandlingStrategy {
  FORCE_DOWNLOAD = "force_download", // Trigger download and wait
  SKIP_RETRY_LATER = "skip_retry", // Skip this poll cycle
  QUEUE_BACKGROUND = "queue_background", // Queue for background download
  FAIL_FAST = "fail_fast", // Mark as error immediately
}

async function handleDatalessFile(
  filePath: string,
  strategy: DatalessHandlingStrategy = DatalessHandlingStrategy.FORCE_DOWNLOAD
): Promise<HandleResult> {
  const status = await detectAPFSStatus(filePath)

  if (!status.isDataless) {
    return { ready: true, path: filePath }
  }

  switch (strategy) {
    case DatalessHandlingStrategy.FORCE_DOWNLOAD:
      // Use icloudctl Swift helper to trigger download
      try {
        await icloudctl.startDownload(filePath, {
          // Timeout per Resilience Guide's iCloud patterns (Section 3)
          timeout: 60000, // Initial 60s from guide
          priority: "high",
        })

        // Apply APFS-specific backoff from [Resilience Guide](../../guides/guide-resilience-patterns.md#icloud-downloads)
        // Section 3: iCloud Downloads - APFS Considerations
        const apfsBackoffConfig = {
          // Pattern: 2s base, 2min cap, 1.5x multiplier, 20% jitter, 7 attempts
          // These values are documented in the Resilience Patterns Guide
          // Actual implementation uses production libraries per guide
        }

        return retryOrchestrator.execute(
          async (attempt) => {
            const currentStatus = await detectAPFSStatus(filePath)

            if (!currentStatus.isDataless && !currentStatus.isDownloading) {
              return { ready: true, path: filePath }
            }

            if (currentStatus.downloadError) {
              // Use ADHD-friendly error messages
              console.log(
                "Voice memo is taking longer than usual to download..."
              )
              throw new Error(`Download failed: ${currentStatus.downloadError}`)
            }

            // Progressive timeout from [Resilience Guide](../../guides/guide-resilience-patterns.md#progressive-timeouts)
            // Pattern: 30s → 45s → 67.5s → ... → 5min cap
            // Section 3.2: Progressive Timeouts for Downloads
            // Implementation follows guide's recommendations
          },
          {
            // Policy configuration per Resilience Patterns Guide
            onRetry: (attempt, error) => {
              console.log(
                `iCloud download attempt ${attempt}/7 failed: ${error.message}`
              )
            },
          }
        )

        throw new Error("Download timeout exceeded")
      } catch (error) {
        return {
          ready: false,
          path: filePath,
          error: error.message,
          // Retry delay per [Resilience Guide](../../guides/guide-resilience-patterns.md#retry-timing)
          retryAfter: new Date(Date.now() + 300000), // 5min from guide
        }
      }

    case DatalessHandlingStrategy.SKIP_RETRY_LATER:
      return {
        ready: false,
        path: filePath,
        skipped: true,
        // Poll cycle per [Resilience Guide](../../guides/guide-resilience-patterns.md#polling-intervals)
        retryAfter: new Date(Date.now() + 60000), // 1min poll from guide
      }

    case DatalessHandlingStrategy.QUEUE_BACKGROUND:
      await backgroundDownloadQueue.enqueue({
        filePath,
        priority: "low",
        captureId: null, // Not yet captured
      })

      return {
        ready: false,
        path: filePath,
        queued: true,
      }

    case DatalessHandlingStrategy.FAIL_FAST:
      throw new Error("File is dataless and immediate access required")
  }
}
```

**Swift Helper Integration (icloudctl):**

```typescript
interface ICloudController {
  // Check if file is managed by iCloud
  checkFileStatus(path: string): Promise<{
    exists: boolean
    isUbiquitousItem: boolean
    isDownloaded: boolean
    isDownloading: boolean
    hasUnresolvedConflicts: boolean
    percentDownloaded?: number
    downloadError?: string
  }>

  // Trigger download of dataless file
  startDownload(
    path: string,
    options?: {
      timeout?: number
      priority?: "high" | "normal" | "low"
    }
  ): Promise<void>

  // Force eviction (make dataless) - for testing
  evictFile(path: string): Promise<void>

  // Monitor download progress
  monitorDownload(
    path: string,
    callback: (progress: number) => void
  ): () => void
}

// Implementation wraps Swift binary
class ICloudControllerImpl implements ICloudController {
  private binaryPath = "/usr/local/bin/icloudctl" // Installed by setup

  async checkFileStatus(path: string) {
    const result = await execAsync(`${this.binaryPath} status "${path}"`)
    return JSON.parse(result.stdout)
  }

  async startDownload(path: string, options = {}) {
    const args = [
      "download",
      `"${path}"`,
      options.timeout ? `--timeout ${options.timeout}` : "",
      options.priority ? `--priority ${options.priority}` : "",
    ]
      .filter(Boolean)
      .join(" ")

    await execAsync(`${this.binaryPath} ${args}`)
  }
}
```

**Error Recovery Matrix (Per [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md)):**

| Error Condition       | Detection Method         | Recovery Action                         | Retry Strategy                                                                        |
| --------------------- | ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------- |
| File not found        | ENOENT                   | Check for .icloud placeholder           | See [Guide Section 3.1](../../guides/guide-resilience-patterns.md#file-not-found)     |
| Dataless file         | Size < 1KB + xattr check | Force download via icloudctl            | [APFS Pattern](../../guides/guide-resilience-patterns.md#apfs-specific)               |
| Download in progress  | xattr or NSFileManager   | Wait with progressive timeout           | [Progressive Timeout](../../guides/guide-resilience-patterns.md#progressive-timeouts) |
| Download failed       | icloudctl error          | Log ADHD-friendly error, mark for retry | [Circuit Breaker](../../guides/guide-resilience-patterns.md#circuit-breakers)         |
| Network offline       | NSURLErrorDomain -1009   | Skip this poll cycle                    | [Network Resilience](../../guides/guide-resilience-patterns.md#network-errors)        |
| iCloud quota exceeded | NSFileManager error      | Alert user, export placeholder          | [User Action Required](../../guides/guide-resilience-patterns.md#user-actions)        |
| File corrupted        | SHA-256 mismatch         | Quarantine file                         | [Data Integrity](../../guides/guide-resilience-patterns.md#integrity-checks)          |
| Authentication issues | NSURLErrorDomain -1012   | Alert user for sign-in                  | [Auth Patterns](../../guides/guide-resilience-patterns.md#authentication)             |

**Sequential Download Enforcement:**

```typescript
class VoiceFileDownloader {
  private downloadSemaphore = new Semaphore(1) // Only 1 concurrent download
  private activeDownload?: string

  // Circuit breaker for iCloud service (per Resilience Patterns Guide)
  private circuitBreaker = new CircuitBreaker({
    name: "icloud-downloads",
    errorThreshold: 10, // Higher threshold for network issues
    successThreshold: 3, // Require more successes to close
    timeout: 300000, // 5 minute timeout for downloads
    resetTimeout: 60000, // Try again after 1 minute
    volumeThreshold: 5, // Minimum requests before evaluation

    // Don't open on timeouts (common for large files)
    isFailure: (error: any) => {
      if (error.message?.includes("timeout")) return false
      if (error.message?.includes("NSURLErrorDomain -1009")) return true
      if (error.message?.includes("NSURLErrorDomain -1012")) return true
      return false
    },
  })

  // Progressive timeout controller (per resilience guide)
  private timeoutController = new ProgressiveTimeout({
    initialTimeout: 30000, // 30 seconds first attempt
    maxTimeout: 300000, // 5 minutes maximum
    progressionFactor: 1.5, // Increase by 50% each retry

    calculateTimeout: (attempt: number, context?: { fileSize?: number }) => {
      const baseTimeout = 30000 * Math.pow(1.5, attempt - 1)
      if (context?.fileSize) {
        // Add 10 seconds per MB
        const sizeBonus = (context.fileSize / 1_000_000) * 10000
        return Math.min(baseTimeout + sizeBonus, 300000)
      }
      return Math.min(baseTimeout, 300000)
    },
  })

  async downloadIfNeeded(filePath: string): Promise<DownloadResult> {
    // Check circuit breaker first (per resilience guide)
    if (this.circuitBreaker.getState() === BreakerState.OPEN) {
      console.log(
        "iCloud downloads temporarily paused. Will retry in 1 minute."
      )
      throw new Error("iCloud circuit breaker is open")
    }

    // Enforce sequential downloads to prevent ubd daemon overload
    const release = await this.downloadSemaphore.acquire()

    try {
      this.activeDownload = filePath

      const status = await detectAPFSStatus(filePath)
      if (!status.isDataless) {
        return { success: true, alreadyDownloaded: true }
      }

      // Execute with circuit breaker and resilience stack
      const result = await this.circuitBreaker.execute(async () => {
        const fileSize = status.fileSize || 0
        const timeout = this.timeoutController.calculateTimeout(1, { fileSize })

        return await withTimeout(
          handleDatalessFile(filePath, DatalessHandlingStrategy.FORCE_DOWNLOAD),
          timeout
        )
      })

      if (!result.ready) {
        // Use ADHD-friendly error message
        console.log("Voice memo is taking longer than usual to download...")
        await logError(
          null,
          "voice_download",
          `Failed to download: ${result.error}`
        )
        return { success: false, error: result.error }
      }

      return { success: true, downloadedBytes: result.fileSize }
    } finally {
      this.activeDownload = undefined
      release()
    }
  }

  getStatus(): DownloaderStatus {
    return {
      isDownloading: !!this.activeDownload,
      currentFile: this.activeDownload,
      queueDepth: this.downloadSemaphore.waitingCount,
    }
  }
}
```

**Integration with Voice Polling:**

```typescript
async function pollVoiceFolder(): Promise<PollResult> {
  const voicePath =
    "~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/"
  const files = await glob(`${voicePath}/*.m4a`)

  const results = []

  for (const filePath of files) {
    try {
      // Step 1: Check if already processed
      const fingerprint = await computePartialFingerprint(filePath)
      if (await isDuplicate(fingerprint)) {
        continue
      }

      // Step 2: Check APFS status
      const apfsStatus = await detectAPFSStatus(filePath)

      if (apfsStatus.isDataless) {
        // Step 3: Handle dataless file
        const downloadResult = await voiceDownloader.downloadIfNeeded(filePath)

        if (!downloadResult.success) {
          // Record error but continue with other files
          results.push({
            path: filePath,
            status: "download_failed",
            error: downloadResult.error,
          })
          continue
        }
      }

      // Step 4: Proceed with normal capture flow
      const captureId = await stageVoiceCapture(filePath, fingerprint)
      results.push({
        path: filePath,
        status: "staged",
        captureId,
      })
    } catch (error) {
      logger.error("Voice polling error", { filePath, error })
      results.push({
        path: filePath,
        status: "error",
        error: error.message,
      })
    }
  }

  return {
    filesProcessed: results.length,
    staged: results.filter((r) => r.status === "staged").length,
    downloadsFailed: results.filter((r) => r.status === "download_failed")
      .length,
    errors: results.filter((r) => r.status === "error").length,
  }
}
```

### 7.2 Voice Memo File Metadata & Naming Patterns

**Debugging Note:** For diagnostic commands, file inspection techniques, and metadata troubleshooting, see [Voice Capture Debugging Guide](../../guides/guide-voice-capture-debugging.md) Section 1 (Quick Diagnostic Commands) and Section 4 (Voice Memo File Metadata).

**Voice Memo File Locations:**

```typescript
const VOICE_MEMO_PATHS = {
  // Primary location for Voice Memos.app recordings
  primary:
    "~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/",

  // Legacy location (pre-macOS 10.15)
  legacy: "~/Library/Application Support/com.apple.voicememos/Recordings/",

  // Temporary processing location
  temp: "/var/folders/.../com.apple.VoiceMemos.tmp/",

  // Database containing metadata
  database:
    "~/Library/Group Containers/group.com.apple.VoiceMemos.shared/CloudRecordings.db",
}
```

**File Naming Patterns:**

```typescript
interface VoiceMemoFilePattern {
  // Standard patterns observed in Voice Memos.app
  patterns: {
    // Format: YYYYMMDD HHMMSS.m4a (e.g., "20250927 143022.m4a")
    dateTime: /^\d{8} \d{6}\.m4a$/,

    // Format: Recording.m4a (unnamed recordings)
    unnamed: /^Recording\.m4a$/,

    // Format: Recording N.m4a (e.g., "Recording 2.m4a")
    unnamedNumbered: /^Recording \d+\.m4a$/,

    // Format: Custom Name.m4a (user-renamed)
    custom: /^.+\.m4a$/,

    // Format: UUID-based (synced from iOS)
    uuid: /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\.m4a$/i
  };
}

function parseVoiceMemoFilename(filename: string): VoiceMemoMetadata {
  // Extract metadata from filename
  const dateTimeMatch = filename.match(/^(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})(\d{2})\.m4a$/);

  if (dateTimeMatch) {
    const [, year, month, day, hour, minute, second] = dateTimeMatch;
    return {
      type: 'datetime',
      recordedAt: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`),
      originalName: filename,
      isRenamed: false
    };
  }

  if (filename.match(/^Recording( \d+)?\.m4a$/)) {
    return {
      type: 'unnamed',
      recordedAt: null, // Must get from file stats or metadata
      originalName: filename,
      isRenamed: false
    };
  }

  return {
    type: 'custom',
    recordedAt: null,
    originalName: filename,
    isRenamed: true
  };
}
```

**Audio Format Metadata Extraction:**

```typescript
interface AudioMetadata {
  duration: number // seconds
  bitrate: number // kbps
  sampleRate: number // Hz (typically 44100)
  channels: number // 1 (mono) or 2 (stereo)
  codec: string // 'aac', 'alac', etc.
  fileSize: number // bytes
  creationDate: Date
  modificationDate: Date
  device?: string // Recording device if available
  location?: {
    // GPS if location services enabled
    latitude: number
    longitude: number
  }
}

async function extractAudioMetadata(filePath: string): Promise<AudioMetadata> {
  // Use ffprobe for reliable metadata extraction
  const ffprobeCmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
  const result = await execAsync(ffprobeCmd)
  const metadata = JSON.parse(result.stdout)

  // Extract core audio properties
  const audioStream = metadata.streams.find((s) => s.codec_type === "audio")
  const format = metadata.format

  // Get file system metadata
  const stats = await fs.stat(filePath)

  // Try to extract device info from tags
  const device =
    format.tags?.["com.apple.recording.device"] ||
    format.tags?.["encoder"] ||
    undefined

  return {
    duration: parseFloat(format.duration),
    bitrate: parseInt(format.bit_rate) / 1000,
    sampleRate: parseInt(audioStream.sample_rate),
    channels: audioStream.channels,
    codec: audioStream.codec_name,
    fileSize: stats.size,
    creationDate: new Date(stats.birthtime),
    modificationDate: new Date(stats.mtime),
    device,
    location: extractGPSFromTags(format.tags),
  }
}
```

**Handling Edited/Trimmed Voice Memos:**

```typescript
interface EditDetection {
  isEdited: boolean
  editType?: "trimmed" | "enhanced" | "merged"
  originalDuration?: number
  editedDuration?: number
  editTimestamp?: Date
}

async function detectVoiceMemoEdits(filePath: string): Promise<EditDetection> {
  const metadata = await extractAudioMetadata(filePath)
  const stats = await fs.stat(filePath)

  // Heuristics for detecting edits:

  // 1. Creation date significantly different from modification date
  const timeDiff = stats.mtime.getTime() - stats.birthtime.getTime()
  const significantEdit = timeDiff > 60000 // More than 1 minute difference

  // 2. Check for edit markers in metadata
  const ffprobeResult = await execAsync(`ffprobe -show_format "${filePath}"`)
  const hasEditMarkers = ffprobeResult.stdout.includes("com.apple.voice.edits")

  // 3. Check for non-standard encoder tags (Voice Memos uses specific encoder)
  const nonStandardEncoder =
    metadata.device && !metadata.device.includes("com.apple.VoiceMemos")

  if (!significantEdit && !hasEditMarkers && !nonStandardEncoder) {
    return { isEdited: false }
  }

  // Determine edit type
  let editType: EditDetection["editType"] = "trimmed" // Default assumption

  if (hasEditMarkers) {
    // Parse edit markers for specific type
    if (ffprobeResult.stdout.includes("trim")) editType = "trimmed"
    if (ffprobeResult.stdout.includes("enhance")) editType = "enhanced"
    if (ffprobeResult.stdout.includes("merge")) editType = "merged"
  }

  return {
    isEdited: true,
    editType,
    editedDuration: metadata.duration,
    editTimestamp: stats.mtime,
  }
}
```

**Collision Handling for Voice Memo Names:**

```typescript
class VoiceMemoNameResolver {
  private processedNames = new Set<string>()

  async resolveUniqueName(originalPath: string): Promise<string> {
    const basename = path.basename(originalPath, ".m4a")
    const dir = path.dirname(originalPath)

    // If name is unique, use it
    if (!this.processedNames.has(basename)) {
      this.processedNames.add(basename)
      return originalPath
    }

    // Generate unique suffix
    let counter = 1
    let uniqueName: string

    do {
      uniqueName = `${basename} (${counter})`
      counter++
    } while (this.processedNames.has(uniqueName))

    this.processedNames.add(uniqueName)
    return path.join(dir, `${uniqueName}.m4a`)
  }

  async generateCaptureId(
    filePath: string,
    metadata: AudioMetadata
  ): Promise<string> {
    // Use ULID for time-sortable unique IDs
    const ulid = generateULID()

    // Store mapping for collision detection
    await db.run(
      `INSERT INTO capture_name_map (capture_id, original_path, resolved_name, created_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [ulid, filePath, ulid]
    )

    return ulid
  }
}
```

### 7.3 iOS Device Sync Detection

**Detecting Voice Memos from iOS Devices:**

```typescript
interface IOSSyncDetection {
  isFromIOS: boolean
  deviceName?: string
  deviceModel?: string
  syncedAt?: Date
  originalRecordingDate?: Date
}

async function detectIOSSync(filePath: string): Promise<IOSSyncDetection> {
  // Check for iOS-specific patterns

  // 1. UUID-based filenames are typically from iOS
  const filename = path.basename(filePath)
  const isUUID =
    /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\.m4a$/i.test(
      filename
    )

  // 2. Check metadata for iOS device markers
  const metadata = await extractAudioMetadata(filePath)
  const isIOSDevice =
    metadata.device?.includes("iPhone") ||
    metadata.device?.includes("iPad") ||
    metadata.device?.includes("iOS")

  // 3. Check CloudRecordings.db for sync metadata (if accessible)
  let syncMetadata: any = null
  try {
    const dbPath = expandPath(
      "~/Library/Group Containers/group.com.apple.VoiceMemos.shared/CloudRecordings.db"
    )
    const db = await sqlite3.open(dbPath, { readonly: true })

    syncMetadata = await db.get(
      `SELECT * FROM recordings WHERE file_path LIKE ?`,
      [`%${filename}`]
    )

    await db.close()
  } catch (error) {
    // Database might not be accessible or recording not found
    logger.debug("CloudRecordings.db not accessible", { error })
  }

  if (!isUUID && !isIOSDevice && !syncMetadata) {
    return { isFromIOS: false }
  }

  return {
    isFromIOS: true,
    deviceName: syncMetadata?.device_name || metadata.device,
    deviceModel: syncMetadata?.device_model,
    syncedAt: syncMetadata?.synced_at
      ? new Date(syncMetadata.synced_at)
      : undefined,
    originalRecordingDate: syncMetadata?.recorded_at
      ? new Date(syncMetadata.recorded_at)
      : metadata.creationDate,
  }
}
```

### 7.4 Privacy & Security Considerations

**Metadata Sanitization:**

```typescript
class VoiceMemoPrivacyFilter {
  private sensitivePatterns = [
    /\b\d{3}-\d{3}-\d{4}\b/g, // Phone numbers
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  ]

  sanitizeForLogging(metadata: AudioMetadata): SafeMetadata {
    // Never log GPS coordinates
    const { location, ...safeMetadata } = metadata

    // Hash device identifiers
    if (safeMetadata.device) {
      safeMetadata.device = sha256(safeMetadata.device).substring(0, 8)
    }

    return safeMetadata
  }

  sanitizeFilePath(filePath: string): string {
    // Replace username in path
    return filePath.replace(/\/Users\/[^\/]+/, "/Users/***")
  }

  shouldRedactTranscript(transcript: string): boolean {
    // Check for sensitive patterns
    return this.sensitivePatterns.some((pattern) => pattern.test(transcript))
  }
}
```

### 7.5 Performance Optimizations for Large Libraries

**Incremental Scanning with Checkpoint:**

```typescript
class VoiceMemoScanner {
  private lastScanCheckpoint?: Date
  private processedFingerprints = new LRUCache<string, boolean>(10000)

  async scanIncrementally(): Promise<ScanResult> {
    // Load checkpoint from sync_state
    const checkpoint = await this.loadCheckpoint()

    // Get only files modified since last scan
    const files = await this.getModifiedFiles(checkpoint)

    // Process in batches to avoid memory overload
    const batchSize = 50
    const results = []

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map((file) => this.processFile(file))
      )
      results.push(...batchResults)

      // Update checkpoint after each batch
      await this.saveCheckpoint(new Date())

      // Yield to event loop
      await new Promise((resolve) => setImmediate(resolve))
    }

    return {
      filesScanned: files.length,
      newCaptures: results.filter((r) => r.status === "new").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      errors: results.filter((r) => r.status === "error").length,
    }
  }

  private async getModifiedFiles(since: Date): Promise<string[]> {
    const voicePath = expandPath(VOICE_MEMO_PATHS.primary)

    // Use find command for efficient filtering
    const cmd = `find "${voicePath}" -name "*.m4a" -newermt "${since.toISOString()}" -type f`
    const result = await execAsync(cmd)

    return result.stdout.split("\n").filter(Boolean)
  }

  private async processFile(filePath: string): Promise<ProcessResult> {
    // Quick fingerprint check using LRU cache
    const fingerprint = await this.computeQuickFingerprint(filePath)

    if (this.processedFingerprints.get(fingerprint)) {
      return { status: "duplicate", path: filePath }
    }

    // Process new file
    this.processedFingerprints.set(fingerprint, true)
    return { status: "new", path: filePath }
  }

  private async computeQuickFingerprint(filePath: string): Promise<string> {
    // Use first 512KB for quick fingerprint (faster than 4MB)
    const buffer = Buffer.alloc(524288) // 512KB
    const fd = await fs.open(filePath, "r")

    try {
      await fd.read(buffer, 0, buffer.length, 0)
      return sha256(buffer)
    } finally {
      await fd.close()
    }
  }
}
```

## 8. Whisper Transcription Resilience

**Note:** This section implements patterns from [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md#whisper-transcription) Section 4. All retry logic, timeouts, and cost controls follow the standardized patterns.

### 8.1 Transcription Service Configuration

```typescript
import {
  ExponentialBackoff,
  CircuitBreaker,
  // Resilience components following patterns from the guide

class ResilientWhisperClient {
  // Cost control settings
  private costLimit = 10.00;  // $10 daily limit
  private dailyCost = 0;

  // Whisper-specific retry configuration (per resilience guide)
  private whisperBackoff = new ExponentialBackoff({
    baseDelay: 2000,         // Start with 2 seconds
    maxDelay: 32000,         // Cap at 32 seconds
    multiplier: 2,           // Standard doubling
    jitter: true,
    jitterFactor: 0.1,       // Minimal jitter
    maxAttempts: 3           // Transcription is expensive, limit retries
  });

  // Circuit breaker for Whisper API (per resilience guide)
  private circuitBreaker = new CircuitBreaker({
    name: 'whisper-api',
    errorThreshold: 3,           // Open quickly to save costs
    successThreshold: 1,          // Close on first success
    timeout: 300000,              // 5 minute max timeout
    resetTimeout: 60000,          // Try again after 1 minute
    volumeThreshold: 3,

    isFailure: (error: any) => {
      // Don't count rate limits as circuit failures
      if (error.status === 429) return false;
      // Count server errors
      if (error.status >= 500) return true;
      // Count auth errors
      if (error.status === 401) return true;
      return false;
    }
  });

  // Dynamic timeout per [Resilience Guide](../../guides/guide-resilience-patterns.md#whisper-timeouts)
  // Pattern: Base 30s + 3s/MB (Section 4.2: Timeout Calculation)
  private whisperTimeoutConfig = {
    // Configuration follows guide's Whisper-specific recommendations
      const perMbTimeout = 3000;
      const calculated = baseTimeout + (fileSize / 1_000_000) * perMbTimeout;

      // Cap at 5 minutes
      return Math.min(calculated, 300000);
    }
  });

  async transcribeWithCostControl(audioPath: string): Promise<TranscriptionResult> {
    const fileStats = await fs.stat(audioPath);
    const duration = await this.getAudioDuration(audioPath);
    const estimatedCost = (duration / 60) * 0.006;

    // Check cost limit
    if (this.dailyCost + estimatedCost > this.costLimit) {
      console.log('Daily transcription budget reached. Will resume tomorrow.');
      throw new AbortError('Daily transcription cost limit reached');
    }

    // Check circuit breaker
    if (this.circuitBreaker.getState() === BreakerState.OPEN) {
      console.log('Transcription service temporarily unavailable. Retrying in 1 minute.');
      throw new Error('Whisper circuit breaker is open');
    }

    try {
      const result = await this.circuitBreaker.execute(async () => {
        return this.retryOrchestrator.execute(
          async (attempt) => {
            // Timeout calculation per [Resilience Guide](../../guides/guide-resilience-patterns.md#whisper-timeouts)

            try {
              return await withTimeout(
                this.callWhisperAPI(audioPath),
                timeout
              );
            } catch (error) {
              if (error.status === 429) {
                // Rate limited - aggressive backoff
                const delay = this.whisperBackoff.calculateDelay(attempt) * 2;
                console.log(`Transcription service is busy. Waiting before retry...`);
                await sleep(delay);
                throw error;
              }

              if (error.message?.includes('timeout')) {
                console.log(`Transcription is taking longer than expected for this file...`);
                // Try with reduced quality on retry
                if (attempt === 2) {
                  return this.callWhisperAPI(audioPath, { model: 'base' });
                }
                throw error;
              }

              throw error;
            }
          },
          {
            policy: this.whisperBackoff,
            maxAttempts: 3,
            onRetry: (attempt, error) => {
              console.log(`Transcription attempt ${attempt}/3 failed: ${error.message}`);
            }
          }
        );
      });

      this.dailyCost += estimatedCost;
      return result;
    } catch (error) {
      // Don't count failed transcriptions against cost
      throw error;
    }
  }
}
```

### 8.2 File Chunking for Large Audio Files

```typescript
// Chunking configuration for files over 25MB (per resilience guide)
const whisperChunkConfig = {
  maxChunkSize: 24 * 1024 * 1024, // 24MB (1MB buffer for safety)
  overlapDuration: 15, // 15 seconds overlap
  targetBitrate: "32k", // Reduce size if needed
}

class WhisperChunker {
  async chunkLargeFile(audioPath: string): Promise<string[]> {
    const fileSize = (await fs.stat(audioPath)).size

    if (fileSize <= whisperChunkConfig.maxChunkSize) {
      return [audioPath] // No chunking needed
    }

    console.log(
      "Audio file exceeds 25MB limit. Splitting into smaller chunks..."
    )

    // Calculate chunk duration based on file size and bitrate
    const duration = await this.getAudioDuration(audioPath)
    const chunksNeeded = Math.ceil(fileSize / whisperChunkConfig.maxChunkSize)
    const chunkDuration = duration / chunksNeeded

    const chunks: string[] = []
    for (let i = 0; i < chunksNeeded; i++) {
      const start =
        i * chunkDuration - (i > 0 ? whisperChunkConfig.overlapDuration : 0)
      const outputPath = `${audioPath}.chunk${i}.mp3`

      // Use ffmpeg to create chunk with overlap
      await this.createChunk(
        audioPath,
        outputPath,
        start,
        chunkDuration + whisperChunkConfig.overlapDuration
      )
      chunks.push(outputPath)
    }

    return chunks
  }
}
```

### 8.3 Transcription Caching Strategy

```typescript
class WhisperCache {
  private cache = new Map<string, { transcript: string; timestamp: number }>()
  private maxCacheAge = 7 * 24 * 60 * 60 * 1000 // 7 days

  async getOrTranscribe(
    audioPath: string,
    fingerprint: string
  ): Promise<string> {
    // Check cache first
    const cached = this.cache.get(fingerprint)
    if (cached && Date.now() - cached.timestamp < this.maxCacheAge) {
      console.log("Using cached transcription")
      return cached.transcript
    }

    // Transcribe with cost control
    const transcript =
      await this.whisperClient.transcribeWithCostControl(audioPath)

    // Cache the result
    this.cache.set(fingerprint, {
      transcript,
      timestamp: Date.now(),
    })

    return transcript
  }
}
```

## 9. Gmail API Resilience

**Note:** This section implements patterns from [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md#gmail-api) Section 2. All rate limiting, OAuth refresh, and retry strategies follow the standardized patterns.

### 9.1 Gmail Service Configuration

```typescript
import {
  ExponentialBackoff,
  CircuitBreaker,
  RetryOrchestrator,
  // Resilience components following patterns from the guide

class ResilientGmailClient {
  // Gmail backoff per [Resilience Guide](../../guides/guide-resilience-patterns.md#gmail-backoff)
  // Pattern: 1s base, 64s cap, 30% jitter (Section 2.1: Rate Limiting)
  private gmailBackoffConfig = {
    // Configuration follows guide's Gmail-specific recommendations
    multiplier: 2,          // Double each time
    jitter: true,           // Critical for Gmail
    jitterFactor: 0.3,      // 30% randomization (researched optimal)
    maxAttempts: 5
  });

  // Conservative rate limiter (80% of theoretical limit)
  private rateLimiter = {
    maxRequestsPerSecond: 80,  // Conservative vs 250 theoretical
    burstCapacity: 10,         // Allow small bursts
    refillRate: 80              // Tokens per second
  };

  // Circuit breaker per [Resilience Guide](../../guides/guide-resilience-patterns.md#gmail-circuit-breaker)
  // Pattern: 5 failures, 60s reset (Section 2.3: Circuit Breakers)
  private circuitBreakerConfig = {
    // Configuration follows guide's Gmail-specific thresholds
    successThreshold: 2,          // Close after 2 successes
    timeout: 5000,                // 5 second operation timeout
    resetTimeout: 30000,          // Try half-open after 30 seconds
    volumeThreshold: 10,          // Minimum 10 requests before evaluating

    // Custom error evaluation
    isFailure: (error: any) => {
      // Don't count rate limits as circuit failures
      if (error.code === 429) return false;
      // Count auth errors as failures
      if (error.code === 401) return true;
      // Count network errors as failures
      if (error.code >= 500) return true;
      return false;
    }
  });

  // Error classifier for Gmail-specific patterns
  private errorClassifier = new ErrorClassifier();

  constructor() {
    // Setup Gmail-specific error patterns
    this.errorClassifier.addRule(/429|rateLimitExceeded/i, ErrorCategory.RATE_LIMITED);
    this.errorClassifier.addRule(/401|invalid_grant/i, ErrorCategory.AUTH_FAILED);
    this.errorClassifier.addRule(/403|quotaExceeded/i, ErrorCategory.QUOTA_EXCEEDED);
    this.errorClassifier.addRule(/503|backendError/i, ErrorCategory.TRANSIENT);
    this.errorClassifier.addRule(/500|internalError/i, ErrorCategory.TRANSIENT);
  }

  async pollMessages(): Promise<GmailMessage[]> {
    // Check circuit breaker first
    if (this.circuitBreaker.getState() === BreakerState.OPEN) {
      console.log('Gmail is temporarily unavailable. Email captures paused for 30 seconds.');
      throw new Error('Gmail circuit breaker is open');
    }

    // Apply rate limiting
    await this.rateLimiter.acquire();

    // Execute with full resilience stack
    return this.circuitBreaker.execute(async () => {
      return this.retryOrchestrator.execute(
        async (attempt) => {
          try {
            const response = await gmail.users.messages.list({
              userId: 'me',
              maxResults: 50  // Batch to reduce API calls
            });
            return response.data.messages || [];
          } catch (error) {
            const classification = this.errorClassifier.classify(error);

            // Handle different error types with ADHD-friendly messages
            switch (classification.category) {
              case ErrorCategory.RATE_LIMITED:
                console.log('Gmail is temporarily busy. Waiting a moment before trying again...');
                const delay = this.gmailBackoff.calculateDelay(attempt);
                await sleep(delay);
                throw error;  // Will be retried

              case ErrorCategory.AUTH_FAILED:
                console.log('Gmail connection needs to be re-authorized. Please check your credentials.');
                await this.refreshAuth();
                throw error;  // Retry with new token

              case ErrorCategory.QUOTA_EXCEEDED:
                console.log('Daily Gmail limit reached. Captures will resume tomorrow.');
                throw new AbortError('Daily quota exceeded');

              default:
                console.log('Temporary Gmail issue. Retrying automatically...');
                throw error;
            }
          }
        },
        {
          policy: this.gmailBackoff,
          maxAttempts: 5,
          onRetry: (attempt, error) => {
            console.log(`Gmail polling attempt ${attempt}/5 failed: ${error.message}`);
          }
        }
      );
    });
  }
}
```

### 9.2 OAuth Token Refresh Resilience

```typescript
// OAuth token refresh with preemptive renewal (per resilience guide)
class ResilientGmailAuth {
  private tokenExpiryBuffer = 15 * 60 * 1000 // Refresh 15 minutes early

  async getAccessToken(): Promise<string> {
    const token = await this.loadStoredToken()

    // Preemptive refresh (tokens expire 50-60 min, not exactly 60)
    if (this.shouldRefreshToken(token)) {
      return this.refreshTokenWithRetry()
    }

    return token.access_token
  }

  private async refreshTokenWithRetry(): Promise<string> {
    const refreshBackoff = new ExponentialBackoff({
      baseDelay: 500,
      maxDelay: 16000,
      multiplier: 2,
      jitter: true,
      maxAttempts: 3, // Auth refresh should fail fast
    })

    return retryOrchestrator.execute(async () => await this.refreshToken(), {
      policy: refreshBackoff,
      onRetry: (attempt, error) => {
        console.log(`OAuth refresh attempt ${attempt} failed: ${error.message}`)
      },
    })
  }
}
```

## 10. Concurrency & Ordering

Assumptions:

- Single process performs envelope insert (simplifies race handling).
- Voice memo verification & fingerprinting can run concurrently up to a small pool (config: 2) while downloads remain sequential (semaphore=1) to respect APFS/iCloud heuristics.
- Classification is decoupled; READY is a stable hand-off state.

Burst Handling:

- Backpressure if unresolved DISCOVERED > threshold (config default: 500) → temporarily reject new non-essential channel (e.g., web clip) with retry suggestion.

## 11. Failure & Recovery Model

On Startup:

1. Scan for rows where `status NOT IN ('exported', 'exported_duplicate', 'exported_placeholder')`.
2. Derive ingest_state; re-process any not READY or STAGED for necessary step.
3. Recompute `content_hash` if missing (ensure SHA-256 computed).
4. Validate voice external references; quarantine missing files.

Idempotent Replays:

- All transitions re-check preconditions; if already satisfied, they short‑circuit.
- **Export invocation:** Direct Export Pattern (external to this spec) handles export idempotency via content hash deduplication and ULID collision detection. See [Direct Export Pattern](../../cross-cutting/spec-direct-export-tech.md) §4 (TDD Applicability) and §6 (Risks & Mitigations).

Quarantine States:

- `metadata.integrity.quarantine_reason` enumerated: `missing_file | fingerprint_mismatch | unreadable`.
- Quarantined captures never auto-deleted; require manual resolution tool (future).

## 12. Metrics & Instrumentation (Local Only)

Enabled with `CAPTURE_METRICS=1` (as PRD).

**Phase 1 Metrics (Master PRD Minimal Set):**

- `capture_voice_staging_ms` - Time to stage voice memo
- `capture_email_staging_ms` - Time to stage email
- `transcription_duration_ms` - Whisper processing time
- `export_write_ms` - Vault file write duration
- `dedup_hits_total` - Duplicate detection count
- `export_failures_total` - Failed vault writes
- `poll_voice_duration_ms` - Voice polling cycle time
- `poll_email_duration_ms` - Email polling cycle time
- `capture_time_to_export_ms` - End-to-end latency per capture
- `transcription_queue_depth` - Queue depth snapshot each poll
- `placeholder_export_ratio` - Aggregated daily ratio
- `backup_verification_result` - success/failure event metric

**External Service Resilience Metrics (per Resilience Guide):**

```typescript
interface ResilienceMetrics {
  // Gmail Metrics
  gmail_request_rate: number // Requests per second
  gmail_429_errors: number // Rate limit errors per hour
  gmail_circuit_state: BreakerState // Current circuit state
  gmail_avg_backoff: number // Average backoff delay
  gmail_auth_refreshes: number // Token refreshes per day

  // iCloud Metrics
  icloud_download_success_rate: number // Success percentage
  icloud_avg_download_time: number // Average download duration
  icloud_timeout_count: number // Timeouts per hour
  icloud_network_errors: number // Network errors per hour

  // Whisper Metrics
  whisper_transcription_cost: number // Daily cost tracking
  whisper_avg_duration: number // Average transcription time
  whisper_chunk_count: number // Files requiring chunking
  whisper_cache_hit_rate: number // Cache effectiveness
}
```

**Alert Thresholds (per Resilience Guide):**

```typescript
const alertThresholds = {
  gmail: {
    circuitOpen: { duration: 300000, severity: "warning" }, // 5 min
    authFailures: { count: 3, window: 3600000, severity: "critical" },
    rateLimit429: { count: 50, window: 3600000, severity: "warning" },
  },

  icloud: {
    downloadFailureRate: { threshold: 0.3, severity: "warning" }, // 30%
    avgDownloadTime: { threshold: 120000, severity: "info" }, // 2 min
    consecutiveTimeouts: { count: 5, severity: "critical" },
  },

  whisper: {
    dailyCostLimit: { threshold: 9.0, severity: "warning" }, // $9
    transcriptionFailureRate: { threshold: 0.2, severity: "warning" },
    cacheHitRate: { threshold: 0.3, severity: "info" }, // Below 30%
  },
}
```

**Phase 2+ Extended Metrics (Deferred):**

- `ingest_discovered_total` (granular staging counters)
- `ingest_verification_failures_total` (detailed failure tracking)
- `ingest_fingerprint_ms` (histogram for fingerprint performance)
- `ingest_recovery_replays_total` (recovery event tracking)
- `hash_computation_ms` (histogram, SHA-256 performance profiling)

**Export Format:** Newline-delimited JSON objects in `./.metrics/YYYY-MM-DD.ndjson` (per Master PRD).

## 13. Performance Targets (Refine PRD)

| Operation                              | Target      | Notes                                        |
| -------------------------------------- | ----------- | -------------------------------------------- |
| Insert + hash (text)                   | < 25ms p95  | SHA-256 sufficient for MPPP                  |
| Insert + first 4MB fingerprint (voice) | < 150ms p95 | Sequential disk read constraint              |
| Recovery scan (1000 items)             | < 2s        | Hash recompute cached; sequential processing |
| Verification (stat)                    | < 5ms avg   | Warm path                                    |

## 14. Security & Privacy

- Local-only filesystem operations; no network egress.
- Avoid storing full voice binary in SQLite (path + fingerprint only).
- Do not log raw content unless `CAPTURE_DEBUG=1` (sanitized length + hash only).

## 15. TDD Applicability Decision

### Risk Assessment

**Level**: HIGH
**Justification**: Core ingestion logic with multiple critical failure modes:

- Data loss during crashes or power failures (partial writes to staging ledger)
- Hash collision errors causing duplicate acceptance/rejection
- State machine inconsistency breaking recovery replay guarantees
- Content corruption during canonical serialization process
- Voice file sovereignty violations (path/fingerprint mismatch after system changes)
- Deduplication failures creating duplicate vault exports

### Decision

TDD Required

### Test Strategy

**Unit Test Scope**:

- Canonical envelope serialization produces deterministic SHA-256 hashes
- State machine transitions follow exact rules (DISCOVERED → VERIFIED → STAGED → ENRICHING → READY)
- Hash deduplication logic (content_hash uniqueness constraint)
- Content hash collision handling (rejection with clear error)
- Metadata JSON stability across serialization/deserialization
- Voice fingerprint computation (first 4MB SHA-256)
- **Resilience Components** (per Resilience Patterns Guide):
  - Exponential backoff calculations with jitter
  - Circuit breaker state transitions (CLOSED → OPEN → HALF_OPEN)
  - Progressive timeout calculations based on file size
  - Error classification accuracy for Gmail/iCloud/Whisper patterns
  - Cost control enforcement for Whisper API

**Integration Test Scope**:

- Complete ingestion flow from raw input to READY state with SQLite persistence
- Recovery replay after simulated crashes (does not duplicate transitions)
- Voice file verification with real file stat operations and fingerprinting
- Backpressure enforcement when unresolved DISCOVERED captures exceed threshold
- Quarantine workflow for missing or corrupted voice files
- Sequential voice processing constraint (no concurrent downloads)
- **Export integration:** Direct Export Pattern invocation (contract test, not full E2E)
- **External Service Resilience** (per Resilience Patterns Guide):
  - Gmail 429 rate limit handling with backoff
  - iCloud NSURLErrorDomain -1009 network offline recovery
  - Whisper file chunking for >25MB files
  - OAuth token preemptive refresh (15 minutes before expiry)
  - Circuit breaker opening after threshold failures

**Contract Test Scope**:

- SQLite schema compatibility across captures table operations
- Voice memo file system contract (path resolution, size/fingerprint validation)
- SHA-256 hash output format (64-character hex string)
- Canonical serialization format versioning and backward compatibility
- **Direct Export Pattern contract:** CaptureRecord → ExportResult interface
- **Resilience Pattern contracts** (per Resilience Patterns Guide):
  - ExponentialBackoff delay calculation interface
  - CircuitBreaker state machine interface
  - ErrorClassifier pattern matching interface
  - TimeoutController timeout calculation interface

### YAGNI Deferrals

**Not testing in Phase 1-2 (MPPP):**

- Performance benchmarking under heavy load (>1000 concurrent captures)
- Cross-device synchronization scenarios
- Plugin hook integration points
- Streaming transcript partial commits
- Multi-node coordination edge cases
- Full-file integrity validation (vs partial fingerprint)
- Hash algorithm migration (BLAKE3 deferred to Phase 2+)
- Outbox queue pattern (replaced by Direct Export)
- PARA classification at capture time (deferred to Phase 5+)

### Fault Injection Testing (per Resilience Patterns Guide)

```typescript
// Testing utilities following patterns from Resilience Patterns Guide
import { useFakeTimers } from "@template/testkit/env"

describe("External Service Resilience", () => {
  it("handles Gmail 429 rate limit with exponential backoff", async () => {
    useFakeTimers()
    const faultInjector = new FaultInjector()

    // Inject 429 errors for first 3 attempts
    const faultyGmail = faultInjector.injectSequence(gmailClient.pollMessages, [
      { status: 429, message: "Rate limit exceeded" },
      { status: 429, message: "Rate limit exceeded" },
      { status: 429, message: "Rate limit exceeded" },
      { success: true, data: [] },
    ])

    const result = await faultyGmail()

    expect(result).toBeDefined()
    expect(faultInjector.getAttemptCount()).toBe(4)

    // Verify exponential delays with 30% jitter
    const delays = faultInjector.getDelays()
    expect(delays[0]).toBeGreaterThan(700) // ~1s with jitter
    expect(delays[1]).toBeGreaterThan(1400) // ~2s with jitter
    expect(delays[2]).toBeGreaterThan(2800) // ~4s with jitter
  })

  it("handles APFS dataless file with progressive timeout", async () => {
    const mockFile = "/path/to/voice.m4a"

    // Mock icloudctl to simulate slow download
    quickMocks.slow("icloudctl download", 35000, "Download complete")

    const downloader = new VoiceFileDownloader()
    const result = await downloader.downloadIfNeeded(mockFile)

    expect(result).toBeDefined()
    // First timeout was 30s, should have retried with longer timeout
    expect(processHelpers.getCalls("icloudctl")).toHaveLength(2)
  })

  it("chunks large Whisper files automatically", async () => {
    const largefile = await createTempFile({ size: 30 * 1024 * 1024 }) // 30MB

    const chunker = new WhisperChunker()
    const chunks = await chunker.chunkLargeFile(largefile)

    expect(chunks).toHaveLength(2) // Should split into 2 chunks

    // Verify overlap exists
    const chunk1Duration = await getAudioDuration(chunks[0])
    const chunk2Duration = await getAudioDuration(chunks[1])
    const totalDuration = await getAudioDuration(largefile)

    expect(chunk1Duration + chunk2Duration).toBeGreaterThan(totalDuration) // Overlap
  })
})
```

**Trigger to Revisit:**

- Hash collision detected in production (extremely unlikely but would require immediate response)
- Recovery replay fails to restore system to consistent state (incident response)
- Voice file sovereignty violations detected (fingerprint mismatches >1% of checks)
- Ingestion latency exceeds 3 second target for >5% of captures
- Backpressure threshold hit regularly (daily basis indicating scaling need)

## 16. Risks & Mitigations

| Risk                             | Impact                          | Mitigation                                                                  |
| -------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| Hash migration inconsistency     | Duplicate acceptance divergence | Dual-hash phased rollout + comprehensive test fixtures                      |
| Partial fingerprint insufficient | Miss rare boundary collisions   | Optional full-file integrity audit batch job (future)                       |
| Recovery scan latency            | Delays READY availability       | Parallelize; cache sub-hashes                                               |
| Metadata drift                   | Ingest state derivation errors  | Central serializer + validation schema (Zod)                                |
| External service failures        | Capture pipeline disruption     | Resilience package with circuit breakers, retries, and ADHD-friendly errors |
| iCloud download failures         | Voice memos stuck as dataless   | Progressive timeout with 7-attempt retry strategy                           |
| Whisper cost overruns            | Budget exceeded                 | Daily cost limit ($10) with automatic cutoff                                |
| Gmail rate limits                | Email capture delays            | Conservative 80 req/s limit with 30% jitter backoff                         |

## 17. Open Questions

1. Should we persist `ingest_state` denormalized for faster queries? (Current: derive from metadata.)
2. Configurable fingerprint byte length per device performance profile? (Adaptive 4MB default?)
3. Should voice transcription failures follow [Resilience Guide](../../guides/guide-resilience-patterns.md#fallback-strategies) fallback patterns?
4. What's the optimal backpressure threshold (current: 500 unresolved DISCOVERED)?
5. Should quarantine captures be auto-expired after N days or require manual resolution?

## 18. Activation & Rollout (MPPP)

**MPPP Approach:** Direct activation with no feature flags (SHA-256 only, no migration complexity).

**Success Criteria (Phase 1 complete):**

- Voice + email captures working end-to-end
- > 50 real captures with zero hash collisions
- p95 insert latency under target for burst (≥10 rapid ingests) scenario
- Direct export working (see Direct Export Pattern spec)

**Phase 2 Success Criteria:**

- 7 days operation with zero data loss
- Recovery tested with fault injection
- Health command (`capture doctor`) operational

**Rollback Plan:**

- SQLite ledger retains all captures; vault writes are idempotent (safe to retry)
- Manual recovery via `capture doctor` if needed

## 19. ADR References

- [ADR-0001 Voice File Sovereignty](../../adr/0001-voice-file-sovereignty.md) - Voice memo path immutability rule
- [ADR-0002 Dual-Hash Migration](../../adr/0002-dual-hash-migration.md) - Superseded; SHA-256 only for MPPP
- [ADR-0006 Late Hash Binding for Voice Captures](../../adr/0006-late-hash-binding-voice.md) - Content hash computed after transcription
- [ADR-0008 Sequential Processing for MPPP Scope](../../adr/0008-sequential-processing-mppp.md) - Single capture processing model
- [ADR-0013 MPPP Direct Export Pattern](../../adr/0013-mppp-direct-export-pattern.md) - Synchronous export decision
- [ADR-0014 Placeholder Export Immutability](../../adr/0014-placeholder-export-immutability.md) - Transcription failure handling

## 20. YAGNI Boundary Reinforcement

Not introducing new tables beyond MPPP 4-table limit (`captures`, `exports_audit`, `errors_log`, `sync_state`); rely on existing schema & metadata JSON. No plugin hook points, no streaming transcripts, no cross-device sync concerns, **no outbox queue** (Direct Export Pattern replaces async queue with synchronous atomic writes). This keeps ingestion lean and auditable.

**Deferred to Phase 5+:** Outbox queue pattern, background workers, async export processing, PARA classification at capture time.

## 21. Appendix: Sample Envelope JSON

```json
{
  "id": "01JABCDEF123XYZ7890ABCD12",
  "source_type": "voice",
  "raw_content": "",
  "external_ref": "/Users/nathan/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/ABC123.m4a",
  "external_fingerprint": "c3b4...",
  "size_bytes": 482938,
  "metadata": {
    "verification": { "ok": true },
    "hashes": { "sha256": "a1b2c3..." },
    "enrichment": { "transcript": { "status": "pending" } }
  },
  "created_at": "2025-09-26T10:15:22.123Z"
}
```

## 22. ADR References

- [ADR 0001: Voice File Sovereignty](../../adr/0001-voice-file-sovereignty.md)
- [ADR 0003: Four-Table Hard Cap](../../adr/0003-four-table-hard-cap.md)
- [ADR 0004: Status-Driven State Machine](../../adr/0004-status-driven-state-machine.md)
- [ADR 0005: WAL Mode with NORMAL Synchronous](../../adr/0005-wal-mode-normal-sync.md)
- [ADR 0006: Late Hash Binding for Voice](../../adr/0006-late-hash-binding-voice.md)
- [ADR 0007: 90-Day Retention](../../adr/0007-90-day-retention-exported-only.md)
- [ADR 0008: Sequential Processing](../../adr/0008-sequential-processing-mppp.md)
- [ADR 0021: Local-Only NDJSON Metrics](../../adr/0021-local-metrics-ndjson-strategy.md)
- [ADR 0022: SQLite Cache Size Optimization](../../adr/0022-sqlite-cache-size-optimization.md)
- [ADR 0023: Composite Indexes for Recovery and Export](../../adr/0023-composite-indexes-recovery-export.md)
- [ADR 0024: PRAGMA optimize Implementation](../../adr/0024-pragma-optimize-implementation.md)
- [ADR 0025: Memory Mapping for Large Data Performance](../../adr/0025-memory-mapping-large-data-performance.md)

## 23. Nerdy Joke

Ingestion state machines are like ADHD-friendly checklists—short, linear, and everything past READY is someone else's problem (specifically, the Direct Export Pattern's problem). Keep the state machine shallow and the hash fast.

---

Version: 0.3.0
Last Updated: 2025-09-29
Author: adhd-brain-planner (Nathan)
Reviewers: (TBD)
Change Log:

- 0.3.0 (2025-09-29): Version sync to roadmap v3.0.0; enhanced APFS dataless file handling; comprehensive voice memo debugging; integrated External Service Resilience patterns for Gmail API, iCloud downloads, and Whisper transcription
- 0.2.0-MPPP (2025-09-28): Removed outbox queue references; aligned with Direct Export Pattern; clarified MPPP 4-table scope
- 0.1.0 (2025-09-26): Initial draft including SHA-256 hashing strategy
