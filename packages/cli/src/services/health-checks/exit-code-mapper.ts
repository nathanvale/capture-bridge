/**
 * Exit code mapping logic
 * Maps health check results to CLI exit codes
 */

import type { HealthCheckResult } from './types.js'

/**
 * Determine exit code based on health check results
 * Contract: 0=healthy, 1=warnings, 2=errors
 */
export const determineExitCode = (checks: HealthCheckResult[]): number => {
  // Any error status → exit code 2
  if (checks.some((check) => check.status === 'error')) {
    return 2
  }

  // Any warning status → exit code 1
  if (checks.some((check) => check.status === 'warn')) {
    return 1
  }

  // All checks passed → exit code 0
  return 0
}
