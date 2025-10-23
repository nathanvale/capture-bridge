/**
 * Attachment Counter (AC05)
 * Counts attachments in Gmail messages without downloading them
 */

interface GmailMessagePartBody {
  attachmentId?: string
  size?: number
  data?: string
}

interface GmailMessagePart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: Array<{ name: string; value: string }>
  body?: GmailMessagePartBody
  parts?: GmailMessagePart[]
}

interface GmailMessageLike {
  id?: string
  payload?: GmailMessagePart
}

/**
 * Count attachments in a Gmail message
 *
 * An attachment is identified by having a filename property.
 * This matches Gmail's behavior where parts with filenames are downloadable attachments.
 *
 * @param message - Gmail message object from API
 * @returns Number of attachments (0 if none)
 */
export const countAttachments = (message: GmailMessageLike): number => {
  if (!message?.payload) {
    return 0
  }

  return countAttachmentsInPart(message.payload)
}

/**
 * Recursively count attachments in a message part and its nested parts
 */
const countAttachmentsInPart = (part: GmailMessagePart): number => {
  let count = 0

  // A part is an attachment if it has a filename
  if (part.filename && part.filename.length > 0) {
    count++
  }

  // Recursively count in nested parts
  if (Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      count += countAttachmentsInPart(subPart)
    }
  }

  return count
}
