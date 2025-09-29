---
adr: 0030
title: Resilience Library Selection (Production-Ready Modular Stack)
status: accepted
context-date: 2025-09-29
owner: Nathan
spec_type: adr
version: 1.0.0
---

# ADR 0030: Resilience Library Selection (Production-Ready Modular Stack)

## Status

**Accepted**

## Context

The @orchestr8/resilience package has incompatible workspace dependencies and lacks community support, causing immediate dependency conflicts in the ADHD Brain project. The project requires robust resilience patterns for:

- **Gmail API**: Rate limiting at 80 req/s with exponential backoff for 429 errors
- **iCloud APFS**: Sequential processing for dataless file downloads
- **Whisper Transcription**: Memory-safe processing with cost controls
- **Database Operations**: Transaction retry and timeout handling

Current technical constraints:
- Phase 1 MPPP scope requires simple, reliable solutions
- Strong TypeScript support mandatory
- ADHD-friendly error reporting and progress feedback
- Bundle size optimization required
- Active maintenance and community trust essential

The existing @orchestr8/resilience implementation provides basic patterns but:
- Has stale dependencies causing workspace conflicts
- Lacks comprehensive TypeScript definitions
- Has minimal community adoption (unknown download counts)
- Provides limited configuration flexibility
- No ADHD-specific user experience considerations

## Decision

Replace @orchestr8/resilience with a curated stack of production-ready, specialized libraries:

### Core Library Stack

```typescript
{
  "dependencies": {
    // Retry with exponential backoff and jitter
    "p-retry": "^6.2.0",          // 28M+ weekly downloads, Sindre Sorhus

    // Circuit breaker pattern
    "opossum": "^9.0.0",          // 350K+ weekly downloads, Red Hat supported

    // Rate limiting and throttling
    "bottleneck": "^2.19.5",      // 5M+ weekly downloads, clustering support

    // Concurrency control
    "p-limit": "^6.1.0",          // 45M+ weekly downloads, sequential processing

    // Function throttling
    "p-throttle": "^6.2.0"        // 1M+ weekly downloads, lightweight
  }
}
```

### Implementation Architecture

**Package Distribution Strategy:**
- Embed resilience patterns within existing 4-package monorepo structure
- No new @adhd-brain/resilience package (maintains Phase 1 constraints)
- Co-locate resilience logic with the features that use it

**Library Responsibilities:**
- **p-retry**: Exponential backoff with jitter, permanent error classification
- **opossum**: Circuit breaker state machine with fallback strategies
- **bottleneck**: Gmail API rate limiting with Redis clustering support
- **p-limit**: Sequential processing for APFS and MPPP requirements
- **p-throttle**: Function-level throttling for cost control

## Alternatives Considered

### 1. Stick with @orchestr8/resilience
- **Pros**: No migration required, existing patterns work
- **Cons**: Dependency conflicts blocking development, lacks TypeScript support, stale maintenance
- **Impact**: Cannot proceed with Phase 1 due to workspace conflicts

### 2. Single Comprehensive Library (cockatiel)
- **Pros**: Unified API, comprehensive policies, TypeScript native
- **Cons**: Last major update over 1 year ago, larger bundle size (~100KB), maintenance concerns
- **Impact**: Risk of library abandonment, excess features for MPPP scope

### 3. Build Custom Resilience Patterns
- **Pros**: Perfect fit for ADHD Brain requirements, full control
- **Cons**: High development overhead, testing burden, maintenance complexity
- **Impact**: Violates Phase 1 time constraints, reinvents proven patterns

### 4. Minimal Retry-Only Solution
- **Pros**: Extremely lightweight, simple to implement
- **Cons**: Insufficient for production Gmail API integration, no circuit breaker protection
- **Impact**: Inadequate for external service resilience requirements

## Consequences

### Positive

- **Zero Dependency Conflicts**: All selected libraries have clean dependency trees
- **Production Battle-Tested**: p-retry (28M downloads), opossum (Red Hat), bottleneck (5M downloads) proven in production
- **Strong TypeScript Support**: Native TypeScript definitions throughout the stack
- **Modular Bundle Size**: Tree-shakeable at ~195KB total, use only what's needed
- **Active Maintenance**: All libraries actively maintained with recent updates
- **ADHD-Friendly Features**: Progress reporting, clear error messages, timeout feedback
- **Flexible Configuration**: Service-specific presets (Gmail 80 req/s, APFS sequential, Whisper cost limits)
- **Community Trust**: Sindre Sorhus (p-retry, p-limit, p-throttle), Red Hat (opossum), established maintainers

### Negative

- **Multiple Dependencies**: 5 libraries vs 1, increased maintenance overhead
- **Migration Effort**: ~2-3 weeks to migrate all @orchestr8/resilience usage
- **API Learning Curve**: Different APIs for each pattern vs unified interface
- **Bundle Size Increase**: ~195KB total vs unknown @orchestr8/resilience size
- **Coordination Complexity**: Must coordinate retry + circuit breaker + rate limiting manually

### Quality Assurance

**P0 Tests Required:**
- Retry logic with various failure scenarios (transient vs permanent)
- Circuit breaker state transitions (closed → open → half-open → closed)
- Rate limiter bucket management and 429 response handling
- Sequential processing constraints for MPPP/APFS operations

**P1 Tests:**
- Service-specific presets (Gmail, APFS, Whisper configurations)
- Error classification accuracy (retryable vs permanent)
- Timeout calculations and AbortController integration
- Memory cleanup in long-running retry operations

**P2 Tests:**
- Performance overhead measurements for each pattern
- Bundle size impact analysis
- Cross-library integration edge cases

**Monitoring Required:**
- Circuit breaker state changes and recovery metrics
- Rate limit compliance (zero 429 errors target)
- Retry attempt distributions and success rates
- Memory usage patterns during transcription operations

## Implementation Notes

### Migration Strategy

**Phase 1 (Week 1): Foundation**
- Install new dependencies and create core abstractions
- Implement unified wrapper for combined patterns
- Write comprehensive test suite covering all failure scenarios

**Phase 2 (Week 2): Service Integration**
- Migrate Gmail API resilience (rate limiting + retry + circuit breaker)
- Migrate iCloud APFS download resilience (sequential + retry)
- Migrate Whisper transcription resilience (memory-safe + cost control)
- Update vault operations and database transaction handling

**Phase 3 (Week 3): Cleanup**
- Remove @orchestr8/resilience dependency
- Update all import statements across packages
- Performance benchmarking and optimization
- Documentation updates and team training

### Service-Specific Configurations

**Gmail API Preset:**
```typescript
{
  retry: { retries: 5, factor: 2, minTimeout: 1000, maxTimeout: 16000 },
  circuitBreaker: { timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 30000 },
  rateLimit: { minTime: 12, reservoir: 80, reservoirRefreshInterval: 1000 }
}
```

**APFS Dataless Preset:**
```typescript
{
  retry: { retries: 10, factor: 1.5, minTimeout: 100, maxTimeout: 5000 },
  concurrency: { limit: 1 }, // Sequential processing required
  shouldRetry: (error) => error.code === 'EAGAIN' || error.code === 'EBUSY'
}
```

**Whisper API Preset:**
```typescript
{
  retry: { retries: 3, factor: 2, minTimeout: 2000, maxTimeout: 30000 },
  timeout: (fileSizeMB) => 30000 + (fileSizeMB * 3000), // Dynamic based on file size
  memoryCleanup: true, // Force GC between attempts
  costControl: { dailyBudget: 10.00, estimateCost: (bytes) => bytes/1920000 * 0.006 }
}
```

### Performance Characteristics

- **Circuit Breaker Overhead**: ~0.02-0.05ms per call, ~50KB memory per instance
- **Rate Limiter Impact**: Throughput control is primary "cost", ~30KB memory per instance
- **Retry Pattern**: <1ms success overhead, backoff delays dominate failure cases
- **Memory Budget**: <10MB total for all resilience components

### Security Considerations

- OAuth token refresh integration with retry logic
- Sensitive error information filtering in logs
- API key rotation support in circuit breaker fallbacks
- Rate limit compliance to avoid service blocking

## References

- [Production Resilience Package Usage Guide](../guides/guide-resilience-package-usage.md)
- [Master PRD v2.3.0-MPPP](../master/prd-master.md)
- [Roadmap v2.0.0-MPPP](../master/roadmap.md)
- [ADR-0021: Resilience Pattern Embedding](./0021-resilience-pattern-embedding.md)
- [p-retry GitHub Documentation](https://github.com/sindresorhus/p-retry)
- [opossum Circuit Breaker Documentation](https://github.com/nodeshift/opossum)
- [bottleneck Rate Limiter Documentation](https://github.com/SGrondin/bottleneck)
- [Comprehensive Resilience Documentation Audit](../audits/2025-09-29-resilience-strategist-comprehensive-documentation-audit.md)
- [Resilience Pattern Analysis Audit](../audits/2025-09-29-resilience-pattern-audit.md)