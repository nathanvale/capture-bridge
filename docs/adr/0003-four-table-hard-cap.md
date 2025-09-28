# ADR 0003: Four-Table Hard Cap for Staging Ledger

## Date
2025-09-28

## Status
Accepted

## Context
The staging ledger is designed as a minimal SQLite database for capture durability, not a parallel knowledge system. Early design iterations risked scope creep where additional tables would be added for convenience, turning the staging ledger into a complex secondary brain.

The staging ledger must remain focused on its core purpose: durable capture staging between input sources and Obsidian vault export. Adding tables beyond the core set would violate YAGNI principles and increase maintenance burden.

## Decision
Enforce a hard cap of exactly 4 tables in the staging ledger schema:

1. `captures` - Ephemeral staging and processing state
2. `exports_audit` - Immutable export audit trail
3. `errors_log` - Failure tracking and diagnostics
4. `sync_state` - Poll cursors and checkpoints

**No additional tables are permitted** without explicit ADR approval and Master PRD update.

## Alternatives Considered
- **Flexible table count**: Allow tables to be added as needed - Rejected due to scope creep risk
- **5+ tables from start**: Include tables for future features - Rejected as YAGNI violation
- **Single table design**: Combine all data into one table - Rejected due to mixing concerns

## Consequences

### Positive
- Prevents scope creep and feature bloat
- Keeps staging ledger focused on core durability mission
- Forces creative use of JSON metadata for future extensibility
- Maintains simplicity for backup/restore operations
- Clear boundary between staging and knowledge storage

### Negative
- May require JSON metadata for future schema-less data
- Potential need for external tables if core requirements change
- Could force early architectural decisions for edge cases

### Mitigation
- Use `meta_json` columns for extensible data storage
- Document clear triggers for reconsidering this constraint
- Maintain separate tables in other packages for non-staging concerns

## References
- [Staging Ledger PRD v1.0.0-MPPP](../features/staging-ledger/prd-staging.md) §5.1
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) §4.2
- [Schema Reference](../features/staging-ledger/schema-indexes.md) §2