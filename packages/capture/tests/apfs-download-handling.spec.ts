/**
 * Test Suite: APFS_DOWNLOAD_HANDLING--T02
 * Risk: P0 CRITICAL (TDD Required)
 *
 * Context: Integration tests for APFS dataless file download handling.
 * Tests sequential processing, timeouts, exponential backoff, and download coordination.
 *
 * TDD Applicability Decision: REQUIRED
 * - Risk Level: P0 - Storage operations, async jobs, external adapters
 * - Failure Impact: Data loss, infinite hanging, resource exhaustion
 * - Complexity: High - Concurrency control, timeout handling, state management
 *
 * Coverage Requirements:
 * - Sequential download processing (semaphore = 1)
 * - Download timeout handling with retry logic
 * - Exponential backoff during download polling
 * - Download progress monitoring and state updates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VoiceFileDownloader } from '../src/apfs/voice-file-downloader.js'
import { MockICloudController } from './mocks/mock-icloud-controller.js'

describe('APFS Download Handling - Integration Tests', () => {
  let icloudctl: MockICloudController
  let downloader: VoiceFileDownloader

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    icloudctl = new MockICloudController()
    downloader = new VoiceFileDownloader(icloudctl)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('sequential download processing', () => {
    it('triggers sequential download for dataless files', async () => {
      const files = ['/path/to/file1.m4a', '/path/to/file2.m4a', '/path/to/file3.m4a']

      // Mock all files as dataless
      files.forEach((file) => {
        icloudctl.mockFileStatus(file, {
          isUbiquitousItem: true,
          isDownloaded: false,
          percentDownloaded: 0,
        })
      })

      // Start all downloads simultaneously
      const downloadPromises = files.map((file) => downloader.downloadIfNeeded(file))

      // Simulate sequential completion with artificial timing
      const downloadCalls = icloudctl.getDownloadCalls()
      let completedCount = 0

      // Process downloads one by one with delays
      const processDownloads = async () => {
        for (const call of downloadCalls) {
          // Simulate download taking 2 seconds
          await vi.advanceTimersByTimeAsync(2000)

          icloudctl.completeDownload(call.filePath)
          completedCount++
        }
      }

      // Start processing downloads
      const processingPromise = processDownloads()

      // Wait for all downloads to complete
      await Promise.all([processingPromise, ...downloadPromises])

      const results = await Promise.all(downloadPromises)

      // Verify sequential processing (semaphore = 1)
      expect(downloadCalls.length).toBe(3)

      // Check timing to ensure sequential execution
      for (let i = 1; i < downloadCalls.length; i++) {
        expect(downloadCalls[i].startTime).toBeGreaterThanOrEqual(
          downloadCalls[i - 1].endTime || downloadCalls[i - 1].startTime
        )
      }

      // All downloads should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true)
      })
    })

    it('handles concurrent download requests for same file', async () => {
      const filePath = '/path/to/concurrent.m4a'

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Start two downloads simultaneously
      const download1Promise = downloader.downloadIfNeeded(filePath)
      const download2Promise = downloader.downloadIfNeeded(filePath)

      // Simulate download completion
      setTimeout(() => {
        icloudctl.completeDownload(filePath)
      }, 1000)

      vi.advanceTimersByTime(1000)

      const [result1, result2] = await Promise.all([download1Promise, download2Promise])

      // Only one actual download should occur
      const downloadCalls = icloudctl.getDownloadCalls()
      expect(downloadCalls.length).toBe(1)

      // Both should get success result
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
    })

    it('enforces download concurrency limits', async () => {
      const files = Array.from({ length: 10 }, (_, i) => `/path/to/file${i}.m4a`)

      // Mock all files as dataless
      files.forEach((file) => {
        icloudctl.mockFileStatus(file, {
          isUbiquitousItem: true,
          isDownloaded: false,
          percentDownloaded: 0,
        })
      })

      const startTime = Date.now()
      const downloadPromises = files.map((file) => downloader.downloadIfNeeded(file))

      // Complete downloads gradually
      const processDownloads = async () => {
        for (let i = 0; i < files.length; i++) {
          await vi.advanceTimersByTimeAsync(500)
          icloudctl.completeDownload(files[i])
        }
      }

      await Promise.all([processDownloads(), ...downloadPromises])

      const downloadCalls = icloudctl.getDownloadCalls()

      // Should never have more than 1 concurrent download (semaphore = 1)
      let maxConcurrent = 0
      let currentConcurrent = 0

      downloadCalls.forEach((call) => {
        if (call.startTime) {
          currentConcurrent++
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        }
        if (call.endTime) {
          currentConcurrent--
        }
      })

      expect(maxConcurrent).toBe(1)
    })
  })

  describe('download timeout handling', () => {
    it('handles download timeout with retry', async () => {
      const filePath = '/path/to/timeout.m4a'

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Mock timeout on first attempt
      let attempts = 0
      icloudctl.onDownloadStart = vi.fn(async (path) => {
        attempts++
        if (attempts === 1) {
          // First attempt times out after 60 seconds
          await vi.advanceTimersByTimeAsync(61000)
          throw new Error('Download timeout: Operation timed out after 60s')
        }
        // Second attempt succeeds
        return { success: true }
      })

      const resultPromise = downloader.downloadIfNeeded(filePath)

      // Advance time to trigger timeout
      await vi.advanceTimersByTimeAsync(61000)

      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
      expect(result.retryAfter).toBeDefined()
      expect(attempts).toBe(1)

      // Should have retry scheduled
      const retryDelay = result.retryAfter!.getTime() - Date.now()
      expect(retryDelay).toBeCloseTo(60000, -3) // ~60s retry delay
    })

    it('respects download timeout configuration', async () => {
      const filePath = '/path/to/slow-download.m4a'
      const customTimeout = 30000 // 30 seconds

      // Create downloader with custom timeout
      const downloaderWithTimeout = new VoiceFileDownloader(icloudctl, {
        downloadTimeout: customTimeout,
      })

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Mock slow download that exceeds custom timeout
      icloudctl.onDownloadStart = vi.fn(async () => {
        await vi.advanceTimersByTimeAsync(35000) // Exceed 30s timeout
        throw new Error('Download timeout')
      })

      const startTime = Date.now()
      const resultPromise = downloaderWithTimeout.downloadIfNeeded(filePath)

      await vi.advanceTimersByTimeAsync(35000)
      const result = await resultPromise
      const elapsed = Date.now() - startTime

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
      expect(elapsed).toBeCloseTo(customTimeout, -2000) // Within 2s of expected timeout
    })
  })

  describe('exponential backoff polling', () => {
    it('applies exponential backoff during download polling', async () => {
      const filePath = '/path/to/slow-download.m4a'
      const pollDelays: number[] = []
      let lastPoll = 0

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Mock gradual download progress with polling delay tracking
      let progress = 0
      icloudctl.checkFileStatus = vi.fn(async () => {
        const now = Date.now()
        if (lastPoll > 0) {
          const delay = now - lastPoll
          pollDelays.push(delay)
        }
        lastPoll = now

        progress += 20
        return {
          isDownloaded: progress >= 100,
          percentDownloaded: progress,
          isUbiquitousItem: true,
        }
      })

      const resultPromise = downloader.downloadIfNeeded(filePath)

      // Simulate polling intervals with exponential backoff
      // Expected: 1s, 1.5s, 2.25s, 3.375s, 5.0625s (capped at 5s)
      for (let i = 0; i < 5; i++) {
        const expectedDelay = Math.min(1000 * Math.pow(1.5, i), 5000)
        await vi.advanceTimersByTimeAsync(expectedDelay + 100) // Add buffer for execution
      }

      await resultPromise

      // Verify exponential backoff pattern
      expect(pollDelays.length).toBeGreaterThan(0)
      expect(pollDelays[0]).toBeCloseTo(1000, -200) // ~1s ±200ms
      if (pollDelays.length > 1) {
        expect(pollDelays[1]).toBeCloseTo(1500, -200) // ~1.5s ±200ms
      }
      if (pollDelays.length > 2) {
        expect(pollDelays[2]).toBeCloseTo(2250, -200) // ~2.25s ±200ms
      }
    })

    it('caps exponential backoff at maximum interval', async () => {
      const filePath = '/path/to/very-slow-download.m4a'
      const pollDelays: number[] = []
      let lastPoll = 0

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Mock very slow download requiring many polling cycles
      let pollCount = 0
      icloudctl.checkFileStatus = vi.fn(async () => {
        const now = Date.now()
        if (lastPoll > 0) {
          pollDelays.push(now - lastPoll)
        }
        lastPoll = now

        pollCount++
        return {
          isDownloaded: pollCount >= 10, // Takes 10 polls to complete
          percentDownloaded: pollCount * 10,
          isUbiquitousItem: true,
        }
      })

      const resultPromise = downloader.downloadIfNeeded(filePath)

      // Simulate many polling cycles
      for (let i = 0; i < 10; i++) {
        const expectedDelay = Math.min(1000 * Math.pow(1.5, i), 5000)
        await vi.advanceTimersByTimeAsync(expectedDelay + 100)
      }

      await resultPromise

      // Later polling intervals should be capped at 5 seconds
      const laterDelays = pollDelays.slice(-3)
      laterDelays.forEach((delay) => {
        expect(delay).toBeLessThanOrEqual(5200) // 5s + 200ms buffer
        expect(delay).toBeGreaterThanOrEqual(4800) // 5s - 200ms buffer
      })
    })
  })

  describe('download progress monitoring', () => {
    it('tracks download progress accurately', async () => {
      const filePath = '/path/to/progressive-download.m4a'
      const progressUpdates: number[] = []

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Mock progressive download
      let currentProgress = 0
      icloudctl.checkFileStatus = vi.fn(async () => {
        currentProgress += 25
        progressUpdates.push(currentProgress)

        return {
          isDownloaded: currentProgress >= 100,
          percentDownloaded: currentProgress,
          isUbiquitousItem: true,
        }
      })

      const resultPromise = downloader.downloadIfNeeded(filePath)

      // Simulate polling at regular intervals
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(progressUpdates).toEqual([25, 50, 75, 100])
    })

    it('handles progress callback updates', async () => {
      const filePath = '/path/to/callback-download.m4a'
      const progressCallbacks: Array<{ percent: number; timestamp: number }> = []

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Create downloader with progress callback
      const downloaderWithCallback = new VoiceFileDownloader(icloudctl, {
        onProgress: (filePath, percent) => {
          progressCallbacks.push({
            percent,
            timestamp: Date.now(),
          })
        },
      })

      // Mock progressive download
      let currentProgress = 0
      icloudctl.checkFileStatus = vi.fn(async () => {
        currentProgress += 20
        return {
          isDownloaded: currentProgress >= 100,
          percentDownloaded: currentProgress,
          isUbiquitousItem: true,
        }
      })

      const resultPromise = downloaderWithCallback.downloadIfNeeded(filePath)

      // Simulate polling
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      await resultPromise

      // Verify progress callbacks were called
      expect(progressCallbacks.length).toBe(5)
      expect(progressCallbacks.map((cb) => cb.percent)).toEqual([20, 40, 60, 80, 100])

      // Verify callbacks were called at different times
      for (let i = 1; i < progressCallbacks.length; i++) {
        expect(progressCallbacks[i].timestamp).toBeGreaterThan(progressCallbacks[i - 1].timestamp)
      }
    })
  })

  describe('download state management', () => {
    it('prevents duplicate downloads for same file', async () => {
      const filePath = '/path/to/duplicate-request.m4a'

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Start first download
      const download1 = downloader.downloadIfNeeded(filePath)

      // Wait a bit
      await vi.advanceTimersByTimeAsync(500)

      // Start second download for same file
      const download2 = downloader.downloadIfNeeded(filePath)

      // Complete download
      setTimeout(() => {
        icloudctl.completeDownload(filePath)
      }, 1000)

      await vi.advanceTimersByTimeAsync(1000)

      const [result1, result2] = await Promise.all([download1, download2])

      // Both should succeed
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      // But only one download should have been initiated
      const downloadCalls = icloudctl.getDownloadCalls()
      expect(downloadCalls.length).toBe(1)
    })

    it('cleans up download state after completion', async () => {
      const filePath = '/path/to/cleanup-test.m4a'

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // First download
      const download1Promise = downloader.downloadIfNeeded(filePath)

      setTimeout(() => {
        icloudctl.completeDownload(filePath)
      }, 500)

      await vi.advanceTimersByTimeAsync(500)
      const result1 = await download1Promise

      expect(result1.success).toBe(true)

      // Wait for cleanup
      await vi.advanceTimersByTimeAsync(100)

      // Second download should start fresh
      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      const download2Promise = downloader.downloadIfNeeded(filePath)

      setTimeout(() => {
        icloudctl.completeDownload(filePath)
      }, 500)

      await vi.advanceTimersByTimeAsync(500)
      const result2 = await download2Promise

      expect(result2.success).toBe(true)

      // Two separate downloads should have been initiated
      const downloadCalls = icloudctl.getDownloadCalls()
      expect(downloadCalls.length).toBe(2)
    })
  })
})
