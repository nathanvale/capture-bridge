/**
 * APFS Dataless File Detection
 *
 * Provides comprehensive detection of APFS dataless files (iCloud placeholders)
 * that require download before processing. This is critical for voice memo
 * capture where files may be stored in iCloud and need to be downloaded.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, basename } from "node:path";

// Extended attributes interface for iCloud metadata
interface ExtendedAttributes {
  [key: string]: Buffer;
}

export interface APFSStatus {
  // File existence and basic properties
  exists: boolean;
  isDirectory?: boolean;
  fileSizeBytes?: number;
  lastModified?: Date;
  created?: Date;

  // APFS dataless detection
  isDataless: boolean;
  isDownloading: boolean;
  isUbiquitousItem: boolean;
  isDownloaded: boolean;

  // iCloud placeholder detection
  icloudPlaceholderPath?: string;

  // Extended attributes from APFS
  extendedAttributes: ExtendedAttributes;

  // Diagnostic information
  reason?: string;
  error?: string;
}

/**
 * Detects if a file is an APFS dataless file that requires iCloud download
 *
 * Detection methods:
 * 1. .icloud placeholder files - Files stored as .originalname.ext.icloud
 * 2. Size threshold - Files < 1KB are likely dataless placeholders
 * 3. Extended attributes - com.apple.metadata:com_apple_clouddocs_* attributes
 *
 * @param filePath - Path to the file to check
 * @returns APFSStatus with comprehensive dataless detection results
 */
export async function detectAPFSStatus(filePath: string): Promise<APFSStatus> {
  const status: APFSStatus = {
    exists: false,
    isDataless: false,
    isDownloading: false,
    isUbiquitousItem: false,
    isDownloaded: false,
    extendedAttributes: {},
  };

  try {
    // Check if original file exists
    const fileExists = existsSync(filePath);

    // Check for .icloud placeholder
    const icloudPath = constructICloudPlaceholderPath(filePath);
    const icloudExists = existsSync(icloudPath);

    status.exists = fileExists || icloudExists;

    if (icloudExists) {
      status.isDataless = true;
      status.icloudPlaceholderPath = icloudPath;
      status.reason = ".icloud placeholder detected";
    }

    if (!status.exists) {
      return status;
    }

    // Get file stats for size analysis
    if (fileExists) {
      try {
        const stats = statSync(filePath);

        status.fileSizeBytes = stats.size;
        status.lastModified = stats.mtime;
        status.created = stats.birthtime;
        status.isDirectory = stats.isDirectory();

        // Directories cannot be dataless
        if (status.isDirectory) {
          status.isDataless = false;
          return status;
        }

        // Size threshold detection: files < 1KB are likely dataless
        if (stats.size < 1024) {
          status.isDataless = true;
          status.reason = status.reason
            ? `${status.reason}, size threshold (${stats.size} bytes < 1KB)`
            : `size threshold (${stats.size} bytes < 1KB)`;
        }
      } catch (error) {
        status.error = `File stat error: ${(error as Error).message}`;
      }

      // Check extended attributes for iCloud metadata
      try {
        const xattr = await import("xattr");
        const attrs = xattr.get(filePath);

        status.extendedAttributes = attrs;

        // Check for iCloud download states
        if (attrs["com.apple.metadata:com_apple_clouddocs_downloading"]) {
          status.isDownloading = true;
        }

        if (attrs["com.apple.metadata:com_apple_clouddocs_ubiquitous"]) {
          status.isUbiquitousItem = true;
        }

        if (attrs["com.apple.metadata:com_apple_clouddocs_downloaded"]) {
          status.isDownloaded = true;
          // Downloaded files are not dataless
          if (status.isDownloaded && !status.icloudPlaceholderPath) {
            status.isDataless = false;
          }
        }
      } catch (error) {
        status.error = status.error
          ? `${status.error}; xattr error: ${(error as Error).message}`
          : `xattr error: ${(error as Error).message}`;
      }
    }

    return status;
  } catch (error) {
    status.error = `Detection error: ${(error as Error).message}`;
    return status;
  }
}

/**
 * Constructs the expected .icloud placeholder path for a given file
 *
 * iCloud stores dataless files as hidden placeholder files with the pattern:
 * /path/to/.filename.ext.icloud
 *
 * @param originalPath - Original file path
 * @returns Expected .icloud placeholder path
 */
function constructICloudPlaceholderPath(originalPath: string): string {
  const dir = dirname(originalPath);
  const filename = basename(originalPath);
  return `${dir}/.${filename}.icloud`;
}

/**
 * Determines if a file should be considered dataless based on multiple indicators
 *
 * A file is considered dataless if:
 * - .icloud placeholder exists, OR
 * - File size < 1KB AND has iCloud extended attributes, OR
 * - Extended attributes indicate downloading state
 *
 * @param status - APFSStatus result from detectAPFSStatus
 * @returns true if file should be treated as dataless
 */
export function isDatalessFile(status: APFSStatus): boolean {
  // .icloud placeholder is definitive indicator
  if (status.icloudPlaceholderPath) {
    return true;
  }

  // Size threshold combined with iCloud attributes
  if (status.fileSizeBytes !== undefined && status.fileSizeBytes < 1024) {
    if (status.isUbiquitousItem || status.isDownloading) {
      return true;
    }
  }

  // Currently downloading files are dataless
  if (status.isDownloading) {
    return true;
  }

  return false;
}
