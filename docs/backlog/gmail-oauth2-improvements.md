# Gmail OAuth2 Improvements Backlog

**Created**: 2025-10-10
**Branch**: feat/GMAIL_OAUTH2_SETUP--T01 (completed)
**Source**: CodeRabbit review analysis

---

## P1 — Should Address Soon

### P1-2: Add Test for 0600 Permissions After Refresh

**What**: Writer ensures 0600 on write; good. When refreshing, same helper used, but a quick stat check isn't in tests for refresh path.

**Fix**: Add one test asserting refreshed file mode remains 0600.

**Test File**: `packages/capture/src/gmail/__tests__/token-refresh.test.ts`

**Test Code**:
```typescript
it('should maintain 0600 permissions after token refresh [P1-2]', async () => {
  const { createTempDirectory } = await import('@orchestr8/testkit/fs')
  const tempDir = await createTempDirectory()
  tempDirs.push(tempDir)

  const credentialsPath = join(tempDir.path, 'credentials.json')
  const tokenPath = join(tempDir.path, 'token.json')

  // Create credentials and expiring token (similar to existing test)
  const mockCredentials = { ... }
  await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials))

  const expiringToken = {
    access_token: 'expiring-token',
    refresh_token: 'refresh-token',
    expiry_date: Date.now() + 2 * 60 * 1000, // 2 minutes
  }
  await fs.writeFile(tokenPath, JSON.stringify(expiringToken))

  const { ensureValidToken } = await import('../auth.js')

  // Mock refresh
  const mockNewTokens = {
    access_token: 'new-token',
    refresh_token: 'new-refresh',
    expiry_date: Date.now() + 3600000,
  }

  await ensureValidToken(credentialsPath, tokenPath, undefined, {
    mockRefresh: { tokens: mockNewTokens },
  })

  // Verify file permissions remain 0600 after refresh
  const stats = await fs.stat(tokenPath)
  const mode = stats.mode & parseInt('777', 8)
  expect(mode).toBe(0o600)
})
```

**Priority**: P1
**Effort**: 15 minutes
**Risk**: Low (test-only change)

---

### P1-3: Scope Validation After Token Refresh ✅ COMPLETED

**Status**: ✅ **IMPLEMENTED** in P0-1 fix

**Implementation**: Lines 512-520 in `auth.ts` (performProductionRefresh function)

```typescript
// 4. Validate scope includes gmail.readonly [P1-3: Scope validation]
const scope = refreshedTokens.scope ?? ''
if (!scope.includes('https://www.googleapis.com/auth/gmail.readonly')) {
  throw new GmailAuthError(
    GmailErrorType.AUTH_INVALID_GRANT,
    'Refreshed token missing required gmail.readonly scope',
    new Error(`Invalid scope: ${scope}`)
  )
}
```

**Notes**: Scope validation implemented during production refresh. Also validates scope format and throws appropriate error if missing required scope.

---

## P2 — Nice Improvements

### P2-1: Use loadCredentials in Tests for Happy-Path

**What**: Many tests re-create credentials JSON ad hoc; calling `loadCredentials` in some integration tests would exercise AC01 in flow.

**Benefit**: Strengthens end-to-end consistency.

**Files to Update**:
- `packages/capture/src/gmail/__tests__/oauth-flow.test.ts`
- `packages/capture/src/gmail/__tests__/token-refresh.test.ts`
- `packages/capture/src/gmail/__tests__/error-handling.test.ts`

**Example Change**:
```typescript
// Before:
const mockCredentials = {
  installed: { client_id: '...', ... }
}
await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials))

// After:
const mockCredentials = {
  installed: { client_id: '...', ... }
}
await fs.writeFile(credentialsPath, JSON.stringify(mockCredentials))

const { loadCredentials } = await import('../credentials.js')
const credentials = await loadCredentials(credentialsPath) // Exercises AC01
// Use credentials in test assertions
```

**Priority**: P2
**Effort**: 1-2 hours
**Risk**: Low (improves test coverage)

---

### P2-2: Add Helper to Ensure sync_state Schema

**What**: Wrap the repeated INSERT OR UPDATE upserts with a tiny local schema guard, or import a `ensureSyncStateTable(db)` from storage.

**Benefit**: Reduces implicit init dependency and improves robustness.

**Status**: ✅ **PARTIALLY COMPLETED** - `ensureSyncStateTable()` helper added in auth.ts

**Current Implementation**: Lines 44-58 in `auth.ts`

```typescript
const ensureSyncStateTable = (db: Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}
```

**Remaining Work**: Consider exporting this helper from `@capture-bridge/storage` package for reuse across packages.

**Priority**: P2
**Effort**: 30 minutes
**Risk**: Very low

---

### P2-3: Logging Breadcrumbs

**What**: When incrementing/resetting counters and updating `last_gmail_auth`, consider a debug-level logger call (guarded) to aid troubleshooting during "capture doctor".

**Implementation Plan**:
1. Add optional logger parameter to auth functions
2. Log state changes at debug level
3. Include timestamp and counter values

**Example**:
```typescript
export const incrementAuthFailures = (db: Database, logger?: Logger): number => {
  ensureSyncStateTable(db)
  const stmt = db.prepare(`...`)
  stmt.run()

  const result = db.prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'").get()
  const failures = result ? parseInt(result.value, 10) : 0

  logger?.debug(`Gmail auth failures incremented to ${failures}`)

  return failures
}
```

**Priority**: P2
**Effort**: 1 hour
**Risk**: Low (optional feature)

---

## P3 — Polishing

### P3-1: JSDoc/README Additions

**What**: Add a README section under `gmail/` that documents:
- Required files: `credentials.json` format, `token.json` location/permissions
- How to trigger first-time auth (auth URL), and where to paste code if/when implemented
- What errors mean and how failure cap behaves
- How AC06/AC07 `sync_state` keys are used

**File**: `packages/capture/src/gmail/README.md`

**Outline**:
```markdown
# Gmail OAuth2 Authentication

## Setup

### credentials.json
Download from Google Cloud Console...

### token.json
Generated after first auth...

## First-Time Authorization

1. Run authorize() to get authUrl
2. Visit URL in browser
3. Paste authorization code (future implementation)

## Error Handling

### Error Types
- AUTH_INVALID_GRANT: Token revoked
- AUTH_MAX_FAILURES: 5 consecutive failures
- API_RATE_LIMITED: Rate limit exceeded
- ...

### Failure Cap Behavior
After 5 consecutive failures, auth operations block.
Run `capture doctor` to diagnose.

## Sync State Keys

- `last_gmail_auth`: ISO timestamp of last successful auth
- `gmail_auth_failures`: Counter (0-5+)
```

**Priority**: P3
**Effort**: 2-3 hours
**Risk**: None (documentation only)

---

### P3-2: Minor Type/Style Alignment

**What**: Follow repo style: use shared types, prefer `Array<T>`, keep no semicolons, etc. Current code mostly complies.

**Status**: ✅ **COMPLETED** - Code already follows repo style

**Notes**:
- Using `GmailToken` shared type ✓
- Using `Array<T>` syntax ✓
- No semicolons ✓
- ESLint passing ✓

---

## Summary

**Completed**:
- ✅ P0-1: Production token refresh implemented
- ✅ P0-2: authorize() uses loadCredentials()
- ✅ P0-3: Defensive sync_state table initialization
- ✅ P1-1: Token types consolidated to GmailToken
- ✅ P1-3: Scope validation after token refresh
- ✅ P3-2: Type/style alignment

**Remaining**:
- P1-2: Add test for 0600 permissions after refresh (15 min)
- P2-1: Use loadCredentials in tests (1-2 hours)
- P2-2: Export ensureSyncStateTable helper (30 min)
- P2-3: Logging breadcrumbs (1 hour)
- P3-1: JSDoc/README additions (2-3 hours)

**Total Remaining Effort**: ~5-7 hours
