/**
 * Gmail OAuth2 Type Definitions
 * Based on guide-gmail-oauth2-setup.md
 */

export interface CredentialsFile {
  installed: {
    client_id: string
    client_secret: string
    redirect_uris: string[]
    auth_uri: string
    token_uri: string
  }
}

export interface TokenInfo {
  access_token: string
  refresh_token: string
  expiry_date: number
  scope: string
  token_type: string
}

export interface AuthResult {
  status: 'authenticated' | 'failed'
  tokenPath?: string
  error?: GmailErrorType
}

export enum GmailErrorType {
  AUTH_INVALID_GRANT = 'auth.invalid_grant',
  AUTH_INVALID_CLIENT = 'auth.invalid_client',
  AUTH_INVALID_REQUEST = 'auth.invalid_request',
  AUTH_MAX_FAILURES = 'auth.max_failures',
  FILE_PERMISSION_ERROR = 'file.permission_error',
  FILE_PARSE_ERROR = 'file.parse_error',
  API_RATE_LIMITED = 'api.rate_limited',
  API_QUOTA_EXCEEDED = 'api.quota_exceeded',
  CURSOR_INVALID = 'cursor.invalid',
  CURSOR_TOO_OLD = 'cursor.too_old',
  API_NETWORK_ERROR = 'api.network_error',
  API_SERVER_ERROR = 'api.server_error',
}

export class GmailAuthError extends Error {
  constructor(
    public readonly type: GmailErrorType,
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message)
    this.name = 'GmailAuthError'
  }
}
