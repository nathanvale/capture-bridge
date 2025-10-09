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
const DOWNLOAD_MAX_WAIT_MS = 60000 // 60 seconds max wait for download (AC05 spec)

// Helper to execute binary commands safely without shell interpretation.
// Lazily binds to child_process.execFile so test spies (vi.spyOn) are honored.
let cachedExecAsync:
  | ((cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>)
  | undefined
const execFileAsync = async (cmd: string, args: string[]) => {
  if (!cachedExecAsync) {
    const child = await import('node:child_process')
    const execAsync = promisify(child.execFile)
    cachedExecAsync = (c: string, a: string[]) =>
      execAsync(c, a) as unknown as Promise<{ stdout: string; stderr: string }>
  }
  return cachedExecAsync(cmd, args)
}

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

    // 1a. Optionally filter by last poll timestamp (if exists)
    // This reduces repeat work across polling cycles
    let filesToProcess: string[]
    try {
      const lastPoll = await this.getLastPollTimestamp()
      filesToProcess = await this.filterNewFiles(files, lastPoll)
    } catch {
      // If filtering fails for any reason, fall back to processing all files
      filesToProcess = files
    }

    // 2. Process each file sequentially (for...of ensures sequential)
    let filesProcessed = 0
    let duplicatesSkipped = 0

    for (const filePath of filesToProcess) {
      try {
        // Fast path: skip if already staged (Layer 1 dedup) BEFORE heavy work
        const existing = await this.db.query<{ id: string }>(
          `SELECT id FROM captures
           WHERE json_extract(meta_json, '$.channel') = ?
           AND json_extract(meta_json, '$.channel_native_id') = ?`,
          ['voice', filePath]
        )
        if (existing) {
          duplicatesSkipped++
          continue
        }

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

    // 3. Update sync state with current real timestamp (from SQLite)
    await this.updateLastPollTimestamp()

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
   * @param fingerprint Audio fingerprint (SHA-256 hex)
   * @internal Implements channel-native-id storage [AC08]
   */
  private async stageCapture(filePath: string, fingerprint: string): Promise<void> {
    // Check if this file is already staged (Layer 1 deduplication)
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM captures
       WHERE json_extract(meta_json, '$.channel') = ?
       AND json_extract(meta_json, '$.channel_native_id') = ?`,
      ['voice', filePath]
    )

    if (existing) {
      // Already staged, skip duplicate
      return
    }

    // Generate ULID for capture ID (import dynamically to avoid issues)
    const { ulid } = await import('ulid')
    const captureId = ulid()

    // Create meta_json structure
    const metaJson = JSON.stringify({
      channel: 'voice',
      channel_native_id: filePath, // Absolute path as unique identifier
      audio_fp: fingerprint, // SHA-256 fingerprint
    })

    // Insert into captures table
    await this.db.run(
      `INSERT INTO captures (id, source, status, meta_json, raw_content, created_at, updated_at)
       VALUES (?, 'voice', 'staged', ?, '', datetime('now'), datetime('now'))`,
      [captureId, metaJson]
    )
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
  private async updateLastPollTimestamp(timestamp?: string): Promise<void> {
    if (timestamp) {
      await this.db.run(
        'INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [SYNC_STATE_KEY, timestamp]
      )
      return
    }
    // Use ISO 8601 UTC format for consistent parsing across timezones
    await this.db.run(
      "INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), CURRENT_TIMESTAMP)",
      [SYNC_STATE_KEY]
    )
  }

  /**
   * Filter files based on modification time vs last poll timestamp
   * @param files Array of file paths
   * @param lastPollTimestamp ISO timestamp or undefined for first run
   * @returns Files modified after the timestamp (or all files if no timestamp)
   * @internal Exposed for testing
   */
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
    const { isDataless } = await this.runIcloudCheck(filePath)
    return isDataless
  }

  /**
   * Execute icloudctl command with exponential backoff retry
   * Implements AC05: 1s, 2s, 4s delays, cap at 60s total
   * @param operation The async operation to retry
   * @param maxRetries Maximum number of retries (default 3)
   * @returns The result of the operation
   * @throws The last error if all retries fail
   * @internal
   */
  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s per AC05
          let delay: number
          if (attempt === 0) {
            delay = 1000
          } else if (attempt === 1) {
            delay = 2000
          } else {
            delay = 4000
          }
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError ?? new Error('Retry failed')
  }

  /**
   * Check if a file has iCloud conflicts
   * @param filePath Path to the file to check
   * @returns True if file has unresolved conflicts
   * @throws Error if icloudctl check fails after retries
   * @internal
   */
  private async checkForConflicts(filePath: string): Promise<boolean> {
    const { hasConflicts } = await this.runIcloudCheck(filePath)
    return hasConflicts
  }

  /**
   * Trigger iCloud download for a dataless file
   * @param filePath Path to the file to download
   * @internal Exposed for testing
   */
  private async triggerDownload(filePath: string): Promise<void> {
    // Use execFile to prevent shell injection - arguments passed directly to binary
    await this.executeWithRetry(() => execFileAsync('icloudctl', ['download', filePath]))
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
      const { isDataless } = await this.runIcloudCheck(filePath)

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
    // Initial status check
    const first = await this.runIcloudCheck(filePath)

    if (first.isDataless) {
      await this.triggerDownload(filePath)
      await this.waitForDownload(filePath)
    }

    // Check conflicts after ensuring availability
    const conflictStatus = await this.runIcloudCheck(filePath)
    if (conflictStatus.hasConflicts) {
      throw new Error(`iCloud conflict detected: ${filePath} - skipping`)
    }
  }

  /**
   * Run a single icloudctl check and parse both dataless and conflict flags
   * @internal Exposed for testing
   */
  async runIcloudCheck(filePath: string): Promise<{ isDataless: boolean; hasConflicts: boolean }> {
    // Use execFile to prevent shell injection - arguments passed directly to binary
    return await this.executeWithRetry(async () => {
      const { stdout } = await execFileAsync('icloudctl', ['check', filePath])
      const text = String(stdout ?? '')
      return {
        isDataless: text.includes('dataless'),
        hasConflicts: text.includes('hasUnresolvedConflicts: true'),
      }
    })
  }
}
