/**
 * Voice poller configuration and types
 */

export interface VoicePollerConfig {
  folderPath: string // iCloud Voice Memos folder
  pollInterval?: number // Optional for continuous mode (default: 30s)
  sequential: true // MPPP constraint (no concurrency)
}

export interface VoicePollResult {
  filesFound: number
  filesProcessed: number
  duplicatesSkipped: number
  errors: Array<{ filePath: string; error: string }>
  duration: number // milliseconds
}

// Stub interfaces for dependencies (will be implemented later)
export interface DatabaseClient {
  // Database methods will be added in future ACs
  query: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>
  run: (sql: string, params?: unknown[]) => Promise<void>
}

export interface DeduplicationService {
  // Deduplication methods - minimal interface for current implementation
  isDuplicate: (params: { audioFp: string }) => Promise<boolean>
  addFingerprint: (fingerprint: string) => Promise<void>
}
