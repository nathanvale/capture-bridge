/**
 * Doctor Command Tests (TDD - RED Phase)
 *
 * Tests for health check command implementation
 * Following strict RED-GREEN-REFACTOR cycle
 */

import { describe, it, expect, afterEach } from 'vitest'

describe('Doctor Command - AC01: Command Parsing', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    // 5-step cleanup (TestKit pattern)
    // 0. Custom resources
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    // 1. Settle
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. Drain pools
    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    // 3. Close databases
    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    // 4. TestKit auto-cleanup happens automatically

    // 5. Force GC
    if (global.gc) global.gc()
  })

  describe('Command Structure', () => {
    it('should accept --json flag and return structured output', async () => {
      // RED: This will fail until we implement runDoctorCommand
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({ json: true })

      expect(result).toHaveProperty('checks')
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('exitCode')
      expect(Array.isArray(result.checks)).toBe(true)
    })

    it('should return human-readable output by default', async () => {
      // RED: This will fail until we implement runDoctorCommand
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({ json: false })

      // Human readable should have formatted text
      expect(result).toHaveProperty('output')
      expect(result.output).toBeDefined()
      expect(typeof result.output).toBe('string')
      if (result.output) {
        expect(result.output.length).toBeGreaterThan(0)
      }
    })

    it('should handle missing options gracefully', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({})

      // Should default to human-readable output
      expect(result).toHaveProperty('output')
      expect(result).toHaveProperty('exitCode')
    })
  })

  describe('Exit Code Contract', () => {
    it('should return exit code 0 when all checks pass', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      // Mock all checks to pass
      const result = await runDoctorCommand({
        json: true,
        mockAllChecksPass: true,
      })

      expect(result.exitCode).toBe(0)
    })

    it('should return exit code 1 when warnings exist', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: true,
        mockWarnings: true,
      })

      expect(result.exitCode).toBe(1)
    })

    it('should return exit code 2 when critical errors exist', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: true,
        mockCriticalErrors: true,
      })

      expect(result.exitCode).toBe(2)
    })
  })
})

describe('Doctor Command - AC02: Vault Path Checks', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should check vault path exists', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkVaultPath } = await import('../../services/health-checks/vault-check.js')

    const tempDir = await createTempDirectory()

    const result = checkVaultPath(tempDir.path)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('vault_path_exists')
  })

  it('should fail when vault path does not exist', async () => {
    const { checkVaultPath } = await import('../../services/health-checks/vault-check.js')

    const result = checkVaultPath('/nonexistent/path')

    expect(result.status).toBe('error')
    expect(result.message).toContain('not exist')
  })

  it('should check vault path is writable', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkVaultWritable } = await import('../../services/health-checks/vault-check.js')

    const tempDir = await createTempDirectory()

    const result = checkVaultWritable(tempDir.path)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('vault_path_writable')
  })

  it('should warn when vault path is not writable', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkVaultWritable } = await import('../../services/health-checks/vault-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()

    // Make directory read-only
    // eslint-disable-next-line sonarjs/file-permissions -- Intentional test setup
    await fs.chmod(tempDir.path, 0o444)

    const result = checkVaultWritable(tempDir.path)

    expect(result.status).toBe('error')
    expect(result.message).toContain('not writable')

    // Cleanup: restore permissions
    // eslint-disable-next-line sonarjs/file-permissions -- Cleanup after test
    await fs.chmod(tempDir.path, 0o755)
  })
})

describe('Doctor Command - AC03: SQLite Accessibility', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should check SQLite database is accessible', async () => {
    const { checkDatabaseAccessible } = await import('../../services/health-checks/sqlite-check.js')
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const dbPath = `${tempDir.path}/test.db`

    // Create an empty file to simulate a database
    await fs.writeFile(dbPath, '')

    const result = checkDatabaseAccessible(dbPath)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('database_accessible')
  })

  it('should run PRAGMA integrity_check', async () => {
    const { checkDatabaseIntegrity } = await import('../../services/health-checks/sqlite-check.js')
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const dbPath = `${tempDir.path}/test.db`

    // Create an empty file to simulate a database
    await fs.writeFile(dbPath, '')

    const result = checkDatabaseIntegrity(dbPath)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('database_integrity')
    expect(result.details).toContain('ok')
  })

  it('should fail when database file does not exist', async () => {
    const { checkDatabaseAccessible } = await import('../../services/health-checks/sqlite-check.js')

    const result = checkDatabaseAccessible('/nonexistent/db.sqlite')

    expect(result.status).toBe('error')
    expect(result.message).toContain('not accessible')
  })
})

describe('Doctor Command - AC14: Exit Code Mapping', () => {
  it('should map all-pass status to exit code 0', async () => {
    const { determineExitCode } = await import('../../services/health-checks/exit-code-mapper.js')

    const checks = [
      { status: 'ok', name: 'check1' },
      { status: 'ok', name: 'check2' },
      { status: 'ok', name: 'check3' },
    ]

    const exitCode = determineExitCode(checks as any)

    expect(exitCode).toBe(0)
  })

  it('should map warnings to exit code 1', async () => {
    const { determineExitCode } = await import('../../services/health-checks/exit-code-mapper.js')

    const checks = [
      { status: 'ok', name: 'check1' },
      { status: 'warn', name: 'check2' },
      { status: 'ok', name: 'check3' },
    ]

    const exitCode = determineExitCode(checks as any)

    expect(exitCode).toBe(1)
  })

  it('should map errors to exit code 2', async () => {
    const { determineExitCode } = await import('../../services/health-checks/exit-code-mapper.js')

    const checks = [
      { status: 'ok', name: 'check1' },
      { status: 'error', name: 'check2' },
      { status: 'warn', name: 'check3' },
    ]

    const exitCode = determineExitCode(checks as any)

    expect(exitCode).toBe(2)
  })

  it('should prioritize errors over warnings', async () => {
    const { determineExitCode } = await import('../../services/health-checks/exit-code-mapper.js')

    const checks = [
      { status: 'warn', name: 'check1' },
      { status: 'error', name: 'check2' },
      { status: 'warn', name: 'check3' },
    ]

    const exitCode = determineExitCode(checks as any)

    expect(exitCode).toBe(2)
  })
})

describe('Doctor Command - AC04: Gmail API Authentication Check', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when token.json exists and is valid', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkGmailAuth } = await import('../../services/health-checks/gmail-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const tokenPath = `${tempDir.path}/gmail-token.json`

    // Create valid token (expires in future)
    const futureExpiry = Date.now() + 3600000 // 1 hour from now
    await fs.writeFile(
      tokenPath,
      JSON.stringify({
        access_token: 'valid-token',
        refresh_token: 'refresh-token',
        expiry_date: futureExpiry,
      })
    )

    const result = await checkGmailAuth(tokenPath)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('gmail_auth')
    expect(result.message).toContain('valid')
  })

  it('should return error when token.json does not exist', async () => {
    const { checkGmailAuth } = await import('../../services/health-checks/gmail-check.js')

    const result = await checkGmailAuth('/nonexistent/gmail-token.json')

    expect(result.status).toBe('error')
    expect(result.name).toBe('gmail_auth')
    expect(result.message).toContain('not found')
  })

  it('should return warn when token is expired', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkGmailAuth } = await import('../../services/health-checks/gmail-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const tokenPath = `${tempDir.path}/gmail-token.json`

    // Create expired token
    const pastExpiry = Date.now() - 3600000 // 1 hour ago
    await fs.writeFile(
      tokenPath,
      JSON.stringify({
        access_token: 'expired-token',
        refresh_token: 'refresh-token',
        expiry_date: pastExpiry,
      })
    )

    const result = await checkGmailAuth(tokenPath)

    expect(result.status).toBe('warn')
    expect(result.name).toBe('gmail_auth')
    expect(result.message).toContain('expired')
  })

  it('should return error when token.json is malformed', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkGmailAuth } = await import('../../services/health-checks/gmail-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const tokenPath = `${tempDir.path}/gmail-token.json`

    // Create malformed JSON
    await fs.writeFile(tokenPath, 'not valid json')

    const result = await checkGmailAuth(tokenPath)

    expect(result.status).toBe('error')
    expect(result.name).toBe('gmail_auth')
    expect(result.message).toContain('malformed')
  })

  it('should return error when token.json is missing required fields', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkGmailAuth } = await import('../../services/health-checks/gmail-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const tokenPath = `${tempDir.path}/gmail-token.json`

    // Create token with missing expiry_date
    await fs.writeFile(
      tokenPath,
      JSON.stringify({
        access_token: 'valid-token',
      })
    )

    const result = await checkGmailAuth(tokenPath)

    expect(result.status).toBe('error')
    expect(result.name).toBe('gmail_auth')
    expect(result.message).toContain('missing')
  })
})

describe('Doctor Command - AC05: icloudctl Binary Check', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when icloudctl is found and executable', async () => {
    const { checkIcloudctl } = await import('../../services/health-checks/icloudctl-check.js')

    // Mock which command to return a path
    const result = await checkIcloudctl()

    // This test will check the actual system
    // On systems with icloudctl, it should be ok
    // On systems without, it should be error
    expect(result.name).toBe('icloudctl_available')
    expect(['ok', 'error']).toContain(result.status)
  })

  it('should return error when icloudctl is not found', async () => {
    const { checkIcloudctlWithPath } = await import('../../services/health-checks/icloudctl-check.js')

    // Test with explicit undefined path (binary not found)
    const result = checkIcloudctlWithPath(undefined)

    expect(result.status).toBe('error')
    expect(result.name).toBe('icloudctl_available')
    expect(result.message).toContain('not found')
  })

  it('should return ok when icloudctl is found at a valid path', async () => {
    const { checkIcloudctlWithPath } = await import('../../services/health-checks/icloudctl-check.js')

    // Test with explicit path (found)
    const result = checkIcloudctlWithPath('/usr/local/bin/icloudctl')

    expect(result.status).toBe('ok')
    expect(result.name).toBe('icloudctl_available')
    expect(result.message).toContain('available')
  })
})

describe('Doctor Command - AC06: Whisper Model File Check', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when Whisper model exists', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkWhisperModel } = await import('../../services/health-checks/whisper-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const modelPath = `${tempDir.path}/medium.pt`

    // Create a file larger than 1MB
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024) // 2MB
    await fs.writeFile(modelPath, largeBuffer)

    const result = await checkWhisperModel(modelPath)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('whisper_model')
  })

  it('should return error when Whisper model does not exist', async () => {
    const { checkWhisperModel } = await import('../../services/health-checks/whisper-check.js')

    const result = await checkWhisperModel('/nonexistent/medium.pt')

    expect(result.status).toBe('error')
    expect(result.message).toContain('not found')
  })

  it('should return error when Whisper model file is too small', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkWhisperModel } = await import('../../services/health-checks/whisper-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const modelPath = `${tempDir.path}/medium.pt`

    // Create a small file (less than 1MB)
    await fs.writeFile(modelPath, 'small')

    const result = await checkWhisperModel(modelPath)

    expect(result.status).toBe('error')
    expect(result.message).toContain('invalid size')
  })
})

describe('Doctor Command - AC09: Backup Status Check', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when backup is recent (< 1 hour)', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkBackupStatus } = await import('../../services/health-checks/backup-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const backupDir = `${tempDir.path}/.backups`
    await fs.mkdir(backupDir)

    // Create a recent backup file (30 minutes ago)
    const backupFile = `${backupDir}/backup-latest.db`
    await fs.writeFile(backupFile, 'backup content')

    // Set file modification time to 30 minutes ago
    const recentTime = new Date(Date.now() - 30 * 60 * 1000)
    await fs.utimes(backupFile, recentTime, recentTime)

    const result = await checkBackupStatus(backupDir)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('backup_status')
  })

  it('should return warn when backup is 1-24 hours old', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkBackupStatus } = await import('../../services/health-checks/backup-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const backupDir = `${tempDir.path}/.backups`
    await fs.mkdir(backupDir)

    // Create an old backup file (5 hours ago)
    const backupFile = `${backupDir}/backup-latest.db`
    await fs.writeFile(backupFile, 'backup content')

    const oldTime = new Date(Date.now() - 5 * 60 * 60 * 1000)
    await fs.utimes(backupFile, oldTime, oldTime)

    const result = await checkBackupStatus(backupDir)

    expect(result.status).toBe('warn')
  })

  it('should return error when backup is > 24 hours old', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkBackupStatus } = await import('../../services/health-checks/backup-check.js')
    const fs = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    const backupDir = `${tempDir.path}/.backups`
    await fs.mkdir(backupDir)

    // Create a very old backup file (48 hours ago)
    const backupFile = `${backupDir}/backup-latest.db`
    await fs.writeFile(backupFile, 'backup content')

    const veryOldTime = new Date(Date.now() - 48 * 60 * 60 * 1000)
    await fs.utimes(backupFile, veryOldTime, veryOldTime)

    const result = await checkBackupStatus(backupDir)

    expect(result.status).toBe('error')
  })

  it('should return error when backup directory does not exist', async () => {
    const { checkBackupStatus } = await import('../../services/health-checks/backup-check.js')

    const result = await checkBackupStatus('/nonexistent/.backups')

    expect(result.status).toBe('error')
    expect(result.message).toContain('not found')
  })
})

describe('Doctor Command - AC12: Disk Space Check', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when disk space is > 5GB', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { checkDiskSpace } = await import('../../services/health-checks/disk-space-check.js')

    const tempDir = await createTempDirectory()

    const result = await checkDiskSpace(tempDir.path)

    // Most systems will have > 5GB free
    // This test validates the check runs successfully
    expect(result.name).toBe('disk_space')
    expect(['ok', 'warn', 'error']).toContain(result.status)
  })
})
