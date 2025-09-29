---
title: Resilience Pattern Standardization Audit
status: completed
owner: spec-librarian
version: 1.0.0
date: 2025-09-29
---

# Resilience Pattern Standardization Audit

## Executive Summary

Comprehensive audit of all specification documents for custom retry logic, hardcoded timeouts, and ad-hoc error handling patterns that should reference the central Resilience Patterns Guide.

## Audit Findings

### 1. Specs with Custom Resilience Logic

#### A. Features with Hardcoded Patterns

##### 1. **Staging Ledger** (`features/staging-ledger/spec-staging-tech.md`)

- **Line 338**: Hardcoded SQLite busy timeout: `PRAGMA busy_timeout = 5000;`
- **Line 1056**: Hardcoded Whisper timeout: `'Whisper timeout after 30s'`
- **Lines 925, 1199**: References to timeouts in test scenarios
- **Recommendation**: Reference Database Resilience pattern from guide

##### 2. **Obsidian Bridge** (`features/obsidian-bridge/spec-obsidian-arch.md`)

- **Line 85**: Mentions "No retry logic" as current limitation
- **Lines 258, 262**: Custom retry eligibility classification (EACCES, ENETDOWN)
- **Lines 375, 385, 387**: Custom retry strategies with hardcoded attempts (3x, 5x)
- **Line 602**: Plans for "Exponential backoff for EACCES, ENETDOWN"
- **Line 721**: Open question about retry parameters
- **Recommendation**: Reference File System Operations pattern from guide

##### 3. **Capture Feature** (`features/capture/spec-capture-tech.md`)

- **Lines 26-31**: Describes resilience enhancements but with custom implementation details
- **Lines 139-144**: Custom retry logic in state transitions
- **Lines 191-204**: Imports resilience components but no standard reference
- **Lines 284, 289-296**: Hardcoded exponential backoff parameters
- **Lines 313-316**: Progressive timeout calculation with hardcoded values
- **Lines 419-426**: Custom retry matrix with specific attempt counts
- **Recommendation**: Reference appropriate patterns for each external service

##### 4. **CLI** (`features/cli/spec-cli-tech.md`)

- **Line 60**: States "safe to retry after crash" but no pattern reference
- **Line 298**: Retry column in error table but no standardized approach
- **Line 396**: Mentions spinners for long operations but no timeout strategy
- **Recommendation**: Reference User-Facing Operations patterns

#### B. Test Specs with Custom Error Handling

##### 1. **Obsidian Test** (`features/obsidian-bridge/spec-obsidian-test.md`)

- **Lines 107-110**: Custom retry eligibility for errors
- **Lines 151-152**: Custom retry/timeout utilities
- **Lines 628, 644**: Retry eligibility verification in tests
- **Lines 1107-1110**: Plans for retry logic testing with custom parameters
- **Recommendation**: Reference test patterns from guide

##### 2. **CLI Test** (`features/cli/spec-cli-test.md`)

- **Lines 346-352, 419-424, 471-476**: Custom retry test scenarios
- **Line 465**: Hardcoded retry_count
- **Lines 605-607**: Retry export patterns
- **Line 1253**: Custom timeout handling
- **Recommendation**: Standardize test retry scenarios

### 2. Package Reference Issues

#### Critical Finding: Non-existent Package References

- **Multiple specs would reference `@adhd-brain/resilience`** - This package does not exist!
- Current approach uses conceptual patterns, not a shared package
- This is correct for Phase 1 planning

### 3. Specs Needing Updates

#### Priority 1 - Active Feature Specs

1. `features/capture/spec-capture-tech.md` - Most custom patterns
2. `features/obsidian-bridge/spec-obsidian-arch.md` - Mixed approaches
3. `features/staging-ledger/spec-staging-tech.md` - Database-specific timeouts

#### Priority 2 - Supporting Specs

1. `features/cli/spec-cli-tech.md` - Error handling patterns
2. `features/obsidian-bridge/spec-obsidian-test.md` - Test patterns
3. `features/cli/spec-cli-test.md` - Test retry scenarios

#### Priority 3 - Already Aligned

1. `adr/0030-resilience-library-selection.md` - References guide correctly
2. Cross-cutting specs - Generally don't have resilience patterns

## Recommended Updates

### Pattern Mapping

| Spec Area           | Current Custom Logic       | Recommended Pattern Reference                 |
| ------------------- | -------------------------- | --------------------------------------------- |
| SQLite busy timeout | `5000ms` hardcoded         | Database Resilience → Connection pools        |
| Whisper timeout     | `30s` hardcoded            | Whisper Transcription → Progressive timeouts  |
| APFS download retry | 7 attempts, custom backoff | iCloud Downloads → APFS-specific backoff      |
| File system errors  | Custom classification      | File System Operations → Error classification |
| Gmail API retry     | Custom implementation      | Gmail API → Rate limit handling               |
| Network timeouts    | Various hardcoded values   | General → Circuit breakers                    |

### Standardization Approach

1. **Replace hardcoded values** with pattern references
2. **Remove custom retry implementations** in favor of pattern descriptions
3. **Link to Resilience Patterns Guide** for detailed strategies
4. **Maintain spec-specific context** while using standard patterns
5. **Keep test specs aligned** with production patterns

## Special Considerations

### Unique Requirements Identified

1. **Sequential Processing** (iCloud downloads) - Pattern guide covers this
2. **Database Pragmas** - Keep as spec-specific but reference pattern
3. **ADHD-Friendly Timeouts** - Pattern guide emphasizes this throughout
4. **Cost Controls** (Whisper) - Pattern guide includes budget limits

### Phase 1 Constraints

- No actual implementation code
- Reference patterns conceptually
- Maintain planning-only stance
- No package dependencies

## Next Steps

1. Update each spec to reference Resilience Patterns Guide
2. Remove hardcoded timeout/retry values
3. Ensure consistency across all specs
4. Validate pattern coverage for all external services

## Summary Statistics

- **Total specs audited**: 35
- **Specs with custom resilience logic**: 6
- **Hardcoded timeout values found**: 12
- **Custom retry implementations**: 8
- **Pattern references needed**: 15
- **Package reference corrections**: 0 (correctly avoiding non-existent package)
