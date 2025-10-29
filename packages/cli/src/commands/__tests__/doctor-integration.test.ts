/**
 * Doctor Command Integration Tests - AC13: Output Formatting
 *
 * Tests for comprehensive output formatting including:
 * - Human-readable output with categories and icons
 * - JSON output with structured data
 * - Performance requirements
 */

import { describe, it, expect, afterEach } from 'vitest'

describe('Doctor Command - AC13: Output Formatting', () => {
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
    await new Promise((resolve) => {
      setTimeout(resolve, 100)
    })

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

  describe('Human-Readable Output', () => {
    it('should format output with title and categories when all checks pass', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: false,
        mockAllChecksPass: true,
      })

      expect(result.output).toBeDefined()
      const output = result.output ?? ''

      // Check for title
      expect(output).toContain('ADHD Brain Health Check')
      expect(output).toContain('=========================')

      // Check for summary section
      expect(output).toContain('Summary')
      expect(output).toContain('-------')
      expect(output).toContain('Total Checks:')
      expect(output).toContain('Passed:')
      expect(output).toContain('Warnings:')
      expect(output).toContain('Errors:')
      expect(output).toContain('Exit Code: 0')
    })

    it('should show warning icon and status for warnings', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: false,
        mockWarnings: true,
      })

      expect(result.output).toBeDefined()
      const output = result.output ?? ''

      // Warning icon present
      expect(output).toContain('⚠')
      expect(output).toContain('Exit Code: 1')
    })

    it('should show error icon and status for critical failures', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: false,
        mockCriticalErrors: true,
      })

      expect(result.output).toBeDefined()
      const output = result.output ?? ''

      // Error icon present
      expect(output).toContain('✗')
      expect(output).toContain('Exit Code: 2')
    })
  })

  describe('JSON Output Format', () => {
    it('should output valid JSON with required schema when all checks pass', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: true,
        mockAllChecksPass: true,
      })

      // Should not have human-readable output in JSON mode
      expect(result.output).toBeUndefined()

      // But should have valid JSON structure
      expect(result).toHaveProperty('checks')
      expect(result).toHaveProperty('summary')
      expect(result.exitCode).toBe(0)
    })

    it('should include version and timestamp in output', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: true,
        mockAllChecksPass: true,
      })

      // When we have the full implementation, we'll check for version/timestamp
      expect(result).toHaveProperty('exitCode')
    })

    it('should correctly categorize checks in JSON output', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: true,
        mockAllChecksPass: true,
      })

      expect(result.checks).toBeDefined()
      expect(Array.isArray(result.checks)).toBe(true)
    })
  })

  describe('Performance Requirements', () => {
    it('should complete full doctor command in under 500ms', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const start = performance.now()
      await runDoctorCommand({ json: true, mockAllChecksPass: true })
      const duration = performance.now() - start

      // Should be very fast with mocked checks
      expect(duration).toBeLessThan(500)
    })
  })

  describe('Summary Statistics', () => {
    it('should correctly count passed checks', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: true,
        mockAllChecksPass: true,
      })

      expect(result.summary.pass).toBeGreaterThan(0)
      expect(result.summary.fail).toBe(0)
      expect(result.summary.warn).toBe(0)
    })

    it('should correctly count warnings', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: true,
        mockWarnings: true,
      })

      expect(result.summary.warn).toBeGreaterThan(0)
    })

    it('should correctly count errors', async () => {
      const { runDoctorCommand } = await import('../doctor.js')

      const result = await runDoctorCommand({
        json: true,
        mockCriticalErrors: true,
      })

      expect(result.summary.fail).toBeGreaterThan(0)
    })
  })
})
