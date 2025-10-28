/**
 * Whisper model file health check
 * AC06: Check Whisper model file exists (medium.pt)
 */

import type { HealthCheckResult } from './types.js'

const MIN_MODEL_SIZE = 1024 * 1024 // 1MB minimum

/**
 * Check Whisper model file exists and has valid size
 * @param modelPath - Path to Whisper model file (medium.pt)
 * @returns Health check result
 */
export const checkWhisperModel = async (modelPath: string): Promise<HealthCheckResult> => {
  try {
    const fs = await import('node:fs/promises')

    // Check if file exists
    let stats
    try {
      stats = await fs.stat(modelPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          name: 'whisper_model',
          status: 'error',
          message: 'Whisper model not found',
          details: `Model file does not exist at ${modelPath}`,
          fix: 'Download Whisper medium model: whisper download medium',
        }
      }
      throw error
    }

    // Check file size (rough sanity check)
    if (stats.size < MIN_MODEL_SIZE) {
      return {
        name: 'whisper_model',
        status: 'error',
        message: 'Whisper model has invalid size',
        details: `Model file is ${stats.size} bytes (expected > ${MIN_MODEL_SIZE} bytes)`,
        fix: 'Re-download Whisper medium model: whisper download medium',
      }
    }

    // All checks passed
    return {
      name: 'whisper_model',
      status: 'ok',
      message: 'Whisper model is available',
      details: `Model file: ${modelPath} (${Math.round(stats.size / 1024 / 1024)}MB)`,
    }
  } catch (error) {
    return {
      name: 'whisper_model',
      status: 'error',
      message: 'Failed to check Whisper model',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
