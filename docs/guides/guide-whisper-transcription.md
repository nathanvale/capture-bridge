---
title: Whisper Transcription Guide
status: approved
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
---

# Whisper Transcription Guide

## Purpose

This guide helps developers implement sequential speech-to-text transcription for voice memos using OpenAI's Whisper model. It provides practical guidance for setting up the Whisper runtime, managing transcription job queues with strict concurrency limits, handling failures gracefully with placeholder exports, and monitoring resource usage to prevent system degradation.

**Target Audience:** Backend developers implementing transcription functionality, operations engineers monitoring resource usage, developers debugging transcription failures or performance issues.

## When to Use This Guide

Use this guide when you need to:

- Set up Whisper model for local transcription
- Implement sequential transcription job processing
- Handle transcription failures with placeholder fallbacks
- Manage temp file lifecycle during processing
- Monitor and limit resource usage (CPU, memory)
- Debug transcription timeouts or OOM errors
- Integrate transcription with voice capture pipeline

**Related Features:** Voice capture (`docs/features/capture/`), capture architecture, polling implementation

**Related Debugging:** [Voice Capture Debugging Guide](./guide-voice-capture-debugging.md) - Section 3 (Transcription Failures) for troubleshooting Whisper model issues, audio file validation, and resource monitoring

**Key Constraint:** Sequential processing only (concurrency=1) to prevent resource exhaustion in MPPP.

## Prerequisites

**Required Knowledge:**

- Node.js async/await patterns and job queues
- Whisper model basics (sizes, performance tradeoffs)
- Resource management (CPU, memory limits)
- Error handling and retry strategies
- TypeScript interfaces and error typing

**Required Tools:**

- Node.js v20+ with TypeScript
- Whisper.cpp or whisper-node bindings
- Whisper medium model (~1.5GB download)
- ffmpeg for audio decoding
- SQLite database (captures, errors_log tables)

**Required Setup:**

- Whisper model file: `~/.capture-bridge/models/whisper-medium.pt`
- Capture package with job queue infrastructure
- Environment variables: `DB_PATH`, `CAPTURE_METRICS`, `WHISPER_MODEL_PATH`
- Minimum 4GB RAM available for transcription

## Quick Reference

**Key Commands:**

```bash
# Download Whisper model (one-time setup)
pnpm whisper-download medium

# Run transcription (via voice polling, not standalone)
adhd capture voice  # Triggers transcription automatically

# Check transcription status
adhd capture doctor  # Shows queue depth, failure rate, resource usage
```

**Job States:**

- `queued` → Job waiting for processing
- `processing` → Currently transcribing (max 1 concurrent)
- `completed` → Transcript ready, capture updated
- `failed` → Max retries reached, placeholder exported

**Critical Thresholds:**

- Memory: Warn >2.5GB, error >3.0GB (kill job)
- Timeout: 300s (5 minutes) per transcription
- Retries: Maximum 2 attempts (initial + 1 retry)
- Queue depth: Warn if >50 jobs pending

## Step-by-Step Instructions

### Step 1: Install Whisper Model and Dependencies

**Goal:** Download and configure Whisper medium model

```bash
# Install Node.js bindings
pnpm add whisper-node

# Download Whisper medium model
pnpm whisper-download medium

# Verify installation
ls -lh ~/.capture-bridge/models/whisper-medium.pt
# Expected: ~1.5GB file
```

**Directory Structure:**

```
~/.capture-bridge/
├── models/
│   └── whisper-medium.pt  # 1.5GB model file
├── ledger.sqlite           # Captures database
└── token.json              # Gmail credentials
```

**Validation:**

```typescript
import { Whisper } from "whisper-node"

async function validateWhisperSetup(): Promise<void> {
  const modelPath = "~/.capture-bridge/models/whisper-medium.pt"

  // Check model file exists
  const exists = await fs
    .access(modelPath)
    .then(() => true)
    .catch(() => false)
  if (!exists) {
    throw new Error(`Whisper model not found at ${modelPath}`)
  }

  // Check file size (should be ~1.5GB)
  const stats = await fs.stat(modelPath)
  if (stats.size < 1.4e9 || stats.size > 1.6e9) {
    console.warn(`Whisper model size unexpected: ${stats.size} bytes`)
  }

  console.log("✓ Whisper model validated")
}
```

### Step 2: Implement Transcription Job Queue

**Goal:** Create sequential job processing with concurrency=1

```typescript
// packages/@capture-bridge/capture/src/transcription/queue.ts
interface TranscriptionJob {
  captureId: string
  audioPath: string
  audioFingerprint: string
  status: JobStatus
  attemptCount: number
  queuedAt: Date
  startedAt?: Date
  completedAt?: Date
  errorMessage?: string
}

type JobStatus = "queued" | "processing" | "completed" | "failed"

class TranscriptionQueue {
  private queue: TranscriptionJob[] = []
  private processing: boolean = false
  private currentJob?: TranscriptionJob

  async enqueue(job: TranscriptionJob): Promise<void> {
    // Check backpressure threshold
    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      throw new BackpressureError("Queue depth exceeded")
    }

    this.queue.push(job)
    this.processNext() // Non-blocking trigger
  }

  private async processNext(): Promise<void> {
    // Non-reentrant guard (enforces concurrency=1)
    if (this.processing || this.queue.length === 0) return

    this.processing = true
    this.currentJob = this.queue.shift()!

    try {
      await this.transcribeJob(this.currentJob)
    } finally {
      this.processing = false
      this.currentJob = undefined
      this.processNext() // Continue with next job
    }
  }

  getStatus(): RuntimeStatus {
    return {
      isProcessing: this.processing,
      currentJob: this.currentJob?.captureId,
      queueDepth: this.queue.length,
      lastCompletedAt: this.lastCompletedAt,
      totalProcessed: this.metrics.totalProcessed,
      totalFailed: this.metrics.totalFailed,
      averageDurationMs: this.metrics.averageDurationMs,
    }
  }
}
```

**Expected Behavior:**

- Only 1 job processes at a time (sequential)
- Queue automatically processes next job on completion
- Backpressure prevents unbounded queue growth

### Step 3: Implement Transcription Processing Logic

**Goal:** Execute Whisper transcription with timeout and cleanup

```typescript
async function processTranscriptionJob(
  job: TranscriptionJob
): Promise<TranscriptionResult> {
  const startTime = performance.now()
  let tempPath: string | undefined

  try {
    // Step 1: Verify audio file exists
    await verifyAudioFile(job.audioPath)

    // Step 2: Create temp file for processing
    tempPath = await tempFileManager.createTempAudio(
      job.captureId,
      job.audioPath
    )

    // Step 3: Load model (lazy load, amortized cost)
    const model = await whisperModel.ensureLoaded()

    // Step 4: Transcribe with timeout
    const transcript = await Promise.race([
      model.transcribe(tempPath, {
        language: "en",
        task: "transcribe",
        temperature: 0,
        bestOf: 1,
        maxDurationSec: 300,
        fp16: true,
      }),
      timeout(300_000, "Transcription timeout"),
    ])

    // Step 5: Compute content hash
    const contentHash = sha256(transcript)

    // Step 6: Update captures table
    await updateCaptureStatus(job.captureId, {
      status: "transcribed",
      rawContent: transcript,
      contentHash,
    })

    // Step 7: Record metrics
    const durationMs = performance.now() - startTime
    recordMetric("transcription_duration_ms", durationMs)

    return {
      captureId: job.captureId,
      transcript,
      durationMs,
      success: true,
      placeholderExported: false,
    }
  } catch (error) {
    // Step 8: Handle failure
    return await handleTranscriptionFailure(job, error, startTime)
  } finally {
    // Step 9: Cleanup temp files (guaranteed)
    if (tempPath) {
      await tempFileManager.cleanup(tempPath)
    }
  }
}
```

### Step 4: Implement Failure Handling with Placeholder Export

**Goal:** Gracefully handle failures with retry logic and fallback

```typescript
async function handleTranscriptionFailure(
  job: TranscriptionJob,
  error: Error,
  startTime: number
): Promise<TranscriptionResult> {
  const durationMs = performance.now() - startTime
  const errorType = classifyError(error)

  // Log error
  await logError(job.captureId, "transcribe", error.message)

  // Check retry eligibility
  if (job.attemptCount < MAX_ATTEMPTS && isRetriableError(errorType)) {
    // Increment attempt and re-enqueue
    job.attemptCount++
    await transcriptionQueue.enqueue(job)

    recordMetric("transcription_retry_total", 1, { errorType })

    return {
      captureId: job.captureId,
      durationMs,
      success: false,
      errorType,
      placeholderExported: false,
    }
  }

  // Max attempts reached → placeholder export
  await exportPlaceholder(job.captureId, errorType)

  recordMetric("transcription_failure_total", 1, { errorType })
  recordMetric("placeholder_export_total", 1)

  return {
    captureId: job.captureId,
    durationMs,
    success: false,
    errorType,
    placeholderExported: true,
  }
}

// Error classification
enum ErrorType {
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_UNREADABLE = "FILE_UNREADABLE",
  CORRUPT_AUDIO = "CORRUPT_AUDIO",
  MODEL_LOAD_FAILURE = "MODEL_LOAD_FAILURE",
  OOM = "OOM",
  TIMEOUT = "TIMEOUT",
  WHISPER_ERROR = "WHISPER_ERROR",
  UNKNOWN = "UNKNOWN",
}

function classifyError(error: Error): ErrorType {
  if (error.message.includes("ENOENT")) return ErrorType.FILE_NOT_FOUND
  if (error.message.includes("EACCES")) return ErrorType.FILE_UNREADABLE
  if (error.message.includes("Invalid audio format"))
    return ErrorType.CORRUPT_AUDIO
  if (error.message.includes("Model not found"))
    return ErrorType.MODEL_LOAD_FAILURE
  if (error instanceof TimeoutError) return ErrorType.TIMEOUT
  if (process.memoryUsage().rss > 3e9) return ErrorType.OOM
  if (error.message.includes("Whisper")) return ErrorType.WHISPER_ERROR
  return ErrorType.UNKNOWN
}

function isRetriableError(errorType: ErrorType): boolean {
  return [
    ErrorType.FILE_UNREADABLE,
    ErrorType.TIMEOUT,
    ErrorType.WHISPER_ERROR,
  ].includes(errorType)
}
```

### Step 5: Implement Placeholder Export Format

**Goal:** Create informative fallback when transcription fails

```typescript
async function exportPlaceholder(
  captureId: string,
  errorType: ErrorType
): Promise<void> {
  const capture = await getCaptureById(captureId)

  const placeholder = `[TRANSCRIPTION_FAILED: ${errorType}]

---
Audio file: ${capture.meta_json.file_path}
Captured at: ${capture.created_at}
Error: ${capture.errorMessage || "Unknown error"}
Retry count: ${capture.attemptCount || 0}
---`

  // Update captures table
  await db.run(
    `UPDATE captures
     SET status = 'exported_placeholder',
         raw_content = ?,
         content_hash = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [placeholder, captureId]
  )

  // Export to vault
  await directExporter.export({
    captureId,
    content: placeholder,
    vaultPath: `inbox/${captureId}.md`,
  })
}
```

**Example Placeholder:**

```markdown
[TRANSCRIPTION_FAILED: TIMEOUT]

---

Audio file: /Users/nathan/Library/Group Containers/.../ABC123.m4a
Captured at: 2025-09-27T10:30:00Z
Error: Transcription exceeded 300s timeout
Retry count: 2

---
```

## Common Patterns

### Pattern: Lazy Model Loading

**Use Case:** Load Whisper model on first transcription (not startup)

```typescript
class WhisperModel {
  private model?: LoadedModel
  private loading: boolean = false

  async ensureLoaded(): Promise<LoadedModel> {
    if (this.model) return this.model

    if (this.loading) {
      // Wait for concurrent load to complete
      return await this.waitForLoad()
    }

    this.loading = true
    try {
      const startTime = performance.now()
      this.model = await loadWhisperModel({
        modelPath: "~/.capture-bridge/models/whisper-medium.pt",
        device: "auto", // Use Metal on macOS if available
      })

      const loadDurationMs = performance.now() - startTime
      recordMetric("model_load_duration_ms", loadDurationMs)
      logger.info("Whisper model loaded", { loadDurationMs })

      return this.model
    } finally {
      this.loading = false
    }
  }
}
```

**Benefits:**

- Avoids startup delay if no transcriptions needed
- Amortizes load cost across all jobs in session
- Simplifies error handling (fail job, not startup)

### Pattern: Temp File Lifecycle Management

**Use Case:** Guarantee temp file cleanup even on errors

```typescript
async function transcribeJob(job: TranscriptionJob): Promise<void> {
  let tempPath: string | undefined

  try {
    tempPath = await createTempFile(job)
    await runTranscription(tempPath)
  } finally {
    // Guaranteed cleanup even on error or timeout
    if (tempPath) {
      await fs
        .unlink(tempPath)
        .catch((err) =>
          logger.warn("Temp file cleanup failed", { tempPath, err })
        )
    }
  }
}

// Orphan cleanup on startup
async function cleanupOrphanedTempFiles(): Promise<void> {
  const pattern = "/tmp/claude/whisper-*.m4a"
  const files = await glob(pattern)

  for (const file of files) {
    await fs.unlink(file)
    logger.info("Removed orphaned temp file", { file })
  }
}
```

### Pattern: Resource Monitoring with Thresholds

**Use Case:** Prevent OOM by monitoring RSS and killing jobs

```typescript
// Monitor memory every 10s during transcription
setInterval(() => {
  const rss = process.memoryUsage().rss

  if (rss > 2.5e9) {
    logger.warn("High memory usage", { rss, currentJob })
  }

  if (rss > 3e9) {
    logger.error("OOM threshold exceeded", { rss, currentJob })
    throw new OutOfMemoryError("RSS exceeded 3GB")
  }
}, 10_000)
```

### Anti-Pattern: Concurrent Transcription Jobs

**Problem:** Multiple concurrent jobs exhaust memory and CPU

```typescript
// ❌ WRONG: Parallel processing
const promises = jobs.map((job) => transcribe(job))
await Promise.all(promises) // OOM risk!

// ✅ CORRECT: Sequential processing
for (const job of jobs) {
  await transcribe(job) // One at a time
}
```

## P0 Technical Details: Model Load Contract & Failure Taxonomy

### Model Load Contract

```typescript
interface WhisperModelContract {
  // Model lifecycle
  load(config: ModelLoadConfig): Promise<LoadedModel>
  unload(): Promise<void>
  isLoaded(): boolean

  // Transcription
  transcribe(
    audioPath: string,
    options: TranscribeOptions
  ): Promise<TranscriptResult>

  // Health
  getStatus(): ModelStatus
}

interface ModelLoadConfig {
  modelPath: string // ~/.capture-bridge/models/whisper-medium.pt
  device: "auto" | "cpu" | "gpu" // Prefer Metal on macOS
  maxMemoryMb: number // 2000 (2GB ceiling)
  timeoutMs: number // 30000 (30s load timeout)
}

interface LoadedModel {
  id: string // Model fingerprint (SHA-256 of model file)
  loadedAt: Date
  memoryUsageMb: number
  device: string // Actual device used (cpu, metal, cuda)
}

interface TranscribeOptions {
  language: "en" // English only in MPPP
  task: "transcribe" // Not 'translate'
  temperature: number // 0 for deterministic output
  bestOf: number // 1 (no beam search in MPPP)
  maxDurationSec: number // 300 (5 minutes)
  fp16: boolean // true if GPU available
}

interface TranscriptResult {
  text: string
  durationMs: number
  segments?: TranscriptSegment[] // Optional timestamped segments
}

interface TranscriptSegment {
  startMs: number
  endMs: number
  text: string
}

interface ModelStatus {
  loaded: boolean
  modelPath: string
  memoryUsageMb: number
  transcriptionsCompleted: number
  averageDurationMs: number
  lastTranscriptionAt?: Date
}
```

### Timeout Enforcement

```typescript
class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly durationMs: number
  ) {
    super(message)
    this.name = "TimeoutError"
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(`${operation} timeout`, timeoutMs)),
        timeoutMs
      )
    ),
  ])
}

// Usage in transcription
async function transcribeWithTimeout(
  audioPath: string,
  timeoutMs: number = 300_000 // 5 minutes default
): Promise<TranscriptResult> {
  try {
    const result = await withTimeout(
      whisperModel.transcribe(audioPath, {
        language: "en",
        task: "transcribe",
        temperature: 0,
        bestOf: 1,
        maxDurationSec: timeoutMs / 1000,
        fp16: true,
      }),
      timeoutMs,
      "Whisper transcription"
    )

    return result
  } catch (error) {
    if (error instanceof TimeoutError) {
      // Emit timeout metric
      metrics.counter("transcription_timeout_total", {
        duration_ms: error.durationMs,
      })

      throw error // Let error handler classify and decide retry
    }
    throw error
  }
}
```

### Failure Taxonomy & Mapping to Ledger Status

```typescript
enum TranscriptionErrorType {
  // File errors (permanent)
  FILE_NOT_FOUND = "file.not_found", // Audio file missing
  FILE_UNREADABLE = "file.unreadable", // Permission denied
  CORRUPT_AUDIO = "audio.corrupt", // Invalid format

  // Model errors
  MODEL_LOAD_FAILURE = "model.load_failure", // Model file missing/corrupt
  MODEL_NOT_LOADED = "model.not_loaded", // ensureLoaded() failed

  // Resource errors (transient)
  OOM = "resource.oom", // Memory exceeded 3GB
  TIMEOUT = "resource.timeout", // Exceeded 5 minutes

  // Whisper errors (transient)
  WHISPER_ERROR = "whisper.error", // Whisper internal error

  // Unknown
  UNKNOWN = "unknown",
}

interface FailureMapping {
  errorType: TranscriptionErrorType
  ledgerStatus: "transcription_failed" | "exported_placeholder"
  retriable: boolean
  maxAttempts: number
  placeholderReason: string
  escalateToErrorsLog: boolean
}

const FAILURE_MAPPINGS: Record<TranscriptionErrorType, FailureMapping> = {
  [TranscriptionErrorType.FILE_NOT_FOUND]: {
    errorType: TranscriptionErrorType.FILE_NOT_FOUND,
    ledgerStatus: "exported_placeholder",
    retriable: false,
    maxAttempts: 0,
    placeholderReason: "Audio file not found - may have been deleted",
    escalateToErrorsLog: true,
  },
  [TranscriptionErrorType.CORRUPT_AUDIO]: {
    errorType: TranscriptionErrorType.CORRUPT_AUDIO,
    ledgerStatus: "exported_placeholder",
    retriable: false,
    maxAttempts: 0,
    placeholderReason: "Audio file is corrupted or invalid format",
    escalateToErrorsLog: true,
  },
  [TranscriptionErrorType.OOM]: {
    errorType: TranscriptionErrorType.OOM,
    ledgerStatus: "exported_placeholder",
    retriable: false, // OOM is permanent for this audio file
    maxAttempts: 0,
    placeholderReason: "Audio file too large - exceeded memory limit",
    escalateToErrorsLog: true,
  },
  [TranscriptionErrorType.TIMEOUT]: {
    errorType: TranscriptionErrorType.TIMEOUT,
    ledgerStatus: "transcription_failed",
    retriable: true,
    maxAttempts: 2,
    placeholderReason: "Transcription timeout - audio file too long",
    escalateToErrorsLog: false, // Only log if retries exhausted
  },
  [TranscriptionErrorType.WHISPER_ERROR]: {
    errorType: TranscriptionErrorType.WHISPER_ERROR,
    ledgerStatus: "transcription_failed",
    retriable: true,
    maxAttempts: 2,
    placeholderReason: "Whisper transcription error",
    escalateToErrorsLog: false,
  },
  [TranscriptionErrorType.MODEL_LOAD_FAILURE]: {
    errorType: TranscriptionErrorType.MODEL_LOAD_FAILURE,
    ledgerStatus: "exported_placeholder",
    retriable: false, // Requires manual intervention (model re-download)
    maxAttempts: 0,
    placeholderReason: "Whisper model unavailable - manual setup required",
    escalateToErrorsLog: true,
  },
}

// Error classification function
function classifyTranscriptionError(error: any): TranscriptionErrorType {
  // File system errors
  if (error.code === "ENOENT") return TranscriptionErrorType.FILE_NOT_FOUND
  if (error.code === "EACCES") return TranscriptionErrorType.FILE_UNREADABLE

  // Timeout
  if (error instanceof TimeoutError) return TranscriptionErrorType.TIMEOUT

  // OOM detection
  const rss = process.memoryUsage().rss
  if (rss > 3e9) return TranscriptionErrorType.OOM

  // Model errors
  if (error.message.includes("Model not found")) {
    return TranscriptionErrorType.MODEL_LOAD_FAILURE
  }
  if (error.message.includes("Model not loaded")) {
    return TranscriptionErrorType.MODEL_NOT_LOADED
  }

  // Audio format errors
  if (
    error.message.includes("Invalid audio format") ||
    error.message.includes("Unsupported format")
  ) {
    return TranscriptionErrorType.CORRUPT_AUDIO
  }

  // Whisper errors
  if (
    error.message.includes("Whisper") ||
    error.message.includes("transcribe")
  ) {
    return TranscriptionErrorType.WHISPER_ERROR
  }

  return TranscriptionErrorType.UNKNOWN
}

// Apply failure mapping to determine action
async function handleTranscriptionFailure(
  job: TranscriptionJob,
  error: Error
): Promise<FailureResult> {
  const errorType = classifyTranscriptionError(error)
  const mapping = FAILURE_MAPPINGS[errorType]

  // Log error to errors_log if escalation required
  if (mapping.escalateToErrorsLog) {
    await db.run(
      `INSERT INTO errors_log (capture_id, operation, error_type, error_message, created_at)
       VALUES (?, 'transcribe', ?, ?, CURRENT_TIMESTAMP)`,
      [job.captureId, errorType, error.message]
    )
  }

  // Check retry eligibility
  if (mapping.retriable && job.attemptCount < mapping.maxAttempts) {
    // Re-enqueue for retry
    job.attemptCount++
    await transcriptionQueue.enqueue(job)

    return {
      action: "retry",
      errorType,
      attemptCount: job.attemptCount,
      maxAttempts: mapping.maxAttempts,
    }
  }

  // Max attempts reached or non-retriable → export placeholder
  await exportPlaceholder(job.captureId, errorType, mapping.placeholderReason)

  // Update captures table with final status
  await db.run(
    `UPDATE captures
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [mapping.ledgerStatus, job.captureId]
  )

  return {
    action: "placeholder_exported",
    errorType,
    ledgerStatus: mapping.ledgerStatus,
    reason: mapping.placeholderReason,
  }
}
```

### State Transitions & Ledger Integration

```typescript
// Transcription job states
type JobState = "queued" | "processing" | "completed" | "failed"

// Staging ledger status (captures table)
type LedgerStatus =
  | "discovered" // Voice file found, not yet transcribed
  | "transcribing" // Whisper job in progress
  | "transcribed" // Transcript ready, not yet exported
  | "transcription_failed" // Retriable failure (in retry queue)
  | "exported_placeholder" // Permanent failure, placeholder exported
  | "exported" // Successfully exported to vault

// State transition mapping
interface StateTransition {
  fromJobState: JobState
  toLedgerStatus: LedgerStatus
  trigger: string
}

const STATE_TRANSITIONS: StateTransition[] = [
  {
    fromJobState: "queued",
    toLedgerStatus: "discovered",
    trigger: "Job enqueued after voice poll",
  },
  {
    fromJobState: "processing",
    toLedgerStatus: "transcribing",
    trigger: "Job dequeued, Whisper started",
  },
  {
    fromJobState: "completed",
    toLedgerStatus: "transcribed",
    trigger: "Whisper completed successfully",
  },
  {
    fromJobState: "failed",
    toLedgerStatus: "transcription_failed",
    trigger: "Retriable failure, re-enqueued",
  },
  {
    fromJobState: "failed",
    toLedgerStatus: "exported_placeholder",
    trigger: "Permanent failure or max retries, placeholder exported",
  },
]

// Update ledger status during transitions
async function updateLedgerStatus(
  captureId: string,
  newStatus: LedgerStatus,
  metadata?: Record<string, any>
): Promise<void> {
  await db.run(
    `UPDATE captures
     SET status = ?,
         meta_json = json_patch(meta_json, ?),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [newStatus, JSON.stringify(metadata || {}), captureId]
  )

  // Emit metric
  metrics.counter("capture_status_transition_total", {
    new_status: newStatus,
    capture_id: captureId,
  })
}
```

### Metrics Integration

See [Metrics Contract Tech Spec](../cross-cutting/spec-metrics-contract-tech.md) for complete metric definitions.

**Whisper-specific metrics:**

```typescript
// Model lifecycle
metrics.duration("whisper_model_load_duration_ms", durationMs)
metrics.gauge("whisper_model_memory_usage_mb", memoryMb)
metrics.counter("whisper_model_load_total", { result: "success" | "failure" })

// Transcription performance
metrics.duration("transcription_duration_ms", durationMs, {
  audio_duration_sec,
})
metrics.histogram("transcription_realtime_factor", realtimeFactor) // durationMs / audioDurationMs
metrics.gauge("transcription_queue_depth", queueDepth)

// Job lifecycle
metrics.counter("transcription_job_total", { result: "success" | "failure" })
metrics.counter("transcription_retry_total", {
  error_type: TranscriptionErrorType,
})
metrics.counter("placeholder_export_total", {
  error_type: TranscriptionErrorType,
})

// Resource monitoring
metrics.gauge("process_memory_usage_mb", rss / 1e6)
metrics.gauge("process_memory_usage_percent", (rss / totalMem) * 100)
metrics.counter("oom_kill_total", { trigger: "threshold" | "os" })

// Error breakdown
metrics.counter("transcription_error_total", {
  error_type: TranscriptionErrorType,
})
metrics.gauge("transcription_failure_rate_percent", failureRate)
```

## Troubleshooting

### Error: Model Load Failure

**Symptom:** "Model not found" or "Model corrupted" errors

**Cause:** Missing or corrupted whisper-medium.pt file

**Solution:**

```bash
# Remove corrupted model
rm ~/.capture-bridge/models/whisper-medium.pt

# Re-download
pnpm whisper-download medium

# Verify file size (~1.5GB)
ls -lh ~/.capture-bridge/models/whisper-medium.pt
```

### Error: Transcription Timeout

**Symptom:** Jobs fail after 300s with TIMEOUT error

**Cause:** Audio file too long or Whisper processing slow

**Solution:** Shorten audio clip on retry

```typescript
async function retryWithShorterClip(job: TranscriptionJob): Promise<void> {
  // Extract first 5 minutes only
  const shortenedPath = await extractAudioClip(job.audioPath, 0, 300)

  // Retry transcription with shorter clip
  const transcript = await model.transcribe(shortenedPath, {
    maxDurationSec: 300,
  })

  // Note partial transcription in metadata
  await updateCapture(job.captureId, {
    transcript,
    meta_json: { ...job.meta, partial: true, duration_sec: 300 },
  })
}
```

### Error: Out of Memory (OOM)

**Symptom:** Process crashes with "JavaScript heap out of memory"

**Cause:** Memory exceeded 3GB threshold during transcription

**Solution:** Kill job gracefully and export placeholder

```typescript
process.on("SIGTERM", async () => {
  logger.error("OOM detected - killing current job")

  if (currentJob) {
    await exportPlaceholder(currentJob.captureId, ErrorType.OOM)
  }

  process.exit(1)
})
```

**Prevention:** Monitor RSS proactively (see Resource Monitoring pattern)

### Error: Corrupt Audio File

**Symptom:** "Invalid audio format" errors

**Cause:** Truncated or malformed .m4a file

**Solution:** Validate audio format before transcription

```typescript
async function validateAudioFormat(filePath: string): Promise<void> {
  // Use ffprobe to check format
  const result = await execAsync(`ffprobe -v error "${filePath}"`)

  if (result.includes("Invalid data")) {
    throw new Error("Corrupt audio file")
  }

  // Check duration (must be > 0)
  const duration = await getAudioDuration(filePath)
  if (duration <= 0) {
    throw new Error("Zero-length audio file")
  }
}
```

## Examples

### Example 1: Complete Transcription Setup

```typescript
import { Whisper } from "whisper-node"
import { TranscriptionQueue } from "@capture-bridge/capture"

async function setupTranscription() {
  // Initialize Whisper model
  const whisper = new Whisper({
    modelPath: "~/.capture-bridge/models/whisper-medium.pt",
    device: "auto",
  })

  // Initialize transcription queue
  const queue = new TranscriptionQueue({
    maxConcurrency: 1,
    maxQueueDepth: 50,
  })

  // Enqueue job (called by voice poller)
  await queue.enqueue({
    captureId: "01JABCDEF123",
    audioPath: "/path/to/audio.m4a",
    audioFingerprint: "abc123...",
    status: "queued",
    attemptCount: 1,
    queuedAt: new Date(),
  })

  // Queue automatically processes jobs sequentially
  console.log("Transcription job enqueued")
}
```

### Example 2: Health Check Integration

```typescript
async function getTranscriptionHealth(): Promise<HealthReport> {
  const status = transcriptionQueue.getStatus();
  const metrics = await queryMetrics('transcription_*', '24h');
  const modelPath = '~/.capture-bridge/models/whisper-medium.pt';

  return {
    status: status.isProcessing ? 'processing' : 'idle',
    queueDepth: status.queueDepth,
    lastCompletedAt: status.lastCompletedAt,
    stats24h: {
      totalProcessed: metrics.success_total + metrics.failure_total,
      successRate: metrics.success_total / (metrics.success_total + metrics.failure_total),
      averageDurationMs: metrics.average_duration_ms,
      p95DurationMs: metrics.p95_duration_ms,
    },
    failures24h: groupBy(metrics.failures, 'error_type'),
    resources: {
      modelLoaded: await fileExists(modelPath),
      memoryUsageMb: process.memoryUsage().rss / 1e6,
      memoryCeilingMb: 3000,
      orphanedTempFiles: await countOrphanedFiles(),
    },
  };
}

// CLI output
$ adhd capture doctor

Transcription Runtime:
  Status: Operational
  Queue Depth: 3 jobs
  Last Completed: 2 minutes ago

  Performance (Last 24h):
    Total Processed: 45 jobs
    Success Rate: 93.3% (42/45)
    Average Duration: 7.2s
    P95 Duration: 12.5s

  Failures (Last 24h):
    TIMEOUT: 2 jobs
    FILE_UNREADABLE: 1 job

  Resources:
    Model: Loaded (whisper-medium.pt)
    Memory: 1.8 GB / 3.0 GB limit
    Temp Files: 0 orphaned

  Recommendations:
    ✓ All systems operational
```

## TDD Applicability

**Risk Classification:** HIGH (transcription failures result in data loss or placeholder export)

**TDD Decision:** **Required** for model load contract, timeout enforcement, and failure taxonomy

**Rationale:**

- Model load failures block all transcription operations until restart
- Timeout enforcement prevents resource exhaustion (CPU, memory)
- Failure classification determines placeholder vs retry (permanent data state)
- Sequential processing (concurrency=1) requires precise queue state tracking
- Temp file lifecycle bugs cause disk space leaks

**Scope Under TDD:**

**Unit Tests Required:**

- Model load state machine (`ensureLoaded()` idempotency)
- Timeout enforcement with Promise.race pattern
- Error classification (FILE_NOT_FOUND, OOM, TIMEOUT, CORRUPT_AUDIO)
- Backoff calculation for retry attempts
- Placeholder content generation format
- Temp file path generation (deterministic ULID-based naming)

**Integration Tests Required:**

- Transcription queue sequential processing (concurrency=1 enforcement)
- Job state transitions (queued → processing → completed/failed)
- Temp file cleanup (finally block guarantees)
- Captures table status updates (transcribed vs exported_placeholder)
- Memory threshold monitoring (2.5GB warn, 3.0GB kill)

**Contract Tests Required:**

- Whisper model interface (transcribe method signature)
- Audio format validation (ffprobe integration)
- Staging ledger status contract (status field mapping to ledger states)
- Metrics emission contract (transcription_duration_ms, failure_total)

**Out of Scope (YAGNI):**

- Streaming transcription (batch-only in MPPP)
- Multi-model support (medium model only in MPPP)
- Concurrent job processing (sequential only per ADR-0001)
- Persistent retry queue (in-memory only in MPPP)

**Testing Trigger to Revisit:**

- OOM incidents > 1/month (indicates resource thresholds need tuning)
- Placeholder export rate > 5% (indicates failure classification issues)
- Queue depth consistently > 20 jobs (may need concurrency increase)

For testing patterns and utilities, see:

- [TDD Applicability Guide](./guide-tdd-applicability.md) - Risk-based testing framework
- [Test Strategy Guide](./guide-test-strategy.md) - Testing approach
- [TestKit Usage Guide](./guide-testkit-usage.md) - Testing utilities

## Related Documentation

**PRDs (Product Requirements):**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System-wide voice capture requirements
- [Capture Feature PRD](../features/capture/prd-capture.md) - Voice capture requirements
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Transcription status tracking
- [Obsidian Bridge PRD](../features/obsidian-bridge/prd-obsidian.md) - Placeholder export requirements

**Feature Specifications:**

- [Capture Architecture Spec](../features/capture/spec-capture-arch.md) - Transcription integration
- [Capture Tech Spec](../features/capture/spec-capture-tech.md) - Transcription orchestration
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Transcription testing
- [Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md) - Status persistence

**Cross-Cutting Specifications:**

- [Metrics Contract Tech Spec](../cross-cutting/spec-metrics-contract-tech.md) - Telemetry
- [Direct Export Pattern Tech Spec](../cross-cutting/spec-direct-export-tech.md) - Export behavior

**Guides (How-To):**

- [Polling Implementation Guide](./guide-polling-implementation.md) - Sequential processing patterns
- [Error Recovery Guide](./guide-error-recovery.md) - Transcription retry logic
- [TDD Applicability Guide](./guide-tdd-applicability.md) - Risk-based testing framework
- [Test Strategy Guide](./guide-test-strategy.md) - Testing approach
- [Capture Debugging Guide](./guide-capture-debugging.md) - Transcription troubleshooting

**ADRs (Architecture Decisions):**

- [ADR-0001: Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md) - Sequential processing rationale
- [ADR-0007: Sequential Processing Model](../adr/0008-sequential-processing-mppp.md) - Concurrency constraints

**External Resources:**

- [Whisper Model Cards](https://github.com/openai/whisper) - Model comparison
- [whisper.cpp Documentation](https://github.com/ggerganov/whisper.cpp) - C++ implementation
- [Node.js Bindings](https://www.npmjs.com/package/whisper-node) - NPM package

## Maintenance Notes

**When to Update:**

- Whisper model version changes (currently medium)
- Node.js bindings API changes
- Resource limits need adjustment (memory, timeout)
- New error types discovered
- Performance optimizations identified

**Known Limitations:**

- Sequential processing only (concurrency=1 in MPPP)
- English language only (no multi-language support)
- Medium model fixed (no runtime model selection)
- No streaming transcription (batch only)
- No beam search alternatives (bestOf=1)
- Placeholder export immutable (no manual retry in MPPP)

**Future Enhancements:**

- Multi-language support with language detection
- Model selection UI (small/medium/large)
- Concurrent processing (Phase 3+, when volume > 100/day)
- Streaming transcription for real-time feedback
- Manual retry command for failed transcriptions
- Attachment metadata extraction
