/**
 * Health check output formatting
 */

import chalk from 'chalk'

import type { HealthStatus } from './types.js'

/**
 * Enhanced health check result with timing and categorization
 */
export interface HealthCheckResultEnhanced {
  id: string
  name: string
  status: HealthStatus
  message: string
  execution_time_ms: number
}

/**
 * Exit code type
 */
export type ExitCode = 0 | 1 | 2

/**
 * Categorized health check output
 */
export interface HealthCheckOutput {
  version: string
  timestamp: string
  status: HealthStatus
  exit_code: ExitCode
  summary: {
    total_checks: number
    passed: number
    warnings: number
    errors: number
    execution_time_ms: number
  }
  checks: Record<string, HealthCheckResultEnhanced[]>
}

/**
 * Category definitions for organizing health checks
 */
export const CATEGORIES: Record<string, readonly string[]> = {
  infrastructure: [
    'vault_path_exists',
    'vault_path_writable',
    'database_accessible',
    'database_integrity',
    'disk_space',
  ],
  credentials: ['gmail_oauth2', 'icloudctl_available', 'whisper_model_exists'],
  operational: [
    'voice_polling',
    'email_polling',
    'error_log_summary',
    'backup_status',
    'queue_depth',
    'placeholder_ratio',
  ],
  workers: [], // Deferred to Phase 2+
}

/**
 * Get category for a check ID
 */
export const getCategoryForCheck = (checkId: string): string => {
  for (const [category, checks] of Object.entries(CATEGORIES)) {
    if (checks.includes(checkId)) {
      return category
    }
  }
  return 'other'
}

/**
 * Aggregate check results into categorized output
 */
export const aggregateCheckResults = (
  checks: HealthCheckResultEnhanced[],
  totalExecutionTime: number
): HealthCheckOutput => {
  // Group checks by category
  const categorizedChecks: Record<string, HealthCheckResultEnhanced[]> = {}

  for (const check of checks) {
    const category = getCategoryForCheck(check.id)
    // eslint-disable-next-line security/detect-object-injection -- category from getCategoryForCheck is safe
    categorizedChecks[category] ??= []
    // eslint-disable-next-line security/detect-object-injection -- category from getCategoryForCheck is safe
    const categoryChecks = categorizedChecks[category]
    if (categoryChecks) {
      categoryChecks.push(check)
    }
  }

  // Calculate summary statistics
  const passed = checks.filter((c) => c.status === 'ok').length
  const warnings = checks.filter((c) => c.status === 'warn').length
  const errors = checks.filter((c) => c.status === 'error').length

  // Determine overall status
  let overallStatus: HealthStatus = 'ok'
  if (errors > 0) {
    overallStatus = 'error'
  } else if (warnings > 0) {
    overallStatus = 'warn'
  }

  // Determine exit code
  let exitCode: 0 | 1 | 2 = 0
  if (errors > 0) {
    exitCode = 2
  } else if (warnings > 0) {
    exitCode = 1
  }

  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    status: overallStatus,
    exit_code: exitCode,
    summary: {
      total_checks: checks.length,
      passed,
      warnings,
      errors,
      execution_time_ms: totalExecutionTime,
    },
    checks: categorizedChecks,
  }
}

/**
 * Format human-readable output with colors and icons
 */
export const formatHumanReadable = (output: HealthCheckOutput): string => {
  const lines: string[] = []

  // Title
  lines.push(chalk.bold('ADHD Brain Health Check'))
  lines.push('=========================')
  lines.push('')

  // Categories
  const categoryOrder = ['infrastructure', 'credentials', 'operational', 'workers', 'other']

  for (const category of categoryOrder) {
    // eslint-disable-next-line security/detect-object-injection -- category from categoryOrder is safe
    const categoryChecks = output.checks[category]
    if (!categoryChecks || categoryChecks.length === 0) {
      continue
    }

    // Category header with overall status
    const categoryStatus = getCategoryStatus(categoryChecks)
    const categoryIcon = getStatusIcon(categoryStatus)
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1)
    lines.push(`${categoryIcon} ${chalk.bold(categoryName)}`)

    // Individual checks
    for (const check of categoryChecks) {
      const icon = getStatusIcon(check.status)
      const coloredIcon = colorizeIcon(icon, check.status)
      lines.push(`  ${coloredIcon} ${check.name}: ${check.message}`)
    }

    lines.push('')
  }

  // Summary
  lines.push(chalk.bold('Summary'))
  lines.push('-------')
  lines.push(`Total Checks: ${output.summary.total_checks}`)
  lines.push(`Passed: ${chalk.green(output.summary.passed)}`)
  lines.push(`Warnings: ${chalk.yellow(output.summary.warnings)}`)
  lines.push(`Errors: ${chalk.red(output.summary.errors)}`)
  lines.push(`Exit Code: ${output.exit_code} (${getExitCodeLabel(output.exit_code)})`)

  return lines.join('\n')
}

/**
 * Format JSON output (no ANSI codes)
 */
export const formatJSON = (output: HealthCheckOutput): string => {
  return JSON.stringify(output, undefined, 2)
}

/**
 * Get status icon for a health status
 */
const getStatusIcon = (status: HealthStatus): string => {
  switch (status) {
    case 'ok':
      return '✓'
    case 'warn':
      return '⚠'
    case 'error':
      return '✗'
  }
}

/**
 * Colorize icon based on status
 */
const colorizeIcon = (icon: string, status: HealthStatus): string => {
  switch (status) {
    case 'ok':
      return chalk.green(icon)
    case 'warn':
      return chalk.yellow(icon)
    case 'error':
      return chalk.red(icon)
  }
}

/**
 * Get overall status for a category
 */
const getCategoryStatus = (checks: HealthCheckResultEnhanced[]): HealthStatus => {
  if (checks.some((c) => c.status === 'error')) {
    return 'error'
  }
  if (checks.some((c) => c.status === 'warn')) {
    return 'warn'
  }
  return 'ok'
}

/**
 * Get human-readable label for exit code
 */
const getExitCodeLabel = (exitCode: 0 | 1 | 2): string => {
  switch (exitCode) {
    case 0:
      return 'all checks passed'
    case 1:
      return 'warnings'
    case 2:
      return 'errors'
  }
}
