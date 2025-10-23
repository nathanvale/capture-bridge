import { computeSHA256 } from '@capture-bridge/foundation'

import { stripHtmlTags } from './html-stripper.js'
import { normalizeWhitespace } from './whitespace-normalizer.js'

/**
 * Compute SHA-256 content hash for email bodies
 * Integrates AC01 (HTML stripping) + AC02 (whitespace normalization) + AC03 (hashing)
 */

/**
 * Compute content hash for email body
 *
 * Implements the full normalization pipeline:
 * 1. Strip HTML tags (AC01)
 * 2. Normalize whitespace (AC02)
 * 3. Compute SHA-256 hash (AC03)
 *
 * This ensures deterministic hashing - the same logical content will
 * always produce the same hash regardless of HTML formatting or whitespace variations.
 *
 * @param rawContent - Raw email content (may contain HTML)
 * @returns SHA-256 hash (64-character hex string)
 */
export const computeEmailContentHash = (rawContent: string): string => {
  // Step 1: Strip HTML tags (AC01)
  const stripped = stripHtmlTags(rawContent)

  // Step 2: Normalize whitespace (AC02)
  const normalized = normalizeWhitespace(stripped)

  // Step 3: Compute SHA-256 hash (AC03)
  return computeSHA256(normalized)
}
