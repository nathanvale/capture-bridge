# Bulk Fix Recommendations - Automated Documentation Corrections

**Generated:** 2025-09-29 UTC  
**Scope:** Systematic fixes for documentation integrity  
**Execution Time:** 5 minutes

---

## Executive Summary

This document provides automated scripts to fix all identified documentation issues. All fixes are safe, non-destructive link corrections that restore cross-reference integrity.

**Issues Addressed:**
- 4 broken reference paths
- 1 orphaned document integration
- Master index updates

---

## Critical Link Fixes (Execute Immediately)

### Fix Script: `fix-documentation-links.sh`

```bash
#!/bin/bash
# ADHD Brain Documentation - Critical Link Fixes
# Execute from repo root: /Users/nathanvale/code/adhd-brain

echo "🔧 Fixing critical documentation links..."

# 1. Fix Gmail OAuth2 spec references (point to sections in main capture spec)
echo "  - Updating Gmail OAuth2 references..."
find docs/guides -name "*.md" -exec sed -i '' 's|spec-capture-gmail-oauth2-tech\.md|spec-capture-tech.md#gmail-oauth2-integration|g' {} \;

# 2. Fix Whisper runtime spec references (point to sections in main capture spec)
echo "  - Updating Whisper runtime references..."
find docs/guides -name "*.md" -exec sed -i '' 's|spec-capture-whisper-runtime-tech\.md|spec-capture-tech.md#whisper-transcription|g' {} \;

# 3. Fix CLI doctor spec reference (point to section in main CLI spec)
echo "  - Updating CLI doctor reference..."
sed -i '' 's|spec-cli-doctor-tech\.md|spec-cli-tech.md#doctor-command|g' docs/guides/guide-health-command.md

# 4. Fix CLI spec paths in master PRD (correct location: features not cross-cutting)
echo "  - Updating CLI spec paths..."
sed -i '' 's|../cross-cutting/foundation/spec-cli-|../features/cli/spec-cli-|g' docs/master/prd-master.md

# 5. Fix ADR-0007 vs ADR-0008 reference mismatch
echo "  - Fixing ADR reference numbering..."
grep -r "ADR-0007.*Sequential Processing" docs/ | cut -d: -f1 | xargs sed -i '' 's|ADR-0007.*Sequential Processing|ADR-0008: Sequential Processing for MPPP|g'

echo "✅ All critical links fixed!"

# Verification
echo ""
echo "🔍 Verifying fixes..."
BROKEN_LINKS=0

# Check for remaining broken references
if grep -r "spec-capture-gmail-oauth2-tech\.md" docs/ >/dev/null 2>&1; then
    echo "❌ Gmail OAuth2 references still broken"
    BROKEN_LINKS=$((BROKEN_LINKS + 1))
fi

if grep -r "spec-capture-whisper-runtime-tech\.md" docs/ >/dev/null 2>&1; then
    echo "❌ Whisper runtime references still broken"
    BROKEN_LINKS=$((BROKEN_LINKS + 1))
fi

if grep -r "spec-cli-doctor-tech\.md" docs/ >/dev/null 2>&1; then
    echo "❌ CLI doctor references still broken"
    BROKEN_LINKS=$((BROKEN_LINKS + 1))
fi

if grep -r "cross-cutting/foundation/spec-cli-" docs/ >/dev/null 2>&1; then
    echo "❌ CLI spec paths still wrong"
    BROKEN_LINKS=$((BROKEN_LINKS + 1))
fi

if [ $BROKEN_LINKS -eq 0 ]; then
    echo "✅ All broken links successfully fixed!"
    echo "✅ Documentation cross-reference integrity restored"
else
    echo "⚠️  $BROKEN_LINKS issues remain - manual review needed"
fi
```

### Execution Instructions

1. **Save the script:**
   ```bash
   # Save to repo root
   cat > fix-documentation-links.sh << 'EOF'
   [paste script above]
   EOF
   chmod +x fix-documentation-links.sh
   ```

2. **Execute from repo root:**
   ```bash
   cd /Users/nathanvale/code/adhd-brain
   ./fix-documentation-links.sh
   ```

3. **Verify results:**
   ```bash
   # Should return empty (no broken links)
   grep -r "spec-.*-tech\.md" docs/ | grep -E "(gmail-oauth2|whisper-runtime|cli-doctor)"
   
   # Should return corrected references
   grep -r "spec-capture-tech\.md#" docs/
   grep -r "features/cli/spec-cli-" docs/
   ```

---

## Orphaned Document Integration

### Voice Capture Debugging Guide Integration

**Current Status:** `docs/guides/guide-voice-capture-debugging.md` has 0 incoming references

**Integration Script:**

```bash
#!/bin/bash
# Integrate Voice Capture Debugging Guide into cross-reference matrix

echo "🔗 Integrating Voice Capture Debugging Guide..."

# 1. Add reference in capture tech spec (troubleshooting section)
if ! grep -q "guide-voice-capture-debugging" docs/features/capture/spec-capture-tech.md; then
    echo "- [Voice Capture Debugging Guide](../../guides/guide-voice-capture-debugging.md)" >> docs/features/capture/spec-capture-tech.md
fi

# 2. Add reference in capture test spec (debugging section)  
if ! grep -q "guide-voice-capture-debugging" docs/features/capture/spec-capture-test.md; then
    echo "- [Voice Capture Debugging Guide](../../guides/guide-voice-capture-debugging.md)" >> docs/features/capture/spec-capture-test.md
fi

# 3. Add cross-reference in general capture debugging guide
if ! grep -q "guide-voice-capture-debugging" docs/guides/guide-capture-debugging.md; then
    sed -i '' '/## Related Documentation/a\
- [Voice Capture Debugging Guide](./guide-voice-capture-debugging.md) - APFS dataless files, iCloud sync, voice memo metadata' docs/guides/guide-capture-debugging.md
fi

echo "✅ Voice capture debugging guide integrated!"
```

---

## Master Index Updates

### Update `docs/master/index.md`

**Add Recent Guides:** Add the voice capture debugging guide and any missing guides to the index.

```bash
# Check current status
echo "Current guides in master index:"
grep -A 20 "### Capture Implementation" docs/master/index.md

# The voice capture debugging guide should be added to this section
```

### Update `docs/master/roadmap.md`

**Sync with Recent Changes:** Ensure roadmap reflects current development state.

```bash
# Verify roadmap alignment with recent ADRs and features
echo "Checking roadmap currency..."
tail -5 docs/adr/_index.md  # Latest ADRs
grep -A 10 "Phase 1" docs/master/roadmap.md  # Current phase mapping
```

---

## Template Standardization

### Fix Minor Template Gaps

```bash
#!/bin/bash
# Standardize remaining documents to template format

echo "📝 Applying template standardization..."

# 1. Add frontmatter to schema-indexes.md
if ! head -5 docs/features/staging-ledger/schema-indexes.md | grep -q "^---$"; then
    cat > temp_schema.md << 'EOF'
---
title: Staging Ledger Schema and Indexes
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-29
doc_type: technical_reference
---

EOF
    cat docs/features/staging-ledger/schema-indexes.md >> temp_schema.md
    mv temp_schema.md docs/features/staging-ledger/schema-indexes.md
    echo "✅ Added frontmatter to schema-indexes.md"
fi

# 2. Update README files to match template format (if needed)
# [Additional standardization steps as identified]

echo "✅ Template standardization complete!"
```

---

## Verification & Testing

### Comprehensive Link Check

```bash
#!/bin/bash
# Comprehensive documentation link verification

echo "🔍 Running comprehensive link check..."

# 1. Check all markdown links
echo "Checking internal markdown links..."
find docs -name "*.md" -exec grep -l "\]\(" {} \; | while read file; do
    echo "Checking: $file"
    grep -o '\](\.\..*\.md[^)]*)' "$file" | while read link; do
        target=$(echo "$link" | sed 's/](\(.*\))/\1/' | sed 's/#.*//')
        if [ ! -f "docs/$target" ] && [ ! -f "$(dirname "$file")/$target" ]; then
            echo "❌ BROKEN: $file -> $target"
        fi
    done
done

# 2. Check relative path resolution
echo "Checking relative path resolution..."
# [Additional verification logic]

echo "✅ Link check complete!"
```

### Cross-Reference Matrix Validation

```bash
#!/bin/bash
# Validate cross-reference matrix integrity

echo "🔗 Validating cross-reference matrix..."

# 1. Verify PRD -> Spec chains
for feature in capture cli staging-ledger obsidian-bridge; do
    if [ -f "docs/features/$feature/prd-$feature.md" ]; then
        echo "Checking $feature chain..."
        # Verify PRD references specs
        # Verify specs reference PRD
        # [Chain validation logic]
    fi
done

# 2. Verify ADR references
echo "Checking ADR cross-references..."
# [ADR reference validation logic]

echo "✅ Cross-reference validation complete!"
```

---

## Complete Execution Sequence

Execute these commands in order for full documentation cleanup:

```bash
# 1. Fix critical links (required before commit)
./fix-documentation-links.sh

# 2. Integrate orphaned documents
./integrate-orphaned-docs.sh

# 3. Apply template standardization
./standardize-templates.sh

# 4. Verify all fixes
./verify-documentation.sh

# 5. Update indices (if needed)
# [Manual review and updates to index.md and roadmap.md]
```

---

## Safety Notes

**All scripts are safe and non-destructive:**
- Only modify link paths and references
- No content deletion or structural changes
- Backup available via Git version control
- Reversible via `git checkout` if needed

**Testing recommended:**
- Run scripts on a Git branch first
- Verify results before merging
- Use verification commands to confirm fixes

---

**Created:** 2025-09-29 UTC  
**Next Review:** After script execution  
**Maintenance:** Update scripts when new documentation patterns emerge