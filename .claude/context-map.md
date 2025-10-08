# Capture Bridge - AI Agent Context Map

**Purpose**: Navigation guide for condensed vs full documentation
**Last Updated**: 2025-10-08

---

## Quick Reference: What to Read When

### Start Here (Always in Memory)

**Condensed versions** - loaded automatically via `CLAUDE.md`:
- `.claude/rules/testkit-tdd-guide-condensed.md` (3k tokens)
- `.claude/rules/prd-master-condensed.md` (2k tokens)
- `.claude/rules/typescript-patterns-condensed.md` (1.5k tokens)
- `.claude/rules/agent-coordination.md` (1.4k tokens) - full version
- `.claude/testing-config.md` (510 tokens) - full version

**Total memory footprint**: ~8.4k tokens (down from 26.4k)

---

## When to Use Read Tool for Full Docs

### TestKit TDD Guide
**Read full version** (`.claude/rules/testkit-tdd-guide.md`) when:
- Implementing first custom resource (event listeners, timers)
- Need complete test template (SQLite, MSW, CLI)
- Complex cleanup sequence debugging
- Security test patterns (SQL injection, path traversal)
- Memory leak detection setup
- Global test configuration (test-setup.ts)

**Condensed has**: Principles, quick patterns, checklist, line number references

### Master PRD
**Read full version** (`docs/master/prd-master.md`) when:
- Implementing SQL schemas (need CREATE TABLE statements)
- Understanding state machine transitions
- Implementing deduplication algorithm
- Risk analysis and mitigation strategies
- Decision context and trade-off analysis
- Related specification links

**Condensed has**: Vision, architecture summary, performance targets, YAGNI boundaries

### TypeScript Patterns
**Read full version** (`.claude/rules/typescript-patterns.md`) when:
- Need detailed examples for complex patterns
- Understanding ESLint disable cleanup process
- Full custom resource implementation examples
- Complete type guard patterns
- Rationale behind each rule

**Condensed has**: Top 5 fixes, critical patterns, checklists, error code → solution table

---

## Workflow: Condensed → Full → Back

```
1. Agent starts with condensed doc (in memory)
   ↓
2. Sees: "Full pattern: [filename.md:100-150]"
   ↓
3. Uses Read tool: Read(file_path, offset=100, limit=50)
   ↓
4. Implements pattern from full doc
   ↓
5. Returns to condensed version for next task
```

**Key**: Condensed docs act as table of contents + essentials

---

## File Organization

```
.claude/
├── context-map.md                           ← You are here
├── rules/
│   ├── testkit-tdd-guide-condensed.md      ← In memory (3k tokens)
│   ├── testkit-tdd-guide.md                ← Read when needed (11.3k tokens)
│   ├── prd-master-condensed.md             ← In memory (2k tokens)
│   ├── typescript-patterns-condensed.md    ← In memory (1.5k tokens)
│   ├── typescript-patterns.md              ← Read when needed (3.3k tokens)
│   ├── agent-coordination.md               ← In memory (1.4k tokens, full)
│   └── ...
├── testing-config.md                        ← In memory (510 tokens, full)
└── CLAUDE.md                                ← Entry point

docs/
├── master/
│   └── prd-master.md                        ← Read when needed (9.9k tokens)
└── ...
```

---

## Token Budget (Before → After)

**Before compaction**:
- testkit-tdd-guide.md: 11,300 tokens
- prd-master.md: 9,900 tokens
- typescript-patterns.md: 3,300 tokens
- agent-coordination.md: 1,400 tokens
- testing-config.md: 510 tokens
- **Total in memory: 26,400 tokens**

**After compaction**:
- testkit-tdd-guide-condensed.md: 3,000 tokens
- prd-master-condensed.md: 2,000 tokens
- typescript-patterns-condensed.md: 1,500 tokens
- agent-coordination.md: 1,400 tokens (unchanged)
- testing-config.md: 510 tokens (unchanged)
- context-map.md: 500 tokens
- **Total in memory: 8,910 tokens**

**Savings: 17,490 tokens (66% reduction)**

---

## Decision Matrix: Condensed vs Full

| Task Type | Use Condensed | Read Full |
|-----------|---------------|-----------|
| Quick syntax fix | ✅ TypeScript patterns condensed | ❌ |
| First test implementation | ✅ TestKit condensed for setup | ✅ Full for template |
| Understanding product scope | ✅ PRD condensed | ❌ |
| Implementing SQL schema | ❌ | ✅ PRD full lines 121-169 |
| Custom resource class | ✅ Condensed for checklist | ✅ Full for examples |
| Error code lookup | ✅ TypeScript condensed table | ❌ |
| Complex cleanup debugging | ✅ Condensed for 5-step | ✅ Full for edge cases |
| Agent coordination | ✅ Full version (small) | N/A |
| Test configuration | ✅ Full version (small) | N/A |

---

## Compression Techniques Used

1. **Hierarchical summaries**: Key points → line refs for details
2. **Pattern extraction**: Remove duplicate examples, show principle only
3. **Reference linking**: `[Full example: filename.md:100-150]`
4. **Checklist format**: Convert explanatory text to actionable bullets
5. **Remove meta content**: Changelogs, jokes, optional reading lists
6. **Table format**: Quick reference tables replace prose

---

## AI Agent Tips

**Efficient memory usage**:
- Start tasks with condensed versions
- Use line number references to fetch only needed sections
- Return to condensed after implementing pattern
- Don't load full docs "just in case"

**When condensed is sufficient**:
- Quick syntax fixes
- Error code lookups
- Checklist validation
- Pattern identification

**When to fetch full docs**:
- First implementation of complex pattern
- Need complete code example
- Understanding decision rationale
- Debugging edge cases

---

**Token Count**: ~500 tokens
**Purpose**: Maximize AI agent efficiency while minimizing memory footprint
