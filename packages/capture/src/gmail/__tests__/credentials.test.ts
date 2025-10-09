/**
 * TDD RED Phase: Credentials Parsing Tests
 * Testing AC01: credentials.json file parsing (Google Console)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { loadCredentials } from '../credentials.js'
import { GmailErrorType, GmailAuthError } from '../types.js'

describe('Credentials Loading (AC01)', () => {
  let tempDir: string
  const tempDirs: string[] = []

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const temp = await createTempDirectory()
    tempDir = temp.path
    tempDirs.push(tempDir)
  })

  afterEach(async () => {
    // 5-step cleanup from testkit-tdd-guide-condensed.md
    await new Promise(resolve => setTimeout(resolve, 100))
    // TestKit auto-cleanup handles temp directories
    if (global.gc) global.gc()
  })

  describe('Valid Credentials', () => {
    it('should load valid credentials.json file', async () => {
      const credentialsPath = path.join(tempDir, 'credentials.json')
      const validCredentials = {
        installed: {
          client_id: '1234567890-test.apps.googleusercontent.com',
          client_secret: 'GOCSPX-test-secret',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token'
        }
      }

      await fs.writeFile(credentialsPath, JSON.stringify(validCredentials, null, 2))

      const credentials = await loadCredentials(credentialsPath)

      expect(credentials).toEqual(validCredentials)
      expect(credentials.installed.client_id).toBe('1234567890-test.apps.googleusercontent.com')
      expect(credentials.installed.client_secret).toBe('GOCSPX-test-secret')
      expect(credentials.installed.redirect_uris).toEqual(['http://localhost'])
    })

    it('should validate all required fields present', async () => {
      const credentialsPath = path.join(tempDir, 'credentials.json')
      const validCredentials = {
        installed: {
          client_id: 'test-id',
          client_secret: 'test-secret',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token'
        }
      }

      await fs.writeFile(credentialsPath, JSON.stringify(validCredentials, null, 2))

      const credentials = await loadCredentials(credentialsPath)

      expect(credentials.installed).toHaveProperty('client_id')
      expect(credentials.installed).toHaveProperty('client_secret')
      expect(credentials.installed).toHaveProperty('redirect_uris')
      expect(credentials.installed).toHaveProperty('auth_uri')
      expect(credentials.installed).toHaveProperty('token_uri')
    })
  })

  describe('Invalid Credentials', () => {
    it('should throw FILE_PARSE_ERROR for malformed JSON', async () => {
      const credentialsPath = path.join(tempDir, 'credentials.json')
      await fs.writeFile(credentialsPath, '{ invalid json }')

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)
      
      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        expect((error as GmailAuthError).type).toBe(GmailErrorType.FILE_PARSE_ERROR)
      }
    })

    it('should throw AUTH_INVALID_CLIENT when client_id missing', async () => {
      const credentialsPath = path.join(tempDir, 'credentials.json')
      const invalidCredentials = {
        installed: {
          client_secret: 'test-secret',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token'
        }
      }

      await fs.writeFile(credentialsPath, JSON.stringify(invalidCredentials, null, 2))

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)
      
      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        expect((error as GmailAuthError).type).toBe(GmailErrorType.AUTH_INVALID_CLIENT)
        expect((error as GmailAuthError).message).toContain('client_id')
      }
    })

    it('should throw AUTH_INVALID_CLIENT when client_secret missing', async () => {
      const credentialsPath = path.join(tempDir, 'credentials.json')
      const invalidCredentials = {
        installed: {
          client_id: 'test-id',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token'
        }
      }

      await fs.writeFile(credentialsPath, JSON.stringify(invalidCredentials, null, 2))

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)
      
      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        expect((error as GmailAuthError).type).toBe(GmailErrorType.AUTH_INVALID_CLIENT)
        expect((error as GmailAuthError).message).toContain('client_secret')
      }
    })

    it('should throw AUTH_INVALID_CLIENT when redirect_uris missing', async () => {
      const credentialsPath = path.join(tempDir, 'credentials.json')
      const invalidCredentials = {
        installed: {
          client_id: 'test-id',
          client_secret: 'test-secret',
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token'
        }
      }

      await fs.writeFile(credentialsPath, JSON.stringify(invalidCredentials, null, 2))

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)
    })

    it('should throw AUTH_INVALID_CLIENT when installed section missing', async () => {
      const credentialsPath = path.join(tempDir, 'credentials.json')
      const invalidCredentials = {
        client_id: 'test-id',
        client_secret: 'test-secret'
      }

      await fs.writeFile(credentialsPath, JSON.stringify(invalidCredentials, null, 2))

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)
      
      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        expect((error as GmailAuthError).type).toBe(GmailErrorType.AUTH_INVALID_CLIENT)
        expect((error as GmailAuthError).message).toContain('installed')
      }
    })
  })

  describe('File System Errors', () => {
    it('should throw FILE_PERMISSION_ERROR when file not found', async () => {
      const credentialsPath = path.join(tempDir, 'nonexistent.json')

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(GmailAuthError)
      
      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        expect(error).toBeInstanceOf(GmailAuthError)
        expect((error as GmailAuthError).type).toBe(GmailErrorType.FILE_PERMISSION_ERROR)
      }
    })

    it('should not leak credentials in error messages', async () => {
      const credentialsPath = path.join(tempDir, 'credentials.json')
      const credentials = {
        installed: {
          client_id: 'SENSITIVE-ID-12345',
          client_secret: 'SENSITIVE-SECRET-67890',
          redirect_uris: ['http://localhost']
        }
      }

      await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2))

      try {
        await loadCredentials(credentialsPath)
      } catch (error) {
        const errorMessage = (error as Error).message
        expect(errorMessage).not.toContain('SENSITIVE-ID-12345')
        expect(errorMessage).not.toContain('SENSITIVE-SECRET-67890')
      }
    })
  })
})
