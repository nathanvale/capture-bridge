/**
 * Type definitions for placeholder export functionality
 */

/**
 * Failed transcription capture structure from the database
 */
export interface FailedTranscription {
  id: string
  source: string
  raw_content: string
  content_hash: string | null
  status: string
  meta_json: string
  created_at: string
  updated_at: string
}

/**
 * Error types for transcription failures
 */
export type TranscriptionErrorType =
  | 'TIMEOUT'
  | 'CORRUPT_AUDIO'
  | 'OOM'
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_NOT_FOUND'
  | 'UNKNOWN'

/**
 * Parsed metadata from meta_json
 */
export interface CaptureMetadata {
  file_path?: string
  attempt_count?: number
  audio_fp?: string
  message_id?: string
}

/**
 * Result of placeholder export to vault
 */
export interface PlaceholderExportResult {
  success: boolean
  export_path?: string
  error?: {
    code: string
    message: string
  }
}
