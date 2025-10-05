# Task Context: SQLITE_SCHEMA--T01

## Task Overview

**Task ID**: SQLITE_SCHEMA--T01
**Capability**: SQLITE_SCHEMA
**Phase**: Phase 1 - Core Ingestion
**Risk Level**: High (TDD Required per ADR-0012)
**Status**: in-progress

## Acceptance Criteria

### AC01: All 4 tables created with correct schema
**ID**: SQLITE_SCHEMA-AC01

Create exactly 4 tables per ADR-0003 (Four-Table Hard Cap):
1. `captures` - Ephemeral staging with processing state
2. `exports_audit` - Immutable export audit trail
3. `errors_log` - Failure tracking and diagnostics
4. `sync_state` - Poll cursors and checkpoints

**Schema Details**: See spec-staging-tech.md § 2.1 lines 225-331

### AC02: Foreign key constraints enforced
**ID**: SQLITE_SCHEMA-AC02

Enforce referential integrity:
- `exports_audit.capture_id` → `captures.id` (ON DELETE CASCADE)
- `errors_log.capture_id` → `captures.id` (ON DELETE SET NULL, nullable)

Foreign keys must be enabled: `PRAGMA foreign_keys = ON;`

### AC03: Indexes created
**ID**: SQLITE_SCHEMA-AC03

Create all required indexes:
1. **Unique Indexes**:
   - `captures_content_hash_idx` ON `captures(content_hash)` - NULL safe
   - `captures_channel_native_uid` ON `captures(json_extract(meta_json, '$.channel'), json_extract(meta_json, '$.channel_native_id'))`

2. **Performance Indexes**:
   - `captures_status_idx` ON `captures(status)` - Recovery queries
   - `captures_created_at_idx` ON `captures(created_at)` - Time ordering
   - `exports_audit_capture_idx` ON `exports_audit(capture_id)` - Audit lookups
   - `errors_log_stage_idx` ON `errors_log(stage)` - Error grouping
   - `errors_log_created_at_idx` ON `errors_log(created_at)` - Time queries

## Related Specifications

### Primary Specs
- **spec-staging-arch.md**: Architecture overview (§3.1-3.2 Component Model)
- **spec-staging-tech.md**: Complete schema (§2.1 lines 225-331), PRAGMAs (§2.2 lines 336-353)

### Related ADRs
- **ADR-0003**: Four-Table Hard Cap (exactly 4 tables, no more)
- **ADR-0004**: Status-Driven State Machine (6 valid states)
- **ADR-0005**: WAL Mode with NORMAL Synchronous (PRAGMAs)

## Testing Pattern

### Pattern Source
**Guide**: `.claude/rules/testkit-tdd-guide.md`
**Section**: SQLite Testing Patterns (lines 141-289)

### TestKit APIs to Use
```typescript
// Database creation
import { createMemoryUrl } from '@orchestr8/testkit/sqlite'
const Database = (await import('better-sqlite3')).default

// In-memory testing
const db = new Database(createMemoryUrl())
databases.push(db) // Track for cleanup

// Migrations (if using applyMigrations helper)
import { applyMigrations } from '@orchestr8/testkit/sqlite'
await applyMigrations(db, migrations)
```

### Critical Cleanup Sequence
**Source**: testkit-tdd-guide.md lines 60-118

```typescript
afterEach(async () => {
  // 1. Drain pools FIRST (if any)
  for (const pool of pools) {
    try {
      await pool.drain()
    } catch (error) {
      console.warn('Pool drain error (non-critical):', error)
    }
  }
  pools = []

  // 2. Close databases SECOND
  for (const database of databases) {
    try {
      if (database.open && !database.readonly) {
        database.close()
      }
    } catch (error) {
      // Ignore close errors
    }
  }
  databases.length = 0

  // 3. Cleanup filesystem THIRD (if using file DBs)
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch (error) {
    // Ignore cleanup errors
  }

  // 4. Force GC LAST
  if (global.gc) {
    global.gc()
  }
})
```

### Security Testing Requirements
**Source**: testkit-tdd-guide.md lines 487-578

**MUST test**:
- SQL injection prevention via parameterized queries
- Path traversal prevention (if file paths used)
- No string concatenation in SQL

**Example**:
```typescript
it('should prevent SQL injection via prepared statements', async () => {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE captures (...)')

  const maliciousInput = "'; DROP TABLE captures; --"

  // ✅ SAFE: Parameterized query
  const stmt = db.prepare('SELECT * FROM captures WHERE id = ?')
  const result = stmt.get(maliciousInput)

  expect(result).toBeUndefined() // Not found, not executed
})
```

## Complete Schema Reference

### Table 1: captures
```sql
CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,                     -- ULID (time-orderable)
    source TEXT NOT NULL CHECK (source IN ('voice', 'email')),
    raw_content TEXT NOT NULL,
    content_hash TEXT,                       -- SHA-256 hex (64 chars, nullable until transcription)
    status TEXT NOT NULL CHECK (status IN (
        'staged',
        'transcribed',
        'failed_transcription',
        'exported',
        'exported_duplicate',
        'exported_placeholder'
    )),
    meta_json TEXT NOT NULL,                 -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table 2: exports_audit
```sql
CREATE TABLE IF NOT EXISTS exports_audit (
    id TEXT PRIMARY KEY,                     -- ULID
    capture_id TEXT NOT NULL,
    vault_path TEXT NOT NULL,                -- inbox/<ulid>.md
    hash_at_export TEXT,                     -- SHA-256 or NULL for placeholder
    exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    mode TEXT NOT NULL CHECK (mode IN (
        'initial',
        'duplicate_skip',
        'placeholder'
    )),
    error_flag INTEGER DEFAULT 0 CHECK (error_flag IN (0, 1)),

    FOREIGN KEY (capture_id) REFERENCES captures(id)
        ON DELETE CASCADE
);
```

### Table 3: errors_log
```sql
CREATE TABLE IF NOT EXISTS errors_log (
    id TEXT PRIMARY KEY,                     -- ULID
    capture_id TEXT,                         -- Nullable for system-level errors
    stage TEXT NOT NULL CHECK (stage IN (
        'poll',
        'transcribe',
        'export',
        'backup',
        'integrity'
    )),
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (capture_id) REFERENCES captures(id)
        ON DELETE SET NULL
);
```

### Table 4: sync_state
```sql
CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,                    -- e.g. 'gmail_history_id'
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### All Indexes
```sql
-- Unique content hash (NULL values ignored by SQLite)
CREATE UNIQUE INDEX IF NOT EXISTS captures_content_hash_idx
    ON captures(content_hash);

-- Prevent duplicate staging of same physical/logical item
CREATE UNIQUE INDEX IF NOT EXISTS captures_channel_native_uid
    ON captures(
        json_extract(meta_json, '$.channel'),
        json_extract(meta_json, '$.channel_native_id')
    );

-- Fast status filtering for pending exports
CREATE INDEX IF NOT EXISTS captures_status_idx
    ON captures(status);

-- Fast created_at ordering for recovery query
CREATE INDEX IF NOT EXISTS captures_created_at_idx
    ON captures(created_at);

-- Fast lookup by capture_id
CREATE INDEX IF NOT EXISTS exports_audit_capture_idx
    ON exports_audit(capture_id);

-- Fast grouping by stage
CREATE INDEX IF NOT EXISTS errors_log_stage_idx
    ON errors_log(stage);

-- Fast time-based queries (last 24h)
CREATE INDEX IF NOT EXISTS errors_log_created_at_idx
    ON errors_log(created_at);
```

### PRAGMAs
```sql
PRAGMA journal_mode = WAL;                   -- Write-ahead logging
PRAGMA synchronous = NORMAL;                 -- Balance safety/performance
PRAGMA foreign_keys = ON;                    -- Referential integrity
PRAGMA busy_timeout = 5000;                  -- Handle burst captures
PRAGMA wal_autocheckpoint = 1000;            -- Checkpoint every 1000 pages
PRAGMA cache_size = -2000;                   -- 2MB cache
PRAGMA temp_store = MEMORY;                  -- Temp tables in RAM
```

## Package Structure

**Package**: `packages/storage` (new package)

**Directory Structure**:
```
packages/storage/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── schema/
│   │   ├── migrations.ts       # Migration runner
│   │   └── 0001_init.sql      # Initial schema SQL
│   └── __tests__/
│       └── sqlite-schema.test.ts
└── test-setup.ts
```

## TDD Implementation Order

### Phase 1: RED - Write Failing Tests for AC01 (4 Tables)
1. Test: `captures` table exists with all columns
2. Test: `exports_audit` table exists with all columns
3. Test: `errors_log` table exists with all columns
4. Test: `sync_state` table exists with all columns
5. Test: All CHECK constraints enforced
6. Test: Default values work correctly

### Phase 2: GREEN - Minimal Implementation
1. Create SQL migration file with all 4 tables
2. Create migration runner that applies schema
3. Run tests → All pass

### Phase 3: REFACTOR - Clean up implementation
1. Extract SQL to separate file for maintainability
2. Add TypeScript types for schema validation
3. Ensure all tests still pass

### Phase 4: RED - Write Failing Tests for AC02 (Foreign Keys)
1. Test: Foreign key from exports_audit to captures enforced
2. Test: ON DELETE CASCADE works (delete capture → audit deleted)
3. Test: Foreign key from errors_log to captures enforced
4. Test: ON DELETE SET NULL works (delete capture → error.capture_id = NULL)
5. Test: PRAGMA foreign_keys = ON is set

### Phase 5: GREEN - Add Foreign Key Constraints
1. Add PRAGMA foreign_keys = ON to schema
2. Ensure CASCADE/SET NULL defined correctly
3. Run tests → All pass

### Phase 6: RED - Write Failing Tests for AC03 (Indexes)
1. Test: Unique index on content_hash exists
2. Test: Duplicate content_hash rejected (NULL safe)
3. Test: Composite unique index on (channel, channel_native_id) exists
4. Test: Duplicate channel_native_id rejected
5. Test: Performance indexes exist (status, created_at, etc.)
6. Test: Query performance within targets

### Phase 7: GREEN - Add All Indexes
1. Add all index CREATE statements to schema
2. Run tests → All pass

### Phase 8: REFACTOR - Final cleanup
1. Verify schema matches spec exactly
2. Add comprehensive comments
3. Ensure all tests pass
4. Check security tests included

## Success Criteria

**All tests pass with**:
- ✅ 4 tables created exactly (no more, no less)
- ✅ All columns match spec definitions
- ✅ All CHECK constraints enforced
- ✅ Foreign keys enforced (CASCADE and SET NULL)
- ✅ All indexes created and functional
- ✅ Unique constraints prevent duplicates
- ✅ NULL-safe unique index on content_hash
- ✅ Composite unique index on (channel, channel_native_id)
- ✅ Security tests passing (SQL injection prevention)
- ✅ Cleanup sequence correct (no resource leaks)

## Completion Checklist

- [ ] All AC01 tests passing (4 tables with correct schema)
- [ ] All AC02 tests passing (foreign key constraints)
- [ ] All AC03 tests passing (all indexes functional)
- [ ] Security tests included and passing
- [ ] No resource leaks in tests (cleanup sequence correct)
- [ ] Test coverage > 90% for schema code
- [ ] All tests use dynamic imports
- [ ] All tests track databases in cleanup array
- [ ] Documentation comments added to schema

## Expected Deliverables

1. **Migration File**: `packages/storage/src/schema/0001_init.sql`
2. **Migration Runner**: `packages/storage/src/schema/migrations.ts`
3. **Test Suite**: `packages/storage/src/__tests__/sqlite-schema.test.ts`
4. **Test Setup**: `packages/storage/test-setup.ts`
5. **Package Config**: `packages/storage/package.json`, `tsconfig.json`, `vitest.config.ts`

---

**Ready for wallaby-tdd-agent execution following strict RED-GREEN-REFACTOR cycles**
