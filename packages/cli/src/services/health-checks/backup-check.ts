/**
 * Backup status health check
 * AC09: Check backup status (last hourly backup timestamp)
 */

import type { HealthCheckResult } from './types.js'

/**
 * Check backup status (most recent backup file age)
 * @param backupDir - Path to backup directory
 * @returns Health check result
 */
export const checkBackupStatus = async (backupDir: string): Promise<HealthCheckResult> => {
  try {
    const fs = await import('node:fs/promises')

    // Check if backup directory exists
    try {
      await fs.access(backupDir)
    } catch {
      return {
        name: 'backup_status',
        status: 'error',
        message: 'Backup directory not found',
        details: `Directory does not exist: ${backupDir}`,
        fix: 'Create backup directory and configure backup schedule',
      }
    }

    // Find most recent backup file
    const files = await fs.readdir(backupDir)
    const backupFiles = files.filter((f) => f.endsWith('.db'))

    if (backupFiles.length === 0) {
      return {
        name: 'backup_status',
        status: 'error',
        message: 'No backup files found',
        details: `No .db files in ${backupDir}`,
        fix: 'Run manual backup: capture backup',
      }
    }

    // Get modification time of most recent backup
    let mostRecentTime = 0
    let mostRecentFile = ''

    for (const file of backupFiles) {
      const filePath = `${backupDir}/${file}`
      const stats = await fs.stat(filePath)
      if (stats.mtimeMs > mostRecentTime) {
        mostRecentTime = stats.mtimeMs
        mostRecentFile = file
      }
    }

    // Calculate age in hours
    const now = Date.now()
    const ageHours = (now - mostRecentTime) / 1000 / 60 / 60

    // Determine status based on age
    if (ageHours < 1) {
      return {
        name: 'backup_status',
        status: 'ok',
        message: 'Backup is current',
        details: `Last backup: ${mostRecentFile} (${Math.floor(ageHours * 60)} minutes ago)`,
      }
    }

    if (ageHours <= 24) {
      return {
        name: 'backup_status',
        status: 'warn',
        message: 'Backup is overdue',
        details: `Last backup: ${mostRecentFile} (${Math.floor(ageHours)} hours ago)`,
        fix: 'Check backup schedule',
      }
    }

    // > 24 hours
    return {
      name: 'backup_status',
      status: 'error',
      message: 'Backup is critically overdue',
      details: `Last backup: ${mostRecentFile} (${Math.floor(ageHours)} hours ago)`,
      fix: 'Run manual backup immediately: capture backup',
    }
  } catch (error) {
    return {
      name: 'backup_status',
      status: 'error',
      message: 'Failed to check backup status',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
