/**
 * Gmail Credentials Loading and Validation
 * Implements AC01: credentials.json file parsing (Google Console)
 */

import { promises as fs } from 'node:fs'

import { type CredentialsFile, GmailErrorType, GmailAuthError } from './types.js'

/**
 * Load and validate OAuth2 credentials from credentials.json
 * @param credentialsPath - Absolute path to credentials.json file
 * @returns Validated credentials object
 * @throws GmailAuthError with appropriate error type
 */
export const loadCredentials = async (credentialsPath: string): Promise<CredentialsFile> => {
  let fileContent: string

  // Read file
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- OAuth credential paths are controlled by application config
    fileContent = await fs.readFile(credentialsPath, 'utf-8')
  } catch (error) {
    throw new GmailAuthError(
      GmailErrorType.FILE_PERMISSION_ERROR,
      'Failed to read credentials file',
      error
    )
  }

  // Parse JSON
  let credentials: unknown
  try {
    credentials = JSON.parse(fileContent)
  } catch (error) {
    throw new GmailAuthError(
      GmailErrorType.FILE_PARSE_ERROR,
      'Credentials file contains invalid JSON',
      error
    )
  }

  // Validate structure
  if (!isCredentialsFile(credentials)) {
    const validationMsg = getValidationMessage(credentials)
    throw new GmailAuthError(
      GmailErrorType.AUTH_INVALID_CLIENT,
      validationMsg,
      new Error(validationMsg)
    )
  }

  return credentials
}

/**
 * Type guard to validate credentials structure
 */
const isCredentialsFile = (value: unknown): value is CredentialsFile => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const obj = value as Record<string, unknown>

  if (typeof obj['installed'] !== 'object' || obj['installed'] === null) {
    return false
  }

  const installed = obj['installed'] as Record<string, unknown>

  return (
    typeof installed['client_id'] === 'string' &&
    typeof installed['client_secret'] === 'string' &&
    Array.isArray(installed['redirect_uris']) &&
    typeof installed['auth_uri'] === 'string' &&
    typeof installed['token_uri'] === 'string'
  )
}

/**
 * Generate validation error message without leaking credentials
 */
const getValidationMessage = (value: unknown): string => {
  if (typeof value !== 'object' || value === null) {
    return 'Credentials must be an object'
  }

  const obj = value as Record<string, unknown>

  if (typeof obj['installed'] !== 'object' || obj['installed'] === null) {
    return 'Missing "installed" section'
  }

  const installed = obj['installed'] as Record<string, unknown>

  if (typeof installed['client_id'] !== 'string') {
    return 'Missing or invalid "client_id" field'
  }

  if (typeof installed['client_secret'] !== 'string') {
    return 'Missing or invalid "client_secret" field'
  }

  if (!Array.isArray(installed['redirect_uris'])) {
    return 'Missing or invalid "redirect_uris" field'
  }

  return 'Invalid credentials structure'
}
