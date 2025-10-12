/**
 * OAuth2 Authorization Flow Implementation
 *
 * Implements OAuth2 authorization flow for Gmail API access:
 * - Generate authorization URL with PKCE (Proof Key for Code Exchange)
 * - Exchange authorization code for tokens
 * - Securely save tokens with atomic write pattern
 *
 * Security: Tokens saved with 0600 permissions, PKCE enabled
 * Atomicity: Uses temp file + rename pattern
 */

import { randomBytes, createHash } from 'node:crypto'
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
 * PKCE (Proof Key for Code Exchange) parameters
 */
export interface PKCEParams {
  code_verifier: string
  code_challenge: string
}

/**
 * Generate PKCE parameters for OAuth2 authorization
 *
 * PKCE prevents authorization code interception attacks by:
 * 1. Generating a random code_verifier
 * 2. Creating a code_challenge from SHA256(code_verifier)
 * 3. Sending code_challenge with auth request
 * 4. Sending code_verifier with token exchange
 *
 * @returns PKCE parameters with code_verifier and code_challenge
 */
export const generatePKCE = (): PKCEParams => {
  // Generate random 43-128 character code verifier (spec recommends 43)
  const code_verifier = base64URLEncode(randomBytes(32))

  // Create SHA256 hash of verifier
  const hash = createHash('sha256').update(code_verifier).digest()

  // Base64URL encode the hash
  const code_challenge = base64URLEncode(hash)

  return {
    code_verifier,
    code_challenge,
  }
}

/**
 * Base64URL encode a buffer (RFC 7636 compliant)
 *
 * Converts base64 to base64url by:
 * - Replacing + with -
 * - Replacing / with _
 * - Removing = padding
 */
const base64URLEncode = (buffer: Buffer): string => {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Generate OAuth2 authorization URL with PKCE
 *
 * Creates authorization URL with:
 * - gmail.readonly scope
 * - access_type=offline (to get refresh token)
 * - PKCE code_challenge for security
 * - prompt=consent to force refresh token issuance
 * - include_granted_scopes for future scope additions
 *
 * @param oauth2Client - Configured OAuth2 client
 * @param codeChallenge - PKCE code challenge (from generatePKCE)
 * @returns Authorization URL for user to visit
 */
export const generateAuthUrl = (oauth2Client: OAuth2Client, codeChallenge?: string): string => {
  const baseParams = {
    access_type: 'offline' as const,
    scope: [GMAIL_SCOPE],
    // Force consent to reliably get refresh token
    prompt: 'consent',
    // Allow future scope additions without re-authorization
    include_granted_scopes: true,
  }

  // Add PKCE parameters if code challenge provided (recommended for installed apps)
  if (codeChallenge) {
    return oauth2Client.generateAuthUrl({
      ...baseParams,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    } as Parameters<typeof oauth2Client.generateAuthUrl>[0])
  }

  return oauth2Client.generateAuthUrl(baseParams)
}

/**
 * Exchange authorization code for access and refresh tokens with PKCE support
 *
 * @param oauth2Client - Configured OAuth2 client
 * @param code - Authorization code from user
 * @param codeVerifier - PKCE code verifier (optional, from generatePKCE)
 * @returns Token information including access and refresh tokens
 * @throws Error with ADHD-friendly message on failure
 */
export const exchangeCodeForTokens = async (
  oauth2Client: OAuth2Client,
  code: string,
  codeVerifier?: string
): Promise<TokenInfo> => {
  try {
    // If PKCE was used, include code_verifier in token exchange
    const { tokens } = codeVerifier
      ? await oauth2Client.getToken({ code, codeVerifier })
      : await oauth2Client.getToken(code)

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
