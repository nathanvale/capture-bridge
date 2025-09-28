---
title: Capture Test Spec
status: draft
owner: Nathan
version: 0.1.0
date: 2025-09-27
spec_type: test
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

⚠️ **MPPP Scope Warning:** This test spec includes extensive Phase 2+ test patterns:
- **Sections 8.1-8.3 (Retry Coordinator, Metrics, Error Recovery):** Deferred to Phase 2 (error recovery hardening)
- **Section 8.4 (Direct Export Contract):** Active for MPPP Phase 1
- **Outbox pattern tests:** Deferred to Phase 5+ per [Master PRD v2.3.0-MPPP](../../master/prd-master.md)

**MPPP Phase 1 Focus:** Test direct export idempotency, atomic writes, and crash recovery (Section 8.4 + basic integration tests).

---

# Capture — Test Specification

## 1) Objectives
- Prove durability, idempotency, atomicity

## 2) Traceability
- Map each test objective to PRD requirement or Tech Spec guarantee

## 3) Coverage Strategy
- Unit (pure logic)
- Integration (pipeline)
- Contract (file ops / adapters)
- E2E (happy path + crash/recovery)

## 4) Critical Tests (TDD Required)

**Phase 1 (MPPP):**
- Deterministic hashing (SHA-256)
- Duplicate rejection (content_hash + channel native ID)
- Direct export idempotency (synchronous export)
- Atomic temp/rename write
- Crash + auto-recovery (queryRecoverable flow)
- Direct export pattern contracts (Section 8.4)

**Phase 2+ (Deferred):**
- ⏳ Retry coordinator integration contracts (Section 8.1)
- ⏳ Metrics emission contracts (Section 8.2 - basic metrics only in Phase 1)
- ⏳ Error recovery flow contracts (Section 8.3 - DLQ, circuit breaker)
- ⏳ Conflict sibling creation (ULID collisions handled by halt in Phase 1)

## 5) Tooling
- **Vitest**: Test runner and assertion library
- **MSW (Mock Service Worker)**: HTTP mocking for Gmail API, Whisper API
- **TestKit**: Standardized test utilities (database, filesystem, fixtures)

**⚠️ TestKit Standardization Required:**
All tests MUST use TestKit patterns per [TestKit Standardization Guide](../../guides/guide-testkit-standardization.md). Custom mocks are forbidden.

## 6) TestKit Helpers

**Required TestKit Modules:**
```typescript
// Database testing
import { createMemoryUrl, applyTestPragmas } from '@adhd-brain/testkit/sqlite'

// File system testing
import { createTempDirectory, assertFileExists, createFaultInjector } from '@adhd-brain/testkit/fs'

// HTTP mocking
import { setupMSW, http, HttpResponse } from '@adhd-brain/testkit/msw'

// Fixtures
import { loadFixture } from '@adhd-brain/testkit/fixtures'

// Test helpers
import { setupStagingLedger, seedCaptures } from '@adhd-brain/testkit/helpers'
```

**Custom Assertions:**
TestKit provides domain-specific matchers for common patterns. See [TestKit Usage Guide](../../guides/guide-testkit-usage.md) for full API reference.

**When to Extend TestKit:**
If a testing pattern is reusable across packages, add it to TestKit (not as a custom mock). See Section 8.6 for extension guidelines using MSW handlers.

## 7) Non-Goals
- Visual polish snapshotting (optional)

---

## 8) Cross-Cutting Integration Contract Tests

⏳ **Phase 2+ Content Below:** Sections 8.1-8.3 describe error recovery patterns deferred to Phase 2 hardening. Phase 1 uses fail-fast with audit trail only.

---

### 8.1 Retry Coordinator Integration Tests ⏳ (Phase 2 - Deferred)

**Objective:** Verify that the capture pipeline correctly integrates with the retry coordinator for transient failure recovery.

**Contract Definition:**
- Retry coordinator is called on all transient failures (per Error Recovery Guide)
- Error classification matches Error Taxonomy (api.rate_limited, operation.timeout, etc.)
- Retry schedule follows exponential backoff policy from RETRY_MATRIX
- Max attempts respected before DLQ escalation
- Idempotency checks prevent duplicate processing on retry

**Test Cases:**

#### Test: Voice Poll Transient Failure Triggers Retry
```typescript
describe('Voice Poll Retry Integration', () => {
  it('schedules retry on transient iCloud download failure', async () => {
    // Arrange
    const audioPath = '/icloud/voice-memo-test.m4a'
    const retryCoordinatorSpy = mockRetryCoordinator()
    mockICloudDownload(audioPath).toFailOnce('network_timeout')

    // Act
    await pollVoiceFiles()

    // Assert
    expect(retryCoordinatorSpy.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'voice_poll',
        errorType: 'network.timeout',
        attemptCount: 1,
        retriable: true
      })
    )
    expect(retryCoordinatorSpy.moveToDLQ).not.toHaveBeenCalled()
  })

  it('moves to DLQ after max retry attempts (5)', async () => {
    // Arrange
    const audioPath = '/icloud/voice-memo-test.m4a'
    const retryCoordinatorSpy = mockRetryCoordinator()
    mockICloudDownload(audioPath).toFailAlways('network_timeout')

    // Act
    await pollVoiceFiles() // Attempt 1
    await retryCoordinatorSpy.executeRetries() // Attempts 2-5

    // Assert
    expect(retryCoordinatorSpy.scheduleRetry).toHaveBeenCalledTimes(5)
    expect(retryCoordinatorSpy.moveToDLQ).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'voice_poll',
        attemptCount: 5,
        errorType: 'network.timeout'
      }),
      'Max retry attempts exceeded'
    )
  })
})
```

#### Test: Email Poll API Rate Limiting Retry
```typescript
describe('Email Poll Retry Integration', () => {
  it('schedules retry with correct backoff on Gmail rate limit', async () => {
    // Arrange
    const retryCoordinatorSpy = mockRetryCoordinator()
    mockGmailAPI().toReturn429RateLimit()

    // Act
    await pollGmailMessages()

    // Assert
    expect(retryCoordinatorSpy.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'email_poll',
        errorType: 'api.rate_limited',
        attemptCount: 1
      })
    )

    // Verify exponential backoff schedule (30s, 60s, 120s, 240s, 480s)
    const backoffSchedule = retryCoordinatorSpy.getBackoffSchedule('email_poll')
    expect(backoffSchedule[0]).toBeWithinRange(21000, 39000) // 30s ± 30% jitter
    expect(backoffSchedule[1]).toBeWithinRange(42000, 78000) // 60s ± 30% jitter
    expect(backoffSchedule[4]).toBeLessThanOrEqual(900000)   // Capped at 15min
  })

  it('skips retry when circuit breaker is open', async () => {
    // Arrange
    const retryCoordinatorSpy = mockRetryCoordinator()
    const circuitBreaker = mockCircuitBreaker()
    circuitBreaker.forceOpen('api.quota_exceeded')
    mockGmailAPI().toReturn429RateLimit()

    // Act
    await pollGmailMessages()

    // Assert
    expect(retryCoordinatorSpy.scheduleRetry).not.toHaveBeenCalled()
    expect(circuitBreaker.isOpen('api.quota_exceeded')).toBe(true)
    // Should log warning but not schedule retry
  })
})
```

#### Test: Transcription Timeout Retry
```typescript
describe('Transcription Retry Integration', () => {
  it('schedules retry on Whisper timeout', async () => {
    // Arrange
    const captureId = '01TEST123'
    const audioPath = '/audio/test.m4a'
    const retryCoordinatorSpy = mockRetryCoordinator()
    mockWhisperTranscribe(audioPath).toTimeout(5000) // 5s timeout

    // Act
    await transcribeVoiceMemo(captureId, audioPath)

    // Assert
    expect(retryCoordinatorSpy.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: captureId,
        operationType: 'transcription',
        errorType: 'operation.timeout',
        attemptCount: 1,
        context: { audioPath }
      })
    )
  })

  it('moves to DLQ on permanent OOM error', async () => {
    // Arrange
    const captureId = '01TEST123'
    const audioPath = '/audio/large-file.m4a'
    const retryCoordinatorSpy = mockRetryCoordinator()
    mockWhisperTranscribe(audioPath).toThrowOOM()

    // Act
    await transcribeVoiceMemo(captureId, audioPath)

    // Assert
    expect(retryCoordinatorSpy.scheduleRetry).not.toHaveBeenCalled()
    expect(retryCoordinatorSpy.moveToDLQ).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: captureId,
        operationType: 'transcription',
        errorType: 'operation.oom',
        attemptCount: 1
      }),
      'OOM - system resource constraint'
    )
  })
})
```

#### Test: Idempotency on Retry
```typescript
describe('Retry Idempotency', () => {
  it('skips retry if capture already exists (voice dedup)', async () => {
    // Arrange
    const audioPath = '/icloud/voice-memo.m4a'
    const audioFingerprint = 'fp_abc123'
    const retryCoordinatorSpy = mockRetryCoordinator()

    // Pre-populate staging ledger
    await stagingLedger.insert({
      captureId: '01EXISTING',
      source: 'voice',
      metaJson: { audio_fp: audioFingerprint }
    })

    // Act
    await retryVoicePoll(audioPath, audioFingerprint)

    // Assert
    expect(retryCoordinatorSpy.recordSuccess).toHaveBeenCalled()
    expect(mockWhisperTranscribe).not.toHaveBeenCalled()
    // Should skip processing (idempotent)
  })

  it('skips retry if email already captured (message ID dedup)', async () => {
    // Arrange
    const messageId = 'gmail_msg_123'
    const retryCoordinatorSpy = mockRetryCoordinator()

    // Pre-populate staging ledger
    await stagingLedger.insert({
      captureId: '01EXISTING',
      source: 'email',
      channelNativeId: messageId
    })

    // Act
    await retryEmailPoll(messageId)

    // Assert
    expect(retryCoordinatorSpy.recordSuccess).toHaveBeenCalled()
    expect(mockGmailAPI.fetchMessage).not.toHaveBeenCalled()
  })
})
```

#### Test: Error Classification Correctness
```typescript
describe('Error Classification for Retry', () => {
  it('classifies errors using Error Taxonomy', async () => {
    const testCases = [
      {
        error: new Error('ERR_NETWORK_TIMEOUT'),
        expectedType: 'network.timeout',
        retriable: true
      },
      {
        error: new Error('GMAIL_QUOTA_EXCEEDED'),
        expectedType: 'api.quota_exceeded',
        retriable: true
      },
      {
        error: new Error('WHISPER_CORRUPT_AUDIO'),
        expectedType: 'validation.corrupt_input',
        retriable: false
      },
      {
        error: new Error('FILESYSTEM_PERMISSION_DENIED'),
        expectedType: 'filesystem.permission_denied',
        retriable: false
      }
    ]

    for (const { error, expectedType, retriable } of testCases) {
      const classification = errorClassifier.classify(error, {
        operation: 'test_operation'
      })

      expect(classification.errorType).toBe(expectedType)
      expect(classification.retriable).toBe(retriable)
    }
  })
})
```

---

### 8.2 Metrics Emission Contract Tests ⏳ (Phase 1: Basic Only, Phase 2: Full)

**Phase 1 Scope:** Basic counters and durations only (per Master PRD minimal set). Advanced histograms, aggregations, and correlation deferred to Phase 2.

**Objective:** Verify that all capture events emit metrics conforming to the metrics contract (NDJSON format, canonical naming).

**Contract Definition:**
- All capture lifecycle events emit metrics (poll, stage, transcribe, export)
- Metric names follow canonical naming convention: `domain.component.action.unit`
- NDJSON format compliance (single-line JSON, required fields)
- Metrics only emitted when `CAPTURE_METRICS=1`
- Metrics include correlation IDs (capture_id) for tracing

**Test Cases:**

#### Test: Voice Capture Metrics Emission
```typescript
describe('Voice Capture Metrics', () => {
  beforeEach(() => {
    process.env.CAPTURE_METRICS = '1'
    clearTestMetrics()
  })

  it('emits capture.voice.staging_ms on successful staging', async () => {
    // Arrange
    const audioPath = '/icloud/voice-memo.m4a'
    const captureId = '01TEST123'

    // Act
    await pollVoiceFiles()

    // Assert
    const metric = await queryMetrics('capture.voice.staging_ms')
    expect(metric).toMatchObject({
      metric: 'capture.voice.staging_ms',
      type: 'duration',
      value: expect.any(Number),
      tags: {
        capture_id: captureId,
        source: 'voice'
      }
    })
    expect(metric.value).toBeGreaterThan(0)
    expect(metric.value).toBeLessThan(1000) // < 1s for staging
  })

  it('emits capture.voice.poll_duration_ms per poll cycle', async () => {
    // Arrange
    mockICloudFiles(['/icloud/memo1.m4a', '/icloud/memo2.m4a'])

    // Act
    await pollVoiceFiles()

    // Assert
    const metric = await queryMetrics('capture.voice.poll_duration_ms')
    expect(metric).toMatchObject({
      metric: 'capture.voice.poll_duration_ms',
      type: 'duration',
      tags: { files_found: 2 }
    })
  })

  it('emits capture.voice.download_duration_ms for dataless file download', async () => {
    // Arrange
    const audioPath = '/icloud/dataless-memo.m4a'
    mockICloudFile(audioPath).asDataless(1024 * 1024) // 1MB

    // Act
    await pollVoiceFiles()

    // Assert
    const metric = await queryMetrics('capture.voice.download_duration_ms')
    expect(metric).toMatchObject({
      metric: 'capture.voice.download_duration_ms',
      type: 'duration',
      tags: {
        capture_id: expect.any(String),
        file_size_bytes: 1048576
      }
    })
  })
})
```

#### Test: Email Capture Metrics Emission
```typescript
describe('Email Capture Metrics', () => {
  beforeEach(() => {
    process.env.CAPTURE_METRICS = '1'
    clearTestMetrics()
  })

  it('emits capture.email.staging_ms on email staging', async () => {
    // Arrange
    const messageId = 'gmail_msg_123'
    mockGmailAPI().toReturnMessages([{ id: messageId, snippet: 'Test' }])

    // Act
    await pollGmailMessages()

    // Assert
    const metric = await queryMetrics('capture.email.staging_ms')
    expect(metric).toMatchObject({
      metric: 'capture.email.staging_ms',
      type: 'duration',
      tags: {
        capture_id: expect.any(String),
        source: 'email',
        message_id: messageId
      }
    })
  })

  it('emits capture.email.poll_duration_ms per Gmail poll', async () => {
    // Arrange
    mockGmailAPI().toReturnMessages([{ id: 'msg1' }, { id: 'msg2' }])

    // Act
    await pollGmailMessages()

    // Assert
    const metric = await queryMetrics('capture.email.poll_duration_ms')
    expect(metric).toMatchObject({
      metric: 'capture.email.poll_duration_ms',
      type: 'duration',
      tags: { messages_found: 2 }
    })
  })
})
```

#### Test: Transcription Metrics Emission
```typescript
describe('Transcription Metrics', () => {
  beforeEach(() => {
    process.env.CAPTURE_METRICS = '1'
    clearTestMetrics()
  })

  it('emits transcription.duration_ms on success', async () => {
    // Arrange
    const captureId = '01TEST123'
    const audioPath = '/audio/test.m4a'
    mockWhisperTranscribe(audioPath).toReturn('Transcription text', 8234)

    // Act
    await transcribeVoiceMemo(captureId, audioPath)

    // Assert
    const metric = await queryMetrics('transcription.duration_ms')
    expect(metric).toMatchObject({
      metric: 'transcription.duration_ms',
      type: 'duration',
      value: 8234,
      tags: {
        capture_id: captureId,
        model: 'medium',
        audio_duration_s: expect.any(Number),
        success: true
      }
    })
  })

  it('emits transcription.failure_total on failure', async () => {
    // Arrange
    const captureId = '01TEST123'
    const audioPath = '/audio/corrupt.m4a'
    mockWhisperTranscribe(audioPath).toFail('validation.corrupt_input')

    // Act
    await transcribeVoiceMemo(captureId, audioPath)

    // Assert
    const metric = await queryMetrics('transcription.failure_total')
    expect(metric).toMatchObject({
      metric: 'transcription.failure_total',
      type: 'counter',
      value: 1,
      tags: {
        error_type: 'validation.corrupt_input',
        model: 'medium'
      }
    })
  })
})
```

#### Test: Export Metrics Emission
```typescript
describe('Export Metrics', () => {
  beforeEach(() => {
    process.env.CAPTURE_METRICS = '1'
    clearTestMetrics()
  })

  it('emits export.write_ms on vault file write', async () => {
    // Arrange
    const captureId = '01TEST123'
    const vaultPath = 'inbox/01TEST123.md'

    // Act
    await exportToVault(captureId)

    // Assert
    const metric = await queryMetrics('export.write_ms')
    expect(metric).toMatchObject({
      metric: 'export.write_ms',
      type: 'duration',
      tags: {
        capture_id: captureId,
        source: 'voice',
        vault_path: vaultPath
      }
    })
    expect(metric.value).toBeLessThan(500) // < 500ms p95 SLA
  })

  it('emits capture.time_to_export_ms for end-to-end latency', async () => {
    // Arrange
    const audioPath = '/icloud/memo.m4a'

    // Act
    const startTime = Date.now()
    await pollVoiceFiles() // Poll → Stage → Transcribe → Export
    const endTime = Date.now()

    // Assert
    const metric = await queryMetrics('capture.time_to_export_ms')
    expect(metric).toMatchObject({
      metric: 'capture.time_to_export_ms',
      type: 'duration',
      tags: {
        capture_id: expect.any(String),
        source: 'voice'
      }
    })
    expect(metric.value).toBeCloseTo(endTime - startTime, -2) // ±100ms
  })
})
```

#### Test: Deduplication Metrics Emission
```typescript
describe('Deduplication Metrics', () => {
  beforeEach(() => {
    process.env.CAPTURE_METRICS = '1'
    clearTestMetrics()
  })

  it('emits dedup.hits_total on duplicate detection', async () => {
    // Arrange
    const audioPath = '/icloud/duplicate.m4a'
    const audioFingerprint = 'fp_duplicate'
    await stagingLedger.insert({
      captureId: '01EXISTING',
      source: 'voice',
      metaJson: { audio_fp: audioFingerprint }
    })

    // Act
    await pollVoiceFiles() // Attempt duplicate capture

    // Assert
    const metric = await queryMetrics('dedup.hits_total')
    expect(metric).toMatchObject({
      metric: 'dedup.hits_total',
      type: 'counter',
      value: 1,
      tags: {
        source: 'voice',
        reason: 'audio_fingerprint'
      }
    })
  })

  it('emits dedup.hits_total for email message ID dedup', async () => {
    // Arrange
    const messageId = 'gmail_duplicate'
    await stagingLedger.insert({
      captureId: '01EXISTING',
      source: 'email',
      channelNativeId: messageId
    })
    mockGmailAPI().toReturnMessages([{ id: messageId }])

    // Act
    await pollGmailMessages()

    // Assert
    const metric = await queryMetrics('dedup.hits_total')
    expect(metric).toMatchObject({
      metric: 'dedup.hits_total',
      type: 'counter',
      tags: {
        source: 'email',
        reason: 'message_id'
      }
    })
  })
})
```

#### Test: NDJSON Format Compliance
```typescript
describe('Metrics NDJSON Format', () => {
  beforeEach(() => {
    process.env.CAPTURE_METRICS = '1'
  })

  it('emits valid NDJSON (single-line JSON)', async () => {
    // Act
    await pollVoiceFiles()

    // Assert
    const metricsFile = await readMetricsFile('2025-09-28.ndjson')
    const lines = metricsFile.split('\n').filter(Boolean)

    for (const line of lines) {
      // Must be valid JSON
      const event = JSON.parse(line)

      // Must have required fields
      expect(event).toHaveProperty('timestamp')
      expect(event).toHaveProperty('metric')
      expect(event).toHaveProperty('value')
      expect(event).toHaveProperty('type')

      // Timestamp must be ISO 8601 UTC
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

      // Type must be valid
      expect(['counter', 'gauge', 'duration', 'histogram']).toContain(event.type)
    }
  })

  it('does not emit metrics when CAPTURE_METRICS=0', async () => {
    // Arrange
    process.env.CAPTURE_METRICS = '0'

    // Act
    await pollVoiceFiles()

    // Assert
    const metrics = await queryMetrics('*')
    expect(metrics).toHaveLength(0)
  })
})
```

#### Test: Canonical Metric Naming Convention
```typescript
describe('Metric Naming Convention', () => {
  it('all emitted metrics follow domain.component.action.unit pattern', async () => {
    // Act
    await runFullCapturePipeline()

    // Assert
    const metrics = await queryMetrics('*')
    const metricNames = metrics.map(m => m.metric)

    for (const name of metricNames) {
      // Must have 3-4 parts separated by dots
      const parts = name.split('.')
      expect(parts.length).toBeGreaterThanOrEqual(3)

      // Must be lowercase with underscores (no camelCase)
      expect(name).toMatch(/^[a-z][a-z0-9_.]*$/)

      // Duration metrics must end in _ms
      if (name.includes('duration') || name.includes('latency')) {
        expect(name).toMatch(/_ms$/)
      }

      // Counter metrics should end in _total
      if (name.includes('failure') || name.includes('success')) {
        expect(name).toMatch(/_total$/)
      }
    }
  })
})
```

---

### 8.3 Error Recovery Flow Contract Tests ⏳ (Phase 2 - Deferred)

**Phase 1 Scope:** Placeholder exports for failed transcriptions only. No DLQ, no circuit breaker, no retry logic.

**Objective:** Verify end-to-end error recovery flows including DLQ escalation, placeholder exports, and audit trail logging.

**Contract Definition:**
- Placeholder export triggered on DLQ for transcription failures
- Audit trail logged to `errors_log` table on all error paths
- Idempotency maintained through staging ledger checks
- Circuit breaker state persists across retries

**Test Cases:**

#### Test: DLQ Placeholder Export
```typescript
describe('DLQ Placeholder Export', () => {
  it('exports placeholder on transcription DLQ', async () => {
    // Arrange
    const captureId = '01TEST123'
    const audioPath = '/audio/unrecoverable.m4a'
    mockWhisperTranscribe(audioPath).toFailAlways('validation.corrupt_input')

    // Act
    await transcribeVoiceMemo(captureId, audioPath)

    // Assert: Moved to DLQ
    const dlqEntry = await db.query(
      `SELECT * FROM errors_log WHERE capture_id = ? AND dlq = 1`,
      [captureId]
    )
    expect(dlqEntry).toHaveLength(1)
    expect(dlqEntry[0].error_type).toBe('validation.corrupt_input')

    // Assert: Placeholder exported
    const vaultFile = await readVaultFile(`inbox/${captureId}.md`)
    expect(vaultFile).toContain('# Placeholder Export (Transcription Failed)')
    expect(vaultFile).toContain('Error: validation.corrupt_input')
    expect(vaultFile).toContain(`Audio: ${audioPath}`)

    // Assert: Audit trail logged
    const auditEntry = await db.query(
      `SELECT * FROM exports_audit WHERE capture_id = ?`,
      [captureId]
    )
    expect(auditEntry).toHaveLength(1)
    expect(auditEntry[0].export_type).toBe('placeholder')
  })

  it('does not export placeholder for non-transcription DLQ', async () => {
    // Arrange
    const messageId = 'gmail_unrecoverable'
    mockGmailAPI().toFailAlways('auth.invalid_grant')

    // Act
    await pollGmailMessages()

    // Assert: Moved to DLQ
    const dlqEntry = await db.query(
      `SELECT * FROM errors_log WHERE stage = 'email_poll' AND dlq = 1`
    )
    expect(dlqEntry.length).toBeGreaterThan(0)

    // Assert: No placeholder export (only for transcription failures)
    const vaultFiles = await listVaultFiles('inbox')
    expect(vaultFiles).toHaveLength(0)
  })
})
```

#### Test: Audit Trail Logging
```typescript
describe('Error Audit Trail', () => {
  it('logs all retry attempts to errors_log table', async () => {
    // Arrange
    const captureId = '01TEST123'
    const audioPath = '/audio/transient-failure.m4a'
    let attemptCount = 0
    mockWhisperTranscribe(audioPath).toFailTimes(3, () => {
      attemptCount++
      return 'network.timeout'
    })

    // Act
    await transcribeVoiceMemo(captureId, audioPath) // Attempt 1
    await retryCoordinator.executeRetries()          // Attempts 2-3
    await transcribeVoiceMemo(captureId, audioPath) // Success on attempt 4

    // Assert
    const auditTrail = await db.query(
      `SELECT * FROM errors_log WHERE capture_id = ? ORDER BY attempt_number`,
      [captureId]
    )

    expect(auditTrail).toHaveLength(3) // 3 failed attempts logged
    expect(auditTrail[0].attempt_number).toBe(1)
    expect(auditTrail[1].attempt_number).toBe(2)
    expect(auditTrail[2].attempt_number).toBe(3)
    expect(auditTrail.every(e => e.error_type === 'network.timeout')).toBe(true)
    expect(auditTrail.every(e => e.dlq === 0)).toBe(true) // Not in DLQ yet
  })

  it('marks errors_log entry as DLQ on final failure', async () => {
    // Arrange
    const captureId = '01TEST123'
    mockWhisperTranscribe('/audio/test.m4a').toFailAlways('network.timeout')

    // Act
    await transcribeVoiceMemo(captureId, '/audio/test.m4a')
    await retryCoordinator.executeRetries() // Exhaust all retries

    // Assert
    const dlqEntry = await db.query(
      `SELECT * FROM errors_log WHERE capture_id = ? AND dlq = 1`,
      [captureId]
    )

    expect(dlqEntry).toHaveLength(1)
    expect(dlqEntry[0].attempt_number).toBe(5) // Max attempts
    expect(dlqEntry[0].dlq_reason).toBe('Max retry attempts exceeded')
    expect(dlqEntry[0].dlq_at).toBeTruthy()
  })
})
```

#### Test: Idempotency Across Error Recovery
```typescript
describe('Idempotency in Error Recovery', () => {
  it('prevents duplicate exports after retry success', async () => {
    // Arrange
    const captureId = '01TEST123'
    mockWhisperTranscribe('/audio/test.m4a').toFailOnce('network.timeout')

    // Act
    await transcribeVoiceMemo(captureId, '/audio/test.m4a') // Fails
    await retryCoordinator.executeRetries()                  // Succeeds

    // Assert: Single export audit entry
    const auditEntries = await db.query(
      `SELECT * FROM exports_audit WHERE capture_id = ?`,
      [captureId]
    )
    expect(auditEntries).toHaveLength(1)

    // Assert: Single vault file
    const vaultFiles = await listVaultFiles('inbox', captureId)
    expect(vaultFiles).toHaveLength(1)

    // Act: Retry again (idempotent)
    await retryCoordinator.executeRetries()

    // Assert: Still single export
    const finalAudit = await db.query(
      `SELECT * FROM exports_audit WHERE capture_id = ?`,
      [captureId]
    )
    expect(finalAudit).toHaveLength(1)
  })
})
```

---

### 8.4 Direct Export Pattern Contract Tests ✅ (Phase 1 - Active)

**Phase 1 Critical:** These tests validate MPPP synchronous export guarantees.

**Objective:** Verify atomic file write pattern (temp → fsync → rename) and collision detection for direct synchronous exports.

**Contract Definition:**
- Atomic file write using temp file + fsync + rename
- Collision detection distinguishes DUPLICATE (same hash) vs CONFLICT (different hash)
- Export latency p95 < 50ms (per SLA)
- No data loss on crash between stages

**Test Cases:**

#### Test: Atomic File Write Pattern
```typescript
describe('Atomic Export Pattern', () => {
  it('writes to temp file before final rename', async () => {
    // Arrange
    const captureId = '01TEST123'
    const vaultPath = 'inbox/01TEST123.md'
    const tempPath = 'inbox/.tmp-01TEST123.md'
    const fsOperationsSpy = spyOnFileSystem()

    // Act
    await exportToVault(captureId)

    // Assert: Write order is temp → fsync → rename
    expect(fsOperationsSpy.calls).toEqual([
      { op: 'writeFile', path: tempPath },
      { op: 'fsync', path: tempPath },
      { op: 'rename', from: tempPath, to: vaultPath }
    ])
  })

  it('recovers from crash before rename', async () => {
    // Arrange
    const captureId = '01TEST123'
    const tempPath = 'inbox/.tmp-01TEST123.md'
    await writeFile(tempPath, 'temp content') // Simulate interrupted export

    // Act
    await exportToVault(captureId) // Retry export

    // Assert: Temp file cleaned up, final file written
    expect(await fileExists(tempPath)).toBe(false)
    expect(await fileExists('inbox/01TEST123.md')).toBe(true)
  })

  it('fsyncs before rename to ensure durability', async () => {
    // Arrange
    const captureId = '01TEST123'
    const fsyncSpy = spyOn(fs, 'fsync')

    // Act
    await exportToVault(captureId)

    // Assert: fsync called before rename
    expect(fsyncSpy).toHaveBeenCalledBefore(fs.rename)
  })
})
```

#### Test: Collision Detection (DUPLICATE vs CONFLICT)
```typescript
describe('Export Collision Detection', () => {
  it('detects DUPLICATE (same content hash)', async () => {
    // Arrange
    const captureId = '01TEST123'
    const contentHash = 'sha256_abc123'

    // Pre-export with same content hash
    await exportToVault(captureId)

    // Act: Attempt duplicate export
    const result = await exportToVault(captureId)

    // Assert
    expect(result.status).toBe('DUPLICATE')
    expect(result.existingPath).toBe('inbox/01TEST123.md')

    // Assert: Audit log records duplicate
    const auditEntry = await db.query(
      `SELECT * FROM exports_audit WHERE capture_id = ? AND export_status = 'DUPLICATE'`,
      [captureId]
    )
    expect(auditEntry).toHaveLength(1)
  })

  it('detects CONFLICT (different content hash)', async () => {
    // Arrange
    const captureId = '01TEST123'
    await exportToVault(captureId, 'Original content')

    // Act: Export with different content
    const result = await exportToVault(captureId, 'Modified content')

    // Assert
    expect(result.status).toBe('CONFLICT')
    expect(result.conflictPath).toMatch(/inbox\/01TEST123-\d+\.md/)

    // Assert: Both files exist
    expect(await fileExists('inbox/01TEST123.md')).toBe(true)
    expect(await fileExists(result.conflictPath)).toBe(true)

    // Assert: Audit log records conflict
    const auditEntry = await db.query(
      `SELECT * FROM exports_audit WHERE capture_id = ? AND export_status = 'CONFLICT'`,
      [captureId]
    )
    expect(auditEntry).toHaveLength(1)
  })

  it('uses ULID timestamp for conflict suffix', async () => {
    // Arrange
    const captureId = '01TEST123'
    await exportToVault(captureId, 'Content v1')

    // Act
    const result = await exportToVault(captureId, 'Content v2')

    // Assert: Conflict file has ULID suffix
    expect(result.conflictPath).toMatch(/inbox\/01TEST123-01[A-Z0-9]{24}\.md/)
  })
})
```

#### Test: Export Latency SLA
```typescript
describe('Export Performance', () => {
  it('meets p95 latency SLA (< 50ms)', async () => {
    // Arrange
    const captureIds = Array.from({ length: 100 }, (_, i) => `01TEST${i}`)
    const latencies: number[] = []

    // Act
    for (const captureId of captureIds) {
      const startTime = Date.now()
      await exportToVault(captureId)
      latencies.push(Date.now() - startTime)
    }

    // Assert: p95 < 50ms
    const p95 = calculatePercentile(latencies, 95)
    expect(p95).toBeLessThan(50)

    // Assert: Metric emitted
    const metrics = await queryMetrics('export.write_ms')
    const metricP95 = calculatePercentile(metrics.map(m => m.value), 95)
    expect(metricP95).toBeLessThan(50)
  })
})
```

---

### 8.5 TestKit Integration Helpers

**TestKit modules to use:**

```typescript
// Retry coordinator mocking
import { mockRetryCoordinator, mockCircuitBreaker } from '@adhd-brain/testkit/retry'

// Metrics test helpers
import {
  queryMetrics,
  assertMetricEmitted,
  assertMetricCount,
  clearTestMetrics,
  readMetricsFile
} from '@adhd-brain/testkit/metrics'

// Error classifier mocking
import { mockErrorClassifier } from '@adhd-brain/testkit/errors'

// File system test helpers (atomic writes)
import {
  spyOnFileSystem,
  mockFsOperations,
  assertAtomicWrite
} from '@adhd-brain/testkit/fs'

// Database test helpers (audit trail)
import { testDb, assertAuditTrail } from '@adhd-brain/testkit/db'
```

**Custom assertions to add:**

```typescript
// Assert retry coordinator was called correctly
expect.extend({
  toHaveScheduledRetry(received, expected) {
    const calls = received.scheduleRetry.mock.calls
    const match = calls.find(call =>
      call[0].errorType === expected.errorType &&
      call[0].attemptCount === expected.attemptCount
    )
    return {
      pass: !!match,
      message: () => `Expected retry to be scheduled for ${expected.errorType}`
    }
  }
})

// Assert metric was emitted with correct format
expect.extend({
  toMatchMetricContract(received) {
    const requiredFields = ['timestamp', 'metric', 'value', 'type']
    const missingFields = requiredFields.filter(f => !(f in received))

    return {
      pass: missingFields.length === 0,
      message: () => `Metric missing required fields: ${missingFields.join(', ')}`
    }
  }
})

// Assert atomic write pattern
expect.extend({
  toHaveUsedAtomicWrite(received, finalPath) {
    const ops = received.fileSystemCalls
    const hasTempWrite = ops.some(op => op.type === 'writeFile' && op.path.includes('.tmp'))
    const hasFsync = ops.some(op => op.type === 'fsync')
    const hasRename = ops.some(op => op.type === 'rename' && op.to === finalPath)

    return {
      pass: hasTempWrite && hasFsync && hasRename,
      message: () => 'Expected atomic write pattern (temp → fsync → rename)'
    }
  }
})
```

---

## 8.5 Voice File Sovereignty Tests (P0) - ADR-0001 Compliance

**Objective:** Verify that voice file sovereignty requirements from ADR-0001 are strictly enforced to prevent data corruption and sync conflicts.

**Contract Definition:**
- Voice memos never copied, moved, or renamed from Apple's managed location
- SHA-256 fingerprints used for integrity verification and deduplication
- iCloud download state properly handled (dataless files, pending downloads)
- File ownership validation before processing
- Original file paths preserved in staging ledger

### 8.5.1 iCloud Managed Location Validation

```typescript
describe('Voice File Sovereignty (P0)', () => {
  test('validates file is in iCloud managed location', async () => {
    const validPath = '~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/test.m4a'
    const invalidPath = '~/Downloads/test.m4a'

    // Valid path should be accepted
    const validResult = await captureWorker.validateFileSovereignty(validPath)
    expect(validResult.valid).toBe(true)

    // Invalid path should be rejected
    const invalidResult = await captureWorker.validateFileSovereignty(invalidPath)
    expect(invalidResult.valid).toBe(false)
    expect(invalidResult.error).toContain('File must be in iCloud managed location')
  })

  test('rejects copied/moved voice files', async () => {
    const originalPath = await createTestVoiceMemo() // Creates in proper location
    const copiedPath = '~/Desktop/copied-memo.m4a'

    // Copy file to different location
    await fs.copyFile(originalPath, copiedPath)

    // Original should pass
    const originalResult = await captureWorker.validateFileSovereignty(originalPath)
    expect(originalResult.valid).toBe(true)

    // Copy should fail
    const copiedResult = await captureWorker.validateFileSovereignty(copiedPath)
    expect(copiedResult.valid).toBe(false)
    expect(copiedResult.error).toContain('File appears to be copied from iCloud location')
  })

  test('preserves original file path in staging ledger', async () => {
    const db = new Database(createMemoryUrl())
    const stagingLedger = new StagingLedger(db)

    const voiceMemoPath = '~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/20250928-100000.m4a'

    // Capture voice memo
    const captureId = await captureWorker.captureVoice(voiceMemoPath)

    // Verify file_path in database points to iCloud location (not copied)
    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId)
    expect(capture.file_path).toBe(voiceMemoPath)

    // Verify no local copy exists
    const localCopyPath = `~/.adhd-brain/voice-cache/${captureId}.m4a`
    expect(fs.existsSync(localCopyPath)).toBe(false)
  })

  test('validates file ownership before processing', async () => {
    const voiceMemoPath = await createTestVoiceMemo()

    // Valid: user owns file
    const ownershipCheck = await captureWorker.validateFileOwnership(voiceMemoPath)
    expect(ownershipCheck.valid).toBe(true)

    // Invalid: file locked by another process
    const lockedFile = await createLockedFile()
    const lockedCheck = await captureWorker.validateFileOwnership(lockedFile)
    expect(lockedCheck.valid).toBe(false)
    expect(lockedCheck.error).toContain('File is locked by another process')
  })

  test('handles iCloud pending download status', async () => {
    const faultInjector = createFaultInjector()

    // Simulate cloud-only file (not yet downloaded)
    faultInjector.injectICloudStatus('pending-download', {
      path: '/icloud/test.m4a',
      size: 0, // Cloud placeholder
      attributes: { isCloudPlaceholder: true }
    })

    // Attempt to capture
    const result = await captureWorker.captureVoice('/icloud/test.m4a')

    // Should handle gracefully
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('FILE_PENDING_DOWNLOAD')
    expect(result.error.retriable).toBe(true)

    // Verify user-friendly message
    expect(result.error.message).toContain('File is being downloaded from iCloud')
    expect(result.error.message).toContain('Please try again in a moment')
  })
})
```

## 8.6 Audio File Validation Tests (P0)

**Objective:** Verify comprehensive audio file validation to prevent processing corrupted, unsupported, or malformed voice memos.

**Contract Definition:**
- Only M4A format with AAC codec supported
- Audio duration bounds enforced (1 second minimum, 10 minutes maximum for MPPP)
- File integrity validation (header, stream, truncation detection)
- File size bounds (10KB minimum, 100MB maximum for MPPP)
- Graceful handling of corrupted audio with user feedback

```typescript
describe('Audio File Format Validation (P0)', () => {
  test('validates M4A format and AAC codec', async () => {
    // Valid M4A file
    const validM4A = await loadFixture('audio/valid-voice-memo.m4a')
    const validResult = await audioValidator.validate(validM4A)
    expect(validResult.valid).toBe(true)
    expect(validResult.format).toBe('m4a')
    expect(validResult.codec).toBe('aac')

    // Invalid: MP3 file
    const invalidMP3 = await loadFixture('audio/invalid-mp3.mp3')
    const mp3Result = await audioValidator.validate(invalidMP3)
    expect(mp3Result.valid).toBe(false)
    expect(mp3Result.error).toContain('Only M4A format supported')

    // Invalid: Corrupted M4A header
    const corruptedM4A = await loadFixture('audio/corrupted-header.m4a')
    const corruptedResult = await audioValidator.validate(corruptedM4A)
    expect(corruptedResult.valid).toBe(false)
    expect(corruptedResult.error).toContain('File header is corrupted')
  })

  test('validates audio duration bounds', async () => {
    const validator = new AudioValidator()

    // Too short (< 1 second)
    const tooShort = await createAudioFixture({ duration: 0.5 })
    const shortResult = await validator.validate(tooShort)
    expect(shortResult.valid).toBe(false)
    expect(shortResult.error).toContain('Audio too short (minimum 1 second)')

    // Valid duration
    const valid = await createAudioFixture({ duration: 30 })
    const validResult = await validator.validate(valid)
    expect(validResult.valid).toBe(true)

    // Too long for MPPP (> 10 minutes)
    const tooLong = await createAudioFixture({ duration: 660 }) // 11 minutes
    const longResult = await validator.validate(tooLong)
    expect(longResult.valid).toBe(false)
    expect(longResult.error).toContain('Audio exceeds maximum duration (10 minutes)')

    // Silent audio
    const silent = await createAudioFixture({ duration: 30, amplitude: 0 })
    const silentResult = await validator.validate(silent)
    expect(silentResult.valid).toBe(false)
    expect(silentResult.error).toContain('Audio appears to be silent')
  })

  test('validates file integrity and readability', async () => {
    const validator = new AudioValidator()

    // Valid file
    const valid = await loadFixture('audio/valid-voice-memo.m4a')
    const validResult = await validator.validate(valid)
    expect(validResult.valid).toBe(true)
    expect(validResult.fingerprint).toMatch(/^[0-9a-f]{64}$/) // SHA-256 fingerprint

    // Corrupted audio stream
    const corrupted = await loadFixture('audio/corrupted-stream.m4a')
    const corruptedResult = await validator.validate(corrupted)
    expect(corruptedResult.valid).toBe(false)
    expect(corruptedResult.error).toContain('Audio stream is not readable')

    // Truncated file
    const truncated = await loadFixture('audio/truncated-file.m4a')
    const truncatedResult = await validator.validate(truncated)
    expect(truncatedResult.valid).toBe(false)
    expect(truncatedResult.error).toContain('File appears to be truncated')
  })

  test('validates file size bounds', async () => {
    const validator = new AudioValidator()

    // Too small (< 10KB)
    const tooSmall = await createAudioFixture({ size: 5 * 1024 }) // 5KB
    const smallResult = await validator.validate(tooSmall)
    expect(smallResult.valid).toBe(false)
    expect(smallResult.error).toContain('File too small (minimum 10KB)')

    // Valid size
    const valid = await createAudioFixture({ size: 500 * 1024 }) // 500KB
    const validResult = await validator.validate(valid)
    expect(validResult.valid).toBe(true)

    // Too large for MPPP (> 100MB)
    const tooLarge = await createAudioFixture({ size: 150 * 1024 * 1024 }) // 150MB
    const largeResult = await validator.validate(tooLarge)
    expect(largeResult.valid).toBe(false)
    expect(largeResult.error).toContain('File exceeds maximum size (100MB)')
  })

  test('handles corrupted audio gracefully', async () => {
    const db = new Database(createMemoryUrl())
    const stagingLedger = new StagingLedger(db)
    const captureWorker = new VoiceCaptureWorker(stagingLedger)

    const corruptedAudio = await loadFixture('audio/corrupted-stream.m4a')

    // Attempt capture
    const result = await captureWorker.captureVoice(corruptedAudio)

    // Should fail gracefully
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('AUDIO_CORRUPTED')
    expect(result.error.retriable).toBe(false) // Permanent failure

    // Verify DLQ routing (Phase 2)
    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(result.captureId)
    expect(capture.status).toBe('validation_failed')

    // Verify user notification
    expect(result.error.message).toContain('Audio file is corrupted')
    expect(result.error.message).toContain('Please re-record')
  })
})
```

## 8.7 iCloud Integration Tests (P1)

**Objective:** Verify robust handling of various iCloud sync states and edge cases for improved user experience.

**Contract Definition:**
- Handle iCloud sync paused gracefully with user warnings
- Detect and report iCloud quota exceeded conditions
- Validate voice memo metadata accuracy
- Provide actionable error messages for iCloud issues

```typescript
describe('iCloud Integration Tests (P1)', () => {
  test('handles iCloud sync paused', async () => {
    const faultInjector = createFaultInjector()
    faultInjector.setICloudSyncStatus('paused')

    const result = await captureWorker.captureVoice('/icloud/test.m4a')

    // Should warn but not fail
    expect(result.success).toBe(true)
    expect(result.warnings).toContainEqual({
      code: 'ICLOUD_SYNC_PAUSED',
      message: 'iCloud sync is paused - enable in System Settings'
    })
  })

  test('handles iCloud quota exceeded', async () => {
    const faultInjector = createFaultInjector()
    faultInjector.setICloudQuota({ used: 5GB, total: 5GB })

    const result = await captureWorker.captureVoice('/icloud/test.m4a')

    // Should provide actionable error
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('ICLOUD_QUOTA_EXCEEDED')
    expect(result.error.message).toContain('iCloud storage is full')
    expect(result.error.message).toContain('upgrade storage plan')
  })

  test('validates voice memo metadata', async () => {
    const voiceMemo = await loadFixture('audio/valid-voice-memo.m4a')

    const metadata = await audioValidator.extractMetadata(voiceMemo)

    // Verify creation date
    expect(metadata.createdAt).toBeInstanceOf(Date)
    expect(metadata.createdAt.getTime()).toBeLessThanOrEqual(Date.now())

    // Verify duration accuracy
    expect(metadata.duration).toBeGreaterThan(0)
    expect(Math.abs(metadata.duration - metadata.actualDuration)).toBeLessThan(0.1) // < 100ms variance
  })
})
```

---

## 9. Cross-Feature Integration Tests

### 9.1 Full Pipeline Integration Tests

These tests verify end-to-end data flow integrity from capture ingestion through to Obsidian vault export, covering P0 cross-feature risks.

#### Test Suite: Voice Capture → Export Pipeline Integration
```typescript
describe('Voice Capture → Export Pipeline Integration', () => {
  let stagingLedger: StagingLedger
  let obsidianBridge: ObsidianAtomicWriter
  let captureWorker: VoiceCaptureWorker
  let tempVault: string

  beforeEach(async () => {
    stagingLedger = createTestLedger()
    tempVault = await createTempDirectory()
    obsidianBridge = new ObsidianAtomicWriter(tempVault, stagingLedger.db)
    captureWorker = new VoiceCaptureWorker(stagingLedger)

    useFakeTimers({ now: new Date('2025-09-27T10:00:00Z') })
  })

  afterEach(async () => {
    stagingLedger.close()
    await cleanupTempDirectory(tempVault)
    vi.useRealTimers()
  })

  it('completes full voice pipeline with transcription success', async () => {
    // === STAGE 1: Voice File Discovery ===
    const audioPath = '/icloud/test-memo.m4a'
    const audioFingerprint = 'sha256_test_fingerprint'

    mockICloudFiles([{
      path: audioPath,
      size: 4096,
      audioFingerprint
    }])

    // Execute initial capture ingestion
    const ingestResult = await captureWorker.pollAndIngest()
    expect(ingestResult.captures).toHaveLength(1)

    const captureId = ingestResult.captures[0].id

    // Verify initial staging state
    const stagedCapture = await stagingLedger.getCapture(captureId)
    expect(stagedCapture?.status).toBe('staged')
    expect(stagedCapture?.content_hash).toBeNull() // Late hash binding for voice
    expect(stagedCapture?.meta_json.audio_fp).toBe(audioFingerprint)

    // === STAGE 2: Transcription Processing ===
    const transcriptText = 'Remember to review the quarterly reports and schedule the team meeting'
    const contentHash = computeContentHash(transcriptText)

    mockWhisperAPI({
      [audioPath]: {
        text: transcriptText,
        duration: 5000,
        model: 'whisper-medium'
      }
    })

    const transcriptionResult = await captureWorker.processTranscription(captureId)
    expect(transcriptionResult.success).toBe(true)

    // Verify transcribed state with late hash binding
    const transcribedCapture = await stagingLedger.getCapture(captureId)
    expect(transcribedCapture?.status).toBe('transcribed')
    expect(transcribedCapture?.content_hash).toBe(contentHash)
    expect(transcribedCapture?.raw_content).toBe(transcriptText)

    // === STAGE 3: Duplicate Check Integration ===
    const dupCheck = await stagingLedger.checkDuplicate(contentHash)
    expect(dupCheck.is_duplicate).toBe(false)

    // === STAGE 4: Export to Obsidian Vault ===
    const markdownContent = formatVoiceExport(transcribedCapture)
    const exportResult = await obsidianBridge.writeAtomic(captureId, markdownContent, tempVault)
    expect(exportResult.success).toBe(true)

    await stagingLedger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: false
    })

    // === STAGE 5: End-to-End Verification ===
    // Verify final exported state
    const exportedCapture = await stagingLedger.getCapture(captureId)
    expect(exportedCapture?.status).toBe('exported')

    // Verify vault file exists with correct content
    const vaultFilePath = path.join(tempVault, exportResult.export_path)
    expect(await fileExists(vaultFilePath)).toBe(true)

    const vaultContent = await fs.readFile(vaultFilePath, 'utf-8')
    expect(vaultContent).toContain(transcriptText)
    expect(vaultContent).toContain(`id: ${captureId}`)
    expect(vaultContent).toContain('source: voice')
    expect(vaultContent).toContain(`audio_file: ${audioPath}`)

    // Verify complete audit trail
    const auditRecords = await stagingLedger.getExportAudits(captureId)
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0]).toMatchObject({
      capture_id: captureId,
      vault_path: exportResult.export_path,
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: 0
    })

    // Verify no recoverable captures remain
    const recoverable = await stagingLedger.queryRecoverable()
    expect(recoverable).toHaveLength(0)
  })

  it('handles voice pipeline with transcription failure → placeholder export', async () => {
    // === STAGE 1: Voice Ingestion ===
    const audioPath = '/icloud/corrupted-memo.m4a'
    const audioFingerprint = 'sha256_corrupted_fingerprint'

    mockICloudFiles([{ path: audioPath, size: 1024, audioFingerprint }])

    const ingestResult = await captureWorker.pollAndIngest()
    const captureId = ingestResult.captures[0].id

    // === STAGE 2: Transcription Failure ===
    mockWhisperAPI({
      [audioPath]: {
        error: 'WHISPER_TIMEOUT',
        message: 'Transcription timeout after 30 seconds'
      }
    })

    const transcriptionResult = await captureWorker.processTranscription(captureId)
    expect(transcriptionResult.success).toBe(false)

    // Verify failed transcription state
    const failedCapture = await stagingLedger.getCapture(captureId)
    expect(failedCapture?.status).toBe('failed_transcription')
    expect(failedCapture?.content_hash).toBeNull()

    // === STAGE 3: Placeholder Export ===
    const placeholderContent = formatPlaceholderExport(failedCapture, {
      errorMessage: 'Transcription timeout after 30 seconds',
      originalPath: audioPath
    })

    const exportResult = await obsidianBridge.writeAtomic(captureId, placeholderContent, tempVault)
    expect(exportResult.success).toBe(true)

    await stagingLedger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: null,
      mode: 'placeholder',
      error_flag: true
    })

    // === STAGE 4: Placeholder Verification ===
    const placeholderCapture = await stagingLedger.getCapture(captureId)
    expect(placeholderCapture?.status).toBe('exported_placeholder')

    const vaultFilePath = path.join(tempVault, exportResult.export_path)
    const vaultContent = await fs.readFile(vaultFilePath, 'utf-8')
    expect(vaultContent).toContain('# Placeholder Export (Transcription Failed)')
    expect(vaultContent).toContain('Transcription timeout after 30 seconds')
    expect(vaultContent).toContain(audioPath)
    expect(vaultContent).toContain(`id: ${captureId}`)

    // Verify error logged
    const errorLogs = await stagingLedger.getErrorLogs()
    const transcriptionError = errorLogs.find(log =>
      log.capture_id === captureId && log.stage === 'transcription'
    )
    expect(transcriptionError).toBeDefined()
  })
})
```

#### Test Suite: Email Capture → Export Pipeline Integration
```typescript
describe('Email Capture → Export Pipeline Integration', () => {
  let stagingLedger: StagingLedger
  let obsidianBridge: ObsidianAtomicWriter
  let emailWorker: EmailCaptureWorker
  let tempVault: string

  beforeEach(async () => {
    stagingLedger = createTestLedger()
    tempVault = await createTempDirectory()
    obsidianBridge = new ObsidianAtomicWriter(tempVault, stagingLedger.db)
    emailWorker = new EmailCaptureWorker(stagingLedger)

    useFakeTimers({ now: new Date('2025-09-27T10:00:00Z') })
  })

  afterEach(async () => {
    stagingLedger.close()
    await cleanupTempDirectory(tempVault)
    vi.useRealTimers()
  })

  it('completes full email pipeline with immediate hash binding', async () => {
    // === STAGE 1: Email Discovery and Ingestion ===
    const messageId = 'gmail_msg_integration_test'
    const emailContent = 'Please review the attached design document and provide feedback by Friday'
    const contentHash = computeContentHash(emailContent)

    mockGmailAPI([{
      id: messageId,
      snippet: emailContent,
      payload: {
        headers: [
          { name: 'From', value: 'designer@company.com' },
          { name: 'Subject', value: 'Design Review Required' },
          { name: 'Date', value: 'Fri, 27 Sep 2025 14:30:00 +0000' }
        ]
      }
    }])

    const ingestResult = await emailWorker.pollAndIngest()
    expect(ingestResult.captures).toHaveLength(1)

    const captureId = ingestResult.captures[0].id

    // Verify immediate staging with hash (no late binding for email)
    const stagedCapture = await stagingLedger.getCapture(captureId)
    expect(stagedCapture?.status).toBe('staged')
    expect(stagedCapture?.content_hash).toBe(contentHash)
    expect(stagedCapture?.raw_content).toBe(emailContent)
    expect(stagedCapture?.meta_json.from).toBe('designer@company.com')

    // === STAGE 2: Duplicate Check ===
    const dupCheck = await stagingLedger.checkDuplicate(contentHash)
    expect(dupCheck.is_duplicate).toBe(false)

    // === STAGE 3: Export to Obsidian Vault ===
    const markdownContent = formatEmailExport(stagedCapture)
    const exportResult = await obsidianBridge.writeAtomic(captureId, markdownContent, tempVault)
    expect(exportResult.success).toBe(true)

    await stagingLedger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: false
    })

    // === STAGE 4: End-to-End Verification ===
    const exportedCapture = await stagingLedger.getCapture(captureId)
    expect(exportedCapture?.status).toBe('exported')

    const vaultFilePath = path.join(tempVault, exportResult.export_path)
    const vaultContent = await fs.readFile(vaultFilePath, 'utf-8')
    expect(vaultContent).toContain(emailContent)
    expect(vaultContent).toContain('From: designer@company.com')
    expect(vaultContent).toContain('Subject: Design Review Required')
    expect(vaultContent).toContain(`id: ${captureId}`)

    // Verify audit trail
    const auditRecords = await stagingLedger.getExportAudits(captureId)
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0].mode).toBe('initial')
  })

  it('handles email duplicate detection across pipeline', async () => {
    const messageId = 'gmail_duplicate_test'
    const emailContent = 'Duplicate email content for testing'
    const contentHash = computeContentHash(emailContent)

    // === FIRST EMAIL CAPTURE ===
    mockGmailAPI([{
      id: messageId,
      snippet: emailContent,
      payload: {
        headers: [
          { name: 'From', value: 'sender@company.com' },
          { name: 'Subject', value: 'Original Email' }
        ]
      }
    }])

    const firstIngest = await emailWorker.pollAndIngest()
    const firstCaptureId = firstIngest.captures[0].id

    // Export first capture
    const firstCapture = await stagingLedger.getCapture(firstCaptureId)
    const firstMarkdown = formatEmailExport(firstCapture)
    const firstExport = await obsidianBridge.writeAtomic(firstCaptureId, firstMarkdown, tempVault)

    await stagingLedger.recordExport(firstCaptureId, {
      vault_path: firstExport.export_path,
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: false
    })

    // === SECOND EMAIL CAPTURE (DUPLICATE CONTENT) ===
    const secondMessageId = 'gmail_duplicate_different_id'
    mockGmailAPI([{
      id: secondMessageId,
      snippet: emailContent, // Same content
      payload: {
        headers: [
          { name: 'From', value: 'sender@company.com' },
          { name: 'Subject', value: 'Forwarded: Original Email' } // Different subject
        ]
      }
    }])

    const secondIngest = await emailWorker.pollAndIngest()
    const secondCaptureId = secondIngest.captures[0].id

    // Check for duplicate content
    const dupCheck = await stagingLedger.checkDuplicate(contentHash)
    expect(dupCheck.is_duplicate).toBe(true)
    expect(dupCheck.existing_capture_id).toBe(firstCaptureId)

    // Record duplicate skip
    await stagingLedger.recordExport(secondCaptureId, {
      vault_path: `inbox/${secondCaptureId}.md`,
      hash_at_export: contentHash,
      mode: 'duplicate_skip',
      error_flag: false
    })

    // === VERIFICATION ===
    // Second capture should be marked as duplicate
    const secondCapture = await stagingLedger.getCapture(secondCaptureId)
    expect(secondCapture?.status).toBe('exported_duplicate')

    // Only one file should exist in vault
    const vaultFiles = await listDirectory(path.join(tempVault, 'inbox'))
    expect(vaultFiles.filter(f => f.endsWith('.md'))).toHaveLength(1)

    // Two audit records should exist
    const firstAudit = await stagingLedger.getExportAudits(firstCaptureId)
    const secondAudit = await stagingLedger.getExportAudits(secondCaptureId)
    expect(firstAudit).toHaveLength(1)
    expect(secondAudit).toHaveLength(1)
    expect(firstAudit[0].mode).toBe('initial')
    expect(secondAudit[0].mode).toBe('duplicate_skip')
  })
})
```

### 9.2 Cross-Component State Machine Integration Tests

#### Test Suite: Pipeline State Consistency
```typescript
describe('Pipeline State Consistency', () => {
  it('enforces state machine constraints across capture → staging → export', async () => {
    const stagingLedger = createTestLedger()
    const tempVault = await createTempDirectory()
    const obsidianBridge = new ObsidianAtomicWriter(tempVault, stagingLedger.db)

    // === CREATE CAPTURES IN VARIOUS STATES ===
    const captures = [
      // Voice capture - staged, ready for transcription
      {
        id: ulid(),
        source: 'voice',
        expectedState: 'staged',
        rawContent: '',
        contentHash: null,
        meta: { channel: 'voice', channel_native_id: '/path/audio1.m4a', audio_fp: 'fp1' }
      },
      // Email capture - staged, ready for export
      {
        id: ulid(),
        source: 'email',
        expectedState: 'staged',
        rawContent: 'Email ready for export',
        contentHash: computeContentHash('Email ready for export'),
        meta: { channel: 'email', channel_native_id: 'msg1' }
      }
    ]

    for (const capture of captures) {
      await stagingLedger.insertCapture({
        id: capture.id,
        source: capture.source as 'voice' | 'email',
        raw_content: capture.rawContent,
        content_hash: capture.contentHash,
        meta_json: capture.meta
      })
    }

    // === VERIFY INITIAL STATES ===
    const initialCaptures = await stagingLedger.getAllCaptures()
    expect(initialCaptures.every(c => c.status === 'staged')).toBe(true)

    // === PROCESS VOICE TRANSCRIPTION ===
    const voiceCapture = captures.find(c => c.source === 'voice')!
    const transcriptText = 'Voice transcription content'
    const voiceContentHash = computeContentHash(transcriptText)

    await stagingLedger.updateTranscription(voiceCapture.id, {
      transcript_text: transcriptText,
      content_hash: voiceContentHash
    })

    // Verify state transition
    const transcribedCapture = await stagingLedger.getCapture(voiceCapture.id)
    expect(transcribedCapture?.status).toBe('transcribed')

    // === PROCESS EXPORTS ===
    const readyForExport = await stagingLedger.queryRecoverable()
    expect(readyForExport).toHaveLength(2)

    for (const capture of readyForExport) {
      const markdownContent = formatCaptureExport(capture)
      const exportResult = await obsidianBridge.writeAtomic(capture.id, markdownContent, tempVault)
      expect(exportResult.success).toBe(true)

      await stagingLedger.recordExport(capture.id, {
        vault_path: exportResult.export_path,
        hash_at_export: capture.content_hash!,
        mode: 'initial',
        error_flag: false
      })
    }

    // === VERIFY FINAL STATES ===
    const finalCaptures = await stagingLedger.getAllCaptures()
    expect(finalCaptures.every(c => c.status === 'exported')).toBe(true)

    // === VERIFY STATE MACHINE CONSTRAINTS ===
    // Attempt invalid transition from terminal state
    for (const capture of finalCaptures) {
      await expect(
        stagingLedger.updateTranscription(capture.id, {
          transcript_text: 'invalid update',
          content_hash: computeContentHash('invalid update')
        })
      ).rejects.toThrow(InvalidStateTransitionError)
    }

    stagingLedger.close()
    await cleanupTempDirectory(tempVault)
  })

  it('maintains data integrity during concurrent multi-stage processing', async () => {
    const stagingLedger = createTestLedger()
    const tempVault = await createTempDirectory()
    const obsidianBridge = new ObsidianAtomicWriter(tempVault, stagingLedger.db)

    // Create multiple captures for concurrent processing
    const captureSpecs = Array.from({ length: 10 }, (_, i) => ({
      id: ulid(),
      source: i % 2 === 0 ? 'voice' : 'email',
      content: `Test content ${i}`,
      meta: {
        channel: i % 2 === 0 ? 'voice' : 'email',
        channel_native_id: i % 2 === 0 ? `/path/audio${i}.m4a` : `msg_${i}`
      }
    }))

    // Stage all captures concurrently
    const stagingPromises = captureSpecs.map(spec =>
      stagingLedger.insertCapture({
        id: spec.id,
        source: spec.source as 'voice' | 'email',
        raw_content: spec.source === 'email' ? spec.content : '',
        content_hash: spec.source === 'email' ? computeContentHash(spec.content) : null,
        meta_json: spec.meta
      })
    )

    const stagingResults = await Promise.allSettled(stagingPromises)
    expect(stagingResults.every(r => r.status === 'fulfilled')).toBe(true)

    // Process transcriptions for voice captures
    const voiceCaptures = captureSpecs.filter(s => s.source === 'voice')
    const transcriptionPromises = voiceCaptures.map(spec =>
      stagingLedger.updateTranscription(spec.id, {
        transcript_text: spec.content,
        content_hash: computeContentHash(spec.content)
      })
    )

    await Promise.all(transcriptionPromises)

    // Export all captures concurrently
    const allCaptures = await stagingLedger.getAllCaptures()
    const exportPromises = allCaptures.map(async (capture) => {
      const markdownContent = formatCaptureExport(capture)
      const exportResult = await obsidianBridge.writeAtomic(capture.id, markdownContent, tempVault)

      if (exportResult.success) {
        await stagingLedger.recordExport(capture.id, {
          vault_path: exportResult.export_path,
          hash_at_export: capture.content_hash!,
          mode: 'initial',
          error_flag: false
        })
      }

      return exportResult
    })

    const exportResults = await Promise.allSettled(exportPromises)
    const successfulExports = exportResults.filter(r => r.status === 'fulfilled')
    expect(successfulExports).toHaveLength(10)

    // Verify final consistency
    const finalCaptures = await stagingLedger.getAllCaptures()
    expect(finalCaptures.every(c => c.status === 'exported')).toBe(true)

    const vaultFiles = await listDirectory(path.join(tempVault, 'inbox'))
    expect(vaultFiles.filter(f => f.endsWith('.md'))).toHaveLength(10)

    stagingLedger.close()
    await cleanupTempDirectory(tempVault)
  })
})
```

### 9.3 Error Recovery Integration Tests

#### Test Suite: Cross-Component Crash Recovery
```typescript
describe('Cross-Component Crash Recovery', () => {
  it('recovers from crash during capture → staging transition', async () => {
    const dbPath = path.join(tmpdir(), 'crash-capture-staging.sqlite')

    // === PRE-CRASH: Start capture process ===
    let stagingLedger = new StagingLedger(dbPath)

    const audioPath = '/icloud/crash-test.m4a'
    const audioFingerprint = 'sha256_crash_test_fp'

    // Begin capture process (simulate crash before transcription)
    const captureId = ulid()
    await stagingLedger.insertCapture({
      id: captureId,
      source: 'voice',
      raw_content: '',
      meta_json: {
        channel: 'voice',
        channel_native_id: audioPath,
        audio_fp: audioFingerprint
      }
    })

    // Verify staged state
    const stagedCapture = await stagingLedger.getCapture(captureId)
    expect(stagedCapture?.status).toBe('staged')

    // Simulate crash
    stagingLedger.close()

    // === POST-CRASH: Recovery ===
    stagingLedger = new StagingLedger(dbPath)
    const tempVault = await createTempDirectory()
    const obsidianBridge = new ObsidianAtomicWriter(tempVault, stagingLedger.db)

    // Query recoverable captures
    const recoverable = await stagingLedger.queryRecoverable()
    expect(recoverable).toHaveLength(1)
    expect(recoverable[0].id).toBe(captureId)
    expect(recoverable[0].status).toBe('staged')

    // Complete the pipeline
    const transcriptText = 'Recovered transcription content'
    const contentHash = computeContentHash(transcriptText)

    await stagingLedger.updateTranscription(captureId, {
      transcript_text: transcriptText,
      content_hash: contentHash
    })

    const updatedCapture = await stagingLedger.getCapture(captureId)
    const markdownContent = formatVoiceExport(updatedCapture)
    const exportResult = await obsidianBridge.writeAtomic(captureId, markdownContent, tempVault)

    await stagingLedger.recordExport(captureId, {
      vault_path: exportResult.export_path,
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: false
    })

    // Verify successful recovery
    const finalCapture = await stagingLedger.getCapture(captureId)
    expect(finalCapture?.status).toBe('exported')

    const vaultFile = path.join(tempVault, exportResult.export_path)
    expect(await fileExists(vaultFile)).toBe(true)

    // Cleanup
    stagingLedger.close()
    await cleanupTempDirectory(tempVault)
    fs.unlinkSync(dbPath)
  })

  it('handles partial failure with complete rollback across components', async () => {
    const stagingLedger = createTestLedger()
    const tempVault = await createTempDirectory()
    const obsidianBridge = new ObsidianAtomicWriter(tempVault, stagingLedger.db)

    const captureId = ulid()
    const content = 'Test content for rollback scenario'
    const contentHash = computeContentHash(content)

    // Stage capture
    await stagingLedger.insertCapture({
      id: captureId,
      source: 'email',
      raw_content: content,
      content_hash: contentHash,
      meta_json: { channel: 'email', channel_native_id: 'rollback_msg' }
    })

    // Mock export failure using TestKit fault injection
    const faultInjector = createFaultInjector()
    faultInjector.injectFileSystemError('ENOSPC', {
      path: /.*\.md$/,
      operation: 'writeFile',
      message: 'Disk full'
    })

    // Attempt export (should fail)
    const captureData = await stagingLedger.getCapture(captureId)
    const markdownContent = formatEmailExport(captureData)
    const exportResult = await obsidianBridge.writeAtomic(captureId, markdownContent, tempVault)
    expect(exportResult.success).toBe(false)

    // === VERIFY COMPLETE ROLLBACK ===
    // Capture should remain in original state
    const captureAfterFailure = await stagingLedger.getCapture(captureId)
    expect(captureAfterFailure?.status).toBe('staged')

    // No audit record should exist
    const auditRecords = await stagingLedger.getExportAudits(captureId)
    expect(auditRecords).toHaveLength(0)

    // No vault file should exist
    const vaultFiles = await listDirectory(path.join(tempVault, 'inbox'))
    expect(vaultFiles.filter(f => f.endsWith('.md'))).toHaveLength(0)

    // Should still be recoverable
    const recoverable = await stagingLedger.queryRecoverable()
    expect(recoverable).toHaveLength(1)
    expect(recoverable[0].id).toBe(captureId)

    // === VERIFY RECOVERY POSSIBLE ===
    faultInjector.clear()

    const retryExport = await obsidianBridge.writeAtomic(captureId, markdownContent, tempVault)
    expect(retryExport.success).toBe(true)

    await stagingLedger.recordExport(captureId, {
      vault_path: retryExport.export_path,
      hash_at_export: contentHash,
      mode: 'initial',
      error_flag: false
    })

    const finalCapture = await stagingLedger.getCapture(captureId)
    expect(finalCapture?.status).toBe('exported')

    stagingLedger.close()
    await cleanupTempDirectory(tempVault)
  })
})
```

### 9.4 TestKit Integration for Cross-Feature Testing

**Required TestKit Helpers for Pipeline Integration:**

```typescript
// Cross-component test utilities
import {
  createTestLedger,
  mockICloudFiles,
  mockWhisperAPI,
  mockGmailAPI
} from '@adhd-brain/test-utils'

// File system integration
import {
  createTempDirectory,
  cleanupTempDirectory,
  fileExists,
  listDirectory
} from '@orchestr8/testkit/fs'

// Time control for deterministic testing
import { useFakeTimers } from '@orchestr8/testkit/time'

// Content formatting utilities
function formatVoiceExport(capture: CaptureRecord): string {
  const metadata = capture.meta_json || {}
  return `---
id: ${capture.id}
source: voice
captured_at: ${capture.created_at}
content_hash: ${capture.content_hash}
audio_file: ${metadata.channel_native_id || 'unknown'}
---

# Voice Capture

${capture.raw_content}

---

**Metadata:**
- Source: Voice Recording
- Audio File: ${metadata.channel_native_id || 'N/A'}
- Audio Fingerprint: ${metadata.audio_fp || 'N/A'}
- Captured: ${capture.created_at}`
}

function formatEmailExport(capture: CaptureRecord): string {
  const metadata = capture.meta_json || {}
  return `---
id: ${capture.id}
source: email
captured_at: ${capture.created_at}
content_hash: ${capture.content_hash}
message_id: ${metadata.channel_native_id || 'unknown'}
---

# Email: ${metadata.subject || 'No Subject'}

**From:** ${metadata.from || 'Unknown'}
**Subject:** ${metadata.subject || 'No Subject'}

${capture.raw_content}`
}

function formatPlaceholderExport(capture: CaptureRecord, options: { errorMessage: string, originalPath: string }): string {
  return `---
id: ${capture.id}
source: ${capture.source}
captured_at: ${capture.created_at}
export_type: placeholder
error: true
---

# Placeholder Export (Transcription Failed)

**Error:** ${options.errorMessage}

**Original File:** ${options.originalPath}

**Capture ID:** ${capture.id}
**Timestamp:** ${capture.created_at}

This capture could not be processed due to a transcription error. The original audio file is preserved for manual review.`
}

function formatCaptureExport(capture: CaptureRecord): string {
  if (capture.source === 'voice') {
    return formatVoiceExport(capture)
  } else if (capture.source === 'email') {
    return formatEmailExport(capture)
  }
  throw new Error(`Unsupported capture source: ${capture.source}`)
}

// Custom matchers for pipeline testing
expect.extend({
  async toCompleteFullPipeline(captureId: string, stagingLedger: StagingLedger, tempVault: string) {
    const capture = await stagingLedger.getCapture(captureId)
    const auditRecords = await stagingLedger.getExportAudits(captureId)

    if (!capture || auditRecords.length === 0) {
      return { pass: false, message: () => 'Pipeline incomplete: missing capture or audit records' }
    }

    const expectedVaultPath = path.join(tempVault, auditRecords[0].vault_path)
    const vaultFileExists = await fileExists(expectedVaultPath)

    const pipelineComplete =
      capture.status === 'exported' &&
      auditRecords[0].mode === 'initial' &&
      vaultFileExists

    return {
      pass: pipelineComplete,
      message: () => `Expected capture ${captureId} to complete full pipeline (capture → staging → export)`
    }
  }
})
```

---

### 8.6 Gap Detection & Extension Points

**When to extend TestKit:**

1. **Missing mock for external service:** Add MSW handler to `@adhd-brain/testkit/msw`
2. **Repeated assertion pattern:** Extract to custom matcher in `@adhd-brain/testkit/matchers`
3. **Complex setup:** Create fixture helper in `@adhd-brain/testkit/fixtures`

**✅ CORRECT: Adding Gmail API Mock with MSW**

```typescript
// packages/testkit/src/msw/gmail-handlers.ts
import { http, HttpResponse } from 'msw'

export function createGmailHandlers(baseUrl = 'https://gmail.googleapis.com') {
  return [
    // List messages endpoint
    http.get(`${baseUrl}/gmail/v1/users/me/messages`, ({ request }) => {
      const url = new URL(request.url)
      const maxResults = url.searchParams.get('maxResults')

      return HttpResponse.json({
        messages: [
          { id: 'msg1', threadId: 'thread1' },
          { id: 'msg2', threadId: 'thread2' }
        ],
        nextPageToken: maxResults ? 'token123' : undefined
      })
    }),

    // Get message endpoint
    http.get(`${baseUrl}/gmail/v1/users/me/messages/:messageId`, ({ params }) => {
      return HttpResponse.json({
        id: params.messageId,
        payload: {
          headers: [
            { name: 'Subject', value: 'Test Email' },
            { name: 'From', value: 'test@example.com' }
          ],
          body: { data: 'Base64EncodedContent' }
        }
      })
    }),

    // Rate limit simulation
    http.get(`${baseUrl}/gmail/v1/users/me/messages/rate-limit-test`, () => {
      return HttpResponse.json(
        { error: { message: 'Rate limit exceeded', code: 429 } },
        { status: 429 }
      )
    })
  ]
}

// Export convenient setup function
export function setupGmailAPI(handlers = createGmailHandlers()) {
  return handlers
}
```

**Usage in tests:**

```typescript
import { setupMSW } from '@adhd-brain/testkit/msw'
import { createGmailHandlers } from '@adhd-brain/testkit/msw/gmail-handlers'

describe('Gmail Capture', () => {
  // Setup MSW with Gmail handlers
  setupMSW(createGmailHandlers())

  test('fetches Gmail messages', async () => {
    const messages = await gmailClient.listMessages({ maxResults: 10 })
    expect(messages).toHaveLength(2)
    expect(messages[0].id).toBe('msg1')
  })
})
```

---

## 10. Performance Regression Detection (P1)

### 10.1 Latency Regression Gates

Performance regression gates ensure that the capture pipeline maintains P0 operational requirements under load and prevents performance degradation over time.

**Risk Classification: P1** - Performance regressions in capture operations impact user experience and system responsiveness.

```typescript
describe('Performance Regression Detection (P1)', () => {
  test('detects p95 latency regression for voice poll operations', async () => {
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Define baseline (from real measurements)
    const BASELINE_P95 = 100 // ms
    const REGRESSION_THRESHOLD = 150 // 50% regression = failure

    const latencies: number[] = []

    // Mock iCloud files for testing
    const mockFiles = Array.from({ length: 100 }, (_, i) => ({
      path: `/icloud/memo${i}.m4a`,
      size: 1024 * 50, // 50KB
      audioFingerprint: `fp_${i}`
    }))

    mockICloudFiles(mockFiles)

    // Run operation 100 times
    for (let i = 0; i < 100; i++) {
      const start = performance.now()

      await captureWorker.pollVoiceFiles()

      latencies.push(performance.now() - start)
    }

    // Calculate p95
    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    // Gate: fail if regression > 50%
    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)

    // Log metrics for tracking
    console.log(`Voice poll P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`)

    ledger.close()
  })

  test('detects p95 latency regression for email poll operations', async () => {
    const ledger = createTestLedger()
    const emailWorker = new EmailCaptureWorker(ledger)

    // Define baseline (from real measurements)
    const BASELINE_P95 = 200 // ms
    const REGRESSION_THRESHOLD = 300 // 50% regression = failure

    const latencies: number[] = []

    // Mock Gmail API responses
    const mockMessages = Array.from({ length: 50 }, (_, i) => ({
      id: `msg_${i}`,
      snippet: `Test email ${i}`,
      payload: {
        headers: [
          { name: 'From', value: `sender${i}@example.com` },
          { name: 'Subject', value: `Test Email ${i}` }
        ]
      }
    }))

    mockGmailAPI(mockMessages)

    // Run operation 100 times
    for (let i = 0; i < 100; i++) {
      const start = performance.now()

      await emailWorker.pollGmailMessages()

      latencies.push(performance.now() - start)
    }

    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)
    console.log(`Email poll P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`)

    ledger.close()
  })

  test('detects p95 latency regression for hash computation', async () => {
    const BASELINE_P95 = 5 // ms
    const REGRESSION_THRESHOLD = 7 // 40% regression = failure

    const latencies: number[] = []

    // Test content of varying sizes
    const testContents = [
      'Short content',
      'Medium length content with some additional text for testing hash computation performance',
      'Very long content '.repeat(1000) // ~17KB
    ]

    // Run operation 1000 times
    for (let i = 0; i < 1000; i++) {
      const content = testContents[i % testContents.length]
      const start = performance.now()

      computeContentHash(content)

      latencies.push(performance.now() - start)
    }

    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)]

    expect(p95).toBeLessThan(REGRESSION_THRESHOLD)
    console.log(`Hash computation P95 latency: ${p95}ms (baseline: ${BASELINE_P95}ms)`)
  })

  test('detects throughput regression for capture processing', async () => {
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Baseline: 10 captures/second
    const BASELINE_THROUGHPUT = 10
    const MIN_THROUGHPUT = 7 // 30% regression = failure

    // Mock fast transcription for throughput testing
    mockWhisperAPI({
      '*': {
        text: 'Fast transcription result',
        duration: 50, // 50ms response time
        model: 'whisper-medium'
      }
    })

    // Run for 10 seconds
    const duration = 10_000
    let operationsCompleted = 0
    const startTime = Date.now()

    while (Date.now() - startTime < duration) {
      const audioPath = `/icloud/throughput_${operationsCompleted}.m4a`
      await captureWorker.captureVoice(audioPath)
      operationsCompleted++
    }

    const actualDuration = Date.now() - startTime
    const throughput = (operationsCompleted / actualDuration) * 1000 // ops/sec

    // Gate: fail if throughput drops > 30%
    expect(throughput).toBeGreaterThan(MIN_THROUGHPUT)

    console.log(`Capture throughput: ${throughput.toFixed(1)} ops/sec (baseline: ${BASELINE_THROUGHPUT})`)

    ledger.close()
  })

  test('detects memory leak during sustained capture operations', async () => {
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Force garbage collection before test
    if (global.gc) global.gc()

    const heapBefore = process.memoryUsage().heapUsed

    // Mock lightweight transcription
    mockWhisperAPI({
      '*': {
        text: 'Memory test transcription',
        duration: 10,
        model: 'whisper-medium'
      }
    })

    // Run 1,000 operations
    for (let i = 0; i < 1_000; i++) {
      const audioPath = `/icloud/memory_test_${i}.m4a`
      await captureWorker.captureVoice(audioPath)

      // Simulate normal cleanup
      if (i % 100 === 0) {
        await ledger.queryRecoverable() // Typical query pattern
      }
    }

    // Force garbage collection after test
    if (global.gc) global.gc()

    const heapAfter = process.memoryUsage().heapUsed
    const heapGrowth = heapAfter - heapBefore

    // Gate: heap growth < 20MB for 1k operations
    expect(heapGrowth).toBeLessThan(20 * 1024 * 1024)

    console.log(`Heap growth: ${(heapGrowth / 1024 / 1024).toFixed(2)}MB for 1k operations`)

    ledger.close()
  })
})
```

---

## 11. Enhanced Cross-Feature Integration with Failure Injection (P1)

### 11.1 Full Pipeline Integration with Fault Injection

Cross-feature integration tests with failure injection ensure robust error handling and recovery across the capture pipeline and other components.

```typescript
describe('Full Pipeline Integration with Fault Injection (P1)', () => {
  let testPipeline: TestPipeline

  beforeEach(async () => {
    testPipeline = new TestPipeline()
    await testPipeline.setup()
  })

  afterEach(async () => {
    await testPipeline.cleanup()
  })

  test('handles iCloud download failure during voice capture', async () => {
    // Setup: Voice file available but download fails
    const audioPath = '/icloud/test.m4a'

    // Inject: Network timeout during iCloud download
    testPipeline.injectFault('icloud-download', 'NETWORK_TIMEOUT')

    // Attempt capture
    const result = await testPipeline.captureVoice(audioPath)

    // Verify: Capture fails with retriable error
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('ICLOUD_DOWNLOAD_FAILED')
    expect(result.error.retriable).toBe(true)

    // Verify: No partial staging ledger entry
    const captures = await testPipeline.getStagingLedger().getAllCaptures()
    expect(captures).toHaveLength(0)

    // Verify: Retry queue populated (Phase 2)
    const retries = await testPipeline.getRetryQueue().getPending()
    expect(retries).toHaveLength(1)
    expect(retries[0].operation).toBe('voice_capture')
    expect(retries[0].error_type).toBe('network.timeout')
  })

  test('handles transcription service failure during voice processing', async () => {
    // Setup: Successful audio download
    const audioPath = '/icloud/test.m4a'
    mockICloudFiles([{ path: audioPath, size: 4096, audioFingerprint: 'fp_test' }])

    // Start capture process
    const captureResult = await testPipeline.captureVoice(audioPath)
    expect(captureResult.success).toBe(true)

    // Inject: Whisper service failure
    testPipeline.injectFault('whisper-transcribe', 'SERVICE_UNAVAILABLE')

    // Attempt transcription
    const transcriptionResult = await testPipeline.processTranscription(captureResult.captureId)

    // Verify: Transcription fails gracefully
    expect(transcriptionResult.success).toBe(false)
    expect(transcriptionResult.error.code).toBe('TRANSCRIPTION_FAILED')

    // Verify: Staging ledger shows failed transcription status
    const capture = await testPipeline.getStagingLedger().getCapture(captureResult.captureId)
    expect(capture.status).toBe('transcription_failed')

    // Verify: Placeholder export created
    const exports = await testPipeline.getVault().listFiles('inbox')
    expect(exports).toHaveLength(1)

    const placeholderContent = await testPipeline.getVault().readFile(exports[0])
    expect(placeholderContent).toContain('Placeholder Export (Transcription Failed)')
    expect(placeholderContent).toContain('Whisper service unavailable')
  })

  test('handles Gmail API rate limiting during email capture', async () => {
    // Setup: Gmail API with rate limiting
    testPipeline.injectFault('gmail-api', 'RATE_LIMITED')

    // Attempt email poll
    const result = await testPipeline.pollGmailMessages()

    // Verify: Rate limit handled gracefully
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('GMAIL_RATE_LIMITED')
    expect(result.error.retriable).toBe(true)

    // Verify: Backoff applied
    expect(result.retryAfter).toBeGreaterThan(0)

    // Verify: No partial captures created
    const captures = await testPipeline.getStagingLedger().getAllCaptures()
    expect(captures).toHaveLength(0)

    // Clear fault and retry
    testPipeline.clearFaults()
    await delay(result.retryAfter)

    const retryResult = await testPipeline.pollGmailMessages()
    expect(retryResult.success).toBe(true)
  })

  test('handles staging ledger corruption during capture', async () => {
    // Setup: Valid voice file
    const audioPath = '/icloud/test.m4a'

    // Inject: Database corruption during insert
    testPipeline.injectFault('staging-insert', 'DATABASE_CORRUPT')

    // Attempt capture
    const result = await testPipeline.captureVoice(audioPath)

    // Verify: Capture fails with database error
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('STAGING_LEDGER_CORRUPT')

    // Verify: Error logged for doctor command
    const errors = await testPipeline.getErrorLog()
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'DATABASE_CORRUPT',
      severity: 'critical',
      message: expect.stringContaining('staging ledger integrity'),
      component: 'capture-worker'
    }))

    // Verify: System suggests recovery action
    expect(result.error.message).toContain('run adhd doctor --recover')
  })

  test('handles concurrent capture operations safely', async () => {
    // Setup: Multiple capture sources
    const voiceFiles = ['/icloud/memo1.m4a', '/icloud/memo2.m4a', '/icloud/memo3.m4a']
    const emailMessages = ['msg1', 'msg2', 'msg3']

    mockICloudFiles(voiceFiles.map((path, i) => ({
      path,
      size: 4096,
      audioFingerprint: `fp_${i}`
    })))

    mockGmailAPI(emailMessages.map((id, i) => ({
      id,
      snippet: `Email content ${i}`,
      payload: {
        headers: [
          { name: 'From', value: `sender${i}@example.com` },
          { name: 'Subject', value: `Test ${i}` }
        ]
      }
    })))

    // Concurrent capture operations
    const promises = [
      ...voiceFiles.map(path => testPipeline.captureVoice(path)),
      testPipeline.pollGmailMessages()
    ]

    const results = await Promise.all(promises)

    // Verify: All captures succeeded
    expect(results.every(r => r.success)).toBe(true)

    // Verify: No database lock contention
    const dbStats = await testPipeline.getDatabaseStats()
    expect(dbStats.lockTimeouts).toBe(0)
    expect(dbStats.deadlocks).toBe(0)

    // Verify: All captures properly staged
    const captures = await testPipeline.getStagingLedger().getAllCaptures()
    expect(captures).toHaveLength(6) // 3 voice + 3 email

    // Verify: No duplicate content hashes
    const contentHashes = captures.map(c => c.content_hash).filter(Boolean)
    const uniqueHashes = new Set(contentHashes)
    expect(uniqueHashes.size).toBe(contentHashes.length)
  })

  test('handles export failure after successful capture', async () => {
    // Setup: Successful voice capture
    const audioPath = '/icloud/test.m4a'
    const captureResult = await testPipeline.completeCaptureFlow(audioPath)

    // Inject: Vault write failure during export
    testPipeline.injectFault('vault-write', 'DISK_FULL')

    // Attempt export
    const exportResult = await testPipeline.attemptExport(captureResult.captureId)

    // Verify: Export fails gracefully
    expect(exportResult.success).toBe(false)
    expect(exportResult.error.code).toBe('VAULT_WRITE_FAILED')

    // Verify: Capture remains in transcribed state
    const capture = await testPipeline.getStagingLedger().getCapture(captureResult.captureId)
    expect(capture.status).toBe('transcribed')

    // Verify: No partial files in vault
    const vaultFiles = await testPipeline.getVault().listFiles()
    expect(vaultFiles.filter(f => f.includes('tmp'))).toHaveLength(0)

    // Clear fault and retry
    testPipeline.clearFaults()

    const retryResult = await testPipeline.attemptExport(captureResult.captureId)
    expect(retryResult.success).toBe(true)

    // Verify: Final successful export
    const finalCapture = await testPipeline.getStagingLedger().getCapture(captureResult.captureId)
    expect(finalCapture.status).toBe('exported')
  })
})
```

---

## 12. Load Testing Patterns (P1)

### 12.1 Sustained Load Testing

```typescript
describe('Sustained Load (P1)', () => {
  test('handles 1000 captures over 10 minutes', async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Configuration
    const totalOperations = 1000
    const duration = 10 * 60 * 1000 // 10 minutes
    const interval = duration / totalOperations

    // Mock fast transcription for load testing
    mockWhisperAPI({
      '*': {
        text: 'Load test transcription',
        duration: 25, // 25ms response time
        model: 'whisper-medium'
      }
    })

    // Run sustained load
    const results = await loadTest.runSustained({
      operation: async (iteration) => {
        const audioPath = `/icloud/load_test_${iteration}.m4a`
        const start = performance.now()

        await captureWorker.captureVoice(audioPath)

        return {
          duration: performance.now() - start,
          success: true,
          memory: process.memoryUsage().heapUsed,
          iteration
        }
      },
      count: totalOperations,
      interval
    })

    // Verify: No performance degradation over time
    const firstHalf = results.slice(0, 500).map(r => r.duration)
    const secondHalf = results.slice(500).map(r => r.duration)

    const firstHalfP95 = percentile(firstHalf, 95)
    const secondHalfP95 = percentile(secondHalf, 95)

    // Second half should not be > 50% slower than first half
    expect(secondHalfP95).toBeLessThan(firstHalfP95 * 1.5)

    // Verify: No significant memory growth
    const memoryGrowth = results[results.length - 1].memory - results[0].memory
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024) // < 50MB growth

    // Verify: All operations succeeded
    const failures = results.filter(r => !r.success)
    expect(failures).toHaveLength(0)

    // Verify: All captures properly staged
    const captures = await ledger.getAllCaptures()
    expect(captures).toHaveLength(1000)

    console.log(`Sustained capture load: ${firstHalfP95.toFixed(2)}ms → ${secondHalfP95.toFixed(2)}ms P95`)

    ledger.close()
  })

  test('maintains data integrity under sustained load', async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()

    // Run concurrent capture operations
    const concurrentPromises = Array.from({ length: 5 }, async (_, threadId) => {
      const captureWorker = new VoiceCaptureWorker(ledger)
      const threadResults = []

      for (let i = 0; i < 100; i++) {
        const operationId = `${threadId}_${i}`

        try {
          await captureWorker.captureVoice(`/icloud/thread_${operationId}.m4a`)
          threadResults.push({ operationId, success: true })
        } catch (error) {
          threadResults.push({ operationId, success: false, error: error.message })
        }
      }

      return threadResults
    })

    const allResults = await Promise.all(concurrentPromises)
    const flatResults = allResults.flat()

    // Verify: All operations succeeded
    const failures = flatResults.filter(r => !r.success)
    expect(failures).toHaveLength(0)

    // Verify: Database consistency
    const allCaptures = await ledger.getAllCaptures()
    expect(allCaptures).toHaveLength(500) // 5 threads × 100 operations

    // Verify: No duplicate IDs
    const uniqueIds = new Set(allCaptures.map(c => c.id))
    expect(uniqueIds.size).toBe(500)

    // Verify: All content hashes valid
    allCaptures.forEach(capture => {
      if (capture.content_hash) {
        expect(capture.content_hash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 format
      }
    })

    // Verify: Database integrity
    const integrityCheck = await ledger.db.get(`PRAGMA integrity_check`)
    expect(integrityCheck.integrity_check).toBe('ok')

    ledger.close()
  })
})

describe('Burst Load (P1)', () => {
  test('handles 100 captures in 10 seconds', async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Mock very fast transcription for burst testing
    mockWhisperAPI({
      '*': {
        text: 'Burst test transcription',
        duration: 10, // 10ms response time
        model: 'whisper-medium'
      }
    })

    // Run burst load - 100 operations as fast as possible over 10 seconds
    const startTime = Date.now()
    const endTime = startTime + 10_000

    const results = []
    let operationCount = 0

    while (Date.now() < endTime && operationCount < 100) {
      const audioPath = `/icloud/burst_test_${operationCount}.m4a`
      const start = performance.now()

      try {
        await captureWorker.captureVoice(audioPath)

        results.push({
          duration: performance.now() - start,
          success: true,
          operationCount
        })
      } catch (error) {
        results.push({
          duration: performance.now() - start,
          success: false,
          error: error.message,
          operationCount
        })
      }

      operationCount++
    }

    // Verify: No data loss
    const successCount = results.filter(r => r.success).length
    expect(successCount).toBe(Math.min(100, operationCount))

    // Verify: Reasonable latency under burst load
    const p95 = percentile(results.map(r => r.duration), 95)
    expect(p95).toBeLessThan(300) // Allow 3x baseline under burst (100ms * 3)

    // Verify: All captures properly staged
    const captures = await ledger.getAllCaptures()
    expect(captures).toHaveLength(successCount)

    console.log(`Burst capture load: ${results.length} operations, P95: ${p95.toFixed(2)}ms`)

    ledger.close()
  })
})

describe('Resource Exhaustion (P1)', () => {
  test('handles graceful degradation approaching memory limit', async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Set memory limit
    loadTest.setMemoryLimit(256 * 1024 * 1024) // 256MB limit

    // Mock transcription with large memory usage
    mockWhisperAPI({
      '*': {
        text: 'Large memory test result',
        duration: 50,
        model: 'whisper-medium',
        memoryUsage: 10 * 1024 * 1024 // 10MB per transcription
      }
    })

    const results = []
    let memoryPressureDetected = false

    // Create memory pressure with large operations
    for (let i = 0; i < 30; i++) {
      const memoryBefore = process.memoryUsage().heapUsed

      try {
        const audioPath = `/icloud/memory_test_${i}.m4a`
        await captureWorker.captureVoice(audioPath)

        const memoryAfter = process.memoryUsage().heapUsed
        const memoryGrowth = memoryAfter - memoryBefore

        results.push({
          success: true,
          iteration: i,
          memoryGrowth,
          totalMemory: memoryAfter
        })

        // Check for memory pressure
        if (memoryAfter > 200 * 1024 * 1024) { // Approaching limit
          memoryPressureDetected = true
        }

      } catch (error) {
        results.push({
          success: false,
          iteration: i,
          error: error.message
        })

        if (error.message.includes('memory') || error.message.includes('OOM')) {
          memoryPressureDetected = true
          break
        }
      }

      // Force garbage collection periodically
      if (i % 5 === 0 && global.gc) {
        global.gc()
      }
    }

    // Verify: System handles memory pressure appropriately
    if (memoryPressureDetected) {
      const lastSuccessful = results.filter(r => r.success).pop()
      expect(lastSuccessful.totalMemory).toBeLessThan(256 * 1024 * 1024)
    }

    // Verify: Database integrity maintained under memory pressure
    const integrityCheck = await ledger.db.get(`PRAGMA integrity_check`)
    expect(integrityCheck.integrity_check).toBe('ok')

    ledger.close()
  })

  test('handles iCloud quota exhaustion gracefully', async () => {
    const loadTest = new LoadTestHarness()
    const ledger = createTestLedger()
    const captureWorker = new VoiceCaptureWorker(ledger)

    // Simulate iCloud quota exhaustion
    loadTest.setICloudQuota({ used: 5000000000, total: 5000000000 }) // 5GB used/total

    const results = []

    // Attempt captures that would exceed quota
    for (let i = 0; i < 10; i++) {
      try {
        const audioPath = `/icloud/quota_test_${i}.m4a`
        await captureWorker.captureVoice(audioPath)

        results.push({ success: true, operation: i })
      } catch (error) {
        results.push({ success: false, operation: i, error: error.message })

        if (error.message.includes('quota') || error.message.includes('storage full')) {
          break
        }
      }
    }

    // Verify: Quota exhaustion detected and handled
    const lastResult = results[results.length - 1]
    if (!lastResult.success) {
      expect(lastResult.error).toMatch(/quota|storage full/)

      // Verify: Error provides actionable guidance
      expect(lastResult.error).toContain('upgrade storage plan')
    }

    // Verify: No partial captures from failed operations
    const captures = await ledger.getAllCaptures()
    const successCount = results.filter(r => r.success).length
    expect(captures).toHaveLength(successCount)

    ledger.close()
  })
})
```

### 12.2 Load Test Infrastructure Extensions

```typescript
class LoadTestHarness {
  private memoryLimit?: number
  private icloudQuota?: { used: number, total: number }

  setMemoryLimit(bytes: number) {
    this.memoryLimit = bytes
    // Mock memory monitoring to respect limit
  }

  setICloudQuota(quota: { used: number, total: number }) {
    this.icloudQuota = quota
    // Mock iCloud status to simulate quota
  }

  async runSustained(config: {
    operation: (iteration: number) => Promise<LoadTestResult>
    count: number
    interval: number
  }): Promise<LoadTestResult[]> {
    const results = []

    for (let i = 0; i < config.count; i++) {
      const startTime = Date.now()

      try {
        const result = await config.operation(i)
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          iteration: i,
          duration: Date.now() - startTime
        })
      }

      // Wait for next interval
      const elapsed = Date.now() - startTime
      const waitTime = Math.max(0, config.interval - elapsed)
      if (waitTime > 0) {
        await delay(waitTime)
      }
    }

    return results
  }

  async checkCaptureIntegrity(ledger: StagingLedger): Promise<{ valid: boolean, issues: string[] }> {
    const issues = []

    try {
      // Check for orphaned captures
      const allCaptures = await ledger.getAllCaptures()
      const recoverable = await ledger.queryRecoverable()

      // Verify state consistency
      for (const capture of allCaptures) {
        if (capture.source === 'voice' && capture.status === 'staged' && !capture.content_hash) {
          // Valid state: voice not yet transcribed
        } else if (capture.source === 'email' && capture.status === 'staged' && capture.content_hash) {
          // Valid state: email ready for export
        } else if (capture.status === 'transcribed' && capture.content_hash) {
          // Valid state: ready for export
        } else if (capture.status === 'exported') {
          // Valid state: completed
        } else {
          issues.push(`Invalid capture state: ${capture.id} (${capture.status})`)
        }
      }

      // Check content hash validity
      for (const capture of allCaptures.filter(c => c.content_hash)) {
        if (!/^[a-f0-9]{64}$/.test(capture.content_hash)) {
          issues.push(`Invalid content hash format: ${capture.id}`)
        }
      }

    } catch (error) {
      issues.push(`Capture integrity check failed: ${error.message}`)
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }
}

interface LoadTestResult {
  success: boolean
  duration: number
  memory?: number
  iteration?: number
  error?: string
  operationCount?: number
  memoryGrowth?: number
  totalMemory?: number
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.floor(sorted.length * (p / 100))
  return sorted[index]
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

---

**End of Enhanced Test Specification**