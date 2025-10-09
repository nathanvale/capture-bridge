/**
 * Sequential transcription queue with concurrency=1 and backpressure control
 * Implements AC02: Sequential processing with non-reentrant guard
 */

export const MAX_QUEUE_DEPTH = 256

export class BackpressureError extends Error {
  constructor() {
    super(`Queue depth exceeded: Maximum ${MAX_QUEUE_DEPTH} jobs allowed`)
    this.name = 'BackpressureError'
  }
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
        job.status = 'processing'
        job.startedAt = new Date()

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
          this.totalProcessed++
          this.lastCompletedAt = new Date()
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

  /**
   * Transcribe a single job
   * This method is meant to be overridden/mocked in tests
   */
  transcribeJob(job: TranscriptionJob): void | Promise<void> {
    // Default implementation - will be replaced in tests or actual implementation
    job.status = 'completed'
    job.completedAt = new Date()
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
