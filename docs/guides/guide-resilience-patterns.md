---
title: Resilience Patterns Guide
doc_type: guide
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-29
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Resilience Patterns Guide

> **Pattern-focused resilience strategies for the ADHD Brain capture system - conceptual approaches without implementation constraints**
>
> **Alignment**: Supports MPPP requirements for graceful error recovery and sequential processing resilience
>
> **Cross-References**:
> - Master PRD: [prd-master.md](../master/prd-master.md)
> - Roadmap: [roadmap.md](../master/roadmap.md)
> - Capture Tech Spec: [spec-capture-tech.md](../features/capture/spec-capture-tech.md)

## 1. Overview

### Why Resilience Matters for ADHD Users

ADHD users face unique challenges that make resilience critical:
- **Fragmented attention** makes it hard to retry failed operations manually
- **Executive dysfunction** means forgetting to check if something succeeded
- **Time blindness** leads to not noticing when things are stuck
- **Rejection sensitivity** makes error messages feel like personal failures

The system must handle failures gracefully without requiring user intervention or causing anxiety.

### How Resilience Patterns Prevent Data Loss

Every captured thought represents a moment of clarity for an ADHD brain. Losing even one means:
- A potentially important idea is gone forever
- User trust in the system erodes
- The cognitive burden of "did that work?" increases

Resilience patterns ensure that temporary failures don't become permanent losses.

### The Philosophy: "Fail Gracefully, Recover Automatically"

Core principles:
- **Silent recovery** - Fix problems without alerting unless absolutely necessary
- **Progressive degradation** - Partial success is better than total failure
- **Automatic healing** - Systems should self-recover when conditions improve
- **Clear boundaries** - Know when to stop trying and preserve resources

## 2. Core Resilience Patterns

### Error Classification Pattern

Errors aren't equal. Different categories require different responses:

#### Categories

**Transient Errors**
- Network timeouts, temporary service unavailability
- Decision: Retry with backoff
- Example indicators: Connection refused, timeout exceeded

**Permanent Errors**
- Invalid credentials, resource not found, permission denied
- Decision: Fail fast, notify user
- Example indicators: 404, 403 (without rate limiting), invalid format

**Rate-Limited Errors**
- Too many requests, quota exceeded
- Decision: Back off exponentially, respect retry-after headers
- Example indicators: 429, quota exceeded messages

**Auth-Failed Errors**
- Token expired, session invalid
- Decision: Attempt refresh once, then fail
- Example indicators: 401, token expired

#### Decision Trees

**Transient Error Decision Tree:**
1. Is this the first failure? → Retry immediately
2. Have we retried < 3 times? → Wait with backoff, retry
3. Has total time exceeded threshold? → Fail permanently
4. Otherwise → Continue retrying with increasing delays

**Rate-Limited Decision Tree:**
1. Does response include retry-after? → Wait exact duration
2. Is this service-specific rate limit? → Use service knowledge
3. Otherwise → Exponential backoff starting at 1 second

### Retry Strategy Patterns

Different operations require different retry approaches:

#### Linear Backoff
**For:** Local file operations, database queries
**Pattern:** Fixed delay between attempts (e.g., 100ms, 100ms, 100ms)
**Rationale:** Local resources recover quickly, no network congestion concerns

#### Exponential Backoff
**For:** Network API calls, cloud services
**Pattern:** Doubling delay (1s, 2s, 4s, 8s...)
**Rationale:** Reduces load on struggling services, respects rate limits

#### Adaptive Backoff
**For:** Services with unpredictable behavior
**Pattern:** Adjust based on success/failure patterns
**Rationale:** Learn optimal retry timing from actual behavior

#### When to Use Each Pattern

- **Linear:** Resource is local or highly available
- **Exponential:** Resource is shared or rate-limited
- **Adaptive:** Resource behavior varies by time/load

### Circuit Breaker Pattern

Prevents cascade failures and resource exhaustion:

#### When to Open (Failure Threshold)
- 5 consecutive failures
- 50% failure rate over last 20 attempts
- Critical service dependency unavailable

#### When to Close (Success Threshold)
- After fixed time period (e.g., 30 seconds)
- After successful health check
- Manual reset by administrator

#### Half-Open State Strategy
- Allow single test request
- If successful, gradually increase allowed requests
- If failed, return to open state

#### Service-Specific Considerations
- **External APIs:** Longer open periods (minutes)
- **Local services:** Shorter open periods (seconds)
- **Critical paths:** More conservative thresholds

### Timeout Patterns

Prevent operations from hanging indefinitely:

#### Fixed Timeouts
**For:** Predictable operations
**Example:** Database queries (5 seconds), local file reads (1 second)
**Strategy:** Set based on 99th percentile of normal operations

#### Progressive Timeouts
**For:** Retry sequences
**Example:** 5s, 10s, 20s, 40s
**Strategy:** Increase timeout with each retry attempt

#### Adaptive Timeouts
**For:** Variable operations
**Example:** File downloads, media processing
**Strategy:** Base timeout = fixed_base + (size_factor × file_size_mb)

## 3. Service-Specific Strategies

### Gmail API

**Rate Limit Strategy:**
- Conservative baseline: 80 requests/second (real-world safe)
- Theoretical limit: 250 req/s (avoid - causes throttling)
- Burst allowance: 100 requests over 2 seconds
- Sustained rate: 50 req/s for extended operations

**Token Management:**
- Refresh window: 15 minutes before expiry
- Fallback: Immediate refresh on 401
- Storage: Secure, encrypted token cache

**Error Pattern Responses:**
- **429 (Rate Limited):** Exponential backoff starting at 1 second
- **401 (Unauthorized):** Refresh token once, fail if still 401
- **403 (Forbidden):** Check scopes, likely permanent failure
- **500 (Server Error):** Retry with exponential backoff
- **503 (Service Unavailable):** Check retry-after header, backoff

### iCloud Downloads

**Common Failure Patterns:**
- **NSURLErrorDomain -1009:** Network unavailable - wait and retry
- **Dataless files:** Incomplete download - verify and re-download
- **Session timeouts:** Re-establish session, resume download

**Progressive Timeout Strategy:**
- Base: 30 seconds for connection
- Per-MB: +2 seconds per megabyte
- Maximum: 5 minutes regardless of size

**Sequential Download Requirement:**
- No parallel downloads (Apple limitation)
- Queue management with priority ordering
- Checkpoint after each successful download

**APFS-Specific Considerations:**
- Copy-on-write awareness for temporary files
- Atomic moves for completed downloads
- Space pre-allocation for large files

### Whisper Transcription

**Cost Control Strategy:**
- Daily budget: $10 maximum
- Per-file cost calculation before processing
- Budget tracking across all transcriptions
- Graceful degradation when budget exceeded

**File Size Management:**
- Maximum chunk: 25MB (API limit)
- Chunking strategy: Natural speech boundaries
- Overlap handling: 5-second buffers

**Timeout Calculation:**
- Base timeout: 30 seconds
- Size factor: 3 seconds per MB
- Quality factor: 2x for high-quality mode
- Maximum: 10 minutes per chunk

**Caching Strategy:**
- Retention: 7 days for transcriptions
- Key: File hash + model + language
- Invalidation: On file modification

### Vault Operations

**File Lock Handling:**
- Detection: Check for .lock files
- Wait strategy: Linear backoff (100ms intervals)
- Maximum wait: 5 seconds
- Forceful override: After user confirmation only

**Write Collision Prevention:**
- Pre-write check: File modification time
- Atomic writes: Write to temp, then move
- Verification: Read-after-write confirmation

**Corruption Detection:**
- Checksum validation before operations
- Backup before destructive changes
- Recovery: Restore from automatic backups

**Consistency Guarantees:**
- Sequential writes only
- Transaction log for multi-file operations
- Rollback capability on partial failures

## 4. MPPP Sequential Processing Constraints

Sequential systems require special resilience considerations:

### No Parallel Recovery
- Single retry thread prevents race conditions
- Ordered retry queue maintains sequence
- Failed items block subsequent processing

### Checkpoint/Restart Patterns
- Persistent state after each successful operation
- Resume from exact failure point
- No reprocessing of completed items

### Queue Management Without Concurrency
- FIFO processing with priority lanes
- Backpressure through queue size limits
- Dead letter queue for permanent failures

### Backpressure Strategies
- Pause ingestion when queue exceeds threshold
- Gradual resumption as queue drains
- User notification at critical levels

## 5. Architectural Mapping

Planning where resilience patterns will live:

### Foundation Package
- Error type definitions
- Base error classification logic
- Common error utilities

### Core Package
- Retry orchestration logic
- Backoff calculations
- Circuit breaker implementation

### Storage Package
- Database connection resilience
- Transaction retry logic
- Consistency verification

### Capture Package
- Service-specific retry policies
- Orchestration of resilience patterns
- User-facing error messages

## 6. Testing Strategies (Conceptual)

### Failure Injection Points
- Network layer interruption
- Service response manipulation
- Timeout simulation
- Rate limit triggering

### Recovery Verification
- Successful retry after transient failure
- Proper backoff timing
- Circuit breaker state transitions
- Data integrity after recovery

### Order Preservation
- Sequential processing maintained
- No message reordering during retry
- Checkpoint accuracy

### Data Integrity
- No data loss during failures
- No duplicate processing
- Consistent state after recovery

## 7. Monitoring & Alerting (Conceptual)

### Error Rates by Category
- Transient vs permanent ratio
- Service-specific error distributions
- Time-based error patterns

### Circuit Breaker States
- Open/closed/half-open transitions
- Duration in each state
- Recovery success rates

### Retry Attempt Distributions
- Average retries to success
- Maximum retry chains
- Retry abandonment rates

### Recovery Success Rates
- Percentage recovered vs failed
- Time to recovery metrics
- Cost of recovery (resources used)

## Best Practices

### For Planning Phase
1. Document patterns, not implementations
2. Focus on decision logic, not code
3. Consider ADHD user needs first
4. Plan for graceful degradation

### For Future Implementation
1. Start with simple patterns, evolve as needed
2. Measure everything, optimize based on data
3. Prefer configuration over hard-coding
4. Make resilience transparent to users

### For Testing
1. Test failure paths as thoroughly as success paths
2. Simulate real-world failure scenarios
3. Verify recovery doesn't corrupt state
4. Ensure monitoring catches all failure modes

## Conclusion

Resilience isn't about preventing all failures - it's about recovering gracefully when they occur. For ADHD users, this means the difference between a tool they can trust and one that adds to their cognitive burden.

These patterns provide a conceptual framework for building resilience into the ADHD Brain system without constraining implementation choices. The focus remains on user experience and data integrity rather than technical elegance.

Remember: Every retry is an opportunity to succeed, every backoff prevents cascade failure, and every circuit breaker protects both the system and the user's peace of mind.