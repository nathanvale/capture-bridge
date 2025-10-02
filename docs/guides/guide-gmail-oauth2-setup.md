---
title: Gmail OAuth2 Setup Guide
status: approved
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
---

# Gmail OAuth2 Setup Guide

## Purpose

This guide helps developers implement Gmail OAuth2 authentication and history-based polling for email capture in the ADHD Brain system. It provides step-by-step instructions for setting up OAuth2 credentials, managing token lifecycle, implementing incremental polling with history IDs, and handling common failure scenarios.

**Target Audience:** Backend developers implementing email capture functionality, DevOps engineers setting up OAuth2 credentials, developers troubleshooting authentication or polling issues.

## When to Use This Guide

Use this guide when you need to:

- Set up Gmail API access for the first time
- Implement OAuth2 authentication flow in the capture system
- Add incremental polling with Gmail history API
- Debug authentication failures or cursor invalidation
- Understand token refresh mechanics
- Implement cursor bootstrap and recovery logic

**Related Features:** Email capture (`docs/features/capture/`), polling implementation (`docs/guides/guide-polling-implementation.md`)

## Prerequisites

**Required Knowledge:**

- OAuth2 authentication concepts (access tokens, refresh tokens)
- Gmail API basics (messages, history)
- SQLite database operations (for sync_state persistence)
- TypeScript/Node.js async patterns
- Error handling and retry strategies

**Required Tools:**

- Google Cloud Console account
- Gmail API enabled for project
- Node.js v20+ with `googleapis` library installed
- SQLite database with `sync_state` table

**Required Setup:**

- Google Cloud project with OAuth2 credentials configured
- Downloaded `credentials.json` from Google Cloud Console
- Environment variables: `GMAIL_CREDENTIALS_PATH`, `GMAIL_TOKEN_PATH`, `DB_PATH`

## Quick Reference

**Key Commands:**

```bash
# Initialize OAuth2 flow (first-time setup)
adhd capture email init

# Check authentication status
adhd capture email status

# Manually refresh token
adhd capture email refresh-token

# Revoke credentials
adhd capture email revoke

# Reset polling cursor
adhd capture email reset-cursor
```

**Critical Files:**

- `credentials.json` - OAuth2 client configuration (user-provided, mode 0600)
- `token.json` - Access/refresh tokens (system-managed, mode 0600)
- `sync_state` table - Polling cursor persistence (SQLite)

**Key Concepts:**

- **Access Token:** Short-lived (1 hour), used for API requests
- **Refresh Token:** Long-lived (indefinite), regenerates access tokens
- **History ID:** Gmail's cursor for incremental sync (opaque string)
- **Bootstrap:** Initial setup establishing first cursor position

## Step-by-Step Instructions

### Step 1: Configure Google Cloud Project

**Goal:** Enable Gmail API and create OAuth2 credentials

1. Navigate to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing project
3. Enable Gmail API:
   - Navigate to APIs & Services → Library
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth2 credentials:
   - Navigate to APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Desktop app"
   - Name: "ADHD Brain Capture"
   - Click "Create"
5. Download credentials:
   - Click "Download JSON" button
   - Save as `credentials.json`
   - Move to `~/.config/capture-bridge/credentials.json`
   - Set permissions: `chmod 600 ~/.config/capture-bridge/credentials.json`

**Expected Output:** `credentials.json` file with structure:

```json
{
  "installed": {
    "client_id": "1234567890-abcdefghijklmnop.apps.googleusercontent.com",
    "client_secret": "GOCSPX-abcdefghijklmnopqrst",
    "redirect_uris": ["http://localhost"],
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }
}
```

### Step 2: Initialize OAuth2 Authentication

**Goal:** Obtain initial access and refresh tokens

```bash
adhd capture email init
```

**Process:**

1. CLI generates authorization URL
2. Opens browser (or displays URL to copy)
3. User grants permissions (scope: `gmail.readonly`)
4. Google redirects with authorization code
5. CLI exchanges code for tokens
6. Tokens saved to `~/.config/capture-bridge/token.json` (mode 0600)

**Implementation:**

```typescript
import { google } from "googleapis"

async function authenticate(): Promise<AuthResult> {
  // 1. Load credentials
  const credentials = await loadCredentials(CREDENTIALS_PATH)

  // 2. Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris[0]
  )

  // 3. Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  })

  console.log("Authorize this app by visiting:", authUrl)

  // 4. Get authorization code from user
  const code = await getUserInputCode()

  // 5. Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(code)

  // 6. Save tokens securely
  await writeTokenSecurely(TOKEN_PATH, tokens)

  return { status: "authenticated", tokenPath: TOKEN_PATH }
}
```

**Expected Output:**

```
Authorize this app by visiting: https://accounts.google.com/o/oauth2/v2/auth?...
Enter the code from that page here: <user_input>
✓ Authentication successful
Token saved to: ~/.config/capture-bridge/token.json
```

### Step 3: Bootstrap Polling Cursor

**Goal:** Establish initial history ID without processing historical messages

```typescript
async function bootstrapCursor(): Promise<BootstrapResult> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client })

  // Fetch single message to get current historyId
  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 1,
  })

  const historyId = response.data.historyId!
  const messageCount = response.data.resultSizeEstimate || 0

  // Persist cursor in sync_state table
  await db.run(
    `INSERT OR REPLACE INTO sync_state (key, value, updated_at)
     VALUES ('gmail_history_id', ?, CURRENT_TIMESTAMP)`,
    [historyId]
  )

  console.log(
    `Bootstrap complete: historyId=${historyId}, messages=${messageCount}`
  )

  return {
    historyId,
    messageCount,
    cursor: { historyId, lastPollAt: new Date().toISOString() },
  }
}
```

**Why Skip Historical Messages:**

- Avoids processing thousands of old emails
- Establishes "from now on" capture boundary
- User can manually backfill if needed (future feature)

**Expected Database State:**

```sql
SELECT * FROM sync_state WHERE key = 'gmail_history_id';
-- Result: key='gmail_history_id', value='987654', updated_at='2025-09-27 10:30:00'
```

### Step 4: Implement Incremental Polling

**Goal:** Fetch new messages using history API

```typescript
async function pollIncrementally(): Promise<EmailPollResult> {
  // 1. Get current cursor
  const cursor = await db.get(
    `SELECT value FROM sync_state WHERE key = 'gmail_history_id'`
  )

  if (!cursor) {
    return await bootstrapCursor()
  }

  // 2. Fetch history since cursor
  const gmail = google.gmail({ version: "v1", auth: oauth2Client })
  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId: cursor.value,
  })

  // 3. Extract new message IDs
  const messageIds =
    history.data.history
      ?.flatMap((h) => h.messagesAdded || [])
      .map((ma) => ma.message!.id!)
      .filter(Boolean) || []

  // 4. Process each message
  const processed = []
  for (const messageId of messageIds) {
    const message = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    })

    // Check for duplicates
    const isDupe = await checkDuplicate(message)
    if (isDupe) continue

    // Stage capture
    await stageCapture(message)
    processed.push(messageId)
  }

  // 5. Update cursor
  const nextHistoryId = history.data.historyId!
  await db.run(
    `UPDATE sync_state
     SET value = ?, updated_at = CURRENT_TIMESTAMP
     WHERE key = 'gmail_history_id'`,
    [nextHistoryId]
  )

  return {
    messagesFound: messageIds.length,
    messagesProcessed: processed.length,
    duplicatesSkipped: messageIds.length - processed.length,
  }
}
```

### Step 5: Implement Automatic Token Refresh

**Goal:** Refresh access token before expiration

```typescript
function isTokenExpired(token: TokenInfo): boolean {
  const expiryDate = new Date(token.expiry_date)
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
  return expiryDate < fiveMinutesFromNow
}

async function ensureValidToken(): Promise<void> {
  const token = await loadToken(TOKEN_PATH)

  if (!isTokenExpired(token)) {
    return // Token still valid
  }

  try {
    // Refresh token
    const { tokens } = await oauth2Client.refreshAccessToken()

    // Atomic write to temp file, then rename
    const tmpPath = `${TOKEN_PATH}.tmp`
    await writeFile(tmpPath, JSON.stringify(tokens, null, 2), { mode: 0o600 })
    await rename(tmpPath, TOKEN_PATH)

    console.log("✓ Token refreshed successfully")
  } catch (error) {
    if (error.code === "invalid_grant") {
      console.error("❌ Refresh token revoked. Run: adhd capture email init")
      throw new AuthError("Refresh token invalid")
    }
    throw error
  }
}
```

## Common Patterns

### Pattern: Deduplication Check

**Use Case:** Prevent duplicate captures from same message

```typescript
async function isDuplicate(message: GmailMessage): Promise<boolean> {
  const messageId = extractMessageId(message)
  const contentHash = computeContentHash(message.body)

  // Primary check: message_id
  const byMessageId = await db.query(
    `SELECT id FROM captures
     WHERE source = 'email' AND json_extract(meta_json, '$.message_id') = ?`,
    [messageId]
  )

  if (byMessageId.length > 0) return true

  // Fallback: content_hash
  const byHash = await db.query(
    `SELECT id FROM captures WHERE content_hash = ?`,
    [contentHash]
  )

  return byHash.length > 0
}
```

### Pattern: Transactional Cursor Update

**Use Case:** Only advance cursor if all messages successfully staged

```typescript
async function processPollResults(
  messages: GmailMessage[],
  nextHistoryId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    // Stage all captures
    for (const message of messages) {
      await insertCapture(message, tx)
    }

    // Update cursor (only if all inserts succeeded)
    await tx.run(
      `UPDATE sync_state SET value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE key = 'gmail_history_id'`,
      [nextHistoryId]
    )
  })

  // Transaction commits atomically - all or nothing
}
```

### Anti-Pattern: Polling Too Frequently

**Problem:** Exceeds Gmail API quota, triggers rate limiting

**Solution:** Use conservative polling interval (60s default)

```typescript
// ❌ Bad: Poll every 5 seconds
setInterval(poll, 5000)

// ✅ Good: Poll every 60 seconds
setInterval(poll, 60000)
```

**Quota Math:**

```
Daily quota: 1 billion units
Read operation cost: 5 units per call

Polling interval: 60s
Polls per day: 1,440
API calls per day: ~8,640 (1 history + 5 message gets per poll avg)
Quota usage: 43,200 units/day (0.004% of quota)
```

## P0 Technical Details: Token Lifecycle & Error Taxonomy

### Token Lifecycle State Machine

```typescript
type TokenState = "valid" | "expiring_soon" | "expired" | "revoked"

interface TokenLifecycle {
  state: TokenState
  accessToken: string
  refreshToken: string
  expiryDate: Date
  lastRefreshAt?: Date
  refreshAttempts: number
}

// State transitions
function determineTokenState(token: TokenInfo): TokenState {
  if (!token.refresh_token) return "revoked"

  const now = Date.now()
  const expiry = new Date(token.expiry_date).getTime()
  const fiveMinutes = 5 * 60 * 1000

  if (expiry < now) return "expired"
  if (expiry - now < fiveMinutes) return "expiring_soon"
  return "valid"
}

// Refresh strategy based on state
async function refreshStrategy(state: TokenState): Promise<RefreshAction> {
  switch (state) {
    case "valid":
      return { action: "none", delayMs: 0 }
    case "expiring_soon":
      return { action: "refresh", delayMs: 0, priority: "high" }
    case "expired":
      return { action: "refresh", delayMs: 0, priority: "urgent" }
    case "revoked":
      return { action: "reauth_required", delayMs: 0, priority: "critical" }
  }
}
```

### Error Taxonomy & Handling

```typescript
enum GmailErrorType {
  // Authentication errors (permanent)
  AUTH_INVALID_GRANT = "auth.invalid_grant", // Refresh token revoked
  AUTH_INVALID_CLIENT = "auth.invalid_client", // Bad credentials.json
  AUTH_INVALID_REQUEST = "auth.invalid_request", // Malformed OAuth2 request

  // Rate limiting errors (transient)
  API_RATE_LIMITED = "api.rate_limited", // 429 Too Many Requests
  API_QUOTA_EXCEEDED = "api.quota_exceeded", // Daily quota exceeded

  // Cursor/sync errors (recoverable)
  CURSOR_INVALID = "cursor.invalid", // 404 historyId not found
  CURSOR_TOO_OLD = "cursor.too_old", // > 30 days gap

  // Transient API errors
  API_NETWORK_ERROR = "api.network_error", // Connection timeout
  API_SERVER_ERROR = "api.server_error", // 500/502/503

  // File system errors
  FILE_PERMISSION_ERROR = "file.permission_error", // token.json not writable
  FILE_PARSE_ERROR = "file.parse_error", // Corrupted JSON
}

interface ErrorHandlingStrategy {
  errorType: GmailErrorType
  retriable: boolean
  maxAttempts: number
  backoffMs: number[]
  escalation: EscalationAction
  userActionRequired: boolean
}

const ERROR_STRATEGIES: Record<GmailErrorType, ErrorHandlingStrategy> = {
  [GmailErrorType.AUTH_INVALID_GRANT]: {
    errorType: GmailErrorType.AUTH_INVALID_GRANT,
    retriable: false,
    maxAttempts: 0,
    backoffMs: [],
    escalation: "require_reauth",
    userActionRequired: true,
  },
  [GmailErrorType.API_RATE_LIMITED]: {
    errorType: GmailErrorType.API_RATE_LIMITED,
    retriable: true,
    maxAttempts: 5,
    backoffMs: [30_000, 60_000, 300_000, 900_000, 1_800_000], // 30s → 30min
    escalation: "circuit_breaker",
    userActionRequired: false,
  },
  [GmailErrorType.CURSOR_INVALID]: {
    errorType: GmailErrorType.CURSOR_INVALID,
    retriable: true,
    maxAttempts: 1,
    backoffMs: [0], // Immediate re-bootstrap
    escalation: "re_bootstrap_cursor",
    userActionRequired: false,
  },
  // ... other error types
}

// Error classification function
function classifyGmailError(error: any): GmailErrorType {
  // OAuth2 errors
  if (error.code === "invalid_grant") return GmailErrorType.AUTH_INVALID_GRANT
  if (error.code === "invalid_client") return GmailErrorType.AUTH_INVALID_CLIENT

  // HTTP status codes
  if (error.status === 429) return GmailErrorType.API_RATE_LIMITED
  if (error.status === 404 && error.message.includes("history")) {
    return GmailErrorType.CURSOR_INVALID
  }
  if (error.status >= 500) return GmailErrorType.API_SERVER_ERROR

  // File system errors
  if (error.code === "EACCES") return GmailErrorType.FILE_PERMISSION_ERROR
  if (error instanceof SyntaxError) return GmailErrorType.FILE_PARSE_ERROR

  // Network errors
  if (error.code === "ETIMEDOUT" || error.code === "ECONNREFUSED") {
    return GmailErrorType.API_NETWORK_ERROR
  }

  throw new UnclassifiedError(`Unknown Gmail error: ${error.message}`)
}
```

### Rate Limit Handling Contract

```typescript
interface RateLimitHandler {
  // Check if rate limit is active
  isRateLimited(): boolean

  // Record rate limit hit
  recordRateLimitHit(retryAfterSec?: number): void

  // Calculate next retry time
  getNextRetryAt(): Date | null

  // Reset rate limit state after success
  reset(): void
}

class ExponentialBackoffRateLimiter implements RateLimitHandler {
  private consecutiveHits = 0
  private lastHitAt?: Date
  private backoffSchedule = [30_000, 60_000, 300_000, 900_000, 1_800_000]

  isRateLimited(): boolean {
    if (!this.lastHitAt) return false

    const nextRetryAt = this.getNextRetryAt()
    return nextRetryAt !== null && nextRetryAt > new Date()
  }

  recordRateLimitHit(retryAfterSec?: number): void {
    this.consecutiveHits++
    this.lastHitAt = new Date()

    // If Gmail provides Retry-After header, use it
    if (retryAfterSec) {
      this.backoffSchedule[this.consecutiveHits - 1] = retryAfterSec * 1000
    }

    // Emit metric
    metrics.counter("gmail_rate_limit_hit_total", {
      consecutive_hits: this.consecutiveHits,
    })
  }

  getNextRetryAt(): Date | null {
    if (!this.lastHitAt) return null

    const index = Math.min(
      this.consecutiveHits - 1,
      this.backoffSchedule.length - 1
    )
    const backoffMs = this.backoffSchedule[index]

    // Add jitter (±30%)
    const jitter = Math.random() * 0.6 - 0.3
    const delayMs = backoffMs * (1 + jitter)

    return new Date(this.lastHitAt.getTime() + delayMs)
  }

  reset(): void {
    this.consecutiveHits = 0
    this.lastHitAt = undefined
  }
}
```

### Metrics Integration

See [Metrics Contract Tech Spec](../cross-cutting/spec-metrics-contract-tech.md) for complete metric definitions.

**Gmail-specific metrics:**

```typescript
// Token lifecycle metrics
metrics.gauge("gmail_token_expiry_seconds", expirySeconds)
metrics.counter("gmail_token_refresh_total", { result: "success" | "failure" })
metrics.duration("gmail_token_refresh_duration_ms", durationMs)

// Polling metrics
metrics.gauge("gmail_cursor_age_seconds", cursorAgeSeconds)
metrics.counter("gmail_poll_total", {
  result: "success" | "rate_limited" | "error",
})
metrics.histogram("gmail_messages_per_poll", messageCount)
metrics.duration("gmail_poll_duration_ms", durationMs)

// Error metrics
metrics.counter("gmail_error_total", { error_type: GmailErrorType })
metrics.counter("gmail_rate_limit_hit_total", { consecutive_hits: number })
metrics.counter("gmail_cursor_reset_total", { reason: "invalid" | "too_old" })

// Deduplication metrics
metrics.counter("gmail_duplicate_skipped_total", {
  match_type: "message_id" | "content_hash",
})
```

## Troubleshooting

### Error: `invalid_grant` (Refresh Token Revoked)

**Symptom:** Token refresh fails with 401 error

**Cause:** User revoked permissions or refresh token expired

**Solution:**

1. Check token status: `adhd capture email status`
2. Re-authorize: `adhd capture email init`
3. Grant permissions again in browser

**Prevention:** Monitor auth failures in health checks

### Error: 404 History Not Found (Cursor Invalidated)

**Symptom:** `gmail.users.history.list()` returns 404

**Cause:** History ID older than Gmail's retention window (~30 days)

**Solution:**

```typescript
async function handleInvalidCursor(): Promise<void> {
  logger.warn("Cursor invalidated - re-bootstrapping")

  // Re-bootstrap cursor
  const bootstrap = await bootstrapCursor()

  // Log reset event
  await db.run(
    `INSERT INTO sync_state (key, value)
     VALUES ('gmail_cursor_reset_at', ?)`,
    [new Date().toISOString()]
  )

  // Alert user (may have missed messages)
  console.warn("⚠️  Polling cursor reset. Check for missed messages.")
}
```

**Prevention:** Poll frequently (< 7 day gaps), monitor `gmail_last_poll` timestamp

### Error: 429 Rate Limited

**Symptom:** API calls fail with 429 status code

**Cause:** Polling too frequently or burst of API calls

**Solution:** Implement exponential backoff

```typescript
class ExponentialBackoff {
  private consecutiveErrors = 0
  private readonly schedule = [30_000, 60_000, 300_000, 900_000] // ms

  getBackoffMs(): number {
    const index = Math.min(this.consecutiveErrors, this.schedule.length - 1)
    const baseDelay = this.schedule[index]
    const jitter = Math.random() * 0.3 * baseDelay // ±30% jitter
    return baseDelay + jitter
  }

  recordError(): void {
    this.consecutiveErrors++
  }

  reset(): void {
    this.consecutiveErrors = 0
  }
}
```

### Error: Token File Permissions Insecure

**Symptom:** Warning logs about insecure permissions

**Cause:** `token.json` readable by other users

**Solution:**

```bash
chmod 600 ~/.config/capture-bridge/token.json
```

**Implementation:**

```typescript
async function writeTokenSecurely(
  path: string,
  token: TokenInfo
): Promise<void> {
  const tmpPath = `${path}.tmp`

  // Write with secure permissions
  await writeFile(tmpPath, JSON.stringify(token, null, 2), { mode: 0o600 })

  // Atomic rename
  await rename(tmpPath, path)

  // Verify permissions
  const stats = await stat(path)
  const mode = stats.mode & parseInt("777", 8)

  if (mode !== 0o600) {
    logger.warn(`Token file permissions insecure: ${mode.toString(8)}`)
  }
}
```

## Examples

### Example 1: Complete OAuth2 Setup Flow

```typescript
import { GmailAuthClient, GmailPollingClient } from "@capture-bridge/capture"

async function setupGmailCapture() {
  // Initialize auth client
  const authClient = new GmailAuthClient({
    credentialsPath: "~/.config/capture-bridge/credentials.json",
    tokenPath: "~/.config/capture-bridge/token.json",
  })

  // Check if already authenticated
  const isAuth = await authClient.isAuthenticated()

  if (!isAuth) {
    console.log("Not authenticated - starting OAuth flow...")
    await authClient.authenticate()
  }

  // Initialize polling client
  const pollingClient = new GmailPollingClient({
    authClient,
    db: new DatabaseClient(process.env.DB_PATH),
  })

  // Bootstrap cursor (if first run)
  const hasBootstrapped = await db.get(
    `SELECT value FROM sync_state WHERE key = 'gmail_history_id'`
  )

  if (!hasBootstrapped) {
    await pollingClient.bootstrap()
  }

  // Start polling
  setInterval(async () => {
    const result = await pollingClient.poll()
    console.log(`Processed ${result.messagesProcessed} emails`)
  }, 60000) // 60s interval
}
```

### Example 2: Health Check Implementation

```typescript
async function checkGmailHealth(): Promise<HealthStatus> {
  const authClient = new GmailAuthClient({
    /* ... */
  })

  // Check authentication
  const isAuth = await authClient.isAuthenticated()
  if (!isAuth) {
    return { status: "error", message: "Not authenticated" }
  }

  // Check token expiry
  const token = await loadToken(TOKEN_PATH)
  const expiresIn = new Date(token.expiry_date).getTime() - Date.now()
  const expiresInMin = Math.floor(expiresIn / 60000)

  // Check last poll timestamp
  const lastPoll = await db.get(
    `SELECT value FROM sync_state WHERE key = 'gmail_last_poll'`
  )

  if (!lastPoll) {
    return { status: "warning", message: "No polling history" }
  }

  const lastPollDate = new Date(lastPoll.value)
  const hoursSinceLastPoll = (Date.now() - lastPollDate.getTime()) / 3600000

  if (hoursSinceLastPoll > 24) {
    return {
      status: "error",
      message: `Last poll ${hoursSinceLastPoll.toFixed(1)} hours ago - cursor may be invalid`,
    }
  }

  return {
    status: "healthy",
    message: `Token expires in ${expiresInMin} minutes, last poll ${hoursSinceLastPoll.toFixed(1)} hours ago`,
  }
}
```

## TDD Applicability

**Risk Classification:** HIGH (authentication failures block entire email capture pipeline)

**TDD Decision:** **Required** for token lifecycle and error taxonomy

**Rationale:**

- OAuth2 token refresh failures cascade to all email capture operations
- Rate limit handling requires precise backoff calculation to prevent quota exhaustion
- Token expiry detection must be deterministic to avoid authentication failures
- Error classification determines retry strategy (transient vs permanent failures)

**Scope Under TDD:**

**Unit Tests Required:**

- Token expiry detection (`isTokenExpired()`)
- Rate limit backoff calculation with jitter
- Error classification mapping (401 → `AUTH_INVALID_GRANT`, 429 → `API_RATE_LIMITED`)
- Token file permission validation (0600 enforcement)
- Cursor invalidation detection (404 → re-bootstrap)

**Integration Tests Required:**

- OAuth2 flow with mocked Google endpoints
- Token refresh cycle (access token → refresh → new access token)
- Cursor persistence in `sync_state` table
- History API polling with cursor advancement
- Deduplication checks against `captures` table

**Contract Tests Required:**

- Gmail API error responses (401, 404, 429) mapped to internal error types
- Token JSON format compatibility (credentials.json, token.json)
- History API response structure (historyId, messagesAdded)

**Out of Scope (YAGNI):**

- OAuth2 PKCE flow (desktop app only, not required by Gmail)
- Multi-account support (MPPP single-user only)
- Token rotation strategies beyond refresh (no complex key management needed)

**Testing Trigger to Revisit:**

- Production incidents related to auth failures > 1/month
- Gmail API quota changes requiring new rate limit strategies
- Multi-account support planned for Phase 2+

For testing patterns and utilities, see:

- [TDD Applicability Guide](./guide-tdd-applicability.md) - Risk-based testing framework
- [Test Strategy Guide](./guide-test-strategy.md) - Testing approach
- [TestKit Usage Guide](./guide-testkit.md) - Testing utilities

## Related Documentation

**PRDs (Product Requirements):**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System-wide email capture requirements
- [Capture Feature PRD](../features/capture/prd-capture.md) - Email capture requirements
- [Staging Ledger PRD](../features/staging-ledger/prd-staging.md) - Sync state persistence
- [CLI Feature PRD](../features/cli/prd-cli.md) - CLI integration for email commands

**Feature Specifications:**

- [Capture Architecture Spec](../features/capture/spec-capture-arch.md) - Email capture design
- [Capture Tech Spec](../features/capture/spec-capture-tech.md) - Email polling implementation
- [Capture Test Spec](../features/capture/spec-capture-test.md) - Email polling tests
- [Staging Ledger Tech Spec](../features/staging-ledger/spec-staging-tech.md) - Cursor persistence
- [CLI Tech Spec](../features/cli/spec-cli-tech.md) - Email command integration

**Cross-Cutting Specifications:**

- [Metrics Contract Tech Spec](../cross-cutting/spec-metrics-contract-tech.md) - Telemetry integration
- [Direct Export Pattern Tech Spec](../cross-cutting/spec-direct-export-tech.md) - Export behavior

**Guides (How-To):**

- [Polling Implementation Guide](./guide-polling-implementation.md) - Sequential polling patterns
- [Error Recovery Guide](./guide-error-recovery.md) - OAuth2 token refresh errors
- [TDD Applicability Guide](./guide-tdd-applicability.md) - Risk-based testing framework
- [Test Strategy Guide](./guide-test-strategy.md) - Testing approach
- [Capture Debugging Guide](./guide-capture-debugging.md) - Email polling debugging

**ADRs (Architecture Decisions):**

- [ADR-0002: Dual Hash Migration](../adr/0002-dual-hash-migration.md) - Deduplication strategy
- [ADR-0007: Sequential Processing Model](../adr/0008-sequential-processing-mppp.md) - Email polling concurrency

**External Resources:**

- [Gmail API Reference](https://developers.google.com/gmail/api/reference/rest)
- [OAuth2 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Gmail History API Guide](https://developers.google.com/gmail/api/guides/sync)

## Maintenance Notes

**When to Update:**

- Gmail API version changes (currently v1)
- OAuth2 flow changes (new scopes, PKCE requirements)
- Token security best practices evolve
- Quota limits change (currently 1 billion units/day)

**Known Limitations:**

- Single user only (no multi-account support in MPPP)
- English-only email processing
- No label filtering (processes all messages)
- No attachment handling (metadata only)
- No OAuth2 PKCE flow (desktop app only)

**Future Enhancements:**

- Historical backfill command (`adhd capture email backfill --days=30`)
- Label filtering (`GMAIL_LABEL_FILTER=INBOX,IMPORTANT`)
- Attachment download support
- Multi-account support
- Webhook mode (push notifications instead of polling)
