---
framework: vitest
test_command: pnpm test
created: 2025-10-02T00:00:00Z
---

# Testing Configuration

## Framework
- Type: Vitest
- Version: 3.2.4 (pnpm 9.15.4)
- Config File: packages/foundation/vitest.config.ts

## Test Structure
- Test Directory: packages/foundation/src/__tests__/
- Test Files: 5 files found
- Naming Pattern: *.test.ts

## Test Files
1. testkit-core-utilities.test.ts - Core utility verification
2. testkit-sqlite-features.test.ts - SQLite integration verification
3. testkit-msw-features.test.ts - MSW (Mock Service Worker) verification
4. testkit-main-export.test.ts - Main export verification
5. testkit-final-validation.test.ts - Final validation suite

## Commands
- Run All Tests: `pnpm test`
- Run Specific Test: `pnpm test {file_pattern}`
- Run with Debugging: `pnpm test --reporter=verbose`
- Watch Mode: `pnpm test --watch`

## Environment
- NODE_OPTIONS: '--max-old-space-size=4096'
- Test Environment: node
- Required Dependencies:
  - @orchestr8/testkit@1.0.7
  - better-sqlite3 (optional peer dependency)
  - msw (optional peer dependency)
  - happy-dom (optional peer dependency)

## Test Runner Agent Configuration
- Use verbose output for debugging
- Run tests sequentially (no parallel)
- Capture full stack traces
- No mocking - use real implementations where possible
- Wait for each test to complete

## Monorepo Structure
- Package Manager: pnpm (workspace mode)
- Test Location: Individual package __tests__ directories
- Current Focus: packages/foundation (TestKit verification)

## Notes
- TestKit 1.0.7 verification tests currently in foundation package
- Tests validate TestKit integration before broader usage
- Import path fixes applied (useTempDirectory, createTempDirectory)
