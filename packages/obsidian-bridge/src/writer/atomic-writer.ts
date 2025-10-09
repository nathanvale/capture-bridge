/**
 * Atomic file writer implementation using temp-then-rename pattern
 * Ensures durability and prevents partial writes to Obsidian vault
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { resolveTempPath, resolveExportPath } from '../path-resolver.js'
import { CollisionResult, type AtomicWriteResult } from '../types.js'

import { checkCollision } from './collision-detector.js'

/**
 * Atomically writes content to vault using temp-then-rename pattern
 *
 * @param capture_id ULID from captures.id
 * @param content Markdown content to write
 * @param vault_path Absolute path to vault root
 * @returns Result with success status and export path or error details
 */
export const writeAtomic = async (
  capture_id: string,
  content: string,
  vault_path: string
): Promise<AtomicWriteResult> => {
  const tempPath = resolveTempPath(vault_path, capture_id)
  const exportPath = resolveExportPath(vault_path, capture_id)

  // AC05/AC06: Check for collisions before writing
  const { computeSHA256 } = await import('@capture-bridge/foundation/hash')
  const contentHash = computeSHA256(content)
  const collisionResult = await checkCollision(exportPath, contentHash)

  if (collisionResult === CollisionResult.DUPLICATE) {
    // Same content already exists, skip write
    return {
      success: true,
      export_path: path.relative(vault_path, exportPath),
      skipped: true,
    }
  }

  if (collisionResult === CollisionResult.CONFLICT) {
    // Same ULID, different content - CRITICAL ERROR
    return {
      success: false,
      error: {
        code: 'EEXIST',
        message: 'ULID collision detected: same filename, different content',
        temp_path: tempPath, // Include temp path even though not yet written
        export_path: exportPath,
      },
    }
  }

  let tempFileWritten = false

  try {
    // AC01: Write to temp path in .trash directory
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.mkdir(path.dirname(tempPath), { recursive: true })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.writeFile(tempPath, content, 'utf-8')
    // eslint-disable-next-line sonarjs/no-dead-store
    tempFileWritten = true

    // AC02: fsync before rename to ensure data is written to disk
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const fd = await fs.open(tempPath, 'r+')
    await fd.sync()
    await fd.close()

    // AC03: Atomic rename to export path in inbox directory
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.mkdir(path.dirname(exportPath), { recursive: true })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.rename(tempPath, exportPath)

    // Durability: fsync parent directory to persist the directory entry
    // Without this, a power loss after rename could leave the directory entry
    // unpersisted even though the file data was flushed (SQLite/robustness practice)
    const parentDir = path.dirname(exportPath)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const dirFd = await fs.open(parentDir, 'r')
    await dirFd.sync()
    await dirFd.close()

    return {
      success: true,
      export_path: path.relative(vault_path, exportPath),
    }
  } catch (error) {
    // AC04: Cleanup temp file on failure
    if (tempFileWritten) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.unlink(tempPath)
      } catch {
        // Intentionally ignore cleanup errors - safe in cleanup context
      }
    }

    // Map error codes based on the error
    type ErrorCode = NonNullable<AtomicWriteResult['error']>['code']
    const errorMessage = (error as Error).message || 'Unknown error'

    // Extract error code from error message or code property
    const getErrorCode = (): ErrorCode => {
      const err = error as NodeJS.ErrnoException
      const code = err.code ?? ''
      const msg = errorMessage.toUpperCase()

      if (code === 'EACCES' || msg.includes('EACCES')) return 'EACCES'
      if (code === 'ENOSPC' || msg.includes('ENOSPC')) return 'ENOSPC'
      if (code === 'EEXIST' || msg.includes('EEXIST')) return 'EEXIST'
      if (code === 'EROFS' || msg.includes('EROFS')) return 'EROFS'
      if (code === 'ENETDOWN' || msg.includes('ENETDOWN')) return 'ENETDOWN'
      return 'EUNKNOWN'
    }

    const errorCode = getErrorCode()

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        temp_path: tempPath,
        export_path: exportPath,
      },
    }
  }
}
