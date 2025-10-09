/**
 * @capture-bridge/obsidian-bridge
 *
 * Atomic file writer for Obsidian vault exports using temp-then-rename pattern.
 */

// Export types
export type { AtomicWriteResult, AtomicWriteError } from './types.js'
export { CollisionResult } from './types.js'

// Export path resolver utilities
export { validateCaptureId, resolveTempPath, resolveExportPath } from './path-resolver.js'

// Export atomic writer
export { writeAtomic, checkCollision } from './writer/index.js'
