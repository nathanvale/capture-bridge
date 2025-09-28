---
adr: 0010
title: ULID-Based Deterministic Filenames
status: accepted
context-date: 2025-09-27
owner: Nathan
---

## Status

Accepted

## Context

The Obsidian Bridge needs to generate consistent, collision-resistant filenames for exported markdown files. Requirements include:
- Deterministic naming: Same capture → same filename (idempotent exports)
- Collision resistance: Avoid filename conflicts
- Time ordering: Chronological sorting capability
- No duplicates: Retry exports should not create multiple files

Traditional approaches have limitations:
- Timestamp-based: Collisions possible with rapid captures
- UUID v4: No time ordering, not deterministic for same input
- Sequential IDs: Require coordination, gap handling complexity

Reference: `docs/features/obsidian-bridge/prd-obsidian.md` §5.2

## Decision

Use ULID (Universally Unique Lexicographically Sortable Identifier) from `captures.id` as the exact filename:

1. **Filename Format**: `{vault_path}/inbox/{ULID}.md`
2. **Source**: Capture ID from staging ledger (no generation at export time)
3. **No Prefixes**: No timestamp or other prefixes added to filename
4. **Collision Handling**:
   - Same ULID + same content hash → skip write (duplicate)
   - Same ULID + different content hash → CRITICAL ERROR (halt)

## Alternatives Considered

1. **Timestamp + counter filenames** - Still possible collisions, complex gap handling (rejected)
2. **UUID v4 filenames** - No time ordering, not deterministic (rejected)
3. **Content hash filenames** - Too long, not time-ordered (rejected)
4. **ULID + timestamp prefix** - Redundant with ULID timestamp, longer names (rejected)
5. **Template-based filenames** - Added complexity, deferred to Phase 3+ (rejected for Phase 1)

## Consequences

**Positive:**
- Deterministic: Same capture always produces same filename
- Collision resistant: < 1 collision per 1 billion ULIDs (per spec)
- Time ordered: Lexicographic sorting equals chronological sorting
- Idempotent exports: Retries are safe and detectable
- Deduplication: Content hash comparison resolves true duplicates

**Negative:**
- Dependent on ULID generator quality in staging ledger
- ULID collision with different content is unrecoverable error
- Filenames not human-friendly (opaque 26-character strings)

**Design Constraints:**
- Staging Ledger must provide valid ULID format (26 chars, Crockford Base32)
- Export layer cannot generate new ULIDs (must use existing capture.id)
- Collision conflicts require manual investigation

## Risk Mitigation

1. **ULID Quality**: Rely on proven ULID library with monotonic guarantees
2. **Collision Detection**: Compare content hashes before declaring conflict
3. **Audit Trail**: Log all exports and collision events
4. **Recovery**: No automatic recovery for conflicts (manual investigation required)

## Implementation Notes

- ULID validation: `^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$`
- Path traversal prevention: Validate ULID format before concatenation
- Error boundary: ULID conflicts logged as CRITICAL errors

## References

- PRD: `docs/features/obsidian-bridge/prd-obsidian.md` v1.0.0-MPPP §5.2, §8
- Tech Spec: `docs/features/obsidian-bridge/spec-obsidian-tech.md` v1.0.0-MPPP §2.2
- Architecture Spec: `docs/features/obsidian-bridge/spec-obsidian-arch.md` v1.0.0-MPPP §4.2.2