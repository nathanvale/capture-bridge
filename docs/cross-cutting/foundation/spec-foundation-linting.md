# Foundation — Linting & Formatting

**Decision:** Orchestr8 ESLint (flat config) + Prettier, applied verbatim.

## Setup
```bash
pnpm add -D @orchestr8/eslint-config prettier
```

## Root eslint.config.mjs
```js
import orchestr8 from '@orchestr8/eslint-config';

export default orchestr8({
  typescript: true,
  react: true,
  node: true,
  ignores: ['**/dist/**', '**/coverage/**']
});
```

## Prettier
```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

## Scripts
```json
{
  "lint": "eslint . --cache",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

## CI Integration
- Pre-commit: format staged
- PR: lint + format:check must pass
- Auto-fix via bot comments

## TDD: N/A (tooling config).