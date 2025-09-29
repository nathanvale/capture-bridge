/* eslint-disable */
/**
 * Test Suite: APFS_EDGE_CASES--T04
 * Risk: P0 CRITICAL (TDD Required)
 *
 * Context: Edge case tests for APFS dataless file handling.
 * Tests race conditions, concurrent downloads, file deletion scenarios, and other edge cases.
 *
 * TDD Applicability Decision: REQUIRED
 * - Risk Level: P0 - Concurrency issues, data race conditions, resource management
 * - Failure Impact: Data corruption, resource leaks, undefined behavior
 * - Complexity: High - Multi-threaded scenarios, timing-dependent behavior
 *
 * Coverage Requirements:
 * - Race condition handling (file becomes dataless during processing)
 * - Concurrent download request deduplication
 * - File deletion during download scenarios
 * - Performance under load with large file libraries
 * - Cache coherency and memory management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VoiceFileDownloader } from '../src/apfs/voice-file-downloader.js'
import { handleDatalessFile } from '../src/apfs/dataless-handler.js'
import { processVoiceMemo } from '../src/capture/voice-processor.js'
import { getCaptureByPath } from '../src/capture/capture-queries.js'
import { MockICloudController } from './mocks/mock-icloud-controller.js'
import { createMemoryCache } from '../src/utils/memory-cache.js'

// Mock filesystem operations
const mockFs = {
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
}

vi.mock('node:fs', () => mockFs)

describe('APFS Edge Cases Tests', () => {
  let icloudctl: MockICloudController
  let downloader: VoiceFileDownloader

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    icloudctl = new MockICloudController()
    downloader = new VoiceFileDownloader(icloudctl)

    // Default filesystem mocks
    mockFs.existsSync.mockReturnValue(true)
    mockFs.statSync.mockReturnValue({
      size: 1024,
      mtime: new Date(),
      birthtime: new Date(),
      isFile: () => true,
      isDirectory: () => false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('race condition handling', () => {
    it('handles race condition: file becomes dataless during processing', async () => {
      const filePath = '/path/to/race-condition.m4a'

      let callCount = 0
      icloudctl.checkFileStatus = vi.fn(async () => {
        callCount++
        // First call: file is downloaded
        if (callCount === 1) {
          return { isDownloaded: true, isUbiquitousItem: true, percentDownloaded: 100 }
        }
        // Second call: file evicted (became dataless)
        return { isDownloaded: false, isUbiquitousItem: true, percentDownloaded: 0 }
      })

      const result = await processVoiceMemo(filePath)

      expect(result.status).toBe('retry_needed')
      expect(result.reason).toContain('became dataless')
      expect(result.retryAfter).toBeDefined()

      // Should schedule retry for next processing cycle
      const retryDelay = result.retryAfter!.getTime() - Date.now()
      expect(retryDelay).toBeGreaterThan(0)
      expect(retryDelay).toBeLessThanOrEqual(300000) // Max 5 minutes
    })

    it('handles file state changes during download', async () => {
      const filePath = '/path/to/state-change.m4a'

      // Mock file that changes state during download
      let downloadStarted = false
      icloudctl.checkFileStatus = vi.fn(async () => {
        if (!downloadStarted) {
          return { isDownloaded: false, isUbiquitousItem: true, percentDownloaded: 0 }
        }
        // File becomes non-ubiquitous during download (e.g., moved out of iCloud)
        return { isDownloaded: false, isUbiquitousItem: false, percentDownloaded: 50 }
      })

      icloudctl.onDownloadStart = vi.fn(async () => {
        downloadStarted = true
        // Simulate delay during which file state changes
        await new Promise((resolve) => setTimeout(resolve, 1000))
      })

      const result = await downloader.downloadIfNeeded(filePath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('no longer ubiquitous' || 'state changed')
    })

    it('detects and handles concurrent file modifications', async () => {
      const filePath = '/path/to/concurrent-modification.m4a'

      // Mock scenario where file is modified by another process
      let modificationTime = new Date('2025-09-29T10:00:00Z')

      mockFs.statSync.mockImplementation(() => {
        // File modification time changes during processing
        modificationTime = new Date(modificationTime.getTime() + 60000) // +1 minute
        return {
          size: 1024,
          mtime: modificationTime,
          birthtime: new Date('2025-09-29T09:00:00Z'),
          isFile: () => true,
          isDirectory: () => false,
        }
      })

      const initialStat = mockFs.statSync(filePath)

      // Simulate processing delay
      await vi.advanceTimersByTimeAsync(2000)

      const finalStat = mockFs.statSync(filePath)

      // Should detect file modification during processing
      expect(finalStat.mtime.getTime()).toBeGreaterThan(initialStat.mtime.getTime())

      const result = await processVoiceMemo(filePath)
      expect(result.status).toBe('retry_needed')
      expect(result.reason).toContain('modified during processing')
    })
  })

  describe('concurrent download handling', () => {
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

      // Simulate download completion after delay
      setTimeout(() => {
        icloudctl.completeDownload(filePath)
      }, 1000)

      await vi.advanceTimersByTimeAsync(1000)

      const [result1, result2] = await Promise.all([download1Promise, download2Promise])

      // Only one actual download should occur
      expect(icloudctl.startDownload).toHaveBeenCalledTimes(1)

      // Both should get success result
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      // Should be same operation (shared promise)
      expect(result1).toEqual(result2)
    })

    it('handles burst of concurrent requests efficiently', async () => {
      const files = Array.from({ length: 20 }, (_, i) => `/path/to/burst-${i}.m4a`)

      // Mock all files as dataless
      files.forEach((file) => {
        icloudctl.mockFileStatus(file, {
          isUbiquitousItem: true,
          isDownloaded: false,
          percentDownloaded: 0,
        })
      })

      const startTime = Date.now()

      // Start all downloads simultaneously
      const downloadPromises = files.map((file) => downloader.downloadIfNeeded(file))

      // Complete downloads with staggered timing
      files.forEach((file, index) => {
        setTimeout(
          () => {
            icloudctl.completeDownload(file)
          },
          100 + index * 50
        ) // Stagger completions
      })

      // Advance time to complete all downloads
      await vi.advanceTimersByTimeAsync(2000)

      const results = await Promise.all(downloadPromises)
      const duration = Date.now() - startTime

      // All downloads should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true)
      })

      // Should respect concurrency limits (sequential processing)
      const downloadCalls = icloudctl.getDownloadCalls()
      expect(downloadCalls.length).toBe(files.length)

      // Verify sequential execution pattern
      for (let i = 1; i < downloadCalls.length; i++) {
        expect(downloadCalls[i].startTime).toBeGreaterThanOrEqual(downloadCalls[i - 1].startTime)
      }

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000) // Less than 5 seconds
    })

    it('maintains download state consistency under high concurrency', async () => {
      const filePath = '/path/to/high-concurrency.m4a'

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Start many concurrent requests for same file
      const requestCount = 50
      const downloadPromises = Array.from({ length: requestCount }, () =>
        downloader.downloadIfNeeded(filePath)
      )

      // Complete download after brief delay
      setTimeout(() => {
        icloudctl.completeDownload(filePath)
      }, 500)

      await vi.advanceTimersByTimeAsync(500)

      const results = await Promise.all(downloadPromises)

      // All requests should get same result
      results.forEach((result) => {
        expect(result.success).toBe(true)
        expect(result.filePath).toBe(filePath)
      })

      // Should only trigger one actual download
      expect(icloudctl.startDownload).toHaveBeenCalledTimes(1)
      expect(icloudctl.getDownloadCalls().length).toBe(1)
    })
  })

  describe('file deletion scenarios', () => {
    it('handles file deletion during download', async () => {
      const filePath = '/path/to/deleted.m4a'

      icloudctl.mockFileStatus(filePath, {
        isUbiquitousItem: true,
        isDownloaded: false,
        percentDownloaded: 0,
      })

      // Start download
      const downloadPromise = handleDatalessFile(filePath)

      // Simulate file deletion mid-download
      setTimeout(() => {
        mockFs.existsSync.mockImplementation((path) => {
          return path !== filePath // File no longer exists
        })
        mockFs.unlinkSync(filePath) // Trigger deletion
      }, 100)

      await vi.advanceTimersByTimeAsync(100)

      const result = await downloadPromise

      expect(result.ready).toBe(false)
      expect(result.error).toContain('File not found' || 'no longer exists')

      // Should mark as permanent error (no retry)
      const capture = await getCaptureByPath(filePath)
      expect(capture.status).toBe('error')
      expect(capture.metadata.error.permanent).toBe(true)
      expect(capture.metadata.error.reason).toContain('file_deleted')
    })

    it('handles directory deletion containing voice files', async () => {
      const directory = '/path/to/voice-memos'
      const files = [
        `${directory}/recording1.m4a`,
        `${directory}/recording2.m4a`,
        `${directory}/recording3.m4a`,
      ]

      // Mock files initially exist
      files.forEach((file) => {
        icloudctl.mockFileStatus(file, {
          isUbiquitousItem: true,
          isDownloaded: false,
          percentDownloaded: 0,
        })
      })

      // Start processing all files
      const processingPromises = files.map((file) => processVoiceMemo(file))

      // Simulate directory deletion during processing
      setTimeout(() => {
        mockFs.existsSync.mockImplementation((path) => {
          return !path.startsWith(directory) // Directory and contents deleted
        })
      }, 200)

      await vi.advanceTimersByTimeAsync(200)

      const results = await Promise.all(processingPromises)

      // All should fail with file not found
      results.forEach((result) => {
        expect(result.status).toBe('error')
        expect(result.error).toContain('not found' || 'deleted')
      })

      // Should log batch deletion event
      const captures = await Promise.all(files.map(getCaptureByPath))
      captures.forEach((capture) => {
        expect(capture.metadata.error.batch_deletion).toBe(true)
        expect(capture.metadata.error.affected_directory).toBe(directory)
      })
    })

    it('gracefully handles placeholder file deletion', async () => {
      const filePath = '/path/to/placeholder-deleted.m4a'
      const icloudPath = '/path/to/.placeholder-deleted.m4a.icloud'

      // Initially, only .icloud placeholder exists
      mockFs.existsSync.mockImplementation((path) => {
        if (path === filePath) return false
        if (path === icloudPath) return true
        return false
      })

      const processingPromise = processVoiceMemo(filePath)

      // Delete .icloud placeholder during processing
      setTimeout(() => {
        mockFs.existsSync.mockImplementation(() => false)
      }, 150)

      await vi.advanceTimersByTimeAsync(150)

      const result = await processingPromise

      expect(result.status).toBe('error')
      expect(result.error).toContain('placeholder deleted' || 'icloud file removed')

      // Should distinguish from regular file deletion
      const capture = await getCaptureByPath(filePath)
      expect(capture.metadata.error.error_type).toBe('icloud_placeholder_deleted')
    })
  })

  describe('performance under load', () => {
    it('processes large voice memo library efficiently', async () => {
      // Create 1000 mock voice memos
      const files = Array.from(
        { length: 1000 },
        (_, i) => `/path/to/Recording-${String(i).padStart(4, '0')}.m4a`
      )

      // 10% are dataless (need download)
      const datalessFiles = files.slice(0, 100)
      datalessFiles.forEach((file) => {
        icloudctl.mockFileStatus(file, {
          isUbiquitousItem: true,
          isDownloaded: false,
          percentDownloaded: 0,
        })
      })

      // Rest are already downloaded
      files.slice(100).forEach((file) => {
        icloudctl.mockFileStatus(file, {
          isUbiquitousItem: true,
          isDownloaded: true,
          percentDownloaded: 100,
        })
      })

      const startTime = Date.now()
      const results = await Promise.all(files.map((file) => processVoiceMemo(file)))
      const duration = Date.now() - startTime

      // Should process all files
      expect(results.length).toBe(1000)

      // Should have no errors for already downloaded files
      const downloadedResults = results.slice(100)
      downloadedResults.forEach((result) => {
        expect(result.status).toBe('success')
      })

      // Should handle dataless files appropriately
      const datalessResults = results.slice(0, 100)
      datalessResults.forEach((result) => {
        expect(['success', 'retry_needed', 'downloading']).toContain(result.status)
      })

      // Should complete within reasonable time (< 30s for 1000 files)
      expect(duration).toBeLessThan(30000)

      // Should batch process to avoid memory overload
      const memoryUsage = process.memoryUsage().rss / 1e6
      expect(memoryUsage).toBeLessThan(500) // Less than 500MB
    })

    it('uses LRU cache to avoid redundant fingerprinting', async () => {
      const filePath = '/path/to/cached.m4a'
      const cache = createMemoryCache({ maxSize: 100 })

      // Process same file multiple times
      const results = []
      for (let i = 0; i < 10; i++) {
        const result = await processVoiceMemo(filePath, { cache })
        results.push(result)
      }

      // Should only fingerprint once (subsequent calls use cache)
      expect(results.length).toBe(10)
      results.forEach((result) => {
        expect(result.status).toBe('success')
        expect(result.fromCache).toBe(i > 0) // First call not from cache
      })

      // Verify cache hit ratio
      const cacheStats = cache.getStats()
      expect(cacheStats.hitRate).toBeGreaterThan(0.8) // > 80% hit rate
    })

    it('handles memory pressure gracefully', async () => {
      const files = Array.from(
        { length: 5000 },
        (_, i) => `/path/to/large-library/Recording-${i}.m4a`
      )

      // Simulate memory pressure by limiting cache size
      const limitedCache = createMemoryCache({ maxSize: 50 })

      // Process files in batches to simulate real usage
      const batchSize = 100
      const results = []

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)
        const batchResults = await Promise.all(
          batch.map((file) => processVoiceMemo(file, { cache: limitedCache }))
        )
        results.push(...batchResults)

        // Force garbage collection simulation
        if (i % 500 === 0) {
          limitedCache.clear()
        }
      }

      expect(results.length).toBe(files.length)

      // Should complete without memory errors
      const finalMemory = process.memoryUsage().rss / 1e6
      expect(finalMemory).toBeLessThan(1000) // Less than 1GB

      // Cache should maintain reasonable hit rate despite evictions
      const finalStats = limitedCache.getStats()
      expect(finalStats.hitRate).toBeGreaterThan(0.3) // > 30% hit rate
    })
  })

  describe('system resource management', () => {
    it('cleans up resources on process termination', async () => {
      const activeDownloads = [
        '/path/to/download1.m4a',
        '/path/to/download2.m4a',
        '/path/to/download3.m4a',
      ]

      // Start multiple downloads
      const downloadPromises = activeDownloads.map((file) => {
        icloudctl.mockFileStatus(file, {
          isUbiquitousItem: true,
          isDownloaded: false,
          percentDownloaded: 0,
        })
        return downloader.downloadIfNeeded(file)
      })

      // Simulate process termination signal
      process.emit('SIGTERM')

      // Wait for cleanup
      await vi.advanceTimersByTimeAsync(1000)

      // Should cancel active downloads
      const downloadCalls = icloudctl.getDownloadCalls()
      downloadCalls.forEach((call) => {
        expect(call.cancelled || call.endTime).toBeDefined()
      })

      // Promises should reject with cancellation error
      await expect(Promise.all(downloadPromises)).rejects.toThrow('cancelled')
    })

    it('handles file descriptor exhaustion gracefully', async () => {
      // Simulate many concurrent file operations
      const files = Array.from({ length: 2000 }, (_, i) => `/path/to/fd-test/file-${i}.m4a`)

      // Mock file descriptor limit reached
      let fdCount = 0
      const maxFds = 100

      mockFs.statSync.mockImplementation((path) => {
        fdCount++
        if (fdCount > maxFds) {
          const error = new Error('EMFILE: too many open files')
          ;(error as any).code = 'EMFILE'
          throw error
        }
        return {
          size: 1024,
          mtime: new Date(),
          birthtime: new Date(),
          isFile: () => true,
          isDirectory: () => false,
        }
      })

      const results = await Promise.all(files.map((file) => processVoiceMemo(file)))

      // Should handle EMFILE errors gracefully
      const errors = results.filter((r) => r.status === 'error')
      const successes = results.filter((r) => r.status === 'success')

      expect(successes.length).toBe(maxFds)
      expect(errors.length).toBe(files.length - maxFds)

      errors.forEach((error) => {
        expect(error.error).toContain('too many open files' || 'EMFILE')
        expect(error.retryAfter).toBeDefined() // Should allow retry later
      })
    })
  })
})
