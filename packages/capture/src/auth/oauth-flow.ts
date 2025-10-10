/**
 * OAuth2 Authorization Flow Implementation
 *
 * Implements OAuth2 authorization flow for Gmail API access:
 * - Generate authorization URL with offline access
 * - Exchange authorization code for tokens
 * - Securely save tokens with atomic write pattern
 *
 * Security: Tokens saved with 0600 permissions
 * Atomicity: Uses temp file + rename pattern
 */

import { rename, stat, writeFile } from 'node:fs/promises'

import type { OAuth2Client } from 'google-auth-library'

/**
 * Gmail OAuth2 scope for read-only access
 */
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

/**
 * Token information returned from OAuth2 exchange
 */
export interface TokenInfo {
  access_token: string
  refresh_token: string
  expiry_date: number // Unix timestamp in ms
  scope: string
  token_type: 'Bearer'
}

/**
 * Generate OAuth2 authorization URL
 *
 * Creates authorization URL with:
 * - gmail.readonly scope
 * - access_type=offline (to get refresh token)
 *
 * @param oauth2Client - Configured OAuth2 client
 * @returns Authorization URL for user to visit
 */
export const generateAuthUrl = (oauth2Client: OAuth2Client): string => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [GMAIL_SCOPE],
  })
}

/**
 * Exchange authorization code for access and refresh tokens
 *
 * @param oauth2Client - Configured OAuth2 client
 * @param code - Authorization code from user
 * @returns Token information including access and refresh tokens
 * @throws Error with ADHD-friendly message on failure
 */
export const exchangeCodeForTokens = async (
  oauth2Client: OAuth2Client,
  code: string
): Promise<TokenInfo> => {
  try {
    const { tokens } = await oauth2Client.getToken(code)

    // Validate token structure
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      throw new Error(
        'Token exchange returned incomplete tokens. Please try the authorization flow again.'
      )
    }

    return tokens as TokenInfo
  } catch (error) {
    // Provide ADHD-friendly error messages
    const err = error as Error & { code?: string }

    if (err.code === 'invalid_grant') {
      throw new Error(
        'Invalid authorization code. Make sure you copied the entire code from the browser, including any trailing characters.'
      )
    }

    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      throw new Error(
        'Network connection failed. Check your internet connection and try again in a moment.'
      )
    }

    // Re-throw with original error message
    throw error
  }
}

/**
 * Save tokens securely to file with atomic write pattern
 *
 * Uses temp file + rename pattern for atomicity:
 * 1. Write to temporary file with 0600 permissions
 * 2. Rename temp file to final path (atomic operation)
 *
 * @param path - Path to save token file
 * @param token - Token information to save
 * @throws Error if token is invalid or write fails
 */
export const saveTokenSecurely = async (path: string, token: TokenInfo): Promise<void> => {
  // Validate token structure
  if (!token.access_token) {
    throw new Error('Token is invalid: missing access_token')
  }

  if (!token.refresh_token) {
    throw new Error('Token is invalid: missing refresh_token')
  }

  if (!token.expiry_date) {
    throw new Error('Token is invalid: missing expiry_date')
  }

  const tmpPath = `${path}.tmp`

  try {
    // Step 1: Write to temp file with secure permissions (0600)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is user-provided token file path
    await writeFile(tmpPath, JSON.stringify(token, undefined, 2), { mode: 0o600 })

    // Step 2: Atomic rename (overwrites if exists)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Atomic rename for token file
    await rename(tmpPath, path)

    // Step 3: Verify permissions (defensive check)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Verify token file permissions
    const stats = await stat(path)
    const mode = stats.mode & parseInt('777', 8)

    if (mode !== 0o600) {
      // eslint-disable-next-line no-console -- Warning user about insecure permissions
      console.warn(
        `Warning: Token file permissions are ${mode.toString(8)} instead of 600. ` +
          `Run: chmod 600 ${path}`
      )
    }
  } catch (error) {
    // Clean up temp file if it exists
    try {
      const fs = await import('node:fs/promises')
      await fs.unlink(tmpPath)
    } catch {
      // Ignore cleanup errors
    }

    throw error
  }
}
