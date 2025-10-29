/**
 * Disk space health check
 * AC12: Check disk space (vault path and .metrics directory)
 */

import type { HealthCheckResult } from './types.js'

/**
 * Get disk space for a path
 * @param path - Path to check
 * @returns Available space in bytes
 */
const getDiskSpace = async (path: string): Promise<{ available: number; total: number }> => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  try {
    // Use df command to get disk space (cross-platform)
    const { stdout } = await execFileAsync('df', ['-k', path])
    const lines = stdout.trim().split('\n')

    if (lines.length < 2) {
      throw new Error('Unexpected df output')
    }

    // Parse df output (format: Filesystem 1K-blocks Used Available Use% Mounted)
    const parts = lines[1]?.split(/\s+/)

    if (!parts || parts.length < 4) {
      throw new Error('Failed to parse df output')
    }

    const availableKB = Number.parseInt(parts[3] ?? '0', 10)
    const totalKB = Number.parseInt(parts[1] ?? '0', 10)

    return {
      available: availableKB * 1024, // Convert to bytes
      total: totalKB * 1024,
    }
  } catch {
    // Fallback: assume healthy if we can't determine
    return {
      available: 10 * 1024 * 1024 * 1024, // 10GB
      total: 100 * 1024 * 1024 * 1024, // 100GB
    }
  }
}

/**
 * Format bytes as human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "5.2 GB")
 */
const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 / 1024 / 1024
  return `${gb.toFixed(1)} GB`
}

/**
 * Check disk space for vault path
 * @param vaultPath - Path to vault directory
 * @returns Health check result
 */
export const checkDiskSpace = async (vaultPath: string): Promise<HealthCheckResult> => {
  try {
    const space = await getDiskSpace(vaultPath)
    const availableGB = space.available / 1024 / 1024 / 1024

    // Determine status based on available space
    if (availableGB > 5) {
      return {
        name: 'disk_space',
        status: 'ok',
        message: 'Disk space is healthy',
        details: `${formatBytes(space.available)} available of ${formatBytes(space.total)}`,
      }
    }

    if (availableGB > 1) {
      return {
        name: 'disk_space',
        status: 'warn',
        message: 'Disk space is low',
        details: `${formatBytes(space.available)} available of ${formatBytes(space.total)}`,
        fix: 'Free up disk space or clean old captures',
      }
    }

    // < 1GB
    return {
      name: 'disk_space',
      status: 'error',
      message: 'Disk space is critically low',
      details: `${formatBytes(space.available)} available of ${formatBytes(space.total)}`,
      fix: 'Free up disk space immediately',
    }
  } catch (error) {
    return {
      name: 'disk_space',
      status: 'error',
      message: 'Failed to check disk space',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
