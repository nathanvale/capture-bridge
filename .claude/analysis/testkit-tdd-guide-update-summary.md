# TestKit TDD Guide Update Summary

**Date**: 2025-10-07
**Affected File**: `.claude/rules/testkit-tdd-guide.md`
**Issue**: Guide showed outdated tmpdir() pattern instead of TestKit's createTempDirectory()

---

## Changes Made

### 1. Updated File Header
- Changed "Last Updated" from 2025-10-04 to 2025-10-07
- Added note: "Added createTempDirectory() pattern, deprecated tmpdir()"

### 2. Added New Section: TestKit Temp Directory Pattern
**Location**: After "Import Patterns" section (line 107-141)

- Shows correct createTempDirectory() usage
- Explains benefits over manual tmpdir()
- Documents automatic cleanup feature
- Cross-references TestKit 2.0.0 utilities

### 3. Updated Cleanup Sequence Section
**Location**: Line 146-220

**Changes**:
- Updated beforeEach to use `createTempDirectory()` instead of tmpdir()
- Removed mkdirSync() call
- Updated afterEach step 3 comment: "TestKit handles temp directory cleanup automatically"
- Removed manual rmSync() call
- Updated title to "4-Step Cleanup (Updated)"

### 4. Updated SQLite Testing Patterns
**Location**: Line 230-274

**Pool Creation with Helper**:
- Changed beforeEach to use createTempDirectory()
- Removed mkdirSync/rmSync imports and calls
- Updated source reference note
- Removed manual directory cleanup from afterEach

### 5. Updated SQLite Test Template
**Location**: Line 644-703

**Changes**:
- Removed mkdirSync, rmSync, tmpdir imports
- Updated beforeEach to use createTempDirectory()
- Removed manual rmSync from afterEach
- Added comment: "TestKit handles temp directory cleanup automatically"

### 6. Updated Production Best Practices
**Location**: Line 732-759

**DO Section**:
- Added #1: "Use TestKit's createTempDirectory()"
- Updated #4: Changed cleanup steps to mention TestKit auto-cleanup
- Added #12 to DON'T: "Don't manually rmSync() temp directories"

**DON'T Section**:
- Added #1: "Don't use Node.js tmpdir()"

### 7. Added Deprecated Patterns Section
**Location**: Line 763-816

**New Section**: "⚠️ DEPRECATED PATTERNS"

Content:
- Shows ❌ Old way (tmpdir + mkdirSync pattern)
- Lists problems with old approach (6 bullet points)
- Shows ✅ New way (createTempDirectory pattern)
- Lists benefits of new approach (6 bullet points)
- Clear deprecation date: 2025-10-07

### 8. Updated Common Patterns Quick Reference
**Location**: Line 820-828

**Added**:
- New "Create Temp Directory" pattern as first entry
- Shows correct createTempDirectory() usage

### 9. Updated Quick Pattern Index
**Location**: Line 50-62

**Added**:
- New link: "TestKit Temp Directory" (line 54)
- New link: "Deprecated Patterns" (line 62)

---

## Pattern Changes Summary

### Before (Deprecated)
```typescript
import { tmpdir } from 'node:os'
import { mkdirSync, rmSync } from 'node:fs'

beforeEach(() => {
  testDir = join(tmpdir(), `test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})
```

### After (Correct)
```typescript
beforeEach(async () => {
  const { createTempDirectory } = await import('@orchestr8/testkit')
  const tempDir = await createTempDirectory()
  testDir = tempDir.path
})

afterEach(async () => {
  // TestKit handles cleanup automatically - no rmSync needed!
})
```

---

## Sections Updated

1. ✅ File header timestamp and changelog
2. ✅ Quick Pattern Index (added 2 new links)
3. ✅ New "TestKit Temp Directory Pattern" section
4. ✅ Cleanup Sequence section (beforeEach/afterEach)
5. ✅ SQLite Testing Patterns (Pool Creation)
6. ✅ SQLite Test Template
7. ✅ Production Best Practices (DO/DON'T lists)
8. ✅ New "Deprecated Patterns" section
9. ✅ Common Patterns Quick Reference

---

## Impact

### What Changed
- All template examples now use createTempDirectory()
- Clear deprecation warnings for tmpdir() pattern
- Updated cleanup sequences remove manual rmSync()
- Documentation now matches TestKit 2.0.0 best practices

### What Stayed the Same
- Test counts (319 tests)
- Performance numbers
- Other patterns (pools, databases, MSW, CLI)
- Overall structure and organization
- All verification sources and references

---

## Next Steps

1. **Wallaby TDD Agent** should be updated with same patterns
   - File: `.claude/agents/wallaby-tdd-agent.md`
   - Update all template examples (lines 241-261, 417-478)
   - Add createTempDirectory() to pre-flight checklist

2. **Foundation Tests** can be migrated (optional)
   - ~40 beforeEach blocks in test files
   - Migrate from tmpdir() to createTempDirectory()
   - Benefits: better isolation, auto cleanup

3. **Verification Test**
   - Run wallaby-tdd-agent with updated guide
   - Confirm it generates createTempDirectory() pattern
   - No tmpdir() imports should appear

---

## Files Modified

- ✅ `.claude/rules/testkit-tdd-guide.md` (this file)
- 📋 `.claude/agents/wallaby-tdd-agent.md` (next)
- 📋 `packages/foundation/src/__tests__/*.test.ts` (optional migration)

---

**Status**: Complete ✅
**Documentation**: Up to date with TestKit 2.0.0 best practices
**Deprecation**: tmpdir() pattern clearly marked and discouraged
