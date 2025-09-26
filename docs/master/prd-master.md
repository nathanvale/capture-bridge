# Master PRD v2.2: ADHD Capture Bridge for Obsidian

_Status: source of truth • Directionality: one-way (staging → Obsidian)_

## 1. Executive Summary

### Product Vision
Build a **zero-friction capture layer** with a **durable staging ledger** that bridges the gap between ADHD thoughts and Obsidian's PARA-organized vault, ensuring no thought is lost and organization is automatic.

### Core Insight
Obsidian excels at knowledge management but fails at rapid capture. This system provides Obsidian's missing capture layer with a **SQLite staging ledger** for durability, deduplication, and inbox management, while keeping Obsidian markdown as the canonical knowledge store.

### Success Metric
**One Number:** Time from thought to safely staged < 3 seconds, to filed Obsidian note < 10 seconds, with zero data loss.

## 2. Problem Definition

### The ADHD-Obsidian Paradox
- **Obsidian's Strength:** Perfect for organizing knowledge with PARA method
- **Obsidian's Weakness:** No capture durability, requires conscious filing decisions
- **ADHD Reality:** Thoughts evaporate during app switching, crashes lose everything
- **Current Workarounds:** Multiple capture apps → sync conflicts, lost thoughts, abandoned tools

### The Durability Gap
Current capture tools either:
1. **Write directly to Obsidian:** Risk corruption, conflicts, partial writes
2. **Use separate databases:** Become parallel knowledge systems (scope creep)
3. **Use cloud services:** Privacy concerns, network dependency

Our solution: **Minimal SQLite staging** - just enough database for safety, not enough to become a second brain.

### Failure Modes We're Preventing
1. **Capture Loss:** App crash, Obsidian sync conflict, interrupted writes
2. **Duplicate Anxiety:** "Did I already capture this?" → duplicate notes everywhere
3. **Inbox Blindness:** Can't query unfiled items efficiently
4. **Vault Corruption:** Partial writes, sync conflicts, race conditions

## 3. User Persona

### Primary: Nathan (You)
- **Context:** Software engineer with ADHD, existing Obsidian PARA vault
- **Pain Points:** Lost thoughts during crashes, duplicate captures, inbox overwhelm
- **Capture Patterns:** Burst capture (multiple thoughts rapidly), interrupt-heavy environment
- **Technical Comfort:** High—comfortable with SQLite, understands transactions
- **Privacy Requirement:** Absolute—local-first, no external dependencies

### Secondary: ADHD Knowledge Workers
- **Context:** Researchers, writers, engineers using Obsidian + PARA
- **Shared Needs:** Capture durability, automatic deduplication, fast inbox processing
- **Variable:** Technical expertise, existing vault structure

## 4. Core Architecture

### 4.1 Three-Layer Architecture

```
┌──────────────────────────────┐
│     Input Layer              │ Voice / Web / Email / Text
├──────────────────────────────┤
│   SQLite Staging Ledger      │ ← Durability + Deduplication
│   ┌────────────────────┐     │
│   │ captures table     │     │ ULID, content_hash, raw_content
│   │ outbox table       │     │ Pending vault writes
│   │ audit_log table    │     │ Minimal forever record
│   └────────────────────┘     │
├──────────────────────────────┤
│   Processing Pipeline        │ PARA classify, enhance, route
├──────────────────────────────┤
│   Obsidian Vault            │ Canonical markdown storage
└──────────────────────────────┘
```

### 4.2 SQLite Staging Ledger Design

#### Purpose & Constraints
- **Durability:** Survive crashes, never lose captures
- **Idempotency:** Content hash prevents duplicate vault writes
- **Inbox Queries:** Fast SQL instead of vault scanning
- **Scope Limit:** ~5 tables maximum, not a knowledge graph
- **Retention:** Audit log forever (minimal), captures until filed

#### Core Tables
```sql
-- Incoming captures (temporary staging)
CREATE TABLE captures (
    id TEXT PRIMARY KEY,           -- ULID for time-ordering
    content_hash TEXT UNIQUE,       -- SHA-256 of content + attachments
    raw_content TEXT NOT NULL,
    metadata JSON,
    capture_time DATETIME,
    source TEXT,                    -- 'voice' | 'web' | 'email' | 'text'
    status TEXT,                    -- 'staged' | 'processing' | 'filed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Outbox for vault writes (ensures delivery)
CREATE TABLE outbox (
    id TEXT PRIMARY KEY,
    capture_id TEXT,
    vault_path TEXT,
    markdown_content TEXT,
    frontmatter JSON,
    retry_count INTEGER DEFAULT 0,
    next_retry_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (capture_id) REFERENCES captures(id)
);

-- Permanent audit trail (minimal)
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    capture_id TEXT,
    content_hash TEXT,
    filed_path TEXT,
    filed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 Content Hash Strategy

#### Hash Normalization
```typescript
interface HashableContent {
  text: string;           // Normalized (trimmed, consistent line endings)
  attachments: Array<{
    name: string;
    size: number;
    hash: string;         // Individual file hash
  }>;
  
  computeHash(): string { 
    // Deterministic hash including all attachments
    const normalized = normalizeText(this.text);
    const attachmentHashes = this.attachments
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => a.hash)
      .join('');
    return sha256(normalized + attachmentHashes);
  }
}
```

### 4.4 Capture Flow with Staging

```
1. Input → Immediate SQLite write (< 100ms)
   - Generate ULID
   - Calculate content hash
   - Store raw content
   - Return success to user

2. Background processing (async)
   - PARA classification
   - Enhancement (dates, projects)
   - Queue to outbox

3. Outbox processor (polling/event)
   - Atomic temp file write
   - Rename to final location
   - Handle conflicts (timestamped siblings)
   - Update audit log
   - Clean up staged capture
```

## 5. Functional Requirements

### 5.1 Capture Channels

#### Voice Capture (Primary)
- **Activation:** Global hotkey (Cmd+Shift+Space)
- **Stage 1:** Buffer audio → SQLite immediately
- **Stage 2:** Async transcription via Whisper
- **Stage 3:** Process → Outbox → Vault
- **Durability:** Audio saved even if transcription fails

#### Web Clipper
- **Activation:** Browser extension/bookmarklet
- **Stage 1:** URL + selection → SQLite
- **Stage 2:** Async Readability extraction
- **Stage 3:** Enhanced markdown → Vault
- **Durability:** URL saved even if extraction fails

#### Quick Text
- **Activation:** Global hotkey (Cmd+Shift+N)
- **Immediate:** Text → SQLite with timestamp
- **Processing:** Natural language parsing
- **Filing:** Smart PARA routing

#### Email Forward
- **Activation:** Forward to capture@localhost
- **Stage 1:** Raw email → SQLite
- **Stage 2:** Parse sender, subject, body
- **Stage 3:** Attachments → vault folder
- **Durability:** Complete email preserved

### 5.2 Deduplication Logic

```typescript
interface DeduplicationStrategy {
  checkDuplicate(content: HashableContent): boolean {
    // Query SQLite for existing hash
    const existing = db.query(
      'SELECT id FROM captures WHERE content_hash = ?',
      [content.computeHash()]
    );
    
    if (existing) {
      // Update metadata, don't create duplicate
      return true;
    }
    return false;
  }
}
```

### 5.3 Inbox Management

#### Efficient Inbox Queries
```sql
-- Fast inbox view without vault scanning
SELECT 
  id, 
  raw_content,
  capture_time,
  source,
  suggested_path
FROM captures 
WHERE status = 'staged'
ORDER BY capture_time DESC;
```

#### Batch Processing Interface
- **Keyboard-driven:** j/k navigation, f to file, i to ignore
- **Bulk operations:** Select multiple, apply same classification
- **Smart suggestions:** Based on content similarity
- **Quick preview:** See full content before filing

### 5.4 Conflict Resolution

#### Automatic Sibling Creation
```typescript
interface ConflictResolver {
  handleConflict(targetPath: string): string {
    // Always create timestamped sibling (v2.2 decision)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(targetPath);
    const base = path.basename(targetPath, ext);
    const dir = path.dirname(targetPath);
    
    return path.join(dir, `${base}-${timestamp}${ext}`);
    // Example: "note.md" → "note-2024-11-15T10-30-45.md"
  }
}
```

## 6. Non-Functional Requirements

### 6.1 Performance Targets

| Operation | Target | Measurement |
|-----------|---------|------------|
| Capture → SQLite | < 100ms | Time to hash + insert |
| SQLite → Outbox | < 500ms | Classification time |
| Outbox → Vault | < 1s | File write time |
| Inbox Query | < 50ms | 1000 items |
| Duplicate Check | < 10ms | Hash lookup |

### 6.2 Reliability Requirements

| Aspect | Requirement | Implementation |
|--------|-------------|----------------|
| Durability | 100% capture retention | Write-ahead log in SQLite |
| Idempotency | Zero duplicate files | Content hash checking |
| Atomicity | No partial writes | Temp file + rename pattern |
| Recovery | Auto-resume on crash | Outbox retry mechanism |
| Backup | Hourly SQLite backup | Automated .backup command |

### 6.3 Storage Constraints

```yaml
SQLite Size Limits:
  captures: Max 10,000 unfiled (then force review)
  outbox: Max 1,000 pending (then pause capture)
  audit_log: Trim to hash + path after 90 days
  total_size: Warn at 100MB, hard limit 500MB

Attachment Handling:
  max_size: 25MB per file
  storage: File system reference, not BLOB
  cleanup: Remove orphaned after vault write
```

## 7. User Workflows

### Workflow 1: Burst Capture (ADHD Pattern)
```
1. Series of rapid thoughts
2. Cmd+Shift+Space repeatedly
3. Each immediately saved to SQLite
4. Deduplication prevents repeats
5. Background processing queues all
6. Obsidian updated when ready
7. Zero thoughts lost
```

### Workflow 2: Crash Recovery
```
1. Mid-capture, app crashes
2. Restart application
3. Check outbox table for pending
4. Resume processing automatically
5. User notification: "Recovered 3 captures"
6. Continue where left off
```

### Workflow 3: Daily Inbox Zero
```
1. Morning notification: "12 unfiled items"
2. Open inbox interface
3. SQL query shows staged captures
4. Review with keyboard shortcuts
5. Batch file to PARA folders
6. Audit log preserves record
```

## 8. PARA Integration

### Classification with Staging

```typescript
interface PARAProcessor {
  async processCapture(capture: Capture): Promise<VaultTarget> {
    // Run classification
    const category = await this.classify(capture.raw_content);
    
    // Queue to outbox with suggested path
    const outboxItem = {
      capture_id: capture.id,
      vault_path: this.generatePath(category),
      markdown_content: this.enhance(capture.raw_content),
      frontmatter: this.generateFrontmatter(capture)
    };
    
    await db.insert('outbox', outboxItem);
    
    return outboxItem;
  }
}
```

### Daily Note Integration
```typescript
// Append to daily note + create standalone note
async function fileToVault(outboxItem: OutboxItem) {
  // 1. Write main note
  await atomicWrite(outboxItem.vault_path, outboxItem.markdown_content);
  
  // 2. Append reference to daily note
  const dailyNote = getDailyNotePath();
  const reference = `- [[${outboxItem.vault_path}]] (${timestamp})`;
  await appendToFile(dailyNote, reference);
  
  // 3. Update audit log
  await db.insert('audit_log', {
    capture_id: outboxItem.capture_id,
    filed_path: outboxItem.vault_path
  });
}
```

## 9. Testing Strategy (TDD Required)

### Critical Test Coverage

```typescript
describe('Staging Ledger Integrity', () => {
  test('content hash is deterministic', () => {
    const content = { text: 'Hello', attachments: [] };
    const hash1 = computeHash(content);
    const hash2 = computeHash(content);
    expect(hash1).toBe(hash2);
  });
  
  test('duplicate captures are rejected', async () => {
    await capture('Same thought');
    await capture('Same thought');
    const count = await db.count('captures');
    expect(count).toBe(1);
  });
  
  test('outbox replay is idempotent', async () => {
    const item = await db.getOutboxItem();
    await processOutboxItem(item);
    await processOutboxItem(item); // Replay
    const files = await countVaultFiles();
    expect(files).toBe(1); // Not 2
  });
  
  test('conflicts create siblings', async () => {
    await writeToVault('note.md', 'Content 1');
    await writeToVault('note.md', 'Content 2');
    const files = await getVaultFiles();
    expect(files).toContain('note.md');
    expect(files).toMatch(/note-\d{4}-\d{2}-\d{2}/);
  });
});
```

### Test Categories by Risk

| Priority | Category | Coverage Target |
|----------|----------|-----------------|
| P0 - Required | Data integrity | 100% |
| P0 - Required | Deduplication | 100% |
| P0 - Required | Atomic writes | 100% |
| P1 - Recommended | Classification | 80% |
| P2 - Optional | UI components | 60% |

## 10. Risk Analysis & Mitigation

### Technical Risks (Mitigated by Staging)

| Risk | Impact | Mitigation via Staging |
|------|--------|------------------------|
| Capture loss | Catastrophic → **Solved** | SQLite durability |
| Duplicate files | High frustration → **Solved** | Content hash dedup |
| Vault corruption | Data loss → **Solved** | Atomic writes via outbox |
| Sync conflicts | Confusion → **Managed** | Timestamp siblings |
| Inbox overwhelm | Abandonment → **Solved** | SQL queries |

### Remaining Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite corruption | Low (single file) | Hourly backups |
| Hash collisions | Extremely low | SHA-256 sufficient |
| Storage growth | Medium | Cleanup policies |
| Performance degradation | Low | Index optimization |

## 11. Implementation Roadmap

### Phase 1: Foundation + Staging (Weeks 1-2)
- [x] SQLite schema design ← **Complete in PRD**
- [ ] Content hash implementation
- [ ] Basic capture → staging flow
- [ ] Outbox processor
- [ ] Atomic file writes

### Phase 2: Obsidian Bridge (Weeks 3-4)
- [ ] Vault connector
- [ ] Daily note detection
- [ ] PARA folder mapping
- [ ] Conflict resolution
- [ ] Audit logging

### Phase 3: Voice First (Weeks 5-6)
- [ ] Audio capture
- [ ] Whisper integration
- [ ] Transcription pipeline
- [ ] Natural language parsing
- [ ] Voice → Staging → Vault

### Phase 4: Intelligence (Weeks 7-8)
- [ ] PARA classifier
- [ ] Inbox query interface
- [ ] Batch processing UI
- [ ] Smart suggestions
- [ ] Deduplication UI

### Phase 5: Enhancement (Weeks 9-10)
- [ ] Web clipper
- [ ] Email bridge
- [ ] Attachment handling
- [ ] Performance optimization
- [ ] Beta release

## 12. Success Criteria

### MVP Definition (Week 4)
- [ ] SQLite staging operational
- [ ] Zero capture loss demonstrated
- [ ] Deduplication working
- [ ] Basic vault writing
- [ ] Audit trail complete

### Beta Ready (Week 8)
- [ ] All capture channels active
- [ ] Inbox processing < 5 min/day
- [ ] 99.9% durability proven
- [ ] Performance targets met
- [ ] 7 days without data loss

### v1.0 Launch (Week 10)
- [ ] 30 days personal usage
- [ ] 5000+ deduplicated captures
- [ ] Zero vault corruption events
- [ ] Documentation complete
- [ ] Open source ready

## 13. Architecture Decisions Record

### Decision: SQLite Staging Ledger
- **Status:** Decided
- **Why:** Durability, deduplication, efficient inbox queries
- **Alternatives Rejected:** 
  - Direct vault writes (corruption risk)
  - Full database (scope creep)
  - Cloud service (privacy violation)
- **Consequences:** Small complexity increase, massive reliability gain

### Decision: Content Hash Deduplication  
- **Status:** Decided
- **Why:** Prevent duplicate files, reduce anxiety
- **Implementation:** SHA-256 of normalized text + attachments
- **Trade-off:** Small compute cost for peace of mind

### Decision: Automatic Conflict Resolution
- **Status:** Decided (v2.2)
- **Why:** Don't interrupt flow for conflicts
- **Implementation:** Always create timestamped siblings
- **Future:** Optional review UI (not v1)

## 14. Constraints & YAGNI Boundaries

### What We're Building
✅ Minimal staging ledger for durability  
✅ Content deduplication  
✅ Efficient inbox queries  
✅ Atomic vault writes  
✅ Audit trail

### What We're NOT Building
❌ Full-text search in SQLite (Obsidian has this)  
❌ Knowledge graph in database  
❌ Sync between devices  
❌ Version control  
❌ Collaboration features  
❌ Analytics/metrics  
❌ Complex schemas (5 tables max)

### Storage Boundaries
```yaml
SQLite scope:
  - Temporary staging only
  - Minimal audit records
  - No permanent content storage
  - No embeddings/vectors
  - No full-text indexes

Obsidian remains:
  - Canonical knowledge store
  - Search provider
  - Graph builder
  - Sync manager
```

## 15. Open Questions → Decisions

### Resolved in v2.2
- ✅ **Conflict policy:** Automatic timestamped siblings
- ✅ **Staging scope:** Minimal tables, not knowledge base
- ✅ **Hash algorithm:** SHA-256 (sufficient, standard)
- ✅ **Retention policy:** Audit log forever (minimal), captures until filed

### Remaining for Tech Specs
1. **Attachment storage:** BLOB vs file system reference?
2. **Outbox processing:** Poll interval vs event-driven?
3. **Backup strategy:** Frequency and retention?
4. **Migration approach:** Schema versioning strategy?

## 16. Appendix: SQLite Query Examples

### Common Inbox Queries
```sql
-- Unfiled items by age
SELECT * FROM captures 
WHERE status = 'staged'
ORDER BY capture_time ASC;

-- Today's captures
SELECT * FROM captures
WHERE DATE(capture_time) = DATE('now', 'localtime');

-- Duplicate check
SELECT content_hash, COUNT(*) as count
FROM captures
GROUP BY content_hash
HAVING count > 1;

-- Outbox retry queue
SELECT * FROM outbox
WHERE retry_count < 3 
  AND next_retry_at <= datetime('now')
ORDER BY created_at ASC;
```

## 17. Nerdy Joke Corner
SQLite staging is like a ADHD thoughts' waiting room—everyone gets a number (ULID), no one gets lost, and the important ones (deduped by hash) don't have to repeat themselves. Meanwhile, Obsidian is the nice organized office where thoughts go to live permanently once they're processed. 🏢📝

---

## Document Version
- **Version:** 2.2.0
- **Status:** Final - Ready for Implementation
- **Last Updated:** 2024-11-15
- **Key Addition:** SQLite staging ledger fully integrated

## Sign-off Checklist
- [x] SQLite staging design complete
- [x] Deduplication strategy defined
- [x] Conflict resolution decided
- [x] TDD requirements specified
- [x] YAGNI boundaries enforced
- [x] Risk mitigation via staging proven
- [x] Performance targets set
- [x] Implementation phases clear

---

### Next Steps
1. **Create Foundation Architecture Tech Spec** (with staging detail)
2. **Create Storage Layer Tech Spec** (SQLite schema implementation)
3. **Create Capture Pipeline Tech Spec** (input → staging → vault)
4. **Begin Phase 1: Foundation + Staging**
5. **Set up TDD test suite for data integrity**

### Success
This PRD now has the **perfect balance**: enough database for reliability (staging ledger), not so much that it becomes a second system. The deduplication and durability gains directly address ADHD patterns of burst capture and interruption recovery. Ship it! 🚀
