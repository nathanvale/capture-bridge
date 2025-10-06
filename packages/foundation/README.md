# @capture-bridge/foundation

TestKit integration and verification package for the Capture Bridge monorepo.

## Purpose

This package serves as:
- **TestKit reference implementation** - 318 comprehensive tests demonstrating best practices
- **Integration verification** - Ensures TestKit works correctly in our monorepo setup
- **Test pattern library** - Examples of SQLite, MSW, CLI mocking, security testing, and more

## Running Tests

### Normal Mode (Recommended for CI)
```bash
pnpm test
```
Runs all 318 tests (~8 seconds execution, ~90 seconds with cleanup timeout handling).

### Skip Mode (For Local Dev Speed)
```bash
SKIP_FOUNDATION_TESTS=1 pnpm test
```
Skips all tests - use this only when you know the test infrastructure is stable.

### Watch Mode
```bash
pnpm test:watch
```

### Coverage
```bash
pnpm test:coverage
```

## Test Timeout Handling

Foundation tests complete successfully in ~8 seconds, but may timeout during cleanup due to file handles from fork pool processes. This is handled automatically:

- Tests use `timeout --signal=KILL 90` wrapper
- Process is force-killed after 90 seconds if cleanup hangs
- All tests pass before timeout occurs
- This is a known Vitest + fork pool interaction, not a test failure

## Test Categories

The 318 tests cover:

| Category | Tests | Purpose |
|----------|-------|---------|
| SQLite Pool | 46 | Connection pool management |
| CLI Utilities | 56 | Process mocking behavioral patterns |
| Core Utilities | 39 | Async utilities (delay, retry, timeout) |
| MSW Features | 34 | HTTP mocking integration |
| Utils Advanced | 32 | Concurrency & resource pooling |
| SQLite Features | 25 | Database utilities |
| SQLite Advanced | 21 | Advanced database patterns |
| Security | 21 | Security validation (SQL injection, etc.) |
| Performance | 14 | Benchmarks and memory leak detection |
| Validation | 13 | Contract and final validation |
| Main Export | 3 | Integration tests |

**Total:** 318 tests, 100% pass rate

## Dependencies

- `@orchestr8/testkit@^2.0.0` - Testing utilities framework
- `vitest@^3.2.4` - Test runner
- `better-sqlite3` - SQLite database (peer dependency)
- `msw` - HTTP mocking (peer dependency)

## Configuration

- **Vitest Config:** `vitest.config.ts` - Uses TestKit's `createBaseVitestConfig()`
- **Test Setup:** `test-setup.ts` - Configures resource cleanup
- **Fork Pool:** 6 workers (local), 2 workers (CI)
- **Timeouts:** 10s test, 5s hooks, 120s teardown

## Why This Package Exists

While most packages just have tests alongside their source code, foundation serves as:

1. **Living documentation** for TestKit patterns
2. **Regression prevention** for test infrastructure changes
3. **Onboarding resource** for new developers
4. **Quality gate** ensuring our test setup works correctly

## Performance

- **Execution Time:** ~8 seconds (all 318 tests)
- **Parallelization:** 6 workers (50-60% efficiency)
- **Memory:** 1GB per worker (6GB peak)
- **Cache:** Enabled via Turbo (80% hit rate)

## Notes

- Foundation tests are **always run in CI** to ensure test infrastructure stability
- Use `SKIP_FOUNDATION_TESTS=1` only for rapid local iteration
- All tests use TestKit best practices (dynamic imports, proper cleanup, security patterns)
- See `packages/foundation/docs/` for detailed performance analysis and production reports

## Maintenance

**When to update:**
- TestKit version changes
- Vitest configuration changes
- New test patterns emerge
- Node.js major version updates

**Owner:** Engineering team
**Status:** Production-ready, actively maintained
