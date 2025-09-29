---
adr: 0007
title: 90-Day Retention for Exported Captures Only
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0007: 90-Day Retention for Exported Captures Only

## Status

Accepted

## Context

The staging ledger accumulates capture records over time and needs a retention policy to prevent unbounded growth. However, different capture statuses have different retention requirements:

- **Exported captures**: Successfully processed, safely trimmable after archive period
- **Non-exported captures**: Failed or incomplete processing, need manual inspection
- **Audit trail**: Permanent retention for transparency

Storage projections show 10k captures ≈ 50MB, manageable for 90+ days retention.

## Decision

Implement **selective 90-day retention**:

**Trim Rules:**

- DELETE rows WHERE `status LIKE 'exported%'` AND `created_at < NOW() - 90 days`
- NEVER auto-trim: `staged`, `transcribed`, `failed_transcription`
- Forever retention: `exports_audit` table (immutable trail)

**Rationale:**

- Exported captures have completed their lifecycle successfully
- Non-exported rows indicate processing failures requiring manual inspection
- Audit trail preserves transparency for debugging and compliance

**Implementation:**

```sql
-- Safe retention cleanup
DELETE FROM captures
WHERE status LIKE 'exported%'
  AND created_at < datetime('now', '-90 days');

-- Audit trail untouched
-- Non-exported rows preserved for investigation
```

## Alternatives Considered

- **Uniform retention**: Trim all rows after 90 days - Rejected due to loss of failure signals
- **Status-agnostic retention**: Trim based only on age - Rejected due to debugging needs
- **Configurable retention**: User-defined periods - Rejected as YAGNI for MPPP
- **No retention**: Keep everything forever - Rejected due to storage growth

## Consequences

### Positive

- Prevents unbounded database growth
- Preserves failed captures for debugging
- Maintains complete audit trail forever
- Simple, predictable retention logic

### Negative

- Failed captures accumulate over time (needs manual cleanup)
- No automatic recovery from persistent failures
- May require intervention if many failures occur

### Monitoring

- Alert if non-exported captures > 100 rows (indicates systemic issues)
- Track database size and warn at 100MB
- Monitor retention job success/failure

## Trigger to Revisit

- Database size > 500MB persistent
- Non-exported capture count > 1000 (indicates processing failures)

## References

- [Staging Ledger PRD v1.0.0-MPPP](../features/staging-ledger/prd-staging.md) §5.6
- [Schema Reference](../features/staging-ledger/schema-indexes.md) §7
