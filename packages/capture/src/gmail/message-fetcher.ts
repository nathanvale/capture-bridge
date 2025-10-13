/**
 * GmailMessageFetcher
 * AC06: Fetch full message (headers + plain text body)
 */

import type DatabaseConstructor from 'better-sqlite3'

// Keep the Database type aligned with other gmail modules
type Database = ReturnType<typeof DatabaseConstructor>

export interface MessageFetchResult {
  messageId: string
  from: string
  subject: string
  body: string
  date: string
  headers: Record<string, string>
  raw?: unknown
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessagePartBody {
  attachmentId?: string
  size?: number
  data?: string
}

interface GmailMessagePart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: GmailMessagePartBody
  parts?: GmailMessagePart[]
}

interface GmailMessageLike {
  id?: string
  payload?: GmailMessagePart
}

/**
 * Fetches a single Gmail message and extracts headers and plain text body.
 */
export class GmailMessageFetcher {
  constructor(
    private readonly db: Database,
    private readonly gmail: {
      users: {
        messages: {
          get: (req: { userId: 'me'; id: string; format: 'full' }) => Promise<{ data: GmailMessageLike }>
        }
      }
    }
  ) {}

  /**
   * Fetch a message by id and return normalized result with headers and text body.
   */
  async fetchMessage(messageId: string): Promise<MessageFetchResult> {
    try {
      const res = await this.gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
      const msg = res.data

      const headers = this.buildHeadersMap(msg.payload)
      const from = this.getHeader(headers, 'From') ?? ''
      const subject = this.getHeader(headers, 'Subject') ?? ''
      const date = this.getHeader(headers, 'Date') ?? ''
      // message-id is important for dedup, but not directly part of AC06 result fields
      // It will be available in headers map for subsequent steps

      const body = this.extractPlainTextBody(msg.payload) ?? ''

      const result: MessageFetchResult = {
        messageId: msg.id ?? messageId,
        from,
        subject,
        body,
        date,
        headers,
        raw: msg,
      }
      return result
    } catch (error) {
      // Log and rethrow with context
      this.logError('gmail.fetchMessage', error, { messageId })
      throw error
    }
  }

  // ----- Helpers -----

  private getHeader(map: Record<string, string>, name: string): string | undefined {
    // Headers are case-insensitive; preserve canonical capitalization when present
    for (const [k, v] of Object.entries(map)) {
      if (k === name || k.toLowerCase() === name.toLowerCase()) return v
    }
    return undefined
  }

  private buildHeadersMap(payload?: GmailMessagePart): Record<string, string> {
    const map: Record<string, string> = {}
    const headers = payload?.headers ?? []
    for (const h of headers) {
      if (!h?.name) continue
      map[h.name] = h.value ?? ''
    }
    return map
  }

  private extractPlainTextBody(payload?: GmailMessagePart): string | undefined {
    if (!payload) return ''
    // Direct text/plain
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return this.decodeBase64Like(payload.body.data)
    }
    // Recurse into parts
    if (Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        const txt = this.extractPlainTextBody(part)
        if (txt) return txt
      }
    }
    return ''
  }

  private decodeBase64Like(data: string): string {
    // Accept both base64 and base64url inputs
    // Reject clearly invalid inputs early (contain characters outside expected sets)
    const base64urlOk = /^[A-Za-z0-9\-_]+=*$/.test(data)
    const base64Ok = /^[A-Za-z0-9+/]+=*$/.test(data)
    if (!base64urlOk && !base64Ok) return ''
    // 1) Convert base64url to base64 (+,/)
    // 2) Remove invalid characters
    // 3) Add padding to reach length % 4 === 0
    let normalized = data.replace(/-/g, '+').replace(/_/g, '/')
    normalized = normalized.replace(/\s+/g, '')
    normalized = normalized.replace(/[^A-Za-z0-9+/=]/g, '')
    const rem = normalized.length % 4
    if (rem !== 0) normalized += '='.repeat(4 - rem)
    try {
      return Buffer.from(normalized, 'base64').toString('utf-8')
    } catch {
      // Fallback: return empty string if decoding fails
      return ''
    }
  }

  private logError(source: string, error: unknown, context?: Record<string, unknown>): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS errors_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT,
          code INTEGER,
          message TEXT,
          context TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)

      // Best-effort extraction of code/message
      let code: number | undefined
      let message = ''
      if (typeof error === 'object' && error !== null) {
        const { code: c, message: m } = error as { code?: unknown; message?: unknown }
        if (typeof c === 'number') code = c
        if (typeof m === 'string') message = m
      }
      if (!message) message = String(error)
      const contextStr = context ? JSON.stringify(context) : undefined

      this.db
        .prepare(
          `INSERT INTO errors_log (source, code, message, context)
           VALUES (@source, @code, @message, @context)`
        )
        .run({ source, code, message, context: contextStr })
    } catch {
      // Swallow logging errors
    }
  }
}
