---
title: Metrics/Telemetry Contract Tech Spec
status: accepted
owner: Nathan
version: 1.0.0
date: 2025-09-28
spec_type: tech
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
prd_reference: docs/master/prd-master.md
---

# Metrics/Telemetry Contract — Technical Specification

Related Documents:

- `../master/prd-master.md` (Master PRD v2.3.0-MPPP, Section 6.4 Telemetry)
- `../features/capture/prd-capture.md` (Capture Feature PRD, Section 9 Telemetry)
- `../features/staging-ledger/prd-staging.md` (Staging Ledger PRD, Section 7.5 Observability)
- `../guides/guide-gmail-oauth2-setup.md` (Gmail OAuth2 metrics integration)
- `../guides/guide-whisper-transcription.md` (Whisper transcription metrics integration)
- `../guides/guide-error-recovery.md` (Error recovery and retry metrics integration)

---

## 1. Scope & Interfaces

### 1.1 Purpose

Define a **unified metrics and telemetry contract** for the ADHD Brain capture system that enables:

- **Operational visibility:** Queue depths, latencies, error rates
- **Performance monitoring:** P95 latencies, throughput rates, resource usage
- **Debugging support:** Structured events with correlation IDs
- **Forward compatibility:** Additive-only schema evolution
- **Privacy preservation:** Local-only storage, no external transmission

**Related ADR:** [ADR 0021: Local-Only NDJSON Metrics Strategy](../adr/0021-local-metrics-ndjson-strategy.md)

**Key Design Principles:**

1. **Local-first:** All metrics stored locally (no cloud transmission)
2. **Opt-in activation:** Disabled by default (`CAPTURE_METRICS=1` to enable)
3. **NDJSON format:** Newline-delimited JSON for easy parsing and rotation
4. **Additive-only:** New fields/metrics allowed, removals require major version
5. **Test-friendly:** Canonical fixtures prevent test brittleness

### 1.2 Public Interfaces

#### Metrics Emission API

```typescript
interface MetricsClient {
  // Emit a single metric event
  emit(metric: MetricEvent): void

  // Emit a counter increment
  counter(name: string, tags?: MetricTags): void

  // Emit a gauge value
  gauge(name: string, value: number, tags?: MetricTags): void

  // Emit a duration (milliseconds)
  duration(name: string, durationMs: number, tags?: MetricTags): void

  // Emit a histogram value
  histogram(name: string, value: number, tags?: MetricTags): void

  // Check if metrics are enabled
  isEnabled(): boolean

  // Flush pending metrics to disk
  flush(): Promise<void>
}

interface MetricEvent {
  timestamp: string // ISO 8601 UTC (e.g. "2025-09-27T10:30:00.123Z")
  metric: string // Metric name (namespace.component.action.unit)
  value: number // Numeric value
  tags?: MetricTags // Optional key-value tags
  type: MetricType // counter | gauge | duration | histogram
}

interface MetricTags {
  [key: string]: string | number | boolean
}

type MetricType = "counter" | "gauge" | "duration" | "histogram"
```

#### Configuration API

```typescript
interface MetricsConfig {
  // Enable/disable metrics collection
  enabled: boolean

  // Base directory for NDJSON files
  metricsDir: string // Default: "./.metrics"

  // Rotation policy
  rotation: "daily" | "hourly" // Default: daily

  // Retention policy (days)
  retentionDays: number // Default: 30

  // Buffer size before flush
  bufferSize: number // Default: 100

  // Flush interval (milliseconds)
  flushIntervalMs: number // Default: 5000
}
```

#### Query API (Test Support)

```typescript
interface MetricsQuery {
  // Query metrics by name pattern
  query(pattern: string, timeRange?: TimeRange): Promise<MetricEvent[]>

  // Aggregate metrics (count, sum, avg, p95)
  aggregate(
    pattern: string,
    aggregation: AggregationType,
    timeRange?: TimeRange
  ): Promise<AggregateResult>

  // Get latest metric value
  latest(name: string, tags?: MetricTags): Promise<MetricEvent | null>
}

interface TimeRange {
  start: Date
  end: Date
}

type AggregationType =
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "p50"
  | "p95"
  | "p99"

interface AggregateResult {
  metric: string
  aggregation: AggregationType
  value: number
  count: number
  timeRange: TimeRange
}
```

### 1.3 External Dependencies

- **Node.js fs/promises:** File system operations (append, rotate, cleanup)
- **Date-fns:** Timestamp formatting and rotation boundaries
- **Environment variables:** `CAPTURE_METRICS=1` for activation

### 1.4 File System Contract

**Metrics Directory Structure:**

```
~/.capture-bridge/
└── .metrics/
    ├── 2025-09-27.ndjson         # Current day
    ├── 2025-09-26.ndjson         # Previous days
    ├── 2025-09-25.ndjson
    └── ...                       # Retained per policy (30 days)
```

**File Naming Convention:**

- Pattern: `YYYY-MM-DD.ndjson`
- Rotation: Midnight UTC (daily mode)
- Atomic writes: Append-only operations

**File Permissions:**

- Owner: Read/write (600)
- Group: None
- Others: None

---

## 2. Data & Storage

### 2.1 Metric Naming Convention

**Namespace Structure:**

```
<domain>.<component>.<action>.<unit>
```

**Examples:**

- `capture.voice.staging_ms` - Voice capture staging duration
- `capture.email.poll_duration_ms` - Email poll cycle time
- `transcription.queue_depth` - Transcription queue size
- `export.write_ms` - Vault file write duration
- `dedup.hits_total` - Duplicate detection count
- `backup.verification_result` - Backup verification status

**Naming Rules:**

1. **Lowercase only:** No uppercase letters or camelCase
2. **Underscores for spacing:** Words separated by `_`
3. **Dots for namespacing:** Components separated by `.`
4. **Unit suffix:** Duration metrics end in `_ms`, counts end in `_total`
5. **Verb form:** Use `_duration`, `_latency`, `_count`, `_depth`, `_rate`

**Reserved Prefixes:**

- `capture.*` - Capture pipeline metrics
- `staging.*` - Staging ledger metrics
- `transcription.*` - Whisper runtime metrics
- `export.*` - Vault export metrics
- `gmail.*` - Gmail API metrics
- `retry.*` - Error recovery metrics
- `backup.*` - Backup operations metrics
- `health.*` - Health check metrics

### 2.2 Canonical Metric Schema

#### Core Capture Metrics

```typescript
// Voice capture metrics
"capture.voice.staging_ms" = {
  type: "duration",
  description: "Time to insert voice capture into staging ledger",
  tags: { capture_id: string, source: "voice" },
  unit: "milliseconds",
}

"capture.voice.poll_duration_ms" = {
  type: "duration",
  description: "Voice polling cycle time (detect → stage)",
  tags: { files_found: number },
  unit: "milliseconds",
}

"capture.voice.download_duration_ms" = {
  type: "duration",
  description: "iCloud dataless file download duration",
  tags: { capture_id: string, file_size_bytes: number },
  unit: "milliseconds",
}

// Email capture metrics
"capture.email.staging_ms" = {
  type: "duration",
  description: "Time to insert email capture into staging ledger",
  tags: { capture_id: string, source: "email", message_id: string },
  unit: "milliseconds",
}

"capture.email.poll_duration_ms" = {
  type: "duration",
  description: "Email polling cycle time (API → stage)",
  tags: { messages_found: number },
  unit: "milliseconds",
}

// Unified capture metrics
"capture.time_to_export_ms" = {
  type: "duration",
  description: "End-to-end latency from capture to vault export",
  tags: { capture_id: string, source: "voice" | "email" },
  unit: "milliseconds",
}
```

#### Transcription Metrics

```typescript
"transcription.duration_ms" = {
  type: "duration",
  description: "Whisper processing time per audio file",
  tags: {
    capture_id: string,
    model: "medium",
    audio_duration_s: number,
    success: boolean,
  },
  unit: "milliseconds",
}

"transcription.queue_depth" = {
  type: "gauge",
  description: "Number of pending transcription jobs",
  tags: {},
  unit: "count",
}

"transcription.success_total" = {
  type: "counter",
  description: "Total successful transcriptions",
  tags: { model: "medium" },
  unit: "count",
}

"transcription.failure_total" = {
  type: "counter",
  description: "Total failed transcriptions",
  tags: { error_type: string, model: "medium" },
  unit: "count",
}

"transcription.placeholder_export_ratio" = {
  type: "gauge",
  description: "Ratio of placeholder exports (daily aggregate)",
  tags: { date: string },
  unit: "ratio", // 0.0 to 1.0
}
```

#### Deduplication Metrics

```typescript
"dedup.hits_total" = {
  type: "counter",
  description: "Duplicate detection events",
  tags: {
    source: "voice" | "email",
    reason: "content_hash" | "message_id" | "audio_fingerprint",
  },
  unit: "count",
}

"dedup.check_duration_ms" = {
  type: "duration",
  description: "Hash lookup time in staging ledger",
  tags: { source: "voice" | "email" },
  unit: "milliseconds",
}
```

#### Export Metrics

```typescript
"export.write_ms" = {
  type: "duration",
  description: "Vault file write duration (atomic)",
  tags: {
    capture_id: string,
    source: "voice" | "email",
    vault_path: string,
  },
  unit: "milliseconds",
}

"export.failures_total" = {
  type: "counter",
  description: "Failed vault writes",
  tags: {
    source: "voice" | "email",
    error_type: string,
  },
  unit: "count",
}

"export.success_total" = {
  type: "counter",
  description: "Successful vault writes",
  tags: { source: "voice" | "email" },
  unit: "count",
}
```

#### Gmail OAuth2 Metrics

```typescript
"gmail.auth.refresh_total" = {
  type: "counter",
  description: "Token refresh attempts",
  tags: { status: "success" | "failure" },
  unit: "count",
}

"gmail.auth.bootstrap_total" = {
  type: "counter",
  description: "OAuth2 bootstrap attempts",
  tags: { status: "success" | "failure" },
  unit: "count",
}

"gmail.token.expiry_ms" = {
  type: "gauge",
  description: "Time until token expiry",
  tags: {},
  unit: "milliseconds",
}

"gmail.poll.duration_ms" = {
  type: "duration",
  description: "Gmail API poll cycle time",
  tags: { messages_found: number },
  unit: "milliseconds",
}

"gmail.messages.processed_total" = {
  type: "counter",
  description: "Messages fetched from Gmail API",
  tags: {},
  unit: "count",
}

"gmail.cursor.update_total" = {
  type: "counter",
  description: "History ID cursor updates",
  tags: { status: "success" | "failure" },
  unit: "count",
}

"gmail.dedup.hits_total" = {
  type: "counter",
  description: "Gmail-specific duplicate detection",
  tags: { reason: "message_id" | "content_hash" },
  unit: "count",
}

"gmail.auth.error_total" = {
  type: "counter",
  description: "Gmail authentication errors",
  tags: { type: string },
  unit: "count",
}

"gmail.api.error_total" = {
  type: "counter",
  description: "Gmail API errors",
  tags: {
    method: string,
    status_code: number,
    error_type: string,
  },
  unit: "count",
}

"gmail.cursor.reset_total" = {
  type: "counter",
  description: "Cursor resets (recovery events)",
  tags: { reason: "invalid" | "manual" },
  unit: "count",
}

"gmail.consecutive_errors" = {
  type: "gauge",
  description: "Consecutive error count (circuit breaker)",
  tags: {},
  unit: "count",
}

"gmail.capture.latency_ms" = {
  type: "duration",
  description: "End-to-end Gmail capture latency",
  tags: {
    message_id: string,
    stage: "poll" | "fetch" | "stage" | "export",
  },
  unit: "milliseconds",
}

"gmail.api.request_ms" = {
  type: "duration",
  description: "Gmail API request duration",
  tags: {
    method: string,
    success: boolean,
  },
  unit: "milliseconds",
}
```

#### Error Recovery & Retry Metrics

```typescript
"retry.attempt_total" = {
  type: "counter",
  description: "Retry attempts across all operations",
  tags: {
    operation_type: string,
    error_type: string,
    attempt_number: number,
    success: boolean,
  },
  unit: "count",
}

"retry.backoff_duration_ms" = {
  type: "duration",
  description: "Retry backoff delay",
  tags: {
    operation_type: string,
    attempt_number: number,
  },
  unit: "milliseconds",
}

"retry.success_total" = {
  type: "counter",
  description: "Successful retries",
  tags: {
    operation_type: string,
    attempt_number: number,
  },
  unit: "count",
}

"retry.dlq.moved_total" = {
  type: "counter",
  description: "Operations moved to dead letter queue",
  tags: {
    operation_type: string,
    reason: string,
  },
  unit: "count",
}

"retry.circuit_breaker.state" = {
  type: "gauge",
  description: "Circuit breaker state",
  tags: {
    operation_type: string,
    state: "closed" | "open" | "half_open",
  },
  unit: "enum",
}

"retry.queue.depth" = {
  type: "gauge",
  description: "Retry queue depth",
  tags: { operation_type: string },
  unit: "count",
}
```

#### Backup Metrics

```typescript
"backup.verification.result" = {
  type: "counter",
  description: "Backup verification outcome",
  tags: { status: "success" | "failure" },
  unit: "count",
}

"backup.duration_ms" = {
  type: "duration",
  description: "Backup creation time",
  tags: {},
  unit: "milliseconds",
}

"backup.size_bytes" = {
  type: "gauge",
  description: "Backup file size",
  tags: { timestamp: string },
  unit: "bytes",
}

"backup.consecutive_failures" = {
  type: "gauge",
  description: "Consecutive backup verification failures",
  tags: {},
  unit: "count",
}
```

#### Staging Ledger Metrics

```typescript
"staging.insert_duration_ms" = {
  type: "duration",
  description: "Capture row insertion time",
  tags: {
    source: "voice" | "email",
    capture_id: string,
  },
  unit: "milliseconds",
}

"staging.row_count" = {
  type: "gauge",
  description: "Total rows in captures table",
  tags: { status: string },
  unit: "count",
}

"staging.retention.cleanup_total" = {
  type: "counter",
  description: "Retention policy cleanup executions",
  tags: { rows_deleted: number },
  unit: "count",
}

"staging.foreign_key.violation_total" = {
  type: "counter",
  description: "Foreign key constraint violations",
  tags: { table: string },
  unit: "count",
}
```

#### Health Check Metrics

```typescript
"health.check.duration_ms" = {
  type: "duration",
  description: "Health check execution time",
  tags: { component: string },
  unit: "milliseconds",
}

"health.check.result" = {
  type: "counter",
  description: "Health check outcome",
  tags: {
    component: string,
    status: "ok" | "warn" | "error",
  },
  unit: "count",
}
```

### 2.3 NDJSON File Format

**Single Event Example:**

```json
{
  "timestamp": "2025-09-27T10:30:15.123Z",
  "metric": "capture.voice.staging_ms",
  "value": 87,
  "tags": { "capture_id": "01HQW3P7XKZM2YJVT8YFGQSZ4M", "source": "voice" },
  "type": "duration"
}
```

**Multi-Event File Example:**

```ndjson
{"timestamp":"2025-09-27T10:30:00.000Z","metric":"capture.voice.poll_duration_ms","value":4532,"tags":{"files_found":3},"type":"duration"}
{"timestamp":"2025-09-27T10:30:00.123Z","metric":"capture.voice.staging_ms","value":87,"tags":{"capture_id":"01ABC","source":"voice"},"type":"duration"}
{"timestamp":"2025-09-27T10:30:01.456Z","metric":"transcription.queue_depth","value":2,"tags":{},"type":"gauge"}
{"timestamp":"2025-09-27T10:30:05.789Z","metric":"transcription.duration_ms","value":8234,"tags":{"capture_id":"01ABC","model":"medium","audio_duration_s":45,"success":true},"type":"duration"}
{"timestamp":"2025-09-27T10:30:06.012Z","metric":"export.write_ms","value":234,"tags":{"capture_id":"01ABC","source":"voice","vault_path":"inbox/01ABC.md"},"type":"duration"}
{"timestamp":"2025-09-27T10:30:06.100Z","metric":"capture.time_to_export_ms","value":6100,"tags":{"capture_id":"01ABC","source":"voice"},"type":"duration"}
```

**Field Requirements:**

| Field       | Type   | Required | Description                                    |
| ----------- | ------ | -------- | ---------------------------------------------- |
| `timestamp` | string | Yes      | ISO 8601 UTC timestamp                         |
| `metric`    | string | Yes      | Fully-qualified metric name                    |
| `value`     | number | Yes      | Numeric value                                  |
| `tags`      | object | No       | Key-value metadata                             |
| `type`      | string | Yes      | Metric type (counter/gauge/duration/histogram) |

**Schema Evolution Rules:**

1. **Additive only:** New fields may be added at any time
2. **No removals:** Existing fields cannot be removed (major version change)
3. **No type changes:** Field types cannot change (major version change)
4. **Optional fields:** New fields must be optional (backward compatibility)
5. **Tag additions:** New tags may be added without version change

### 2.4 Rotation & Retention

**Daily Rotation:**

```typescript
interface RotationPolicy {
  // Rotation trigger: Midnight UTC
  rotationBoundary: "midnight_utc"

  // Rotation check interval
  checkIntervalMs: 60000 // 1 minute

  // Atomic rotation process
  rotateFile(): Promise<RotationResult>
}

interface RotationResult {
  oldFile: string // Previous day's file
  newFile: string // Current day's file
  rotatedAt: Date
  oldFileSize: number
}
```

**Retention Policy:**

```typescript
interface RetentionPolicy {
  // Days to retain (default: 30)
  retentionDays: 30

  // Cleanup execution: Daily at 2 AM UTC
  cleanupSchedule: "daily_2am_utc"

  // Delete files older than retention
  cleanup(): Promise<CleanupResult>
}

interface CleanupResult {
  deletedFiles: string[]
  freedBytes: number
  oldestRetainedFile: string
}
```

**Cleanup Logic:**

```typescript
async function cleanupOldMetrics(
  config: RetentionPolicy
): Promise<CleanupResult> {
  const now = new Date()
  const cutoffDate = subDays(now, config.retentionDays)

  const files = await fs.readdir(config.metricsDir)
  const toDelete = files.filter((f) => {
    const match = f.match(/^(\d{4}-\d{2}-\d{2})\.ndjson$/)
    if (!match) return false
    const fileDate = parseISO(match[1])
    return isBefore(fileDate, cutoffDate)
  })

  let freedBytes = 0
  for (const file of toDelete) {
    const stats = await fs.stat(path.join(config.metricsDir, file))
    freedBytes += stats.size
    await fs.unlink(path.join(config.metricsDir, file))
  }

  return {
    deletedFiles: toDelete,
    freedBytes,
    oldestRetainedFile: files.filter((f) => !toDelete.includes(f)).sort()[0],
  }
}
```

### 2.5 Storage Constraints

**File Size Limits:**

- **Single day file:** Warn at 50MB, hard limit 100MB
- **Total metrics directory:** Warn at 1GB, hard limit 3GB
- **Buffer overflow:** Flush immediately if buffer exceeds 1000 events

**Disk Space Monitoring:**

```typescript
"metrics.file.size_bytes" = {
  type: "gauge",
  description: "Current day metrics file size",
  tags: { file: string },
  unit: "bytes",
}

"metrics.directory.size_bytes" = {
  type: "gauge",
  description: "Total metrics directory size",
  tags: {},
  unit: "bytes",
}

"metrics.buffer.overflow_total" = {
  type: "counter",
  description: "Buffer overflow forced flushes",
  tags: {},
  unit: "count",
}
```

**Trigger to Revisit Storage:**

| Condition           | Action                               |
| ------------------- | ------------------------------------ |
| Single file > 100MB | Enable hourly rotation               |
| Directory > 3GB     | Reduce retention to 7 days           |
| Disk space < 5GB    | Pause metrics collection, alert user |

---

## 3. Control Flow

### 3.1 Metrics Emission Lifecycle

**Initialization Flow:**

```
1. Check CAPTURE_METRICS environment variable
2. If enabled:
   a. Create .metrics directory if not exists
   b. Open current day's NDJSON file (append mode)
   c. Initialize in-memory buffer (capacity: 100)
   d. Start flush timer (interval: 5s)
   e. Register shutdown hook (flush on exit)
3. If disabled:
   a. Use no-op client (all calls ignored)
```

**Emission Flow:**

```
1. Application calls emit(metric)
2. If metrics disabled → return immediately
3. Add timestamp if not present
4. Validate metric schema (name, value, type)
5. Append to in-memory buffer
6. If buffer full (100 events) → flush immediately
7. Return control to caller (non-blocking)
```

**Flush Flow:**

```
1. Timer triggers flush (every 5s) OR buffer full
2. Lock buffer (prevent concurrent modifications)
3. Serialize events to NDJSON (newline-delimited)
4. Append to current day's file (atomic write)
5. Clear buffer
6. Release lock
7. Check rotation boundary (midnight UTC)
   a. If crossed → rotate to new file
```

**Rotation Flow:**

```
1. Detect midnight UTC boundary crossed
2. Close current file handle
3. Compute new filename (YYYY-MM-DD.ndjson)
4. Open new file handle (append mode)
5. Update internal file reference
6. Schedule retention cleanup (next 2 AM UTC)
```

**Shutdown Flow:**

```
1. Receive SIGTERM/SIGINT signal
2. Stop flush timer
3. Flush remaining buffer to disk
4. Close file handle
5. Exit gracefully
```

### 3.2 Query Flow (Test Support)

**Query Execution:**

```
1. Parse metric name pattern (glob or regex)
2. Determine relevant NDJSON files (time range)
3. Stream-read files line by line
4. Parse each line as JSON
5. Filter by metric name + tags
6. Collect matching events
7. Return results (sorted by timestamp)
```

**Aggregation Flow:**

```
1. Query matching events (as above)
2. Extract numeric values
3. Compute aggregation:
   - count: Total events
   - sum: Sum of values
   - avg: Mean value
   - p50/p95/p99: Percentiles
4. Return aggregate result
```

### 3.3 Error Handling

**Emission Errors:**

- **File write failure:** Log error, continue buffering (retry next flush)
- **Disk full:** Pause metrics, log warning, continue application
- **Invalid metric:** Log validation error, drop event, continue
- **Buffer overflow:** Force flush, log warning, continue

**Rotation Errors:**

- **New file creation failure:** Continue writing to old file, log error
- **Old file close failure:** Log error, continue with new file
- **Retention cleanup failure:** Log error, skip cleanup, retry next cycle

**Recovery Strategy:**

- **Transient errors:** Retry with exponential backoff (max 3 attempts)
- **Permanent errors:** Disable metrics, log critical error, continue app
- **Disk exhaustion:** Pause metrics, alert user via health check

---

## 4. TDD Applicability Decision

### 4.1 Risk Classification

**Risk Level:** MEDIUM

**Rationale:**

- **Contract stability critical:** Metric name changes break tests and dashboards
- **Schema evolution risks:** Breaking changes disrupt tooling and analysis
- **File corruption impact:** Lost metrics reduce operational visibility
- **Test brittleness:** Hardcoded metric names cause widespread test failures

**Not High Risk Because:**

- Metrics are observability only (not control plane)
- Disabled by default (no impact on core functionality)
- Local-only storage (no external dependencies)

### 4.2 TDD Decision: Required

**Why:**

- **Schema contract tests:** Ensure forward compatibility and prevent breaking changes
- **Naming convention tests:** Enforce canonical metric names across codebase
- **Serialization tests:** Validate NDJSON format correctness
- **Query API tests:** Ensure test fixtures work reliably

**Scope Under TDD:**

**Unit Tests (Required):**

- Metric name validation (namespace, format, reserved prefixes)
- Schema validation (required fields, type checking)
- NDJSON serialization/deserialization
- Tag normalization (consistent types, no invalid chars)
- Buffer management (flush triggers, overflow handling)

**Integration Tests (Required):**

- End-to-end emission → flush → file write
- Rotation at midnight boundary
- Retention cleanup execution
- Query API correctness
- Concurrent emission safety

**Contract Tests (Required):**

- Canonical metric fixtures (all defined metrics)
- Schema evolution compatibility (old readers, new writers)
- Tag schema stability (existing tags preserved)
- Test helper consistency (queryMetrics, assertMetric)

**Property Tests (Recommended):**

- Metric name generator (always valid format)
- Tag value generator (serializable types only)
- Timestamp ordering (monotonic within flush)

### 4.3 Test Coverage Requirements

| Component              | Coverage Target | Priority |
| ---------------------- | --------------- | -------- |
| Metric name validation | 100%            | P0       |
| Schema validation      | 100%            | P0       |
| NDJSON serialization   | 100%            | P0       |
| Emission flow          | 95%             | P0       |
| Rotation logic         | 90%             | P1       |
| Retention cleanup      | 90%             | P1       |
| Query API              | 85%             | P1       |

### 4.4 Test Fixtures (Canonical)

**Standard Test Events:**

```typescript
// Fixture: Voice capture staging
export const FIXTURE_VOICE_STAGING: MetricEvent = {
  timestamp: "2025-09-27T10:00:00.000Z",
  metric: "capture.voice.staging_ms",
  value: 87,
  tags: { capture_id: "01TEST123", source: "voice" },
  type: "duration",
}

// Fixture: Transcription success
export const FIXTURE_TRANSCRIPTION_SUCCESS: MetricEvent = {
  timestamp: "2025-09-27T10:00:05.000Z",
  metric: "transcription.duration_ms",
  value: 8234,
  tags: {
    capture_id: "01TEST123",
    model: "medium",
    audio_duration_s: 45,
    success: true,
  },
  type: "duration",
}

// Fixture: Export write
export const FIXTURE_EXPORT_WRITE: MetricEvent = {
  timestamp: "2025-09-27T10:00:06.000Z",
  metric: "export.write_ms",
  value: 234,
  tags: {
    capture_id: "01TEST123",
    source: "voice",
    vault_path: "inbox/01TEST123.md",
  },
  type: "duration",
}

// Fixture: Duplicate hit
export const FIXTURE_DEDUP_HIT: MetricEvent = {
  timestamp: "2025-09-27T10:00:07.000Z",
  metric: "dedup.hits_total",
  value: 1,
  tags: {
    source: "email",
    reason: "message_id",
  },
  type: "counter",
}

// Fixture: Backup verification success
export const FIXTURE_BACKUP_VERIFICATION: MetricEvent = {
  timestamp: "2025-09-27T11:00:00.000Z",
  metric: "backup.verification.result",
  value: 1,
  tags: { status: "success" },
  type: "counter",
}

// Fixture: Retry attempt
export const FIXTURE_RETRY_ATTEMPT: MetricEvent = {
  timestamp: "2025-09-27T10:00:08.000Z",
  metric: "retry.attempt_total",
  value: 1,
  tags: {
    operation_type: "transcription",
    error_type: "timeout",
    attempt_number: 2,
    success: true,
  },
  type: "counter",
}
```

**Test Helper Functions:**

```typescript
// Query metrics from test fixtures
export async function queryMetrics(
  pattern: string,
  timeRange?: string
): Promise<MetricEvent[]> {
  // Implementation: Read from test NDJSON file or in-memory store
}

// Assert metric was emitted
export function assertMetricEmitted(
  metricName: string,
  expectedValue?: number,
  expectedTags?: MetricTags
): void {
  // Implementation: Search test metrics buffer
}

// Assert metric count
export function assertMetricCount(
  metricName: string,
  expectedCount: number
): void {
  // Implementation: Count matching metrics
}

// Clear test metrics
export function clearTestMetrics(): void {
  // Implementation: Reset in-memory buffer
}
```

### 4.5 YAGNI Deferrals

**Not Testing Now:**

- Performance benchmarks (emission throughput)
- Stress testing (1M+ events/day)
- Distributed tracing integration (Phase 5+)
- External exporters (Prometheus, Grafana)
- Real-time streaming (WebSocket)

**Trigger to Revisit:**

| Condition                    | Action                           |
| ---------------------------- | -------------------------------- |
| Metrics volume > 100k/day    | Add performance regression tests |
| External dashboard requested | Add exporter compatibility tests |
| Multi-process deployment     | Add lock contention tests        |

---

## 5. Dependencies & Contracts

### 5.1 Upstream Dependencies

**From All Capture Channels:**

- Metric emission calls (counter, gauge, duration)
- Correlation IDs (capture_id, operation_id)
- Error types (for error metrics)

**From Configuration:**

- `CAPTURE_METRICS` environment variable
- Metrics directory path (default: `./.metrics`)
- Retention policy (default: 30 days)

### 5.2 Downstream Consumers

**Test Suites:**

- Query API for test assertions
- Canonical fixtures for test data
- Helper functions for metric validation

**Health Command:**

- Metrics file size and count
- Buffer status and overflow events
- Rotation and retention status

**Manual Analysis:**

- NDJSON files for ad-hoc queries
- Aggregate metrics for trend analysis
- Event correlation for debugging

### 5.3 External Contracts

**File System:**

- `./.metrics/` directory writable
- Append-only file operations
- Atomic rename for rotation

**Environment:**

- `CAPTURE_METRICS=1` enables collection
- No external network calls
- No external dependencies (pure Node.js)

---

## 6. Risks & Mitigations

### 6.1 High-Priority Risks

| Risk                    | Impact             | Probability | Mitigation                                | Status   |
| ----------------------- | ------------------ | ----------- | ----------------------------------------- | -------- |
| Metric name churn       | Test brittleness   | Medium      | Canonical fixtures, naming validation     | Required |
| Schema breaking changes | Tooling disruption | Low         | Additive-only evolution, version checking | Required |
| Disk exhaustion         | Metrics loss       | Low         | Size monitoring, automatic cleanup        | Required |
| Buffer overflow         | Memory growth      | Medium      | Flush limits, overflow detection          | Required |
| File corruption         | Data loss          | Low         | Append-only writes, rotation validation   | Required |

### 6.2 Medium-Priority Risks

| Risk                      | Impact           | Probability | Mitigation                         | Status     |
| ------------------------- | ---------------- | ----------- | ---------------------------------- | ---------- |
| Emission performance      | App slowdown     | Low         | Buffering, async flush             | Monitor    |
| Rotation failures         | Stale files      | Low         | Error logging, retry logic         | Monitor    |
| Tag cardinality explosion | File size growth | Medium      | Tag validation, cardinality limits | Monitor    |
| Time zone confusion       | Query errors     | Low         | Always use UTC                     | Documented |

### 6.3 Deferred Risks

| Risk                       | Defer Reason              | Revisit Trigger              |
| -------------------------- | ------------------------- | ---------------------------- |
| Multi-process coordination | Single process assumption | Multi-worker deployment      |
| Network export             | Local-only design         | External dashboard request   |
| Schema versioning          | No breaking changes yet   | First breaking change needed |
| Compression                | Storage not constrained   | Metrics directory > 1GB      |

---

## 7. Rollout & Telemetry (Meta-Metrics)

### 7.1 Activation

**Environment Variable:**

```bash
# Enable metrics collection
export CAPTURE_METRICS=1

# Run application
adhd capture start
```

**Default Behavior:**

- **Disabled by default** (no performance impact)
- **Opt-in activation** (explicit environment variable)
- **No external dependencies** (works offline)

### 7.2 Meta-Metrics (Monitor the Monitor)

**Metrics about Metrics:**

```typescript
"metrics.emission.rate_per_second" = {
  type: "gauge",
  description: "Metrics emitted per second",
  tags: {},
  unit: "rate",
}

"metrics.emission.total" = {
  type: "counter",
  description: "Total metrics emitted",
  tags: { metric_name: string },
  unit: "count",
}

"metrics.flush.duration_ms" = {
  type: "duration",
  description: "Time to flush buffer to disk",
  tags: { event_count: number },
  unit: "milliseconds",
}

"metrics.flush.total" = {
  type: "counter",
  description: "Total flush operations",
  tags: { trigger: "timer" | "overflow" | "shutdown" },
  unit: "count",
}

"metrics.buffer.size" = {
  type: "gauge",
  description: "Current buffer size",
  tags: {},
  unit: "count",
}

"metrics.rotation.total" = {
  type: "counter",
  description: "File rotation events",
  tags: { old_file: string, new_file: string },
  unit: "count",
}

"metrics.retention.cleanup_total" = {
  type: "counter",
  description: "Retention cleanup executions",
  tags: { files_deleted: number },
  unit: "count",
}

"metrics.file.write_error_total" = {
  type: "counter",
  description: "File write failures",
  tags: { error_type: string },
  unit: "count",
}
```

### 7.3 Health Check Integration

**Health Command Output:**

```bash
$ adhd capture doctor

Metrics Collection:
✓ Status: Enabled (CAPTURE_METRICS=1)
✓ Directory: /Users/nathan/.capture-bridge/.metrics
✓ Current file: 2025-09-27.ndjson (2.3 MB)
✓ Buffer: 23 events (max 100)
✓ Emission rate: 12.5 events/sec (last 5 min)
✓ Retention: 30 days (17 files, 48 MB total)
✓ Last rotation: 2025-09-27 00:00:03 UTC (3h ago)
✓ Last cleanup: 2025-09-27 02:00:15 UTC (1h ago)
✓ Disk space: 127 GB available

Recent Metrics (Last 1 Hour):
- capture.voice.staging_ms: 23 events, avg 92ms, p95 145ms
- transcription.duration_ms: 19 events, avg 8.2s, p95 12.1s
- export.write_ms: 23 events, avg 234ms, p95 456ms
- dedup.hits_total: 4 events
- backup.verification.result: 1 success
```

### 7.4 Performance Impact

**Expected Overhead:**

- **CPU:** < 0.5% (buffering + periodic flush)
- **Memory:** ~1-2 MB (buffer + file handles)
- **Disk I/O:** ~1-5 MB/hour (depends on capture volume)
- **Latency:** < 1ms per emit call (non-blocking)

**Monitoring Thresholds:**

| Metric          | Threshold            | Action                      |
| --------------- | -------------------- | --------------------------- |
| Emission rate   | > 1000/sec sustained | Warn: High cardinality risk |
| Flush duration  | > 500ms              | Warn: Disk I/O bottleneck   |
| File size       | > 100MB/day          | Enable hourly rotation      |
| Directory size  | > 3GB                | Reduce retention to 7 days  |
| Buffer overflow | > 10/day             | Increase flush frequency    |

---

## 8. Forward Compatibility

### 8.1 Schema Evolution Policy

**Allowed Changes (No Version Bump):**

1. **Add new metric names** (with documentation)
2. **Add new optional tags** (existing events valid)
3. **Add new optional fields** (parsers ignore unknown fields)
4. **Increase numeric precision** (reader tolerant)

**Breaking Changes (Major Version):**

1. **Remove existing metric names**
2. **Change metric type** (counter → gauge)
3. **Remove existing tags**
4. **Change tag types** (string → number)
5. **Rename fields** (timestamp → ts)

**Deprecation Process:**

1. **Mark metric as deprecated** (add `deprecated: true` field)
2. **Emit both old and new** (dual-write for 1 major version)
3. **Document migration path** (in changelog)
4. **Remove after 2 major versions** (minimum 6 months)

### 8.2 Version Detection

**File Format Version:**

```json
{
  "version": "1.0.0",
  "timestamp": "2025-09-27T00:00:00.000Z",
  "metric": "metrics.schema.version",
  "value": 1,
  "type": "gauge"
}
```

**First Line Convention:**

- First event in each NDJSON file declares schema version
- Readers check version compatibility before parsing
- Unsupported versions log warning, skip file

**Compatibility Matrix:**

| Reader Version | Writer Version | Compatibility              |
| -------------- | -------------- | -------------------------- |
| 1.x            | 1.x            | Full                       |
| 1.x            | 2.x            | Read (ignore new fields)   |
| 2.x            | 1.x            | Full (backward compatible) |
| 2.x            | 3.x            | Read (ignore new fields)   |
| 1.x            | 3.x            | Unsupported (warn, skip)   |

### 8.3 Test Fixture Evolution

**Fixture Versioning:**

```typescript
// Version 1.0.0 fixtures
export const FIXTURES_V1 = {
  VOICE_STAGING: { ... },
  TRANSCRIPTION_SUCCESS: { ... }
};

// Version 2.0.0 fixtures (added new fields)
export const FIXTURES_V2 = {
  VOICE_STAGING: { ..., new_field: 'value' },
  TRANSCRIPTION_SUCCESS: { ... }
};

// Active fixtures (always latest)
export const FIXTURES = FIXTURES_V2;

// Legacy test support
export const LEGACY_FIXTURES = {
  v1: FIXTURES_V1,
  v2: FIXTURES_V2
};
```

**Backward Compatibility Tests:**

```typescript
describe("Metrics Schema Compatibility", () => {
  it("reads v1.0.0 fixtures with v2.0.0 parser", async () => {
    const events = await parseNDJSON(FIXTURES_V1.VOICE_STAGING)
    expect(events).toHaveLength(1)
    expect(events[0].metric).toBe("capture.voice.staging_ms")
    // New fields optional, defaults used
  })

  it("v1.0.0 parser ignores v2.0.0 new fields", async () => {
    const events = await parseNDJSONWithParser(
      "v1.0.0",
      FIXTURES_V2.VOICE_STAGING
    )
    expect(events).toHaveLength(1)
    // Unknown fields silently ignored
  })
})
```

---

## 9. Implementation Checklist

### 9.1 Phase 1: Core Infrastructure (Week 1-2)

- [ ] Metrics client API (emit, counter, gauge, duration)
- [ ] NDJSON serialization (append-only writes)
- [ ] In-memory buffer (capacity 100, async flush)
- [ ] Environment variable activation (`CAPTURE_METRICS=1`)
- [ ] File rotation (midnight UTC boundary)
- [ ] Retention cleanup (30-day policy)
- [ ] Unit tests (schema validation, serialization)
- [ ] Integration tests (end-to-end emission → flush → file)

### 9.2 Phase 1: Metric Integration (Week 2-3)

- [ ] Voice capture metrics (staging, polling, download)
- [ ] Email capture metrics (staging, polling)
- [ ] Transcription metrics (duration, queue depth, failures)
- [ ] Deduplication metrics (hits, check duration)
- [ ] Export metrics (write duration, failures)
- [ ] Staging ledger metrics (insert, row count, cleanup)
- [ ] Test fixtures (canonical events for all metrics)
- [ ] Test helpers (queryMetrics, assertMetricEmitted)

### 9.3 Phase 2: Advanced Features (Week 4-5)

- [ ] Gmail OAuth2 metrics (auth, polling, errors)
- [ ] Error recovery metrics (retry, backoff, DLQ)
- [ ] Backup metrics (verification, duration, size)
- [ ] Health check integration (metrics status section)
- [ ] Meta-metrics (emission rate, flush duration, buffer size)
- [ ] Query API (pattern matching, aggregation)
- [ ] Contract tests (schema compatibility, fixture evolution)
- [ ] Documentation (metric catalog, query examples)

### 9.4 Phase 2: Hardening (Week 5-6)

- [ ] Error handling (file write failures, disk full)
- [ ] Buffer overflow protection (forced flush)
- [ ] Rotation failure recovery (retry logic)
- [ ] Tag cardinality limits (prevent explosion)
- [ ] Performance monitoring (emission overhead)
- [ ] Storage monitoring (file size, directory size)
- [ ] Graceful shutdown (flush on exit)
- [ ] Production validation (7 days dogfooding)

---

## 10. Open Questions

### 10.1 Resolved Decisions

- ✅ **Metric naming convention:** `domain.component.action.unit` format
- ✅ **File format:** NDJSON (newline-delimited JSON)
- ✅ **Rotation frequency:** Daily at midnight UTC
- ✅ **Retention policy:** 30 days default
- ✅ **Activation method:** `CAPTURE_METRICS=1` environment variable
- ✅ **Schema evolution:** Additive-only (no breaking changes)
- ✅ **Test fixtures:** Canonical events for all defined metrics

### 10.2 Implementation Decisions Needed

1. **Buffer flush strategy:** Timer-based (5s) or event-count-based (100)?
   - **Recommendation:** Both (whichever triggers first)

2. **Tag cardinality limit:** Maximum unique tag combinations per metric?
   - **Recommendation:** 1000 per metric (warn at 800)

3. **Aggregation caching:** Cache query results for performance?
   - **Defer:** YAGNI until query performance issue observed

4. **Compression:** Gzip old NDJSON files to save space?
   - **Defer:** Only if directory > 1GB persistent

5. **Metric namespaces:** Allow custom namespaces (plugins)?
   - **Defer:** Phase 5+ (plugin system not in MPPP scope)

### 10.3 Future Enhancements (YAGNI)

| Feature             | Defer Reason               | Revisit Trigger            |
| ------------------- | -------------------------- | -------------------------- |
| Prometheus exporter | No external monitoring yet | Dashboard request          |
| Real-time streaming | Not needed for local-only  | Multi-process deployment   |
| Distributed tracing | Single process assumption  | Microservices architecture |
| Metric sampling     | Volume not constrained     | > 100k events/day          |
| Schema registry     | No breaking changes yet    | First major version bump   |

---

## 11. Related Specifications

### 11.1 Upstream (Dependencies)

| Document                                                        | Relationship                          |
| --------------------------------------------------------------- | ------------------------------------- |
| [Master PRD v2.3.0-MPPP](../master/prd-master.md)               | Section 6.4 Telemetry & Observability |
| [Capture Feature PRD](../features/capture/prd-capture.md)       | Section 9 Telemetry requirements      |
| [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) | Section 7.5 Observability             |

### 11.2 Downstream (Consumers)

| Document                                                                                    | Relationship             |
| ------------------------------------------------------------------------------------------- | ------------------------ |
| [Gmail OAuth2 Tech Spec](../features/capture/spec-capture-tech.md#gmail-oauth2)             | Gmail-specific metrics   |
| [Whisper Runtime Tech Spec](../features/capture/spec-capture-tech.md#whisper-transcription) | Transcription metrics    |
| [Error Recovery Guide](../guides/guide-error-recovery.md)                                   | Retry and DLQ metrics    |
| [CLI Doctor Implementation Guide](../guides/guide-cli-doctor-implementation.md)             | Health check integration |

### 11.3 Cross-Cutting

| Document                                                  | Relationship               |
| --------------------------------------------------------- | -------------------------- |
| [TDD Applicability Guide](../guides/tdd-applicability.md) | Testing strategy framework |
| [TestKit Usage Guide](../guides/guide-testkit-usage.md)   | Test fixture patterns      |

---

## 12. Document Version

**Version:** 1.0.0
**Status:** Accepted - Production Ready
**Last Updated:** 2025-09-28

### Alignment Verification

- [x] Aligned with Master PRD v2.3.0-MPPP (Section 6.4)
- [x] Aligned with Roadmap v2.0.0-MPPP (Phase 1-2 scope)
- [x] Consolidated metrics from Gmail, Whisper, and Error Recovery specs
- [x] Defined canonical naming convention and schema
- [x] Established NDJSON format and storage contracts
- [x] TDD decision documented (MEDIUM risk, required)
- [x] Test fixture patterns defined (prevent brittleness)
- [x] Forward compatibility rules established (additive-only)
- [x] Meta-metrics for observability defined
- [x] Health check integration specified
- [x] All forward references to guides resolved and verified
- [x] Bidirectional cross-references with enhanced guides complete
- [x] Status promoted from draft to accepted

### Changelog

**v1.0.0 (2025-09-28):**

- **PROMOTED TO ACCEPTED STATUS** - Ready for implementation
- Fixed forward references to guide documents (gmail-oauth2, whisper, error-recovery)
- Verified bidirectional cross-references with all related guides
- Confirmed alignment with staging-ledger state machine documentation
- All P0 blockers resolved for production readiness

**v0.1.0 (2025-09-27):**

- Initial comprehensive tech spec
- Unified metric naming convention across all components
- Canonical schema for 50+ metrics (capture, transcription, Gmail, retry, backup)
- NDJSON file format and storage contracts
- Rotation and retention policies (daily, 30 days)
- TDD applicability decision (MEDIUM risk, required)
- Test fixtures and helper functions
- Forward compatibility and schema evolution rules
- Meta-metrics for monitoring metrics collection
- Health check integration specification

---

## 13. Sign-off Checklist

- [x] Purpose clearly defined (unified metrics contract)
- [x] Public interfaces documented (MetricsClient, query API)
- [x] Canonical naming convention established (domain.component.action.unit)
- [x] All existing metrics consolidated (Gmail, Whisper, Error Recovery)
- [x] NDJSON format and schema defined
- [x] Rotation and retention policies specified
- [x] TDD decision documented (MEDIUM risk, required)
- [x] Test fixtures prevent brittleness
- [x] Forward compatibility rules (additive-only)
- [x] Meta-metrics for observability
- [x] Health check integration
- [x] Implementation checklist provided
- [x] Open questions tracked
- [x] Related specs referenced

---

### Next Steps

1. **Review with stakeholders** (Week 1)
   - Validate metric naming convention
   - Confirm TDD scope and fixtures
   - Approve forward compatibility policy

2. **Begin implementation** (Week 1-2)
   - Implement MetricsClient core API
   - Add NDJSON serialization and file handling
   - Write unit tests for schema validation

3. **Integrate with capture pipeline** (Week 2-3)
   - Add metric emission calls across all components
   - Validate canonical fixtures in tests
   - Verify query API works in test suites

4. **Phase 2 hardening** (Week 4-6)
   - Add Gmail, Whisper, and retry metrics
   - Implement meta-metrics and health check
   - 7 days dogfooding with metrics enabled

### Success

This spec establishes a **forward-compatible, test-friendly metrics contract** that consolidates all observability needs across the ADHD Brain capture system. With canonical naming, additive-only evolution, and comprehensive test fixtures, we prevent metric churn and test brittleness while enabling operational visibility. Ship it! 🚀
