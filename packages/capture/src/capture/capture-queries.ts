/* eslint-disable */
/**
 * Capture Queries
 *
 * Database queries for voice capture records
 */

export interface CaptureRecord {
  id: string
  filePath: string
  status: 'success' | 'error' | 'processing'
  metadata: {
    error?: {
      permanent?: boolean
      reason?: string
      batch_deletion?: boolean
      affected_directory?: string
      error_type?: string
    }
  }
}

export async function getCaptureByPath(filePath: string): Promise<CaptureRecord> {
  // Mock implementation for testing
  return {
    id: `capture_${Date.now()}`,
    filePath,
    status: 'error',
    metadata: {
      error: {
        permanent: true,
        reason: 'file_deleted',
        batch_deletion: false,
        error_type: 'icloud_placeholder_deleted',
      },
    },
  }
}
