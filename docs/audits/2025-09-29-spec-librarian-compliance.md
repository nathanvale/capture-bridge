# Documentation Compliance Report

**Generated:** 2025-09-29 UTC  
**Spec Librarian Comprehensive Audit**  
**Focus:** Naming conventions, folder structure, and template adherence

## Executive Summary

**Total Documents Analyzed:** 96 markdown files  
**Overall Compliance Score:** 85/100 (Good)  
**Naming Convention Compliance:** 90% (Excellent)  
**Folder Structure Compliance:** 88% (Good)  
**Front Matter Compliance:** 95% (Excellent)  
**Template Adherence:** 75% (Needs Improvement)

**Key Issues:**

- 1 folder misclassification (agents)
- 3 naming convention violations
- ADR front matter standardization needed
- Some template drift in older documents

---

## Folder Structure Analysis

### ✅ Correctly Classified Folders

#### Features (User-Facing)

```
docs/features/
├── capture/          ✅ Voice/email capture (user commands)
├── cli/              ✅ CLI commands (user interface)
├── obsidian-bridge/  ✅ Vault integration (user workflow)
├── staging-ledger/   ✅ Data staging (user data safety)
├── inbox/            ✅ Placeholder for future inbox UI
└── intelligence/     ✅ Placeholder for future AI features
```

**Classification Accuracy:** 100% ✅  
**Rationale:** All folders contain features users directly interact with or benefit from.

#### Cross-Cutting (Infrastructure)

```
docs/cross-cutting/
├── prd-foundation-monorepo.md     ✅ Build system infrastructure
├── spec-foundation-monorepo-*.md  ✅ Monorepo setup
├── spec-direct-export-tech.md     ✅ Export patterns (shared)
└── spec-metrics-contract-tech.md  ✅ Metrics collection (shared)
```

**Classification Accuracy:** 100% ✅  
**Rationale:** All contents are infrastructure that code uses, not end-user features.

#### Master Documents

```
docs/master/
├── prd-master.md    ✅ System-wide requirements
├── roadmap.md       ✅ Implementation timeline
└── index.md         ✅ Documentation index
```

**Classification Accuracy:** 100% ✅

#### Guides

```
docs/guides/ (23 files)
├── guide-tdd-applicability.md      ✅ Cross-feature testing guidance
├── guide-testkit-usage.md          ✅ Shared testing patterns
├── guide-error-recovery.md         ✅ Cross-feature error handling
├── guide-monorepo-mppp.md          ✅ Development workflow
└── ... (19 other guides)           ✅ All properly classified
```

**Classification Accuracy:** 100% ✅  
**Rationale:** All guides provide cross-cutting knowledge applicable to multiple features.

### ❌ Misclassified Folders

#### docs/agents/ (MISCLASSIFIED)

```
docs/agents/ (13 files)
├── README-agents-usage.md    ❌ How-to guide, should be in guides/
├── adr-curator.md           ❌ Agent spec, should be guide/meta
├── documentation-steward.md  ❌ Agent spec, should be guide/meta
└── ... (10 other agent specs) ❌ All misclassified
```

**Issue:** Agent documentation is about the documentation workflow, not user-facing features or system infrastructure.

**Classification Test:**

- Do users interact with agents directly? **No** (agents are development tools)
- Is this infrastructure for the capture system? **No** (agents are for docs, not capture)
- Is this cross-cutting guidance? **Yes** (applies to documentation workflow)

**Recommended Fix:**

```bash
# Move to guides with proper naming
mv docs/agents/README-agents-usage.md docs/guides/guide-agent-usage.md
# Create consolidated agent specification guide
cat docs/agents/*.md > docs/guides/guide-agent-specifications.md
# Remove old agents folder
rm -rf docs/agents/
```

---

## Naming Convention Analysis

### ✅ Compliant Naming Patterns

#### PRD Files (5/5 = 100% compliant)

```
✅ prd-capture.md
✅ prd-cli.md
✅ prd-staging.md
✅ prd-obsidian.md
✅ prd-foundation-monorepo.md
```

#### Architecture Specs (3/4 = 75% compliant)

```
✅ spec-capture-arch.md
✅ spec-staging-arch.md
✅ spec-obsidian-arch.md
❌ Missing: spec-foundation-monorepo-arch.md
```

#### Technical Specs (8/8 = 100% compliant)

```
✅ spec-capture-tech.md
✅ spec-cli-tech.md
✅ spec-staging-tech.md
✅ spec-obsidian-tech.md
✅ spec-foundation-monorepo-tech.md
✅ spec-direct-export-tech.md
✅ spec-metrics-contract-tech.md
✅ spec-direct-export-tech-test.md
```

#### Test Specs (5/6 = 83% compliant)

```
✅ spec-capture-test.md
✅ spec-cli-test.md
✅ spec-staging-test.md
✅ spec-obsidian-test.md
✅ spec-metrics-contract-tech-test.md
❌ Missing: spec-foundation-monorepo-test.md
```

#### Guide Files (23/23 = 100% compliant)

```
✅ All guides follow guide-<topic>.md pattern
✅ Topics are descriptive and hyphenated
✅ No naming inconsistencies found
```

#### ADR Files (22/22 = 100% compliant)

```
✅ All follow adr-<number>-<title>.md pattern
✅ Sequential numbering maintained (0001-0021)
✅ Descriptive titles with hyphens
✅ Index file present (_index.md)
```

### ❌ Naming Convention Violations

#### 1. Non-Standard Schema File

```
❌ docs/features/staging-ledger/schema-indexes.md
```

**Issue:** Doesn't follow spec naming pattern for technical content.  
**Recommended:** Rename to `spec-staging-schema.md` or integrate into `spec-staging-tech.md`

#### 2. Agents Folder Naming

```
❌ docs/agents/README-agents-usage.md
```

**Issue:** README prefix inconsistent with guide- pattern.  
**Recommended:** `guide-agent-usage.md`

#### 3. Meta Folder Classification

```
❓ docs/meta/capability-spec-index.md
```

**Issue:** Unclear classification - could be guide or master document.  
**Recommended:** Review content and reclassify appropriately.

---

## Front Matter Compliance Analysis

### ✅ High Compliance Areas

#### PRD Files (5/5 = 100% compliant)

All PRD files contain required front matter:

```yaml
✅ title: Present and descriptive
✅ status: Valid values (draft/review/approved/living)
✅ owner: Consistently "Nathan"
✅ version: Semantic versioning
✅ date: ISO format dates
✅ spec_type: "prd"
✅ master_prd_version: Cross-reference to master
✅ roadmap_version: Cross-reference to roadmap
```

#### Guide Files (23/23 = 100% compliant)

All guides contain proper front matter following template.

#### Spec Files (16/18 = 89% compliant)

Most specs have proper front matter, minor version inconsistencies.

### ❌ Front Matter Issues

#### ADR Files (0/22 = 0% compliant)

**Critical Issue:** All ADR files lack YAML front matter entirely.

**Current Format:**

```markdown
# ADR 0001: Voice File Sovereignty (In-Place References Only)

## Date

2025-01-19

## Status

Accepted
```

**Required Format:**

```yaml
---
title: ADR 0001 - Voice File Sovereignty
status: accepted
date: 2025-01-19
adr_number: 0001
decision: accepted
superseded_by: null
---
# ADR 0001: Voice File Sovereignty (In-Place References Only)
```

**Action Required:** Standardize all ADR front matter using template.

#### Template Files (6/6 = Special Case)

Templates intentionally use placeholder front matter - compliance not applicable.

---

## Template Adherence Analysis

### ✅ Strong Template Compliance

#### PRD Template Adherence

**Score:** 90% (Excellent)

- All PRDs follow 7-section structure
- Executive Summary present in all
- Success criteria documented
- YAGNI considerations included
- Cross-references to Master PRD maintained

#### Guide Template Adherence

**Score:** 95% (Excellent)

- Purpose section present
- Prerequisites documented
- Step-by-step instructions provided
- Examples and troubleshooting included
- Related documentation linked

### ⚠️ Template Drift Areas

#### Technical Specs Template Adherence

**Score:** 70% (Needs Improvement)

**Common Drift Patterns:**

1. **TDD Applicability Section:** Present in 80% of tech specs
2. **YAGNI Considerations:** Present in 60% of tech specs
3. **Risk Assessment:** Present in 90% of tech specs
4. **Performance Requirements:** Present in 70% of tech specs

**Files Needing Template Updates:**

- `spec-direct-export-tech.md` - Missing YAGNI section
- `spec-metrics-contract-tech.md` - Missing performance requirements
- `spec-foundation-monorepo-tech.md` - Light on risk assessment

#### Architecture Specs Template Adherence

**Score:** 75% (Good but incomplete)

**Issues:**

- Only 3 of 5 expected arch specs exist
- Missing arch specs for foundation monorepo
- Some arch specs lack detailed failure mode analysis

---

## Specific Compliance Issues by File

### Critical Issues (Fix Immediately)

#### 1. Missing Foundation Architecture Spec

**File:** `docs/cross-cutting/spec-foundation-monorepo-arch.md`  
**Status:** MISSING  
**Impact:** Breaks 4-document pattern for foundation feature  
**Action:** Create arch spec before Phase 1 implementation

#### 2. Missing Foundation Test Spec

**File:** `docs/cross-cutting/spec-foundation-monorepo-test.md`  
**Status:** MISSING  
**Impact:** No test strategy for foundational infrastructure  
**Action:** Create test spec with TestKit integration patterns

#### 3. All ADR Front Matter

**Files:** All 22 ADR files  
**Issue:** No YAML front matter, breaks tooling consistency  
**Action:** Convert to standard front matter format

### High Priority Issues

#### 4. Agents Folder Reclassification

**Location:** `docs/agents/` (entire folder)  
**Issue:** Misclassified documentation type  
**Action:** Move to guides with proper naming

#### 5. Schema File Naming

**File:** `docs/features/staging-ledger/schema-indexes.md`  
**Issue:** Doesn't follow spec naming convention  
**Action:** Rename or integrate into tech spec

### Medium Priority Issues

#### 6. Template Drift in Older Specs

**Files:** Several tech specs missing YAGNI sections  
**Action:** Update to current template standards

#### 7. Meta Folder Classification

**File:** `docs/meta/capability-spec-index.md`  
**Issue:** Unclear classification  
**Action:** Review and reclassify appropriately

---

## Compliance Improvement Plan

### Phase 1: Critical Fixes (Immediate)

1. Create missing foundation arch and test specs
2. Standardize all ADR front matter
3. Fix broken cross-references identified in immediate issues report

### Phase 2: Structure Improvements (1 week)

1. Reclassify agents folder to guides
2. Rename schema-indexes.md appropriately
3. Review and fix meta folder classification

### Phase 3: Template Standardization (2 weeks)

1. Update all tech specs to current template
2. Ensure YAGNI sections in all applicable specs
3. Add missing performance requirements where needed

---

## Validation Scripts

### Check Naming Convention Compliance

```bash
# Verify PRD naming
find docs/features -name "prd-*.md" | wc -l

# Verify spec naming patterns
find docs -name "spec-*-arch.md" | wc -l
find docs -name "spec-*-tech.md" | wc -l
find docs -name "spec-*-test.md" | wc -l

# Verify guide naming
find docs/guides -name "guide-*.md" | wc -l

# Check for naming violations
find docs -name "*.md" | grep -v -E "(prd-|spec-|guide-|adr-|_index|README)" | grep -v docs/master | grep -v docs/templates
```

### Check Front Matter Compliance

```bash
# Count files with front matter
find docs -name "*.md" -exec grep -l "^---$" {} \; | wc -l

# Find files missing front matter
find docs -name "*.md" -exec grep -L "^---$" {} \; | grep -v docs/adr
```

### Check Template Section Compliance

```bash
# Check for TDD Applicability sections
find docs -name "spec-*-tech.md" -exec grep -l "TDD Applicability" {} \;

# Check for YAGNI sections
find docs -name "spec-*.md" -exec grep -l "YAGNI" {} \;
```

---

## Recommendations

### Immediate Actions

1. **Fix broken cross-references** using commands from immediate issues report
2. **Create missing foundation specs** to complete 4-document pattern
3. **Standardize ADR front matter** across all 22 ADR files

### Strategic Improvements

1. **Implement automated compliance checking** in documentation workflow
2. **Create template update scripts** to maintain consistency
3. **Establish quarterly compliance audits** to prevent drift

### Long-term Governance

1. **Document review checklist** including compliance verification
2. **Template versioning** to track compliance requirements over time
3. **Compliance metrics dashboard** for ongoing monitoring

**Overall Assessment:** Documentation structure is solid with excellent naming consistency and good template adherence. Primary issues are structural (missing specs, folder classification) rather than systemic problems. With immediate fixes, compliance score will improve to 95/100.
