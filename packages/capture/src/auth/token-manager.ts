/**
 * Token Manager - Complete Implementation
 *
 * Manages OAuth2 token lifecycle:
 * - Load and validate tokens from file
 * - Check expiration status
 * - Determine token state (valid/expiring/expired/revoked)
 * - Refresh expired tokens with retry logic
 */

import { readFile } from 'node:fs/promises'

import { z } from 'zod'

import type { TokenInfo } from './oauth-flow.js'
import type { OAuth2Client } from 'google-auth-library'

// Re-export TokenInfo from oauth-flow
export type { TokenInfo } from './oauth-flow.js'

// Token state for lifecycle management
export type TokenState = 'valid' | 'expiring_soon' | 'expired' | 'revoked'

// Token schema validation using zod
const TokenInfoSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expiry_date: z.number(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
})

// Five minutes in milliseconds (threshold for "expiring soon")
const FIVE_MINUTES_MS = 5 * 60 * 1000

export class TokenManager {
  /**
   * Load token from file and validate structure
   *
   * @param path - Path to token file
   * @returns Validated token information
   * @throws Error if file not found, invalid JSON, or missing required fields
   */
  async loadToken(path: string): Promise<TokenInfo> {
    let content: string
    try {
      // Read token file
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- User-provided token file path
      content = await readFile(path, 'utf-8')
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        throw new Error(`Token file not found: ${path}. Error: ENOENT`)
      }
      throw error
    }

    let parsed: unknown
    try {
      // Parse JSON
      parsed = JSON.parse(content)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in token file: ${path}`)
      }
      throw error
    }

    try {
      // Validate structure with zod
      const validated = TokenInfoSchema.parse(parsed)
      return validated as TokenInfo
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Extract missing fields
        const missingFields = this.extractMissingFields(error)

        // Check for specific missing fields
        const missingFieldError = this.getMissingFieldError(missingFields)
        if (missingFieldError) {
          throw new Error(missingFieldError)
        }

        throw new Error(`Invalid token structure: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Extract missing field names from ZodError
   */
  private extractMissingFields(error: z.ZodError): string[] {
    // Only report missing PRIMARY fields (access_token, refresh_token, expiry_date)
    // Optional fields (scope, token_type) should not be reported
    const primaryFields = ['access_token', 'refresh_token', 'expiry_date']

    return error.issues
      .filter((issue) => {
        if (issue.code === 'invalid_type') {
          const invalidTypeIssue = issue as unknown as {
            code: string
            received: unknown
            path: Array<string | number>
          }
          const fieldName = invalidTypeIssue.path.join('.')
          return invalidTypeIssue.received === undefined && primaryFields.includes(fieldName)
        }
        return false
      })
      .map((issue) => issue.path.join('.'))
  }

  /**
   * Get specific error message for missing fields
   */
  private getMissingFieldError(missingFields: string[]): string | undefined {
    if (missingFields.length === 0) {
      return undefined
    }

    // Prioritize primary token fields over optional ones
    const primaryFields = ['access_token', 'refresh_token', 'expiry_date']

    for (const field of primaryFields) {
      if (missingFields.includes(field)) {
        return `missing ${field}`
      }
    }

    return `Token file missing required fields: ${missingFields.join(', ')}`
  }

  /**
   * Save token to file (delegates to oauth-flow.saveTokenSecurely)
   *
   * @param path - Path to save token file
   * @param token - Token information to save
   */
  async saveToken(path: string, token: TokenInfo): Promise<void> {
    const { saveTokenSecurely } = await import('./oauth-flow.js')
    await saveTokenSecurely(path, token)
  }

  /**
   * Check if token is expired or expiring soon (< 5 minutes)
   *
   * @param token - Token to check
   * @returns true if token is expired or will expire within 5 minutes
   */
  isTokenExpired(token: TokenInfo): boolean {
    const now = Date.now()
    const expiryDate = token.expiry_date
    const fiveMinutesFromNow = now + FIVE_MINUTES_MS

    // Token is expired if it expires before 5 minutes from now
    return expiryDate < fiveMinutesFromNow
  }

  /**
   * Get current token state for lifecycle management
   *
   * @param token - Token to check
   * @returns Token state: valid, expiring_soon, expired, or revoked
   */
  getTokenState(token: TokenInfo): TokenState {
    // No refresh token = revoked (can't refresh)
    if (!token.refresh_token) {
      return 'revoked'
    }

    const now = Date.now()
    const expiry = token.expiry_date

    // Already expired
    if (expiry < now) {
      return 'expired'
    }

    // Expiring within 5 minutes
    if (expiry - now < FIVE_MINUTES_MS) {
      return 'expiring_soon'
    }

    // Still valid
    return 'valid'
  }

  /**
   * Refresh access token using OAuth2 client
   *
   * Includes retry logic for transient network errors.
   * Will NOT retry for permanent errors like revoked tokens.
   *
   * IMPORTANT: Google's refresh response typically does NOT include the refresh_token.
   * We preserve the existing refresh_token from oauth2Client.credentials.
   *
   * @param oauth2Client - Configured OAuth2 client with credentials
   * @returns New token information
   * @throws Error if refresh fails after retries or token is revoked
   */
  async refreshToken(oauth2Client: OAuth2Client): Promise<TokenInfo> {
    const maxRetries = 3
    let lastError: Error | undefined

    // Preserve the existing refresh token before refresh attempt
    const existingRefreshToken = oauth2Client.credentials.refresh_token

    if (!existingRefreshToken) {
      throw new Error('Cannot refresh token: No refresh token available in OAuth2 client')
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Attempt to refresh the token
        const { credentials } = await oauth2Client.refreshAccessToken()

        // Validate response has required fields
        if (!credentials.access_token || !credentials.expiry_date) {
          throw new Error(
            'Token refresh returned incomplete tokens (missing access_token or expiry_date)'
          )
        }

        // Return successfully refreshed token
        // Use refresh_token from response if present, otherwise preserve existing
        return {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token ?? existingRefreshToken,
          expiry_date: credentials.expiry_date,
          scope: credentials.scope ?? 'https://www.googleapis.com/auth/gmail.readonly',
          token_type: (credentials.token_type ?? 'Bearer') as 'Bearer',
        }
      } catch (error) {
        const err = error as Error & { code?: string; message?: string }

        // Permanent failure - token revoked, don't retry
        if (err.code === 'invalid_grant' || err.message?.includes('invalid_grant')) {
          throw new Error(
            'Token refresh failed: Refresh token revoked or invalid. Re-authorization required.'
          )
        }

        // Last attempt or non-retryable error
        if (attempt === maxRetries) {
          throw new Error(`Token refresh failed after ${maxRetries} attempts: ${err.message}`)
        }

        // Transient error - retry with exponential backoff
        lastError = error as Error
        const delay = 500 * Math.pow(2, attempt - 1) // 500ms, 1000ms, 2000ms
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    // Should not reach here, but TypeScript needs this
    throw lastError ?? new Error('Token refresh failed')
  }
}
