/**
 * Collision detection for atomic file writer
 * Part of ATOMIC_FILE_WRITER--T02
 */

import { promises as fs } from 'node:fs'

import { CollisionResult } from '../types.js'

/**
 * Check for file collisions before writing
 *
 * @param exportPath - Full path where file will be written
 * @param contentHash - SHA-256 hash of content to write
 * @returns CollisionResult indicating no collision, duplicate, or conflict
 */
export const checkCollision = async (
  exportPath: string,
  contentHash: string
): Promise<CollisionResult> => {
  try {
    // Try to read the existing file
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const existingContent = await fs.readFile(exportPath, 'utf-8')

    // Import hash function dynamically to avoid circular dependencies
    const { computeSHA256 } = await import('@capture-bridge/foundation/hash')
    const existingHash = computeSHA256(existingContent)

    // Compare hashes
    return existingHash === contentHash ? CollisionResult.DUPLICATE : CollisionResult.CONFLICT
  } catch (error) {
    const err = error as NodeJS.ErrnoException

    // If file doesn't exist, no collision
    if (err.code === 'ENOENT') {
      return CollisionResult.NO_COLLISION
    }

    // For any other error (e.g., can't read directory as file),
    // treat as conflict to be safe
    return CollisionResult.CONFLICT
  }
}
