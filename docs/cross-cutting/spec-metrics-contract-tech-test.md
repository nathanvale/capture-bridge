---
title: Metrics/Telemetry Contract Test Spec
status: accepted
owner: Nathan
version: 1.0.0
date: 2025-09-28
spec_type: test
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
related_specs: docs/cross-cutting/spec-metrics-contract-tech.md
---

# Metrics/Telemetry Contract — Test Specification

## 1. Objectives

This test specification ensures the Metrics Contract delivers on its core promises:

- **Durability:** Metrics survive process crashes and system restarts
- **Idempotency:** Repeated emissions don't cause duplicates or corruption
- **Atomicity:** NDJSON writes are atomic (no partial lines)
- **Format Stability:** Schema evolution maintains backward compatibility
- **Contract Reliability:** Test fixtures prevent metric name churn

**Key Testing Goals:**
1. Validate NDJSON format correctness under all conditions
2. Ensure concurrent append operations are safe
3. Verify rotation and retention policies work correctly
4. Guarantee test fixtures remain stable as canonical sources

## 2. Traceability

| Test Objective | PRD/Tech Spec Requirement | Risk Level |
|---------------|---------------------------|------------|
| NDJSON format integrity | Tech Spec Section 2.3 | P0 |
| Concurrent write safety | Tech Spec Section 3.3 | P0 |
| Metric name validation | Tech Spec Section 2.1 | P0 |
| Schema evolution compatibility | Tech Spec Section 8.1 | P0 |
| Buffer overflow handling | Tech Spec Section 2.5 | P0 |
| File rotation correctness | Tech Spec Section 2.4 | P1 |
| Retention cleanup execution | Tech Spec Section 2.4 | P1 |
| Query API functionality | Tech Spec Section 1.2 | P1 |
| Meta-metrics collection | Tech Spec Section 7.2 | P2 |
| Health check integration | Tech Spec Section 7.3 | P2 |

**PRD References:**
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Section 6.4 Telemetry
- [Capture Feature PRD](../features/capture/prd-capture.md) - Section 9 Telemetry
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Section 7.5 Observability

**ADR References:**
- [ADR 0021: Local-Only NDJSON Metrics Strategy](../adr/0021-local-metrics-ndjson-strategy.md)

## 3. Coverage Strategy

### Unit Tests (Pure Logic)
- **Metric name validation** (namespace format, reserved prefixes)
- **Schema validation** (required fields, type checking)
- **NDJSON serialization/deserialization** (format correctness)
- **Tag normalization** (type coercion, invalid character handling)
- **Buffer management** (capacity limits, overflow triggers)
- **Timestamp handling** (ISO 8601 UTC format)

### Integration Tests (Pipeline + Storage)
- **End-to-end emission flow** (emit → buffer → flush → file)
- **File rotation** (midnight UTC boundary detection)
- **Retention cleanup** (old file deletion based on policy)
- **Query API** (pattern matching, time range filtering)
- **Configuration loading** (environment variable parsing)
- **Directory initialization** (creation, permissions)

### Contract Tests (External Boundaries)
- **File system operations** (append, rename, delete safety)
- **Environment variable contract** (CAPTURE_METRICS activation)
- **Date/time library contract** (rotation boundary calculations)
- **Process signal handling** (graceful shutdown on SIGTERM)

### E2E-lite Tests (Critical User Journeys)
- **Complete capture flow with metrics** (voice → staging → export)
- **Health command integration** (metrics status display)
- **Multi-day operation** (rotation + retention over time)
- **Crash recovery** (buffer persistence across restarts)

## 4. Critical Tests (TDD Required)

### P0 Risk Areas (Mandatory TDD)

#### 4.1 NDJSON Format Corruption Prevention

**Test Cases:**
```typescript
describe('NDJSON Format Integrity', () => {
  it('writes valid JSON on each line', async () => {
    // Emit multiple metrics rapidly
    await metrics.counter('test.counter', { tag: 'value' });
    await metrics.gauge('test.gauge', 42);
    await metrics.flush();

    // Verify each line is valid JSON
    const lines = await readNDJSONFile(currentFile);
    lines.forEach(line => {
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });

  it('handles special characters in metric names and tags', async () => {
    await metrics.emit({
      metric: 'test.unicode',
      value: 1,
      tags: { emoji: '🚀', quote: '"test"', newline: 'line1\nline2' },
      type: 'counter'
    });
    await metrics.flush();

    const events = await queryMetrics('test.unicode');
    expect(events[0].tags.emoji).toBe('🚀');
    expect(events[0].tags.quote).toBe('"test"');
    expect(events[0].tags.newline).toBe('line1\nline2');
  });

  it('prevents partial line writes during interruption', async () => {
    // Simulate write interruption
    const originalWrite = fs.appendFile;
    let writeCount = 0;

    fs.appendFile = vi.fn().mockImplementation(async (...args) => {
      writeCount++;
      if (writeCount === 2) {
        throw new Error('Simulated write failure');
      }
      return originalWrite(...args);
    });

    await metrics.counter('test.partial');
    await expect(metrics.flush()).rejects.toThrow();

    // Verify no partial lines exist
    const content = await fs.readFile(currentFile, 'utf8');
    const lines = content.trim().split('\n');
    lines.forEach(line => {
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });
});
```

#### 4.2 Concurrent Append Safety

**Test Cases:**
```typescript
describe('Concurrent Write Safety', () => {
  it('handles concurrent emissions from multiple sources', async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      metrics.counter(`test.concurrent.${i % 5}`, { batch: i })
    );

    await Promise.all(promises);
    await metrics.flush();

    const events = await queryMetrics('test.concurrent.*');
    expect(events).toHaveLength(50);

    // Verify no interleaved JSON (each line complete)
    const lines = await readNDJSONFile(currentFile);
    lines.forEach(line => {
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });

  it('maintains buffer integrity under concurrent access', async () => {
    // Fill buffer to near capacity concurrently
    const promises = Array.from({ length: 95 }, (_, i) =>
      metrics.gauge('test.buffer.fill', i)
    );

    await Promise.all(promises);

    // Add final events to trigger overflow
    await Promise.all([
      metrics.counter('test.overflow.1'),
      metrics.counter('test.overflow.2'),
      metrics.counter('test.overflow.3'),
      metrics.counter('test.overflow.4'),
      metrics.counter('test.overflow.5'),
    ]);

    // Verify automatic flush occurred
    const events = await queryMetrics('test.*');
    expect(events.length).toBeGreaterThanOrEqual(100);
  });
});
```

#### 4.3 Disk Space Exhaustion Handling

**Test Cases:**
```typescript
describe('Storage Limits', () => {
  it('handles disk full gracefully', async () => {
    // Mock disk full condition using TestKit fault injection
    const faultInjector = createFaultInjector();
    faultInjector.injectFileSystemError('ENOSPC', {
      operation: 'appendFile',
      message: 'no space left on device'
    });

    await metrics.counter('test.disk.full');

    // Should not throw, but log error
    await expect(metrics.flush()).resolves.not.toThrow();

    // Verify metrics collection continues after space available
    faultInjector.clear();
    await metrics.counter('test.disk.recovered');
    await expect(metrics.flush()).resolves.not.toThrow();
  });

  it('enforces file size limits', async () => {
    // Configure small file size limit for testing
    const config = { ...defaultConfig, maxFileSizeBytes: 1024 };
    const metricsClient = new MetricsClient(config);

    // Emit large volume of metrics
    for (let i = 0; i < 1000; i++) {
      await metricsClient.counter('test.volume', { batch: i });
    }

    await metricsClient.flush();

    // Verify warning logged and rotation triggered
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('File size limit exceeded')
    );
  });
});
```

#### 4.4 Invalid JSON Line Prevention

**Test Cases:**
```typescript
describe('JSON Line Validation', () => {
  it('rejects metrics with invalid field types', async () => {
    const invalidMetrics = [
      { metric: null, value: 1, type: 'counter' },
      { metric: 'test', value: 'not-a-number', type: 'counter' },
      { metric: 'test', value: 1, type: 'invalid-type' },
      { metric: 'test', value: 1, tags: 'not-an-object', type: 'counter' }
    ];

    for (const invalid of invalidMetrics) {
      expect(() => metrics.emit(invalid)).toThrow(/Invalid metric/);
    }

    // Verify no invalid events in buffer
    await metrics.flush();
    const events = await queryMetrics('test');
    expect(events).toHaveLength(0);
  });

  it('sanitizes tag values that could break JSON', async () => {
    await metrics.counter('test.sanitize', {
      backslash: 'path\\to\\file',
      quote: 'value with "quotes"',
      control: 'value with \u0000 control char'
    });

    await metrics.flush();

    const events = await queryMetrics('test.sanitize');
    expect(events[0].tags.backslash).toBe('path\\to\\file');
    expect(events[0].tags.quote).toBe('value with "quotes"');
    expect(events[0].tags.control).toBe('value with � control char');
  });
});
```

## 5. Tooling

### Test Framework Stack
- **Vitest:** Unit and integration test runner
- **TestKit:** Mock helpers and utilities
- **@vitest/coverage-v8:** Coverage reporting
- **date-fns:** Date/time testing utilities
- **fast-glob:** File pattern matching for test fixtures

### File System Testing
- **TestKit fs helpers:** Mock file operations
- **Temporary directories:** Isolated test metrics folders
- **Real file operations:** Integration tests with actual NDJSON files

### Time Testing
- **vi.useFakeTimers():** Control rotation boundaries
- **MockDate:** Simulate midnight UTC transitions
- **TestKit time helpers:** Deterministic timestamp generation

## 6. TestKit Helpers

### 6.1 Existing TestKit Modules

**File System Helpers:**
```typescript
import {
  createTempDir,
  cleanupTempDir,
  mockFileSystem
} from '@adhd-brain/testkit/fs';

// Create isolated metrics directory for each test
const tempDir = await createTempDir();
const metricsDir = path.join(tempDir, '.metrics');
```

**Time Helpers:**
```typescript
import {
  freezeTime,
  advanceTime,
  resetTime
} from '@adhd-brain/testkit/time';

// Test rotation at midnight UTC
freezeTime('2025-09-27T23:59:59.000Z');
await metrics.counter('before.rotation');
advanceTime(2000); // Cross midnight
await metrics.counter('after.rotation');
```

**Async Helpers:**
```typescript
import {
  waitForCondition,
  eventually
} from '@adhd-brain/testkit/async';

// Wait for flush completion
await waitForCondition(() => buffer.isEmpty(), { timeout: 5000 });
```

### 6.2 New TestKit Helpers (To Be Added)

**Metrics-Specific Helpers:**
```typescript
// @adhd-brain/testkit/metrics
export class MetricsTestHelper {
  private tempDir: string;
  private client: MetricsClient;

  async setup(): Promise<void> {
    this.tempDir = await createTempDir();
    this.client = new MetricsClient({
      enabled: true,
      metricsDir: path.join(this.tempDir, '.metrics'),
      bufferSize: 10, // Smaller for testing
      flushIntervalMs: 100 // Faster for testing
    });
  }

  async cleanup(): Promise<void> {
    await this.client.flush();
    await cleanupTempDir(this.tempDir);
  }

  async queryMetrics(pattern: string): Promise<MetricEvent[]> {
    await this.client.flush();
    return await this.client.query(pattern);
  }

  async assertMetricEmitted(
    name: string,
    expectedValue?: number,
    expectedTags?: MetricTags
  ): Promise<void> {
    const events = await this.queryMetrics(name);
    expect(events).toHaveLength(1);

    if (expectedValue !== undefined) {
      expect(events[0].value).toBe(expectedValue);
    }

    if (expectedTags) {
      expect(events[0].tags).toMatchObject(expectedTags);
    }
  }

  async assertMetricCount(name: string, expectedCount: number): Promise<void> {
    const events = await this.queryMetrics(name);
    expect(events).toHaveLength(expectedCount);
  }

  getCurrentFile(): string {
    const today = format(new Date(), 'yyyy-MM-dd');
    return path.join(this.tempDir, '.metrics', `${today}.ndjson`);
  }
}
```

**NDJSON Test Utilities:**
```typescript
// @adhd-brain/testkit/ndjson
export async function readNDJSONFile(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf8');
  return content.trim().split('\n').filter(Boolean);
}

export async function parseNDJSONEvents(filePath: string): Promise<MetricEvent[]> {
  const lines = await readNDJSONFile(filePath);
  return lines.map(line => JSON.parse(line));
}

export function validateNDJSONFormat(content: string): void {
  const lines = content.trim().split('\n');
  lines.forEach((line, index) => {
    try {
      JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON at line ${index + 1}: ${line}`);
    }
  });
}
```

### 6.3 Test Fixture Generators

**Canonical Metric Fixtures:**
```typescript
// @adhd-brain/testkit/metrics-fixtures
export const CANONICAL_FIXTURES = {
  VOICE_STAGING: {
    timestamp: '2025-09-27T10:00:00.000Z',
    metric: 'capture.voice.staging_ms',
    value: 87,
    tags: { capture_id: '01TEST123', source: 'voice' },
    type: 'duration'
  },

  TRANSCRIPTION_SUCCESS: {
    timestamp: '2025-09-27T10:00:05.000Z',
    metric: 'transcription.duration_ms',
    value: 8234,
    tags: {
      capture_id: '01TEST123',
      model: 'medium',
      audio_duration_s: 45,
      success: true
    },
    type: 'duration'
  },

  EXPORT_WRITE: {
    timestamp: '2025-09-27T10:00:06.000Z',
    metric: 'export.write_ms',
    value: 234,
    tags: {
      capture_id: '01TEST123',
      source: 'voice',
      vault_path: 'inbox/01TEST123.md'
    },
    type: 'duration'
  },

  DEDUP_HIT: {
    timestamp: '2025-09-27T10:00:07.000Z',
    metric: 'dedup.hits_total',
    value: 1,
    tags: {
      source: 'email',
      reason: 'message_id'
    },
    type: 'counter'
  }
} as const;

export function generateMetricEvent(
  overrides: Partial<MetricEvent> = {}
): MetricEvent {
  return {
    timestamp: '2025-09-27T10:00:00.000Z',
    metric: 'test.metric',
    value: 1,
    tags: {},
    type: 'counter',
    ...overrides
  };
}
```

## 7. Test Scenarios

### 7.1 Core Functionality Tests

#### Schema Validation
```typescript
describe('Metric Schema Validation', () => {
  it('validates metric name format', () => {
    const validNames = [
      'capture.voice.staging_ms',
      'transcription.duration_ms',
      'export.write_ms'
    ];

    const invalidNames = [
      'invalid-name',      // No namespace
      'capture.Voice.ms',  // Uppercase
      'capture..voice',    // Double dots
      'capture.voice.',    // Trailing dot
      ''                   // Empty string
    ];

    validNames.forEach(name => {
      expect(() => validateMetricName(name)).not.toThrow();
    });

    invalidNames.forEach(name => {
      expect(() => validateMetricName(name)).toThrow();
    });
  });

  it('enforces required fields', () => {
    const completeEvent = CANONICAL_FIXTURES.VOICE_STAGING;

    const requiredFields = ['timestamp', 'metric', 'value', 'type'];

    requiredFields.forEach(field => {
      const incomplete = { ...completeEvent };
      delete incomplete[field];

      expect(() => validateMetricEvent(incomplete))
        .toThrow(`Missing required field: ${field}`);
    });
  });
});
```

#### Buffer Management
```typescript
describe('Buffer Management', () => {
  it('flushes when buffer reaches capacity', async () => {
    const helper = new MetricsTestHelper();
    await helper.setup();

    // Fill buffer to capacity (default 100)
    for (let i = 0; i < 100; i++) {
      await helper.client.counter('test.buffer.fill', { index: i });
    }

    // Adding one more should trigger flush
    await helper.client.counter('test.buffer.overflow');

    // Verify flush occurred
    const events = await helper.queryMetrics('test.buffer.*');
    expect(events).toHaveLength(101);

    await helper.cleanup();
  });

  it('flushes on timer interval', async () => {
    const helper = new MetricsTestHelper();
    await helper.setup();

    await helper.client.counter('test.timer.flush');

    // Wait for flush interval (100ms in test config)
    await vi.advanceTimersByTimeAsync(150);

    const events = await helper.queryMetrics('test.timer.flush');
    expect(events).toHaveLength(1);

    await helper.cleanup();
  });
});
```

### 7.2 File Operations Tests

#### Rotation Logic
```typescript
describe('File Rotation', () => {
  it('rotates at midnight UTC boundary', async () => {
    const helper = new MetricsTestHelper();
    await helper.setup();

    // Freeze time before midnight
    freezeTime('2025-09-27T23:59:58.000Z');

    await helper.client.counter('before.midnight');
    await helper.client.flush();

    // Advance past midnight
    advanceTime(3000);

    await helper.client.counter('after.midnight');
    await helper.client.flush();

    // Verify separate files created
    const beforeFile = path.join(helper.tempDir, '.metrics', '2025-09-27.ndjson');
    const afterFile = path.join(helper.tempDir, '.metrics', '2025-09-28.ndjson');

    expect(await fs.pathExists(beforeFile)).toBe(true);
    expect(await fs.pathExists(afterFile)).toBe(true);

    const beforeEvents = await parseNDJSONEvents(beforeFile);
    const afterEvents = await parseNDJSONEvents(afterFile);

    expect(beforeEvents).toHaveLength(1);
    expect(afterEvents).toHaveLength(1);

    await helper.cleanup();
  });
});
```

#### Retention Policy
```typescript
describe('Retention Cleanup', () => {
  it('deletes files older than retention period', async () => {
    const helper = new MetricsTestHelper();
    await helper.setup();

    // Create old files
    const oldDates = [
      '2025-08-01', '2025-08-15', '2025-08-30'
    ];

    for (const date of oldDates) {
      const filePath = path.join(helper.tempDir, '.metrics', `${date}.ndjson`);
      await fs.writeFile(filePath, '{"test":"old"}\n');
    }

    // Run retention cleanup (30 day policy)
    freezeTime('2025-09-28T02:00:00.000Z');
    await helper.client.runRetentionCleanup();

    // Verify old files deleted
    for (const date of oldDates) {
      const filePath = path.join(helper.tempDir, '.metrics', `${date}.ndjson`);
      expect(await fs.pathExists(filePath)).toBe(false);
    }

    await helper.cleanup();
  });
});
```

### 7.3 Query API Tests

#### Pattern Matching
```typescript
describe('Query API', () => {
  it('matches metrics by glob pattern', async () => {
    const helper = new MetricsTestHelper();
    await helper.setup();

    await helper.client.counter('capture.voice.staging_ms');
    await helper.client.counter('capture.email.staging_ms');
    await helper.client.counter('transcription.duration_ms');

    // Test glob patterns
    const captureEvents = await helper.queryMetrics('capture.*');
    expect(captureEvents).toHaveLength(2);

    const voiceEvents = await helper.queryMetrics('capture.voice.*');
    expect(voiceEvents).toHaveLength(1);

    const allEvents = await helper.queryMetrics('*');
    expect(allEvents).toHaveLength(3);

    await helper.cleanup();
  });

  it('filters by time range', async () => {
    const helper = new MetricsTestHelper();
    await helper.setup();

    // Emit events at different times
    freezeTime('2025-09-27T10:00:00.000Z');
    await helper.client.counter('test.early');

    advanceTime(3600000); // +1 hour
    await helper.client.counter('test.late');

    await helper.client.flush();

    // Query with time range
    const timeRange = {
      start: new Date('2025-09-27T09:30:00.000Z'),
      end: new Date('2025-09-27T10:30:00.000Z')
    };

    const filteredEvents = await helper.client.query('test.*', timeRange);
    expect(filteredEvents).toHaveLength(1);
    expect(filteredEvents[0].metric).toBe('test.early');

    await helper.cleanup();
  });
});
```

### 7.4 Error Handling Tests

#### Recovery Scenarios
```typescript
describe('Error Recovery', () => {
  it('recovers from file write failures', async () => {
    const helper = new MetricsTestHelper();
    await helper.setup();

    // Mock write failure
    const originalWrite = fs.appendFile;
    let writeCount = 0;

    fs.appendFile = vi.fn().mockImplementation(async (...args) => {
      writeCount++;
      if (writeCount === 1) {
        throw new Error('Temporary write failure');
      }
      return originalWrite(...args);
    });

    await helper.client.counter('test.recovery');

    // First flush should fail, but not throw
    await expect(helper.client.flush()).resolves.not.toThrow();

    // Second flush should succeed
    await helper.client.counter('test.success');
    await helper.client.flush();

    const events = await helper.queryMetrics('test.*');
    expect(events).toHaveLength(2);

    await helper.cleanup();
  });

  it('handles graceful shutdown', async () => {
    const helper = new MetricsTestHelper();
    await helper.setup();

    await helper.client.counter('test.shutdown');

    // Simulate shutdown signal
    process.emit('SIGTERM');

    // Verify buffer was flushed
    const events = await helper.queryMetrics('test.shutdown');
    expect(events).toHaveLength(1);

    await helper.cleanup();
  });
});
```

## 8. Mock vs Real Adapter Strategy

### 8.1 Mock-First Approach

**Use Mocks For:**
- **File system operations** during unit tests (fast, deterministic)
- **Date/time functions** for rotation testing (controlled time)
- **Process signals** for shutdown testing (safety)
- **External environment variables** (isolated config)

**Mock Implementation:**
```typescript
// TestKit fs mocks
import { mockFileSystem, createFaultInjector } from '@adhd-brain/testkit/fs';

beforeEach(() => {
  mockFileSystem({
    '/tmp/test-metrics': {
      '.metrics': {}
    }
  });
});
```

### 8.2 Real Adapters When Safe

**Use Real Operations For:**
- **NDJSON parsing/serialization** (validate actual format)
- **Buffer management** (test real memory usage)
- **Metric validation** (test real schema logic)
- **Query pattern matching** (test real glob/regex)

**Safety Criteria:**
- Operations are deterministic
- No external network calls
- Fast execution (< 100ms)
- Isolated to temporary directories

### 8.3 Integration Test Strategy

**Real File Operations:**
```typescript
describe('Real File Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('writes actual NDJSON files', async () => {
    const client = new MetricsClient({
      enabled: true,
      metricsDir: path.join(tempDir, '.metrics')
    });

    await client.counter('integration.test');
    await client.flush();

    // Read actual file
    const today = format(new Date(), 'yyyy-MM-dd');
    const filePath = path.join(tempDir, '.metrics', `${today}.ndjson`);

    expect(await fs.pathExists(filePath)).toBe(true);

    const events = await parseNDJSONEvents(filePath);
    expect(events).toHaveLength(1);
    expect(events[0].metric).toBe('integration.test');
  });
});
```

## 9. Test Data Requirements

### 9.1 Canonical Test Fixtures

**Core Event Types:**
- Voice capture metrics (staging, polling, download)
- Email capture metrics (polling, staging)
- Transcription metrics (duration, success/failure)
- Export metrics (write duration, errors)
- Deduplication metrics (hits, check duration)
- Backup metrics (verification, duration)
- Retry metrics (attempts, backoff)

**Fixture Stability Rules:**
1. **Never change existing fixtures** (breaks downstream tests)
2. **Add new fixtures** for new metrics or edge cases
3. **Version fixtures** when schema evolution occurs
4. **Validate fixtures** in CI to prevent corruption

### 9.2 Test Data Generators

**Dynamic Event Generation:**
```typescript
export function generateVoiceCaptureFlow(captureId: string): MetricEvent[] {
  const baseTime = new Date('2025-09-27T10:00:00.000Z');

  return [
    {
      timestamp: baseTime.toISOString(),
      metric: 'capture.voice.poll_duration_ms',
      value: 4532,
      tags: { files_found: 1 },
      type: 'duration'
    },
    {
      timestamp: addMilliseconds(baseTime, 100).toISOString(),
      metric: 'capture.voice.staging_ms',
      value: 87,
      tags: { capture_id: captureId, source: 'voice' },
      type: 'duration'
    },
    {
      timestamp: addMilliseconds(baseTime, 8234).toISOString(),
      metric: 'transcription.duration_ms',
      value: 8134,
      tags: {
        capture_id: captureId,
        model: 'medium',
        audio_duration_s: 45,
        success: true
      },
      type: 'duration'
    },
    {
      timestamp: addMilliseconds(baseTime, 8468).toISOString(),
      metric: 'export.write_ms',
      value: 234,
      tags: {
        capture_id: captureId,
        source: 'voice',
        vault_path: `inbox/${captureId}.md`
      },
      type: 'duration'
    }
  ];
}
```

### 9.3 Edge Case Data

**Error Scenarios:**
```typescript
export const ERROR_FIXTURES = {
  DISK_FULL: new Error('ENOSPC: no space left on device'),
  PERMISSION_DENIED: new Error('EACCES: permission denied'),
  FILE_NOT_FOUND: new Error('ENOENT: no such file or directory'),
  INVALID_JSON: '{"incomplete": json',
  MALFORMED_METRIC: {
    metric: 'test',
    value: 'not-a-number',
    type: 'invalid'
  }
} as const;
```

## 10. Success Criteria

### 10.1 Quality Gates

**Unit Test Requirements:**
- ✅ 100% coverage for metric validation logic
- ✅ 100% coverage for NDJSON serialization
- ✅ 100% coverage for buffer management
- ✅ 95% coverage for core emission flow

**Integration Test Requirements:**
- ✅ All P0 scenarios pass consistently
- ✅ Concurrent write safety verified
- ✅ File rotation works across time boundaries
- ✅ Query API returns correct results

**Performance Requirements:**
- ✅ Test suite completes in < 2 minutes
- ✅ No memory leaks in long-running tests
- ✅ File operations complete in < 100ms each

### 10.2 Contract Stability

**Schema Compatibility:**
- ✅ All canonical fixtures parse correctly
- ✅ Forward compatibility with schema additions
- ✅ Backward compatibility with old fixtures
- ✅ No breaking changes to test helpers

**TestKit Integration:**
- ✅ All TestKit patterns work as documented
- ✅ New helpers integrate seamlessly
- ✅ Mock strategies are consistent across features

### 10.3 Production Readiness

**Error Handling:**
- ✅ Graceful degradation under all failure modes
- ✅ No data loss during crash scenarios
- ✅ Recovery works after system restart
- ✅ Logging provides actionable error information

**Operational Monitoring:**
- ✅ Meta-metrics collection works correctly
- ✅ Health check integration provides accurate status
- ✅ File size and retention monitoring functions

## 11. TDD Applicability Decision

### 11.1 Risk Classification

**Risk Level:** HIGH

**Rationale:**
- **Data integrity critical:** NDJSON format corruption breaks analysis tools
- **Contract stability:** Metric name changes cause widespread test failures
- **Concurrency safety:** Append operations must be atomic to prevent corruption
- **Storage reliability:** Metrics provide operational visibility into system health

### 11.2 TDD Decision: Required

**Why TDD is Mandatory:**
- **P0 risks present:** Format corruption, concurrent write safety, disk exhaustion
- **Contract testing critical:** Schema evolution must maintain compatibility
- **Test fixture stability:** Canonical metrics prevent downstream brittleness
- **Recovery scenarios:** Crash handling requires thorough validation

**Scope Under TDD:**

**Unit Tests (Required):**
- Metric name validation (namespace.component.action.unit format)
- Schema validation (required fields, type checking)
- NDJSON serialization/deserialization correctness
- Tag normalization and sanitization
- Buffer management (capacity, overflow, flush triggers)
- Timestamp handling (ISO 8601 UTC format)

**Integration Tests (Required):**
- End-to-end emission flow (emit → buffer → flush → file)
- File rotation at midnight UTC boundary
- Retention cleanup execution and old file deletion
- Query API pattern matching and filtering
- Concurrent emission safety under load
- Directory initialization and permissions

**Contract Tests (Required):**
- File system operations (append, rename, delete safety)
- Environment variable activation (CAPTURE_METRICS)
- Date/time library integration (rotation calculations)
- Process signal handling (graceful shutdown)
- Canonical fixture parsing across schema versions

**Property Tests (Recommended):**
- Metric name generator (always produces valid format)
- Tag value generator (only serializable types)
- Timestamp ordering (monotonic within flush batches)

### 11.3 Test Coverage Requirements

| Component | Coverage Target | Priority | Rationale |
|-----------|-----------------|----------|-----------|
| Metric validation | 100% | P0 | Contract breaking changes |
| NDJSON serialization | 100% | P0 | Format corruption prevention |
| Buffer management | 100% | P0 | Memory safety and overflow |
| Emission flow | 95% | P0 | Core functionality reliability |
| File operations | 90% | P1 | Storage integrity |
| Query API | 85% | P1 | Test helper correctness |
| Error handling | 80% | P1 | Recovery scenario coverage |

### 11.4 YAGNI Deferrals

**Not Testing Now:**
- **Performance benchmarks** (emission throughput, latency percentiles)
- **Stress testing** (1M+ events/day sustained load)
- **Visual testing** (health command output formatting)
- **Real-time monitoring** (WebSocket streaming, live dashboards)
- **External exporters** (Prometheus, Grafana integration)
- **Multi-process coordination** (distributed metrics collection)

**Trigger to Revisit:**

| Condition | Action |
|-----------|--------|
| Metrics volume > 100k/day | Add performance regression tests |
| External dashboard request | Add exporter compatibility tests |
| Multi-process deployment | Add file locking tests |
| User complaints about speed | Add latency monitoring tests |
| Schema breaking change needed | Add migration compatibility tests |

## 12. Related Documentation

### 12.1 Primary Dependencies
- [Metrics Contract Technical Spec](./spec-metrics-contract-tech.md) - Implementation requirements
- [ADR 0021: Local-Only NDJSON Strategy](../adr/0021-local-metrics-ndjson-strategy.md) - Architecture decisions
- [TDD Applicability Guide](../guides/guide-tdd-applicability.md) - Testing strategy framework

### 12.2 TestKit Integration
- [TestKit Usage Guide](../guides/guide-testkit-usage.md) - Practical testing patterns
- [TestKit Technical Specification](./../guides/guide-testkit-usage.md) - Testing infrastructure
- [Test Strategy Guide](../guides/guide-test-strategy.md) - Overall testing approach

### 12.3 Feature Integration
- [Voice Capture Test Spec](../features/capture/spec-capture-test.md) - Voice metrics testing
- [Staging Ledger Test Spec](../features/staging-ledger/spec-staging-test.md) - Storage metrics testing
- [Obsidian Bridge Test Spec](../features/obsidian-bridge/spec-obsidian-test.md) - Export metrics testing

## 13. Implementation Plan

### 13.1 Phase 1: Core Infrastructure (Week 1)
- [ ] Set up MetricsTestHelper in TestKit
- [ ] Implement NDJSON validation utilities
- [ ] Create canonical fixture generators
- [ ] Write schema validation unit tests
- [ ] Write buffer management unit tests

### 13.2 Phase 2: File Operations (Week 2)
- [ ] Write rotation logic integration tests
- [ ] Write retention cleanup integration tests
- [ ] Write concurrent write safety tests
- [ ] Write error recovery scenario tests
- [ ] Write query API functionality tests

### 13.3 Phase 3: Contract Validation (Week 3)
- [ ] Write schema evolution compatibility tests
- [ ] Write canonical fixture stability tests
- [ ] Write TestKit helper integration tests
- [ ] Write health check integration tests
- [ ] Write performance regression tests

### 13.4 Phase 4: Production Hardening (Week 4)
- [ ] Write crash recovery tests
- [ ] Write disk exhaustion handling tests
- [ ] Write graceful shutdown tests
- [ ] Write meta-metrics collection tests
- [ ] Final end-to-end validation

---

## Document Status

**Version:** 1.0.0
**Status:** Accepted - Ready for Implementation
**Last Updated:** 2025-09-28

### Alignment Verification

- [x] Aligned with Metrics Contract Tech Spec v1.0.0
- [x] Aligned with ADR 0021 (Local-Only NDJSON Strategy)
- [x] Aligned with TDD Applicability Guide v1.1.0
- [x] Test spec template format followed
- [x] P0 risks have mandatory TDD coverage
- [x] TestKit integration patterns defined
- [x] Mock vs real adapter strategy documented
- [x] Success criteria and quality gates established
- [x] Implementation plan with clear phases

### Test Coverage Summary

This specification ensures comprehensive testing of the Metrics Contract with:

- **21 P0 test scenarios** covering format integrity, concurrent safety, and storage reliability
- **15 integration test patterns** for file operations, rotation, and query functionality
- **8 canonical fixtures** preventing metric name churn across the codebase
- **5 new TestKit helpers** providing metrics-specific testing utilities
- **Mock-first strategy** for fast, deterministic unit tests
- **Real adapter integration** for format validation and file operations
- **Schema evolution testing** ensuring forward/backward compatibility
- **Error recovery scenarios** validating resilience under failure conditions

The test suite will provide confidence that metrics collection remains reliable, performant, and compatible as the system evolves.

**Next Steps:** Begin Phase 1 implementation with MetricsTestHelper and core validation tests.