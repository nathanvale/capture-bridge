---
title: MPPP Monorepo Structure Guide
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-27
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# MPPP Monorepo Structure Guide

## Purpose

This guide helps developers understand and navigate the ADHD Brain monorepo structure, focusing on the MPPP (Minimum Proof of Product Principle) approach that prioritizes simplicity and cognitive load reduction.

**Target Audience:** All developers working on the ADHD Brain project, especially those new to the codebase or setting up local development environments.

## When to Use This Guide

Use this guide when:

- Setting up a new development environment
- Adding a new package to the monorepo
- Understanding package dependencies and boundaries
- Implementing features that span multiple packages
- Deciding where new code should live
- Troubleshooting build or dependency issues

**Links to Related Features:**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md)
- [Capture Feature PRD](../features/capture/prd-capture.md)
- [CLI Feature PRD](../features/cli/prd-cli.md)

## Prerequisites

**Required Tools:**

- Node.js 18+ (LTS recommended)
- pnpm 8+ (`npm install -g pnpm`)
- Git 2.30+
- SQLite 3.35+ (usually included with macOS/Linux)

**Required Knowledge:**

- Basic understanding of TypeScript
- Familiarity with monorepo concepts
- Understanding of package.json and npm workspaces

**Optional but Helpful:**

- Experience with Turborepo
- Familiarity with pnpm workspaces

## Quick Reference

**TL;DR - Key Facts:**

- **4 packages maximum** in the `@capture-bridge` namespace
- **Sequential processing only** (no background services or queues)
- **External TestKit** (`@orchestr8/testkit`) for test infrastructure
- **pnpm workspaces + Turbo** for build orchestration
- **No circular dependencies** allowed between packages

**Package Hierarchy:**

```text
foundation (types, errors, constants)
    ↓
core (business logic) + storage (SQLite)
    ↓
capture (orchestration)
    ↓
cli (commands)
```

**Quick Commands:**

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm dev              # Watch mode for all packages
pnpm doctor           # Check system health
```

## Step-by-Step Instructions

### Step 1: Clone and Setup

Clone the repository and install dependencies:

```bash
# Clone repository
git clone https://github.com/your-org/capture-bridge.git
cd capture-bridge

# Install all dependencies (uses pnpm workspaces)
pnpm install

# Build all packages in dependency order
pnpm build

# Verify setup
pnpm doctor
```

**Expected Outcome:** All packages installed and built successfully, health check passes.

### Step 2: Understand Package Structure

Navigate the monorepo to understand package organization:

```bash
# View package structure
tree -L 3 -I 'node_modules|dist'

capture-bridge/
├── apps/
│   └── cli/                      # CLI application
├── packages/
│   └── @capture-bridge/
│       ├── foundation/           # Shared types, errors, constants
│       ├── core/                 # Business logic (pure functions)
│       ├── storage/              # SQLite operations
│       └── capture/              # Orchestration (no queues)
└── tools/
    └── scripts/                  # Setup and maintenance scripts
```

**Expected Outcome:** Clear understanding of where each type of code lives.

### Step 3: Add a New Package (If Needed)

Create a new package following the monorepo conventions:

```bash
# Navigate to packages directory
cd packages/@capture-bridge

# Create new package directory
mkdir new-package
cd new-package

# Initialize package.json
cat > package.json << 'EOF'
{
  "name": "@capture-bridge/new-package",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@capture-bridge/foundation": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.0.4"
  }
}
EOF

# Create source directory
mkdir -p src
touch src/index.ts
```

**Expected Outcome:** New package created with proper structure and dependencies.

**IMPORTANT:** Before creating a new package, verify you're not exceeding the 4-package limit for MPPP scope.

### Step 4: Configure TypeScript

Each package needs a TypeScript configuration:

```bash
# In your new package directory
cat > tsconfig.json << 'EOF'
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    {
      "path": "../foundation"
    }
  ]
}
EOF
```

**Expected Outcome:** TypeScript builds correctly with proper type checking.

### Step 5: Update Workspace Configuration

Register the new package in pnpm workspace:

```bash
# Edit pnpm-workspace.yaml (if not already included)
cat pnpm-workspace.yaml

packages:
  - 'apps/*'
  - 'packages/@capture-bridge/*'

# Install dependencies and link packages
pnpm install
```

**Expected Outcome:** New package is recognized by pnpm and linked to other packages.

### Step 6: Add Build Configuration

Update Turbo configuration to include new package:

```bash
# Edit turbo.json (usually no changes needed)
cat turbo.json

{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Expected Outcome:** New package builds in correct dependency order via Turbo.

## Common Patterns

### Pattern 1: Cross-Package Imports

Import from other packages using workspace protocol:

```typescript
// In packages/@capture-bridge/core/src/deduplication.ts
import { CaptureItem, CaptureSource } from "@capture-bridge/foundation"
import { DatabaseClient } from "@capture-bridge/storage"

export class DeduplicationService {
  constructor(private db: DatabaseClient) {}

  async isDuplicate(capture: CaptureItem): Promise<boolean> {
    // Implementation
  }
}
```

**Best Practice:** Only import from packages lower in the dependency hierarchy.

### Pattern 2: Shared Test Utilities

Use external TestKit for test utilities:

```typescript
// In any package test file
import { describe, it, expect } from "vitest"
import { createTestFixture } from "@orchestr8/testkit"

describe("MyFeature", () => {
  it("should work correctly", () => {
    const fixture = createTestFixture({
      captures: [{ id: "1", content: "Test capture" }],
    })

    // Test implementation
  })
})
```

**Best Practice:** Don't create internal test infrastructure - use @orchestr8/testkit to reduce cognitive load.

### Pattern 3: Package-Level Constants

Define package-specific constants in foundation:

```typescript
// In packages/@capture-bridge/foundation/src/constants.ts
export const LIMITS = {
  MAX_CAPTURE_SIZE_MB: 50,
  MAX_VOICE_DURATION_MIN: 30,
  MAX_EMAIL_SIZE_KB: 500,
  DUPLICATE_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
} as const

export const PATHS = {
  DATABASE: ".capture-bridge.db",
  METRICS: "./.metrics",
  LOGS: "./.logs",
} as const
```

**Best Practice:** Keep all shared constants in foundation to avoid duplication.

### Pattern 4: Error Handling Across Packages

Define error types in foundation, throw in other packages:

```typescript
// In packages/@capture-bridge/foundation/src/errors/capture.ts
export class CaptureError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message)
    this.name = "CaptureError"
  }
}

export class ValidationError extends CaptureError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR")
  }
}

// In packages/@capture-bridge/core/src/validation.ts
import { ValidationError } from "@capture-bridge/foundation"

export function validateCapture(capture: CaptureInput): void {
  if (!capture.content || capture.content.trim() === "") {
    throw new ValidationError("Capture content cannot be empty")
  }
}
```

**Best Practice:** All error types in foundation, usage in other packages.

### Anti-Patterns to Avoid

**❌ Don't: Create circular dependencies**

```typescript
// BAD - circular dependency
// In core/index.ts
import { processCapture } from "@capture-bridge/capture"

// In capture/index.ts
import { validateCapture } from "@capture-bridge/core"
```

**✅ Do: Keep dependencies unidirectional**

```typescript
// GOOD - unidirectional dependency
// In core/index.ts
import { CaptureItem } from "@capture-bridge/foundation"

// In capture/index.ts
import { validateCapture } from "@capture-bridge/core" // OK - capture depends on core
```

**❌ Don't: Exceed 4 packages in MPPP scope**

```text
# BAD - too many packages for MPPP
packages/@capture-bridge/
  ├── foundation/
  ├── core/
  ├── storage/
  ├── capture/
  ├── intelligence/      # NOT in MPPP scope!
  └── reminders/         # NOT in MPPP scope!
```

**✅ Do: Keep to 4 packages maximum**

```text
# GOOD - MPPP scope only
packages/@capture-bridge/
  ├── foundation/
  ├── core/
  ├── storage/
  └── capture/
```

**❌ Don't: Create internal test infrastructure**

```typescript
// BAD - building custom test framework
// In packages/test-utils/
export function createMockDatabase() { ... }
export function createMockCapture() { ... }
```

**✅ Do: Use external TestKit**

```typescript
// GOOD - using @orchestr8/testkit
import { createTestFixture } from "@orchestr8/testkit"
```

## Troubleshooting

### Problem: Package not found errors

**Symptoms:**

```
Error: Cannot find module '@capture-bridge/foundation'
```

**Solutions:**

```bash
# 1. Ensure all packages are built
pnpm build

# 2. Clear pnpm cache and reinstall
pnpm store prune
rm -rf node_modules
pnpm install

# 3. Verify workspace configuration
cat pnpm-workspace.yaml
# Should include 'packages/@capture-bridge/*'

# 4. Check package.json dependencies use workspace protocol
grep "workspace:" packages/@capture-bridge/*/package.json
# Should see: "@capture-bridge/foundation": "workspace:*"
```

### Problem: Build order issues

**Symptoms:** TypeScript errors about missing types from dependent packages

**Solutions:**

```bash
# 1. Build in dependency order
pnpm build

# 2. Check Turbo pipeline configuration
cat turbo.json
# Verify "dependsOn": ["^build"] exists

# 3. Clean and rebuild
pnpm clean
pnpm build

# 4. Build specific package with dependencies
cd packages/@capture-bridge/capture
pnpm build
```

### Problem: Circular dependency detected

**Symptoms:**

```
Error: Circular dependency detected: core -> capture -> core
```

**Solutions:**

```bash
# 1. Use madge to visualize dependencies
npx madge --circular --extensions ts packages/

# 2. Refactor to remove cycle:
#    - Move shared code to foundation
#    - Split package into two unidirectional dependencies
#    - Use dependency injection to break cycle

# 3. Verify dependency graph
npx madge --image graph.png packages/
# Open graph.png to visualize dependencies
```

### Problem: Hot reload not working

**Symptoms:** Changes not reflected in dev mode

**Solutions:**

```bash
# 1. Ensure dev mode is running
pnpm dev

# 2. Check if tsc --watch is running for package
cd packages/@capture-bridge/core
pnpm dev

# 3. Restart dev mode
# Kill all dev processes (Ctrl+C)
pnpm dev

# 4. Verify turbo.json dev configuration
cat turbo.json
# Check "dev": { "cache": false, "persistent": true }
```

### Problem: Test failures after package changes

**Symptoms:** Tests fail with "Cannot find module" or type errors

**Solutions:**

```bash
# 1. Rebuild packages before testing
pnpm build
pnpm test

# 2. Clear test cache
pnpm test --no-cache

# 3. Check package.json test script
cat packages/@capture-bridge/core/package.json
# Verify "test": "vitest" script exists

# 4. Run tests for specific package
cd packages/@capture-bridge/core
pnpm test
```

## Examples

### Example 1: Complete Package Setup

Create a new package from scratch:

```bash
#!/bin/bash
# Script: create-package.sh

PACKAGE_NAME=$1

if [ -z "$PACKAGE_NAME" ]; then
  echo "Usage: ./create-package.sh <package-name>"
  exit 1
fi

PACKAGE_DIR="packages/@capture-bridge/$PACKAGE_NAME"

# Create directory structure
mkdir -p "$PACKAGE_DIR/src"

# Create package.json
cat > "$PACKAGE_DIR/package.json" << EOF
{
  "name": "@capture-bridge/$PACKAGE_NAME",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "dev": "tsc --watch",
    "lint": "eslint src/**/*.ts",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@capture-bridge/foundation": "workspace:*"
  },
  "devDependencies": {
    "@orchestr8/testkit": "^1.0.0",
    "typescript": "^5.3.3",
    "vitest": "^1.0.4"
  }
}
EOF

# Create tsconfig.json
cat > "$PACKAGE_DIR/tsconfig.json" << EOF
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    {
      "path": "../foundation"
    }
  ]
}
EOF

# Create index.ts
cat > "$PACKAGE_DIR/src/index.ts" << EOF
// Export all public APIs from this package
export * from './types';
EOF

# Create initial test file
cat > "$PACKAGE_DIR/src/index.test.ts" << EOF
import { describe, it, expect } from 'vitest';

describe('$PACKAGE_NAME', () => {
  it('should be defined', () => {
    expect(true).toBe(true);
  });
});
EOF

echo "Package created at $PACKAGE_DIR"
echo "Next steps:"
echo "  1. cd $PACKAGE_DIR"
echo "  2. pnpm install"
echo "  3. pnpm build"
echo "  4. pnpm test"
```

### Example 2: Cross-Package Feature Implementation

Implement a feature spanning multiple packages:

```typescript
// 1. Define types in foundation
// packages/@capture-bridge/foundation/src/types/capture.ts
export interface CaptureItem {
  id: string
  source: CaptureSource
  raw_content: string
  content_hash: string
  created_at: Date
  status: CaptureStatus
  meta_json: Record<string, unknown>
}

export type CaptureSource = "voice" | "email"
export type CaptureStatus = "staged" | "transcribed" | "exported"

// 2. Implement business logic in core
// packages/@capture-bridge/core/src/deduplication.ts
import { CaptureItem } from "@capture-bridge/foundation"

export class DeduplicationService {
  isDuplicate(newCapture: CaptureItem, existing: CaptureItem[]): boolean {
    return existing.some(
      (item) =>
        item.content_hash === newCapture.content_hash &&
        this.isWithinTimeWindow(newCapture.created_at, item.created_at)
    )
  }

  private isWithinTimeWindow(date1: Date, date2: Date): boolean {
    const FIVE_MINUTES = 5 * 60 * 1000
    return Math.abs(date1.getTime() - date2.getTime()) <= FIVE_MINUTES
  }
}

// 3. Implement storage in storage package
// packages/@capture-bridge/storage/src/repositories/capture.ts
import { CaptureItem } from "@capture-bridge/foundation"
import { DatabaseClient } from "../database"

export class CaptureRepository {
  constructor(private db: DatabaseClient) {}

  async insert(capture: Omit<CaptureItem, "id">): Promise<string> {
    const id = this.db.generateId()
    await this.db.run(
      `INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        capture.source,
        capture.raw_content,
        capture.content_hash,
        capture.status,
        JSON.stringify(capture.meta_json),
      ]
    )
    return id
  }

  async findByContentHash(hash: string): Promise<CaptureItem[]> {
    return this.db.query<CaptureItem>(
      `SELECT * FROM captures WHERE content_hash = ?`,
      [hash]
    )
  }
}

// 4. Orchestrate in capture package
// packages/@capture-bridge/capture/src/voice-processor.ts
import { CaptureItem, CaptureSource } from "@capture-bridge/foundation"
import { DeduplicationService } from "@capture-bridge/core"
import { CaptureRepository } from "@capture-bridge/storage"

export class VoiceProcessor {
  constructor(
    private dedup: DeduplicationService,
    private captureRepo: CaptureRepository
  ) {}

  async processVoiceMemo(audioPath: string): Promise<string | null> {
    // Transcribe audio
    const transcription = await this.transcribeAudio(audioPath)

    // Create capture item
    const capture: Omit<CaptureItem, "id"> = {
      source: "voice" as CaptureSource,
      raw_content: transcription,
      content_hash: this.calculateHash(transcription),
      created_at: new Date(),
      status: "transcribed",
      meta_json: { audio_path: audioPath },
    }

    // Check for duplicates
    const existing = await this.captureRepo.findByContentHash(
      capture.content_hash
    )
    if (this.dedup.isDuplicate(capture as CaptureItem, existing)) {
      console.log("Duplicate capture detected - skipping")
      return null
    }

    // Insert new capture
    const captureId = await this.captureRepo.insert(capture)
    return captureId
  }

  private async transcribeAudio(audioPath: string): Promise<string> {
    // Whisper transcription implementation
  }

  private calculateHash(content: string): string {
    // Hash calculation implementation
  }
}

// 5. Expose via CLI
// apps/cli/src/commands/capture-voice.ts
import { VoiceProcessor } from "@capture-bridge/capture"

export async function captureVoiceCommand(audioPath: string): Promise<void> {
  const processor = new VoiceProcessor(dedup, captureRepo)
  const captureId = await processor.processVoiceMemo(audioPath)

  if (captureId) {
    console.log(`Capture successful: ${captureId}`)
  } else {
    console.log("Duplicate capture - skipped")
  }
}
```

## Related Documentation

**PRDs (Product Requirements):**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System-wide architecture and MPPP principles
- [Monorepo Foundation PRD](../cross-cutting/prd-foundation-monorepo.md) - Monorepo requirements
- [Capture Feature PRD](../features/capture/prd-capture.md) - Capture package structure
- [CLI Feature PRD](../features/cli/prd-cli.md) - CLI application structure

**Cross-Cutting Specifications:**

- [Monorepo Technical Spec](../cross-cutting/spec-foundation-monorepo-tech.md) - Package architecture
- [Monorepo MPPP Spec](../cross-cutting/spec-foundation-monorepo-mppp.md) - MPPP-specific patterns

**Guides (How-To):**

- [TDD Applicability Guide](./guide-tdd-applicability.md) - Testing strategy
- [Test Strategy Guide](./guide-test-strategy.md) - Testing approach
- [Phase 1 Testing Patterns](./guide-phase1-testing-patterns.md) - Monorepo testing patterns
- [TestKit Usage Guide](./guide-testkit-usage.md) - Test infrastructure
- [Polling Implementation Guide](./guide-polling-implementation.md) - Sequential processing patterns

**External Resources:**

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)

## Maintenance Notes

**When to Update:**

- New package added to monorepo
- Package dependencies change
- Build infrastructure updated (Turbo, pnpm versions)
- New development patterns established

**Known Limitations:**

- Maximum 4 packages in MPPP scope (intentional constraint)
- No circular dependencies allowed (enforced by architecture)
- Sequential processing only (no background services)
- Local-first only (no cloud infrastructure)

**Gaps:**

- Web application infrastructure not included (Phase 5+)
- Background services not supported (Phase 3+)
- Plugin architecture deferred (Phase 4+)
- Advanced monitoring deferred (Phase 3+)
