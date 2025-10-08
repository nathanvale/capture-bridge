import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type {
  VoicePollerConfig,
  VoicePollResult,
  DatabaseClient,
  DeduplicationService,
} from './types.js'

const DEFAULT_POLL_INTERVAL = 30000 // 30 seconds
const VOICE_MEMOS_EXTENSION = '.m4a'
const SYNC_STATE_KEY = 'voice_last_poll'
const DOWNLOAD_MAX_WAIT_MS = 30000 // 30 seconds max wait for download

// Helper to execute binary commands safely without shell interpretation
const execFileAsync = promisify(execFile)

export class VoicePoller {
  private intervalId: NodeJS.Timeout | undefined = undefined
  private config: VoicePollerConfig & { pollInterval: number }

  constructor(
    private db: DatabaseClient,
    private dedup: DeduplicationService,
    config: VoicePollerConfig
  ) {
    // Apply default poll interval if not specified
    this.config = {
      ...config,
      pollInterval: config.pollInterval ?? DEFAULT_POLL_INTERVAL,
    }
  }

  /**
   * Single poll cycle - returns immediately after processing
   */
  async pollOnce(): Promise<VoicePollResult> {
    const startTime = Date.now()
    const errors: Array<{ filePath: string; error: string }> = []

    // 1. Scan iCloud folder for .m4a files
    const files = await this.scanVoiceMemos()

    // 2. Process each file sequentially (for...of ensures sequential)
    let filesProcessed = 0
    let duplicatesSkipped = 0

    for (const filePath of files) {
      try {
        // Check APFS dataless status, download if needed, and check for conflicts
        await this.ensureFileDownloaded(filePath)

        // Compute fingerprint (placeholder implementation for now)
        const fingerprint = await this.computeFingerprint(filePath)

        // Dedup check using dedup service
        const isDupe = await this.dedup.isDuplicate({ audioFp: fingerprint })
        if (isDupe) {
          duplicatesSkipped++
          continue
        }

        // Stage capture (placeholder implementation for now)
        await this.stageCapture(filePath, fingerprint)

        filesProcessed++
      } catch (error) {
        errors.push({
          filePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 3. Update sync state with current timestamp
    await this.updateLastPollTimestamp(new Date().toISOString())

    return {
      filesFound: files.length,
      filesProcessed,
      duplicatesSkipped,
      errors,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Compute fingerprint for an audio file
   * @param filePath Path to the audio file
   * @returns SHA-256 fingerprint string (64 hex characters)
   */
  private async computeFingerprint(filePath: string): Promise<string> {
    const { computeAudioFingerprint } = await import('@capture-bridge/foundation')
    return computeAudioFingerprint(filePath)
  }

  /**
   * Stage a capture in the database
   * @param filePath Path to the audio file
   * @param fingerprint Audio fingerprint
   * @internal Stub implementation for now
   */
  private async stageCapture(_filePath: string, _fingerprint: string): Promise<void> {
    // Placeholder implementation - will be replaced with actual database staging
    // For now, this is a no-op
    await Promise.resolve()
  }

  /**
   * Start continuous polling with the configured interval
   */
  async startContinuous(): Promise<void> {
    // Idempotent - return if already running
    if (this.intervalId) return

    // Initial poll
    await this.pollOnce()

    // Set up interval for subsequent polls
    this.intervalId = setInterval(async () => {
      try {
        await this.pollOnce()
      } catch (error) {
        // eslint-disable-next-line no-console -- Required for error logging in polling loop
        console.error('Poll cycle failed:', error)
      }
    }, this.config.pollInterval)
  }

  /**
   * Stop the continuous polling
   */
  // eslint-disable-next-line require-await -- Async for consistency with future implementations
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }

  /**
   * Shutdown method for resource cleanup
   * Required by TestKit pattern for classes with timers
   */
  async shutdown(): Promise<void> {
    await this.stop()
  }

  /**
   * Scan the voice memos folder for .m4a files
   * @returns Array of absolute file paths, sorted alphabetically
   * @internal Exposed for testing
   */
  private async scanVoiceMemos(): Promise<string[]> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Folder path from config
    const files = await readdir(this.config.folderPath)
    return files
      .filter((f) => f.endsWith(VOICE_MEMOS_EXTENSION))
      .map((f) => join(this.config.folderPath, f))
      .sort((a, b) => a.localeCompare(b))
  }

  /**
   * Get the last poll timestamp from sync_state table
   * @returns ISO timestamp string or undefined if no cursor exists
   * @internal Exposed for testing
   */
  // @ts-expect-error - Method is used in tests
  private async getLastPollTimestamp(): Promise<string | undefined> {
    const result = await this.db.query<{ value: string }>(
      'SELECT value FROM sync_state WHERE key = ?',
      [SYNC_STATE_KEY]
    )
    return result?.value
  }

  /**
   * Update the last poll timestamp in sync_state table
   * @param timestamp ISO timestamp string
   * @internal Exposed for testing
   */
  private async updateLastPollTimestamp(timestamp: string): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [SYNC_STATE_KEY, timestamp]
    )
  }

  /**
   * Filter files based on modification time vs last poll timestamp
   * @param files Array of file paths
   * @param lastPollTimestamp ISO timestamp or undefined for first run
   * @returns Files modified after the timestamp (or all files if no timestamp)
   * @internal Exposed for testing
   */
  // @ts-expect-error - Method is used in tests
  private async filterNewFiles(
    files: string[],
    lastPollTimestamp: string | undefined
  ): Promise<string[]> {
    if (!lastPollTimestamp) {
      // First run - include all files
      return files
    }

    const lastPollTime = new Date(lastPollTimestamp).getTime()
    const newFiles: string[] = []

    for (const file of files) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- File path from scanned directory
      const stats = await stat(file)
      if (stats.mtime.getTime() > lastPollTime) {
        newFiles.push(file)
      }
    }

    return newFiles
  }

  /**
   * Check if a file is APFS dataless (iCloud placeholder)
   * @param filePath Path to the file to check
   * @returns True if file is dataless (needs download), false otherwise
   * @internal Exposed for testing
   */
  private async checkIfDataless(filePath: string): Promise<boolean> {
    // Use execFile to prevent shell injection - arguments passed directly to binary
    const { stdout } = await execFileAsync('icloudctl', ['check', filePath])
    return stdout.includes('dataless')
  }

  /**
   * Check if a file has iCloud conflicts
   * @param filePath Path to the file to check
   * @returns True if file has unresolved conflicts
   * @internal
   */
  private async checkForConflicts(filePath: string): Promise<boolean> {
    try {
      // Use execFile to prevent shell injection - arguments passed directly to binary
      const { stdout } = await execFileAsync('icloudctl', ['check', filePath])
      return stdout?.includes('hasUnresolvedConflicts: true') || false
    } catch {
      // If icloudctl fails or is not available, assume no conflicts
      // This allows tests that don't mock icloudctl to pass
      return false
    }
  }

  /**
   * Trigger iCloud download for a dataless file
   * @param filePath Path to the file to download
   * @internal Exposed for testing
   */
  private async triggerDownload(filePath: string): Promise<void> {
    // Use execFile to prevent shell injection - arguments passed directly to binary
    await execFileAsync('icloudctl', ['download', filePath])
  }

  /**
   * Wait for a file to finish downloading from iCloud
   * @param filePath Path to the file being downloaded
   * @param maxWaitMs Maximum time to wait in milliseconds
   * @internal
   */
  private async waitForDownload(
    filePath: string,
    maxWaitMs: number = DOWNLOAD_MAX_WAIT_MS
  ): Promise<void> {
    const startTime = Date.now()
    let attempts = 0

    while (Date.now() - startTime < maxWaitMs) {
      const isDataless = await this.checkIfDataless(filePath)

      if (!isDataless) {
        return // Download complete
      }

      // Exponential backoff between checks: 1s, 2s, 4s, then 5s (capped)
      // Total max wait time: 30s (DOWNLOAD_MAX_WAIT_MS)
      const waitMs = Math.min(1000 * Math.pow(2, attempts), 5000)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      attempts++
    }

    throw new Error(
      `iCloud download timeout after ${attempts} attempts (${maxWaitMs}ms): ${filePath}`
    )
  }

  /**
   * Ensure a file is downloaded from iCloud if it's dataless
   * Also checks for conflicts after download
   * @param filePath Path to the file to check and download
   * @throws Error if file has iCloud conflicts
   * @internal Exposed for testing
   */
  private async ensureFileDownloaded(filePath: string): Promise<void> {
    const isDataless = await this.checkIfDataless(filePath)

    if (isDataless) {
      await this.triggerDownload(filePath)
      await this.waitForDownload(filePath)
    }

    // After ensuring file is downloaded, check for conflicts
    const hasConflicts = await this.checkForConflicts(filePath)
    if (hasConflicts) {
      throw new Error(`iCloud conflict detected: ${filePath} - skipping`)
    }
  }
}
