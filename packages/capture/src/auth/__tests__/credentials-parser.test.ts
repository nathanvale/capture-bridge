import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { loadCredentials, validateCredentials, checkFilePermissions } from '../credentials-parser.js'

describe('credentials-parser', () => {
  const tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = []

  beforeEach(async () => {
    // Fresh test isolation
  })

  afterEach(async () => {
    // 1. Custom resources cleanup (none yet)

    // 2. Settle
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 3-4. No pools or databases in this test

    // 5. Cleanup temp directories
    for (const dir of tempDirs) {
      await dir.cleanup()
    }
    tempDirs.length = 0

    // 6. Force GC
    if (global.gc) global.gc()
  })

  describe('loadCredentials', () => {
    it('should parse valid credentials.json with all required fields', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const credentialsPath = join(tempDir.path, 'credentials.json')
      const validCredentials = {
        installed: {
          client_id: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
          client_secret: 'GOCSPX-abcdefghijklmnopqrst',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      await writeFile(credentialsPath, JSON.stringify(validCredentials), { mode: 0o600 })

      const result = await loadCredentials(credentialsPath)

      expect(result).toEqual(validCredentials)
      expect(result.installed.client_id).toBe('1234567890-abcdefghijklmnop.apps.googleusercontent.com')
      expect(result.installed.client_secret).toBe('GOCSPX-abcdefghijklmnopqrst')
      expect(result.installed.redirect_uris).toEqual(['http://localhost'])
    })

    it('should reject missing client_id field', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const credentialsPath = join(tempDir.path, 'credentials.json')
      const invalidCredentials = {
        installed: {
          client_secret: 'GOCSPX-abcdefghijklmnopqrst',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      await writeFile(credentialsPath, JSON.stringify(invalidCredentials), { mode: 0o600 })

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(/client_id/i)
    })

    it('should reject missing client_secret field', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const credentialsPath = join(tempDir.path, 'credentials.json')
      const invalidCredentials = {
        installed: {
          client_id: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      await writeFile(credentialsPath, JSON.stringify(invalidCredentials), { mode: 0o600 })

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(/client_secret/i)
    })

    it('should reject missing redirect_uris array', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const credentialsPath = join(tempDir.path, 'credentials.json')
      const invalidCredentials = {
        installed: {
          client_id: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
          client_secret: 'GOCSPX-abcdefghijklmnopqrst',
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      await writeFile(credentialsPath, JSON.stringify(invalidCredentials), { mode: 0o600 })

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(/redirect_uris/i)
    })

    it('should throw file not found error with helpful message', async () => {
      const { join } = await import('node:path')
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      // Use temp directory to avoid /tmp security warning
      const nonExistentPath = join(tempDir.path, 'does-not-exist', 'credentials.json')

      await expect(loadCredentials(nonExistentPath)).rejects.toThrow(/File not found.*credentials.json/i)
    })

    it('should throw invalid JSON syntax error', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const credentialsPath = join(tempDir.path, 'credentials.json')
      await writeFile(credentialsPath, '{ invalid json }', { mode: 0o600 })

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(/Invalid JSON/i)
    })

    it('should reject redirect_uris that is not an array', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const credentialsPath = join(tempDir.path, 'credentials.json')
      const invalidCredentials = {
        installed: {
          client_id: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
          client_secret: 'GOCSPX-abcdefghijklmnopqrst',
          redirect_uris: 'http://localhost', // String instead of array
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      await writeFile(credentialsPath, JSON.stringify(invalidCredentials), { mode: 0o600 })

      await expect(loadCredentials(credentialsPath)).rejects.toThrow(/redirect_uris/i)
    })
  })

  describe('checkFilePermissions', () => {
    it('should warn if file permissions are not 0600', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const credentialsPath = join(tempDir.path, 'credentials.json')
      await writeFile(credentialsPath, '{}', { mode: 0o644 })

      // Should throw or warn about insecure permissions
      await expect(checkFilePermissions(credentialsPath)).rejects.toThrow(/insecure.*permission/i)
    })

    it('should pass if file permissions are 0600', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const tempDir = await createTempDirectory()
      tempDirs.push(tempDir)

      const credentialsPath = join(tempDir.path, 'credentials.json')
      await writeFile(credentialsPath, '{}', { mode: 0o600 })

      await expect(checkFilePermissions(credentialsPath)).resolves.toBeUndefined()
    })
  })

  describe('validateCredentials', () => {
    it('should validate correct credentials structure', () => {
      const validCredentials = {
        installed: {
          client_id: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
          client_secret: 'GOCSPX-abcdefghijklmnopqrst',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      expect(() => validateCredentials(validCredentials)).not.toThrow()
    })

    it('should throw for missing installed property', () => {
      const invalidCredentials = {
        client_id: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
      }

      expect(() => validateCredentials(invalidCredentials)).toThrow(/Invalid credentials\.json structure/i)
    })

    it('should throw for missing client_id in installed', () => {
      const invalidCredentials = {
        installed: {
          client_secret: 'GOCSPX-abcdefghijklmnopqrst',
          redirect_uris: ['http://localhost'],
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      }

      expect(() => validateCredentials(invalidCredentials)).toThrow(/client_id/i)
    })
  })
})
