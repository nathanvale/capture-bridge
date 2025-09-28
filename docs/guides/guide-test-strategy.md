---
title: Test Strategy Guide
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Test Strategy Guide

## Purpose

This guide provides a high-level overview of the testing strategy for the ADHD Brain project. For detailed testing patterns and implementation guidance, see the comprehensive guides listed below.

**Target audience:** Developers and technical leads who need to understand the overall testing approach and find specific testing guidance.

## Testing Philosophy

The ADHD Brain testing strategy follows three core principles:

1. **Risk-based discipline** - Apply TDD only where data integrity, concurrency, storage, or contracts matter
2. **Test isolation** - Every test runs independently without shared state or resources
3. **Deterministic behavior** - Tests produce consistent results using controlled time, randomness, and dependencies

*Just like your ADHD brain benefits from clear structure, our test suite benefits from predictable patterns.*

## Quick Reference

**For comprehensive testing guidance, see:**

- **[Phase 1 Testing Patterns Guide](./guide-phase1-testing-patterns.md)** - Complete guide to unit and integration testing for Phase 1 (MPPP) features using TestKit alone. Covers in-memory SQLite, MSW API mocking, parallel execution safety, and when test coordinator infrastructure becomes necessary (Phase 2-3).

- **[TDD Applicability Guide](./guide-tdd-applicability.md)** - Risk-based framework for deciding when to apply TDD (required/optional/skip). Defines high/medium/low risk criteria and provides module-specific guidance for all features.

- **[TestKit Usage Guide](./guide-testkit-usage.md)** - Complete NPM package reference for `@template/testkit` with domain-specific examples, MPPP-specific testing patterns, and API reference for all test utilities.

## When to Use Which Guide

### Writing Phase 1 Feature Tests
’ Start with **[Phase 1 Testing Patterns](./guide-phase1-testing-patterns.md)**

### Deciding Test Coverage Level
’ Start with **[TDD Applicability Guide](./guide-tdd-applicability.md)**

### Understanding TestKit APIs
’ Start with **[TestKit Usage Guide](./guide-testkit-usage.md)**

### Planning Technical Specifications
’ Reference all three guides in your TDD Applicability Decision section

## Test Strategy Matrix

| Layer                 | Goal                                  | TDD Policy       | Tooling                     | Guide Reference |
|-----------------------|---------------------------------------|------------------|-----------------------------|-----------------|
| Unit (pure logic)     | Deterministic transforms/parse/rules  | Required         | Vitest                      | Phase 1 Patterns |
| Integration (RR7+DB)  | Loader/action + SQLite contract       | Required for core| Vitest + MemoryRouter + DB  | Phase 1 Patterns |
| Contract (adapters)   | Mock-first AI/DB boundaries           | Required         | Vitest + mocks              | TDD Applicability |
| E2E-lite (smoke)      | Happy-path vertical slice             | Optional early   | Playwright (later)          | TDD Applicability |
| Visual/UI             | Render correctness, flows             | Optional         | RTL for critical screens    | TDD Applicability |

## Phase 1 (MPPP) Scope

**In scope for Phase 1 testing:**
- Unit tests with in-memory SQLite (`:memory:`)
- Light integration tests with MSW API mocks
- No port binding (no running servers in tests)
- No file-based database performance tests
- TestKit utilities provide sufficient isolation

**Out of scope (Phase 2-3):**
- Integration tests binding to ports (requires test coordinator)
- File-based database performance tests (requires test coordinator)
- Resource leak detection for long-running workers
- E2E testing with Playwright

## Related Documentation

**Testing Infrastructure:**
- [Phase 1 Testing Patterns Guide](./guide-phase1-testing-patterns.md) - REQUIRED reading for all Phase 1 development
- [TDD Applicability Guide](./guide-tdd-applicability.md) - Risk-based TDD decision framework
- [TestKit Usage Guide](./guide-testkit-usage.md) - Complete TestKit API reference

**Project Context:**
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Phase 1 scope and success criteria
- [Roadmap v2.0.0-MPPP](../master/roadmap.md) - Phase 1 delivery slices

**Feature-Specific Test Specs:**
- [Capture Test Spec](../features/capture/spec-capture-test.md)
- [Staging Ledger Test Spec](../features/staging-ledger/spec-staging-test.md)
- [CLI Test Spec](../features/cli/spec-cli-test.md)
- [Obsidian Bridge Test Spec](../features/obsidian-bridge/spec-obsidian-test.md)

**How-To Guides:**
- [Polling Implementation Guide](./guide-polling-implementation.md)
- [Error Recovery Guide](./guide-error-recovery.md)
- [Capture Debugging Guide](./guide-capture-debugging.md)

## Maintenance Notes

### When to Update This Guide

This redirect guide should be updated when:
- New testing guides are added to the documentation set
- Testing strategy fundamentally changes (e.g., Phase 2 introduces test coordinator)
- The relationship between guides changes

### Known Limitations

This guide intentionally serves as a signpost rather than comprehensive documentation. All detailed testing guidance lives in the three comprehensive guides:

1. **Phase 1 Testing Patterns** - How to write tests for MPPP scope
2. **TDD Applicability** - When to write tests
3. **TestKit Usage** - What tools to use

---

**Summary: Where to Find Testing Guidance**

- **How to test Phase 1 features?** ’ [Phase 1 Testing Patterns Guide](./guide-phase1-testing-patterns.md)
- **When to apply TDD?** ’ [TDD Applicability Guide](./guide-tdd-applicability.md)
- **What TestKit APIs exist?** ’ [TestKit Usage Guide](./guide-testkit-usage.md)

This guide serves as your testing documentation hub. Start with the comprehensive guide that best matches your current need.