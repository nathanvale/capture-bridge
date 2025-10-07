/**
 * Type definitions for Obsidian Bridge atomic writer
 */

export interface AtomicWriteResult {
  success: boolean
  export_path?: string
  skipped?: boolean
  error?: AtomicWriteError
}

export interface AtomicWriteError {
  code: 'EACCES' | 'ENOSPC' | 'EEXIST' | 'EROFS' | 'ENETDOWN' | 'EUNKNOWN'
  message: string
  temp_path?: string
  export_path?: string
}

export enum CollisionResult {
  NO_COLLISION,
  DUPLICATE,
  CONFLICT,
}
