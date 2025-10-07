# TDD Implementation Spec: CONTENT_HASH_IMPLEMENTATION--T01

**Status:** Ready for wallaby-tdd-agent implementation
**Task ID:** CONTENT_HASH_IMPLEMENTATION--T01
**Risk Level:** High (TDD MANDATORY)
**Created:** 2025-10-07

## Context

This task implements the foundation hash utilities for content deduplication in the Capture Bridge system. All hash functions MUST use SHA-256 (ADR-0002 superseded - BLAKE3 deferred to Phase 2+).

## Package Structure

```text
packages/foundation/src/hash/
├── __tests__/
│   ├── normalize.test.ts
│   ├── compute.test.ts
│   ├── fingerprint.test.ts
│   └── email.test.ts
├── normalize.ts
├── compute.ts
├── fingerprint.ts
├── email.ts
└── index.ts
```

## Acceptance Criteria (TDD Required)

### AC01: Text Normalization Function

**File:** `packages/foundation/src/hash/normalize.ts`

**Requirements:**
- Trim leading/trailing whitespace
- Convert all line endings to LF (\n)
- Preserve internal whitespace
- Deterministic output

**Function Signature:**
```typescript
export function normalizeText(input: string): string
```

**Test Cases (RED phase):**
```typescript
describe('normalizeText', () => {
  it('should trim leading and trailing whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello')
  })

  it('should convert CRLF to LF', () => {
    expect(normalizeText('hello\r\nworld')).toBe('hello\nworld')
  })

  it('should convert CR to LF', () => {
    expect(normalizeText('hello\rworld')).toBe('hello\nworld')
  })

  it('should preserve internal whitespace', () => {
    expect(normalizeText('hello   world')).toBe('hello   world')
  })

  it('should handle empty strings', () => {
    expect(normalizeText('')).toBe('')
  })

  it('should handle strings with only whitespace', () => {
    expect(normalizeText('   ')).toBe('')
  })

  it('should be deterministic', () => {
    const input = '  test\r\ncontent  '
    const result1 = normalizeText(input)
    const result2 = normalizeText(input)
    expect(result1).toBe(result2)
  })
})
```

### AC02: SHA-256 Hash Computation

**File:** `packages/foundation/src/hash/compute.ts`

**Requirements:**
- Input: string (normalized recommended)
- Output: 64-character lowercase hex string
- Use Node.js built-in crypto module
- Deterministic

**Function Signature:**
```typescript
export function computeHash(input: string): string
```

**Test Cases (RED phase):**
```typescript
describe('computeHash', () => {
  it('should compute SHA-256 hash', () => {
    const hash = computeHash('hello world')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should be deterministic', () => {
    const input = 'test content'
    const hash1 = computeHash(input)
    const hash2 = computeHash(input)
    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different inputs', () => {
    const hash1 = computeHash('hello')
    const hash2 = computeHash('world')
    expect(hash1).not.toBe(hash2)
  })

  it('should handle empty strings', () => {
    const hash = computeHash('')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should produce known hash for test vector', () => {
    // SHA-256 of "hello world" is known
    const hash = computeHash('hello world')
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('should handle Unicode characters', () => {
    const hash = computeHash('こんにちは世界')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
```

### AC03: Audio Fingerprint (First 4MB SHA-256)

**File:** `packages/foundation/src/hash/fingerprint.ts`

**Requirements:**
- Read first 4MB of audio file
- Compute SHA-256 of those bytes
- Return 64-character hex string
- Handle files < 4MB gracefully

**Function Signature:**
```typescript
export async function computeAudioFingerprint(filePath: string): Promise<string>
```

**Test Cases (RED phase):**
```typescript
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('computeAudioFingerprint', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `test-fingerprint-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  it('should compute fingerprint of small file', async () => {
    const filePath = join(testDir, 'small.m4a')
    writeFileSync(filePath, Buffer.from('test audio content'))

    const fingerprint = await computeAudioFingerprint(filePath)
    expect(fingerprint).toHaveLength(64)
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should be deterministic for same file', async () => {
    const filePath = join(testDir, 'audio.m4a')
    writeFileSync(filePath, Buffer.from('test content'))

    const fp1 = await computeAudioFingerprint(filePath)
    const fp2 = await computeAudioFingerprint(filePath)
    expect(fp1).toBe(fp2)
  })

  it('should only read first 4MB of large file', async () => {
    const filePath = join(testDir, 'large.m4a')
    const size5MB = 5 * 1024 * 1024
    const buffer = Buffer.alloc(size5MB)

    // Fill with test data (different values)
    for (let i = 0; i < size5MB; i++) {
      buffer[i] = i % 256
    }
    writeFileSync(filePath, buffer)

    // Create another file with same first 4MB but different last 1MB
    const filePath2 = join(testDir, 'large2.m4a')
    const buffer2 = Buffer.alloc(size5MB)
    for (let i = 0; i < 4 * 1024 * 1024; i++) {
      buffer2[i] = i % 256 // Same as first file
    }
    for (let i = 4 * 1024 * 1024; i < size5MB; i++) {
      buffer2[i] = 255 - (i % 256) // Different from first file
    }
    writeFileSync(filePath2, buffer2)

    const fp1 = await computeAudioFingerprint(filePath)
    const fp2 = await computeAudioFingerprint(filePath2)

    // Fingerprints should be the same (only first 4MB matters)
    expect(fp1).toBe(fp2)
  })

  it('should throw error for non-existent file', async () => {
    const filePath = join(testDir, 'nonexistent.m4a')
    await expect(computeAudioFingerprint(filePath)).rejects.toThrow()
  })

  it('should handle empty file', async () => {
    const filePath = join(testDir, 'empty.m4a')
    writeFileSync(filePath, Buffer.alloc(0))

    const fingerprint = await computeAudioFingerprint(filePath)
    expect(fingerprint).toHaveLength(64)
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })
})
```

### AC04: Email Body Hash (Message-ID + Normalized Text)

**File:** `packages/foundation/src/hash/email.ts`

**Requirements:**
- Combine Message-ID + normalized body text
- Format: `message_id:<id>\nbody:<normalized_text>`
- Compute SHA-256 of combined string
- Return 64-character hex string

**Function Signature:**
```typescript
export function computeEmailHash(messageId: string, bodyText: string): string
```

**Test Cases (RED phase):**
```typescript
describe('computeEmailHash', () => {
  it('should compute hash from message ID and body', () => {
    const hash = computeEmailHash('msg-123', 'Hello world')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should be deterministic', () => {
    const hash1 = computeEmailHash('msg-123', 'test body')
    const hash2 = computeEmailHash('msg-123', 'test body')
    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different message IDs', () => {
    const hash1 = computeEmailHash('msg-123', 'same body')
    const hash2 = computeEmailHash('msg-456', 'same body')
    expect(hash1).not.toBe(hash2)
  })

  it('should produce different hashes for different bodies', () => {
    const hash1 = computeEmailHash('same-id', 'body 1')
    const hash2 = computeEmailHash('same-id', 'body 2')
    expect(hash1).not.toBe(hash2)
  })

  it('should normalize body text before hashing', () => {
    // Same content with different whitespace/line endings should produce same hash
    const hash1 = computeEmailHash('id', '  hello\r\nworld  ')
    const hash2 = computeEmailHash('id', 'hello\nworld')
    expect(hash1).toBe(hash2)
  })

  it('should handle empty message ID', () => {
    const hash = computeEmailHash('', 'body text')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should handle empty body', () => {
    const hash = computeEmailHash('msg-123', '')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should follow canonical format', () => {
    // Manually verify the format by reconstructing
    const messageId = 'test-id'
    const bodyText = 'test body'

    const { normalizeText } = await import('../normalize.js')
    const { computeHash } = await import('../compute.js')

    const normalizedBody = normalizeText(bodyText)
    const canonical = `message_id:${messageId}\nbody:${normalizedBody}`
    const expectedHash = computeHash(canonical)

    const actualHash = computeEmailHash(messageId, bodyText)
    expect(actualHash).toBe(expectedHash)
  })
})
```

## Implementation Order (TDD Workflow)

### Phase 1: AC01 - Text Normalization (Foundation)
1. **RED**: Write normalize.test.ts with all test cases
2. **GREEN**: Implement normalizeText() to pass all tests
3. **REFACTOR**: Clean up implementation
4. **VERIFY**: Run tests, check coverage

### Phase 2: AC02 - Hash Computation (Core)
1. **RED**: Write compute.test.ts with all test cases
2. **GREEN**: Implement computeHash() using Node.js crypto
3. **REFACTOR**: Optimize if needed
4. **VERIFY**: Run tests, check known test vectors

### Phase 3: AC03 - Audio Fingerprint (File I/O)
1. **RED**: Write fingerprint.test.ts with all test cases
2. **GREEN**: Implement computeAudioFingerprint() with file reading
3. **REFACTOR**: Handle edge cases (empty, large files)
4. **VERIFY**: Run tests, check file cleanup

### Phase 4: AC04 - Email Hash (Integration)
1. **RED**: Write email.test.ts with all test cases
2. **GREEN**: Implement computeEmailHash() using normalize + compute
3. **REFACTOR**: Ensure canonical format compliance
4. **VERIFY**: Run all tests across all modules

### Phase 5: Integration & Export
1. Create hash/index.ts with all exports
2. Update foundation/src/index.ts to export hash module
3. Run full monorepo build
4. Verify no circular dependencies
5. Check TypeScript compilation
6. Run ESLint

## TestKit Patterns to Use

Based on `.claude/rules/testkit-tdd-guide.md`:

1. **Dynamic Imports**: Use `await import()` for all TestKit imports
2. **File Operations**: Use temp directories with proper cleanup
3. **Cleanup Sequence**: pools → databases → filesystem → GC
4. **Determinism**: Test same input → same output multiple times
5. **Edge Cases**: Empty strings, large files, special characters

## Success Criteria

✅ All test files created with comprehensive coverage
✅ All tests passing (100% coverage required for High risk)
✅ Hash outputs are deterministic
✅ TypeScript compilation successful
✅ ESLint passing (no errors)
✅ Build successful (`pnpm build` in foundation package)
✅ No circular dependencies
✅ Documentation (JSDoc) for all public functions

## Commands for wallaby-tdd-agent

```bash
# Navigate to foundation package
cd /Users/nathanvale/code/capture-bridge/packages/foundation

# Run tests (watch mode for TDD)
pnpm test --watch

# Run tests with coverage
pnpm test:coverage

# Build
pnpm build

# Lint
pnpm lint

# Type check
pnpm typecheck
```

## Notes for Implementation

- Use Node.js built-in `crypto` module (no external dependencies)
- Use `node:fs/promises` for async file operations
- Follow existing code style in foundation package
- Add JSDoc comments for all exported functions
- Use `.js` extensions in relative imports (ESM requirement)
- No emojis in production code
- Use underscore prefix for unused catch variables

## References

- Master PRD: `/Users/nathanvale/code/capture-bridge/docs/master/prd-master.md`
- Staging Tech Spec: `/Users/nathanvale/code/capture-bridge/docs/features/staging-ledger/spec-staging-tech.md`
- ADR-0002: Dual Hash Migration (superseded - SHA-256 only)
- ADR-0006: Late Hash Binding for Voice
- TestKit Guide: `/Users/nathanvale/code/capture-bridge/.claude/rules/testkit-tdd-guide.md`
