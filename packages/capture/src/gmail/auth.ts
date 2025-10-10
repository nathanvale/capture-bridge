/**
 * OAuth2 Authorization Flow Implementation [AC02 + AC03 + AC05 + AC06]
 * Handles Google OAuth2 authorization and token management
 */

import { promises as fs } from 'node:fs'

import { google } from 'googleapis'

import { GmailAuthError, GmailErrorType, type GmailToken } from './types.js'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

/**
 * Authorization result containing auth URL or credentials
 */
export interface AuthorizationResult {
  authUrl?: string
  credentials?: GmailToken
}

/**
 * Options for authorize function (testing support)
 */
interface AuthorizeOptions {
  mockTokenExchange?: {
    tokens?: GmailToken
    error?: string
  }
}

/**
 * Options for ensureValidToken function (testing support)
 */
interface EnsureValidTokenOptions {
  mockRefresh?: {
    tokens?: GmailToken
    error?: string
  }
}

/**
 * Ensures sync_state table exists (defensive guard for P0-3)
 * Safe to call multiple times - uses IF NOT EXISTS
 *
 * @param db - SQLite database instance
 */
const ensureSyncStateTable = (db: Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

/**
 * Updates sync_state table with last successful Gmail auth timestamp
 * [AC06] Sync State Tracking + [P0-3] Defensive table initialization
 *
 * @param db - SQLite database instance
 */
export const updateSyncState = (db: Database): void => {
  ensureSyncStateTable(db)
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
 * [AC07] Auth Failure Tracking + [P0-3] Defensive table initialization
 *
 * @param db - SQLite database instance
 * @returns Current failure count after increment
 */
export const incrementAuthFailures = (db: Database): number => {
  ensureSyncStateTable(db)
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
 * [AC07] Auth Failure Tracking + [P0-3] Defensive table initialization
 *
 * @param db - SQLite database instance
 */
export const resetAuthFailures = (db: Database): void => {
  ensureSyncStateTable(db)
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
 * [AC07] Auth Failure Tracking + [P0-3] Defensive table initialization
 *
 * @param db - SQLite database instance
 * @throws GmailAuthError with AUTH_MAX_FAILURES type if failures >= 5
 */
const checkAuthFailures = (db: Database): void => {
  ensureSyncStateTable(db)
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
const writeTokenSecurely = async (path: string, token: GmailToken): Promise<void> => {
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
    // Load and validate credentials using shared loader [P0-2: AC01 validation]
    const { loadCredentials } = await import('./credentials.js')
    const credentials = await loadCredentials(credentialsPath)

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
export const loadToken = async (tokenPath: string): Promise<GmailToken> => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- OAuth token paths are controlled by application config
    const content = await fs.readFile(tokenPath, 'utf-8')
    const token = JSON.parse(content) as GmailToken

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
export const isTokenExpired = (token: GmailToken): boolean => {
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
 * Type guard for Axios-like errors from googleapis
 */
const isAxiosError = (
  err: unknown
): err is {
  response?: { status?: number; data?: { error?: string; error_description?: string } }
  code?: string
  message?: string
} => typeof err === 'object' && err !== null

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
 * Handles HTTP 400 Bad Request errors
 *
 * @param error - Original error object
 * @param errorType - OAuth2 error type from response
 * @param errorDesc - Optional error description
 * @throws GmailAuthError with appropriate error type
 */
const handleBadRequest = (error: unknown, errorType: string, errorDesc: string): never => {
  if (errorType === 'invalid_grant') {
    throw new GmailAuthError(
      GmailErrorType.AUTH_INVALID_GRANT,
      'Token revoked - refresh token is no longer valid',
      error
    )
  }
  const message = errorDesc
    ? `OAuth2 error: ${errorType} - ${errorDesc}`
    : `OAuth2 error: ${errorType}`
  throw new GmailAuthError(GmailErrorType.AUTH_INVALID_REQUEST, message, error)
}

/**
 * Handles HTTP 429 Rate Limit errors
 *
 * @param error - Original error object
 * @param data - Response data (may contain retryAfter)
 * @throws GmailAuthError with API_RATE_LIMITED type
 */
const handleRateLimitResponse = (error: unknown, data?: unknown): never => {
  // Parse Retry-After from response data if available
  const retryAfter =
    data && typeof data === 'object' && 'retryAfter' in data && typeof data.retryAfter === 'number'
      ? data.retryAfter
      : undefined
  const retryMsg = retryAfter
    ? `Rate limit exceeded - retry after ${retryAfter} seconds`
    : 'Rate limit exceeded - retry later'
  throw new GmailAuthError(GmailErrorType.API_RATE_LIMITED, retryMsg, error)
}

/**
 * Handles HTTP 5xx Server Error responses
 *
 * @param error - Original error object
 * @param status - HTTP status code
 * @throws GmailAuthError with API_SERVER_ERROR type
 */
const handleServerError = (error: unknown, status: number): never => {
  throw new GmailAuthError(
    GmailErrorType.API_SERVER_ERROR,
    `Gmail API server error (${status})`,
    error
  )
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
 * Maps googleapis errors to GmailAuthError types
 * Centralizes error taxonomy for production OAuth2 operations
 * [P0-1: Production error mapping]
 *
 * @param error - Unknown error from googleapis
 * @throws GmailAuthError with appropriate error type
 */
const mapGoogleApisError = (error: unknown): never => {
  if (!isAxiosError(error)) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    throw new GmailAuthError(
      GmailErrorType.AUTH_INVALID_REQUEST,
      `OAuth2 error: ${errorMsg}`,
      error
    )
  }

  // Handle HTTP response errors
  if (error.response?.status) {
    const { status, data } = error.response
    const errorType = data?.error ?? 'unknown'
    const errorDesc = data?.error_description ?? ''

    switch (status) {
      case 400:
        handleBadRequest(error, errorType, errorDesc)
        break

      case 401:
        throw new GmailAuthError(
          GmailErrorType.AUTH_INVALID_GRANT,
          'Token revoked - refresh token is no longer valid',
          error
        )

      case 429:
        handleRateLimitResponse(error, data)
        break

      case 500:
      case 502:
      case 503:
      case 504:
        handleServerError(error, status)
        break

      default:
        throw new GmailAuthError(
          GmailErrorType.AUTH_INVALID_REQUEST,
          `OAuth2 error: HTTP ${status}`,
          error
        )
    }
  }

  // Handle network errors (ENOTFOUND, ECONNRESET, ETIMEDOUT, ECONNREFUSED)
  if (error.code) {
    const networkErrorCodes = ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']
    if (networkErrorCodes.includes(error.code)) {
      throw new GmailAuthError(
        GmailErrorType.API_NETWORK_ERROR,
        `Network error: ${error.code}`,
        error
      )
    }
  }

  // Generic fallback
  const errorMsg = error.message ?? String(error)
  throw new GmailAuthError(GmailErrorType.AUTH_INVALID_REQUEST, `OAuth2 error: ${errorMsg}`, error)
}

/**
 * Performs production token refresh using googleapis OAuth2 client
 * [P0-1: Production token refresh with error mapping and scope validation]
 *
 * @param credentialsPath - Path to credentials.json
 * @param currentToken - Current token data
 * @param tokenPath - Path to write refreshed token
 * @param db - Optional database for sync state tracking
 * @throws GmailAuthError on refresh failure
 */
const performProductionRefresh = async (
  credentialsPath: string,
  currentToken: GmailToken,
  tokenPath: string,
  db?: Database
): Promise<void> => {
  // 1. Load credentials using shared loader [P0-2: AC01 validation]
  const { loadCredentials } = await import('./credentials.js')
  const credentials = await loadCredentials(credentialsPath)

  const { client_id, client_secret, redirect_uris } = credentials.installed

  // 2. Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  // Set current token (needed for refresh) - use null for googleapis compatibility
  oauth2Client.setCredentials({
    access_token: currentToken.access_token,
    // eslint-disable-next-line unicorn/no-null -- googleapis requires null, not undefined
    refresh_token: currentToken.refresh_token ?? null,
    // eslint-disable-next-line unicorn/no-null -- googleapis requires null, not undefined
    expiry_date: currentToken.expiry_date ?? null,
    scope: currentToken.scope ?? '',
    // eslint-disable-next-line unicorn/no-null -- googleapis requires null, not undefined
    token_type: currentToken.token_type ?? null,
  })

  // 3. Call refreshAccessToken() with error mapping [P0-1: Production error mapping]
  let refreshedTokens
  try {
    const response = await oauth2Client.refreshAccessToken()
    refreshedTokens = response.credentials
  } catch (error) {
    // Map googleapis errors to GmailAuthError types
    mapGoogleApisError(error)
  }

  // Assert refreshedTokens is defined (mapGoogleApisError always throws)
  if (!refreshedTokens) {
    throw new Error('Unexpected: refreshedTokens undefined after successful refresh')
  }

  // 4. Validate scope includes gmail.readonly [P1-3: Scope validation]
  const scope = refreshedTokens.scope ?? ''
  if (!scope.includes('https://www.googleapis.com/auth/gmail.readonly')) {
    throw new GmailAuthError(
      GmailErrorType.AUTH_INVALID_GRANT,
      'Refreshed token missing required gmail.readonly scope',
      new Error(`Invalid scope: ${scope}`)
    )
  }

  // 5. Write new tokens atomically
  const newToken: GmailToken = {
    access_token: refreshedTokens.access_token ?? '',
  }

  // Add optional fields only if they have values (filter out null/undefined)
  if (refreshedTokens.expiry_date) {
    newToken.expiry_date = refreshedTokens.expiry_date
  }

  if (refreshedTokens.scope) {
    newToken.scope = refreshedTokens.scope
  }

  if (refreshedTokens.token_type) {
    newToken.token_type = refreshedTokens.token_type
  }

  // Preserve refresh_token (may not be returned in refresh response)
  const refreshToken = refreshedTokens.refresh_token ?? currentToken.refresh_token
  if (refreshToken) {
    newToken.refresh_token = refreshToken
  }

  await writeTokenSecurely(tokenPath, newToken)

  // Update sync state after successful token refresh [AC06]
  // Reset auth failures after successful refresh [AC07]
  if (db) {
    updateSyncState(db)
    resetAuthFailures(db)
  }
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

    // Production refresh [P0-1: Production token refresh]
    if (!actualCredentialsPath) {
      throw new Error('Token expired and no credentials provided for refresh')
    }

    // Perform production token refresh and update state
    await performProductionRefresh(actualCredentialsPath, token, actualTokenPath, db)
  } catch (error) {
    // Increment failure counter on any error [AC07]
    if (db) {
      incrementAuthFailures(db)
    }
    throw error
  }
}
