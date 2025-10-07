import { computeSHA256 } from './sha256-hash.js'
import { normalizeText } from './text-normalization.js'

/**
 * Compute email content hash combining Message-ID and normalized body
 * @param messageId - Gmail Message-ID for deduplication
 * @param body - Email body text (plain text)
 * @returns SHA-256 hash of combined messageId + normalized body
 */
export const computeEmailHash = (messageId: string, body: string): string => {
  // Normalize the body text
  const normalizedBody = normalizeText(body)

  // Combine Message-ID with normalized body
  // Format: messageId|normalizedBody
  const combined = `${messageId}|${normalizedBody}`

  // Compute SHA-256 hash
  return computeSHA256(combined)
}
