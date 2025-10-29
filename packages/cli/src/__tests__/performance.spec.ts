/**
 * CLI Performance Tests
 *
 * Validates cold start performance and command registration speed.
 *
 * @see spec-cli-tech.md §14 Performance Targets
 * @see CLI_FOUNDATION-AC08: Performance: < 150ms cold start
 */

import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Helper to measure CLI cold start time
 *
 * @param command - Command to execute
 * @returns Execution time in milliseconds
 */
const measureColdStart = (command: string): number => {
  const cliPath = join(__dirname, '../../dist/index.js')
  const start = Date.now()

  try {
    // eslint-disable-next-line sonarjs/os-command -- Safe: cliPath is controlled, command is from test constants
    execSync(`node ${cliPath} ${command}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000, // 5s timeout
    })
  } catch {
    // Ignore errors - we're measuring startup time, not command success
  }

  return Date.now() - start
}

/**
 * Calculate p95 (95th percentile) from array of numbers
 *
 * @param values - Array of numbers
 * @returns 95th percentile value
 */
const calculateP95 = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil(sorted.length * 0.95) - 1
  // eslint-disable-next-line security/detect-object-injection -- Safe: index is calculated from array length
  const p95Value = sorted[index]
  if (p95Value === undefined) {
    throw new Error('Unable to calculate p95: array is empty')
  }
  return p95Value
}

describe('CLI Performance', () => {
  describe('Cold Start Performance', () => {
    it('should start in < 150ms (p95) for --version', () => {
      const iterations = 10
      const times: number[] = []

      for (let i = 0; i < iterations; i++) {
        const time = measureColdStart('--version')
        times.push(time)
      }

      const p95 = calculateP95(times)
      const avg = times.reduce((sum, t) => sum + t, 0) / times.length
      const min = Math.min(...times)
      const max = Math.max(...times)

      // Log timing details for debugging
      // eslint-disable-next-line no-console -- Intentional performance logging
      console.log(`
Performance Metrics (--version):
  Iterations: ${iterations}
  Min: ${min}ms
  Max: ${max}ms
  Avg: ${avg.toFixed(2)}ms
  P95: ${p95}ms
`)

      // Assert p95 < 150ms
      expect(p95).toBeLessThan(150)
    })

    it('should start in < 150ms (p95) for --help', () => {
      const iterations = 10
      const times: number[] = []

      for (let i = 0; i < iterations; i++) {
        const time = measureColdStart('--help')
        times.push(time)
      }

      const p95 = calculateP95(times)
      const avg = times.reduce((sum, t) => sum + t, 0) / times.length
      const min = Math.min(...times)
      const max = Math.max(...times)

      // Log timing details for debugging
      // eslint-disable-next-line no-console -- Intentional performance logging
      console.log(`
Performance Metrics (--help):
  Iterations: ${iterations}
  Min: ${min}ms
  Max: ${max}ms
  Avg: ${avg.toFixed(2)}ms
  P95: ${p95}ms
`)

      // Assert p95 < 150ms
      expect(p95).toBeLessThan(150)
    })

    it('should have consistent startup times (low variance)', () => {
      const iterations = 5
      const times: number[] = []

      for (let i = 0; i < iterations; i++) {
        const time = measureColdStart('--version')
        times.push(time)
      }

      const avg = times.reduce((sum, t) => sum + t, 0) / times.length
      const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length
      const stdDev = Math.sqrt(variance)

      // Standard deviation should be less than 50ms (indicating consistent performance)
      expect(stdDev).toBeLessThan(50)
    })
  })

  describe('Command Registration Performance', () => {
    it('should register commands quickly', async () => {
      const start = Date.now()

      // Import command registry
      await import('../lib/command-registry.js')

      const duration = Date.now() - start

      // Command registration should be fast (<500ms)
      // Note: Dynamic imports can vary significantly (20-500ms) based on:
      // - System load and available CPU
      // - Module cache state (cold vs warm)
      // - File system I/O speed
      // - Node.js JIT warmup
      expect(duration).toBeLessThan(500)
    })

    it('should import output formatter quickly', async () => {
      const start = Date.now()

      await import('../lib/output-formatter.js')

      const duration = Date.now() - start

      // Formatter import should be fast (<200ms)
      // Note: Dynamic imports can vary based on system load and module cache
      expect(duration).toBeLessThan(200)
    })
  })

  describe('P95 Calculation', () => {
    it('should calculate p95 correctly for sorted array', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      const p95 = calculateP95(values)

      // For 10 items, p95 is the 10th item (index 9): 100
      expect(p95).toBe(100)
    })

    it('should calculate p95 correctly for unsorted array', () => {
      const values = [100, 10, 90, 20, 80, 30, 70, 40, 60, 50]
      const p95 = calculateP95(values)

      // Should be same as sorted: 100
      expect(p95).toBe(100)
    })

    it('should handle small arrays', () => {
      const values = [50, 100, 150]
      const p95 = calculateP95(values)

      // For 3 items, p95 is ceil(3 * 0.95) - 1 = 2, which is 150
      expect(p95).toBe(150)
    })

    it('should handle single-item array', () => {
      const values = [42]
      const p95 = calculateP95(values)

      expect(p95).toBe(42)
    })
  })
})
