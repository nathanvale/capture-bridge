/**
 * Vault path health checks
 */

import { existsSync, accessSync, constants } from 'node:fs'

import type { HealthCheckResult } from './types.js'

/**
 * Check if vault path exists
 */
export const checkVaultPath = (vaultPath: string): HealthCheckResult => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- vaultPath is user configuration
  const exists = existsSync(vaultPath)

  if (!exists) {
    return {
      name: 'vault_path_exists',
      status: 'error',
      message: `Vault path does not exist: ${vaultPath}`,
    }
  }

  return {
    name: 'vault_path_exists',
    status: 'ok',
    message: `Vault path exists: ${vaultPath}`,
  }
}

/**
 * Check if vault path is writable
 */
export const checkVaultWritable = (vaultPath: string): HealthCheckResult => {
  try {
    accessSync(vaultPath, constants.W_OK)

    return {
      name: 'vault_path_writable',
      status: 'ok',
      message: `Vault path is writable: ${vaultPath}`,
    }
  } catch {
    return {
      name: 'vault_path_writable',
      status: 'error',
      message: `Vault path is not writable: ${vaultPath}`,
    }
  }
}
