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
