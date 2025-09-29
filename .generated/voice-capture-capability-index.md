# Voice Capture Capability Index

**Generated:** 2025-09-29
**Scope:** Voice capture system capabilities and traceability
**Source Documents:** Master PRD v2.3.0-MPPP, Roadmap v3.0.0, Feature specs

## Capability Overview

| Capability ID | Title | Phase | Risk | TDD | Status | Completion |
|--------------|-------|--------|------|-----|--------|------------|
| VOICE_POLLING_ICLOUD | Voice Memo Polling (iCloud + APFS) | 1.2 | High | Required | Not Started | 0% |
| WHISPER_TRANSCRIPTION | Whisper Transcription (Local) | 1.2 | High | Required | Not Started | 0% |
| DEDUPLICATION_LOGIC | Duplicate Detection & Suppression | 1.2 | High | Required | Not Started | 0% |
| DIRECT_EXPORT_VOICE | Voice Direct Export to Vault | 1.2 | High | Required | Not Started | 0% |
| PLACEHOLDER_EXPORT | Placeholder Export (Failure Fallback) | 1.2 | Medium | Required | Not Started | 0% |
| CAPTURE_STATE_MACHINE | Capture Status State Machine | 1.2 | High | Required | Not Started | 0% |

## Acceptance Criteria Mapping

### VOICE_POLLING_ICLOUD
**Source:** Roadmap v3.0.0, Lines 278-302

- [ ] Poll directory every 30 seconds (configurable)
- [ ] Detect new .m4a files (mtime check + sync_state cursor)
- [ ] APFS dataless detection via icloudctl
- [ ] Sequential download (no parallel, semaphore=1)
- [ ] Exponential backoff on iCloud failure (1s, 2s, 4s, cap at 60s)
- [ ] Skip files with iCloud conflicts (log error prominently)
- [ ] Audio fingerprint (first 4MB SHA-256) computed before staging
- [ ] Channel-native-id = file path (uniqueness constraint)
- [ ] Insert capture row (status='staged', audio_fp in meta_json)
- [ ] Performance: < 150ms p95 staging time

**Related Specs:**
- docs/features/capture/spec-capture-arch.md
- docs/features/capture/spec-capture-tech.md

**Related ADRs:**
- ADR-0001: Voice File Sovereignty ✅
- ADR-0006: Late Hash Binding for Voice ✅
- ADR-0008: Sequential Processing MPPP ✅

**Related Guides:**
- docs/guides/guide-polling-implementation.md
- docs/guides/guide-voice-capture-debugging.md ✅

**Test Verification:**
- packages/capture/tests/voice-polling.spec.ts ❌ NOT IMPLEMENTED
- packages/capture/tests/apfs-dataless-detection.spec.ts ❌ CRITICAL GAP

### WHISPER_TRANSCRIPTION
**Source:** Roadmap v3.0.0, Lines 306-334

- [ ] Whisper medium model loaded (medium.pt)
- [ ] Sequential transcription (no parallel, MPPP constraint)
- [ ] Single retry on failure (timeout, corrupted audio)
- [ ] Timeout: 30 seconds per transcription
- [ ] Update capture: content_hash + status='transcribed' on success
- [ ] Update capture: status='failed_transcription' on failure
- [ ] Insert errors_log on failure (stage='transcribe', message)
- [ ] Placeholder export on failure (see PLACEHOLDER_EXPORT)
- [ ] Performance: < 10s average transcription time
- [ ] Queue depth metric: transcription_queue_depth

**Related Specs:**
- docs/features/capture/spec-capture-tech.md
- docs/features/capture/spec-capture-test.md

**Related ADRs:**
- ADR-0006: Late Hash Binding for Voice ✅
- ADR-0008: Sequential Processing MPPP ✅
- ADR-0014: Placeholder Export Immutability ✅

**Related Guides:**
- docs/guides/guide-whisper-transcription.md
- docs/guides/guide-error-recovery.md

**Test Verification:**
- packages/capture/tests/whisper-transcription.spec.ts ❌ NOT IMPLEMENTED
- packages/capture/tests/transcription-failure.spec.ts ❌ NOT IMPLEMENTED

### DEDUPLICATION_LOGIC
**Source:** Roadmap v3.0.0, Lines 336-362

- [ ] Query: SELECT id FROM captures WHERE content_hash = ? AND id != ?
- [ ] Voice duplicate check: audio_fp (staged) → transcript hash (transcribed)
- [ ] Email duplicate check: Message-ID (primary) OR body hash (fallback)
- [ ] Unique constraint enforced: (channel, channel_native_id)
- [ ] Mark duplicate: status='exported_duplicate'
- [ ] Insert exports_audit (mode='duplicate_skip')
- [ ] No vault write on duplicate
- [ ] Performance: < 10ms duplicate check
- [ ] Metric: dedup_hits_total counter

**Related Specs:**
- docs/features/staging-ledger/spec-staging-tech.md
- docs/features/capture/spec-capture-tech.md

**Related ADRs:**
- ADR-0006: Late Hash Binding for Voice ✅

**Related Guides:**
- docs/guides/guide-tdd-applicability.md

**Test Verification:**
- packages/staging-ledger/tests/deduplication.spec.ts ❌ NOT IMPLEMENTED
- packages/staging-ledger/tests/hash-collision-handling.spec.ts ❌ NOT IMPLEMENTED

## Critical Dependencies

### Foundation Layer (Prerequisite)
- ✅ MONOREPO_STRUCTURE (Complete)
- ❌ SQLITE_SCHEMA (Required for all voice capabilities)
- ❌ CONTENT_HASH_IMPLEMENTATION (Required for deduplication)
- ❌ ATOMIC_FILE_WRITER (Required for export)

### Voice Pipeline Flow
```
VOICE_POLLING_ICLOUD
  ↓ depends on
WHISPER_TRANSCRIPTION
  ↓ depends on
DEDUPLICATION_LOGIC
  ↓ depends on
DIRECT_EXPORT_VOICE
```

### Cross-Cutting Dependencies
- CAPTURE_STATE_MACHINE (shared by all channels)
- PLACEHOLDER_EXPORT (voice failure path)

## Test Coverage Status

### ✅ Well-Covered Areas
- Voice file sovereignty principles (ADR compliance)
- Error recovery concepts (guide documentation)
- System-level debugging (comprehensive guide)

### ⚠️ Partially Covered Areas
- Architecture patterns (outbox references need removal)
- Performance optimization (documented but not tested)

### ❌ Critical Gaps
- **APFS dataless file handling** - P0 CRITICAL
  - Test patterns defined in spec-capture-test.md Section 4.1
  - Implementation missing from test suite
  - Required for VOICE_POLLING_ICLOUD capability

- **Voice polling integration** - HIGH PRIORITY
  - End-to-end voice capture flow tests missing
  - iCloud download simulation needed

- **Transcription reliability** - HIGH PRIORITY
  - Whisper model loading tests needed
  - Failure recovery validation missing

## Risk Mitigation Status

### High-Risk Capabilities (6/6 require immediate attention)

| Capability | Primary Risk | Mitigation Status | Test Status |
|------------|--------------|-------------------|-------------|
| VOICE_POLLING_ICLOUD | APFS dataless files | ✅ Guide documented | ❌ Tests missing |
| WHISPER_TRANSCRIPTION | Model availability | ✅ Fallback designed | ❌ Tests missing |
| DEDUPLICATION_LOGIC | Hash collisions | ✅ SHA-256 chosen | ❌ Tests missing |
| DIRECT_EXPORT_VOICE | Vault corruption | ✅ Atomic writes | ❌ Tests missing |
| PLACEHOLDER_EXPORT | User confusion | ✅ Clear markers | ❌ Tests missing |
| CAPTURE_STATE_MACHINE | Invalid transitions | ✅ Documented rules | ❌ Tests missing |

## Implementation Readiness Assessment

### Blockers for Phase 1.2 Start
- ❌ APFS dataless file test implementation (P0 CRITICAL)
- ❌ Core foundation layer completion (SQLITE_SCHEMA, etc.)

### Ready for Implementation
- ✅ Architecture principles established
- ✅ ADR decisions finalized
- ✅ Debugging procedures documented
- ✅ Performance targets defined

### Next Actions Required
1. **Immediate (Week 1):**
   - Implement APFS dataless file tests from spec-capture-test.md Section 4.1
   - Complete foundation layer capabilities (SQLITE_SCHEMA, etc.)

2. **Phase 1.2 Start (Week 2):**
   - Begin VOICE_POLLING_ICLOUD implementation
   - Set up icloudctl Swift helper integration

3. **Phase 1.2 Completion (Week 2 End):**
   - All 6 voice capabilities implemented and tested
   - End-to-end voice capture flow validated

## Gap Summary

**Total Capabilities:** 6 voice-specific
**Ready for Implementation:** 0 (0%)
**Architectural Gaps:** 1 (outbox references)
**Test Implementation Gaps:** 6 (100% missing)
**Documentation Gaps:** 0 (well documented)

**Orchestrator Recommendation:** NEEDS_ROADMAP_PATCH
**Priority Actions:** Implement APFS tests, complete foundation, update architecture spec

---

**Generated by:** Roadmap Orchestrator v3.0.0
**Last Updated:** 2025-09-29
**Next Review:** Upon Phase 1.1 completion