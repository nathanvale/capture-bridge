/**
 * Health check types and interfaces
 */

export type HealthStatus = 'ok' | 'warn' | 'error'

export interface HealthCheckResult {
  id?: string
  name: string
  status: HealthStatus
  message?: string
  details?: string
  fix?: string
  execution_time_ms?: number
}

export interface DoctorResult {
  checks: HealthCheckResult[]
  summary: {
    pass: number
    fail: number
    warn: number
  }
  exitCode: number
  output?: string
}

export interface DoctorOptions {
  json?: boolean
  verbose?: boolean
  mockAllChecksPass?: boolean
  mockWarnings?: boolean
  mockCriticalErrors?: boolean
}
