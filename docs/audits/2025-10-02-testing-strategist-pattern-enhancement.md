# Testing Strategist Pattern Enhancement

**Date**: 2025-10-02
**Agent**: testing-strategist
**Enhancement**: Pattern → TestKit API → Test Example Workflow

## Overview

Enhanced the testing-strategist agent to leverage the same pattern-driven workflow as the wallaby-tdd-agent, improving test strategy recommendations with concrete, example-based guidance.

## What Changed

### 1. Decision Framework Enhancement

**Added Step 3**: Choose Testing Pattern

```markdown
3. **Choose Testing Pattern** (from `guide-tdd-testing-patterns.md`):
   - Match requirement to appropriate testing pattern
   - Identify exact TestKit API feature to use
   - Reference working test example from foundation
   - Follow Pattern → TestKit API → Test Example workflow
```

This ensures the testing-strategist doesn't just say "test this" but provides:
- **Which pattern** to use (e.g., "Retry Logic Testing")
- **Which TestKit API** to use (e.g., `retry(operation, maxRetries, delayMs)`)
- **Where to find examples** (e.g., `testkit-core-utilities.test.ts:48-110`)

### 2. Output Standards Enhancement

Added explicit pattern selection requirements:

```markdown
- **Testing pattern selection** with references:
  - Pattern name from `guide-tdd-testing-patterns.md`
  - TestKit API feature to use (from `guide-testkit.md`)
  - Working test example location (e.g., `testkit-core-utilities.test.ts:48-110`)
```

### 3. Pattern Selection Quick Reference

Added comprehensive lookup table for instant pattern matching:

| Requirement Type | Testing Pattern | TestKit API | Example Reference |
|-----------------|-----------------|-------------|-------------------|
| File operations with retry | Retry Logic Testing | `retry()` | `testkit-core-utilities.test.ts:48-110` |
| Database transactions | Transaction Testing | `withTransaction()` | `testkit-sqlite-features.test.ts:274-316` |
| API/HTTP mocking | HTTP Mocking | `createMSWServer()` | `testkit-msw-features.test.ts:96-197` |
| ... | ... | ... | ... |

14 patterns total, covering all common testing scenarios.

### 4. Example Strategy Recommendation Format

Added complete template showing how to structure test strategy recommendations:

```markdown
## Testing Strategy for [Feature Name]

### TDD Applicability Decision
**Risk Level**: P0 (Critical - Data Integrity)
**TDD Required**: Yes

### Testing Patterns Required

#### 1. Retry Logic Testing
- **Pattern**: Retry Logic Testing (from guide-tdd-testing-patterns.md)
- **TestKit API**: retry(operation, maxRetries, delayMs)
- **Test Example**: testkit-core-utilities.test.ts:48-110
- **Application**: Retry file read operations when APFS returns "dataless" errors
- **Test Scenarios**: [specific scenarios]

### Implementation References
Copy patterns from: [exact file:line references]
```

## Benefits

### Before Enhancement

Testing-strategist would say:
> "You need to test retry logic for file operations."

**Problem**: Developer doesn't know:
- Which testing pattern to use
- Which TestKit API handles retries
- Where to find working examples

### After Enhancement

Testing-strategist now says:
> "Use Retry Logic Testing pattern with TestKit's `retry()` API.
> Reference: `testkit-core-utilities.test.ts:48-110` for working examples."

**Result**: Developer has:
- ✅ Exact pattern name
- ✅ Specific TestKit API
- ✅ Working code to copy from

## Impact on Workflow

### For Spec Reviews

When reviewing specs, testing-strategist can now provide:

1. **Risk Classification** (P0/P1/P2)
2. **TDD Decision** (Required/Recommended/Optional)
3. **Testing Patterns** with exact references
4. **TestKit APIs** to use
5. **Working Examples** to copy from

### For Coverage Audits

When auditing test coverage, can now identify:
- Which patterns are being used correctly
- Which patterns are missing
- Which tests should reference foundation examples

### For Test Strategy Evolution

Can track:
- Pattern adoption across codebase
- TestKit API usage
- Gap analysis (patterns needed but not yet in guide)

## Integration with Other Agents

### testing-strategist → wallaby-tdd-agent

**Flow**:
1. testing-strategist recommends patterns with TestKit APIs
2. wallaby-tdd-agent implements using same pattern references
3. Both agents reference identical examples from foundation tests

**Consistency**: Same pattern names, same API references, same examples.

### testing-strategist → task-implementer → wallaby-tdd-agent

**Flow**:
1. testing-strategist reviews spec, recommends patterns
2. task-implementer creates tasks with pattern references
3. wallaby-tdd-agent executes TDD using same patterns

**Traceability**: Pattern selection documented from strategy through implementation.

## Documentation References

All pattern references point to:
- **Pattern Guide**: `docs/guides/guide-tdd-testing-patterns.md`
- **API Reference**: `docs/guides/guide-testkit.md`
- **Working Examples**: `packages/foundation/src/__tests__/testkit-*.test.ts`

## Example Usage

### Scenario: Reviewing Voice Capture Spec

**Input**: Spec describes APFS file operations with potential "dataless" errors

**testing-strategist Output**:
```markdown
### Testing Strategy

#### Risk Classification
**Risk Level**: P0 (Data Integrity - file loss on error)
**TDD Required**: Yes

#### Testing Patterns

##### 1. Retry Logic Testing
- **Pattern**: Retry Logic Testing
- **TestKit API**: `retry(operation, maxRetries, delayMs)`
- **Reference**: `testkit-core-utilities.test.ts:48-110`
- **Rationale**: APFS dataless files require resilient retry with exponential backoff

Test Scenarios:
- Success after N retries (verify attempts counter)
- Failure after max retries (verify final error)
- Exponential backoff timing (verify delays increase)

##### 2. File System Testing
- **Pattern**: Temporary File System Testing
- **TestKit API**: `useTempDirectory(callback)`
- **Reference**: `testkit-core-utilities.test.ts:325-347`
- **Rationale**: Isolated file testing with automatic cleanup

Copy implementation from foundation tests, adapt for voice file format.
```

**Result**: Developer knows exactly:
- Why these patterns were chosen (risk level, rationale)
- Which TestKit APIs to use
- Where to find working examples
- What test scenarios to write

## Metrics

### Coverage Improvement

With pattern references, we can now track:
- **Pattern Adoption**: Which patterns are used vs available
- **TestKit Usage**: Which APIs are leveraged correctly
- **Example Linkage**: How many tests reference foundation examples

### Quality Improvement

- **Reduced custom mocks**: Pattern guide shows existing TestKit solutions
- **Consistent testing**: Same patterns used across all features
- **Faster implementation**: Copy-paste from working examples

## Next Steps

### Potential Enhancements

1. **Pattern Coverage Analysis**: Audit which patterns are most/least used
2. **TestKit Gap Analysis**: Identify patterns needed but not yet in TestKit
3. **Example Quality**: Ensure all foundation examples are gold-standard
4. **Pattern Evolution**: Track when new patterns should be added

### Agent Coordination

Consider enhancing:
- **risk-yagni-enforcer**: Reference patterns in risk assessments
- **capture-bridge-planner**: Recommend patterns in PRD/specs
- **task-implementer**: Include pattern references in task context

## Conclusion

The testing-strategist agent now provides concrete, example-based test strategy recommendations using the **Pattern → TestKit API → Test Example** workflow. This creates consistency across the entire TDD pipeline from strategy design through implementation.

Developers no longer need to guess which testing approach to use - they have:
- ✅ Clear pattern names
- ✅ Exact TestKit APIs
- ✅ Working code examples
- ✅ Line-number precision

All recommendations are traceable to verified tests in the foundation package.
