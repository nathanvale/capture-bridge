/* eslint-disable */
/**
 * Mock iCloud Controller for Testing
 *
 * Provides a deterministic mock implementation of iCloudController
 * following TestKit mock-first patterns for APFS dataless file testing.
 */

import type { ICloudController, FileStatus } from '../../src/apfs/voice-file-downloader.js'

export interface DownloadCall {
  filePath: string
  startTime: number
  endTime?: number
}

export class MockICloudController implements ICloudController {
  private fileStatuses = new Map<string, FileStatus>()
  private downloadCalls: DownloadCall[] = []
  private completedDownloads = new Set<string>()

  // Mock functions that can be overridden in tests
  public checkFileStatus: (filePath: string) => Promise<FileStatus>
  public startDownload: (filePath: string) => Promise<void>
  public onDownloadStart?: (filePath: string) => Promise<any>

  constructor() {
    // Set up default implementations
    this.checkFileStatus = async (filePath: string) => {
      const status = this.fileStatuses.get(filePath)
      if (!status) {
        return {
          isUbiquitousItem: false,
          isDownloaded: true,
          percentDownloaded: 100,
        }
      }

      // Check if download was completed
      if (this.completedDownloads.has(filePath)) {
        return {
          ...status,
          isDownloaded: true,
          percentDownloaded: 100,
        }
      }

      return status
    }

    this.startDownload = async (filePath: string) => {
      const startTime = Date.now()
      this.downloadCalls.push({
        filePath,
        startTime,
      })

      // Call custom download handler if provided
      if (this.onDownloadStart) {
        return await this.onDownloadStart(filePath)
      }

      // Default: immediate success
      this.completeDownload(filePath)
    }
  }

  /**
   * Mock a file's iCloud status for testing
   */
  mockFileStatus(filePath: string, status: FileStatus): void {
    this.fileStatuses.set(filePath, status)
  }

  /**
   * Simulate completing a download
   */
  completeDownload(filePath: string): void {
    this.completedDownloads.add(filePath)

    // Update the most recent download call with end time
    const call = this.downloadCalls
      .filter((c) => c.filePath === filePath)
      .sort((a, b) => b.startTime - a.startTime)[0]

    if (call && !call.endTime) {
      call.endTime = Date.now()
    }
  }

  /**
   * Get all download calls made during test
   */
  getDownloadCalls(): DownloadCall[] {
    return [...this.downloadCalls]
  }

  /**
   * Reset mock state
   */
  reset(): void {
    this.fileStatuses.clear()
    this.downloadCalls.length = 0
    this.completedDownloads.clear()
    this.onDownloadStart = undefined
  }

  /**
   * Simulate download progress over time
   */
  simulateProgressiveDownload(filePath: string, progressSteps: number[] = [25, 50, 75, 100]): void {
    let stepIndex = 0

    this.checkFileStatus = async (path: string) => {
      if (path !== filePath) {
        const status = this.fileStatuses.get(path)
        return (
          status || {
            isUbiquitousItem: false,
            isDownloaded: true,
            percentDownloaded: 100,
          }
        )
      }

      const currentProgress = progressSteps[stepIndex] || 100
      stepIndex = Math.min(stepIndex + 1, progressSteps.length - 1)

      return {
        isUbiquitousItem: true,
        isDownloaded: currentProgress >= 100,
        percentDownloaded: currentProgress,
      }
    }
  }

  /**
   * Simulate download failure
   */
  simulateDownloadFailure(filePath: string, error: Error): void {
    const originalStartDownload = this.startDownload
    this.startDownload = async (path: string) => {
      if (path === filePath) {
        throw error
      }
      return originalStartDownload(path)
    }
  }

  /**
   * Simulate network conditions
   */
  simulateNetworkConditions(
    condition: 'offline' | 'slow' | 'timeout',
    params?: { delayMs?: number; timeoutMs?: number }
  ): void {
    switch (condition) {
      case 'offline':
        this.startDownload = async () => {
          throw new Error('Network offline: NSURLErrorDomain -1009')
        }
        break

      case 'slow':
        this.startDownload = async (path: string) => {
          await new Promise((resolve) => setTimeout(resolve, params?.delayMs || 5000))
          this.completeDownload(path)
        }
        break

      case 'timeout':
        this.startDownload = async () => {
          await new Promise((resolve) => setTimeout(resolve, params?.timeoutMs || 65000))
          throw new Error('Download timeout')
        }
        break
    }
  }

  /**
   * Simulate iCloud quota exceeded
   */
  simulateQuotaExceeded(): void {
    this.startDownload = async () => {
      throw new Error('iCloud storage full: NSUbiquitousErrorDomain 507')
    }
  }

  /**
   * Get download metrics for performance testing
   */
  getDownloadMetrics(): {
    totalDownloads: number
    averageDuration: number
    maxConcurrent: number
    failureRate: number
  } {
    const completedDownloads = this.downloadCalls.filter((call) => call.endTime)
    const durations = completedDownloads.map((call) => call.endTime! - call.startTime)

    const averageDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    // Calculate max concurrent downloads
    const events: Array<{ time: number; type: 'start' | 'end' }> = []
    this.downloadCalls.forEach((call) => {
      events.push({ time: call.startTime, type: 'start' })
      if (call.endTime) {
        events.push({ time: call.endTime, type: 'end' })
      }
    })

    events.sort((a, b) => a.time - b.time)

    let concurrent = 0
    let maxConcurrent = 0
    events.forEach((event) => {
      if (event.type === 'start') {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
      } else {
        concurrent--
      }
    })

    const failureRate =
      this.downloadCalls.length > 0
        ? (this.downloadCalls.length - completedDownloads.length) / this.downloadCalls.length
        : 0

    return {
      totalDownloads: this.downloadCalls.length,
      averageDuration,
      maxConcurrent,
      failureRate,
    }
  }
}
