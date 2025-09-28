---
adr: 0011
title: Inbox-Only Export Pattern (Phase 1)
status: accepted
context-date: 2025-09-27
owner: Nathan
---

## Status

Accepted

## Context

The Obsidian Bridge must decide where to place exported markdown files within the vault structure. Options include:
- Direct filing into organized folders (PARA method, by source, by date)
- Smart classification using content analysis
- Daily notes integration with backlinks
- Simple inbox pattern for later manual organization

Phase 1 scope prioritizes reliability and simplicity over intelligent filing. User requirements emphasize vault safety and export completion over automatic organization.

Reference: `docs/features/obsidian-bridge/prd-obsidian.md` §4, §8

## Decision

Export all captures to a single `inbox/` directory within the vault:

1. **Export Path**: `{vault_path}/inbox/{ULID}.md`
2. **No Classification**: All exports go to inbox regardless of source or content
3. **No Smart Filing**: No PARA folders, date folders, or source-based organization
4. **Manual Triage**: User manually organizes files from inbox (outside system scope)

## Alternatives Considered

1. **PARA Classification** - Complex content analysis, error-prone automation (deferred to Phase 3+)
2. **Source-based folders** - `/voice/`, `/email/` subfolders - simple but still adds complexity (rejected)
3. **Date-based folders** - `/2025/09/27/` hierarchy - creates many directories (rejected)
4. **Daily notes integration** - Append to existing daily notes - complex conflict resolution (deferred)
5. **Smart filing with ML** - Content classification - too complex for Phase 1 (rejected)

## Consequences

**Positive:**
- Maximum simplicity: Single target directory
- Zero classification errors: No wrong folder placements
- Fast exports: No decision logic or content analysis
- Predictable behavior: User always knows where files are
- Easy debugging: All exports in one location

**Negative:**
- Manual organization required: User must file from inbox
- Inbox accumulation: Files pile up without manual intervention
- No automatic categorization: Misses intelligent filing opportunities
- Scalability concern: Large inbox becomes unwieldy over time

**Phase Transition Plan:**
- Phase 2: Optional folder classification (user configurable)
- Phase 3: PARA method integration with content analysis
- Phase 5: Daily notes and backlink automation

## Design Constraints

1. **Directory Creation**: System creates `inbox/` directory if missing (idempotent)
2. **Single Target**: No configuration options for export path in Phase 1
3. **No Conflicts**: Atomic ULID naming prevents filename conflicts
4. **Audit Trail**: All exports logged regardless of destination

## Implementation Notes

- Inbox directory created during first export attempt
- Export path hardcoded to `inbox/` (no configuration)
- Future phases will add configurable export path resolution
- User manual organization workflow documented in usage guide

## References

- PRD: `docs/features/obsidian-bridge/prd-obsidian.md` v1.0.0-MPPP §4.1, §8
- Architecture Spec: `docs/features/obsidian-bridge/spec-obsidian-arch.md` v1.0.0-MPPP §6.1
- Usage Guide: `docs/guides/guide-obsidian-bridge-usage.md` (manual organization patterns)