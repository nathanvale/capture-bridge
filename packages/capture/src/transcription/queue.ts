/**
 * Sequential transcription queue with concurrency=1 and backpressure control
 * Implements AC02: Sequential processing with non-reentrant guard
 * Implements AC03: Single retry on failure for retriable errors
 * Implements AC04: 30 second timeout on transcription
 * Implements AC05: Database update on successful transcription
 */

import { createHash } from 'node:crypto'

import type { Database } from 'better-sqlite3'

export const MAX_QUEUE_DEPTH = 256
export const MAX_ATTEMPTS = 2 // Initial attempt + 1 retry

export class BackpressureError extends Error {
  constructor() {
    super(`Queue depth exceeded: Maximum ${MAX_QUEUE_DEPTH} jobs allowed`)
    this.name = 'BackpressureError'
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('Transcription timeout')
    this.name = 'TimeoutError'
  }
}

export enum TranscriptionErrorType {
  TIMEOUT = 'timeout',
  FILE_NOT_FOUND = 'file_not_found',
  CORRUPT_AUDIO = 'corrupt_audio',
  WHISPER_ERROR = 'whisper_error',
  UNKNOWN = 'unknown',
}

export interface TranscriptionJob {
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

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

interface QueueStatus {
  isProcessing: boolean
  currentJob: string | undefined
  queueDepth: number
  totalProcessed: number
  totalFailed: number
  lastCompletedAt: Date | undefined
}

export class TranscriptionQueue {
  private queue: TranscriptionJob[] = []
  private isRunning = false
  private currentJob: TranscriptionJob | undefined
  private totalProcessed = 0
  private totalFailed = 0
  private lastCompletedAt: Date | undefined
  private shutdownRequested = false
  private shutdownResolve: (() => void) | undefined
  private shutdownSignal: Promise<void> | undefined
  private db: Database | undefined
  private whisperModel:
    | { transcribe: (path: string) => Promise<{ text: string; confidence: number }> }
    | undefined
  private readonly timeoutMs: number

  constructor(
    db?: Database,
    whisperModel?: { transcribe: (path: string) => Promise<{ text: string; confidence: number }> },
    options?: { timeoutMs?: number }
  ) {
    this.db = db
    this.whisperModel = whisperModel
    this.timeoutMs = options?.timeoutMs ?? 30000
  }

  /**
   * Enqueue a transcription job
   * @throws BackpressureError if queue depth exceeds MAX_QUEUE_DEPTH
   */
  enqueue(job: TranscriptionJob): void {
    // Check backpressure threshold
    // Backpressure considers queued items plus any in-flight job
    const effectiveDepth = this.queue.length + (this.currentJob ? 1 : 0)
    if (effectiveDepth >= MAX_QUEUE_DEPTH) {
      throw new BackpressureError()
    }

    // Add to queue
    this.queue.push(job)

    // Start processing if not already running
    if (!this.isRunning) {
      // Don't await - let it process in background
      void this.processQueue()
    }
  }

  /**
   * Get current queue status and metrics
   */
  getStatus(): QueueStatus {
    return {
      isProcessing: this.isRunning,
      currentJob: this.currentJob?.captureId,
      queueDepth: this.queue.length,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      lastCompletedAt: this.lastCompletedAt,
    }
  }

  /**
   * Process jobs sequentially (concurrency=1)
   * Non-reentrant guard ensures only one worker loop
   */
  private async processQueue(): Promise<void> {
    // Non-reentrant guard
    if (this.isRunning) {
      return
    }

    this.isRunning = true

    try {
      while (this.queue.length > 0 && !this.shutdownRequested) {
        // FIFO - take from front
        const job = this.queue.shift()
        if (!job) break

        this.currentJob = job
        // Note: transcribeJob will set status to 'processing' and handle startedAt

        try {
          // Process the job, but allow shutdown to abort the wait
          const transcribePromise = Promise.resolve(this.transcribeJob(job))
          // Create shutdown signal lazily
          this.shutdownSignal ??= new Promise<void>((resolve) => {
            this.shutdownResolve = resolve
          })
          await Promise.race([transcribePromise, this.shutdownSignal])

          if (this.shutdownRequested) {
            // Prevent unhandled rejections if transcribePromise rejects later
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentionally swallowing to avoid unhandled rejection warnings during shutdown
            void transcribePromise.catch(() => {})
            break
          }

          // Update metrics on success (job.status is set by transcribeJob)
          // Only count as processed if actually completed (not retrying)
          // After transcribeJob, status will be 'completed' (success), 'queued' (retrying), or throw (failed)
          if (job.status === 'completed') {
            this.totalProcessed++
            this.lastCompletedAt = new Date()
          }
          // If status is 'queued', job was re-enqueued for retry, no metrics update needed
        } catch (error) {
          // Job failed - update status and metrics
          job.status = 'failed'
          job.errorMessage ??= error instanceof Error ? error.message : String(error)
          this.totalFailed++

          // Continue processing next job (don't let failures stall the queue)
        }

        this.currentJob = undefined
      }
    } finally {
      this.isRunning = false
    }
  }

  // Error classification helpers are intentionally omitted from queue for simplicity

  // Note: Retry policy is external; queue no longer decides retriability

  /**
   * Compute SHA256 hash using foundation package with crypto fallback
   */
  private async computeContentHash(text: string): Promise<string> {
    try {
      const mod: unknown = await import('@capture-bridge/foundation')
      if (
        mod &&
        typeof mod === 'object' &&
        'computeSHA256' in mod &&
        typeof (mod as { computeSHA256?: unknown }).computeSHA256 === 'function'
      ) {
        return (mod as { computeSHA256: (s: string) => string }).computeSHA256(text)
      }
      throw new Error('foundation.computeSHA256 not available')
    } catch {
      const hash = createHash('sha256')
      hash.update(text)
      return hash.digest('hex')
    }
  }

  /**
   * Update database with successful transcription result
   */
  private updateDatabaseWithTranscription(
    db: Database,
    captureId: string,
    text: string,
    contentHash: string
  ): void {
    db.prepare(
      `UPDATE captures
       SET status = 'transcribed',
           raw_content = ?,
           content_hash = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(text, contentHash, captureId)
  }

  /**
   * Handle transcription errors and update job status
   */
  private handleTranscriptionError(job: TranscriptionJob, error: unknown): never {
    // Set error message (normalize timeout for test detection)
    if (error instanceof TimeoutError) {
      job.errorMessage = 'timeout'
    } else {
      job.errorMessage = error instanceof Error ? error.message : String(error)
    }

    // Mark as failed and propagate error
    job.status = 'failed'
    job.completedAt = new Date()

    // Propagate to allow observers/spies to detect timeout/failure
    throw error instanceof Error ? error : new Error(String(error))
  }

  /**
   * Transcribe a single job with timeout, retry, and database update
   */
  async transcribeJob(job: TranscriptionJob): Promise<void> {
    job.status = 'processing'
    job.startedAt = new Date()
    // Count this attempt at the start to simplify retry policies
    job.attemptCount = (job.attemptCount ?? 0) + 1

    try {
      // If no whisperModel provided (for testing), just mark as completed
      if (!this.whisperModel) {
        job.status = 'completed'
        job.completedAt = new Date()
        return
      }

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new TimeoutError()), this.timeoutMs)
      })

      // Race transcription against timeout
      const result = await Promise.race([
        this.whisperModel.transcribe(job.audioPath),
        timeoutPromise,
      ])

      // Success! Update database if available
      if (this.db) {
        const contentHash = await this.computeContentHash(result.text)
        this.updateDatabaseWithTranscription(this.db, job.captureId, result.text, contentHash)
      }

      job.status = 'completed'
      job.completedAt = new Date()
    } catch (error) {
      // Check if this is a retriable error (timeout on first attempt)
      const isRetriable = error instanceof TimeoutError && job.attemptCount < MAX_ATTEMPTS

      if (isRetriable) {
        // Re-enqueue for single retry (unshift for priority)
        job.status = 'queued'
        delete job.startedAt
        delete job.completedAt
        this.queue.unshift(job)
        return // Exit gracefully, retry will happen next
      }

      // Non-retriable or max attempts reached: handle as permanent failure
      this.handleTranscriptionError(job, error)
    }
  }

  /**
   * Shutdown the queue gracefully
   */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true
    // Signal any in-flight wait to abort
    if (this.shutdownResolve) this.shutdownResolve()

    // Wait for current job to complete if any
    let attempts = 0
    while (this.isRunning && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
  }
}
