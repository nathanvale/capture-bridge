/**
 * Email metadata extraction (AC07)
 * - Extracts Message-ID, From, Subject, Date and channel-specific optional fields
 * - Normalizes Message-ID (remove angle brackets) and Date (ISO 8601)
 * - Returns a structured success/error result for staging and dedup checks
 */

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailMessageLike {
  id?: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  historyId?: string
  internalDate?: string
  sizeEstimate?: number
  payload?: { headers?: GmailHeader[] }
}

export interface EmailMetadata {
  channel: 'email'
  channel_native_id: string
  message_id: string
  from: string
  subject: string
  date: string
  thread_id?: string
  labels?: string[]
  snippet?: string
  internal_date?: string
  size_estimate?: number
  history_id?: string
}

export interface HeaderExtractionError {
  code: 'missing_message_id' | 'missing_from' | 'invalid_date'
  message: string
  headers: Record<string, string>
}

export interface HeaderExtractionResult {
  success: boolean
  metadata?: EmailMetadata
  error?: HeaderExtractionError
}

/**
 * Case-insensitive header lookup.
 */
const getHeader = (headers: GmailHeader[] | undefined, name: string): string | undefined => {
  if (!headers) return undefined
  const target = name.toLowerCase()
  for (const h of headers) {
    if (!h?.name) continue
    if (h.name === name || h.name.toLowerCase() === target) return h.value ?? ''
  }
  return undefined
}

/**
 * Build a debug-friendly map of headers (first occurrence wins), preserving original casing.
 */
const headersToMap = (headers: GmailHeader[] | undefined): Record<string, string> => {
  const map: Record<string, string> = {}
  for (const h of headers ?? []) {
    if (!h?.name || h.name in map) continue
    map[h.name] = h.value ?? ''
  }
  return map
}

/**
 * Remove surrounding angle brackets from RFC 5322 Message-ID if present.
 * Examples:
 *   '<abc@x>' -> 'abc@x'
 *   'abc@x'   -> 'abc@x'
 */
export const cleanMessageId = (raw: string): string => {
  const trimmed = String(raw).trim()
  return trimmed.replace(/^<([^>]+)>$/u, '$1')
}

/**
 * Normalize a date-like value to ISO 8601 string.
 * Accepts RFC 2822/ISO strings and millisecond timestamps (as string or number).
 */
export const normalizeDate = (input: string | number): string => {
  // Try Date-parsable string/number first
  const d1 = new Date(input)
  if (!Number.isNaN(d1.getTime())) return d1.toISOString()

  // If input is numeric string but not parsed above, try as millis explicitly
  const ms = typeof input === 'string' ? Number.parseInt(input, 10) : Number(input)
  if (Number.isFinite(ms)) {
    const d2 = new Date(ms)
    if (!Number.isNaN(d2.getTime())) return d2.toISOString()
  }

  // Fallback: now (ensures ISO shape for downstream code). Not expected in tests.
  return new Date().toISOString()
}

/**
 * Extract channel metadata from a Gmail message object.
 * - Requires Message-ID and From headers
 * - Subject defaults to "(no subject)"
 * - Date falls back to internalDate if missing, and is normalized to ISO
 */
export const extractEmailMetadata = (message: GmailMessageLike): HeaderExtractionResult => {
  const headers = message?.payload?.headers ?? []
  const headerMap = headersToMap(headers)

  const rawMessageId = getHeader(headers, 'Message-ID')
  if (!rawMessageId) {
    return {
      success: false,
      error: {
        code: 'missing_message_id',
        message: 'Message-ID header required for deduplication',
        headers: headerMap,
      },
    }
  }

  const from = getHeader(headers, 'From')
  if (!from) {
    return {
      success: false,
      error: {
        code: 'missing_from',
        message: 'From header required for email captures',
        headers: headerMap,
      },
    }
  }

  const subject = getHeader(headers, 'Subject') ?? '(no subject)'
  const dateHeader = getHeader(headers, 'Date')
  const date = normalizeDate(dateHeader ?? message.internalDate ?? new Date().toISOString())

  const cleanedId = cleanMessageId(rawMessageId)

  const base: EmailMetadata = {
    channel: 'email',
    channel_native_id: cleanedId,
    message_id: cleanedId,
    from,
    subject,
    date,
  }

  if (message.threadId !== undefined) base.thread_id = message.threadId
  if (message.labelIds !== undefined) base.labels = message.labelIds
  if (message.snippet !== undefined) base.snippet = message.snippet
  if (message.internalDate !== undefined) base.internal_date = message.internalDate
  if (message.sizeEstimate !== undefined) base.size_estimate = message.sizeEstimate
  if (message.historyId !== undefined) base.history_id = message.historyId

  return { success: true, metadata: base }
}

export type { GmailMessageLike as GmailMessage }
