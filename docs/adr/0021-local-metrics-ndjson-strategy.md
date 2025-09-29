---
adr: 0021
title: Local-Only NDJSON Metrics Strategy
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0021: Local-Only NDJSON Metrics Strategy

## Status

Accepted

## Context

The ADHD Brain project requires operational visibility (queue depths, latencies, error rates) and debugging support for the capture system. Multiple telemetry approaches were considered:

1. **External services** (DataDog, New Relic, Grafana Cloud)
2. **Self-hosted dashboards** (Prometheus + Grafana)
3. **Local-only structured logging** (NDJSON files)
4. **Database-based metrics** (SQLite tables)

Key requirements:

- Privacy-first: No external transmission of capture data
- ADHD-friendly: Opt-in activation (no always-on overhead)
- Test-friendly: Canonical fixtures prevent test brittleness
- Forward-compatible: Additive-only schema evolution
- Local debugging: Easy query and analysis capabilities

The decision was driven by the privacy-first nature of personal knowledge systems, single-user MPPP scope, and the need for simple debugging without external dependencies.

## Decision

We will implement **local-only NDJSON metrics** with unified naming conventions and additive-only schema evolution.

**Core Strategy:**

- **Storage:** Newline-delimited JSON files in `~/.adhd-brain/.metrics/`
- **Activation:** Opt-in via `CAPTURE_METRICS=1` environment variable
- **Naming:** `domain.component.action.unit` convention (e.g., `capture.voice.staging_ms`)
- **Rotation:** Daily files at midnight UTC (e.g., `2025-09-27.ndjson`)
- **Retention:** 30 days default, configurable
- **Schema:** Additive-only evolution (no breaking changes)

**Event Format:**

```json
{
  "timestamp": "2025-09-27T10:30:15.123Z",
  "metric": "capture.voice.staging_ms",
  "value": 87,
  "tags": { "capture_id": "01ABC", "source": "voice" },
  "type": "duration"
}
```

**Canonical Metrics:**

- `capture.{voice|email}.staging_ms` - Insert duration
- `transcription.duration_ms` - Whisper processing time
- `export.write_ms` - Vault file write duration
- `dedup.hits_total` - Duplicate detection events
- `retry.attempt_total` - Error recovery attempts
- `backup.verification.result` - Backup verification outcomes

## Alternatives Considered

### Alternative 1: External Telemetry Service

**Pros:** Rich dashboards, alerting, industry standard
**Cons:** Privacy violation, external dependency, cost, complexity
**Rejected:** Contradicts privacy-first principle for personal knowledge system

### Alternative 2: Self-Hosted Prometheus + Grafana

**Pros:** Powerful querying, real-time dashboards, industry standard
**Cons:** Complex setup, resource overhead, overkill for single-user system
**Rejected:** Too complex for MPPP scope and ADHD-friendly simplicity

### Alternative 3: SQLite-Based Metrics

**Pros:** Queryable with SQL, integrates with existing database
**Cons:** Schema evolution challenges, performance impact on main database
**Rejected:** Risk of contaminating main database with observability data

### Alternative 4: Structured Logging Only

**Pros:** Simple, built into most applications
**Cons:** No aggregation, hard to query, no retention policy
**Rejected:** Insufficient for operational visibility needs

## Consequences

### Positive

- **Privacy preserved:** All metrics stored locally, never transmitted
- **Zero external dependencies:** Works offline, no service accounts needed
- **ADHD-friendly:** Disabled by default, simple opt-in activation
- **Test-friendly:** Canonical fixtures prevent metric name churn
- **Forward-compatible:** Additive schema allows safe evolution
- **Easy debugging:** NDJSON format easily parsed by standard tools
- **Automatic cleanup:** Daily rotation with 30-day retention
- **Low overhead:** Buffered writes, async flush, minimal performance impact

### Negative

- **No real-time dashboards:** Must query files manually for analysis
- **No alerting:** Cannot proactively notify of issues
- **Single-process limitation:** No coordination across multiple instances
- **Manual analysis required:** No built-in aggregation or visualization
- **Storage growth:** Files accumulate over time (mitigated by retention)

### Mitigations

- Health command integration shows recent metrics and trends
- Query API for tests provides programmatic access
- Meta-metrics monitor collection system health
- Doctor command detects storage issues and cleanup needs
- Standardized fixtures prevent test brittleness

## Schema Evolution Rules

**Allowed Changes (No Version Bump):**

1. Add new metric names with documentation
2. Add new optional tags to existing metrics
3. Add new optional fields to event structure
4. Increase numeric precision

**Breaking Changes (Major Version):**

1. Remove existing metric names
2. Change metric types (counter → gauge)
3. Remove existing tags
4. Change tag or field types
5. Rename core fields

**Deprecation Process:**

1. Mark metric as deprecated (add `deprecated: true` field)
2. Emit both old and new metrics (dual-write for 1 version)
3. Document migration path in changelog
4. Remove after 2 major versions minimum

## Trigger to Revisit

This strategy should be reconsidered if:

- External dashboard/monitoring request from user
- Multi-process deployment required (distributed system)
- Metrics volume exceeds 100k events/day (performance impact)
- Real-time alerting becomes necessary (operational requirements)
- Team size grows beyond single developer (collaborative needs)

## Related Decisions

- [ADR 0001: Voice File Sovereignty](./0001-voice-file-sovereignty.md) - Local-first aligns with privacy principles
- [ADR 0003: Monorepo Tooling Stack](./0003-monorepo-tooling-stack.md) - No remote cache aligns with local-only metrics
- [ADR 0004: Direct Export Pattern](./0004-direct-export-pattern.md) - Synchronous pattern simplifies metrics collection

## References

- [Metrics Contract Tech Spec](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-metrics-contract-tech.md)
- [Master PRD - Section 6.4 Telemetry](/Users/nathanvale/code/adhd-brain/docs/master/prd-master.md)
- [Capture PRD - Section 9 Telemetry](/Users/nathanvale/code/adhd-brain/docs/features/capture/prd-capture.md)
- [TDD Applicability Guide](/Users/nathanvale/code/adhd-brain/docs/guides/guide-tdd-applicability.md)
