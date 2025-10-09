/**
 * OAuth2 Authorization Flow Implementation [AC02 + AC03]
 * Handles Google OAuth2 authorization and token management
 */

import { promises as fs } from 'node:fs'

import { google } from 'googleapis'

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
 * [AC02] OAuth2 Authorization Flow
 *
 * @param credentialsPath - Path to credentials.json
 * @param tokenPath - Optional path to save token.json (defaults to no save)
 * @param options - Optional testing options
 * @returns Authorization result with authUrl or credentials
 */
export const authorize = async (
  credentialsPath: string,
  tokenPath?: string,
  options?: AuthorizeOptions
): Promise<AuthorizationResult> => {
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
