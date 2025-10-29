/**
 * Gmail API authentication health check
 * AC04: Check Gmail API authentication status (token.json valid)
 */

import type { HealthCheckResult } from './types.js'

interface GmailToken {
  access_token?: string
  refresh_token?: string
  expiry_date?: number
}

/**
 * Check Gmail API authentication status
 * @param tokenPath - Path to gmail-token.json file
 * @returns Health check result
 */
export const checkGmailAuth = async (tokenPath: string): Promise<HealthCheckResult> => {
  try {
    // Check if file exists
    const fs = await import('node:fs/promises')

    let fileContent: string
    try {
      fileContent = await fs.readFile(tokenPath, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          name: 'gmail_auth',
          status: 'error',
          message: 'Gmail token not found',
          details: `Token file does not exist at ${tokenPath}`,
          fix: 'Run Gmail OAuth setup to create token.json',
        }
      }
      throw error
    }

    // Parse JSON
    let token: GmailToken
    try {
      token = JSON.parse(fileContent) as GmailToken
    } catch {
      return {
        name: 'gmail_auth',
        status: 'error',
        message: 'Gmail token is malformed',
        details: 'Unable to parse token.json as valid JSON',
        fix: 'Delete token.json and re-run OAuth setup',
      }
    }

    // Validate required fields
    if (!token.access_token || !token.refresh_token || token.expiry_date === undefined) {
      return {
        name: 'gmail_auth',
        status: 'error',
        message: 'Gmail token is missing required fields',
        details: 'Token must contain access_token, refresh_token, and expiry_date',
        fix: 'Delete token.json and re-run OAuth setup',
      }
    }

    // Check expiration
    const now = Date.now()
    if (token.expiry_date < now) {
      return {
        name: 'gmail_auth',
        status: 'warn',
        message: 'Gmail token is expired',
        details: `Token expired at ${new Date(token.expiry_date).toISOString()}`,
        fix: 'Token will be auto-refreshed on next Gmail API call',
      }
    }

    // All checks passed
    return {
      name: 'gmail_auth',
      status: 'ok',
      message: 'Gmail authentication is valid',
      details: `Token expires at ${new Date(token.expiry_date).toISOString()}`,
    }
  } catch (error) {
    return {
      name: 'gmail_auth',
      status: 'error',
      message: 'Failed to check Gmail authentication',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
