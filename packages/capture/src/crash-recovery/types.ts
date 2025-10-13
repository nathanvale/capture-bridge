/**
 * Crash Recovery Types - CRASH_RECOVERY_MECHANISM--T01
 *
 * Type definitions for startup reconciliation & resume processing
 */

/**
 * Represents a capture that needs recovery processing
 */
export interface RecoverableCapture {
  id: string
  source: 'voice' | 'email'
  raw_content: string
  content_hash: string | null
  status: 'staged' | 'transcribed' | 'failed_transcription'
  meta_json: string
  created_at: string
  updated_at: string
}

/**
 * Result returned from crash recovery operation
 */
export interface CrashRecoveryResult {
  /** Total captures found needing recovery */
  capturesFound: number

  /** Successfully recovered captures */
  capturesRecovered: number

  /** Captures that timed out (stuck > 10 minutes) */
  capturesTimedOut: number

  /** Captures quarantined due to missing files */
  capturesQuarantined: number

  /** Total recovery duration in milliseconds */
  duration: number
}

/**
 * Metadata integrity information for quarantined captures
 */
export interface IntegrityMetadata {
  quarantine: boolean
  quarantine_reason: 'missing_file' | 'corruption' | 'timeout'
  quarantine_timestamp?: string
}

/**
 * Extended metadata that includes integrity information
 */
export interface CaptureMetadata {
  file_path?: string
  integrity?: IntegrityMetadata
  [key: string]: unknown
}
