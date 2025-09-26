# Foundation — Testing Strategy

**Decision:** Vitest workspace mode with lanes + coverage thresholds.

## Test Lanes
- **Unit:** Pure logic, no I/O
- **Contracts:** File ops, SQLite, adapters
- **Integration:** Multi-module flows
- **E2E:** (Deferred to Playwright)

## Structure
```
packages/capture/
  src/
    capture.ts
    capture.test.ts      → unit
  contracts/
    fs.contract.test.ts  → I/O boundary
```

## Config
```js
// vitest.workspace.ts
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['**/*.test.ts'],
      exclude: ['**/contracts/**']
    }
  },
  {
    test: {
      name: 'contracts',
      include: ['**/contracts/**/*.test.ts']
    }
  }
])
```

## Coverage
- Unit: 80% lines
- Contracts: 60% (I/O paths)
- Global: 70%

## TDD Required
- Deterministic hash
- Dedup logic
- Outbox idempotency
- Atomic writes
- Crash recovery

## Commands
```bash
pnpm test:unit      # Fast feedback
pnpm test:contracts # I/O tests
pnpm test:coverage  # Full report
```