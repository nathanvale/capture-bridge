---
title: TDD Applicability Guide
status: living
owner: Nathan
version: 1.1.0
date: 2025-09-28
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# TDD Applicability Guide

## Purpose

This guide defines **when Test-Driven Development (TDD) is required, optional, or skipped** across the ADHD Brain monorepo. The goal is **risk-based discipline**: apply TDD only where data integrity, concurrency, storage, or contracts matter. We explicitly avoid TDD in low-risk UI or spike scenarios (YAGNI guardrail).

**Target Audience:** All developers working on ADHD Brain features and infrastructure.

This guide supports the **MPPP scope** (voice + email capture with direct-to-inbox export) and aligns with [Master PRD v2.3.0-MPPP](../master/prd-master.md) and [Roadmap v2.0.0-MPPP](../master/roadmap.md).

*Nerdy aside: Think of TDD like coffee—absolutely required for mornings with production code, optional for lazy Sunday UI tweaks, and skipped entirely when you're just taste-testing a new bean.*

## When to Use This Guide

Use this guide when:
- Writing technical specifications and making TDD applicability decisions
- Planning feature development and test strategy
- Reviewing PRs to assess test coverage appropriateness
- Resolving team disagreements about testing approach
- Evaluating whether to add tests to existing code

This guide applies to all features and cross-cutting infrastructure across the ADHD Brain monorepo.

## Prerequisites

**Required Knowledge:**
- Understanding of unit, integration, and contract testing concepts
- Familiarity with the ADHD Brain architecture ([Master PRD](../master/prd-master.md))
- Basic risk assessment skills

**Required Reading:**
- [TestKit Usage Guide](./guide-testkit-usage.md) - for implementation patterns
- [TestKit Technical Specification](../cross-cutting/../guides/guide-testkit-usage.md) - for tooling details

## Quick Reference

**TL;DR Decision Tree:**

```
Is this code handling data persistence, security, or critical business logic?
├─ YES → TDD Required (High Risk)
├─ NO → Does failure cause performance issues or require recovery?
   ├─ YES → TDD Strongly Recommended (Medium Risk)
   └─ NO → Is this a UI polish, spike, or prototype?
      ├─ YES → Skip TDD (Low Risk)
      └─ NO → TDD Optional (Low Risk)
```

**Key Rules:**
- 🧠 Core cognition, 🔁 concurrency, 💾 storage, 🔐 security → **TDD Required**
- 🖥️ UI flows, 🧩 thin adapters → **TDD Optional**
- 🧪 Spikes, 🗒️ one-off scripts, 🛠️ throwaway experiments → **Skip TDD**

## Risk Classification Criteria

### High Risk (TDD Required)

**Definition:** Failures could cause data loss, security breach, financial impact, or compliance failure.

**Characteristics:**
- Data corruption or loss possible
- Security/privacy boundaries
- Financial calculations or transactions
- Regulatory compliance requirements
- Core business logic that cannot fail

**Examples:**
- Database migrations
- Authentication/authorization
- Data deduplication
- Backup/restore operations

### Medium Risk (TDD Strongly Recommended)

**Definition:** Failures cause performance degradation, user frustration, or require recovery procedures.

**Characteristics:**
- Performance-critical paths
- Complex algorithmic logic
- External service integrations
- User-facing workflows with state

**Examples:**
- Search ranking algorithms
- API response transformations
- Caching strategies
- Retry/backoff logic

### Low Risk (TDD Optional)

**Definition:** Failures cause visual glitches, non-critical UX issues, or are easily reversible.

**Characteristics:**
- UI polish and animations
- Convenience features
- Display formatting
- Non-critical preferences

**Examples:**
- Theme switching
- Tooltip positioning
- Loading spinners
- Layout adjustments

## Decision Rules (Baseline)

- **REQUIRED (TDD-first)** when code is:
  - 🧠 Core cognition: parsing, extraction, due-date detection, rules engines
  - 🔁 Concurrency/async: schedulers, offline sync, background jobs
  - 💾 Storage/migrations: SQLite schema, dedupe, transactional ingest
  - 🔐 Security/PII: redaction, export/import, encryption gates
  - 🤖 AI adapters: deterministic mocks for Ollama/Chroma

- **OPTIONAL** when code is:
  - 🖥️ UI flows with stable behavior but evolving visuals
  - 🧩 Glue code/adapters with thin wiring logic

- **SKIP TDD** when code is:
  - 🧪 Spikes or unstable UX prototypes
  - 🗒️ One-off analysis scripts
  - 🛠️ Experiments meant to be thrown away

> **Rule of thumb:** If failure breaks **data integrity, time, money, or trust**, do TDD-first.

## Step-by-Step Instructions

### Step 1: Assess Risk Level

1. Review the component or feature you're building
2. Identify potential failure modes:
   - What happens if this code fails?
   - Can it cause data loss or corruption?
   - Does it handle security or privacy?
   - Is it a critical business flow?
3. Classify using the [Risk Classification Criteria](#risk-classification-criteria)
4. Document your assessment in the technical specification

### Step 2: Apply Decision Rules

1. Match your component against the [Decision Rules](#decision-rules-baseline)
2. If the component spans multiple risk levels, apply TDD to the highest-risk parts
3. Document the boundary between TDD and non-TDD components
4. When in doubt, default to higher risk classification

### Step 3: Define Test Scope

Using the [Test Strategy Matrix](#test-strategy-matrix), determine:
1. What unit tests are needed (pure logic, transforms, parsers)
2. What integration tests are needed (DB, API, file system boundaries)
3. What contract tests are needed (mocked external dependencies)
4. What can be deferred (E2E, visual, performance tests)

### Step 4: Document in Spec

Add the required TDD Applicability section to your technical specification:

```markdown
### TDD Applicability Decision
- Risk class: {High/Med/Low}
- Decision: {Required | Optional | Skip}
- Why: {tie to risk}
- Scope under TDD:
  - Unit: {list}
  - Integration: {list}
  - Contract: {list}
- Out-of-scope now (YAGNI): {list}
- Trigger to revisit: {condition}
```

### Step 5: Implement Tests

1. Follow TDD red-green-refactor cycle for required components
2. Use [TestKit](./guide-testkit-usage.md) patterns and utilities
3. Focus on behavior, not implementation details
4. Keep tests fast and deterministic

## Module Guidance (Project-Specific)

### Capture Ingestion
- **TDD Required:** parsers, dedupe, timestamp/locale handling
- **Optional:** UI toasts, optimistic state

### Reminders & Scheduling
- **TDD Required:** recurrence, time zone math, missed-trigger recovery
- **Optional:** notification chrome

### Search (keyword)
- **TDD Required:** indexing, BM25 fallbacks, result ranking
- **Optional:** UI search box

### RAG (future phase-in)
- **TDD Required:** EmbeddingProvider, VectorIndex, retrieval scoring
- **Optional:** prompt text tuning

### Privacy & Export/Import
- **TDD Required:** redaction, checksums, backward import compatibility

## Test Strategy Matrix

| Layer                 | Goal                                  | TDD Policy       | Tooling                     |
|-----------------------|---------------------------------------|------------------|-----------------------------|
| Unit (pure logic)     | Deterministic transforms/parse/rules  | Required         | Vitest                      |
| Integration (RR7+DB)  | Loader/action + SQLite contract       | Required for core| Vitest + MemoryRouter + DB  |
| Contract (adapters)   | Mock-first AI/DB boundaries           | Required         | Vitest + mocks              |
| E2E-lite (smoke)      | Happy-path vertical slice             | Optional early   | Playwright (later)          |
| Visual/UI             | Render correctness, flows             | Optional         | RTL for critical screens    |

## Common Patterns

### Pattern 1: High-Risk Storage Code

**Always use TDD for:**
- Database schema migrations
- Transaction logic
- Backup/restore operations
- Data deduplication

**Example approach:**
1. Write failing test for migration
2. Implement migration
3. Verify data integrity
4. Test rollback scenario

### Pattern 2: Medium-Risk Integration Code

**Strongly recommend TDD for:**
- External API calls with retry logic
- Caching strategies
- Complex data transformations

**Example approach:**
1. Mock external dependency
2. Write contract test
3. Implement with error handling
4. Test edge cases

### Pattern 3: Low-Risk UI Code

**Optional TDD for:**
- Stable UI flows with complex state
- Form validation logic
- Display calculations

**Skip TDD for:**
- Visual polish and animations
- Prototype UIs
- One-off experiments

### Anti-Patterns to Avoid

**Common Mistakes:**
1. **Testing everything:** Wastes time, creates maintenance burden
2. **Testing nothing:** Accumulates risk, slows development
3. **Testing implementation:** Tests break with every refactor
4. **Ignoring flaky tests:** Erodes confidence in test suite
5. **Skipping TDD for "simple" storage code:** Data integrity is never simple

**Red Flags:**
- Test suite takes > 5 minutes locally
- Tests require specific execution order
- Tests pass locally but fail in CI
- Mocking internal implementation details
- 100% coverage as a goal (focus on risk coverage instead)

## Troubleshooting

### Problem: Team disagrees on risk classification

**Solution:**
1. Default to higher risk classification
2. Consult architecture team for tie-breaking
3. Document decision rationale in spec
4. Review in next retrospective

### Problem: Need to skip TDD for high-risk code due to constraints

**Solution:**
1. Document specific constraints (timeline, technical blocker)
2. Propose mitigation strategy (extra QA, monitoring)
3. Get architecture team approval
4. Set explicit date to revisit
5. Track technical debt item

### Problem: Production incident requires immediate fix

**Solution:**
1. Fix-first approach acceptable
2. Add tests immediately after stabilization
3. Document in incident report
4. Schedule follow-up to add proper TDD

### Problem: Existing code has no tests, frequent bugs

**Solution:**
- Prioritize based on defect density, change frequency, and risk level
- Focus on code that breaks often or changes frequently
- Add tests when modifying existing code
- Don't mandate 100% retroactive coverage

## Examples

### Example 1: Voice Capture Feature

**Risk:** HIGH (data loss if audio parsing fails)

**TDD Required:**
- Audio parser
- Timestamp extraction
- Deduplication logic
- Storage operations

**TDD Optional:**
- Playback UI controls
- Waveform display

**TDD Skip:**
- Waveform visualization prototype
- UI animations

**Implementation:**
See [Voice Capture Technical Spec](../features/capture/spec-capture-voice-tech.md) for full test plan.

### Example 2: SQLite Staging Ledger

**Risk:** HIGH (data integrity critical)

**TDD Required:**
- Transaction logic
- Migration scripts
- Backup/restore operations
- Content hash deduplication

**TDD Optional:**
- Admin UI for viewing logs

**TDD Skip:**
- Performance monitoring dashboard prototype

**Implementation:**
See [Staging Ledger Technical Spec](../features/staging-ledger/spec-staging-tech.md) for full test plan.

### Example 3: Search Feature

**Risk:** MEDIUM (degraded UX but no data loss)

**TDD Required:**
- Search indexing logic
- Result ranking algorithm
- Query parsing

**TDD Optional:**
- Search box autocomplete
- Result highlighting

**TDD Skip:**
- Search animation effects

**Implementation:**
See [Intelligence Technical Spec](../features/intelligence/spec-intelligence-tech.md) for full test plan.

## Frequently Asked Questions

**Q: What if my feature spans multiple risk levels?**

A: Apply TDD to high-risk components, document the boundary clearly in your spec. Each component should have its own TDD decision.

**Q: Can I retroactively add TDD to existing code?**

A: Yes, prioritize based on defect density, change frequency, and risk level. Focus on code that breaks often or changes frequently.

**Q: How do I handle third-party integrations?**

A: Use mock-first approach with contract tests. Real integration tests are optional unless the integration is mission-critical.

**Q: What about performance tests?**

A: Performance tests are separate from TDD. Add them when you have specific performance requirements or after identifying bottlenecks.

**Q: Should I TDD configuration code?**

A: Only if misconfiguration could cause data loss or security issues. Most config code can skip TDD.

**Q: How detailed should my test scenarios be?**

A: Focus on behavior, not implementation. Test the "what," not the "how." Each test should verify one specific behavior.

**Q: When should I use integration vs unit tests?**

A: Unit for pure logic, integration for boundaries (DB, API, file system). When in doubt, prefer unit tests for speed.

## Related Documentation

### Foundation
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Overall project vision and scope
- [Roadmap v2.0.0-MPPP](../master/roadmap.md) - Development phases and priorities

### Testing Infrastructure
- [TestKit Technical Specification](../cross-cutting/../guides/guide-testkit-usage.md) - Testing tools and utilities
- [TestKit Usage Guide](./guide-testkit-usage.md) - Practical testing patterns
- [Test Strategy Guide](./test-strategy.md) - Overall testing approach
- [Phase 1 Testing Patterns](./phase1-testing-patterns.md) - MPPP-specific patterns

### Feature Specifications
All technical specifications reference this guide for TDD decisions:
- [Voice Capture Technical Spec](../features/capture/spec-capture-voice-tech.md)
- [Staging Ledger Technical Spec](../features/staging-ledger/spec-staging-tech.md)
- [Obsidian Bridge Technical Spec](../features/obsidian-bridge/spec-obsidian-tech.md)
- [Intelligence Technical Spec](../features/intelligence/spec-intelligence-tech.md)

## Maintenance Notes

### When to Update This Guide

**Review Triggers:**
- Quarterly assessment of risk classifications
- Post-incident reviews that reveal testing gaps
- Introduction of new technology layers (e.g., RAG implementation)
- Significant architecture changes
- Test suite execution exceeding 5 minutes

**Change Process:**
1. Propose changes via PR with clear rationale
2. Architecture team review required
3. Document impact on existing specs
4. Update all affected feature specs within 30 days
5. Communicate changes in team sync

### Version History
- v1.1.0 (2025-09-28): Standardized to guide template format
- v1.0.0 (2025-09-26): Initial specification with risk-based framework

### Known Limitations
- E2E testing guidance is minimal (deferred to later phase)
- Performance testing strategy not yet defined
- Visual regression testing approach TBD

---

*Remember: TDD is a tool, not a religion. Apply it where it delivers value, skip it where it doesn't. The goal is confidence in critical paths, not ceremonial testing of every getter/setter.*