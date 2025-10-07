/**
 * Path resolution utilities for Obsidian Bridge
 *
 * Converts ULID capture IDs to filesystem paths with security validation
 */

import path from 'node:path'

const ULID_REGEX = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/

/**
 * Validates ULID format (26 characters, Crockford Base32)
 * @throws Error if capture_id format is invalid
 */
export const validateCaptureId = (capture_id: string): void => {
  if (!ULID_REGEX.test(capture_id)) {
    throw new Error('Invalid capture_id format')
  }
}

/**
 * Resolves temp file path in .trash directory
 * @param vault_path Absolute path to vault root
 * @param capture_id ULID from captures.id
 * @returns Temp file path: {vault}/.trash/{ulid}.tmp
 */
export const resolveTempPath = (vault_path: string, capture_id: string): string => {
  validateCaptureId(capture_id)
  return path.join(vault_path, '.trash', `${capture_id}.tmp`)
}

/**
 * Resolves export file path in inbox directory
 * @param vault_path Absolute path to vault root
 * @param capture_id ULID from captures.id
 * @returns Export file path: {vault}/inbox/{ulid}.md
 */
export const resolveExportPath = (vault_path: string, capture_id: string): string => {
  validateCaptureId(capture_id)
  return path.join(vault_path, 'inbox', `${capture_id}.md`)
}
