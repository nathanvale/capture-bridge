/**
 * Capture status state machine types
 *
 * Based on ADR-0004: Status-Driven State Machine for Capture Lifecycle
 *
 * Valid states form an immutable state machine where:
 * - Terminal states start with 'exported*' and are immutable
 * - Only valid transitions are permitted (enforced by validation)
 * - Hash may change at most once (NULL → SHA-256 on transcription)
 */

/**
 * All possible states in the capture lifecycle
 */
export type CaptureStatus =
  | 'staged' // Initial capture, awaiting processing
  | 'transcribed' // Transcription complete, awaiting export
  | 'failed_transcription' // Transcription failed, needs placeholder
  | 'exported' // Successfully exported (terminal)
  | 'exported_duplicate' // Skipped as duplicate (terminal)
  | 'exported_placeholder' // Exported as placeholder (terminal)

/**
 * Type guard to check if a status is valid
 */
export const isValidCaptureStatus = (status: unknown): status is CaptureStatus => {
  return (
    typeof status === 'string' &&
    [
      'staged',
      'transcribed',
      'failed_transcription',
      'exported',
      'exported_duplicate',
      'exported_placeholder',
    ].includes(status)
  )
}

/**
 * Terminal states that cannot transition to any other state
 */
export const TERMINAL_STATES: readonly CaptureStatus[] = [
  'exported',
  'exported_duplicate',
  'exported_placeholder',
] as const

/**
 * Non-terminal states that can transition to other states
 */
export const NON_TERMINAL_STATES: readonly CaptureStatus[] = [
  'staged',
  'transcribed',
  'failed_transcription',
] as const
