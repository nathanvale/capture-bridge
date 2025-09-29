---
adr: 0001
title: Voice File Sovereignty (In-Place References Only)
status: accepted
context-date: 2025-01-19
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0001: Voice File Sovereignty (In-Place References Only)

## Status

Accepted

## Context
Apple Voice Memos are stored in a specific macOS system location:
`~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/`

The ADHD Brain capture system needs to process these voice memos for transcription and integration into the knowledge system. Two approaches were considered:
1. Copy/move files to our managed storage
2. Reference files in place with metadata tracking

The decision was driven by the need to preserve data integrity and avoid sync conflicts with Apple's iCloud Voice Memos synchronization.

## Decision
We never move, rename, or copy Apple Voice Memo files. Instead, we:
- Reference voice memos in place by their original file path
- Store SHA-256 fingerprints for integrity verification and deduplication
- Trigger iCloud downloads in place when needed
- Maintain all processing metadata in our staging ledger

## Alternatives Considered
1. **Copy to managed storage**: Would provide full control but risks data duplication, sync conflicts with iCloud, and potential corruption during copy operations
2. **Move to managed storage**: Would avoid duplication but could break Apple's sync mechanisms and user expectations
3. **Symbolic linking**: Would maintain references but could be fragile across system updates

## Consequences

### Positive
- Zero file duplication - eliminates storage waste and sync conflicts
- No corruption risk during file operations
- Simpler disaster recovery - original files remain in Apple's managed location
- Preserves user's existing Voice Memos workflow
- Maintains compatibility with iCloud synchronization

### Negative
- Dependent on macOS path stability across OS updates
- Must handle various iCloud download states (not downloaded, downloading, available)
- Requires robust error handling for missing or moved files
- Cannot guarantee file availability in offline scenarios

## References
- [Master PRD - Voice Capture Section](../master/prd-master.md)
- [Capture Feature PRD](../features/capture/prd-capture.md)
- [Staging Ledger Architecture](../features/staging-ledger/spec-staging-arch.md)
