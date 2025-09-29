# Immediate Issues Report - Critical Documentation Problems

**Generated:** 2025-09-29 UTC  
**Spec Librarian Comprehensive Audit**  
**Priority:** P0 - Critical Path Blockers

## Executive Summary

**Critical Issues Found:** 8  
**Impact:** High - Documentation integrity compromised by broken links and missing specifications  
**Action Required:** Immediate fixes needed for navigation and reference reliability

---

## P0 Critical Issues (Fix Immediately)

### 1. Missing Referenced Specifications

**Issue:** Multiple documents reference non-existent specification files, creating broken cross-reference chains.

**Affected References:**
- `docs/guides/guide-health-command.md:37` → `../features/cli/spec-cli-doctor-tech.md` (MISSING)
- `docs/guides/guide-health-command.md:38` → `../features/capture/spec-capture-gmail-oauth2-tech.md` (MISSING)  
- `docs/guides/guide-health-command.md:39` → `../features/capture/spec-capture-whisper-runtime-tech.md` (MISSING)
- `docs/guides/guide-error-recovery.md:35` → `../features/capture/spec-capture-gmail-oauth2-tech.md` (MISSING)
- `docs/guides/guide-error-recovery.md:36` → `../features/capture/spec-capture-whisper-runtime-tech.md` (MISSING)

**Root Cause:** These specs are referenced in guides but don't exist as separate files - their content is integrated into the main capture tech spec.

**Action Required:**
1. **Either** create the missing specs as separate files
2. **Or** update references to point to sections within `spec-capture-tech.md`

**Recommended Fix:** Update references to point to existing content:
```bash
# Update all references to point to existing capture tech spec sections
sed -i 's|spec-cli-doctor-tech.md|spec-cli-tech.md#doctor-command|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-health-command.md
sed -i 's|spec-capture-gmail-oauth2-tech.md|spec-capture-tech.md#gmail-oauth2|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-health-command.md
sed -i 's|spec-capture-whisper-runtime-tech.md|spec-capture-tech.md#whisper-transcription|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-health-command.md
sed -i 's|spec-capture-gmail-oauth2-tech.md|spec-capture-tech.md#gmail-oauth2|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-error-recovery.md
sed -i 's|spec-capture-whisper-runtime-tech.md|spec-capture-tech.md#whisper-transcription|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-error-recovery.md
```

### 2. Wrong Cross-Reference Paths

**Issue:** Several documents reference CLI specs in the wrong location (cross-cutting instead of features).

**Affected References:**
- `docs/master/prd-master.md:819` → `../cross-cutting/foundation/spec-cli-tech.md` (WRONG PATH)
- `docs/master/prd-master.md:820` → `../cross-cutting/foundation/spec-cli-test.md` (WRONG PATH)

**Root Cause:** CLI is classified as a feature (user-facing) not cross-cutting infrastructure.

**Fix Commands:**
```bash
sed -i 's|../cross-cutting/foundation/spec-cli-tech.md|../features/cli/spec-cli-tech.md|g' /Users/nathanvale/code/adhd-brain/docs/master/prd-master.md
sed -i 's|../cross-cutting/foundation/spec-cli-test.md|../features/cli/spec-cli-test.md|g' /Users/nathanvale/code/adhd-brain/docs/master/prd-master.md
```

### 3. Reference to Non-Existent TestKit Spec

**Issue:** Master PRD references a cross-cutting TestKit spec that doesn't exist.

**Affected Reference:**
- `docs/master/prd-master.md:821` → `../cross-cutting/spec-testkit-tech.md` (MISSING)

**Root Cause:** TestKit is external (@orchestr8/testkit) and not part of the ADHD Brain monorepo.

**Fix Command:**
```bash
# Remove reference to external TestKit - replace with guide reference
sed -i 's|TestKit Tech Spec.*|TestKit Usage Guide](../guides/guide-testkit-usage.md) - External TestKit integration patterns|g' /Users/nathanvale/code/adhd-brain/docs/master/prd-master.md
```

### 4. Broken Internal Metrics Reference

**Issue:** Metrics contract spec references a non-existent error recovery spec.

**Affected Reference:**
- `docs/cross-cutting/spec-metrics-contract-tech.md:1510` → `./spec-error-recovery-tech.md` (MISSING)

**Root Cause:** Error recovery is a guide, not a technical specification.

**Fix Command:**
```bash
sed -i 's|./spec-error-recovery-tech.md|../guides/guide-error-recovery.md|g' /Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-metrics-contract-tech.md
```

### 5. ADR Cross-Reference Inconsistency

**Issue:** ADR-0007 reference uses wrong ADR number in error recovery guide.

**Affected Reference:**
- `docs/guides/guide-error-recovery.md:1266` → `../adr/0008-sequential-processing-mppp.md` (WRONG NUMBER)

**Analysis:** Content refers to "ADR-0007: Sequential Processing Model" but links to ADR-0008. Per ADR index, sequential processing is ADR-0008.

**Fix Command:**
```bash
sed -i 's|ADR-0007: Sequential Processing Model|ADR-0008: Sequential Processing Model|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-error-recovery.md
```

---

## P1 High Priority Issues (Fix Soon)

### 6. Missing Foundation Monorepo Arch Spec

**Issue:** Foundation Monorepo follows incomplete 4-document pattern.

**Current State:**
```
prd-foundation-monorepo.md ✅ Exists
spec-foundation-monorepo-arch.md ❌ MISSING  
spec-foundation-monorepo-tech.md ✅ Exists
spec-foundation-monorepo-test.md ❌ MISSING
```

**Impact:** Breaks the established 4-document architecture pattern for features.

**Action Required:** Create missing architecture and test specifications before Phase 1 implementation.

### 7. Agents Folder Classification

**Issue:** `/docs/agents/` contains metadata about the documentation system, not user-facing features or infrastructure.

**Current Structure:**
```
docs/agents/ (13 files)
├── README-agents-usage.md
├── adr-curator.md
├── documentation-steward.md
└── ... (other agent specs)
```

**Classification Issue:** 
- **Not features** (users don't interact with agents directly)
- **Not cross-cutting** (not infrastructure for the capture system)
- **Should be guides** (how-to documentation for documentation workflow)

**Recommended Action:**
1. Move `README-agents-usage.md` → `docs/guides/guide-agent-usage.md`
2. Consolidate individual agent specs into a comprehensive agent guide
3. Update all references accordingly

### 8. New Orphan Document

**Issue:** Recently added `guide-voice-capture-debugging.md` is unreferenced.

**Location:** `/docs/guides/guide-voice-capture-debugging.md`  
**Status:** No incoming references found  
**Risk:** Valuable debugging content not discoverable

**Action Required:** Add references from:
- `docs/guides/guide-capture-debugging.md` 
- `docs/features/capture/spec-capture-test.md`
- `docs/master/index.md`

---

## Quick Fix Commands Summary

```bash
# Fix missing spec references (point to existing sections)
sed -i 's|spec-cli-doctor-tech.md|spec-cli-tech.md#doctor-command|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-health-command.md
sed -i 's|spec-capture-gmail-oauth2-tech.md|spec-capture-tech.md#gmail-oauth2|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-health-command.md
sed -i 's|spec-capture-whisper-runtime-tech.md|spec-capture-tech.md#whisper-transcription|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-health-command.md
sed -i 's|spec-capture-gmail-oauth2-tech.md|spec-capture-tech.md#gmail-oauth2|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-error-recovery.md
sed -i 's|spec-capture-whisper-runtime-tech.md|spec-capture-tech.md#whisper-transcription|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-error-recovery.md

# Fix wrong paths (CLI is feature, not cross-cutting)
sed -i 's|../cross-cutting/foundation/spec-cli-tech.md|../features/cli/spec-cli-tech.md|g' /Users/nathanvale/code/adhd-brain/docs/master/prd-master.md
sed -i 's|../cross-cutting/foundation/spec-cli-test.md|../features/cli/spec-cli-test.md|g' /Users/nathanvale/code/adhd-brain/docs/master/prd-master.md

# Fix external TestKit reference
sed -i 's|TestKit Tech Spec.*|TestKit Usage Guide](../guides/guide-testkit-usage.md) - External TestKit integration patterns|g' /Users/nathanvale/code/adhd-brain/docs/master/prd-master.md

# Fix guide vs spec reference
sed -i 's|./spec-error-recovery-tech.md|../guides/guide-error-recovery.md|g' /Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-metrics-contract-tech.md

# Fix ADR number consistency
sed -i 's|ADR-0007: Sequential Processing Model|ADR-0008: Sequential Processing Model|g' /Users/nathanvale/code/adhd-brain/docs/guides/guide-error-recovery.md
```

---

## Impact Assessment

**Documentation Integrity:** 6/10 → 9/10 after fixes  
**Navigation Reliability:** 5/10 → 9/10 after fixes  
**Phase 1 Readiness:** BLOCKED → READY after P0 fixes

**Total Estimated Fix Time:** 30 minutes for all P0 issues

---

## Validation Commands

After applying fixes, validate with:

```bash
# Check for remaining broken markdown links
find docs -name "*.md" -exec grep -l "\]\([^)]*\.md" {} \; | xargs grep -n "\]\([^)]*\.md"

# Verify all relative paths exist
find docs -name "*.md" -exec grep -l "\.\./.*\.md" {} \; | while read file; do
  echo "Checking: $file"
  grep -o "\.\./[^)]*\.md" "$file" | while read path; do
    dir=$(dirname "$file")
    if [ ! -f "$dir/$path" ]; then
      echo "BROKEN: $file → $path"
    fi
  done
done
```