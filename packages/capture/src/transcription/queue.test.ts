import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Type definitions
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

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

// Helper function to reduce nesting
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('TranscriptionQueue', () => {
  // Track resources for cleanup
  const queues: Array<{ shutdown: () => Promise<void> }> = []
  const databases: Array<{ close: () => void }> = []

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    // 0. Custom resources (queues)
    for (const queue of queues) {
      try {
        await queue.shutdown()
      } catch {
        // Ignore cleanup errors - safe in cleanup context
      }
    }
    queues.length = 0

    // 1. Settle
    await delay(100)

    // 3. Close databases
    for (const db of databases) {
      try {
        db.close()
      } catch {
        // Ignore cleanup errors
      }
    }
    databases.length = 0

    // 5. Force GC
    if (global.gc) global.gc()
  })

  describe('Sequential Processing (AC02)', () => {
    it('should enforce concurrency=1 with non-reentrant guard', async () => {
      // This will FAIL because TranscriptionQueue doesn't exist yet
      const { TranscriptionQueue } = await import('./queue.js')

      const queue = new TranscriptionQueue()
      queues.push(queue)

      // Mock transcribeJob to track execution
      let activeJobs = 0
      let maxConcurrentJobs = 0

      // Replace transcribeJob with mock that tracks concurrency
      const mockTranscribeJob = async (job: TranscriptionJob) => {
        activeJobs++
        maxConcurrentJobs = Math.max(maxConcurrentJobs, activeJobs)

        // Simulate work
        await delay(50)

        activeJobs--
        job.status = 'completed'
        job.completedAt = new Date()
      }
      queue.transcribeJob = vi.fn(mockTranscribeJob)

      // Enqueue multiple jobs rapidly
      const jobs: TranscriptionJob[] = [
        {
          captureId: 'capture-1',
          audioPath: '/path/to/audio1.m4a',
          audioFingerprint: 'fp1',
          status: 'queued',
          attemptCount: 0,
          queuedAt: new Date(),
        },
        {
          captureId: 'capture-2',
          audioPath: '/path/to/audio2.m4a',
          audioFingerprint: 'fp2',
          status: 'queued',
          attemptCount: 0,
          queuedAt: new Date(),
        },
        {
          captureId: 'capture-3',
          audioPath: '/path/to/audio3.m4a',
          audioFingerprint: 'fp3',
          status: 'queued',
          attemptCount: 0,
          queuedAt: new Date(),
        },
      ]

      // Enqueue all jobs simultaneously
      await Promise.all(
        jobs.map((job) => {
          queue.enqueue(job)
          return Promise.resolve()
        })
      )

      // Wait for all jobs to complete
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Verify only 1 job was processing at any time
      expect(maxConcurrentJobs).toBe(1)
      expect(queue.transcribeJob).toHaveBeenCalledTimes(3)
    })

    it('should process jobs in FIFO order', async () => {
      const { TranscriptionQueue } = await import('./queue.js')

      const queue = new TranscriptionQueue()
      queues.push(queue)

      const processedOrder: string[] = []

      // Mock transcribeJob to track order
      const mockTrackOrder = async (job: TranscriptionJob) => {
        processedOrder.push(job.captureId)
        await delay(10)
        job.status = 'completed'
      }
      queue.transcribeJob = vi.fn(mockTrackOrder)

      // Enqueue jobs
      await queue.enqueue({
        captureId: 'first',
        audioPath: '/path/1.m4a',
        audioFingerprint: 'fp1',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      })

      await queue.enqueue({
        captureId: 'second',
        audioPath: '/path/2.m4a',
        audioFingerprint: 'fp2',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      })

      await queue.enqueue({
        captureId: 'third',
        audioPath: '/path/3.m4a',
        audioFingerprint: 'fp3',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      })

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(processedOrder).toEqual(['first', 'second', 'third'])
    })

    it('should enforce backpressure threshold', async () => {
      const { TranscriptionQueue, BackpressureError, MAX_QUEUE_DEPTH } = await import('./queue.js')

      const queue = new TranscriptionQueue()
      queues.push(queue)

      // Mock transcribeJob to never complete (simulating slow processing)
      // Create a promise that never resolves outside the function to reduce nesting
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const neverResolve = new Promise(() => {})
      const mockNeverComplete = async () => {
        await neverResolve // Never resolves
      }
      queue.transcribeJob = vi.fn(mockNeverComplete)

      // Fill up to MAX_QUEUE_DEPTH
      const jobs: TranscriptionJob[] = []
      for (let i = 0; i < MAX_QUEUE_DEPTH; i++) {
        jobs.push({
          captureId: `capture-${i}`,
          audioPath: `/path/${i}.m4a`,
          audioFingerprint: `fp${i}`,
          status: 'queued',
          attemptCount: 0,
          queuedAt: new Date(),
        })
      }

      // First MAX_QUEUE_DEPTH jobs should succeed
      await Promise.all(
        jobs.map((job) => {
          queue.enqueue(job)
          return Promise.resolve()
        })
      )

      // The next one should throw BackpressureError
      const extraJob: TranscriptionJob = {
        captureId: 'overflow',
        audioPath: '/path/overflow.m4a',
        audioFingerprint: 'fp_overflow',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      }

      expect(() => queue.enqueue(extraJob)).toThrow(BackpressureError)
      expect(() => queue.enqueue(extraJob)).toThrow(/Queue depth exceeded/)
    })

    it('should track runtime status correctly', async () => {
      const { TranscriptionQueue } = await import('./queue.js')

      const queue = new TranscriptionQueue()
      queues.push(queue)

      let jobStarted = false
      let jobCompleteResolve: (() => void) | undefined
      const jobCompletePromise = new Promise<void>((resolve) => {
        jobCompleteResolve = resolve
      })

      // Mock transcribeJob with controllable timing
      const mockControlledTiming = async (job: TranscriptionJob) => {
        jobStarted = true
        job.status = 'processing'
        job.startedAt = new Date()

        // Wait for test to allow completion
        await jobCompletePromise

        job.status = 'completed'
        job.completedAt = new Date()
      }
      queue.transcribeJob = vi.fn(mockControlledTiming)

      // Initial status
      let status = queue.getStatus()
      expect(status.isProcessing).toBe(false)
      expect(status.currentJob).toBeUndefined()
      expect(status.queueDepth).toBe(0)
      expect(status.totalProcessed).toBe(0)

      // Enqueue a job
      const job: TranscriptionJob = {
        captureId: 'test-capture',
        audioPath: '/path/test.m4a',
        audioFingerprint: 'test-fp',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      }

      await queue.enqueue(job)

      // Wait for job to start processing
      await vi.waitFor(() => jobStarted)

      // Check status while processing
      status = queue.getStatus()
      expect(status.isProcessing).toBe(true)
      expect(status.currentJob).toBe('test-capture')
      expect(status.queueDepth).toBe(0) // Job moved from queue to processing

      // Complete the job
      if (jobCompleteResolve) {
        jobCompleteResolve()
      }
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Check final status
      status = queue.getStatus()
      expect(status.isProcessing).toBe(false)
      expect(status.currentJob).toBeUndefined()
      expect(status.totalProcessed).toBe(1)
      expect(status.lastCompletedAt).toBeDefined()
    })

    it('should handle job failures and track metrics', async () => {
      const { TranscriptionQueue } = await import('./queue.js')

      const queue = new TranscriptionQueue()
      queues.push(queue)

      // Mock transcribeJob to fail for specific job
      const mockFailSpecific = (job: TranscriptionJob): Promise<void> => {
        if (job.captureId === 'fail-job') {
          job.status = 'failed'
          job.errorMessage = 'Transcription failed'
          return Promise.reject(new Error('Transcription failed'))
        }
        job.status = 'completed'
        job.completedAt = new Date()
        return Promise.resolve()
      }
      queue.transcribeJob = vi.fn(mockFailSpecific)

      // Enqueue mixed success/failure jobs
      await queue.enqueue({
        captureId: 'success-1',
        audioPath: '/path/success1.m4a',
        audioFingerprint: 'fp1',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      })

      await queue.enqueue({
        captureId: 'fail-job',
        audioPath: '/path/fail.m4a',
        audioFingerprint: 'fp2',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      })

      await queue.enqueue({
        captureId: 'success-2',
        audioPath: '/path/success2.m4a',
        audioFingerprint: 'fp3',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      })

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 150))

      const status = queue.getStatus()
      expect(status.totalProcessed).toBe(2)
      expect(status.totalFailed).toBe(1)
      expect(status.isProcessing).toBe(false)
    })

    it('should continue processing after job failure', async () => {
      const { TranscriptionQueue } = await import('./queue.js')

      const queue = new TranscriptionQueue()
      queues.push(queue)

      const processedJobs: string[] = []

      // Mock transcribeJob to fail for second job
      const mockFailSecondJob = (job: TranscriptionJob): Promise<void> => {
        processedJobs.push(job.captureId)

        if (job.captureId === 'job-2') {
          job.status = 'failed'
          return Promise.reject(new Error('Job 2 failed'))
        }

        job.status = 'completed'
        return Promise.resolve()
      }
      queue.transcribeJob = vi.fn(mockFailSecondJob)

      // Enqueue 3 jobs
      for (let i = 1; i <= 3; i++) {
        await queue.enqueue({
          captureId: `job-${i}`,
          audioPath: `/path/job${i}.m4a`,
          audioFingerprint: `fp${i}`,
          status: 'queued',
          attemptCount: 0,
          queuedAt: new Date(),
        })
      }

      // Wait for all to process
      await new Promise((resolve) => setTimeout(resolve, 150))

      // All jobs should have been attempted
      expect(processedJobs).toEqual(['job-1', 'job-2', 'job-3'])
      expect(queue.transcribeJob).toHaveBeenCalledTimes(3)

      // Queue should be empty and not processing
      const status = queue.getStatus()
      expect(status.isProcessing).toBe(false)
      expect(status.queueDepth).toBe(0)
    })

    it('should retry once on timeout, succeed on second attempt', async () => {
      const { TranscriptionQueue, TimeoutError } = await import('./queue.js')
      const Database = (await import('better-sqlite3')).default

      const db = new Database(':memory:')
      databases.push(db)

      db.exec(`CREATE TABLE captures (
        id TEXT PRIMARY KEY, status TEXT NOT NULL,
        raw_content TEXT, content_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`)
      db.prepare('INSERT INTO captures (id, status) VALUES (?, ?)').run('retry-test', 'discovered')

      let callCount = 0
      const whisperModel = {
        transcribe: vi.fn(() => {
          callCount++
          if (callCount === 1) throw new TimeoutError()
          return Promise.resolve({ text: 'Success after retry', confidence: 0.95 })
        }),
      }

      const queue = new TranscriptionQueue(db, whisperModel, { timeoutMs: 30000 })
      queues.push(queue)

      queue.enqueue({
        captureId: 'retry-test',
        audioPath: '/path/audio.m4a',
        audioFingerprint: 'fp1',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      })

      await delay(300)

      expect(whisperModel.transcribe).toHaveBeenCalledTimes(2)
      expect(queue.getStatus().totalProcessed).toBe(1)

      const capture = db.prepare('SELECT status, raw_content FROM captures WHERE id = ?').get('retry-test') as {
        status: string
        raw_content: string
      }
      expect(capture.status).toBe('transcribed')
      expect(capture.raw_content).toBe('Success after retry')
    })

    it('should not retry on second timeout (max attempts reached)', async () => {
      const { TranscriptionQueue, TimeoutError } = await import('./queue.js')

      const whisperModel = {
        transcribe: vi.fn(() => {
          throw new TimeoutError()
        }),
      }

      const queue = new TranscriptionQueue(undefined, whisperModel, { timeoutMs: 30000 })
      queues.push(queue)

      const job: TranscriptionJob = {
        captureId: 'double-timeout',
        audioPath: '/path/audio.m4a',
        audioFingerprint: 'fp1',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      }

      queue.enqueue(job)
      await delay(300)

      expect(whisperModel.transcribe).toHaveBeenCalledTimes(2)
      expect(queue.getStatus().totalFailed).toBe(1)
      expect(job.status).toBe('failed')
      expect(job.attemptCount).toBe(2)
    })

    it('should not retry on non-timeout errors', async () => {
      const { TranscriptionQueue } = await import('./queue.js')

      const whisperModel = {
        transcribe: vi.fn(() => {
          throw new Error('File not found')
        }),
      }

      const queue = new TranscriptionQueue(undefined, whisperModel, { timeoutMs: 30000 })
      queues.push(queue)

      const job: TranscriptionJob = {
        captureId: 'non-timeout-error',
        audioPath: '/path/missing.m4a',
        audioFingerprint: 'fp1',
        status: 'queued',
        attemptCount: 0,
        queuedAt: new Date(),
      }

      queue.enqueue(job)
      await delay(200)

      // Should only be called once (no retry for non-timeout errors)
      expect(whisperModel.transcribe).toHaveBeenCalledTimes(1)
      expect(queue.getStatus().totalFailed).toBe(1)
      expect(job.status).toBe('failed')
      expect(job.attemptCount).toBe(1)
    })
  })

  describe('Memory Leak Prevention', () => {
    it('should not leak memory during repeated enqueue/process cycles', async () => {
      const { TranscriptionQueue } = await import('./queue.js')

      const queue = new TranscriptionQueue()
      queues.push(queue)

      // Mock instant processing to allow queue to drain quickly
      queue.transcribeJob = vi.fn(async (job: TranscriptionJob) => {
        job.status = 'completed'
        // Small delay to simulate minimal work
        await delay(1)
      })

      if (global.gc) global.gc()
      const before = process.memoryUsage().heapUsed

      // Process many jobs in batches to respect backpressure
      const totalJobs = 100
      const batchSize = 30 // Stay well below MAX_QUEUE_DEPTH of 50

      for (let batch = 0; batch < Math.ceil(totalJobs / batchSize); batch++) {
        const startIdx = batch * batchSize
        const endIdx = Math.min(startIdx + batchSize, totalJobs)

        // Enqueue a batch of jobs
        for (let i = startIdx; i < endIdx; i++) {
          await queue.enqueue({
            captureId: `capture-${i}`,
            audioPath: `/path/${i}.m4a`,
            audioFingerprint: `fp${i}`,
            status: 'queued',
            attemptCount: 0,
            queuedAt: new Date(),
          })
        }

        // Wait for batch to process before enqueueing more
        // This ensures we don't exceed MAX_QUEUE_DEPTH
        await new Promise((resolve) => setTimeout(resolve, 50))

        // Verify queue is draining
        const status = queue.getStatus()
        expect(status.queueDepth).toBeLessThanOrEqual(batchSize)
      }

      // Wait for final processing to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify all jobs were processed
      const finalStatus = queue.getStatus()
      expect(finalStatus.totalProcessed).toBe(totalJobs)
      expect(finalStatus.queueDepth).toBe(0)
      expect(finalStatus.isProcessing).toBe(false)

      if (global.gc) global.gc()
      await new Promise((resolve) => setTimeout(resolve, 100))
      const after = process.memoryUsage().heapUsed

      // Should not leak more than 5MB
      expect(after - before).toBeLessThan(5 * 1024 * 1024)
    })
  })
})
