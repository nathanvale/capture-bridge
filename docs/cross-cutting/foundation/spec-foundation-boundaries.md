# Foundation — Package Boundaries

**Decision:** Strict import rules via ESLint + tsconfig paths.

## Dependency Rules
```
apps/* → can import packages/*
packages/* → can import @adhd-brain/shared only
tooling/* → no imports (configs only)
```

## Enforcement
```js
// ESLint rule
{
  'import/no-restricted-paths': [
    'error',
    {
      zones: [
        {
          target: './packages/capture',
          from: './packages/!(shared)',
          message: 'Capture can only import from shared'
        }
      ]
    }
  ]
}
```

## TypeScript Paths
```json
// Root tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@adhd-brain/*": ["./packages/*/src"]
    }
  }
}
```

## Testing Boundaries
```ts
// packages/staging/contracts/boundary.test.ts
test('staging does not import bridge', () => {
  const pkg = require('../package.json');
  expect(pkg.dependencies).not.toHaveProperty('@adhd-brain/bridge');
});
```

## TDD: Required for boundary tests.