#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if package name provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Package name required${NC}"
  echo "Usage: ./scripts/create-package.sh <package-name>"
  exit 1
fi

PACKAGE_NAME=$1
PACKAGE_DIR="packages/$PACKAGE_NAME"

# Validate package name (kebab-case)
if ! [[ "$PACKAGE_NAME" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo -e "${RED}Error: Package name must be kebab-case (lowercase with hyphens)${NC}"
  echo "Examples: notifications, email-service, task-manager"
  exit 1
fi

# Check if package already exists
if [ -d "$PACKAGE_DIR" ]; then
  echo -e "${RED}Error: Package already exists at $PACKAGE_DIR${NC}"
  exit 1
fi

echo -e "${GREEN}Creating package: @capture-bridge/$PACKAGE_NAME${NC}"
echo ""

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p "$PACKAGE_DIR/src/__tests__"

# Convert kebab-case to PascalCase for class/type names
PACKAGE_PASCAL=$(echo "$PACKAGE_NAME" | sed -r 's/(^|-)([a-z])/\U\2/g')

# Create package.json
echo "📝 Creating package.json..."
cat > "$PACKAGE_DIR/package.json" <<EOF
{
  "name": "@capture-bridge/$PACKAGE_NAME",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm run build && test -d dist",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --bail 1",
    "test:coverage": "vitest run --coverage",
    "test:integration": "TEST_MODE=integration vitest run"
  },
  "dependencies": {},
  "devDependencies": {
    "@capture-bridge/build-config": "workspace:*",
    "@orchestr8/testkit": "^2.0.0",
    "@types/node": "^24.3.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.3",
    "vitest": "^3.2.4"
  }
}
EOF

# Create vitest.config.ts
echo "⚙️  Creating vitest.config.ts..."
cat > "$PACKAGE_DIR/vitest.config.ts" <<EOF
import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/$PACKAGE_NAME',
      environment: 'node',

      // Bootstrap sequence (order matters!)
      setupFiles: [
        '@orchestr8/testkit/register',  // 1. TestKit bootstrap
        './test-setup.ts',               // 2. Resource cleanup config
      ],

      // Prevent zombie processes and hanging tests
      reporters: process.env.CI ? ['default'] : ['default', 'hanging-process'],

      // Timeout configuration
      testTimeout: 10000,      // 10s per test
      hookTimeout: 5000,       // 5s for hooks
      teardownTimeout: 20000,  // 20s for cleanup

      // Fork pool for process isolation
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
          maxForks: process.env.CI ? 2 : 4,
          minForks: 1,
          execArgv: ['--max-old-space-size=1024'],
        },
      },
    },
  })
)
EOF

# Create test-setup.ts
echo "🧪 Creating test-setup.ts..."
cat > "$PACKAGE_DIR/test-setup.ts" <<EOF
/**
 * Global test setup for $PACKAGE_NAME package
 */

import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: process.env.LOG_CLEANUP_STATS === '1',
})

console.log('✅ TestKit resource cleanup configured ($PACKAGE_NAME package)')
EOF

# Create tsconfig.json
echo "📄 Creating tsconfig.json..."
cat > "$PACKAGE_DIR/tsconfig.json" <<EOF
{
  "extends": "../../tooling/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Create tsup.config.ts
echo "📦 Creating tsup.config.ts..."
cat > "$PACKAGE_DIR/tsup.config.ts" <<EOF
import { defineConfig } from '@capture-bridge/build-config'

export default defineConfig({
  entry: ['src/index.ts'],
})
EOF

# Create src/index.ts
echo "💾 Creating src/index.ts..."
cat > "$PACKAGE_DIR/src/index.ts" <<EOF
/**
 * @capture-bridge/$PACKAGE_NAME
 *
 * [Add package description here]
 */

export const version = '0.1.0'

// Export your module API here
export function example(): string {
  return 'Hello from @capture-bridge/$PACKAGE_NAME'
}
EOF

# Create example test
echo "✅ Creating example test..."
cat > "$PACKAGE_DIR/src/__tests__/example.test.ts" <<EOF
import { describe, it, expect } from 'vitest'
import { useSqliteCleanup } from '@orchestr8/testkit/sqlite'
import { useTempDirectory } from '@orchestr8/testkit/fs'
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'
import { example } from '../index'

describe('$PACKAGE_PASCAL Module', () => {
  it('should demonstrate basic test', () => {
    expect(example()).toBe('Hello from @capture-bridge/$PACKAGE_NAME')
  })

  describe('Database Pattern', () => {
    const useDatabase = useSqliteCleanup(async () => {
      const { createMemoryDatabase } = await import('@orchestr8/testkit/sqlite')
      return createMemoryDatabase()
    })

    it('should use database with auto-cleanup', async () => {
      const db = await useDatabase()
      db.exec('CREATE TABLE users (id INTEGER, name TEXT)')
      db.exec('INSERT INTO users VALUES (1, "Test User")')

      const users = db.prepare('SELECT * FROM users').all()
      expect(users).toHaveLength(1)
      // ✅ Database auto-cleaned after test
    })
  })

  describe('File System Pattern', () => {
    const tempDir = useTempDirectory()

    it('should use temp directory with auto-cleanup', async () => {
      await tempDir.writeFile('test.txt', 'hello')
      const content = await tempDir.readFile('test.txt')

      expect(content).toBe('hello')
      // ✅ Temp directory auto-cleaned after test
    })
  })

  describe('MSW Pattern', () => {
    const msw = setupMSW([
      http.get('https://api.example.com/data', () => {
        return HttpResponse.json({ message: 'test data' })
      })
    ])

    it('should mock API calls', async () => {
      const response = await fetch('https://api.example.com/data')
      const data = await response.json()

      expect(data).toEqual({ message: 'test data' })
      // ✅ MSW server auto-cleaned after test
    })
  })
})
EOF

# Create README.md
echo "📖 Creating README.md..."
cat > "$PACKAGE_DIR/README.md" <<EOF
# @capture-bridge/$PACKAGE_NAME

[Add package description here]

## Installation

This is an internal workspace package.

## Usage

\`\`\`typescript
import { example } from '@capture-bridge/$PACKAGE_NAME'

console.log(example()) // "Hello from @capture-bridge/$PACKAGE_NAME"
\`\`\`

## Development

\`\`\`bash
# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with leak detection
LOG_CLEANUP_STATS=1 pnpm test

# Watch mode
pnpm test:watch

# Build package
pnpm build

# Type check
pnpm typecheck
\`\`\`

## Testing

This package uses TestKit 2.0 with optimized configuration:

- ✅ Automatic resource cleanup
- ✅ Leak detection enabled
- ✅ Fork pool for process isolation (4 workers local, 2 in CI)
- ✅ Hanging-process reporter (dev only)
- ✅ 1GB memory limit per worker
- ✅ Timeouts: 10s test, 5s hooks, 20s teardown

See \`vitest.config.ts\` and \`test-setup.ts\` for details.

## License

Private - Internal use only
EOF

echo ""
echo -e "${GREEN}✅ Package created successfully!${NC}"
echo ""
echo -e "${YELLOW}Location:${NC} $PACKAGE_DIR/"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Install dependencies:"
echo "     ${GREEN}pnpm install${NC}"
echo ""
echo "  2. Update src/index.ts with your module code"
echo ""
echo "  3. Write tests in src/__tests__/"
echo ""
echo "  4. Run tests:"
echo "     ${GREEN}pnpm --filter @capture-bridge/$PACKAGE_NAME test${NC}"
echo ""
echo "  5. Run with leak detection:"
echo "     ${GREEN}LOG_CLEANUP_STATS=1 pnpm --filter @capture-bridge/$PACKAGE_NAME test${NC}"
echo ""
echo -e "${GREEN}Features enabled:${NC}"
echo "  ✅ TestKit 2.0 with automatic resource cleanup"
echo "  ✅ Fork pool (4 workers local, 2 in CI)"
echo "  ✅ Memory limit: 1GB per worker"
echo "  ✅ Hanging-process reporter (dev only)"
echo "  ✅ Example tests demonstrating patterns"
echo ""
