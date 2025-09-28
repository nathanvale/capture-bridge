---
title: P0/P1 Test Specification Remediation Plan
status: active
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: backlog
---

# P0/P1 Test Specification Remediation Plan

## Executive Summary

Following the comprehensive P0-P3 review by the testing strategist swarm, we've identified **17 critical P0 anti-pattern violations** and **significant P1 gaps** that must be remediated before Phase 1 implementation begins.

**Current State:**
- TestKit Compliance: 62/100 🔴 CRITICAL
- Feature Test Coverage: 80/100 ⚠️ Needs improvement
- PRD Traceability: 82/100 ⚠️ Implementation gaps

**Target State:**
- TestKit Compliance: 95/100 ✅
- Feature Test Coverage: 95/100 ✅
- PRD Traceability: 95/100 ✅

**Timeline:** 2 weeks (10 working days)
**Resources:** 4 testing-strategist agents working in parallel

---

## Parallel Work Stream Allocation

### Agent 1: TestKit Compliance & Anti-Pattern Remediation
**Focus:** Remove all custom mock anti-patterns, enforce TestKit standardization
**Duration:** 10 days
**Priority:** P0 - BLOCKING

### Agent 2: CLI Test Specification Enhancement
**Focus:** Complete CLI test coverage for crash safety, error contracts, doctor command
**Duration:** 10 days
**Priority:** P0 - BLOCKING

### Agent 3: Capture & Foundation Test Gaps
**Focus:** Add missing P0 tests for audio validation, sovereignty, package boundaries
**Duration:** 10 days
**Priority:** P0 - BLOCKING

### Agent 4: Performance & Integration Testing
**Focus:** Add performance gates, cross-feature integration, load testing patterns
**Duration:** 10 days
**Priority:** P1 - HIGH

---

## Agent 1: TestKit Compliance & Anti-Pattern Remediation

### Objective
Achieve 95%+ TestKit compliance by removing all 17 anti-pattern violations and enforcing standardized patterns across all test specifications.

### Scope

#### Files to Update:
1. `docs/features/staging-ledger/spec-staging-test.md`
2. `docs/features/capture/spec-capture-test.md`
3. `docs/cross-cutting/spec-direct-export-tech-test.md`
4. `docs/cross-cutting/spec-metrics-contract-tech-test.md`

#### Anti-Patterns to Remove:

**Type 1: Custom Database Mocks (8 instances)**
- Location: `staging-ledger/spec-staging-test.md:450-520`
- Location: `capture/spec-capture-test.md:1040-1093`
- **Replace with:** `createMemoryUrl()` + real SQLite

**Type 2: Custom Filesystem Mocks (5 instances)**
- Location: `direct-export-tech-test.md:340-380`
- Location: `capture/spec-capture-test.md:1710-1750`
- **Replace with:** `createTempDirectory()` + real fs

**Type 3: Custom HTTP Mocks (4 instances)**
- Location: `capture/spec-capture-test.md:1900-1966`
- **Replace with:** `setupMSW([...])` with proper handlers

### Deliverables

1. **Updated Test Specifications (4 files)**
   - All `vi.spyOn()` replaced with TestKit patterns
   - All `vi.mock()` replaced with MSW handlers
   - All `.mockRestore()` removed (automatic cleanup)
   - TestKit standardization warnings added to all specs

2. **Before/After Documentation**
   - Create `docs/backlog/testkit-migration-completed.md`
   - Document each anti-pattern → TestKit pattern conversion
   - Include code examples showing improvements

3. **Validation Report**
   - Compliance score before/after
   - List of all changes made
   - Verification that no anti-patterns remain

### Success Criteria

- ✅ Zero instances of `vi.spyOn(fs.promises, ...)`
- ✅ Zero instances of `vi.mock('...')`
- ✅ Zero custom mock factory functions
- ✅ All specs reference TestKit Standardization Guide
- ✅ TestKit compliance score: 95%+

### Dependencies

- Read: `docs/guides/guide-testkit-standardization.md`
- Read: `docs/guides/guide-testkit-usage.md`
- Read: `docs/backlog/testkit-migration-tasks.md`

---

## Agent 2: CLI Test Specification Enhancement

### Objective
Complete P0/P1 CLI test coverage for crash safety, error contracts, and doctor command workflows.

### Scope

#### File to Update:
- `docs/features/cli/spec-cli-test.md`

#### P0 Gaps to Address:

**1. CLI Crash Safety Tests (MISSING - CRITICAL)**
Add comprehensive crash/signal handling tests:

```typescript
describe('CLI Crash Safety (P0)', () => {
  test('handles SIGINT during voice capture processing', async () => {
    // Test graceful shutdown
    // Verify temp file cleanup
    // Verify staging ledger consistency
  })

  test('handles SIGTERM during export operations', async () => {
    // Test atomic write completion or rollback
    // Verify no partial files in vault
    // Verify audit trail integrity
  })

  test('handles SIGKILL recovery on restart', async () => {
    // Test queryRecoverable flow
    // Verify pending operations resume
  })

  test('handles process crash during long-running transcription', async () => {
    // Test placeholder export on crash
    // Verify error context preserved
  })
})
```

**2. Error Registry Parity Tests (INCOMPLETE)**
Location: `spec-cli-test.md:88-95`

```typescript
describe('Error Registry Contract Compliance (P0)', () => {
  test('enforces registry-docs parity', async () => {
    const registryCodes = Object.keys(ERROR_REGISTRY)
    const docsCodes = extractErrorCodesFromDocs()
    expect(registryCodes.sort()).toEqual(docsCodes.sort())
  })

  test('all error codes have CLI exit code mappings', async () => {
    // Verify ADR-0018 compliance
  })

  test('error messages match format contract', async () => {
    // Verify JSON error output schema
  })
})
```

**3. Doctor Command Tests (MISSING - CRITICAL)**
Location: New section needed after line 529

```typescript
describe('Doctor Command Workflows (P0)', () => {
  test('detects missing vault directory', async () => {
    // Test health check failure
    // Verify actionable error message
    // Test doctor --fix creates directory
  })

  test('detects corrupted staging ledger', async () => {
    // Test database integrity check
    // Verify recovery recommendations
    // Test doctor --recover flow
  })

  test('validates iCloud sync status', async () => {
    // Test voice memo accessibility
    // Verify CloudKit connectivity
  })

  test('checks whisper API availability', async () => {
    // Test transcription service health
    // Verify API key validity
  })
})
```

#### P1 Gaps to Address:

**4. CLI Performance Testing**
Add performance regression gates:

```typescript
describe('CLI Performance Gates (P1)', () => {
  test('adhd capture --voice completes in < 3s', async () => {
    // P95 latency gate
  })

  test('adhd list returns in < 500ms', async () => {
    // Query performance gate
  })

  test('adhd export --all completes in < 10s for 100 captures', async () => {
    // Batch export performance
  })
})
```

### Deliverables

1. **Updated CLI Test Spec**
   - Add 4 new test sections (crash safety, registry parity, doctor, performance)
   - Approximately 25-30 new test cases
   - Full TestKit integration

2. **CLI Test Harness Requirements**
   - Document signal handling test patterns
   - Document process lifecycle testing approach
   - Document doctor command test fixtures

3. **Validation Report**
   - P0 coverage score before/after
   - List of all new test scenarios
   - CLI-specific TestKit patterns used

### Success Criteria

- ✅ All 4 crash scenarios tested (SIGINT, SIGTERM, SIGKILL, crash)
- ✅ Error registry parity enforced
- ✅ Doctor command fully tested (4+ health checks)
- ✅ Performance gates defined for all commands
- ✅ CLI P0 score: 90%+

### Dependencies

- Read: `docs/adr/0017-json-output-contract-stability.md`
- Read: `docs/adr/0018-cli-exit-code-registry.md`
- Read: `docs/features/cli/prd-cli.md`

---

## Agent 3: Capture & Foundation Test Gaps

### Objective
Complete P0 test coverage for capture audio validation, voice file sovereignty, and foundation package boundaries.

### Scope

#### Files to Update:
1. `docs/features/capture/spec-capture-test.md`
2. `docs/cross-cutting/spec-foundation-monorepo-test.md`

#### P0 Gaps to Address:

**1. Voice File Sovereignty Tests (MISSING - CRITICAL)**
Location: `capture/spec-capture-test.md` - new section after line 337

```typescript
describe('Voice File Sovereignty (P0) - ADR-0001 Compliance', () => {
  test('validates file is in iCloud managed location', async () => {
    // Test ~/Library/Application Support/com.apple.voicememos/
    // Reject files outside iCloud control
  })

  test('rejects copied/moved voice files', async () => {
    // Test file metadata indicates original location
    // Verify no file copy operations
  })

  test('preserves original file path in staging ledger', async () => {
    // Test file_path points to iCloud location
    // Verify no local copies stored
  })

  test('validates file ownership before processing', async () => {
    // Test user has read permissions
    // Test file is not locked by another process
  })

  test('handles iCloud pending download status', async () => {
    // Test detection of cloud-only files
    // Verify graceful handling of download failures
  })
})
```

**2. Audio File Validation Tests (MISSING - CRITICAL)**
Location: `capture/spec-capture-test.md` - new section after sovereignty tests

```typescript
describe('Audio File Validation (P0)', () => {
  test('validates M4A format and codec', async () => {
    // Test file header validation
    // Reject non-M4A files
    // Validate AAC codec
  })

  test('validates audio duration bounds', async () => {
    // Test minimum duration (> 1 second)
    // Test maximum duration (< 10 minutes for MPPP)
    // Reject silent/empty audio
  })

  test('validates file integrity', async () => {
    // Test file is not corrupted
    // Test audio stream is readable
    // Generate audio fingerprint for deduplication
  })

  test('validates file size bounds', async () => {
    // Test minimum size (> 10KB)
    // Test maximum size (< 100MB for MPPP)
    // Prevent disk exhaustion attacks
  })

  test('handles corrupted audio gracefully', async () => {
    // Test error classification
    // Test DLQ routing
    // Verify user notification
  })
})
```

**3. Foundation Package Boundary Tests (MISSING - CRITICAL)**
Location: `spec-foundation-monorepo-test.md:200-250` (enhance existing section)

```typescript
describe('Package Boundary Enforcement (P0)', () => {
  test('prevents circular dependencies', async () => {
    // Test dependency graph analysis
    // Fail on any circular imports
    // Provide clear error messages
  })

  test('enforces public API exports', async () => {
    // Test only index.ts exports are importable
    // Reject internal module imports
    // Validate barrel export patterns
  })

  test('validates import boundaries', async () => {
    // Test feature packages cannot import from each other
    // Test only @adhd-brain/foundation allowed as shared dependency
    // Test testkit only imported in test files
  })

  test('prevents dependency drift', async () => {
    // Test all packages use same versions
    // Validate pnpm workspace constraints
    // Reject divergent dependency versions
  })

  test('validates package.json exports field', async () => {
    // Test proper export maps defined
    // Test TypeScript resolution works
    // Test runtime resolution matches TypeScript
  })
})
```

#### P1 Gaps to Address:

**4. iCloud Integration Tests**
Location: `capture/spec-capture-test.md` - enhance existing section

```typescript
describe('iCloud Integration (P1)', () => {
  test('handles iCloud sync paused', async () => {
    // Test detection of sync pause state
    // Verify graceful degradation
  })

  test('handles iCloud quota exceeded', async () => {
    // Test error classification
    // Provide actionable user guidance
  })

  test('validates voice memo metadata', async () => {
    // Test creation date extraction
    // Test duration metadata accuracy
  })
})
```

### Deliverables

1. **Updated Capture Test Spec**
   - Add 2 new P0 sections (sovereignty, audio validation)
   - Approximately 15-20 new test cases
   - Full ADR-0001 compliance coverage

2. **Updated Foundation Test Spec**
   - Enhance package boundary section
   - Add 5-7 new boundary enforcement tests
   - Document dependency graph validation approach

3. **Test Fixtures**
   - Create golden audio file fixtures
   - Create corrupted audio file fixtures
   - Create boundary violation examples

4. **Validation Report**
   - P0 coverage scores before/after
   - Sovereignty validation patterns
   - Package boundary enforcement patterns

### Success Criteria

- ✅ All 5 sovereignty scenarios tested
- ✅ All 5 audio validation scenarios tested
- ✅ All 5 package boundary scenarios tested
- ✅ iCloud integration tests added
- ✅ Capture P0 score: 90%+
- ✅ Foundation P0 score: 95%+

### Dependencies

- Read: `docs/adr/0001-voice-file-sovereignty.md`
- Read: `docs/features/capture/prd-capture.md`
- Read: `docs/cross-cutting/prd-foundation-monorepo.md`

---

## Agent 4: Performance & Integration Testing

### Objective
Add P1 performance regression gates and enhance cross-feature integration testing across all specifications.

### Scope

#### Files to Update:
1. `docs/features/staging-ledger/spec-staging-test.md`
2. `docs/features/obsidian-bridge/spec-obsidian-test.md`
3. `docs/features/capture/spec-capture-test.md`
4. `docs/features/cli/spec-cli-test.md`

#### P1 Tasks:

**1. Performance Regression Gates (Promote from P2 to P1)**

Add to each spec:

```typescript
describe('Performance Regression Detection (P1)', () => {
  test('detects p95 latency regression', async () => {
    // Baseline: capture insert < 10ms p95
    // Gate: fail if p95 > 15ms (50% regression threshold)
    const latencies = await benchmarkOperation(1000)
    const p95 = percentile(latencies, 95)
    expect(p95).toBeLessThan(15)
  })

  test('detects throughput regression', async () => {
    // Baseline: 100 captures/second
    // Gate: fail if < 75 captures/second (25% regression)
    const throughput = await benchmarkThroughput(10_000)
    expect(throughput).toBeGreaterThan(75)
  })

  test('detects memory leak', async () => {
    // Run 10,000 operations
    // Verify heap growth < 10MB
    const heapBefore = process.memoryUsage().heapUsed
    await runOperations(10_000)
    const heapAfter = process.memoryUsage().heapUsed
    expect(heapAfter - heapBefore).toBeLessThan(10 * 1024 * 1024)
  })
})
```

**Targets:**
- Staging Ledger: capture insert, query, export
- Obsidian Bridge: atomic write, collision detection
- Capture: voice poll, transcription, email poll
- CLI: all command execution times

**2. Cross-Feature Integration Enhancement**

Enhance existing cross-feature sections with:

```typescript
describe('Full Pipeline Integration with Failure Injection (P1)', () => {
  test('handles capture failure during multi-stage pipeline', async () => {
    // Start: voice capture
    // Inject: network timeout during iCloud download
    // Verify: staging ledger shows failed status
    // Verify: export does not proceed
    // Verify: retry coordinator notified (Phase 2)
  })

  test('handles staging ledger failure during export', async () => {
    // Start: successful capture
    // Inject: database lock during export read
    // Verify: export retries with backoff
    // Verify: audit trail shows attempt
  })

  test('handles vault write failure during export', async () => {
    // Start: successful capture + staging
    // Inject: ENOSPC during atomic write
    // Verify: no partial file in vault
    // Verify: staging ledger status unchanged
    // Verify: error logged for doctor command
  })

  test('handles concurrent operations across features', async () => {
    // Concurrent: voice capture + email capture + export
    // Verify: no database lock contention
    // Verify: all operations complete successfully
    // Verify: audit trail is consistent
  })
})
```

**3. Load Testing Patterns**

Add load testing section to each spec:

```typescript
describe('Load Testing (P1)', () => {
  test('handles sustained load', async () => {
    // 1000 captures over 10 minutes
    // Verify no performance degradation
    // Verify no resource leaks
  })

  test('handles burst load', async () => {
    // 100 captures in 10 seconds
    // Verify queueing behavior
    // Verify no data loss
  })

  test('handles resource exhaustion gracefully', async () => {
    // Approach disk space limit
    // Verify graceful degradation
    // Verify clear error messages
  })
})
```

**4. Test Execution Infrastructure**

Document CI/CD integration requirements:

```markdown
## Test Execution Requirements

### Performance Test Infrastructure

**Environment:**
- Dedicated CI runner (not shared)
- Consistent hardware specs
- No other processes running
- Fixed clock frequency

**Baselines:**
- Capture insert: 10ms p95 (±2ms variance)
- Atomic write: 50ms p95 (±5ms variance)
- Query operations: 5ms p95 (±1ms variance)

**Regression Detection:**
- 50% slowdown = immediate failure
- 25% slowdown = warning
- Tracked per-commit in metrics database

**Load Test Configuration:**
- Sustained: 1000 ops over 10min
- Burst: 100 ops in 10sec
- Resource limits: 512MB memory, 1GB disk
```

### Deliverables

1. **Updated All 4 Feature Test Specs**
   - Add performance regression gates to each
   - Add enhanced cross-feature integration tests
   - Add load testing patterns
   - Approximately 10-15 new tests per spec

2. **Performance Baseline Documentation**
   - Document baseline metrics for all operations
   - Document regression thresholds
   - Document measurement methodology

3. **CI/CD Integration Guide**
   - Document performance test infrastructure requirements
   - Document load test execution patterns
   - Document metrics collection approach

4. **Validation Report**
   - P1 coverage scores before/after
   - Performance test coverage matrix
   - Integration test coverage matrix

### Success Criteria

- ✅ Performance gates added to all 4 feature specs
- ✅ Cross-feature integration enhanced in all specs
- ✅ Load testing patterns documented
- ✅ CI/CD integration requirements defined
- ✅ All feature P1 scores: 90%+

### Dependencies

- Read: `docs/guides/guide-phase1-testing-patterns.md`
- Read: `docs/cross-cutting/spec-metrics-contract-tech.md`
- Read: All feature test specs for baseline understanding

---

## Coordination & Dependencies

### Inter-Agent Dependencies

**None - All work streams are independent**

Each agent works on distinct files with no overlap:
- Agent 1: staging-ledger, capture, direct-export, metrics (anti-patterns only)
- Agent 2: CLI spec only
- Agent 3: capture (new sections), foundation spec
- Agent 4: All specs (performance sections only)

### Shared Resources

**Read-Only (No Conflicts):**
- All agents read guides and ADRs
- All agents read PRDs for context
- All agents read existing test specs

**Write (No Conflicts):**
- Each agent writes to distinct spec sections
- Agent 3 creates new test fixtures
- Agent 4 creates new CI/CD guide

### Communication Protocol

**Daily Sync (Not Required, But Recommended):**
- Each agent reports progress score (0-100%)
- Each agent identifies any blockers
- Each agent shares any insights for other agents

**Completion Criteria:**
- Each agent delivers all specified artifacts
- Each agent runs validation against success criteria
- Each agent produces final report

---

## Timeline & Milestones

### Week 1 (Days 1-5)

**Day 1-2: Setup & Initial Analysis**
- All agents: Read all dependencies
- All agents: Create work breakdown structure
- All agents: Set up validation framework

**Day 3-4: Core Implementation**
- Agent 1: Remove first 10 anti-patterns
- Agent 2: Add CLI crash safety tests
- Agent 3: Add voice sovereignty tests
- Agent 4: Add performance gates to 2 specs

**Day 5: Mid-Sprint Review**
- All agents: Report 50% completion
- All agents: Share any insights
- Identify any blockers

### Week 2 (Days 6-10)

**Day 6-8: Complete Implementation**
- Agent 1: Remove remaining 7 anti-patterns
- Agent 2: Add doctor command + error registry tests
- Agent 3: Add audio validation + package boundary tests
- Agent 4: Complete performance gates + integration tests

**Day 9: Final Validation**
- All agents: Run validation against success criteria
- All agents: Verify no anti-patterns remain
- All agents: Check coverage scores

**Day 10: Documentation & Handoff**
- All agents: Produce final reports
- All agents: Document patterns and insights
- Consolidated review by lead

---

## Success Metrics

### Target Scores (End of Week 2)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| TestKit Compliance | 62/100 | 95/100 | Agent 1 |
| Capture P0 Coverage | 75/100 | 90/100 | Agent 3 |
| CLI P0 Coverage | 70/100 | 90/100 | Agent 2 |
| Staging Ledger P0 | 95/100 | 95/100 | ✅ Maintain |
| Obsidian Bridge P0 | 90/100 | 95/100 | Agent 1 |
| Foundation P0 | 88/100 | 95/100 | Agent 3 |
| All Features P1 | 60-85/100 | 90/100 | Agent 4 |
| PRD Traceability | 82/100 | 95/100 | All Agents |

### Anti-Pattern Elimination

- **Current:** 17 violations
- **Target:** 0 violations
- **Owner:** Agent 1

### Test Gap Closure

- **Current:** 8 critical P0 gaps
- **Target:** 0 critical P0 gaps
- **Owners:** Agents 2, 3

### Performance Coverage

- **Current:** No performance gates
- **Target:** All specs have regression gates
- **Owner:** Agent 4

---

## Risk Mitigation

### Risk 1: Anti-Pattern Removal Breaks Existing Tests
**Likelihood:** Medium
**Impact:** High
**Mitigation:** Agent 1 validates each change preserves test intent

### Risk 2: New Tests Conflict with YAGNI Boundaries
**Likelihood:** Low
**Impact:** Medium
**Mitigation:** All agents reference Master PRD v2.3.0-MPPP for scope

### Risk 3: Performance Gates Too Strict/Loose
**Likelihood:** Medium
**Impact:** Medium
**Mitigation:** Agent 4 validates against real baseline measurements

### Risk 4: Timeline Slippage
**Likelihood:** Low
**Impact:** Medium
**Mitigation:** Daily progress tracking, early identification of blockers

---

## Post-Remediation Validation

### Automated Checks

```bash
# Run by lead after all agents complete

# 1. TestKit Compliance Check
pnpm run audit:testkit-compliance
# Expected: 95%+ compliance, 0 anti-patterns

# 2. Test Coverage Check
pnpm run test:coverage
# Expected: All features 90%+ P0/P1 coverage

# 3. Anti-Pattern Scanner
pnpm run scan:anti-patterns
# Expected: 0 violations

# 4. Link Validation
pnpm run validate:docs-links
# Expected: All cross-references valid

# 5. Traceability Matrix
pnpm run validate:traceability
# Expected: 95%+ PRD → Test mapping
```

### Manual Review Checklist

- [ ] All 4 agent reports received
- [ ] All success criteria met
- [ ] No new anti-patterns introduced
- [ ] All cross-references valid
- [ ] No scope creep beyond MPPP
- [ ] TestKit patterns consistent
- [ ] Performance baselines documented
- [ ] CI/CD integration requirements clear

---

## Approval & Sign-Off

**Completion Criteria:**
- ✅ All 4 agents deliver final reports
- ✅ All automated checks pass
- ✅ Manual review checklist completed
- ✅ TestKit compliance ≥ 95%
- ✅ All features P0 coverage ≥ 90%
- ✅ All features P1 coverage ≥ 90%
- ✅ Zero anti-pattern violations
- ✅ Zero critical test gaps

**Sign-Off Required:**
- Testing Strategy Lead
- Development Lead
- Product Owner (for scope validation)

**Next Steps After Approval:**
- Archive this remediation plan
- Update Master PRD with completion status
- Unblock Phase 1 implementation
- Begin TDD-driven feature development

---

## Appendix A: Agent Prompts

### Agent 1 Prompt Template
```
You are a testing-strategist agent assigned to remediate TestKit compliance issues.

**Your Mission:**
Remove all 17 anti-pattern violations from test specifications and achieve 95%+ TestKit compliance.

**Files to Update:**
- docs/features/staging-ledger/spec-staging-test.md
- docs/features/capture/spec-capture-test.md
- docs/cross-cutting/spec-direct-export-tech-test.md
- docs/cross-cutting/spec-metrics-contract-tech-test.md

**Anti-Patterns to Remove:**
1. All vi.spyOn() calls → TestKit patterns
2. All vi.mock() calls → MSW handlers
3. All .mockRestore() calls → automatic cleanup
4. All custom mock factories → TestKit utilities

**Success Criteria:**
- Zero anti-patterns remain
- TestKit compliance: 95%+
- All specs reference TestKit Standardization Guide
- Before/after documentation produced

**Read First:**
- docs/guides/guide-testkit-standardization.md
- docs/backlog/testkit-migration-tasks.md

Execute systematically, validate each change, produce final report.
```

### Agent 2 Prompt Template
```
You are a testing-strategist agent assigned to complete CLI test specification.

**Your Mission:**
Add missing P0 CLI tests for crash safety, error registry parity, and doctor command.

**File to Update:**
- docs/features/cli/spec-cli-test.md

**Critical Gaps to Fill:**
1. CLI crash safety (SIGINT, SIGTERM, SIGKILL, crash recovery)
2. Error registry parity enforcement
3. Doctor command workflows (4+ health checks)
4. CLI performance gates (P1)

**Success Criteria:**
- All 4 crash scenarios tested
- Error registry parity enforced
- Doctor command fully covered
- CLI P0 score: 90%+

**Read First:**
- docs/adr/0017-json-output-contract-stability.md
- docs/adr/0018-cli-exit-code-registry.md
- docs/features/cli/prd-cli.md

Add approximately 25-30 new test cases, produce final report.
```

### Agent 3 Prompt Template
```
You are a testing-strategist agent assigned to complete capture and foundation test gaps.

**Your Mission:**
Add missing P0 tests for voice sovereignty, audio validation, and package boundaries.

**Files to Update:**
- docs/features/capture/spec-capture-test.md
- docs/cross-cutting/spec-foundation-monorepo-test.md

**Critical Gaps to Fill:**
1. Voice file sovereignty (ADR-0001 compliance)
2. Audio file validation (format, duration, integrity)
3. Package boundary enforcement
4. iCloud integration tests (P1)

**Success Criteria:**
- All sovereignty scenarios tested (5+)
- All audio validation scenarios tested (5+)
- All boundary scenarios tested (5+)
- Capture P0: 90%+, Foundation P0: 95%+

**Read First:**
- docs/adr/0001-voice-file-sovereignty.md
- docs/features/capture/prd-capture.md
- docs/cross-cutting/prd-foundation-monorepo.md

Add approximately 20-25 new test cases, produce final report.
```

### Agent 4 Prompt Template
```
You are a testing-strategist agent assigned to add performance and integration testing.

**Your Mission:**
Add P1 performance regression gates and enhance cross-feature integration across all specs.

**Files to Update:**
- docs/features/staging-ledger/spec-staging-test.md
- docs/features/obsidian-bridge/spec-obsidian-test.md
- docs/features/capture/spec-capture-test.md
- docs/features/cli/spec-cli-test.md

**Tasks:**
1. Add performance regression gates to all 4 specs
2. Enhance cross-feature integration tests
3. Add load testing patterns
4. Document CI/CD integration requirements

**Success Criteria:**
- Performance gates in all specs
- Cross-feature integration enhanced
- Load testing documented
- All P1 scores: 90%+

**Read First:**
- docs/guides/guide-phase1-testing-patterns.md
- docs/cross-cutting/spec-metrics-contract-tech.md
- All feature test specs

Add approximately 40-50 new test cases across 4 specs, produce final report.
```

---

## Appendix B: Validation Scripts

Scripts to validate remediation completion:

### testkit-compliance-check.sh
```bash
#!/bin/bash
# Check for anti-patterns in test specs

echo "Scanning for anti-patterns..."

# Check for vi.spyOn
spyOn=$(grep -r "vi\.spyOn" docs/features docs/cross-cutting | wc -l)
echo "vi.spyOn instances: $spyOn (target: 0)"

# Check for vi.mock
viMock=$(grep -r "vi\.mock" docs/features docs/cross-cutting | wc -l)
echo "vi.mock instances: $viMock (target: 0)"

# Check for mockRestore
mockRestore=$(grep -r "mockRestore" docs/features docs/cross-cutting | wc -l)
echo "mockRestore instances: $mockRestore (target: 0)"

# Check for TestKit standardization warnings
warnings=$(grep -r "TestKit Standardization" docs/features docs/cross-cutting | wc -l)
echo "TestKit warnings: $warnings (target: 7+)"

# Calculate compliance score
total_issues=$((spyOn + viMock + mockRestore))
if [ $total_issues -eq 0 ] && [ $warnings -ge 7 ]; then
  echo "✅ TestKit compliance: PASS"
  exit 0
else
  echo "❌ TestKit compliance: FAIL"
  exit 1
fi
```

### test-gap-check.sh
```bash
#!/bin/bash
# Check for critical test gaps

echo "Checking for critical test gaps..."

# CLI crash safety
cli_crash=$(grep -c "CLI Crash Safety" docs/features/cli/spec-cli-test.md)
echo "CLI crash tests: $cli_crash (target: 1+)"

# Voice sovereignty
sovereignty=$(grep -c "Voice File Sovereignty" docs/features/capture/spec-capture-test.md)
echo "Sovereignty tests: $sovereignty (target: 1+)"

# Audio validation
audio=$(grep -c "Audio File Validation" docs/features/capture/spec-capture-test.md)
echo "Audio validation tests: $audio (target: 1+)"

# Package boundaries
boundaries=$(grep -c "Package Boundary Enforcement" docs/cross-cutting/spec-foundation-monorepo-test.md)
echo "Boundary tests: $boundaries (target: 1+)"

# Doctor command
doctor=$(grep -c "Doctor Command" docs/features/cli/spec-cli-test.md)
echo "Doctor tests: $doctor (target: 1+)"

# Calculate gap closure
gaps_remaining=$((5 - cli_crash - sovereignty - audio - boundaries - doctor))
if [ $gaps_remaining -eq 0 ]; then
  echo "✅ Test gaps: CLOSED"
  exit 0
else
  echo "❌ Test gaps remaining: $gaps_remaining"
  exit 1
fi
```

---

**END OF REMEDIATION PLAN**