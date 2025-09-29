---
title: Production Resilience Package Usage Guide
doc_type: guide
status: draft
owner: Nathan
version: 2.0.0
date: 2025-09-29
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Production Resilience Package Usage Guide

> **How to use production-ready resilience libraries for robust error handling in the ADHD Brain system**
>
> **Alignment**: Implements resilience patterns using battle-tested libraries with strong TypeScript support
>
> **Cross-References**:
>
> - Resilience Patterns Guide: [guide-resilience-patterns.md](guide-resilience-patterns.md)
> - ADR Resilience Library Selection: [ADR-0030](../adr/0030-resilience-library-selection.md)
> - Master PRD: [prd-master.md](../master/prd-master.md)

## 1. Overview

This guide documents how to use our production resilience stack built on industry-standard libraries. Each library serves a specific purpose and has been chosen based on community trust, TypeScript support, and active maintenance.

### Library Stack

- **p-retry** (28M+ weekly downloads) - Retry with exponential backoff
- **opossum** (350K+ weekly downloads) - Circuit breaker pattern
- **bottleneck** (5M+ weekly downloads) - Rate limiting and throttling
- **p-limit** (45M+ weekly downloads) - Concurrency control
- **p-throttle** (1M+ weekly downloads) - Function throttling

### Why This Stack?

Unlike monolithic resilience libraries, our modular approach allows:

- **Best-in-class** solutions for each pattern
- **Tree-shaking** to minimize bundle size
- **Active maintenance** from established maintainers
- **Strong TypeScript** support throughout
- **Community trust** with millions of downloads

## 2. Installation

```bash
# Install all resilience libraries
pnpm add p-retry opossum bottleneck p-limit p-throttle

# Install types (if needed)
pnpm add -D @types/opossum
```

## 3. Core Patterns

### 3.1 Retry with Exponential Backoff (p-retry)

#### Basic Usage

```typescript
import pRetry, { AbortError } from "p-retry"

// Simple retry with defaults
const result = await pRetry(
  async () => {
    const response = await fetch("https://api.example.com/data")
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  {
    retries: 5,
  }
)
```

#### Advanced Configuration

```typescript
import pRetry, { AbortError } from "p-retry"

const fetchWithRetry = async (url: string) => {
  return pRetry(
    async () => {
      const response = await fetch(url)

      // Don't retry 404s - they won't magically appear
      if (response.status === 404) {
        throw new AbortError("Resource not found")
      }

      // Don't retry client errors (except 429)
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        throw new AbortError(`Client error: ${response.status}`)
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response.json()
    },
    {
      retries: 5,
      factor: 2, // Exponential factor
      minTimeout: 1000, // Start at 1 second
      maxTimeout: 30000, // Cap at 30 seconds
      randomize: true, // Add jitter to prevent thundering herd

      onFailedAttempt: (error) => {
        // ADHD-friendly progress reporting
        console.log(
          `🔄 Retry ${error.attemptNumber}/${error.attemptNumber + error.retriesLeft} ` +
            `failed: ${error.message}`
        )
      },

      shouldRetry: (error: any) => {
        // Custom retry logic
        if (error.code === "ECONNREFUSED") return true
        if (error.code === "ETIMEDOUT") return true
        if (error.response?.status === 429) return true // Rate limited
        if (error.response?.status >= 500) return true // Server errors
        return false
      },
    }
  )
}
```

#### With AbortController

```typescript
const controller = new AbortController()

// Allow user to cancel retries
cancelButton.addEventListener("click", () => {
  controller.abort(new Error("User cancelled operation"))
})

try {
  const result = await pRetry(fetchData, {
    retries: 5,
    signal: controller.signal,
  })
} catch (error) {
  if (error.message === "User cancelled operation") {
    console.log("Operation cancelled by user")
  }
}
```

### 3.2 Circuit Breaker (opossum)

#### Basic Setup

```typescript
import CircuitBreaker from "opossum"

// Function to protect
async function riskyApiCall(params: any) {
  const response = await fetch("https://unreliable-api.com", {
    method: "POST",
    body: JSON.stringify(params),
  })
  return response.json()
}

// Create circuit breaker
const breaker = new CircuitBreaker(riskyApiCall, {
  timeout: 3000, // 3 second timeout per request
  errorThresholdPercentage: 50, // Open circuit at 50% failure rate
  resetTimeout: 30000, // Wait 30 seconds before trying again
  volumeThreshold: 10, // Need at least 10 requests before opening
})

// Use the breaker
try {
  const result = await breaker.fire({ data: "test" })
  console.log("Success:", result)
} catch (error) {
  console.error("Failed after circuit breaker:", error)
}
```

#### With Fallback

```typescript
// Provide fallback for graceful degradation
breaker.fallback((params: any) => {
  console.log("Circuit open, using fallback")
  return {
    cached: true,
    data: getCachedData(params),
    timestamp: new Date().toISOString(),
  }
})

// Monitor circuit states
breaker.on("open", () => {
  console.log("⚡ Circuit breaker opened - too many failures")
  notifyOps("Circuit breaker opened for external API")
})

breaker.on("halfOpen", () => {
  console.log("🔌 Circuit breaker half-open - testing with one request")
})

breaker.on("close", () => {
  console.log("✅ Circuit breaker closed - service recovered")
})

// Track metrics
breaker.on("success", (result) => {
  metrics.increment("circuit_breaker.success")
})

breaker.on("failure", (error) => {
  metrics.increment("circuit_breaker.failure")
})
```

### 3.3 Rate Limiting (bottleneck)

#### Basic Rate Limiter

```typescript
import Bottleneck from "bottleneck"

// Create rate limiter - 10 requests per second
const limiter = new Bottleneck({
  minTime: 100, // Minimum 100ms between requests
  maxConcurrent: 5, // Maximum 5 parallel requests
})

// Use the limiter
const results = await Promise.all(
  urls.map((url) => limiter.schedule(() => fetch(url)))
)
```

#### Advanced Configuration for APIs

```typescript
// Gmail API rate limiter (80 requests/second safe limit)
const gmailLimiter = new Bottleneck({
  reservoir: 80, // 80 requests available
  reservoirRefreshInterval: 1000, // Refill every second
  reservoirRefreshAmount: 80, // Refill to 80

  minTime: 12, // At least 12ms between requests (83.3 req/s max)
  maxConcurrent: 10, // Maximum 10 parallel requests

  highWater: 60, // Start slowing at 60 queued jobs
  strategy: Bottleneck.strategy.LEAK, // Drop old requests if overwhelmed

  rejectOnDrop: true, // Reject dropped promises
})

// ADHD-friendly progress events
gmailLimiter.on("depleted", () => {
  console.log("⚠️ Rate limit budget depleted, queuing requests...")
})

gmailLimiter.on("empty", () => {
  console.log("✅ Request queue empty")
})

gmailLimiter.on("dropped", (dropped) => {
  console.error("❌ Request dropped due to overload:", dropped.args)
})

// Execute with rate limiting
async function fetchEmails(userId: string) {
  return gmailLimiter.schedule(
    { priority: 1, weight: 1, id: userId },
    async () => {
      const response = await gmailApi.messages.list({ userId })
      return response.data
    }
  )
}
```

### 3.4 Concurrency Control (p-limit)

#### Sequential Processing (MPPP Requirement)

```typescript
import pLimit from "p-limit"

// Process one at a time (sequential)
const limit = pLimit(1)

// Process voice memos sequentially
const voiceMemos = await getVoiceMemos()
const transcriptions = await Promise.all(
  voiceMemos.map((memo) =>
    limit(async () => {
      console.log(`Processing: ${memo.name}`)
      const result = await transcribeWithWhisper(memo)
      console.log(`Completed: ${memo.name}`)
      return result
    })
  )
)
```

#### Controlled Parallelism

```typescript
// Process up to 3 files simultaneously
const limit = pLimit(3)

const files = await getFiles()
const processed = await Promise.all(
  files.map((file, index) =>
    limit(async () => {
      console.log(`Starting file ${index + 1}/${files.length}`)
      return processFile(file)
    })
  )
)
```

### 3.5 Function Throttling (p-throttle)

```typescript
import pThrottle from "p-throttle"

// Create throttled function - max 5 calls per second
const throttle = pThrottle({
  limit: 5,
  interval: 1000,
  strict: true, // Throw error if limit exceeded
})

const throttledSave = throttle(async (data: any) => {
  await saveToDatabase(data)
})

// Use throttled function
for (const item of items) {
  await throttledSave(item) // Will respect rate limit
}
```

## 4. Service-Specific Presets

### Gmail API Preset

```typescript
import pRetry from "p-retry"
import Bottleneck from "bottleneck"
import CircuitBreaker from "opossum"

class GmailApiClient {
  private limiter: Bottleneck
  private breaker: CircuitBreaker

  constructor() {
    // Rate limiter configuration
    this.limiter = new Bottleneck({
      reservoir: 80,
      reservoirRefreshInterval: 1000,
      reservoirRefreshAmount: 80,
      minTime: 12,
      maxConcurrent: 10,
    })

    // Circuit breaker configuration
    const apiCall = this.makeApiCall.bind(this)
    this.breaker = new CircuitBreaker(apiCall, {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 10,
    })

    // Fallback to cached data
    this.breaker.fallback(() => ({
      cached: true,
      messages: this.getCachedMessages(),
    }))
  }

  private async makeApiCall(endpoint: string, params: any) {
    return pRetry(
      async (attemptNumber) => {
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1${endpoint}`,
          {
            headers: {
              Authorization: `Bearer ${await this.getToken()}`,
            },
            ...params,
          }
        )

        if (response.status === 401) {
          // OAuth token expired - attempt refresh once per retry cycle
          console.log("🔑 Gmail OAuth token expired, attempting refresh...")
          await this.refreshToken()
          throw new Error("Token refreshed, retrying request")
        }

        if (response.status === 429) {
          // Enhanced retry-after header parsing
          const retryAfterMs = this.parseRetryAfterHeader(response)
          const quotaType = this.detectQuotaType(response)

          console.log(
            `🚫 Gmail rate limit exceeded (${quotaType}), waiting ${retryAfterMs}ms before retry`
          )

          // Create error with retry-after information for intelligent backoff
          const rateLimitError = new Error(`Rate limit exceeded: ${quotaType}`)
          ;(rateLimitError as any).retryAfter = retryAfterMs
          ;(rateLimitError as any).quotaType = quotaType
          throw rateLimitError
        }

        if (response.status === 403) {
          // Check if this is a quota exceeded error vs permissions
          const errorBody = await response.text()
          if (errorBody.includes("quotaExceeded")) {
            console.log("📊 Gmail daily quota exceeded - requires 24h wait")
            const error = new Error("Daily quota exceeded")
            ;(error as any).retryAfter = 24 * 60 * 60 * 1000 // 24 hours
            throw error
          } else {
            // Permanent permission error
            throw new pRetry.AbortError(
              `Gmail API access forbidden: ${errorBody}`
            )
          }
        }

        if (response.status >= 500) {
          // Server errors - retryable with exponential backoff
          console.log(
            `⚠️ Gmail server error ${response.status}, will retry with backoff`
          )
          throw new Error(
            `Server error: ${response.status} ${response.statusText}`
          )
        }

        if (response.status >= 400) {
          // Client errors (except handled above) - mostly permanent
          const errorBody = await response.text()
          throw new pRetry.AbortError(
            `Gmail client error ${response.status}: ${errorBody}`
          )
        }

        return response.json()
      },
      {
        retries: 5,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 60000, // Allow up to 60s for rate limit waits
        randomize: true,

        // Custom retry logic that respects Retry-After headers
        onFailedAttempt: (error) => {
          console.log(
            `Gmail API attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber} failed: ${error.message}`
          )

          // If error has retry-after information, respect it
          if ((error as any).retryAfter) {
            const retryAfterMs = (error as any).retryAfter
            const exponentialDelayMs = Math.min(
              1000 * Math.pow(2, error.attemptNumber - 1),
              60000
            )

            // Use the longer of retry-after or exponential backoff
            const actualDelayMs = Math.max(retryAfterMs, exponentialDelayMs)

            console.log(
              `⏱️ Respecting Retry-After: ${retryAfterMs}ms, exponential: ${exponentialDelayMs}ms, using: ${actualDelayMs}ms`
            )

            // Override the default retry delay
            return new Promise((resolve) => setTimeout(resolve, actualDelayMs))
          }
        },
      }
    )
  }

  private parseRetryAfterHeader(response: Response): number {
    const retryAfter = response.headers.get("Retry-After")
    if (!retryAfter) {
      // Gmail typically resets quotas every minute for rate limits
      return 60000 // 60 seconds default
    }

    // Handle seconds format (most common)
    const retryAfterSeconds = parseInt(retryAfter, 10)
    if (!isNaN(retryAfterSeconds)) {
      return retryAfterSeconds * 1000 // Convert to milliseconds
    }

    // Handle HTTP date format (less common but RFC compliant)
    const retryAfterDate = new Date(retryAfter)
    if (!isNaN(retryAfterDate.getTime())) {
      return Math.max(0, retryAfterDate.getTime() - Date.now())
    }

    // Fallback for unparseable headers
    console.warn(
      `Could not parse Retry-After header: "${retryAfter}", using default 60s`
    )
    return 60000
  }

  private detectQuotaType(response: Response): string {
    // Check response headers and body for quota type hints
    const userAgent = response.headers.get("X-RateLimit-Remaining")
    if (userAgent === "0") {
      return "per-user quota"
    }

    const dailyLimit = response.headers.get("X-Daily-Limit-Remaining")
    if (dailyLimit === "0") {
      return "daily quota"
    }

    // Default to general rate limit
    return "rate limit"
  }

  async listMessages(userId: string) {
    return this.limiter.schedule(() =>
      this.breaker.fire("/users/me/messages", { userId })
    )
  }
}
```

### APFS Dataless File Handling

```typescript
import pRetry from "p-retry"
import pLimit from "p-limit"

class APFSHandler {
  private sequential = pLimit(1) // APFS requires sequential processing

  async downloadDatalessFile(filePath: string) {
    return this.sequential(() =>
      pRetry(
        async () => {
          const stats = await fs.stat(filePath)

          // Check if file is dataless
          if (this.isDataless(stats)) {
            // Trigger download from iCloud
            await this.triggerDownload(filePath)

            // Wait for download with timeout
            await this.waitForDownload(filePath, {
              timeout: 30000 + (stats.size / 1024 / 1024) * 2000, // Base + 2s per MB
              checkInterval: 100,
            })
          }

          return fs.readFile(filePath)
        },
        {
          retries: 10,
          factor: 1.5, // Less aggressive for local operations
          minTimeout: 100,
          maxTimeout: 5000,
          shouldRetry: (error: any) => {
            return (
              error.code === "EAGAIN" ||
              error.code === "EBUSY" ||
              error.message?.includes("dataless")
            )
          },
        }
      )
    )
  }
}
```

### Whisper Transcription

```typescript
import pRetry, { AbortError } from "p-retry"
import pLimit from "p-limit"
import CircuitBreaker from "opossum"

interface TranscriptionOptions {
  maxFileSizeBytes?: number
  timeoutMs?: number
  cleanup?: boolean
}

class WhisperClient {
  // Limit concurrent transcriptions to manage memory and cost
  private concurrent = pLimit(1) // Serialize for memory management
  private dailyBudget = 10.0
  private dailySpent = 0
  private breaker: CircuitBreaker
  private activeTranscriptions = new Set<AbortController>()

  constructor() {
    // Circuit breaker for Whisper API availability
    this.breaker = new CircuitBreaker(this.performTranscription.bind(this), {
      timeout: 300000, // 5 minutes for large files
      errorThresholdPercentage: 50,
      resetTimeout: 180000, // 3 minutes
      volumeThreshold: 5,
    })

    // Fallback for transcription failures
    this.breaker.fallback((audioFile: Buffer, fileName: string) => {
      console.log(
        `🔄 Transcription circuit open, falling back to placeholder for ${fileName}`
      )
      return {
        text: `[Transcription unavailable - ${fileName}]`,
        fallback: true,
        fileSize: audioFile.length,
        timestamp: new Date().toISOString(),
      }
    })

    // Memory monitoring events
    this.breaker.on("open", () => {
      console.log("🚫 Whisper circuit breaker OPEN - service unavailable")
      this.forceCleanupActiveTranscriptions()
    })

    this.breaker.on("halfOpen", () => {
      console.log(
        "🔌 Whisper circuit breaker HALF-OPEN - testing with single request"
      )
    })

    this.breaker.on("close", () => {
      console.log("✅ Whisper circuit breaker CLOSED - service recovered")
    })
  }

  async transcribe(
    audioFile: Buffer,
    fileName: string,
    options: TranscriptionOptions = {}
  ) {
    // Validate file size limits to prevent OOM
    const maxSize = options.maxFileSizeBytes || 25 * 1024 * 1024 // 25MB default
    if (audioFile.length > maxSize) {
      throw new AbortError(
        `File too large: ${audioFile.length} bytes (max: ${maxSize})`
      )
    }

    // Check memory before processing
    const memoryBefore = process.memoryUsage()
    if (memoryBefore.heapUsed > 200 * 1024 * 1024) {
      // 200MB threshold
      console.warn(
        `⚠️ High memory usage before transcription: ${Math.round(memoryBefore.heapUsed / 1024 / 1024)}MB`
      )

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
    }

    const cost = this.estimateCost(audioFile.length)
    if (this.dailySpent + cost > this.dailyBudget) {
      throw new AbortError(
        `Daily budget exceeded. Spent: $${this.dailySpent.toFixed(2)}, would cost: $${cost.toFixed(2)}`
      )
    }

    console.log(
      `🎤 Starting transcription: ${fileName} (${Math.round(audioFile.length / 1024)}KB, ~$${cost.toFixed(3)})`
    )

    return this.concurrent(() =>
      this.breaker.fire(audioFile, fileName, options)
    )
  }

  private async performTranscription(
    audioFile: Buffer,
    fileName: string,
    options: TranscriptionOptions
  ) {
    const abortController = new AbortController()
    this.activeTranscriptions.add(abortController)

    // Set up timeout based on file size
    const timeoutMs =
      options.timeoutMs || this.calculateTimeout(audioFile.length)
    const timeoutId = setTimeout(() => {
      console.warn(
        `⏰ Transcription timeout after ${timeoutMs}ms for ${fileName}`
      )
      abortController.abort()
    }, timeoutMs)

    try {
      return await pRetry(
        async (attemptNumber) => {
          if (abortController.signal.aborted) {
            throw new AbortError(
              "Transcription cancelled due to timeout or shutdown"
            )
          }

          console.log(
            `🔄 Transcription attempt ${attemptNumber} for ${fileName}`
          )

          // Memory check before each attempt
          const memoryUsage = process.memoryUsage()
          console.log(
            `📊 Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB heap, ${Math.round(memoryUsage.rss / 1024 / 1024)}MB RSS`
          )

          try {
            // Create FormData for file upload (requires memory allocation)
            const formData = new FormData()
            formData.append("file", new Blob([audioFile]), fileName)
            formData.append("model", "whisper-1")
            formData.append("language", "en")
            formData.append("response_format", "json")

            const response = await fetch(
              "https://api.openai.com/v1/audio/transcriptions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: formData,
                signal: abortController.signal,
              }
            )

            if (!response.ok) {
              if (response.status === 413) {
                throw new AbortError(
                  `File too large for Whisper API: ${fileName}`
                )
              }
              if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After")
                const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000
                console.log(`🚫 Whisper rate limited, waiting ${waitMs}ms`)
                await new Promise((resolve) => setTimeout(resolve, waitMs))
                throw new Error("Rate limited, retrying...")
              }
              if (response.status >= 500) {
                throw new Error(`Whisper server error: ${response.status}`)
              }
              throw new AbortError(
                `Whisper API error: ${response.status} ${response.statusText}`
              )
            }

            const result = await response.json()

            // Track spending
            const cost = this.estimateCost(audioFile.length)
            this.dailySpent += cost

            console.log(
              `✅ Transcribed ${fileName} - Daily spend: $${this.dailySpent.toFixed(2)}`
            )
            console.log(
              `📝 Result: ${result.text?.substring(0, 100)}${result.text?.length > 100 ? "..." : ""}`
            )

            return {
              text: result.text,
              fileName,
              cost,
              duration: result.duration,
              timestamp: new Date().toISOString(),
              memoryUsed: process.memoryUsage().heapUsed,
            }
          } finally {
            // Force cleanup of FormData and large objects
            if (options.cleanup !== false) {
              // Allow garbage collection
              setImmediate(() => {
                if (global.gc) {
                  global.gc()
                }
              })
            }
          }
        },
        {
          retries: 3,
          factor: 2,
          minTimeout: 5000, // Start with 5s for transcription retries
          maxTimeout: 60000, // Max 1 minute between retries
          randomize: true,
          onFailedAttempt: (error) => {
            console.log(
              `❌ Transcription attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber} failed for ${fileName}: ${error.message}`
            )

            // Cleanup memory between attempts
            if (global.gc) {
              global.gc()
            }

            // Check if we should abort due to resource constraints
            const memory = process.memoryUsage()
            if (memory.heapUsed > 300 * 1024 * 1024) {
              // 300MB
              console.error(
                `💥 Aborting transcription due to high memory usage: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`
              )
              throw new AbortError("Memory limit exceeded")
            }
          },
        }
      )
    } finally {
      clearTimeout(timeoutId)
      this.activeTranscriptions.delete(abortController)

      // Final cleanup
      if (options.cleanup !== false) {
        console.log(`🧹 Cleaning up transcription resources for ${fileName}`)
        setImmediate(() => {
          if (global.gc) {
            global.gc()
          }
        })
      }
    }
  }

  private calculateTimeout(fileSizeBytes: number): number {
    // Base timeout + additional time based on file size
    const baseTimeoutMs = 30000 // 30 seconds base
    const bytesPerSecond = 100000 // ~100KB/s processing estimate
    const processingTimeMs = (fileSizeBytes / bytesPerSecond) * 1000
    const bufferTimeMs = Math.min(processingTimeMs * 2, 240000) // 2x buffer, max 4 minutes

    return baseTimeoutMs + bufferTimeMs
  }

  private estimateCost(bytes: number): number {
    // Whisper pricing: $0.006 per minute of audio
    // Rough estimate: 16kHz * 2 bytes * 60 seconds = ~1.9MB per minute
    const estimatedMinutes = Math.ceil(bytes / (16000 * 2 * 60))
    return estimatedMinutes * 0.006
  }

  private forceCleanupActiveTranscriptions() {
    console.log(
      `🛑 Force cancelling ${this.activeTranscriptions.size} active transcriptions`
    )
    for (const controller of this.activeTranscriptions) {
      controller.abort()
    }
    this.activeTranscriptions.clear()

    // Force garbage collection
    if (global.gc) {
      global.gc()
    }
  }

  // Graceful shutdown method
  async shutdown() {
    console.log("🔄 Shutting down Whisper client...")

    // Cancel all active transcriptions
    this.forceCleanupActiveTranscriptions()

    // Wait for circuit breaker to settle
    if (this.breaker) {
      this.breaker.shutdown()
    }

    console.log("✅ Whisper client shutdown complete")
  }

  // Health check method
  getStatus() {
    return {
      activeTranscriptions: this.activeTranscriptions.size,
      dailySpent: this.dailySpent,
      dailyBudgetRemaining: this.dailyBudget - this.dailySpent,
      circuitBreakerState: this.breaker.opened
        ? "OPEN"
        : this.breaker.halfOpen
          ? "HALF_OPEN"
          : "CLOSED",
      memoryUsage: process.memoryUsage(),
    }
  }
}
```

## 5. Unified Resilience Wrapper

For cases where you need multiple resilience patterns together:

```typescript
import pRetry from "p-retry"
import CircuitBreaker from "opossum"
import Bottleneck from "bottleneck"

export interface ResilienceOptions {
  retry?: pRetry.Options
  circuitBreaker?: CircuitBreaker.Options
  rateLimit?: Bottleneck.ConstructorOptions
}

export class ResilientOperation<T> {
  private breaker?: CircuitBreaker
  private limiter?: Bottleneck

  constructor(
    private operation: (...args: any[]) => Promise<T>,
    private options: ResilienceOptions = {}
  ) {
    if (options.circuitBreaker) {
      this.breaker = new CircuitBreaker(operation, options.circuitBreaker)
    }

    if (options.rateLimit) {
      this.limiter = new Bottleneck(options.rateLimit)
    }
  }

  async execute(...args: any[]): Promise<T> {
    const retryWrapper = () => {
      if (this.options.retry) {
        return pRetry(() => this.operation(...args), this.options.retry)
      }
      return this.operation(...args)
    }

    const circuitWrapper = () => {
      if (this.breaker) {
        return this.breaker.fire(...args)
      }
      return retryWrapper()
    }

    if (this.limiter) {
      return this.limiter.schedule(circuitWrapper)
    }

    return circuitWrapper()
  }

  // Cleanup resources
  dispose() {
    if (this.breaker) {
      this.breaker.shutdown()
    }
    if (this.limiter) {
      this.limiter.disconnect()
    }
  }
}

// Usage example
const resilientFetch = new ResilientOperation(fetch, {
  retry: {
    retries: 5,
    factor: 2,
    minTimeout: 1000,
  },
  circuitBreaker: {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  },
  rateLimit: {
    minTime: 100,
    maxConcurrent: 5,
  },
})

const result = await resilientFetch("https://api.example.com/data")
```

## 6. Testing Resilience

### Testing Retry Logic

```typescript
import { describe, it, expect, vi } from "vitest"
import pRetry from "p-retry"

describe("Retry Logic", () => {
  it("should retry on transient failures", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValue("Success")

    const result = await pRetry(operation, {
      retries: 3,
      minTimeout: 10, // Speed up tests
    })

    expect(result).toBe("Success")
    expect(operation).toHaveBeenCalledTimes(3)
  })
})
```

### Testing Circuit Breaker

```typescript
describe("Circuit Breaker", () => {
  it("should open circuit after threshold", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Service down"))

    const breaker = new CircuitBreaker(operation, {
      errorThresholdPercentage: 50,
      volumeThreshold: 4,
      resetTimeout: 100,
    })

    // Fail 4 times to trigger circuit open
    for (let i = 0; i < 4; i++) {
      await expect(breaker.fire()).rejects.toThrow()
    }

    // Circuit should be open now
    expect(breaker.opened).toBe(true)

    // Next call should fail immediately without calling operation
    await expect(breaker.fire()).rejects.toThrow("Breaker is open")
    expect(operation).toHaveBeenCalledTimes(4) // Not called again
  })
})
```

### Testing Rate Limiter

```typescript
describe("Rate Limiter", () => {
  it("should respect rate limits", async () => {
    const limiter = new Bottleneck({
      minTime: 100, // 100ms between calls
    })

    const startTime = Date.now()
    const operation = vi.fn().mockResolvedValue("Done")

    await Promise.all([
      limiter.schedule(operation),
      limiter.schedule(operation),
      limiter.schedule(operation),
    ])

    const elapsed = Date.now() - startTime
    expect(elapsed).toBeGreaterThanOrEqual(200) // At least 200ms for 3 calls
    expect(operation).toHaveBeenCalledTimes(3)
  })
})
```

## 7. Monitoring and Observability

```typescript
// Track resilience metrics
class ResilienceMetrics {
  private metrics = new Map<string, number>()

  trackRetry(service: string, attempt: number, success: boolean) {
    this.increment(`${service}.retry.attempt.${attempt}`)
    this.increment(`${service}.retry.${success ? "success" : "failure"}`)
  }

  trackCircuitBreaker(service: string, state: "open" | "closed" | "halfOpen") {
    this.increment(`${service}.circuit.${state}`)
  }

  trackRateLimit(service: string, event: "scheduled" | "dropped" | "executed") {
    this.increment(`${service}.ratelimit.${event}`)
  }

  private increment(key: string) {
    this.metrics.set(key, (this.metrics.get(key) || 0) + 1)
  }

  report() {
    console.table(
      Array.from(this.metrics.entries()).map(([key, value]) => ({
        metric: key,
        count: value,
      }))
    )
  }
}
```

## 8. Performance Impact Analysis

### 8.1 Resilience Pattern Overhead

Understanding the performance cost of resilience patterns helps make informed decisions:

#### Circuit Breaker Overhead

```typescript
// Performance benchmark for circuit breaker overhead
import CircuitBreaker from "opossum"

async function benchmarkCircuitBreaker() {
  const directOperation = async () => "result"
  const breakerOperation = new CircuitBreaker(directOperation, {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 10000,
  })

  // Warm up
  for (let i = 0; i < 100; i++) {
    await directOperation()
    await breakerOperation.fire()
  }

  // Benchmark direct calls
  const directStart = process.hrtime.bigint()
  for (let i = 0; i < 1000; i++) {
    await directOperation()
  }
  const directEnd = process.hrtime.bigint()

  // Benchmark circuit breaker calls
  const breakerStart = process.hrtime.bigint()
  for (let i = 0; i < 1000; i++) {
    await breakerOperation.fire()
  }
  const breakerEnd = process.hrtime.bigint()

  const directTimeMs = Number(directEnd - directStart) / 1000000
  const breakerTimeMs = Number(breakerEnd - breakerStart) / 1000000

  console.log(
    `Direct calls: ${directTimeMs.toFixed(2)}ms (avg: ${(directTimeMs / 1000).toFixed(4)}ms per call)`
  )
  console.log(
    `Circuit breaker: ${breakerTimeMs.toFixed(2)}ms (avg: ${(breakerTimeMs / 1000).toFixed(4)}ms per call)`
  )
  console.log(
    `Overhead: ${(((breakerTimeMs - directTimeMs) / directTimeMs) * 100).toFixed(1)}%`
  )

  breakerOperation.shutdown()
}

// Typical results:
// - Circuit breaker adds ~0.02-0.05ms per call
// - Memory overhead: ~50KB per circuit breaker instance
// - CPU overhead: 2-5% for high-frequency operations
```

#### Rate Limiter Performance Impact

```typescript
import Bottleneck from "bottleneck"

async function benchmarkRateLimiter() {
  const operation = async () => "result"

  // No rate limiting
  const unlimited = async () => operation()

  // With rate limiting
  const limiter = new Bottleneck({
    minTime: 10, // 100 requests/second max
    maxConcurrent: 5,
  })
  const limitedOperation = () => limiter.schedule(operation)

  // Benchmark 100 requests
  const requests = Array(100).fill(0)

  const unlimitedStart = Date.now()
  await Promise.all(requests.map(() => unlimited()))
  const unlimitedTime = Date.now() - unlimitedStart

  const limitedStart = Date.now()
  await Promise.all(requests.map(() => limitedOperation()))
  const limitedTime = Date.now() - limitedStart

  console.log(`Unlimited: ${unlimitedTime}ms`)
  console.log(`Rate limited: ${limitedTime}ms`)
  console.log(
    `Throughput reduction: ${(((limitedTime - unlimitedTime) / unlimitedTime) * 100).toFixed(1)}%`
  )

  await limiter.disconnect()
}

// Expected results for 100 requests at 100/sec limit:
// - Adds minimum 1000ms delay (10ms * 100 requests)
// - Memory: ~30KB per Bottleneck instance
// - Throughput control is the primary performance "cost"
```

#### Retry Pattern Overhead

```typescript
import pRetry from "p-retry"

async function benchmarkRetryPattern() {
  let callCount = 0
  const successfulOperation = async () => {
    callCount++
    return "success"
  }

  const failingOperation = async () => {
    callCount++
    if (callCount < 3) throw new Error("Temporary failure")
    return "success"
  }

  // Reset counter
  callCount = 0

  // Benchmark successful operation (no retries)
  const successStart = Date.now()
  await pRetry(successfulOperation, { retries: 3 })
  const successTime = Date.now() - successStart

  console.log(`Successful (no retries): ${successTime}ms, calls: ${callCount}`)

  // Reset counter
  callCount = 0

  // Benchmark failing operation (with retries)
  const retryStart = Date.now()
  await pRetry(failingOperation, {
    retries: 3,
    minTimeout: 100,
    maxTimeout: 1000,
    factor: 2,
  })
  const retryTime = Date.now() - retryStart

  console.log(`With retries: ${retryTime}ms, calls: ${callCount}`)
  console.log(
    `Retry overhead: ${retryTime - successTime}ms (includes backoff delays)`
  )
}

// Typical results:
// - Successful: <1ms overhead
// - Failed operations: Backoff delays dominate (100ms + 200ms + 400ms = 700ms)
// - Memory: Minimal overhead per retry attempt
```

### 8.2 Performance Budgets for ADHD Brain

Based on user experience requirements and system constraints:

#### Response Time Budgets

```typescript
const PERFORMANCE_BUDGETS = {
  // CLI Commands (user-facing)
  CLI_COMMANDS: {
    maxResponseTime: 2000, // 2 seconds for ADHD-friendly UX
    retryBudget: 500, // Max 500ms for retries
    circuitBreakerOverhead: 50, // Max 50ms
  },

  // Background Processing
  BACKGROUND_PROCESSING: {
    maxResponseTime: 30000, // 30 seconds for captures
    retryBudget: 10000, // Up to 10s for retries
    circuitBreakerOverhead: 100, // Max 100ms
  },

  // External API Calls
  EXTERNAL_APIS: {
    gmail: {
      maxResponseTime: 15000, // 15s including retries
      retryBudget: 10000, // 10s for retries/backoffs
      rateLimitOverhead: 5000, // 5s buffer for rate limiting
    },
    whisper: {
      maxResponseTime: 300000, // 5 minutes for large files
      retryBudget: 60000, // 1 minute for retries
      memoryCleanupTime: 5000, // 5s for cleanup between attempts
    },
  },
}

// Budget validation function
function validatePerformanceBudget(operation: string, actualTime: number) {
  const budget = PERFORMANCE_BUDGETS[operation]
  if (!budget) return

  if (actualTime > budget.maxResponseTime) {
    console.warn(
      `⚠️ Performance budget exceeded for ${operation}: ${actualTime}ms > ${budget.maxResponseTime}ms`
    )
  }
}
```

#### Memory Budget Guidelines

```typescript
const MEMORY_BUDGETS = {
  // Per-operation memory limits
  OPERATION_LIMITS: {
    voiceFileProcessing: 50 * 1024 * 1024, // 50MB per voice file
    transcriptionBuffer: 100 * 1024 * 1024, // 100MB for transcription
    resilenceComponents: 10 * 1024 * 1024, // 10MB for all resilience instances
  },

  // System-wide limits
  SYSTEM_LIMITS: {
    totalHeapUsage: 200 * 1024 * 1024, // 200MB total heap
    resilienceOverhead: 5 * 1024 * 1024, // 5MB max for resilience libraries
  },
}

// Memory monitoring for performance
class PerformanceMonitor {
  private baselines = new Map<string, number>()

  startOperation(name: string) {
    this.baselines.set(name, process.memoryUsage().heapUsed)
  }

  endOperation(name: string) {
    const current = process.memoryUsage().heapUsed
    const baseline = this.baselines.get(name) || 0
    const memoryDelta = current - baseline

    const budget = MEMORY_BUDGETS.OPERATION_LIMITS[name]
    if (budget && memoryDelta > budget) {
      console.warn(
        `⚠️ Memory budget exceeded for ${name}: ${Math.round(memoryDelta / 1024 / 1024)}MB > ${Math.round(budget / 1024 / 1024)}MB`
      )
    }

    this.baselines.delete(name)
    return memoryDelta
  }
}
```

### 8.3 Optimization Strategies

#### Smart Circuit Breaker Tuning

```typescript
// Adaptive circuit breaker that adjusts based on performance
class AdaptiveCircuitBreaker extends CircuitBreaker {
  private performanceHistory: number[] = []

  constructor(operation: Function, options: any) {
    super(operation, {
      ...options,
      // Start with conservative settings
      timeout: options.timeout || 5000,
      errorThresholdPercentage: 50,
    })

    this.on("success", (result, latency) => {
      this.recordPerformance(latency)
      this.adjustSettings()
    })
  }

  private recordPerformance(latency: number) {
    this.performanceHistory.push(latency)

    // Keep only last 100 measurements
    if (this.performanceHistory.length > 100) {
      this.performanceHistory.shift()
    }
  }

  private adjustSettings() {
    if (this.performanceHistory.length < 10) return

    const avgLatency =
      this.performanceHistory.reduce((a, b) => a + b) /
      this.performanceHistory.length
    const p95Latency = this.performanceHistory.sort((a, b) => a - b)[
      Math.floor(this.performanceHistory.length * 0.95)
    ]

    // Adjust timeout based on actual performance
    const newTimeout = Math.max(p95Latency * 2, 1000) // 2x P95, min 1s

    if (Math.abs(newTimeout - this.options.timeout) > 1000) {
      // Only adjust if significant change
      console.log(
        `🔧 Adjusting circuit breaker timeout: ${this.options.timeout}ms → ${newTimeout}ms (P95: ${p95Latency}ms)`
      )
      this.options.timeout = newTimeout
    }
  }
}
```

#### Rate Limiter Efficiency

```typescript
// Shared rate limiter pool to reduce memory overhead
class RateLimiterPool {
  private static pools = new Map<string, Bottleneck>()

  static getSharedLimiter(
    service: string,
    config: Bottleneck.ConstructorOptions
  ): Bottleneck {
    const key = `${service}-${JSON.stringify(config)}`

    if (!this.pools.has(key)) {
      console.log(`📊 Creating shared rate limiter for ${service}`)
      this.pools.set(key, new Bottleneck(config))
    }

    return this.pools.get(key)!
  }

  static async shutdown() {
    for (const [key, limiter] of this.pools) {
      console.log(`🔄 Shutting down shared limiter: ${key}`)
      await limiter.disconnect()
    }
    this.pools.clear()
  }
}

// Usage: Share limiters across similar operations
const gmailLimiter = RateLimiterPool.getSharedLimiter("gmail", {
  minTime: 12,
  maxConcurrent: 10,
})
```

### 8.4 Performance Testing Integration

```typescript
// Performance test suite for resilience patterns
export class ResiliencePerformanceTests {
  async runPerformanceSuite() {
    console.log("🏃 Running resilience performance tests...")

    const results = {
      circuitBreaker: await this.testCircuitBreakerOverhead(),
      rateLimiter: await this.testRateLimiterThroughput(),
      retryPattern: await this.testRetryLatency(),
      memoryUsage: await this.testMemoryFootprint(),
    }

    this.generatePerformanceReport(results)
    return results
  }

  private async testCircuitBreakerOverhead() {
    // Implementation for circuit breaker performance tests
    return { overheadMs: 0.05, memoryKB: 50 }
  }

  private async testRateLimiterThroughput() {
    // Implementation for rate limiter performance tests
    return { throughputReduction: 5, memoryKB: 30 }
  }

  private async testRetryLatency() {
    // Implementation for retry pattern performance tests
    return { successOverheadMs: 1, failureDelayMs: 700 }
  }

  private async testMemoryFootprint() {
    // Implementation for memory usage tests
    return { totalKB: 100, perInstanceKB: 25 }
  }

  private generatePerformanceReport(results: any) {
    console.log("📊 Resilience Performance Report:")
    console.table(results)
  }
}
```

## 9. Memory Leak Prevention and Resource Cleanup

### 8.1 Circuit Breaker Lifecycle Management

Circuit breakers create timers and event listeners that must be properly cleaned up:

```typescript
import CircuitBreaker from "opossum"

class ManagedCircuitBreaker {
  private breaker: CircuitBreaker
  private cleanupCallbacks: (() => void)[] = []

  constructor(operation: Function, options: any) {
    this.breaker = new CircuitBreaker(operation, options)
    this.setupEventListeners()
  }

  private setupEventListeners() {
    // Track cleanup callbacks for all listeners
    const onOpen = () => console.log("Circuit opened")
    const onClose = () => console.log("Circuit closed")
    const onHalfOpen = () => console.log("Circuit half-open")

    this.breaker.on("open", onOpen)
    this.breaker.on("close", onClose)
    this.breaker.on("halfOpen", onHalfOpen)

    // Store cleanup functions
    this.cleanupCallbacks.push(
      () => this.breaker.removeListener("open", onOpen),
      () => this.breaker.removeListener("close", onClose),
      () => this.breaker.removeListener("halfOpen", onHalfOpen)
    )
  }

  // CRITICAL: Always call this when done
  destroy() {
    // Remove all event listeners
    this.cleanupCallbacks.forEach((cleanup) => cleanup())
    this.cleanupCallbacks = []

    // Clear internal timers and state
    this.breaker.shutdown()
  }

  // Proxy common methods
  fire(...args: any[]) {
    return this.breaker.fire(...args)
  }

  get opened() {
    return this.breaker.opened
  }
}

// Usage with automatic cleanup
class ServiceManager {
  private breakers = new Map<string, ManagedCircuitBreaker>()

  createBreaker(name: string, operation: Function, options: any) {
    if (this.breakers.has(name)) {
      this.breakers.get(name)?.destroy()
    }

    const breaker = new ManagedCircuitBreaker(operation, options)
    this.breakers.set(name, breaker)
    return breaker
  }

  // Call this on app shutdown
  shutdown() {
    for (const breaker of this.breakers.values()) {
      breaker.destroy()
    }
    this.breakers.clear()
  }
}
```

### 8.2 Rate Limiter Cleanup Patterns

Bottleneck instances maintain internal state and timers that need cleanup:

```typescript
import Bottleneck from "bottleneck"

class ManagedRateLimiter {
  private limiter: Bottleneck

  constructor(options: Bottleneck.ConstructorOptions) {
    this.limiter = new Bottleneck(options)
  }

  // Proxy schedule method
  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(fn)
  }

  // CRITICAL: Cleanup method
  async destroy() {
    // Stop accepting new jobs
    this.limiter.stop()

    // Wait for all pending jobs to complete (with timeout)
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Limiter shutdown timeout")), 5000)
    })

    const shutdownPromise = this.limiter.disconnect()

    try {
      await Promise.race([shutdownPromise, timeoutPromise])
    } catch (error) {
      console.warn("Rate limiter shutdown timeout, forcing disconnect")
      // Force disconnect if graceful shutdown fails
      this.limiter.disconnect()
    }
  }

  // Get current queue status for monitoring
  getStatus() {
    return {
      running: this.limiter.running(),
      queued: this.limiter.queued(),
    }
  }
}

// Service-level rate limiter management
class RateLimiterRegistry {
  private limiters = new Map<string, ManagedRateLimiter>()

  create(
    name: string,
    options: Bottleneck.ConstructorOptions
  ): ManagedRateLimiter {
    // Clean up existing limiter if it exists
    if (this.limiters.has(name)) {
      this.limiters.get(name)?.destroy()
    }

    const limiter = new ManagedRateLimiter(options)
    this.limiters.set(name, limiter)
    return limiter
  }

  get(name: string): ManagedRateLimiter | undefined {
    return this.limiters.get(name)
  }

  // Graceful shutdown of all limiters
  async shutdownAll() {
    const shutdownPromises = Array.from(this.limiters.values()).map((limiter) =>
      limiter.destroy()
    )

    await Promise.allSettled(shutdownPromises)
    this.limiters.clear()
  }
}
```

### 8.3 Memory-Safe Retry Operations

Prevent memory leaks in long-running retry operations:

```typescript
import pRetry, { AbortError } from "p-retry"

class MemorySafeRetrier {
  private abortController = new AbortController()

  async retryWithCleanup<T>(
    operation: () => Promise<T>,
    options: pRetry.Options = {}
  ): Promise<T> {
    const signal = this.abortController.signal

    return pRetry(
      async (attemptNumber) => {
        // Check if operation was cancelled
        if (signal.aborted) {
          throw new AbortError("Operation cancelled")
        }

        try {
          const result = await operation()

          // Clear any cached data between retries if needed
          if (global.gc && attemptNumber > 1) {
            global.gc() // Force garbage collection in dev/test
          }

          return result
        } catch (error) {
          // Convert permanent errors to AbortError to stop retrying
          if (isPermanentError(error)) {
            throw new AbortError(error.message)
          }
          throw error
        }
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
        randomize: true,
        ...options,
        onFailedAttempt: (error) => {
          console.log(`Attempt ${error.attemptNumber} failed: ${error.message}`)

          // Custom cleanup between retries
          if (options.onFailedAttempt) {
            options.onFailedAttempt(error)
          }

          // Force cleanup of large objects between retries
          if (error.attemptNumber > 1) {
            // Allow garbage collection
            setImmediate(() => {})
          }
        },
      }
    )
  }

  // Cancel all pending operations
  cancel() {
    this.abortController.abort()
  }

  // Create new controller for new operations
  reset() {
    this.abortController = new AbortController()
  }
}

function isPermanentError(error: any): boolean {
  // Add your permanent error detection logic
  return error.code === "ENOENT" || error.status === 404 || error.status === 403
}
```

### 8.4 Application-Level Resource Management

Integrate cleanup into application lifecycle:

```typescript
class ResilienceManager {
  private serviceManager = new ServiceManager()
  private rateLimiterRegistry = new RateLimiterRegistry()
  private retrierPool = new Set<MemorySafeRetrier>()

  // Initialize resilience components
  init() {
    // Setup Gmail API resilience
    const gmailBreaker = this.serviceManager.createBreaker(
      "gmail",
      gmailOperation,
      { timeout: 30000, errorThresholdPercentage: 50 }
    )

    const gmailLimiter = this.rateLimiterRegistry.create("gmail", {
      minTime: 12,
      maxConcurrent: 10,
      reservoir: 80,
      reservoirRefreshInterval: 1000,
      reservoirRefreshAmount: 80,
    })

    // Setup process exit handlers
    process.on("SIGTERM", () => this.gracefulShutdown())
    process.on("SIGINT", () => this.gracefulShutdown())
  }

  createRetrier(): MemorySafeRetrier {
    const retrier = new MemorySafeRetrier()
    this.retrierPool.add(retrier)
    return retrier
  }

  removeRetrier(retrier: MemorySafeRetrier) {
    retrier.cancel()
    this.retrierPool.delete(retrier)
  }

  // CRITICAL: Call this on app shutdown
  async gracefulShutdown() {
    console.log("Starting graceful shutdown of resilience components...")

    // Cancel all pending retries
    for (const retrier of this.retrierPool) {
      retrier.cancel()
    }
    this.retrierPool.clear()

    // Shutdown rate limiters
    await this.rateLimiterRegistry.shutdownAll()

    // Shutdown circuit breakers
    this.serviceManager.shutdown()

    console.log("Resilience components shutdown complete")
  }
}

// Global instance for application use
export const resilienceManager = new ResilienceManager()

// Usage example with proper cleanup
export async function processWithResilience<T>(
  operation: () => Promise<T>
): Promise<T> {
  const retrier = resilienceManager.createRetrier()

  try {
    return await retrier.retryWithCleanup(operation)
  } finally {
    resilienceManager.removeRetrier(retrier)
  }
}
```

### 8.5 Memory Monitoring and Leak Detection

Add monitoring to detect memory issues early:

```typescript
class MemoryMonitor {
  private intervalId?: NodeJS.Timeout

  startMonitoring(intervalMs = 10000) {
    this.intervalId = setInterval(() => {
      const usage = process.memoryUsage()

      console.log({
        timestamp: new Date().toISOString(),
        rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      })

      // Alert if memory usage is concerning
      if (usage.heapUsed > 100 * 1024 * 1024) {
        // 100MB
        console.warn("⚠️  High memory usage detected")
      }
    }, intervalMs)
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }
}

// Integrate into resilience manager
const memoryMonitor = new MemoryMonitor()
memoryMonitor.startMonitoring(30000) // Monitor every 30 seconds
```

## Best Practices

### DO:

- ✅ Use AbortError for permanent failures that shouldn't retry
- ✅ Add jitter (randomize: true) to prevent thundering herd
- ✅ Provide fallbacks for circuit breakers
- ✅ Monitor circuit breaker state changes
- ✅ Use sequential processing for APFS operations
- ✅ Set appropriate timeouts based on operation type
- ✅ **ALWAYS clean up circuit breakers with shutdown()**
- ✅ **ALWAYS disconnect rate limiters with disconnect()**
- ✅ **Cancel retry operations on app shutdown**
- ✅ **Monitor memory usage in production**
- ✅ **Use AbortController for cancellable operations**

### DON'T:

- ❌ Retry 4xx errors (except 429)
- ❌ Use aggressive retry without backoff
- ❌ Ignore circuit breaker events
- ❌ Set rate limits at theoretical maximums
- ❌ Mix sequential and parallel operations carelessly
- ❌ Forget to handle dropped requests in rate limiters
- ❌ **Leave circuit breakers running without cleanup**
- ❌ **Forget to disconnect rate limiters on shutdown**
- ❌ **Create new resilience instances without cleaning up old ones**
- ❌ **Run memory-intensive operations without monitoring**

## Conclusion

This production-ready resilience stack provides robust error handling with minimal complexity. Each library is best-in-class for its specific pattern, with strong TypeScript support and active maintenance. The modular approach allows you to use only what you need, keeping bundle sizes small and code maintainable.

Remember: Resilience isn't about preventing failures—it's about recovering gracefully when they occur. These libraries provide the tools; your application logic determines the policy.
