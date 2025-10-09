/**
 * Format a capture record as markdown with frontmatter
 *
 * Output format:
 * ---
 * id: {ULID}
 * source: voice | email
 * captured_at: {ISO8601}
 * content_hash: {SHA-256}
 * ---
 *
 * {raw_content}
 *
 * @param capture - Capture record from database
 * @returns Formatted markdown string
 */
export const formatMarkdown = (capture: {
  id: string
  source: string
  raw_content: string
  content_hash: string
  created_at: string
}): string => {
  const frontmatter = `---
id: ${capture.id}
source: ${capture.source}
captured_at: ${capture.created_at}
content_hash: ${capture.content_hash}
---`

  return `${frontmatter}\n\n${capture.raw_content}\n`
}
