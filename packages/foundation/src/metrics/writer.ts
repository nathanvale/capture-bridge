/**
 * NDJSON Writer
 * Handles atomic writes to NDJSON files with rotation support
 */

import { existsSync } from 'node:fs'
import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { SCHEMA_VERSION, type MetricEvent, type MetricsConfig } from './types.js'

export class NDJSONWriter {
  private readonly metricsDir: string
  private currentFile: string | undefined = undefined
  private currentDate: string | undefined = undefined
  private hasWrittenSchemaVersion = false

  constructor(config: MetricsConfig) {
    this.metricsDir = config.metricsDir
  }

  async initialize(): Promise<void> {
    // Ensure metrics directory exists
    if (!existsSync(this.metricsDir)) {
      await mkdir(this.metricsDir, { recursive: true })
    }
    this.updateCurrentFile()
  }

  private updateCurrentFile(): void {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]

    if (!dateStr || dateStr !== this.currentDate) {
      this.currentDate = dateStr
      this.currentFile = join(this.metricsDir, `${dateStr}.ndjson`)
      this.hasWrittenSchemaVersion = false
    }
  }

  async write(events: MetricEvent[]): Promise<void> {
    if (events.length === 0) return

    this.updateCurrentFile()
    if (!this.currentFile) return

    const lines: string[] = []

    // Write schema version as first event in new file
    if (!this.hasWrittenSchemaVersion) {
      let fileHasContent = false
      if (existsSync(this.currentFile)) {
        try {
          const stats = await stat(this.currentFile)
          fileHasContent = stats.size > 0
        } catch {
          // Treat stat failures as an empty file and re-emit the schema record
        }
      }

      if (!fileHasContent) {
        const schemaEvent: MetricEvent = {
          timestamp: new Date().toISOString(),
          metric: 'metrics.schema.version',
          value: 1,
          type: 'gauge',
          version: SCHEMA_VERSION,
        }
        lines.push(JSON.stringify(schemaEvent))
      }

      this.hasWrittenSchemaVersion = true
    }

    // Add all events
    for (const event of events) {
      // Ensure version field is present
      const eventWithVersion = {
        ...event,
        version: event.version ?? SCHEMA_VERSION,
      }
      lines.push(JSON.stringify(eventWithVersion))
    }

    // Atomic append with newline delimiter
    const content = lines.join('\n') + '\n'
    await appendFile(this.currentFile, content, 'utf8')
  }

  rotate(): void {
    this.updateCurrentFile()
  }

  async cleanup(retentionDays: number): Promise<void> {
    const files = await readdir(this.metricsDir)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    if (!cutoffStr) return

    for (const file of files) {
      if (file.endsWith('.ndjson')) {
        const dateStr = file.replace('.ndjson', '')
        if (dateStr < cutoffStr) {
          const filePath = join(this.metricsDir, file)
          await unlink(filePath)
        }
      }
    }
  }

  async getCurrentFileSize(): Promise<number> {
    if (!this.currentFile || !existsSync(this.currentFile)) {
      return 0
    }
    const stats = await stat(this.currentFile)
    return stats.size
  }
}
