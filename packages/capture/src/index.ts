// Export placeholder for capture package
export const captureVersion = '0.1.0'

// Export WhisperModel and types
export { WhisperModel } from './transcription/whisper-model.js'
export type { ModelLoadConfig, LoadedModel, ModelStatus } from './transcription/whisper-model.js'

// Export placeholder-export module
export {
  detectFailedTranscriptions,
  generatePlaceholderMarkdown,
  exportPlaceholderToVault,
  insertPlaceholderAuditRecord,
} from './placeholder-export/index.js'
export type { FailedTranscription } from './placeholder-export/index.js'
