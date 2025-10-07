/**
 * Normalize text for deterministic hashing
 * - Trims leading/trailing whitespace
 * - Normalizes all line endings to LF
 * @param text - Input text to normalize
 * @returns Normalized text with consistent formatting
 */
export const normalizeText = (text: string | null | undefined): string => {
  // Handle null/undefined cases
  if (text == undefined) {
    return ''
  }

  // Normalize line endings: CRLF -> LF, CR -> LF
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Trim leading and trailing whitespace
  return normalized.trim()
}
