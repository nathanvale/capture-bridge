# Foundation — CI/CD Pipeline

**Decision:** GitHub Actions with pnpm caching + matrix strategy.

## Pipeline (.github/workflows/ci.yml)
```yaml
name: CI
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:ci
      - run: pnpm build
```

## Optimizations
- pnpm store caching
- Turbo remote cache (later)
- Parallel jobs for large suites
- Skip unchanged (via Turbo)

## Quality Gates
- ✅ All checks must pass for merge
- Coverage thresholds enforced
- No lint warnings
- Clean TypeScript build

## TDD: Test that CI validates on clean clone.