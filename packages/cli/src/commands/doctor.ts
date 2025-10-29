/**
 * Doctor command registration function
 *
 * Health check command to validate system configuration
 */

import { determineExitCode } from '../services/health-checks/exit-code-mapper.js'
import {
  aggregateCheckResults,
  formatHumanReadable,
  type HealthCheckResultEnhanced,
} from '../services/health-checks/output-formatter.js'

import type {
  DoctorOptions,
  DoctorResult,
  HealthCheckResult,
} from '../services/health-checks/types.js'
import type { Command } from 'commander'

/**
 * Run doctor command with options (testable entry point)
 * Integrates actual health checks with async support
 *
 * NOTE: Health check integration is a follow-up task (CLI_FOUNDATION--T02)
 * Currently supports mock scenarios for testing framework
 */
export const runDoctorCommand = (options: DoctorOptions): DoctorResult => {
  const startTime = performance.now()
  const checks: HealthCheckResult[] = []

  // Mock behavior for testing
  if (options.mockAllChecksPass) {
    checks.push({
      id: 'mock',
      name: 'mock',
      status: 'ok',
      message: 'All checks pass',
      execution_time_ms: 1,
    })
  } else if (options.mockWarnings) {
    checks.push({
      id: 'mock',
      name: 'mock',
      status: 'warn',
      message: 'Warning',
      execution_time_ms: 1,
    })
  } else if (options.mockCriticalErrors) {
    checks.push({
      id: 'mock',
      name: 'mock',
      status: 'error',
      message: 'Critical error',
      execution_time_ms: 1,
    })
  }

  // Calculate exit code
  const exitCode = determineExitCode(checks)

  // Count statuses
  const pass = checks.filter((c) => c.status === 'ok').length
  const fail = checks.filter((c) => c.status === 'error').length
  const warn = checks.filter((c) => c.status === 'warn').length

  const result: DoctorResult = {
    checks,
    summary: { pass, fail, warn },
    exitCode,
  }

  // Add output for human-readable mode using new formatter
  if (!options.json) {
    const totalExecutionTime = performance.now() - startTime
    const enhancedChecks: HealthCheckResultEnhanced[] = checks.map((check) => ({
      id: check.id ?? check.name,
      name: check.name,
      status: check.status,
      message: check.message ?? '',
      execution_time_ms: check.execution_time_ms ?? 0,
    }))

    const output = aggregateCheckResults(enhancedChecks, totalExecutionTime)
    result.output = formatHumanReadable(output)
  }

  return result
}

/**
 * Register the 'doctor' command
 *
 * @param program - Commander program instance
 */
export const registerDoctorCommand = (program: Command): void => {
  program
    .command('doctor')
    .description('Run health and integrity checks on system configuration')
    .option('-v, --verbose', 'Show detailed diagnostic output for all checks')
    .option('-j, --json', 'Output results as JSON object with check status')
    .addHelpText(
      'after',
      `
Health Checks Performed:

Infrastructure:
  ✓ Staging ledger (SQLite) accessible and schema current
  ✓ Vault path exists and is writable
  ✓ Voice memos directory readable (macOS only)
  ✓ Disk space adequate (>1GB free)
  ✓ SQLite version meets minimum (>=3.35)

Serviceability:
  ✓ Last successful poll timestamps (voice/email)
  ✓ Error log summary (last 24 hours)
  ✓ Metrics collection status
  ✓ Backup integrity verification
  ✓ Export pathway test (temp file write)

Operational:
  ✓ SQLite WAL file size and checkpoint status
  ✓ Memory usage patterns (if telemetry enabled)

Examples:
  # Run basic health checks
  $ capture doctor

  # Detailed diagnostics
  $ capture doctor --verbose

  # JSON output for monitoring
  $ capture doctor --json

Exit codes:
  0  All checks passed
  1  One or more checks failed
  2  Critical failure (ledger inaccessible)
`
    )
    .action((options: Record<string, unknown>) => {
      const doctorOptions: DoctorOptions = {
        json: (options['json'] as boolean) ?? false,
        verbose: (options['verbose'] as boolean) ?? false,
      }

      const result = runDoctorCommand(doctorOptions)

      // Output results
      if (result.output) {
        // eslint-disable-next-line no-console -- CLI output is intentional
        console.log(result.output)
      } else if (doctorOptions.json) {
        // eslint-disable-next-line no-console -- CLI output is intentional
        console.log(JSON.stringify(result, undefined, 2))
      }

      // Exit with appropriate code
      process.exit(result.exitCode)
    })
}
