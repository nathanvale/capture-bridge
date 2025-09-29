---
adr: 0009
title: Atomic Write via Temp-Then-Rename Pattern
status: accepted
context-date: 2025-09-27
owner: Nathan
---

## Status

Accepted

## Context

The Obsidian Bridge component requires writing markdown files to an Obsidian vault without risking partial writes, sync conflicts, or vault corruption. The vault may be synchronized via Obsidian Sync or iCloud Drive, which can create race conditions if files are modified during sync operations.

Key risks from direct vault writes:

- Partial writes during process crashes
- Sync conflicts when Obsidian Sync catches files mid-write
- Duplicate files with slightly different names
- Lost metadata during manual filing operations

Reference: `docs/features/obsidian-bridge/prd-obsidian.md` §2, §4.3

## Decision

Implement atomic writes using the temp-then-rename pattern with these specifications:

1. **Temp Directory**: Write temporary files to `{vault_path}/.trash/{capture_id}.tmp`
2. **Write Sequence**:
   - Write content to temp file
   - Call `fsync()` to flush OS cache to disk
   - Perform atomic rename from temp to final destination `{vault_path}/inbox/{capture_id}.md`
3. **Error Recovery**: Clean up temp files on any failure
4. **Atomicity Guarantee**: Export path either contains complete file OR does not exist

## Alternatives Considered

1. **Direct writes** - Risk partial files if process crashes mid-write (rejected)
2. **Write-then-move within same directory** - Still visible to sync services during write (rejected)
3. **Database transactions only** - Doesn't solve filesystem atomicity (rejected)
4. **Lock files** - Adds complexity and doesn't prevent crashes mid-write (rejected)

## Consequences

**Positive:**

- Zero partial writes: Files appear complete or not at all
- Sync-safe: Obsidian Sync never sees files being written
- Crash-resistant: Process crashes leave vault unchanged
- Idempotent: Retries are safe due to deterministic ULID filenames

**Negative:**

- Requires same filesystem for temp and final destination
- Adds 1x write amplification (temp file + rename)
- Temporary disk space usage during writes

**Technical Requirements:**

- POSIX-compliant filesystem with atomic rename semantics
- fsync support for durability guarantees
- Same filesystem mount for temp and destination paths

## Implementation Notes

- Uses `.trash/` directory because Obsidian ignores it (no sync pollution)
- Temp file suffix `.tmp` prevents Obsidian from parsing incomplete files
- Foreign key constraints in `exports_audit` table ensure referential integrity

## References

- PRD: `docs/features/obsidian-bridge/prd-obsidian.md` v1.0.0-MPPP
- Tech Spec: `docs/features/obsidian-bridge/spec-obsidian-tech.md` v1.0.0-MPPP §3.2
- Architecture Spec: `docs/features/obsidian-bridge/spec-obsidian-arch.md` v1.0.0-MPPP §4.2.1
