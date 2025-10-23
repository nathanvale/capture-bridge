/**
 * Placeholder Export Module
 *
 * Handles export of failed transcriptions as placeholder markdown files
 */

export {
  detectFailedTranscriptions,
  generatePlaceholderMarkdown,
  exportPlaceholderToVault,
  insertPlaceholderAuditRecord,
} from './placeholder-export.js'
export type { FailedTranscription, TranscriptionErrorType, CaptureMetadata } from './types.js'
