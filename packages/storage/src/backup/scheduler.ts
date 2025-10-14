import { createBackup } from './backup.js'
import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

export interface BackupSchedulerOptions {
  intervalMs?: number // default: 1 hour
}

export interface SchedulerHandle {
  shutdown: () => Promise<void>
}

export const startBackupScheduler = (
  db: Database,
  vaultRoot: string,
  options: BackupSchedulerOptions = {}
): SchedulerHandle => {
  const interval = Math.max(1000, options.intervalMs ?? 60 * 60 * 1000)

  const timer = setInterval(() => {
    try {
      createBackup(db, vaultRoot)
    } catch {
      // Swallow errors; verification pipeline will surface issues
    }
  }, interval)

  return {
    shutdown: async (): Promise<void> => {
      clearInterval(timer)
    },
  }
}
