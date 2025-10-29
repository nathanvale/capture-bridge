/**
 * icloudctl binary availability health check
 * AC05: Check icloudctl binary available and executable
 */

import type { HealthCheckResult } from './types.js'

/**
 * Find icloudctl binary using which command
 * @returns Path to icloudctl or undefined if not found
 */
const findIcloudctl = async (): Promise<string | undefined> => {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)

    const { stdout } = await execFileAsync('which', ['icloudctl'])
    const path = stdout.trim()

    return path.length > 0 ? path : undefined
  } catch {
    return undefined
  }
}

/**
 * Check icloudctl availability (uses which command)
 * @returns Health check result
 */
export const checkIcloudctl = async (): Promise<HealthCheckResult> => {
  const path = await findIcloudctl()
  return checkIcloudctlWithPath(path)
}

/**
 * Check icloudctl availability with explicit path (testable version)
 * @param icloudctlPath - Path to icloudctl binary or undefined if not found
 * @returns Health check result
 */
export const checkIcloudctlWithPath = (icloudctlPath: string | undefined): HealthCheckResult => {
  if (!icloudctlPath) {
    return {
      name: 'icloudctl_available',
      status: 'error',
      message: 'icloudctl not found',
      details: 'icloudctl binary is not available in PATH',
      fix: 'Install icloudctl: brew install icloudctl',
    }
  }

  // Binary found
  return {
    name: 'icloudctl_available',
    status: 'ok',
    message: 'icloudctl is available',
    details: `Found at ${icloudctlPath}`,
  }
}
