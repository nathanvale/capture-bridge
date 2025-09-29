---
title: Resilience Package Developer Guide
doc_type: guide
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-29
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Resilience Package Developer Guide

> **Complete resilience patterns library for ADHD Brain capture system - An AI agent's guide to understanding and using retry, backoff, circuit breaker, and timeout features**
>
> **Alignment**: Supports MPPP requirements for graceful error recovery, sequential processing resilience, and fault-tolerant capture ingestion
>
> **Cross-References**:
> - Master PRD: [prd-master.md](../master/prd-master.md)
> - Roadmap: [roadmap.md](../master/roadmap.md)
> - Error Recovery Guide: [guide-error-recovery.md](./guide-error-recovery.md)
> - TDD Applicability Guide: [guide-tdd-applicability.md](./guide-tdd-applicability.md)

## 📦 Package Overview

**Package Name:** `@adhd-brain/resilience`
**Purpose:** Comprehensive resilience patterns for reliable capture processing
**Architecture:** Domain-based subpath exports with tree-shakable modules
**Philosophy:** Fail fast, recover gracefully, ADHD-friendly error handling

## 🚀 Installation & Import

```bash
pnpm add @adhd-brain/resilience
```

```typescript
// Import from domain-specific subpaths
import { ExponentialBackoff } from '@adhd-brain/resilience/backoff'
import { CircuitBreaker } from '@adhd-brain/resilience/circuit-breaker'
import { RetryOrchestrator } from '@adhd-brain/resilience/retry'
import { TimeoutController } from '@adhd-brain/resilience/timeout'
import { ErrorClassifier } from '@adhd-brain/resilience/errors'
import { FaultInjector } from '@adhd-brain/resilience/testing'
```

## 🎯 Core Domains & Features

### 1. **Backoff Domain** (Exponential Delay Management)

**Purpose:** Calculate delays for retry operations with jitter and caps
**Maturity:** ✅ Stable (Production Ready)

#### Core Backoff Functions

- `ExponentialBackoff(options)` - Configurable exponential backoff calculator
- `LinearBackoff(options)` - Simple linear delay progression
- `FixedBackoff(delay)` - Fixed delay between retries
- `calculateBackoff(baseDelay, multiplier, attempt, jitter?)` - Core calculation
- `withJitter(delay, jitterFactor?)` - Add randomization to delays
- `capDelay(delay, maxDelay)` - Enforce maximum delay limits

#### Backoff Utilities

- `createBackoffSequence(policy, maxAttempts)` - Generate delay sequence
- `formatBackoffDuration(ms)` - Human-readable delay formatting
- `BackoffPresets` - Common backoff configurations
- `validateBackoffPolicy(policy)` - Policy validation

```typescript
// Example: APFS dataless file retry backoff
import { ExponentialBackoff, BackoffPresets } from '@adhd-brain/resilience/backoff'

const apfsBackoff = new ExponentialBackoff({
  baseDelay: 1000,        // Start with 1 second
  maxDelay: 60000,        // Cap at 60 seconds
  multiplier: 2,          // Double each time
  jitter: true,           // Add randomization
  maxAttempts: 5
})

// Calculate delay for attempt 3: ~4000ms + jitter
const delayMs = apfsBackoff.calculateDelay(3)
console.log(`Retry in ${delayMs}ms`) // "Retry in 4247ms"

// Or use preset for API rate limiting
const apiBackoff = new ExponentialBackoff(BackoffPresets.API_RATE_LIMITED)
```

### 2. **Circuit Breaker Domain**

**Purpose:** Fail-fast protection for external services (Gmail, iCloud, Whisper)
**Maturity:** ✅ Stable (Production Ready)

#### Circuit Breaker Management

- `CircuitBreaker(options)` - Main circuit breaker implementation
- `CircuitBreakerRegistry` - Global breaker registry
- `createServiceBreaker(serviceName, options)` - Service-specific breakers
- `BreakerState` - State enumeration (CLOSED, OPEN, HALF_OPEN)

#### Circuit Breaker Operations

- `breaker.execute(operation)` - Execute operation with protection
- `breaker.getState()` - Current breaker state
- `breaker.getMetrics()` - Failure/success metrics
- `breaker.reset()` - Manual breaker reset
- `breaker.forceOpen()` - Manual circuit open
- `breaker.onStateChange(callback)` - State change notifications

#### Circuit Breaker Utilities

- `isCircuitOpen(serviceName)` - Quick state check
- `waitForCircuitClosed(serviceName, timeout?)` - Wait for recovery
- `BreakerPresets` - Common configurations

```typescript
// Example: Gmail API circuit breaker
import { CircuitBreaker, BreakerPresets } from '@adhd-brain/resilience/circuit-breaker'

const gmailBreaker = new CircuitBreaker({
  ...BreakerPresets.HTTP_API,
  name: 'gmail-api',
  errorThreshold: 5,      // Open after 5 failures
  timeout: 5000,          // 5 second operation timeout
  resetTimeout: 30000,    // Try again after 30 seconds
})

// Execute Gmail operation with protection
try {
  const messages = await gmailBreaker.execute(async () => {
    return await gmail.users.messages.list({ userId: 'me' })
  })
} catch (error) {
  if (error.name === 'CircuitBreakerError') {
    console.log('Gmail API circuit is open - using fallback')
    // Handle graceful degradation
  }
}
```

### 3. **Retry Domain**

**Purpose:** Orchestrate retry operations with backoff and circuit breaker integration
**Maturity:** ✅ Stable (Production Ready)

#### Retry Orchestration

- `RetryOrchestrator(options)` - Main retry coordinator
- `createRetryPolicy(errorType, options)` - Error-specific policies
- `retryWithPolicy(operation, policy)` - Execute with retry policy
- `RetryableOperation` - Operation wrapper interface

#### Retry Utilities

- `isRetriableError(error, policy)` - Error classification check
- `shouldRetry(attempt, maxAttempts, error)` - Retry decision logic
- `RetryMetrics` - Track retry statistics
- `createRetryMatrix()` - ADHD Brain retry configuration

#### Retry Integration

- `withCircuitBreaker(operation, breaker)` - Circuit breaker integration
- `withBackoff(operation, backoffPolicy)` - Backoff integration
- `withTimeout(operation, timeoutMs)` - Timeout integration
- `retryChain()` - Compose multiple resilience patterns

```typescript
// Example: Voice file transcription retry
import { RetryOrchestrator, createRetryMatrix } from '@adhd-brain/resilience/retry'
import { ErrorClassifier } from '@adhd-brain/resilience/errors'

const retryMatrix = createRetryMatrix()
const orchestrator = new RetryOrchestrator()

async function transcribeWithRetry(audioPath: string): Promise<string> {
  return orchestrator.execute(async (attempt) => {
    try {
      return await whisper.transcribe(audioPath)
    } catch (error) {
      const classification = ErrorClassifier.classify(error)

      if (classification.errorType === 'TRANSCRIPTION_TIMEOUT') {
        // Transient - retry with exponential backoff
        throw error // Will be retried
      } else if (classification.errorType === 'FILE_CORRUPTED') {
        // Permanent - don't retry
        throw new AbortError('Audio file is corrupted')
      }
      throw error
    }
  }, {
    policy: retryMatrix.TRANSCRIPTION_TIMEOUT,
    maxAttempts: 3,
    onRetry: (attempt, error) => {
      console.log(`Transcription attempt ${attempt} failed: ${error.message}`)
    }
  })
}
```

### 4. **Timeout Domain**

**Purpose:** Operation timeout management with cancellation support
**Maturity:** ✅ Stable (Production Ready)

#### Timeout Management

- `TimeoutController(options)` - Timeout orchestration
- `withTimeout(operation, timeoutMs)` - Wrap operation with timeout
- `createTimeoutSignal(timeoutMs)` - AbortController integration
- `CancellableOperation` - Operation interface with cancellation

#### Timeout Utilities

- `isTimeoutError(error)` - Timeout error detection
- `formatTimeoutDuration(ms)` - Human-readable timeout formatting
- `TimeoutPresets` - Common timeout configurations
- `createTimeoutChain(timeouts[])` - Progressive timeout handling

#### Advanced Timeout Features

- `ProgressiveTimeout` - Increasing timeouts with retries
- `ConditionalTimeout` - Dynamic timeout based on conditions
- `TimeoutMetrics` - Track timeout statistics

```typescript
// Example: iCloud download with progressive timeout
import { TimeoutController, ProgressiveTimeout } from '@adhd-brain/resilience/timeout'

const downloadTimeout = new ProgressiveTimeout({
  initialTimeout: 30000,  // 30 seconds first attempt
  maxTimeout: 300000,     // 5 minutes maximum
  progressionFactor: 2,   // Double timeout each retry
})

async function downloadVoiceFile(filePath: string): Promise<void> {
  return downloadTimeout.execute(async (signal, attempt) => {
    console.log(`Download attempt ${attempt} with ${signal.timeout}ms timeout`)

    return new Promise((resolve, reject) => {
      const download = icloudctl.startDownload(filePath)

      signal.addEventListener('abort', () => {
        download.cancel()
        reject(new Error(`Download timeout after ${signal.timeout}ms`))
      })

      download.then(resolve).catch(reject)
    })
  })
}
```

### 5. **Error Classification Domain**

**Purpose:** Systematic error categorization for retry decisions
**Maturity:** ✅ Stable (Production Ready)

#### Error Classification

- `ErrorClassifier` - Main error classification engine
- `classify(error)` - Classify error into retry categories
- `ErrorCategory` - Enumeration (TRANSIENT, PERMANENT, RATE_LIMITED, etc.)
- `isRetriable(error)` - Quick retry decision

#### Classification Rules

- `addClassificationRule(pattern, category)` - Custom classification
- `NetworkErrorClassifier` - Network-specific classification
- `FileSystemErrorClassifier` - FS-specific classification
- `APIErrorClassifier` - API-specific classification

#### ADHD Brain Error Types

- `VoiceFileErrors` - Voice capture error classification
- `EmailPollingErrors` - Gmail API error classification
- `TranscriptionErrors` - Whisper error classification
- `ExportErrors` - Obsidian export error classification

```typescript
// Example: Comprehensive error classification
import { ErrorClassifier, ErrorCategory } from '@adhd-brain/resilience/errors'

const classifier = new ErrorClassifier()

// Add custom rules for ADHD Brain errors
classifier.addRule(/APFS.*dataless/, ErrorCategory.TRANSIENT)
classifier.addRule(/quota.*exceeded/i, ErrorCategory.RATE_LIMITED)
classifier.addRule(/file.*corrupted/i, ErrorCategory.PERMANENT)

async function handleCaptureError(error: Error, operation: string) {
  const classification = classifier.classify(error)

  switch (classification.category) {
    case ErrorCategory.TRANSIENT:
      console.log(`${operation}: Transient error - will retry`)
      return { shouldRetry: true, backoffType: 'exponential' }

    case ErrorCategory.RATE_LIMITED:
      console.log(`${operation}: Rate limited - aggressive backoff`)
      return { shouldRetry: true, backoffType: 'aggressive' }

    case ErrorCategory.PERMANENT:
      console.log(`${operation}: Permanent error - will not retry`)
      return { shouldRetry: false, quarantine: true }

    default:
      console.log(`${operation}: Unknown error - conservative retry`)
      return { shouldRetry: true, backoffType: 'conservative' }
  }
}
```

### 6. **Testing Domain** (Fault Injection)

**Purpose:** Fault injection and resilience testing utilities
**Maturity:** ✅ Stable (Production Ready)

#### Fault Injection

- `FaultInjector` - Main fault injection engine
- `injectFailure(operation, failureRate)` - Random failure injection
- `injectLatency(operation, latencyMs)` - Latency simulation
- `injectTimeout(operation)` - Timeout simulation

#### Chaos Testing

- `ChaosTestRunner` - Orchestrate chaos tests
- `createFailureScenario(pattern, config)` - Define failure scenarios
- `simulateNetworkPartition()` - Network failure simulation
- `simulateServiceDegradation()` - Performance degradation

#### Integration with TestKit

- `mockRetryOperations()` - Mock retry behavior
- `simulateCircuitBreakerStates()` - Breaker state simulation
- `createResilienceTestHarness()` - Complete test setup

```typescript
// Example: Fault injection testing
import { FaultInjector, ChaosTestRunner } from '@adhd-brain/resilience/testing'
import { useFakeTimers } from '@template/testkit/env'

describe('Voice capture resilience', () => {
  it('handles intermittent iCloud failures', async () => {
    useFakeTimers()

    const faultInjector = new FaultInjector()

    // Inject 30% failure rate into iCloud operations
    const faultyDownload = faultInjector.injectFailure(
      originalDownload,
      0.3,
      new Error('Network offline: NSURLErrorDomain -1009')
    )

    // Test that retry system recovers
    const result = await retryDownload(faultyDownload, 'test.m4a')

    expect(result.success).toBe(true)
    expect(result.retryCount).toBeGreaterThan(0)
  })
})
```

## 🔄 Cross-Domain Patterns

### Integrated Resilience

```typescript
// Complete resilience stack for Gmail API
import {
  CircuitBreaker,
  RetryOrchestrator,
  ExponentialBackoff,
  ErrorClassifier
} from '@adhd-brain/resilience'

const gmailResilience = {
  breaker: new CircuitBreaker({
    name: 'gmail-api',
    errorThreshold: 5,
    resetTimeout: 30000
  }),

  retry: new RetryOrchestrator({
    maxAttempts: 3,
    backoff: new ExponentialBackoff({
      baseDelay: 1000,
      maxDelay: 60000,
      multiplier: 2
    })
  }),

  classifier: new ErrorClassifier()
}

async function robustGmailOperation(operation: () => Promise<any>) {
  return gmailResilience.retry.execute(async (attempt) => {
    return gmailResilience.breaker.execute(operation)
  })
}
```

### ADHD-Friendly Error Recovery

```typescript
// Simple, predictable error recovery
import { createResilientOperation } from '@adhd-brain/resilience'

const resilientVoiceCapture = createResilientOperation(captureVoice, {
  // Preset configuration for ADHD Brain capture
  preset: 'voice-capture',

  // Simple progress reporting
  onRetry: (attempt, maxAttempts, error) => {
    console.log(`Voice capture attempt ${attempt}/${maxAttempts}: ${error.message}`)
  },

  // Graceful fallback
  fallback: async (error) => {
    await exportPlaceholder(error.filePath, error.message)
    return { captured: false, placeholder: true }
  }
})
```

## 🎯 MPPP-Specific Resilience Patterns

### Sequential Processing Protection

The MPPP architecture requires **sequential processing** with resilience. The package provides tools to maintain this constraint:

```typescript
import { SequentialProcessor } from '@adhd-brain/resilience/sequential'

// Ensure voice captures are processed one at a time with resilience
const voiceProcessor = new SequentialProcessor({
  concurrency: 1,           // Strictly sequential
  retryPolicy: 'voice-capture',
  backpressureLimit: 10,    // Queue limit for ADHD focus
})

// Process files sequentially with retry protection
await voiceProcessor.process(async (filePath) => {
  await transcribeVoiceFile(filePath)
  await stageCapture(filePath)
  await exportToObsidian(filePath)
})
```

### No-Outbox Resilience

```typescript
// Direct-to-Obsidian pattern with resilience (no intermediate queues)
const directExport = createResilientOperation(exportToObsidian, {
  // Immediate write with retry (no queueing)
  immediate: true,

  // Validate single-pass write
  postCondition: async (result) => {
    const exists = await fs.pathExists(result.exportPath)
    if (!exists) {
      throw new Error('Export failed - file not written')
    }
  },

  // Conservative retry for filesystem operations
  retryPolicy: 'filesystem-write'
})
```

### Deduplication Window Resilience

```typescript
// Resilient deduplication with 5-minute window
import { withDeduplication } from '@adhd-brain/resilience/deduplication'

const resilientCapture = withDeduplication(captureVoice, {
  windowMs: 5 * 60 * 1000,  // 5-minute dedup window
  keyExtractor: (filePath) => calculateSHA256(filePath),

  // Handle dedup failures gracefully
  onDuplicateDetected: (filePath, originalTimestamp) => {
    console.log(`Duplicate voice file detected: ${filePath}`)
    return { captured: false, reason: 'duplicate', originalTimestamp }
  }
})
```

## 📋 Common Recipes

### Recipe: Robust iCloud Voice File Download

```typescript
import {
  createResilientOperation,
  BackoffPresets,
  ErrorCategory
} from '@adhd-brain/resilience'

const resilientDownload = createResilientOperation(downloadVoiceFile, {
  // Use APFS-optimized retry policy
  retryPolicy: BackoffPresets.APFS_DATALESS,

  // Custom error classification
  errorClassifier: (error) => {
    if (error.message.includes('dataless')) {
      return ErrorCategory.TRANSIENT
    }
    if (error.message.includes('quota exceeded')) {
      return ErrorCategory.RATE_LIMITED
    }
    return ErrorCategory.UNKNOWN
  },

  // Progress reporting for ADHD users
  onProgress: (attempt, maxAttempts, nextDelayMs) => {
    console.log(`iCloud download attempt ${attempt}/${maxAttempts}`)
    if (nextDelayMs) {
      console.log(`Next retry in ${Math.round(nextDelayMs / 1000)}s`)
    }
  }
})
```

### Recipe: Gmail API with Circuit Protection

```typescript
import {
  CircuitBreaker,
  BreakerPresets,
  withMetrics
} from '@adhd-brain/resilience'

const gmailBreaker = new CircuitBreaker({
  ...BreakerPresets.HTTP_API,
  name: 'gmail-polling',
  onStateChange: (state) => {
    if (state === 'OPEN') {
      console.log('Gmail API circuit open - pausing email polling')
    } else if (state === 'CLOSED') {
      console.log('Gmail API circuit closed - resuming email polling')
    }
  }
})

// Wrap Gmail operations with circuit protection
const resilientGmailPoll = withMetrics(
  gmailBreaker.execute.bind(gmailBreaker),
  'gmail-polling'
)
```

### Recipe: Whisper Transcription with Timeout

```typescript
import {
  withTimeout,
  ProgressiveTimeout,
  TimeoutPresets
} from '@adhd-brain/resilience/timeout'

const transcriptionTimeout = new ProgressiveTimeout({
  ...TimeoutPresets.COMPUTE_INTENSIVE,
  onTimeout: (attempt, timeoutMs) => {
    console.log(`Transcription timeout after ${timeoutMs}ms (attempt ${attempt})`)
  }
})

const resilientTranscribe = async (audioPath: string) => {
  return transcriptionTimeout.execute(async (signal, attempt) => {
    console.log(`Transcribing with ${signal.timeout}ms timeout`)

    return whisper.transcribe(audioPath, {
      abortSignal: signal,
      progressCallback: (progress) => {
        console.log(`Transcription progress: ${Math.round(progress * 100)}%`)
      }
    })
  })
}
```

## 🚨 Important Notes for AI Agents

### Package Philosophy

- **Error-first design** - Always classify errors before retry
- **ADHD-friendly feedback** - Clear progress reporting and timeouts
- **Sequential-safe** - All patterns respect MPPP sequential constraints
- **No-outbox compatible** - Direct operations with resilience

### Maturity Guidance

- ✅ **Stable**: Use freely (Backoff, Retry, Circuit Breaker, Timeout, Errors)
- ✅ **Stable**: Testing domain for fault injection
- 🔶 **Beta**: Advanced timeout patterns (ProgressiveTimeout)

### MPPP Architecture Alignment

The Resilience package directly supports MPPP constraints:

1. **Sequential Processing**: `SequentialProcessor` ensures one-at-a-time processing with retry
2. **No Outbox Pattern**: Direct operations with `immediate: true` flag
3. **Deduplication Resilience**: Window-based dedup with failure handling
4. **Fast Feedback**: ADHD-optimized progress reporting and timeout messages
5. **Conservative Defaults**: Fail-fast with graceful degradation

### YAGNI Deferrals

Per Master PRD v2.3.0-MPPP scope reduction:

- Advanced circuit breaker patterns - Deferred to Phase 2+
- Distributed circuit breakers - Deferred to Phase 3+ (multi-device)
- ML-based error prediction - Deferred to Phase 5+ (intelligence layer)
- Metrics dashboards - Deferred to Phase 2+ (monitoring infrastructure)
- Custom retry strategies - Use presets only in Phase 1

### Resilience Best Practices

1. Always classify errors before deciding retry strategy
2. Use circuit breakers for external API calls (Gmail, iCloud)
3. Progressive timeouts for compute-intensive operations (Whisper)
4. Exponential backoff with jitter for network operations
5. Conservative retry limits (max 3-5 attempts)
6. **MPPP-Specific**: Validate sequential processing constraints
7. **MPPP-Specific**: Ensure direct writes don't use queuing
8. **ADHD-Specific**: Provide clear progress feedback and predictable timeouts

## 🔗 Quick Reference

```typescript
// Common imports for ADHD Brain
import {
  // Backoff & Retry
  ExponentialBackoff, RetryOrchestrator, createRetryMatrix,
  // Circuit Protection
  CircuitBreaker, BreakerPresets,
  // Error Classification
  ErrorClassifier, ErrorCategory,
  // Timeout Management
  TimeoutController, withTimeout,
  // Testing
  FaultInjector, createResilienceTestHarness,
  // Presets
  BackoffPresets, TimeoutPresets
} from '@adhd-brain/resilience'

// Quick resilient operation
const resilient = createResilientOperation(operation, 'voice-capture')
```

## Related Documentation

**PRDs (Product Requirements):**
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System-wide resilience requirements
- [Capture PRD](../features/capture/prd-capture.md) - Voice capture resilience patterns

**Specifications:**
- [Capture Technical Spec](../features/capture/spec-capture-tech.md) - APFS error handling
- [Error Recovery Spec](../features/capture/spec-capture-error-recovery.md) - Retry orchestration

**Guides (How-To):**
- [Error Recovery Guide](./guide-error-recovery.md) - Comprehensive error handling patterns
- [Fault Injection Registry](./guide-fault-injection-registry.md) - Testing resilience patterns
- [Crash Matrix Test Plan](./guide-crash-matrix-test-plan.md) - Advanced testing scenarios

**ADRs (Architecture Decisions):**
- [ADR-0007: Sequential Processing Model](../adr/0007-sequential-processing-model.md) - Sequential constraints
- [ADR-0010: Error Recovery Strategy](../adr/0010-error-recovery-strategy.md) - Retry decision framework

**External Resources:**
- [Opossum Circuit Breaker](https://github.com/nodeshift/opossum) - Circuit breaker patterns
- [p-retry Documentation](https://github.com/sindresorhus/p-retry) - Promise retry patterns
- [Exponential Backoff Best Practices](https://cloud.google.com/storage/docs/retry-strategy) - Google Cloud retry strategy

## Maintenance Notes

**When to Update:**
- New error patterns discovered in production (add to ErrorClassifier)
- External API rate limit changes (update BreakerPresets)
- MPPP architecture changes (sequential processing, direct writes)
- Performance testing reveals new timeout patterns

**Known Limitations:**
- Circuit breaker state is process-local (not distributed)
- Advanced retry strategies limited to presets (YAGNI for Phase 1)
- Metrics collection basic (comprehensive monitoring deferred to Phase 2+)

**Gaps:**
- Multi-process circuit breaker coordination (Phase 3+)
- ML-based error prediction (Phase 5+)
- Advanced chaos engineering (Phase 2+)
- Real-time resilience dashboards (Phase 2+)

---

*This resilience package handles errors more gracefully than your ADHD brain handles context switching—and that's saying something. Use it to make your capture pipeline bulletproof against the chaos of real-world file systems and flaky APIs.*