---
task: DIRECT_EXPORT_VOICE--T02
title: Direct Export Voice - Follow-up Items
status: tracking
created: 2025-10-10
---

# DIRECT_EXPORT_VOICE--T02 - Follow-up Items

## P0 Blockers - ✅ ALL RESOLVED

1. ✅ **Directory fsync after rename** - Implemented in atomic-writer.ts lines 80-87
2. ✅ **Filesystem-first collision detection** - Implemented in collision-detector.ts
3. ✅ **ULID validation safety gate** - Implemented in path-resolver.ts with regex
4. ✅ **Audit semantics consistency** - Implemented in direct-exporter.ts

---

## P1 High-Priority Issues

### P1-1: Error Taxonomy Testing
**Status**: Needs implementation
**Priority**: High
**Effort**: Medium

**Description**: Add integration tests for all error code paths

**Requirements**:
- Test EACCES, ENOSPC, EROFS, ENETDOWN, EEXIST scenarios
- Verify structured error responses {code, message, recoverable}
- Validate halt semantics for ENOSPC/EROFS

**Implementation**:
```typescript
describe('Error taxonomy', () => {
  it('should handle EACCES as recoverable error')
  it('should halt on ENOSPC with structured error')
  it('should halt on EROFS with structured error')
  it('should handle ENETDOWN as recoverable')
  it('should detect EEXIST conflicts')
})
```

**Files to modify**:
- `packages/obsidian-bridge/src/__tests__/error-handling.spec.ts` (new)

**References**:
- spec-obsidian-tech.md §5.x
- spec-direct-export-tech.md §6.2

---

### P1-2: Same-Filesystem Guarantee
**Status**: Needs validation
**Priority**: High
**Effort**: Small

**Description**: Verify .trash and inbox are under vault path for atomic rename

**Requirements**:
- Ensure temp directory is .trash under vault root
- Auto-create .trash and inbox idempotently
- Reject configurations with different mount points

**Implementation**:
```typescript
// Test that .trash and inbox are created
it('should auto-create .trash and inbox directories')
it('should ensure temp path is under vault root')

// In writeAtomic, paths are already resolved correctly:
// tempPath = path.join(vault_path, '.trash', ...)
// exportPath = path.join(vault_path, 'inbox', ...)
```

**Files to verify**:
- ✅ `packages/obsidian-bridge/src/path-resolver.ts` - Already correct
- ✅ `packages/obsidian-bridge/src/writer/atomic-writer.ts` - Already creates directories

**Status**: ✅ Implementation verified - just needs test coverage

**References**:
- spec-obsidian-tech.md §2.2

---

### P1-3: Idempotency Duplicate Path
**Status**: Partially implemented
**Priority**: High
**Effort**: Small

**Description**: Validate duplicate detection and re-export scenarios

**Requirements**:
- Multiple retries with same content → duplicate_skip
- File deleted externally → re-export as initial
- Hash mismatch → conflict

**Implementation**:
```typescript
describe('Idempotency', () => {
  it('should skip duplicate writes with mode=duplicate_skip')
  it('should re-export if file missing (self-heal)')
  it('should detect conflicts on hash mismatch')
})
```

**Files to modify**:
- `packages/obsidian-bridge/src/__tests__/idempotency.spec.ts` (new)

**References**:
- spec-direct-export-tech.md §6.4

---

### P1-4: Performance Budget Guardrail
**Status**: Exists but needs refinement
**Priority**: High
**Effort**: Small

**Description**: Lightweight perf test to prevent regressions

**Current State**:
- ✅ Performance tests exist in `performance.test.ts`
- ✅ p95 < 50ms target validated
- ⚠️  Median threshold too strict for CI (fixed to 30ms)

**Next Steps**:
- Add performance budget to CI pipeline
- Alert on regressions > 20% from baseline
- Document expected performance characteristics

**Files**:
- `packages/obsidian-bridge/src/__tests__/performance.test.ts` ✅

**References**:
- Both tech specs performance sections

---

## P2 Medium-Priority Improvements

### P2-1: Vault Path Validation Hardening
**Status**: Basic validation exists
**Priority**: Medium
**Effort**: Medium

**Description**: Enhanced vault path safety checks

**Requirements**:
- Absolute path enforcement
- Realpath symlink resolution
- Home directory boundary check
- Permission checks
- Warnings for symlinks

**Implementation**:
```typescript
export const validateVaultPath = async (vaultPath: string) => {
  // Check absolute path
  if (!path.isAbsolute(vaultPath)) {
    throw new Error('Vault path must be absolute')
  }

  // Resolve symlinks
  const realPath = await fs.realpath(vaultPath)
  if (realPath !== vaultPath) {
    console.warn(`Vault path is a symlink: ${vaultPath} → ${realPath}`)
  }

  // Check permissions
  await fs.access(vaultPath, fs.constants.W_OK)
}
```

**Files to create**:
- `packages/obsidian-bridge/src/validation/vault-path.ts` (new)
- `packages/obsidian-bridge/src/__tests__/vault-validation.spec.ts` (new)

**References**:
- spec-direct-export-tech.md §10.4

---

### P2-2: Markdown Contract Tests
**Status**: Needs implementation
**Priority**: Medium
**Effort**: Small

**Description**: Validate markdown output format

**Requirements**:
- YAML frontmatter validation (id, source, captured_at, content_hash)
- Header format
- Metadata footer format
- Regression protection

**Implementation**:
```typescript
describe('Markdown formatting contract', () => {
  it('should generate valid YAML frontmatter')
  it('should include all required frontmatter fields')
  it('should format header correctly')
  it('should include metadata footer')
})
```

**Files**:
- `packages/capture/src/__tests__/markdown-formatter.spec.ts` ✅ (enhance existing)

**References**:
- spec-obsidian-tech.md §2.3

---

### P2-3: Doctor Command Checks
**Status**: Deferred to Phase 2
**Priority**: Medium
**Effort**: Large

**Description**: Health check command for export system

**Requirements**:
- Vault writability check
- Orphaned .tmp cleanup
- Audit consistency validation
- Last successful export timestamp
- Failure rate monitoring

**Scope**: Phase 2 implementation

**References**:
- specs §6.3/§7.3

---

### P2-4: Metrics NDJSON Events
**Status**: Deferred to Phase 2
**Priority**: Medium
**Effort**: Medium

**Description**: Local-only metrics for observability

**Requirements**:
- Success/failure/duplicate events
- Minimal field set
- Storage under ~/.capture-bridge/metrics/
- Daily rotation

**Scope**: Phase 2 implementation when metrics infrastructure needed

**References**:
- Specs telemetry sections

---

## P3 Low-Priority / Documentation

### P3-1: Audit Field Naming Clarification
**Status**: Documentation needed
**Priority**: Low
**Effort**: Trivial

**Description**: Add comment about vault_path meaning export_path

**Action**:
```typescript
// Note: "vault_path" field stores the relative export path (e.g., "inbox/{ULID}.md")
// No migration planned - keeping spec naming for consistency
```

**Files**:
- Add comment in direct-exporter.ts near audit insertion

**References**:
- spec-direct-export-tech.md §2.4

---

### P3-2: Usage Guide Updates
**Status**: Needs documentation update
**Priority**: Low
**Effort**: Small

**Description**: Update guide to emphasize function-based API

**Action**:
- ✅ Header note already exists mentioning function-based API
- Add banner to top of code examples
- Update class references to function examples over time

**Files**:
- `docs/guides/guide-obsidian-bridge-usage.md`

---

### P3-3: ENETDOWN Troubleshooting Examples
**Status**: Needs documentation
**Priority**: Low
**Effort**: Small

**Description**: Add network mount failure scenarios to guide

**Action**:
- Add ENETDOWN error section
- Document manual remediation steps
- Include macOS/NAS specific guidance

**Files**:
- `docs/guides/guide-obsidian-bridge-usage.md` (enhance troubleshooting)

---

## Summary

**P0 (Blockers)**: ✅ 4/4 resolved
**P1 (High Priority)**: ⚠️ 2/4 needs tests, 2/4 verified
**P2 (Medium Priority)**: 📋 4 items for Phase 2
**P3 (Low Priority)**: 📝 3 documentation items

**Immediate Action Items** (for this PR or follow-up):

1. **P1-1**: Add error taxonomy integration tests
2. **P1-3**: Add idempotency scenario tests
3. **P2-2**: Enhance markdown contract tests
4. **P3-1**: Add vault_path naming comment

**Phase 2 Scope**:
- P2-1: Vault path hardening
- P2-3: Doctor command
- P2-4: Metrics events

---

**Last Updated**: 2025-10-10
**Reviewed By**: Code review analysis
