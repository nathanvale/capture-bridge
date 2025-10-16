/**
 * Daily Backup Promotion Module
 *
 * AC05: Daily promotion - copy 1 per day to daily set (keep last 7)
 *
 * Implements:
 * - Promotes one hourly backup per day to daily set
 * - Selects noon backup (12:00 UTC) if available, otherwise earliest
 * - Verifies backup integrity before promotion
 * - Keeps last 7 daily backups only
 * - Preserves file permissions (0600)
 *
 * Spec: docs/features/staging-ledger/spec-staging-tech.md §2.4
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { verifyBackup, type VerificationResult } from './backup.js'

/**
 * Result of daily backup promotion operation
 */
export interface PromotionResult {
  success: boolean
  promoted_from?: string
  promoted_to?: string
  selected_reason?: 'noon_backup' | 'earliest_available'
  skipped?: boolean
  reason?: string
  error?: string
}

/**
 * Result of daily backup pruning operation
 */
export interface PruneResult {
  deleted_count: number
  retained_files: string[]
}

/**
 * Options for daily backup promotion
 */
export interface PromotionOptions {
  date: Date
}

/**
 * Options for daily backup pruning
 */
export interface PruneOptions {
  keep: number
}

/**
 * Promotes one hourly backup per day to daily backup set
 *
 * Selection algorithm:
 * 1. Check if daily backup already exists for date
 * 2. Select noon (12:00 UTC) backup if available
 * 3. Otherwise select earliest backup for the day
 * 4. Verify backup integrity before promotion
 * 5. Copy to daily backup location
 * 6. Preserve file permissions (0600)
 *
 * @param vaultRoot - Vault root directory path
 * @param options - Promotion options
 * @returns Promotion result with success status
 */
export const promoteToDailyBackup = async (
  vaultRoot: string,
  options: PromotionOptions
): Promise<PromotionResult> => {
  const { date } = options
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')

  const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')
  const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')
  const dailyBackupPath = join(dailyDir, `ledger-${dateStr}.sqlite`)

  try {
    // Step 1: Check if daily backup already exists
    try {
      await fsp.access(dailyBackupPath)
      return {
        success: true,
        skipped: true,
        reason: 'daily_backup_exists',
      }
    } catch {
      // Daily backup doesn't exist, proceed with promotion
    }

    // Step 2: Find hourly backups for the specified date
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    const hourlyFiles = await fsp.readdir(hourlyDir)
    const hourPattern = /-(\d{2})\.sqlite$/
    const hourlyBackups = hourlyFiles
      .filter((f) => f.startsWith(`ledger-${dateStr}-`) && f.endsWith('.sqlite'))
      .map((f) => {
        const hourMatch = hourPattern.exec(f)
        const hour = hourMatch?.[1] ? Number.parseInt(hourMatch[1], 10) : -1
        return { filename: f, hour }
      })
      .filter((b) => b.hour >= 0)

    if (hourlyBackups.length === 0) {
      return {
        success: false,
        error: `No hourly backups found for date ${dateStr}`,
      }
    }

    // Step 3: Select backup (noon preferred, otherwise earliest)
    // After length check, array access is guaranteed to succeed
    const noonBackup = hourlyBackups.find((b) => b.hour === 12)
    const sortedBackups = hourlyBackups.toSorted((a, b) => a.hour - b.hour)
    const earliestBackup = sortedBackups[0] as { filename: string; hour: number }
    const selectedBackup = noonBackup ?? earliestBackup
    const selectedReason = noonBackup ? 'noon_backup' : 'earliest_available'
    const selectedPath = join(hourlyDir, selectedBackup.filename)

    // Step 4: Verify backup integrity
    let verifyResult: VerificationResult
    try {
      verifyResult = await verifyBackup(selectedPath)
    } catch (error) {
      return {
        success: false,
        error: `Backup verification failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    if (!verifyResult.success || !verifyResult.integrity_check_passed) {
      return {
        success: false,
        error: `Backup verification failed: ${verifyResult.error ?? 'integrity check did not pass'}`,
      }
    }

    // Step 5: Copy to daily backup location
    await fsp.copyFile(selectedPath, dailyBackupPath)

    // Step 6: Set file permissions to 0600
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.chmod(dailyBackupPath, 0o600)

    return {
      success: true,
      promoted_from: selectedBackup.filename,
      promoted_to: `ledger-${dateStr}.sqlite`,
      selected_reason: selectedReason,
    }
  } catch (error) {
    return {
      success: false,
      error: `Promotion failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Prunes old daily backups, keeping only the most recent N backups
 *
 * @param vaultRoot - Vault root directory path
 * @param options - Prune options
 * @returns Prune result with count of deleted files
 */
export const pruneDailyBackups = async (
  vaultRoot: string,
  options: PruneOptions
): Promise<PruneResult> => {
  const { keep } = options
  const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
  const files = await fsp.readdir(dailyDir)
  const dailyBackups = files
    .filter((f) => f.startsWith('ledger-') && f.endsWith('.sqlite'))
    .toSorted((a, b) => b.localeCompare(a)) // Sort descending (newest first)

  const toDelete = dailyBackups.slice(keep)
  const toRetain = dailyBackups.slice(0, keep)

  for (const file of toDelete) {
    const filePath = join(dailyDir, file)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.unlink(filePath)
  }

  return {
    deleted_count: toDelete.length,
    retained_files: toRetain,
  }
}
