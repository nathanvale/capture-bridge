/**
 * Strip HTML tags from content and decode HTML entities
 * @param html - HTML content to process
 * @returns Plain text content
 */
export const stripHtmlTags = (html: string): string => {
  if (!html || html.length === 0) {
    return ''
  }

  let text = html

  // Remove script tags with their content
  text = text.replace(/<script\b[\s\S]*?<\/script>/gi, '')

  // Remove style tags with their content
  text = text.replace(/<style\b[\s\S]*?<\/style>/gi, '')

  // Remove all remaining HTML tags
  // Use character-by-character approach to avoid regex backtracking issues
  const parts: string[] = []
  let inTag = false
  let currentText = ''

  for (const char of text) {
    if (char === '<') {
      if (currentText) {
        parts.push(currentText)
        currentText = ''
      }
      inTag = true
    } else if (char === '>') {
      inTag = false
    } else if (!inTag) {
      currentText += char
    }
  }

  if (currentText) {
    parts.push(currentText)
  }

  text = parts.join('')

  // Decode HTML entities
  text = decodeHtmlEntities(text)

  return text
}

/**
 * Decode common HTML entities to their text equivalents
 * @param text - Text containing HTML entities
 * @returns Decoded text
 */
const decodeHtmlEntities = (text: string): string => {
  const entityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  }

  let decoded = text

  // Replace named entities
  for (const [entity, char] of Object.entries(entityMap)) {
    decoded = decoded.split(entity).join(char)
  }

  // Replace numeric entities (&#xxx; and &#xXX;)
  decoded = decoded.replace(/&#(\d+);/g, (_match, dec) => {
    return String.fromCharCode(Number.parseInt(dec, 10))
  })

  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
    return String.fromCharCode(Number.parseInt(hex, 16))
  })

  return decoded
}
