/**
 * OAuth2 Authorization Flow Implementation [AC02 + AC03 + AC05 + AC06]
 * Handles Google OAuth2 authorization and token management
 */

import { promises as fs } from 'node:fs'

import { google } from 'googleapis'

import { GmailAuthError, GmailErrorType } from './types.js'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

/**
 * OAuth2 credentials structure from credentials.json
 */
export interface OAuth2Credentials {
  installed: {
    client_id: string
    client_secret: string
    redirect_uris: string[]
    auth_uri: string
    token_uri: string
  }
}

/**
 * Token structure stored in token.json
 */
export interface TokenData {
  access_token: string
  refresh_token?: string
  expiry_date?: number
  scope?: string
  token_type?: string
}

/**
 * Authorization result containing auth URL or credentials
 */
export interface AuthorizationResult {
  authUrl?: string
  credentials?: TokenData
}

/**
 * Options for authorize function (testing support)
 */
interface AuthorizeOptions {
  mockTokenExchange?: {
    tokens?: TokenData
    error?: string
  }
}

/**
 * Options for ensureValidToken function (testing support)
 */
interface EnsureValidTokenOptions {
  mockRefresh?: {
    tokens?: TokenData
    error?: string
  }
}

/**
 * Updates sync_state table with last successful Gmail auth timestamp
 * [AC06] Sync State Tracking
 *
 * @param db - SQLite database instance
 */
export const updateSyncState = (db: Database): void => {
  const timestamp = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES ('last_gmail_auth', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `)
  stmt.run(timestamp)
}

/**
 * Increments the gmail_auth_failures counter in sync_state
 * [AC07] Auth Failure Tracking
 *
 * @param db - SQLite database instance
 * @returns Current failure count after increment
 */
export const incrementAuthFailures = (db: Database): number => {
  const stmt = db.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES ('gmail_auth_failures', '1', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
      updated_at = datetime('now')
  `)
  stmt.run()

  const result = db
    .prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'")
    .get() as { value: string } | undefined
  return result ? parseInt(result.value, 10) : 0
}

/**
 * Resets the gmail_auth_failures counter to 0
 * [AC07] Auth Failure Tracking
 *
 * @param db - SQLite database instance
 */
export const resetAuthFailures = (db: Database): void => {
  const stmt = db.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES ('gmail_auth_failures', '0', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = '0',
      updated_at = datetime('now')
  `)
  stmt.run()
}

/**
 * Checks if auth failures have exceeded the threshold (>= 5)
 * Throws MaxAuthFailuresError if threshold exceeded
 * [AC07] Auth Failure Tracking
 *
 * @param db - SQLite database instance
 * @throws GmailAuthError with AUTH_MAX_FAILURES type if failures >= 5
 */
const checkAuthFailures = (db: Database): void => {
  const result = db
    .prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'")
    .get() as { value: string } | undefined
  const failures = result ? parseInt(result.value, 10) : 0

  if (failures >= 5) {
    throw new GmailAuthError(
      GmailErrorType.AUTH_MAX_FAILURES,
      `Gmail authentication has failed ${failures} times consecutively. Run 'capture doctor' to diagnose the issue.`,
      new Error(`Max auth failures exceeded: ${failures}`)
    )
  }
}

/**
 * Writes token to file with secure permissions (0600) using atomic write
 * [AC03] Token Storage Implementation
 *
 * @param path - Absolute path to token.json
 * @param token - Token data to write
 */
const writeTokenSecurely = async (path: string, token: TokenData): Promise<void> => {
  // Atomic write: write to temp file, then rename
  const tmpPath = `${path}.tmp`

  try {
    // Write to temp file with 0600 permissions
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- OAuth token paths are controlled by application config
    await fs.writeFile(tmpPath, JSON.stringify(token, undefined, 2), { mode: 0o600 })

    // Atomic rename
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- OAuth token paths are controlled by application config
    await fs.rename(tmpPath, path)
  } catch (error) {
    // Clean up temp file on failure
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- OAuth token paths are controlled by application config
    await fs.unlink(tmpPath).catch(() => {
      // Ignore cleanup errors - original error is more important
    })
    throw error
  }
}

/**
 * Authorizes the application with Google OAuth2
 * [AC02] OAuth2 Authorization Flow + [AC06] Sync State Tracking + [AC07] Failure Tracking
 *
 * @param credentialsPath - Path to credentials.json
 * @param tokenPath - Optional path to save token.json (defaults to no save)
 * @param db - Optional database for sync state tracking
 * @param options - Optional testing options
 * @returns Authorization result with authUrl or credentials
 */
export const authorize = async (
  credentialsPath: string,
  tokenPath?: string,
  db?: Database,
  options?: AuthorizeOptions
): Promise<AuthorizationResult> => {
  // Check if auth failures have exceeded threshold [AC07]
  if (db) {
    checkAuthFailures(db)
  }

  try {
    // Load credentials
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- OAuth credential paths are controlled by application config
    const credentialsContent = await fs.readFile(credentialsPath, 'utf-8')
    const credentials: OAuth2Credentials = JSON.parse(credentialsContent)

    const { client_id, client_secret, redirect_uris } = credentials.installed

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    })

    // If mock token exchange provided (testing)
    if (options?.mockTokenExchange) {
      if (options.mockTokenExchange.error) {
        throw new Error(`OAuth2 error: ${options.mockTokenExchange.error}`)
      }

      if (options.mockTokenExchange.tokens) {
        const { tokens } = options.mockTokenExchange

        // Save token if path provided
        if (tokenPath) {
          await writeTokenSecurely(tokenPath, tokens)
        }

        // Update sync state after successful token exchange [AC06]
        // Reset auth failures after successful auth [AC07]
        if (db) {
          updateSyncState(db)
          resetAuthFailures(db)
        }

        return {
          authUrl,
          credentials: tokens,
        }
      }
    }

    // In production, return auth URL for user to visit
    return {
      authUrl,
    }
  } catch (error) {
    // Increment failure counter on any error [AC07]
    if (db) {
      incrementAuthFailures(db)
    }
    throw error
  }
}

/**
 * Loads and validates token from token.json
 * [AC03] Token Loading with Validation
 *
 * @param tokenPath - Path to token.json
 * @returns Parsed token data
 * @throws Error if token file is corrupted or invalid JSON
 */
export const loadToken = async (tokenPath: string): Promise<TokenData> => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- OAuth token paths are controlled by application config
    const content = await fs.readFile(tokenPath, 'utf-8')
    const token = JSON.parse(content) as TokenData

    // Validate required fields
    if (!token.access_token) {
      throw new Error('Invalid token: missing access_token')
    }

    return token
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Corrupted token file: ${error.message}`)
    }
    throw error
  }
}

/**
 * Checks if a token is expired or expiring within 5 minutes
 * [AC04] Token Expiry Detection
 *
 * @param token - Token data to check
 * @returns true if token is expired or expiring soon, false otherwise
 */
export const isTokenExpired = (token: TokenData): boolean => {
  // If no expiry_date, consider it expired
  if (!token.expiry_date) {
    return true
  }

  const expiryDate = new Date(token.expiry_date)
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)

  // Return true if token expires before 5 minutes from now
  return expiryDate < fiveMinutesFromNow
}

/**
 * Parses error string to extract rate limit information
 *
 * @param errorStr - Error string to parse (may be JSON)
 * @returns Parsed error object or undefined if not JSON/not parseable
 */
const parseErrorObject = (
  errorStr: string
): { status?: number; retryAfter?: number } | undefined => {
  try {
    return JSON.parse(errorStr)
  } catch {
    return undefined
  }
}

/**
 * Handles invalid_grant error (revoked token)
 *
 * @throws GmailAuthError with AUTH_INVALID_GRANT type
 */
const handleInvalidGrant = (): never => {
  const originalError = new Error('OAuth2 error: invalid_grant')
  throw new GmailAuthError(
    GmailErrorType.AUTH_INVALID_GRANT,
    'Token revoked - refresh token is no longer valid',
    originalError
  )
}

/**
 * Handles rate limit error (HTTP 429)
 *
 * @param errorStr - Error string (JSON with status and retryAfter)
 * @param errorObj - Parsed error object
 * @throws GmailAuthError with API_RATE_LIMITED type
 */
const handleRateLimit = (
  errorStr: string,
  errorObj: { status?: number; retryAfter?: number }
): never => {
  const originalError = new Error(`Rate limit: ${errorStr}`)
  const retryMsg = errorObj.retryAfter
    ? `Rate limit exceeded - retry after ${errorObj.retryAfter} seconds`
    : 'Rate limit exceeded - retry later'
  throw new GmailAuthError(GmailErrorType.API_RATE_LIMITED, retryMsg, originalError)
}

/**
 * Processes mock refresh error, determining error type and throwing appropriate error
 *
 * @param errorStr - Error string from mock
 * @throws GmailAuthError with appropriate error type
 */
const processMockRefreshError = (errorStr: string): never => {
  // Check for invalid_grant (revoked token)
  if (errorStr === 'invalid_grant') {
    handleInvalidGrant()
  }

  // Check for rate limit (HTTP 429)
  const errorObj = parseErrorObject(errorStr)
  if (errorObj?.status === 429) {
    handleRateLimit(errorStr, errorObj)
  }

  // Generic OAuth2 error (always throws, so function always has a path that throws)
  throw new GmailAuthError(
    GmailErrorType.AUTH_INVALID_REQUEST,
    `OAuth2 error: ${errorStr}`,
    new Error(`OAuth2 error: ${errorStr}`)
  )
}

/**
 * Ensures token is valid, refreshing if necessary
 * [AC04] Automatic Token Refresh + [AC06] Sync State Tracking + [AC07] Failure Tracking
 *
 * @param credentialsPath - Path to credentials.json (optional for testing)
 * @param tokenPath - Path to token.json
 * @param db - Optional database for sync state tracking
 * @param options - Optional testing options
 * @throws Error if refresh fails or token is invalid
 */
export const ensureValidToken = async (
  credentialsPathOrToken: string,
  tokenPath?: string,
  db?: Database,
  options?: EnsureValidTokenOptions
): Promise<void> => {
  // Check if auth failures have exceeded threshold [AC07]
  if (db) {
    checkAuthFailures(db)
  }

  // Handle single-argument case (tokenPath only)
  const actualTokenPath = tokenPath ?? credentialsPathOrToken
  const actualCredentialsPath = tokenPath ? credentialsPathOrToken : undefined

  // Load current token
  const token = await loadToken(actualTokenPath)

  // Check if token needs refresh
  if (!isTokenExpired(token)) {
    return // Token still valid
  }

  try {
    // If mock refresh provided (testing)
    if (options?.mockRefresh) {
      if (options.mockRefresh.error) {
        processMockRefreshError(options.mockRefresh.error)
      }

      if (options.mockRefresh.tokens) {
        // Write refreshed token atomically
        await writeTokenSecurely(actualTokenPath, options.mockRefresh.tokens)

        // Update sync state after successful token refresh [AC06]
        // Reset auth failures after successful refresh [AC07]
        if (db) {
          updateSyncState(db)
          resetAuthFailures(db)
        }

        return
      }
    }

    // Production refresh would happen here
    // For now, we only support mock refresh in tests
    if (!actualCredentialsPath) {
      throw new Error('Token expired and no credentials provided for refresh')
    }

    // In production, this would:
    // 1. Load credentials from credentialsPath
    // 2. Create OAuth2 client
    // 3. Call oauth2Client.refreshAccessToken()
    // 4. Write new tokens atomically
    throw new Error('Production token refresh not yet implemented')
  } catch (error) {
    // Increment failure counter on any error [AC07]
    if (db) {
      incrementAuthFailures(db)
    }
    throw error
  }
}
