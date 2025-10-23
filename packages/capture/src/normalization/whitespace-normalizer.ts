/**
 * Normalizes whitespace in text content for consistent hashing.
 *
 * Performs the following transformations:
 * - Trims leading and trailing whitespace
 * - Converts all line ending types (CRLF, CR, LF) to LF (\n)
 * - Collapses multiple consecutive spaces/tabs to single space
 * - Collapses multiple consecutive blank lines to single blank line
 *
 * @param text - The text to normalize
 * @returns Normalized text with consistent whitespace
 */
export const normalizeWhitespace = (text: string): string => {
  // Step 1: Normalize line endings to LF
  // Handle CRLF (\r\n), CR (\r), and LF (\n) - convert all to LF
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Step 2: Collapse multiple blank lines to single blank line
  // This preserves paragraph structure (max one blank line between paragraphs)
  normalized = normalized.replace(/\n{3,}/g, '\n\n')

  // Step 3: Split by lines, normalize each line's internal whitespace, then rejoin
  const lines = normalized.split('\n')
  const processedLines = lines.map((line) => {
    // Collapse all whitespace (spaces, tabs, etc.) to single space
    return line.replace(/\s+/g, ' ').trim()
  })

  // Step 4: Join lines back together and trim the entire result
  return processedLines.join('\n').trim()
}
