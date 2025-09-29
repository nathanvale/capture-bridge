---
title: Error Recovery & Retry Orchestration Guide
status: approved
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Error Recovery & Retry Orchestration Guide

## Purpose

This guide helps developers implement consistent error handling and retry logic across all capture channels (voice, email) and processing stages (polling, transcription, export) in the ADHD Brain system.

**Target Audience:** Developers implementing capture workers, transcription processors, and export operations.

## When to Use This Guide

Use this guide when:

- Implementing new capture channels or processing stages
- Handling transient errors that should be retried
- Classifying errors as permanent vs transient
- Configuring retry policies for new error types
- Debugging retry behavior or DLQ (Dead Letter Queue) issues
- Implementing circuit breaker patterns for external API calls

**Links to Related Features:**

- [Capture Feature PRD](../features/capture/prd-capture.md)
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md)
- [Gmail OAuth2 Technical Spec](../features/capture/spec-capture-tech.md#gmail-oauth2)
- [Whisper Runtime Technical Spec](../features/capture/spec-capture-tech.md#whisper-transcription)

**Related Debugging Guides:**

- [Voice Capture Debugging Guide](./guide-voice-capture-debugging.md) - Comprehensive troubleshooting for APFS dataless files, iCloud sync issues, and voice memo metadata problems

## Prerequisites

**Required Knowledge:**

- Understanding of TypeScript async/await patterns
- Familiarity with exponential backoff concepts
- Basic understanding of circuit breaker patterns
- Knowledge of the staging ledger deduplication mechanism

**Required Setup:**

- Staging ledger database initialized (4 tables: captures, exports_audit, errors_log, sync_state)
- Error logging configured in your capture/processing component
- Access to the unified error taxonomy (ErrorType enum)

## Quick Reference

**TL;DR - Key Rules:**

1. **Always classify errors** using `ErrorClassifier.classify()` before retry
2. **Check idempotency** via staging ledger before retry execution
3. **Respect max attempts** from the retry matrix (never exceed)
4. **Use circuit breakers** for external APIs (Gmail, Whisper)
5. **Move to DLQ** when max attempts reached or permanent error detected

**Decision Tree:**

```text
Operation Fails
    ↓
Classify Error (transient vs permanent)
    ↓
Permanent? → Move to DLQ
    ↓
Max Attempts Reached? → Move to DLQ
    ↓
Circuit Breaker Open? → Wait for half-open state
    ↓
Already Processed? (check staging ledger) → Skip retry (success)
    ↓
Calculate Backoff (exponential + jitter)
    ↓
Schedule Retry → Execute Operation
```

## Step-by-Step Instructions

### Step 1: Classify the Error

Use the `ErrorClassifier` to determine if the error is retriable:

```typescript
import { ErrorClassifier, ErrorType, OperationType } from '@adhd-brain/foundation';

const errorClassifier = new ErrorClassifier();

try {
  // Your operation that might fail
  await pollGmailMessages();
} catch (error) {
  // Classify the error
  const classification = errorClassifier.classify(error, {
    operation: 'email_poll',
    captureId: captureId,
    timestamp: new Date(),
    metadata: { cursor: lastCursor }
  });

  console.log(`Error classified as: ${classification.errorType}`);
  console.log(`Retriable: ${classification.retriable}`);
}
```

**Expected Outcome:** Error is mapped to a specific `ErrorType` with retriability determined.

### Step 2: Check Retry Eligibility

Verify the operation hasn't exceeded max retry attempts:

```typescript
import { RETRY_MATRIX } from '@adhd-brain/core';

const policy = RETRY_MATRIX[classification.errorType];

if (operation.attemptCount >= policy.maxAttempts) {
  await moveToDLQ(operation, `Max attempts (${policy.maxAttempts}) exceeded`);
  return;
}

if (!classification.retriable) {
  await moveToDLQ(operation, 'Permanent error - not retriable');
  return;
}
```

## P0 Technical Details: Retry Matrix, Backoff Policy & Escalation

### Comprehensive Retry Matrix

```typescript
enum ErrorType {
  // Authentication errors (permanent)
  AUTH_INVALID_GRANT = 'auth.invalid_grant',
  AUTH_INVALID_CLIENT = 'auth.invalid_client',

  // API rate limiting (transient)
  API_RATE_LIMITED = 'api.rate_limited',
  API_QUOTA_EXCEEDED = 'api.quota_exceeded',

  // Network errors (transient)
  NETWORK_TIMEOUT = 'network.timeout',
  NETWORK_CONNECTION_REFUSED = 'network.connection_refused',
  NETWORK_DNS_FAILURE = 'network.dns_failure',

  // File system errors (mixed)
  FILE_NOT_FOUND = 'file.not_found',               // Permanent
  FILE_PERMISSION_DENIED = 'file.permission_denied', // Transient
  FILE_DATALESS_ICLOUD = 'file.dataless_icloud',   // Transient (APFS)

  // Transcription errors (mixed)
  TRANSCRIPTION_TIMEOUT = 'transcription.timeout', // Transient
  TRANSCRIPTION_OOM = 'transcription.oom',         // Permanent
  TRANSCRIPTION_CORRUPT_AUDIO = 'transcription.corrupt_audio', // Permanent

  // Export errors (transient)
  EXPORT_VAULT_UNREACHABLE = 'export.vault_unreachable',
  EXPORT_DISK_FULL = 'export.disk_full',

  // Cursor/sync errors (recoverable)
  CURSOR_INVALID = 'cursor.invalid',
  CURSOR_TOO_OLD = 'cursor.too_old',

  // Unknown
  UNKNOWN = 'unknown',
}

interface RetryPolicy {
  errorType: ErrorType;
  retriable: boolean;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterPercent: number;
  circuitBreakerThreshold: number;
  escalationAction: EscalationAction;
}

type EscalationAction =
  | 'log_only'              // Log to errors_log, no user action
  | 'export_placeholder'    // Export placeholder, mark permanent
  | 're_bootstrap_cursor'   // Reset cursor, continue polling
  | 'require_reauth'        // User must re-authenticate
  | 'circuit_breaker'       // Open circuit breaker, pause operations
  | 'alert_ops';            // Critical system error, notify ops

const RETRY_MATRIX: Record<ErrorType, RetryPolicy> = {
  // === Permanent Errors (no retry) ===
  [ErrorType.AUTH_INVALID_GRANT]: {
    errorType: ErrorType.AUTH_INVALID_GRANT,
    retriable: false,
    maxAttempts: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitterPercent: 0,
    circuitBreakerThreshold: 3,
    escalationAction: 'require_reauth',
  },
  [ErrorType.FILE_NOT_FOUND]: {
    errorType: ErrorType.FILE_NOT_FOUND,
    retriable: false,
    maxAttempts: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitterPercent: 0,
    circuitBreakerThreshold: 0, // No circuit breaker for file errors
    escalationAction: 'export_placeholder',
  },
  [ErrorType.TRANSCRIPTION_CORRUPT_AUDIO]: {
    errorType: ErrorType.TRANSCRIPTION_CORRUPT_AUDIO,
    retriable: false,
    maxAttempts: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitterPercent: 0,
    circuitBreakerThreshold: 0,
    escalationAction: 'export_placeholder',
  },
  [ErrorType.TRANSCRIPTION_OOM]: {
    errorType: ErrorType.TRANSCRIPTION_OOM,
    retriable: false,
    maxAttempts: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitterPercent: 0,
    circuitBreakerThreshold: 0,
    escalationAction: 'export_placeholder',
  },

  // === Rate Limiting (aggressive backoff) ===
  [ErrorType.API_RATE_LIMITED]: {
    errorType: ErrorType.API_RATE_LIMITED,
    retriable: true,
    maxAttempts: 5,
    baseDelayMs: 30_000,      // 30 seconds
    maxDelayMs: 1_800_000,    // 30 minutes
    backoffMultiplier: 2,
    jitterPercent: 30,
    circuitBreakerThreshold: 3,
    escalationAction: 'circuit_breaker',
  },
  [ErrorType.API_QUOTA_EXCEEDED]: {
    errorType: ErrorType.API_QUOTA_EXCEEDED,
    retriable: true,
    maxAttempts: 3,
    baseDelayMs: 3_600_000,   // 1 hour
    maxDelayMs: 14_400_000,   // 4 hours
    backoffMultiplier: 2,
    jitterPercent: 20,
    circuitBreakerThreshold: 2,
    escalationAction: 'circuit_breaker',
  },

  // === File System (APFS-specific) ===
  [ErrorType.FILE_DATALESS_ICLOUD]: {
    errorType: ErrorType.FILE_DATALESS_ICLOUD,
    retriable: true,
    maxAttempts: 10,          // Give iCloud time to download
    baseDelayMs: 5_000,       // 5 seconds
    maxDelayMs: 300_000,      // 5 minutes
    backoffMultiplier: 1.5,
    jitterPercent: 20,
    circuitBreakerThreshold: 0,
    escalationAction: 'log_only',
  },
  [ErrorType.FILE_PERMISSION_DENIED]: {
    errorType: ErrorType.FILE_PERMISSION_DENIED,
    retriable: true,
    maxAttempts: 3,
    baseDelayMs: 10_000,      // 10 seconds
    maxDelayMs: 60_000,       // 1 minute
    backoffMultiplier: 2,
    jitterPercent: 30,
    circuitBreakerThreshold: 0,
    escalationAction: 'alert_ops',
  },

  // === Transcription (resource-constrained) ===
  [ErrorType.TRANSCRIPTION_TIMEOUT]: {
    errorType: ErrorType.TRANSCRIPTION_TIMEOUT,
    retriable: true,
    maxAttempts: 2,
    baseDelayMs: 60_000,      // 1 minute
    maxDelayMs: 300_000,      // 5 minutes
    backoffMultiplier: 3,
    jitterPercent: 30,
    circuitBreakerThreshold: 0,
    escalationAction: 'export_placeholder',
  },

  // === Network (transient) ===
  [ErrorType.NETWORK_TIMEOUT]: {
    errorType: ErrorType.NETWORK_TIMEOUT,
    retriable: true,
    maxAttempts: 3,
    baseDelayMs: 5_000,       // 5 seconds
    maxDelayMs: 60_000,       // 1 minute
    backoffMultiplier: 2,
    jitterPercent: 30,
    circuitBreakerThreshold: 5,
    escalationAction: 'circuit_breaker',
  },

  // === Cursor (auto-recovery) ===
  [ErrorType.CURSOR_INVALID]: {
    errorType: ErrorType.CURSOR_INVALID,
    retriable: true,
    maxAttempts: 1,
    baseDelayMs: 0,           // Immediate
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitterPercent: 0,
    circuitBreakerThreshold: 0,
    escalationAction: 're_bootstrap_cursor',
  },

  // === Export errors ===
  [ErrorType.EXPORT_VAULT_UNREACHABLE]: {
    errorType: ErrorType.EXPORT_VAULT_UNREACHABLE,
    retriable: true,
    maxAttempts: 5,
    baseDelayMs: 10_000,      // 10 seconds
    maxDelayMs: 300_000,      // 5 minutes
    backoffMultiplier: 2,
    jitterPercent: 30,
    circuitBreakerThreshold: 3,
    escalationAction: 'alert_ops',
  },
  [ErrorType.EXPORT_DISK_FULL]: {
    errorType: ErrorType.EXPORT_DISK_FULL,
    retriable: true,
    maxAttempts: 3,
    baseDelayMs: 60_000,      // 1 minute
    maxDelayMs: 600_000,      // 10 minutes
    backoffMultiplier: 3,
    jitterPercent: 20,
    circuitBreakerThreshold: 2,
    escalationAction: 'alert_ops',
  },
};
```

### Backoff Calculation Implementation

```typescript
function calculateBackoff(policy: RetryPolicy, attemptCount: number): number {
  // Exponential backoff: baseDelay * (multiplier ^ attemptCount)
  const exponentialDelay = policy.baseDelayMs * Math.pow(
    policy.backoffMultiplier,
    attemptCount
  );

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, policy.maxDelayMs);

  // Apply jitter: ±jitterPercent%
  // Formula: delay * (1 + random(−0.3, +0.3)) for 30% jitter
  const jitterFactor = 1 + (Math.random() * 2 - 1) * (policy.jitterPercent / 100);
  const finalDelay = cappedDelay * jitterFactor;

  return Math.max(0, Math.floor(finalDelay));
}

// Example backoff progression for API_RATE_LIMITED:
// Attempt 0: 30s * 2^0 * jitter = ~30s (±9s)
// Attempt 1: 30s * 2^1 * jitter = ~60s (±18s)
// Attempt 2: 30s * 2^2 * jitter = ~120s (±36s)
// Attempt 3: 30s * 2^3 * jitter = ~240s (±72s)
// Attempt 4: 30s * 2^4 * jitter = ~480s (±144s), capped at 1800s
```

### Escalation to errors_log Table

```typescript
interface ErrorsLogEntry {
  id: string;                      // ULID
  capture_id: string | null;       // NULL for system-wide errors
  operation: OperationType;
  error_type: ErrorType;
  error_message: string;
  stack_trace?: string;
  context_json?: Record<string, any>;
  attempt_count: number;
  escalation_action: EscalationAction;
  dlq: boolean;                    // True if moved to Dead Letter Queue
  created_at: Date;
}

type OperationType =
  | 'voice_poll'
  | 'email_poll'
  | 'transcribe'
  | 'export'
  | 'gmail_auth'
  | 'cursor_bootstrap';

async function escalateToErrorsLog(
  operation: FailedOperation,
  policy: RetryPolicy
): Promise<void> {
  const errorEntry: ErrorsLogEntry = {
    id: ulid(),
    capture_id: operation.captureId || null,
    operation: operation.operationType,
    error_type: operation.errorType,
    error_message: operation.errorMessage,
    stack_trace: operation.stackTrace,
    context_json: operation.context,
    attempt_count: operation.attemptCount,
    escalation_action: policy.escalationAction,
    dlq: operation.attemptCount >= policy.maxAttempts,
    created_at: new Date(),
  };

  await db.run(
    `INSERT INTO errors_log (
      id, capture_id, operation, error_type, error_message,
      stack_trace, context_json, attempt_count, escalation_action, dlq, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      errorEntry.id,
      errorEntry.capture_id,
      errorEntry.operation,
      errorEntry.error_type,
      errorEntry.error_message,
      errorEntry.stack_trace,
      JSON.stringify(errorEntry.context_json),
      errorEntry.attempt_count,
      errorEntry.escalation_action,
      errorEntry.dlq ? 1 : 0,
      errorEntry.created_at.toISOString(),
    ]
  );

  // Emit metric
  metrics.counter('error_escalation_total', {
    operation: errorEntry.operation,
    error_type: errorEntry.error_type,
    escalation_action: errorEntry.escalation_action,
    dlq: errorEntry.dlq,
  });
}
```

### Placeholder Export Permanence

```typescript
interface PlaceholderExport {
  captureId: string;
  errorType: ErrorType;
  reason: string;
  attemptCount: number;
  originalFilePath?: string;
  exportedAt: Date;
}

async function exportPlaceholder(
  captureId: string,
  errorType: ErrorType,
  reason: string
): Promise<void> {
  const capture = await db.get(
    `SELECT * FROM captures WHERE id = ?`,
    [captureId]
  );

  const placeholder = `[CAPTURE_FAILED: ${errorType}]

---
Capture ID: ${captureId}
Source: ${capture.source}
Error: ${reason}
Attempts: ${capture.meta_json.attempt_count || 0}
Captured At: ${capture.created_at}
Failed At: ${new Date().toISOString()}
---

Original content unavailable due to processing failure.
This placeholder is PERMANENT and cannot be retried in MPPP.

For manual recovery, see: docs/guides/guide-error-recovery.md
`;

  // 1. Update captures table (mark as placeholder)
  await db.run(
    `UPDATE captures
     SET status = 'exported_placeholder',
         raw_content = ?,
         content_hash = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [placeholder, captureId]
  );

  // 2. Export to vault
  const vaultPath = path.join(VAULT_ROOT, 'inbox', `${captureId}.md`);
  await atomicFileWriter.write(vaultPath, placeholder);

  // 3. Record in exports_audit (hash_at_export = NULL for placeholder)
  await db.run(
    `INSERT INTO exports_audit (capture_id, vault_path, hash_at_export, mode, error_flag)
     VALUES (?, ?, NULL, 'placeholder', 1)`,
    [captureId, vaultPath]
  );

  // 4. Escalate to errors_log
  await escalateToErrorsLog(
    {
      captureId,
      operationType: 'export',
      errorType,
      errorMessage: reason,
      attemptCount: capture.meta_json.attempt_count || 0,
      context: { vault_path: vaultPath },
    },
    RETRY_MATRIX[errorType]
  );

  // 5. Emit metrics
  metrics.counter('placeholder_export_total', {
    error_type: errorType,
    source: capture.source,
  });
}
```

### Metrics Integration

See [Metrics Contract Tech Spec](../cross-cutting/spec-metrics-contract-tech.md) for complete metric definitions.

**Error recovery metrics:**

```typescript
// Retry orchestration
metrics.counter('retry_attempt_total', { operation, error_type, attempt_number });
metrics.counter('retry_success_total', { operation, error_type });
metrics.counter('retry_exhausted_total', { operation, error_type });
metrics.duration('retry_backoff_duration_ms', backoffMs, { error_type });

// Circuit breaker
metrics.gauge('circuit_breaker_state', stateValue, { error_type }); // 0=closed, 1=open, 2=half-open
metrics.counter('circuit_breaker_open_total', { error_type });
metrics.counter('circuit_breaker_close_total', { error_type });
metrics.duration('circuit_breaker_open_duration_ms', durationMs, { error_type });

// Escalation
metrics.counter('error_escalation_total', { operation, error_type, escalation_action, dlq });
metrics.counter('dlq_entry_total', { operation, error_type });
metrics.gauge('dlq_depth', dlqDepth);

// Placeholder exports
metrics.counter('placeholder_export_total', { error_type, source });
metrics.gauge('placeholder_rate_percent', (placeholders / totalCaptures) * 100);
```

**Expected Outcome:** Operation is either retried or moved to DLQ based on policy.

### Step 3: Check Circuit Breaker State

Before scheduling a retry, verify the circuit breaker isn't open:

```typescript
import { CircuitBreaker } from '@adhd-brain/core';

const circuitBreaker = new CircuitBreaker();
const breakerState = circuitBreaker.getState(classification.errorType);

if (breakerState?.state === 'open') {
  const cooldownRemaining = CIRCUIT_BREAKER_CONFIG.openDurationMs -
    (Date.now() - (breakerState.openedAt?.getTime() || 0));

  if (cooldownRemaining > 0) {
    console.log(`Circuit breaker open - waiting ${cooldownRemaining}ms`);
    await scheduleRetryAfter(operation, cooldownRemaining);
    return;
  }

  // Transition to half-open for test attempt
  breakerState.state = 'half-open';
}
```

**Expected Outcome:** Retry is delayed if circuit breaker is open, or proceeds in half-open/closed state.

### Step 4: Check Idempotency

Ensure the operation hasn't already been processed (critical for retry safety):

```typescript
// Voice capture idempotency check
async function checkVoiceIdempotency(audioFingerprint: string): Promise<boolean> {
  const existing = await db.query(
    `SELECT id FROM captures
     WHERE json_extract(meta_json, '$.audio_fp') = ?`,
    [audioFingerprint]
  );

  return existing.length > 0;
}

// Email capture idempotency check
async function checkEmailIdempotency(messageId: string): Promise<boolean> {
  const existing = await db.query(
    `SELECT id FROM captures
     WHERE json_extract(meta_json, '$.message_id') = ?`,
    [messageId]
  );

  return existing.length > 0;
}

// Export idempotency check
async function checkExportIdempotency(captureId: string): Promise<boolean> {
  const existing = await db.query(
    `SELECT id FROM exports_audit WHERE capture_id = ?`,
    [captureId]
  );

  return existing.length > 0;
}
```

**Expected Outcome:** Returns `true` if operation already succeeded, preventing duplicate processing.

### Step 5: Calculate Backoff

Use exponential backoff with jitter to calculate retry delay:

```typescript
function calculateBackoff(
  baseDelayMs: number,
  maxDelayMs: number,
  multiplier: number,
  jitterPercent: number,
  attemptCount: number
): number {
  // Exponential backoff: baseDelay * (multiplier ^ attemptCount)
  const exponentialDelay = baseDelayMs * Math.pow(multiplier, attemptCount);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Apply jitter: ±jitterPercent%
  const jitterFactor = 1 + (Math.random() * 2 - 1) * (jitterPercent / 100);
  const finalDelay = cappedDelay * jitterFactor;

  return Math.max(0, Math.floor(finalDelay));
}

// Example usage
const policy = RETRY_MATRIX['api.rate_limited'];
const backoffMs = calculateBackoff(
  policy.baseDelayMs,
  policy.maxDelayMs,
  policy.backoffMultiplier,
  policy.jitterPercent,
  operation.attemptCount
);

console.log(`Next retry in ${backoffMs}ms`);
```

**Expected Outcome:** Retry delay increases exponentially with random jitter to prevent thundering herd.

### Step 6: Execute Retry

Schedule and execute the retry operation:

```typescript
async function executeRetry(operation: FailedOperation): Promise<void> {
  // Wait for backoff period
  await sleep(backoffMs);

  // Increment attempt counter
  operation.attemptCount++;
  operation.lastAttemptAt = new Date();

  try {
    // Re-execute the operation
    await retryOperation(operation);

    // Success! Reset error counters and close circuit breaker
    await recordSuccess(operation.operationId);
    circuitBreaker.recordSuccess(operation.errorType);

  } catch (error) {
    // Failure - record and start retry flow again
    circuitBreaker.recordFailure(operation.errorType);
    await logError(operation, error);

    // Restart retry orchestration
    await orchestrateRetry(operation);
  }
}
```

**Expected Outcome:** Operation is retried with tracking and error handling.

## Common Patterns

### Pattern 1: Voice Poll with APFS Retry

Voice captures may fail due to iCloud placeholder files (dataless). Retry with longer backoff:

**Debugging Note:** For detailed APFS diagnostics, download troubleshooting, and system-level debugging, see [Voice Capture Debugging Guide](./guide-voice-capture-debugging.md) Section 2.

```typescript
async function pollVoiceMemosWithRetry(): Promise<void> {
  try {
    const files = await listVoiceMemos();

    for (const file of files) {
      try {
        const isDataless = await checkAPFSStatus(file.path);

        if (isDataless) {
          // Schedule retry after iCloud download completes
          await scheduleRetry({
            operationId: file.path,
            operationType: 'voice_poll',
            errorType: ErrorType.FILE_DATALESS,
            errorMessage: 'APFS dataless file - iCloud download pending',
            attemptCount: 1,
            firstFailureAt: new Date(),
            lastAttemptAt: new Date(),
            context: { filePath: file.path }
          });
          continue;
        }

        await processVoiceMemo(file);

      } catch (error) {
        await handleVoiceError(file, error);
      }
    }
  } catch (error) {
    await handlePollError(error);
  }
}
```

### Pattern 2: Gmail Rate Limiting with Circuit Breaker

Gmail API polling with circuit breaker protection:

```typescript
async function pollGmailWithCircuitBreaker(): Promise<void> {
  const circuitBreaker = new CircuitBreaker();

  if (circuitBreaker.isOpen(ErrorType.API_RATE_LIMITED)) {
    console.log('Circuit breaker open for Gmail API - skipping poll');
    return;
  }

  try {
    const messages = await gmailClient.fetchMessages();

    // Success - close circuit breaker if in half-open state
    circuitBreaker.recordSuccess(ErrorType.API_RATE_LIMITED);

    await processMessages(messages);

  } catch (error) {
    if (error.code === 429) {
      // Rate limited - record failure and open circuit breaker
      circuitBreaker.recordFailure(ErrorType.API_RATE_LIMITED);

      await scheduleRetry({
        operationId: 'gmail_poll',
        operationType: 'email_poll',
        errorType: ErrorType.API_RATE_LIMITED,
        errorMessage: error.message,
        attemptCount: 1,
        firstFailureAt: new Date(),
        lastAttemptAt: new Date(),
        context: { cursor: lastCursor }
      });
    }
  }
}
```

### Pattern 3: Export with Idempotency Check

Obsidian export with mandatory deduplication check:

```typescript
async function exportToVaultWithRetry(captureId: string): Promise<void> {
  // CRITICAL: Always check idempotency before retry
  const alreadyExported = await checkExportIdempotency(captureId);

  if (alreadyExported) {
    console.log('Export already completed - skipping retry');
    await recordSuccess(captureId);
    return;
  }

  try {
    const capture = await getCaptureById(captureId);
    const vaultPath = generateVaultPath(captureId);

    await atomicFileWriter.write(vaultPath, capture.raw_content);

    await insertExportAudit({
      captureId,
      vaultPath,
      hashAtExport: capture.content_hash,
      mode: 'initial'
    });

    await updateCaptureStatus(captureId, { status: 'exported' });
    await recordSuccess(captureId);

  } catch (error) {
    await handleExportError(captureId, error);
  }
}
```

### Anti-Patterns to Avoid

**❌ Don't: Retry without classifying error**

```typescript
// BAD - will retry permanent errors
catch (error) {
  await retryOperation(); // No classification!
}
```

**✅ Do: Always classify first**

```typescript
// GOOD - only retry transient errors
catch (error) {
  const classification = errorClassifier.classify(error, context);
  if (classification.retriable) {
    await retryOperation();
  }
}
```

**❌ Don't: Skip idempotency checks**

```typescript
// BAD - may create duplicates
async function retryExport(captureId: string) {
  await exportToVault(captureId); // No dedup check!
}
```

**✅ Do: Always check staging ledger**

```typescript
// GOOD - prevents duplicates
async function retryExport(captureId: string) {
  if (await checkExportIdempotency(captureId)) {
    return; // Already exported
  }
  await exportToVault(captureId);
}
```

**❌ Don't: Use fixed backoff delays**

```typescript
// BAD - no exponential backoff or jitter
await sleep(5000); // Always 5 seconds
await retryOperation();
```

**✅ Do: Use exponential backoff with jitter**

```typescript
// GOOD - prevents thundering herd
const backoff = calculateBackoff(
  policy.baseDelayMs,
  policy.maxDelayMs,
  policy.backoffMultiplier,
  policy.jitterPercent,
  attemptCount
);
await sleep(backoff);
await retryOperation();
```

## Troubleshooting

### Problem: Operations stuck in retry loop

**Symptoms:** High retry queue depth (>20), same operation retrying infinitely

**Solutions:**

1. Check if max attempts is properly enforced
2. Verify error classification is correct (not misclassifying permanent as transient)
3. Check for missing DLQ escalation logic
4. Review circuit breaker thresholds (may be too high)

**Debugging Commands:**

```bash
# Check retry queue depth
adhd capture doctor | grep "Active Retries"

# Query DLQ depth
sqlite3 .adhd-brain.db "SELECT COUNT(*) FROM errors_log WHERE dlq = 1"

# View retry attempts by error type
sqlite3 .adhd-brain.db "SELECT error_type, COUNT(*) FROM errors_log GROUP BY error_type"
```

### Problem: Circuit breaker opens too frequently

**Symptoms:** Operations paused even when API is working

**Solutions:**

1. Increase circuit breaker threshold (requires more failures to open)
2. Reduce circuit breaker cooldown period (faster recovery)
3. Check if errors are being misclassified as transient

**Configuration Tuning:**

```typescript
// Increase threshold from 3 to 5 failures
const RETRY_MATRIX = {
  'api.rate_limited': {
    circuitBreakerThreshold: 5, // Was 3
    // ... other config
  }
};

// Reduce cooldown from 5min to 2min
const CIRCUIT_BREAKER_CONFIG = {
  openDurationMs: 120000, // Was 300000 (5min)
  // ... other config
};
```

### Problem: Duplicate captures after retry

**Symptoms:** Same capture appears multiple times in Obsidian vault

**Solutions:**

1. Verify idempotency checks are present in all retry paths
2. Check staging ledger unique constraints (content_hash, channel_native_id)
3. Review export audit table for missing entries

**Debugging:**

```typescript
// Test idempotency check
const audioFingerprint = 'test-fingerprint-123';
const isDuplicate = await checkVoiceIdempotency(audioFingerprint);
console.log(`Duplicate check result: ${isDuplicate}`);

// Verify staging ledger constraints
sqlite3 .adhd-brain.db "SELECT sql FROM sqlite_master WHERE name = 'captures'"
// Should show UNIQUE constraint on content_hash
```

### Problem: Backoff delays too long/short

**Symptoms:** Retries happening too quickly (quota exhaustion) or too slowly (high latency)

**Solutions:**

1. Adjust base delay in retry matrix
2. Modify backoff multiplier (2x vs 3x)
3. Change max delay cap
4. Tune jitter percentage

**Validation:**

```typescript
// Test backoff progression
const policy = RETRY_MATRIX['api.quota_exceeded'];
for (let attempt = 0; attempt < 5; attempt++) {
  const backoff = calculateBackoff(
    policy.baseDelayMs,
    policy.maxDelayMs,
    policy.backoffMultiplier,
    policy.jitterPercent,
    attempt
  );
  console.log(`Attempt ${attempt + 1}: ${backoff}ms (${Math.floor(backoff / 1000)}s)`);
}
```

## Examples

### Example 1: Voice Memo Retry Flow

Complete retry orchestration for voice memo capture:

```typescript
async function captureVoiceMemoWithRetry(filePath: string): Promise<void> {
  const operation: FailedOperation = {
    operationId: filePath,
    operationType: 'voice_poll',
    errorType: ErrorType.UNKNOWN,
    errorMessage: '',
    attemptCount: 0,
    firstFailureAt: new Date(),
    lastAttemptAt: new Date(),
    context: { filePath }
  };

  while (operation.attemptCount < 3) {
    try {
      // Check APFS status
      const isDataless = await checkAPFSStatus(filePath);
      if (isDataless) {
        operation.errorType = ErrorType.FILE_DATALESS;
        operation.attemptCount++;

        const policy = RETRY_MATRIX[ErrorType.FILE_DATALESS];
        const backoff = calculateBackoff(
          policy.baseDelayMs,
          policy.maxDelayMs,
          policy.backoffMultiplier,
          policy.jitterPercent,
          operation.attemptCount
        );

        console.log(`APFS dataless - retrying in ${backoff}ms (attempt ${operation.attemptCount})`);
        await sleep(backoff);
        continue;
      }

      // Read audio file
      const audioBuffer = await readFile(filePath);
      const audioFingerprint = calculateAudioFingerprint(audioBuffer);

      // Check idempotency
      if (await checkVoiceIdempotency(audioFingerprint)) {
        console.log('Voice memo already captured - skipping');
        return;
      }

      // Transcribe with Whisper
      const transcription = await whisperTranscribe(audioBuffer);

      // Insert to staging ledger
      await insertCapture({
        source: 'voice',
        raw_content: transcription,
        content_hash: calculateContentHash(transcription),
        meta_json: { audio_fp: audioFingerprint, file_path: filePath }
      });

      console.log('Voice memo captured successfully');
      return;

    } catch (error) {
      operation.attemptCount++;
      operation.lastAttemptAt = new Date();
      operation.errorMessage = error.message;

      const classification = errorClassifier.classify(error, {
        operation: 'voice_poll',
        timestamp: new Date(),
        metadata: { filePath }
      });

      operation.errorType = classification.errorType;

      if (!classification.retriable) {
        await moveToDLQ(operation, 'Permanent error');
        throw error;
      }

      if (operation.attemptCount >= RETRY_MATRIX[classification.errorType].maxAttempts) {
        await moveToDLQ(operation, 'Max attempts exceeded');
        throw error;
      }

      const policy = RETRY_MATRIX[classification.errorType];
      const backoff = calculateBackoff(
        policy.baseDelayMs,
        policy.maxDelayMs,
        policy.backoffMultiplier,
        policy.jitterPercent,
        operation.attemptCount
      );

      console.log(`Retry in ${backoff}ms (attempt ${operation.attemptCount})`);
      await sleep(backoff);
    }
  }
}
```

### Example 2: Gmail OAuth2 Token Refresh Retry

Handling transient OAuth2 token refresh failures:

```typescript
async function refreshGmailTokenWithRetry(): Promise<string> {
  const circuitBreaker = new CircuitBreaker();
  let attemptCount = 0;

  while (attemptCount < 3) {
    try {
      // Check circuit breaker
      if (circuitBreaker.isOpen(ErrorType.AUTH_REFRESH_FAILED)) {
        console.log('Circuit breaker open for auth refresh - waiting');
        await sleep(60000); // 1 minute
        continue;
      }

      const refreshToken = await getStoredRefreshToken();
      const newAccessToken = await oauth2Client.refreshAccessToken(refreshToken);

      await storeAccessToken(newAccessToken);

      // Success - close circuit breaker
      circuitBreaker.recordSuccess(ErrorType.AUTH_REFRESH_FAILED);

      return newAccessToken;

    } catch (error) {
      attemptCount++;

      const classification = errorClassifier.classify(error, {
        operation: 'gmail_auth',
        timestamp: new Date(),
        metadata: {}
      });

      if (classification.errorType === ErrorType.AUTH_INVALID_GRANT) {
        // Permanent error - token revoked, needs re-auth
        await moveToDLQ({
          operationId: 'gmail_auth',
          operationType: 'gmail_auth',
          errorType: ErrorType.AUTH_INVALID_GRANT,
          errorMessage: 'Refresh token revoked - manual re-auth required',
          attemptCount,
          firstFailureAt: new Date(),
          lastAttemptAt: new Date(),
          context: {}
        }, 'Token revoked');

        throw new Error('Gmail re-authentication required');
      }

      // Transient error - record failure and retry
      circuitBreaker.recordFailure(ErrorType.AUTH_REFRESH_FAILED);

      const policy = RETRY_MATRIX[ErrorType.AUTH_REFRESH_FAILED];
      const backoff = calculateBackoff(
        policy.baseDelayMs,
        policy.maxDelayMs,
        policy.backoffMultiplier,
        policy.jitterPercent,
        attemptCount
      );

      console.log(`Token refresh failed - retry in ${backoff}ms`);
      await sleep(backoff);
    }
  }

  throw new Error('Token refresh failed after max attempts');
}
```

## TDD Applicability

**Risk Classification:** HIGH (error handling failures cause data loss or system unavailability)

**TDD Decision:** **Required** for retry matrix, backoff policy, and error taxonomy

**Rationale:**
- Incorrect retry logic can cause duplicate captures or data loss
- Backoff calculation errors lead to quota exhaustion or thundering herd
- Error misclassification (transient as permanent) causes premature escalation to DLQ
- Circuit breaker state machine bugs block all operations indefinitely
- Idempotency check failures create duplicate exports

**Scope Under TDD:**

**Unit Tests Required:**
- Error classification logic (map error codes to ErrorType enum)
- Backoff calculation (exponential + jitter formula)
- Circuit breaker state transitions (closed → open → half-open → closed)
- Retry eligibility checks (max attempts, retriable flag)
- Idempotency token generation and validation

**Integration Tests Required:**
- Retry orchestration end-to-end (failure → classify → backoff → retry → success)
- Circuit breaker integration with actual operations (open breaker blocks calls)
- Idempotency checks against staging ledger (audio_fp, message_id, capture_id)
- DLQ escalation flow (max attempts → errors_log insert)
- Transactional retry state updates (atomic status changes)

**Contract Tests Required:**
- RETRY_MATRIX structure validation (all ErrorTypes have policies)
- Staging ledger deduplication contract (UNIQUE constraints enforced)
- Metrics emission contract (retry metrics follow naming convention)
- errors_log schema contract (required fields, foreign keys)

**Out of Scope (YAGNI):**
- Persistent retry queue (in-memory only in MPPP)
- Distributed coordination (single-process assumption)
- Priority retry queues (FIFO only in MPPP)
- Manual retry triggers from DLQ (no UI in MPPP)

**Testing Trigger to Revisit:**
- DLQ entries > 10/week (indicates retry policy needs tuning)
- Duplicate captures despite deduplication (idempotency check bug)
- Circuit breaker never closes (state machine bug)

For testing patterns and utilities, see:
- [TDD Applicability Guide](./guide-tdd-applicability.md) - Risk-based testing framework
- [Test Strategy Guide](./guide-test-strategy.md) - Testing approach
- [Fault Injection Registry](./guide-fault-injection-registry.md) - Chaos testing
- [Crash Matrix Test Plan](./guide-crash-matrix-test-plan.md) - Resilience testing

## Related Documentation

**PRDs (Product Requirements):**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System-wide error handling requirements
- [Capture Feature PRD](../features/capture/prd-capture.md) - Capture error scenarios
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Deduplication and audit trail
- [Obsidian Bridge PRD](../features/obsidian-bridge/prd-obsidian.md) - Export retry requirements

**Feature Specifications:**

- [Capture Architecture Spec](../features/capture/spec-capture-arch.md) - Error flow design
- [Capture Tech Spec](../features/capture/spec-capture-tech.md) - Error handling implementation
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Error scenario testing
- [Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md) - Retry persistence

**Cross-Cutting Specifications:**

- [Metrics Contract Tech Spec](../cross-cutting/spec-metrics-contract-tech.md) - Error telemetry
- [Direct Export Pattern Tech Spec](../cross-cutting/spec-direct-export-tech.md) - Export error handling

**Guides (How-To):**

- [Gmail OAuth2 Setup Guide](./guide-gmail-oauth2-setup.md) - Auth error recovery
- [Whisper Transcription Guide](./guide-whisper-transcription.md) - Transcription error handling
- [Polling Implementation Guide](./guide-polling-implementation.md) - Sequential processing errors
- [Fault Injection Hook Registry](./guide-fault-injection-registry.md) - Crash testing error recovery paths
- [Crash Matrix Test Plan](./guide-crash-matrix-test-plan.md) - Systematic resilience testing
- [TestKit Usage Guide](./guide-testkit-usage.md) - Testing error scenarios with TestKit
- [TDD Applicability Guide](./guide-tdd-applicability.md) - Testing error handling
- [Test Strategy Guide](./guide-test-strategy.md) - Error scenario coverage
- [Capture Debugging Guide](./guide-capture-debugging.md) - Debugging retry failures

**ADRs (Architecture Decisions):**
- [ADR-0008: Sequential Processing Model](../adr/0008-sequential-processing-mppp.md) - Retry concurrency constraints
- [ADR-0014: Placeholder Export Immutability](../adr/0014-placeholder-export-immutability.md) - Error recovery boundaries

**External Resources:**

- [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Retry Pattern Best Practices](https://docs.microsoft.com/en-us/azure/architecture/patterns/retry)

## Maintenance Notes

**When to Update:**

- New error types added to the taxonomy
- New capture channels or processing stages introduced
- Retry policies need tuning based on production metrics
- Circuit breaker thresholds change based on API behavior

**Known Limitations:**

- In-memory retry state (lost on crash, rebuilt from staging ledger)
- No distributed retry coordination (single process only)
- No priority queuing (FIFO only)
- Manual DLQ cleanup required (no automatic purging)

**Gaps:**

- Persistent retry queue not implemented (Phase 2+ if needed)
- Manual retry trigger from DLQ not supported (Phase 2+ if requested)
- Retry priority system deferred (Phase 3+ based on queue metrics)
