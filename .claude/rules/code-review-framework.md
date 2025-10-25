# Code Review Framework - P0123 Risk Analysis

**Purpose**: Standardized P0123 code review structure and assessment criteria

**Used By**: `/review-task`, VS Code review prompts, `code-reviewer` agent

---

## P0123 Risk Dimensions

### P0 - Critical Production Risks (BLOCKING)

**Severity**: Must fix before merge

**Categories**:

1. **Security Vulnerabilities**
   - SQL injection (non-parameterized queries)
   - XSS (unescaped user input in HTML)
   - CSRF (missing token validation)
   - Secrets exposure (hardcoded keys, logged credentials)
   - Insecure deserialization
   - Authentication bypass
   - Authorization gaps

2. **Data Loss Risks**
   - Missing database transactions
   - Unsafe deletions (no confirmation, no cascade protection)
   - Race conditions in concurrent writes
   - Missing backup before destructive operations
   - Schema migrations without backfill

3. **Crash/Corruption Risks**
   - Unhandled promise rejections
   - Null pointer exceptions (unchecked undefined access)
   - Division by zero
   - Buffer overflows
   - Deadlocks
   - Stack overflow (unbounded recursion)

4. **Breaking Changes**
   - API contract violations (removed fields, changed types)
   - Database schema incompatibilities
   - Breaking semantic changes
   - Removed required functionality

5. **Resource Leaks**
   - Unclosed database connections
   - Unclosed file handles
   - Memory leaks (circular references, unbounded caches)
   - Event listener leaks (no removeListener)
   - Timer leaks (setInterval without clearInterval)

**Issue Template**:
```markdown
### 🚨 P0-${number}: ${title}

**Location:** \`${file}:${line}\`
**Severity:** BLOCKING
**Category:** ${security|data_loss|crash|breaking|resource_leak}

**Issue:**
${detailed_description}

**Attack Vector / Failure Scenario:**
${how_this_fails_in_production}

**Code:**
\`\`\`${language}
${problematic_code}
\`\`\`

**Required Fix:**
${specific_remediation_steps}

**Suggested Code:**
\`\`\`${language}
${fixed_code_example}
\`\`\`
```

---

### P1 - High-Impact Quality Issues (STRONGLY RECOMMENDED)

**Severity**: Should fix before merge (or defer with justification)

**Categories**:

1. **Test Coverage Gaps**
   - Critical paths untested
   - Edge cases missing (null, empty, boundary values)
   - Error paths untested
   - Integration points untested
   - High-risk code without TDD coverage

2. **Error Handling Gaps**
   - Catch without logging
   - Silent failures
   - Generic error messages (no context)
   - Missing input validation
   - Uncaught async errors

3. **Performance Issues**
   - N+1 database queries
   - Missing indexes on queried columns
   - Blocking I/O in async functions
   - Large synchronous operations
   - Memory-inefficient algorithms (O(n²) where O(n) possible)

4. **Type Safety Violations**
   - `any` types where specific types available
   - Non-null assertions (`!`) without guards
   - Unsafe type casts
   - Missing input validation before type coercion

5. **Architectural Violations**
   - Breaking MPPP constraints (no concurrency, inbox-only, etc.)
   - Violating ADR decisions
   - Bypassing established patterns
   - Direct database access where repository pattern required

**Issue Template**:
```markdown
### ⚠️  P1-${number}: ${title}

**Location:** \`${file}:${line}\`
**Impact:** ${impact_description}
**Category:** ${test|error|performance|types|architecture}

**Issue:**
${description}

**Suggested Fix:**
${remediation_approach}

**Code Example:**
\`\`\`${language}
${improved_code}
\`\`\`
```

---

### P2 - Code Quality & Maintainability (RECOMMENDED)

**Severity**: Improve over time (backlog acceptable)

**Categories**:

1. **Code Smells**
   - Long functions (>50 lines)
   - Deep nesting (>3 levels)
   - High cyclomatic complexity (>10)
   - God objects (too many responsibilities)
   - Feature envy (accessing other object's data excessively)

2. **Duplication**
   - Copy-paste code blocks
   - Similar logic in multiple places
   - Missed abstraction opportunities
   - Redundant type definitions

3. **Naming Issues**
   - Unclear variable names (x, temp, data)
   - Misleading function names
   - Inconsistent naming conventions
   - Abbreviations without context

4. **Missing Documentation**
   - Complex logic without comments
   - Public APIs without JSDoc
   - Magic numbers without explanation
   - Non-obvious algorithms without references

5. **Technical Debt**
   - TODO comments
   - Temporary hacks
   - Disabled linter rules without justification
   - Skipped tests

**Issue Template**:
```markdown
### 💡 P2-${number}: ${title}

**Location:** \`${file}:${line}\`
**Category:** ${smell|duplication|naming|documentation|debt}

**Issue:**
${description}

**Refactoring Suggestion:**
${improvement_approach}

**Benefit:**
${maintainability_improvement}
```

---

### P3 - Style & Best Practices (OPTIONAL)

**Severity**: Nice-to-have improvements

**Categories**:

1. **Style Inconsistencies**
   - Formatting deviations (usually auto-fixed by Prettier)
   - Import organization
   - Inconsistent spacing

2. **Best Practice Opportunities**
   - Modern language features available (optional chaining, nullish coalescing)
   - More idiomatic patterns
   - Simpler alternatives

3. **Minor Optimizations**
   - Unnecessary allocations
   - Redundant computations
   - Slightly better algorithms

**Issue Template**:
```markdown
### 📝 P3-${number}: ${title}

**Location:** \`${file}:${line}\`

**Suggestion:**
${improvement}
```

---

## Review Report Structure

```markdown
# Code Review Report: ${task_id}

## Executive Summary
- **Task:** ${task.title}
- **Risk Level:** ${task.risk}
- **PR:** #${pr_number}
- **Files Changed:** ${files_count}
- **Lines Added/Removed:** +${additions}/-${deletions}

**Overall Assessment:** ${PASS|PASS_WITH_RECOMMENDATIONS|BLOCKING_ISSUES}

**Critical Findings:** ${p0_count} P0, ${p1_count} P1, ${p2_count} P2, ${p3_count} P3

---

## P0 - Critical Issues (${p0_count})

${if p0_count === 0}
✅ **No critical issues found**
${else}
${for_each_p0_issue}
[Use P0 template above]
${end_for}
${end_if}

---

## P1 - High-Impact Quality Issues (${p1_count})

[Same structure as P0]

---

## P2 - Code Quality & Maintainability (${p2_count})

[Same structure as P0]

---

## P3 - Style & Best Practices (${p3_count})

[Same structure as P0]

---

## Positive Observations

${highlight_good_patterns}
- ✅ Excellent test coverage for ${feature}
- ✅ Proper error handling in ${module}
- ✅ Clean separation of concerns
- ✅ Well-documented complex logic

---

## Specification Compliance

**Acceptance Criteria Validation:**
${for_each_ac}
- [✅/❌] **${ac.id}:** ${ac.text}
  - Implementation: ${implementation_notes}
  - Test Coverage: ${test_coverage_assessment}
${end_for}

**ADR Compliance:**
${for_each_adr}
- **${adr.id}:** ${adr.title}
  - Compliance: [✅ Followed / ⚠️ Partial / ❌ Violated]
  - Notes: ${specific_compliance_notes}
${end_for}

---

## Test Quality Assessment

**Coverage Metrics:**
- Lines: ${line_coverage}%
- Branches: ${branch_coverage}%
- Functions: ${function_coverage}%

**Test Observations:**
- Test count: ${test_count}
- Test types: ${unit_count} unit, ${integration_count} integration
- Quality notes: ${test_quality_observations}

**Gaps Identified:**
${list_test_coverage_gaps}

---

## Recommendations

### Immediate (Pre-Merge)
${if p0_count > 0}
🚨 **BLOCK MERGE** - ${p0_count} critical issues must be fixed
${else_if p1_count > 0}
⚠️  Address ${p1_count} high-impact issues (or defer with justification)
${else}
✅ Safe to merge
${end_if}

### Short-Term (Next Sprint)
${p1_recommendations_if_deferred}

### Long-Term (Backlog)
${p2_p3_recommendations}

---

## Review Metadata

**Reviewer:** ${reviewer_name}
**Review Date:** ${ISO8601}
**Review Duration:** ${duration}
**Automated Tools Used:** ${tools_list}
**Manual Analysis:** P0123 risk framework
```

---

## Assessment Criteria

### BLOCKING_ISSUES (Cannot Merge)
```typescript
assessment = 'BLOCKING_ISSUES' if (p0_count > 0)
```

### PASS_WITH_RECOMMENDATIONS (Merge After Review)
```typescript
assessment = 'PASS_WITH_RECOMMENDATIONS' if (
  p0_count === 0 &&
  p1_count > 0
)
```

### PASS (Merge Freely)
```typescript
assessment = 'PASS' if (
  p0_count === 0 &&
  p1_count === 0
)
```

---

## Review Checklist

Before completing review:

**P0 Analysis**:
- [ ] Checked for SQL injection (all queries parameterized?)
- [ ] Checked for secrets exposure (no hardcoded keys?)
- [ ] Checked for resource leaks (all connections closed?)
- [ ] Checked for unhandled errors (all promises caught?)
- [ ] Checked for breaking changes (API contracts maintained?)

**P1 Analysis**:
- [ ] Verified test coverage (critical paths tested?)
- [ ] Checked error handling (all errors logged?)
- [ ] Identified performance issues (N+1 queries?)
- [ ] Checked type safety (no `any` without justification?)
- [ ] Verified ADR compliance (constraints respected?)

**P2 Analysis**:
- [ ] Identified code smells (long functions, duplication?)
- [ ] Checked naming (clear, consistent?)
- [ ] Verified documentation (complex logic explained?)
- [ ] Identified technical debt (TODOs addressed?)

**P3 Analysis**:
- [ ] Noted style opportunities
- [ ] Identified best practice improvements

---

**Last Updated**: 2025-10-25
**Maintained By**: Code Quality Team
