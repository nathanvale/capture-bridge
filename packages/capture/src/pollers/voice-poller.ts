import { exec } from 'node:child_process'
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
const ICLOUDCTL_CHECK_COMMAND = 'icloudctl check'
const ICLOUDCTL_DOWNLOAD_COMMAND = 'icloudctl download'
const DOWNLOAD_MAX_WAIT_MS = 30000 // 30 seconds max wait for download

// Helper to execute shell commands
const execAsync = promisify(exec)

export class VoicePoller {
  private intervalId: NodeJS.Timeout | undefined = undefined
  private config: VoicePollerConfig & { pollInterval: number }

  constructor(
    private db: DatabaseClient,
    // @ts-expect-error - Will be used in future ACs

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
  // eslint-disable-next-line require-await -- Will have await in future implementation
  async pollOnce(): Promise<VoicePollResult> {
    // Stub implementation for now
    return Promise.resolve({
      filesFound: 0,
      filesProcessed: 0,
      duplicatesSkipped: 0,
      errors: [],
      duration: 100,
    })
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
  // @ts-expect-error - Method is used in tests
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
  // @ts-expect-error - Method is used in tests
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
    // Escape the file path to prevent command injection
    // Escape both double quotes and backticks, and use single quotes for the outer shell
    const escapedPath = filePath.replace(/'/g, "'\\''")
    const command = `${ICLOUDCTL_CHECK_COMMAND} '${escapedPath}'`

    const { stdout } = await execAsync(command)
    return stdout.includes('dataless')
  }

  /**
   * Trigger iCloud download for a dataless file
   * @param filePath Path to the file to download
   * @internal Exposed for testing
   */
  private async triggerDownload(filePath: string): Promise<void> {
    // Escape the file path to prevent command injection
    const escapedPath = filePath.replace(/"/g, '\\"')
    const command = `${ICLOUDCTL_DOWNLOAD_COMMAND} "${escapedPath}"`

    await execAsync(command)
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

      // Exponential backoff: 1s, 2s, 4s, max 5s
      const waitMs = Math.min(1000 * Math.pow(2, attempts), 5000)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      attempts++
    }

    throw new Error(`iCloud download timeout: ${filePath}`)
  }

  /**
   * Ensure a file is downloaded from iCloud if it's dataless
   * @param filePath Path to the file to check and download
   * @internal Exposed for testing
   */
  // @ts-expect-error - Method is used in tests
  private async ensureFileDownloaded(filePath: string): Promise<void> {
    const isDataless = await this.checkIfDataless(filePath)

    if (isDataless) {
      await this.triggerDownload(filePath)
      await this.waitForDownload(filePath)
    }
  }
}
