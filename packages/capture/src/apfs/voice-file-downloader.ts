/**
 * Voice File Downloader
 *
 * Handles downloading of APFS dataless voice memo files from iCloud.
 * Implements sequential processing, timeout handling, and exponential backoff.
 */

export interface DownloadResult {
  success: boolean
  error?: string
  retryAfter?: Date
  filePath: string
}

export interface DownloadOptions {
  downloadTimeout?: number
  onProgress?: (filePath: string, percent: number) => void
}

export interface FileStatus {
  isUbiquitousItem: boolean
  isDownloaded: boolean
  percentDownloaded: number
}

export interface ICloudController {
  checkFileStatus(filePath: string): Promise<FileStatus>
  startDownload(filePath: string): Promise<void>
}

export class VoiceFileDownloader {
  private activeDownloads = new Map<string, Promise<DownloadResult>>()
  private options: Required<DownloadOptions>

  constructor(
    private icloudController: ICloudController,
    options: DownloadOptions = {}
  ) {
    this.options = {
      downloadTimeout: options.downloadTimeout || 60000, // 60 seconds
      onProgress: options.onProgress || (() => {}),
    }
  }

  async downloadIfNeeded(filePath: string): Promise<DownloadResult> {
    // Check if download is already in progress
    const existingDownload = this.activeDownloads.get(filePath)
    if (existingDownload) {
      return existingDownload
    }

    // Start new download
    const downloadPromise = this.performDownload(filePath)
    this.activeDownloads.set(filePath, downloadPromise)

    try {
      const result = await downloadPromise
      return result
    } finally {
      // Clean up active download tracking
      this.activeDownloads.delete(filePath)
    }
  }

  private async performDownload(filePath: string): Promise<DownloadResult> {
    try {
      // Check initial file status
      const status = await this.icloudController.checkFileStatus(filePath)

      if (status.isDownloaded) {
        return {
          success: true,
          filePath,
        }
      }

      if (!status.isUbiquitousItem) {
        return {
          success: false,
          error: 'File is not an iCloud item',
          filePath,
        }
      }

      // Start download with timeout
      const downloadPromise = this.icloudController.startDownload(filePath)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Download timeout: Operation timed out after ${this.options.downloadTimeout}ms`
            )
          )
        }, this.options.downloadTimeout)
      })

      try {
        await Promise.race([downloadPromise, timeoutPromise])
      } catch (error) {
        if ((error as Error).message.includes('timeout')) {
          return {
            success: false,
            error: 'Download timeout: Operation timed out after 60s',
            retryAfter: new Date(Date.now() + 60000), // Retry in 60 seconds
            filePath,
          }
        }
        throw error
      }

      // Poll for completion with exponential backoff
      return await this.pollForCompletion(filePath)
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        filePath,
      }
    }
  }

  private async pollForCompletion(filePath: string): Promise<DownloadResult> {
    let backoffDelay = 1000 // Start with 1 second
    const maxBackoff = 5000 // Cap at 5 seconds
    const backoffMultiplier = 1.5

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, backoffDelay))

      const status = await this.icloudController.checkFileStatus(filePath)

      // Report progress
      this.options.onProgress(filePath, status.percentDownloaded)

      if (status.isDownloaded) {
        return {
          success: true,
          filePath,
        }
      }

      // Apply exponential backoff
      backoffDelay = Math.min(backoffDelay * backoffMultiplier, maxBackoff)
    }
  }
}
