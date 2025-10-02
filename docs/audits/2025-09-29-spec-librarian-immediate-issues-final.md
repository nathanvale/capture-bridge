# Immediate Issues Report - Critical Fixes Needed Before Commit

**Generated:** 2025-09-29 UTC  
**Priority:** P0 - Must Fix Before Git Commit  
**Estimated Fix Time:** 15 minutes

---

## Executive Summary

**Critical Issues Found:** 4 broken references  
**Impact:** Navigation failures, broken cross-reference integrity  
**Action Required:** Execute 4 simple find-and-replace operations

All issues are straightforward path corrections. No structural changes needed.

---

## P0 Critical Fixes (Execute Now)

### 1. Missing Gmail OAuth2 & Whisper Tech Specs

**Issue:** Guides reference non-existent spec files that should point to sections in existing specs.

**Broken References:**

```bash
# In docs/guides/guide-health-command.md:
../features/capture/spec-capture-gmail-oauth2-tech.md  # MISSING FILE
../features/capture/spec-capture-whisper-runtime-tech.md  # MISSING FILE

# In docs/guides/guide-error-recovery.md:
../features/capture/spec-capture-gmail-oauth2-tech.md  # MISSING FILE
../features/capture/spec-capture-whisper-runtime-tech.md  # MISSING FILE
```

**Root Cause:** These topics are covered in `spec-capture-tech.md` as sections, not separate files.

**Fix Command:**

```bash
# Update Gmail OAuth2 references to point to capture tech spec section
find /Users/nathanvale/code/capture-bridge/docs/guides -name "*.md" -exec sed -i '' 's|spec-capture-gmail-oauth2-tech.md|spec-capture-tech.md#gmail-oauth2|g' {} \;

# Update Whisper runtime references to point to capture tech spec section
find /Users/nathanvale/code/capture-bridge/docs/guides -name "*.md" -exec sed -i '' 's|spec-capture-whisper-runtime-tech.md|spec-capture-tech.md#whisper-transcription|g' {} \;
```

### 2. Missing CLI Doctor Tech Spec

**Issue:** Health command guide references non-existent CLI doctor spec.

**Broken Reference:**

```bash
# In docs/guides/guide-health-command.md:
../features/cli/spec-cli-doctor-tech.md  # MISSING FILE
```

**Root Cause:** Doctor command is covered in main CLI tech spec, not separate file.

**Fix Command:**

```bash
# Update CLI doctor reference to point to main CLI tech spec section
sed -i '' 's|spec-cli-doctor-tech.md|spec-cli-tech.md#doctor-command|g' /Users/nathanvale/code/capture-bridge/docs/guides/guide-health-command.md
```

### 3. Wrong CLI Spec Paths in Master PRD

**Issue:** Master PRD references CLI specs in wrong location (cross-cutting instead of features).

**Broken References:**

```bash
# In docs/master/prd-master.md:
../cross-cutting/foundation/spec-cli-tech.md  # WRONG PATH
../cross-cutting/foundation/spec-cli-test.md  # WRONG PATH
```

**Root Cause:** CLI specs moved from cross-cutting to features (correct classification).

**Fix Command:**

```bash
# Update CLI spec paths to correct feature location
sed -i '' 's|../cross-cutting/foundation/spec-cli-|../features/cli/spec-cli-|g' /Users/nathanvale/code/capture-bridge/docs/master/prd-master.md
```

---

## Complete Fix Script

Execute this single script to fix all issues:

```bash
#!/bin/bash
# ADHD Brain Documentation - Critical Link Fixes
# Execute from repo root: /Users/nathanvale/code/capture-bridge

echo "Fixing critical documentation links..."

# 1. Fix Gmail OAuth2 spec references
echo "- Updating Gmail OAuth2 references..."
find docs/guides -name "*.md" -exec sed -i '' 's|spec-capture-gmail-oauth2-tech.md|spec-capture-tech.md#gmail-oauth2|g' {} \;

# 2. Fix Whisper runtime spec references
echo "- Updating Whisper runtime references..."
find docs/guides -name "*.md" -exec sed -i '' 's|spec-capture-whisper-runtime-tech.md|spec-capture-tech.md#whisper-transcription|g' {} \;

# 3. Fix CLI doctor spec reference
echo "- Updating CLI doctor reference..."
sed -i '' 's|spec-cli-doctor-tech.md|spec-cli-tech.md#doctor-command|g' docs/guides/guide-health-command.md

# 4. Fix CLI spec paths in master PRD
echo "- Updating CLI spec paths..."
sed -i '' 's|../cross-cutting/foundation/spec-cli-|../features/cli/spec-cli-|g' docs/master/prd-master.md

echo "✅ All critical links fixed!"
echo "Run 'grep -r \"spec-.*-tech.md\" docs/' to verify no broken references remain"
```

---

## Verification Steps

After running fixes, verify success:

```bash
# 1. Check for any remaining broken spec references
grep -r "spec-capture-gmail-oauth2-tech.md" docs/
grep -r "spec-capture-whisper-runtime-tech.md" docs/
grep -r "spec-cli-doctor-tech.md" docs/
grep -r "cross-cutting/foundation/spec-cli-" docs/

# Should return no results if fixes worked

# 2. Verify the corrected references exist
grep -r "spec-capture-tech.md#gmail-oauth2" docs/
grep -r "spec-capture-tech.md#whisper-transcription" docs/
grep -r "spec-cli-tech.md#doctor-command" docs/
grep -r "features/cli/spec-cli-" docs/

# Should return the fixed references
```

---

## Impact Assessment

### Before Fix

- ❌ 4 broken navigation links
- ❌ Compromised cross-reference integrity
- ❌ Users cannot follow documentation trails
- ❌ Automated link checkers would fail

### After Fix

- ✅ 100% reference integrity restored
- ✅ All documentation trails navigable
- ✅ Cross-reference matrix complete
- ✅ Ready for automated link validation

**Time to Fix:** 2 minutes  
**Risk Level:** Zero (pure link corrections)  
**Testing Required:** Link verification commands above

---

## Additional Notes

### Why These References Broke

1. **Spec Consolidation:** Gmail OAuth2 and Whisper content was integrated into main capture spec rather than separate files (good decision)

2. **CLI Reclassification:** CLI properly moved from cross-cutting to features (correct architecture)

3. **Doctor Integration:** Doctor command content integrated into main CLI spec (appropriate scope)

### Prevention Strategy

- Add automated link checking to CI pipeline
- Monthly documentation audits
- Update requirements when moving/consolidating specs
- Maintain cross-reference matrix

**Next Steps:** Execute fix script, verify results, proceed with Git commit.
