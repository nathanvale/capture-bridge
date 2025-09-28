---
title: Acceptance Criteria Task Extraction Guide
status: living
owner: Nathan
version: 0.3.0
date: 2025-09-27
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
updated: 2025-09-27
changes:
  - 0.3.0: Pivot to virtual backlog (capability_graph + acceptance_mapping); removed per‑task file emission
  - 0.2.0: Per-task file layout (deprecated)
  - 0.1.x: Initial extraction rules
---

# Acceptance Criteria Task Extraction Guide

## Purpose

Provide a deterministic, auditable pipeline that converts Product Requirement Document (PRD) Acceptance Criteria (AC) bullets into two virtual planning artifacts:

1. **Capability Graph (CG)** – ordered capability units (phase, slice) with risk & dependency context
2. **Acceptance Mapping (AC Map)** – normalized AC bullet hashes mapped to capability identifiers

Task fabrication is no longer in scope of this guide (handled downstream by the Task Decomposition Agent). This guide ends when a validated Capability Graph + Acceptance Mapping pair is produced or blocked with a GAP report.

**Target Audience:** Roadmap Orchestrator Agent, Task Decomposition Agent, developers working with PRD acceptance criteria conversion.

## When to Use This Guide

Use this guide when:

- Converting PRD acceptance criteria into actionable capability units
- Building or maintaining the capability graph extraction pipeline
- Validating acceptance criteria mapping integrity
- Debugging capability derivation or classification issues
- Implementing or updating the extraction agent logic

**Related Features:**
- All features defined in Master PRD acceptance criteria
- Cross-cutting infrastructure capabilities
- Phase-based delivery milestones

## Prerequisites

**Required Knowledge:**
- Understanding of PRD structure and acceptance criteria format
- Familiarity with capability-based planning
- Knowledge of risk classification and TDD applicability framework

**Required Artifacts:**
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Source of acceptance criteria
- [Roadmap v2.0-MPPP](../master/roadmap.md) - Phase and slice structure
- [Virtual Backlog Contract](../agents/virtual-backlog-contract.md) - Output schema definitions

## Quick Reference

**Core Principles:**
1. **Deterministic:** Same inputs → byte-identical outputs
2. **Traceable:** Every capability tracks explicit AC bullet references
3. **Minimal:** No premature task decomposition
4. **YAGNI-Safe:** Out-of-scope ACs produce GAP flags, not speculative work
5. **Risk-Aware:** Derive initial risk from AC language heuristics
6. **Idempotent:** Re-running with unchanged inputs = no-op
7. **Non-Destructive:** Historical bullet hashes remain valid

**Supported AC Source Sections:**
- Success Criteria
- Success Metrics
- Acceptance
- Definition of Done
- Phase <n> Success
- Launch Criteria

**GAP Decision Flow:**
```
Scan PRD → Normalize bullets → Classify → Detect gaps →
  ↓ (no blocking gaps)          ↓ (blocking gaps)
READY_FOR_DECOMPOSITION        BLOCKED (emit GAP report)
```

## Step-by-Step Instructions

### Step 1: Compute Inputs Hash

Calculate deterministic hash of all input sources to enable idempotency:

```bash
# Concatenate canonical inputs
inputs_hash = sha256(
  concatenated PRD acceptance sections +
  roadmap phase/slice structure +
  relevant ADR IDs
)
```

**Expected Outcome:** 64-character hex hash representing current input state

### Step 2: Check Prior State (Idempotency Gate)

```bash
# Load orchestrator state cache
if exists(.generated/orchestrator-state.json):
  prior_state = load_state()
  if prior_state.inputs_hash == inputs_hash:
    if prior_state.decision == "READY_FOR_DECOMPOSITION":
      # Short-circuit: no regeneration needed
      emit("NO-OP: inputs unchanged")
      exit(0)
```

**Expected Outcome:** Skip regeneration if inputs unchanged, proceed if inputs differ

### Step 3: Extract and Normalize AC Bullets

Scan configured heading patterns (case-insensitive) and extract bulleted items:

```python
# Pseudo-code
for section in ["Success Criteria", "Acceptance", "Definition of Done", ...]:
  bullets = extract_bullets_under_heading(section)

  for raw_bullet in bullets:
    # Normalize
    normalized = raw_bullet
      .strip_leading_markers()  # Remove -, *, [ ], [x], numbers
      .collapse_whitespace()    # Multiple spaces → single space

    # Compute stable hash
    bullet_hash = sha256(normalized)

    # Extract quantitative targets
    targets = extract_metrics(normalized)  # e.g., "< 100ms", ">= 99%"

    # Store for classification
    store_bullet(bullet_hash, raw_bullet, normalized, targets)
```

**Expected Outcome:** Normalized bullet collection with stable hashes and extracted metrics

### Step 4: Classify and Derive Capabilities

Apply heuristic keyword matching to group related bullets into capability candidates:

```python
# Classification heuristics
for bullet in normalized_bullets:
  category = classify_by_keywords(bullet)  # See Capability Derivation table
  risk = assess_risk(bullet, category)     # See Risk Mapping table
  tdd = map_tdd_from_risk(risk)            # See TDD Mapping table

  # Check YAGNI triggers
  if matches_deferral_keywords(bullet):
    mark_gap(bullet, "GAP::AC-OUT-OF-SCOPE")
    continue

  # Check ambiguity
  if has_vague_adjectives_without_metrics(bullet):
    mark_gap(bullet, "GAP::AC-AMBIGUOUS")
    continue

  # Allocate to capability
  capability_id = allocate_or_create_capability(bullet, category)
  add_acceptance_ref(capability_id, bullet_hash)
```

**Expected Outcome:** Capability candidates with classified bullets, gaps identified

### Step 5: Build Capability Graph

Construct ordered capability records with dependencies and metadata:

```python
capabilities = []

for cap in capability_candidates:
  capability = {
    "id": generate_stable_id(cap),         # Slug-based + sequence
    "phase": infer_phase(cap, roadmap),
    "slice": infer_slice(cap, roadmap),
    "title": derive_title(cap),
    "category": cap.category,
    "risk": cap.risk,
    "tdd": cap.tdd,
    "depends_on": infer_dependencies(cap, capabilities),
    "acceptance_refs": cap.bullet_refs,
    "defer": cap.deferred,
    "provisional": cap.needs_clarification
  }
  capabilities.append(capability)

# Sort canonically
capabilities.sort(key=lambda c: (c.phase, c.slice, c.id))

# Compute graph hash
graph_hash = sha256(json_canonical(capabilities))
```

**Expected Outcome:** Sorted capability graph with computed hash

### Step 6: Build Acceptance Mapping

Create normalized mapping from bullet hashes to capabilities:

```python
acceptance_mapping = []

for bullet in all_bullets:
  mapping_entry = {
    "bullet_hash": bullet.hash,
    "raw_text": bullet.raw,
    "normalized_text": bullet.normalized,
    "capability_id": bullet.capability_id if not blocked else null,
    "confidence": bullet.confidence_score,
    "gap_codes": bullet.gaps,
    "source_file": bullet.source_prd,
    "source_line": bullet.line_number,
    "source_section": bullet.section_heading
  }

  # Optional deferral metadata
  if "GAP::AC-OUT-OF-SCOPE" in bullet.gaps:
    mapping_entry["defer_phase"] = guess_future_phase(bullet)
    mapping_entry["revisit_trigger"] = infer_trigger(bullet)

  acceptance_mapping.append(mapping_entry)

# Sort by hash for determinism
acceptance_mapping.sort(key=lambda m: m.bullet_hash)
```

**Expected Outcome:** Complete acceptance mapping with traceability metadata

### Step 7: Validate and Decide

Run integrity checks and determine readiness:

```python
# Structural validation
assert all(c.id for c in capabilities), "Missing capability IDs"
assert all(c.acceptance_refs for c in capabilities), "Capability without AC refs"

# Dependency validation
all_ids = {c.id for c in capabilities}
for cap in capabilities:
  assert all(dep in all_ids for dep in cap.depends_on), f"Invalid dependency in {cap.id}"

# GAP assessment
blocking_gaps = [g for g in all_gaps if g.is_blocking]
ambiguous_ratio = len(ambiguous_bullets) / len(all_bullets)

if blocking_gaps or ambiguous_ratio > 0.10:
  decision = "BLOCKED"
  emit_gap_report(blocking_gaps, ambiguous_ratio)
else:
  decision = "READY_FOR_DECOMPOSITION"
  emit_capability_graph(capabilities)
  emit_acceptance_mapping(acceptance_mapping)

# Update state cache
save_orchestrator_state({
  "inputs_hash": inputs_hash,
  "graph_hash": graph_hash,
  "decision": decision,
  "timestamp": now(),
  "stats": {
    "total_bullets": len(all_bullets),
    "mapped_capabilities": len(capabilities),
    "blocked_bullets": len(blocking_gaps),
    "deferred_bullets": len(deferred_bullets)
  }
})
```

**Expected Outcome:** Decision state persisted, artifacts emitted or GAP report generated

## Common Patterns

### Pattern: Single Capability from Multiple Related Bullets

When multiple AC bullets describe sequential steps of one interaction:

```yaml
# AC Bullets:
- "Capture voice file to ledger"
- "Hash voice file with SHA-256"
- "Record file size and capture timestamp"

# Result: Single capability
id: CAPTURE-VOICE-INGEST
acceptance_refs:
  - bullet_hash: sha256:abc...
  - bullet_hash: sha256:def...
  - bullet_hash: sha256:ghi...
```

### Pattern: Separate Capabilities for Orthogonal Concerns

When bullets cover distinct subsystems:

```yaml
# AC Bullets:
- "Capture voice file to ledger"
- "Purge voice files after 90 days"

# Result: Two capabilities
- id: CAPTURE-VOICE-INGEST
  acceptance_refs: [sha256:abc...]

- id: RETENTION-PURGE-POLICY
  acceptance_refs: [sha256:xyz...]
  depends_on: [CAPTURE-VOICE-INGEST]
```

### Pattern: Quality Attribute as Risk Annotation

When bullet specifies performance constraint for functional capability:

```yaml
# AC Bullet:
- "Insert voice capture in < 50ms p95 latency"

# Result: Single capability with risk escalation
id: CAPTURE-VOICE-INGEST
risk: High  # Escalated from Medium due to latency constraint
acceptance_refs:
  - bullet_hash: sha256:perf123...
    extracted_metric: "< 50ms p95"
```

### Anti-Pattern: Over-Fragmentation

**Avoid:** Creating separate capabilities for each minor variation

```yaml
# BAD: Over-fragmented
- CAPTURE-VOICE-HASH
- CAPTURE-VOICE-SIZE
- CAPTURE-VOICE-TIMESTAMP

# GOOD: Cohesive operational unit
- CAPTURE-VOICE-INGEST  # Includes hash, size, timestamp
```

### Anti-Pattern: Speculative Future Work

**Avoid:** Creating capabilities for out-of-scope features

```yaml
# AC Bullet with deferral trigger:
- "Semantic vector search across voice transcripts"

# BAD: Create capability
- id: SEARCH-SEMANTIC-VECTOR  # Out of scope!

# GOOD: Mark as deferred
acceptance_mapping:
  - bullet_hash: sha256:defer...
    capability_id: null
    gap_codes: ["GAP::AC-OUT-OF-SCOPE"]
    defer_phase: 5
```

## Capability Derivation Heuristics

Complete keyword-to-category mapping with usage notes:

| AC Signal Keywords | Capability Category Hint | Notes |
|--------------------|--------------------------|-------|
| `insert <`, `p95`, `latency`, `throughput` | performance | Risk escalation only; not separate capability unless user-facing SLO enforcement feature |
| `duplicate`, `dedup`, `no duplicate` | data-integrity | May fold into ledger schema / write path capability |
| `crash`, `resume`, `recovery`, `restart` | resilience | Attach as risk to core capture / processing capability; avoid standalone unless cross-cutting harness |
| `backup`, `verification`, `consecutive` | durability | Distinct capability if involves scheduled verification subsystem |
| `retention`, `90-day`, `purge` | retention | Separate capability (policy engine) |
| `foreign key`, `no orphan`, `referential` | integrity-schema | Schema / migration capability |
| `audit`, `traceable`, `ledger` | auditability | Possibly merges with durability unless feature breadth justifies split |
| `metrics`, `emit`, `telemetry` | observability | If Phase 1 scope limited, flag as potential deferral with GAP unless explicitly required |
| `zero data loss` | durability-core | Aggregate acceptance: do not create monolithic capability—split across capture durability, backup verification, crash recovery risk contexts |

**Usage Note:** Heuristics guide initial classification. Final capability boundaries require cohesion analysis (see Aggregated vs Atomic Capability Decisions).

## YAGNI / Deferral Triggers

If an AC bullet includes any prematurely advanced scope terms, mark as out-of-scope:

**Deferral Keywords:**
- `classification`, `semantic`, `embedding`, `vector`
- `FTS`, `RAG`, `UI`, `dashboard`
- `multi-device`, `replication`, `analytics`
- `search ranking`

**Action:**
- Do not emit a capability
- Record GAP code `GAP::AC-OUT-OF-SCOPE`
- Optionally mark deferral metadata (`defer_phase` guess) for reporting
- Preserve bullet hash for future traceability

## Risk Mapping Rules

Derive initial capability risk level from AC content:

| Condition | Risk | Notes |
|-----------|------|-------|
| Mentions durability / zero data loss / corruption prevention | High | Data integrity critical path |
| Backup verification / retention enforcement | High | Regulatory / recovery surface |
| Crash / recovery / resume guarantees | High | Complex failure modes |
| Performance constraint (< threshold latency, p95) | Medium | Escalate to High if coupled with durability claim |
| Operational metrics / simple observability | Low | Unless SLO enforcement tasks defined |
| Schema integrity (foreign key / no orphan) | Medium | High if destructive migrations involved |

## TDD Mapping Rules

Map test-driven development applicability from risk level:

| Risk | TDD Default |
|------|-------------|
| High | Required (tests authored first) |
| Medium | Recommended (core path first) |
| Low | Optional |

## Aggregated vs Atomic Capability Decisions

Guidelines for grouping or separating AC bullets:

**Single Capability When:**
- Multiple bullets describe sequential steps of one user/system interaction
- Bullets represent different quality attributes of same functional unit
- Splitting would create artificial dependencies or partial coherence

**Separate Capabilities When:**
- Bullets cover orthogonal subsystems (e.g., capture logic vs retention purge)
- Bullet implies independent scheduler / background process (e.g., periodic backup verification)
- Bullets have significantly different risk profiles or phase targets

**Quality Attribute Handling:**
- If bullet is purely quality attribute (latency threshold) tied to single functional capability → annotate risk; do not create performance-only capability
- If quality attribute spans multiple capabilities → consider cross-cutting observability capability

## GAP Conditions

Extraction layer GAP detection and handling:

| GAP Code | Trigger | Action |
|----------|--------|--------|
| GAP::AC-AMBIGUOUS | Vague adjective ("fast", "robust") without metric | Clarify PRD; block mapping |
| GAP::AC-OUT-OF-SCOPE | Terms match deferral triggers | Record deferral metadata |
| GAP::AC-NO-SPEC | Mechanism referenced not present in any tech spec | Flag; propose spec addition |
| GAP::AC-LOW-CONFIDENCE | Classifier confidence below threshold | Block until clarified |
| GAP::AC-DUPLICATE | Canonical text duplicates existing bullet hash | Ignore second occurrence (log) |

**Blocking vs Non-Blocking:**
- `GAP::AC-AMBIGUOUS` - Blocking (prevents capability creation)
- `GAP::AC-OUT-OF-SCOPE` - Non-blocking (records deferral for future)
- `GAP::AC-NO-SPEC` - Non-blocking (warns but allows provisional capability)
- `GAP::AC-LOW-CONFIDENCE` - Blocking (requires manual review)
- `GAP::AC-DUPLICATE` - Non-blocking (logged, second occurrence ignored)

## ID Generation

Stable, human-readable capability identifiers:

**Algorithm:**
1. **Slug:** Lowercase, hyphenated first 4 significant words from title
2. **Sequence:** Increment per category to retain ordering stability
3. **Collision Fallback:** Append short hash if duplicate slug detected

**Examples:**
```
Title: "Voice File Capture and Ledger Storage"
→ Slug: "voice-file-capture-and"
→ Category: capture
→ ID: CAPTURE-VOICE-FILE-CAPTURE-AND

Title: "Backup Verification Scheduler"
→ Slug: "backup-verification-scheduler"
→ Category: durability
→ ID: DURABILITY-BACKUP-VERIFICATION-SCHEDULER
```

**Stability:** IDs remain stable across reruns when title semantics unchanged. Minor wording changes that don't affect semantic meaning preserve the ID.

## Acceptance Bullet Normalization

Pre-processing pipeline for deterministic hashing:

**Steps:**
1. Strip leading markers: `-`, `*`, `[ ]`, `[x]`, numbers
2. Collapse multiple spaces → single space
3. Lowercase copy for classification (retain original for traceability)
4. Extract quantitative targets: regex `(<|<=|=|>|>=)?\s?\d+(ms|s|%)`

**Example:**
```
Raw:    "- [ ] 50 captures with zero data loss"
Strip:  "50 captures with zero data loss"
Collapse: "50 captures with zero data loss" (no change)
Lowercase: "50 captures with zero data loss"
Hash:   "sha256:abc123..."
Targets: ["50 captures"]
```

**Normalization Preserves:**
- Original raw text for display
- Source file, line number, section heading for traceability

## Output Artifacts

Virtual backlog components (ephemeral unless debug mode):

| Artifact | Persistence | Description |
|----------|-------------|-------------|
| Capability Graph | Ephemeral (optional debug: `.generated/capabilities.json`) | Ordered list of capability records + `graph_hash` |
| Acceptance Mapping | Ephemeral (optional debug: `.generated/acceptance-mapping.json`) | Bullet hash mapping with confidence & gap codes |
| GAP Report | Ephemeral / log output | Structured list of blocking & non-blocking gaps |
| Orchestrator State Cache | `.generated/orchestrator-state.json` | Stores `inputs_hash` + last decision |

**Schema Reference:** See [Virtual Backlog Contract](../agents/virtual-backlog-contract.md) for detailed field definitions.

## Idempotency & Decision Flow

Complete execution flow with caching:

```
1. Compute inputs_hash = sha256(PRD sections + roadmap + ADR IDs)

2. Load orchestrator state cache (.generated/orchestrator-state.json)
   IF prior inputs_hash == current inputs_hash
      AND prior decision == "READY_FOR_DECOMPOSITION"
   THEN emit NO-OP (short-circuit)

3. Normalize bullets → compute bullet_hash values
   → produce sorted acceptance mapping candidates

4. Generate capability candidates
   → canonical sort (phase, slice, id)
   → compute graph_hash

5. Run validation & GAP detection
   IF blocking gaps exist
   THEN decision = "BLOCKED"
        emit GAP report
   ELSE decision = "READY_FOR_DECOMPOSITION"
        emit capability graph + acceptance mapping

6. Write orchestrator state cache:
   {
     "inputs_hash": "sha256:...",
     "graph_hash": "sha256:...",
     "decision": "READY_FOR_DECOMPOSITION" | "BLOCKED",
     "timestamp": "2025-09-27T...",
     "stats": {...}
   }
```

## Reconciliation (Run-to-Run)

On each execution, compare prior state to detect changes:

**Detect:**
- **Added bullets:** New hashes not in prior mapping
- **Removed bullets:** Hashes absent from current PRD (retain historical mapping in downstream tasks until decomposed manifest updates)
- **Risk class changes:** e.g., Medium → High (flag for downstream re-decomposition after manifest cycle)
- **Confidence drops:** Below threshold → escalate to `GAP::AC-LOW-CONFIDENCE`
- **Clarity drift:** Percentage of ambiguous bullets > threshold (default 10%) → warn overall PRD quality degradation

**Actions:**
- Log all changes for audit trail
- Preserve historical bullet hashes (non-destructive)
- Trigger alerts for significant drift (>20% ambiguous ratio)

## Deferral Recording

Deferrals appear in acceptance mapping (not separate files):

```json
{
  "bullet_hash": "sha256:deferral...",
  "raw_text": "vector semantic search across transcripts",
  "normalized_text": "vector semantic search across transcripts",
  "capability_id": null,
  "confidence": 0.91,
  "gap_codes": ["GAP::AC-OUT-OF-SCOPE"],
  "defer_phase": 5,
  "revisit_trigger": "User search failure rate > 20%"
}
```

**Usage:**
- Track future scope without creating speculative work
- Provides context for phase planning discussions
- Enables "when to reconsider" trigger definitions

## Troubleshooting

### Common Error: "Duplicate bullet hash detected"

**Symptom:** GAP code `GAP::AC-DUPLICATE` appears in mapping

**Cause:** Identical normalized text appears in multiple AC sections

**Solution:**
1. Review PRD for redundant acceptance criteria
2. Consolidate duplicate bullets into single canonical statement
3. Or: If intentional repetition for emphasis, add distinguishing context

### Common Error: "Ambiguous ratio > 10%"

**Symptom:** Extraction blocked with clarity warning

**Cause:** Too many vague adjectives without metrics (e.g., "fast", "reliable", "robust")

**Solution:**
1. Identify flagged bullets in GAP report
2. Add quantitative success criteria to each
3. Replace vague terms: "fast" → "< 100ms p95", "reliable" → "99.9% uptime"

### Common Error: "Invalid dependency reference"

**Symptom:** Validation assertion fails on capability dependency graph

**Cause:** Capability references non-existent `depends_on` ID

**Solution:**
1. Check capability ID generation for typos
2. Verify dependency was not filtered due to GAP
3. Review roadmap phase ordering (dependencies must be in same or earlier phase)

### Common Error: "Confidence score below threshold"

**Symptom:** Bullet mapping includes `GAP::AC-LOW-CONFIDENCE`

**Cause:** Keyword classifier uncertain about category assignment

**Solution:**
1. Review bullet text for mixed signals (e.g., mentions both "performance" and "retention")
2. Split bullet into separate focused acceptance criteria
3. Or: Adjust classification heuristics if pattern is valid but unrecognized

### Debug Mode

Enable verbose output for troubleshooting:

```bash
# Set environment variable
export ADHD_ORCHESTRATOR_DEBUG=1

# Enables:
# - Per-bullet classification logging
# - Intermediate capability candidate output
# - Full GAP detection reasoning
# - JSON artifact persistence to .generated/
```

## Examples

### Example 1: Voice Capture Capability Extraction

**Input AC Bullets (from Master PRD):**
```markdown
## Success Criteria
- Capture voice file via polling mechanism
- Compute SHA-256 hash on ingestion
- Record file size and capture timestamp
- Insert capture record in < 50ms p95 latency
- No duplicate captures (hash-based deduplication)
```

**Processing:**
1. Normalize all bullets, compute hashes
2. Classify: All match "capture" category
3. Assess risk: "< 50ms p95" escalates to High
4. Group: Sequential steps of single interaction → one capability
5. Extract metrics: "< 50ms p95" recorded

**Output Capability:**
```json
{
  "id": "CAPTURE-VOICE-INGEST",
  "phase": 1,
  "slice": "voice-processing",
  "title": "Voice File Capture and Ledger Ingestion",
  "category": "capture",
  "risk": "High",
  "tdd": "Required",
  "depends_on": [],
  "acceptance_refs": [
    {"bullet_hash": "sha256:poll...", "metric": null},
    {"bullet_hash": "sha256:hash...", "metric": null},
    {"bullet_hash": "sha256:size...", "metric": null},
    {"bullet_hash": "sha256:latency...", "metric": "< 50ms p95"},
    {"bullet_hash": "sha256:dedup...", "metric": null}
  ],
  "defer": false,
  "provisional": false
}
```

### Example 2: Deferred Feature Detection

**Input AC Bullet:**
```markdown
- Semantic vector search across voice transcripts for ad-hoc queries
```

**Processing:**
1. Normalize: "semantic vector search across voice transcripts for ad-hoc queries"
2. Classify: Matches `vector`, `semantic` deferral triggers
3. Mark: `GAP::AC-OUT-OF-SCOPE`
4. Guess: Likely Phase 5+ (intelligence layer)

**Output Acceptance Mapping Entry:**
```json
{
  "bullet_hash": "sha256:search...",
  "raw_text": "Semantic vector search across voice transcripts for ad-hoc queries",
  "normalized_text": "semantic vector search across voice transcripts for ad-hoc queries",
  "capability_id": null,
  "confidence": 0.93,
  "gap_codes": ["GAP::AC-OUT-OF-SCOPE"],
  "defer_phase": 5,
  "revisit_trigger": "User query failure rate exceeds 20%"
}
```

### Example 3: Separate Capabilities for Orthogonal Concerns

**Input AC Bullets:**
```markdown
- Voice files automatically purged after 90 days retention
- Backup verification runs daily to ensure integrity
```

**Processing:**
1. Bullet 1: "retention", "purge" → retention category
2. Bullet 2: "backup", "verification" → durability category
3. Both High risk (regulatory/recovery)
4. Orthogonal concerns → separate capabilities
5. Backup depends on capture existing

**Output Capabilities:**
```json
[
  {
    "id": "RETENTION-PURGE-POLICY",
    "category": "retention",
    "risk": "High",
    "depends_on": ["CAPTURE-VOICE-INGEST"],
    "acceptance_refs": [{"bullet_hash": "sha256:purge..."}]
  },
  {
    "id": "DURABILITY-BACKUP-VERIFICATION",
    "category": "durability",
    "risk": "High",
    "depends_on": ["CAPTURE-VOICE-INGEST"],
    "acceptance_refs": [{"bullet_hash": "sha256:backup..."}]
  }
]
```

## Related Documentation

**Core Planning Documents:**
- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Source of acceptance criteria
- [Roadmap v2.0-MPPP](../master/roadmap.md) - Phase and slice structure
- [Virtual Backlog Contract](../agents/virtual-backlog-contract.md) - Output schema definitions

**Agent Documentation:**
- [Roadmap Orchestrator](../agents/roadmap-orchestrator.md) - Implements this extraction logic
- [Task Decomposition Agent](../agents/task-decomposition-agent.md) - Consumes capability graph

**Related Guides:**
- [TDD Applicability Framework](./tdd-applicability.md) - Testing strategy derivation
- [Test Strategy Guide](./test-strategy.md) - Test planning patterns
- [YAGNI Enforcement](./yagni-enforcement.md) - Scope control principles

**Architecture Decision Records:**
- [ADR-0001: Voice File Sovereignty](../adr/0001-voice-file-sovereignty.md) - Capture durability requirements
- [ADR-0002: Dual Hash Migration](../adr/0002-dual-hash-migration.md) - Deduplication strategy

**External Resources:**
- [Capability-Based Planning](https://example.com) - Conceptual background
- [SHA-256 Hashing](https://example.com) - Cryptographic hash functions

## Maintenance Notes

**Update Triggers:**
- New AC wording patterns emerge requiring heuristic table updates
- Risk or category taxonomy changes (version bump: minor if additive, major if breaking)
- Confidence scoring approach improvements (rule-based → ML model consideration)
- Section boundary detection enhancements

**Version Bump Policy:**
- **Patch (0.3.x):** Bug fixes, documentation clarification
- **Minor (0.x.0):** New heuristics, additional classification categories, non-breaking schema additions
- **Major (x.0.0):** Breaking changes to capability graph schema, removal of classification categories

**Historical Preservation:**
- Never rewrite past bullet hashes (new hash = new lineage)
- Retain historical mapping entries even when bullets removed from current PRD
- Document rationale for deprecated heuristics in change log

**Known Limitations:**
- Confidence scoring currently rule-based; may benefit from ML model for complex cases
- Section boundary detection can have false positives with nested headings
- Near-duplicate bullet detection not yet implemented (planned: edit distance threshold)

**Open Questions:**
1. Formal JSON Schema publication for capability_graph & acceptance_mapping? (Planned)
2. Confidence scoring approach standardization (rule-based vs ML model)?
3. Automated section boundary detection improvements (to reduce false positives)?
4. Policy for merging near-duplicate bullets (edit distance threshold)?

---

**Next Step:** Task Decomposition Agent consumes `capability_graph` + `acceptance_mapping` when decision = `READY_FOR_DECOMPOSITION`.