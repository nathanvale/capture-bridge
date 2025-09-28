---
title: Virtual Backlog Contract
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: agent-spec
---

# Virtual Backlog Contract

**Purpose:** Canonical specification for ephemeral planning artifacts shared between Roadmap Orchestrator, Task Decomposition Agent (TDA), Task Manager, and Task Implementer (TIA). Replaces former per-task markdown file set with deterministic JSON documents.

---

## Goals

1. Eliminate file proliferation / manual drift.
2. Guarantee deterministic regeneration from authoritative inputs (PRDs, roadmap, ADRs).
3. Provide stable identifiers & hashes enabling idempotent downstream automation.
4. Support gap detection & remediation loops without partial state writes.
5. Enable tooling (future CLI/UI) to inspect planning state via machine-readable surfaces.

---

## Artifact Set Overview

| Artifact | Producer | Consumer(s) | Persistence | Description |
|----------|----------|-------------|-------------|-------------|
| Capability Graph (CG) | Orchestrator | TDA, Manager | Ephemeral or `.generated/capabilities.json` | Phase/slice ordered capabilities + dependency edges |
| Acceptance Mapping (AC Map) | Orchestrator | TDA | Ephemeral | Bullet hash → capability id + source location metadata |
| Virtual Task Manifest (VTM) | TDA | Manager, TIA | Ephemeral or `.generated/tasks.json` (debug only) | Decomposed task list referencing capability ids & AC hashes |
| Orchestrator State | Orchestrator | Orchestrator (self), Manager | `.generated/orchestrator-state.json` | Caches last input hash + decision status |
| Implementation State Log | TIA | TIA, Manager | `.generated/impl-state.jsonl` | Append-only task execution events (optional) |

Debug persistence (in `.generated/`) is optional and excluded from source control; canonical truth is recomputation.

---

## Versioning

Each artifact includes a `contract_version` semver string. Initial release: `0.1.0`.

Backward compatibility rules:

- Minor version increments may add optional fields.
- Major version changes may alter field semantics or remove fields (requires coordinated agent upgrade).

---

## Canonical Ordering Rules

1. Object keys serialized in lexicographic order when emitting JSON.
2. Capability ordering: primary sort by `phase` (asc), then `slice` (asc), then `id` (lexicographic).
3. Task ordering: primary sort by `phase`, then capability order index, then `task_id` lexicographic.
4. Acceptance refs array for a capability sorted by `bullet_hash`.
5. Dependencies array (`depends_on`) sorted lexicographically; cycles forbidden.

Failure to meet ordering invalidates artifact (agent must re-canonicalize before emission).

---

## Shared Identifier Conventions

| Entity | ID Rule |
|--------|---------|
| Capability ID | `UPPER(slug(core_noun + core_verb))` with hyphens; stable across regenerations. |
| Bullet Hash | `sha256(canonical_bullet_text)` where canonical bullet text is trimmed, single-spaced, lowercase. |
| Task ID | `<capability-id>--T<seq>` where `<seq>` is zero-padded (e.g., `--T01`). |
| Graph Master Hash | `sha256(capabilities_json_without_hash_field)` (computed before insertion). |
| Manifest Master Hash | `sha256(tasks_json_without_hash_field)` |

---

## JSON Schemas (Draft)

### Capability Graph (`capability_graph`)

```json
{
  "contract_version": "0.1.0",
  "graph_hash": "sha256:...", 
  "generated_at": "2025-09-27T12:00:00Z",
  "inputs_hash": "sha256:...", 
  "capabilities": [
    {
      "id": "CAPTURE-VOICE-POLLING",
      "phase": 1,
      "slice": 1,
      "title": "Voice memo polling (manual trigger)",
      "category": "capture",
      "risk": "Medium",
      "tdd": "Recommended",
      "depends_on": ["FOUNDATION-MONOREPO", "LEDGER-SCHEMA"],
      "acceptance_refs": [
        {
          "bullet_hash": "sha256:abcd...",
          "source_file": "docs/features/capture/prd-capture.md",
          "line": 120,
          "section": "Phase 1 Success Criteria"
        }
      ],
      "defer": false,
      "defer_trigger": null,
      "status": "unplanned",
      "provisional": false
    }
  ]
}
```

### Acceptance Mapping (`acceptance_mapping`)

```json
{
  "contract_version": "0.1.0",
  "generated_at": "2025-09-27T12:00:00Z",
  "inputs_hash": "sha256:...",
  "items": [
    {
      "bullet_hash": "sha256:abcd...",
      "raw_text": "user can trigger polling manually",
      "normalized_text": "user can trigger polling manually",
      "capability_id": "CAPTURE-VOICE-POLLING",
      "confidence": 0.94,
      "source": {
        "file": "docs/features/capture/prd-capture.md",
        "line": 120,
        "section": "Phase 1 Success Criteria"
      },
      "gap_codes": []
    }
  ]
}
```

### Virtual Task Manifest (`virtual_task_manifest`)

```json
{
  "contract_version": "0.1.0",
  "manifest_hash": "sha256:...",
  "graph_hash": "sha256:...", 
  "inputs_hash": "sha256:...",
  "generated_at": "2025-09-27T12:05:00Z",
  "tasks": [
    {
      "task_id": "CAPTURE-VOICE-POLLING--T01",
      "capability_id": "CAPTURE-VOICE-POLLING",
      "phase": 1,
      "slice": 1,
      "title": "Implement polling trigger command",
      "description": "CLI command to manually trigger voice memo polling and persist results to ledger.",
      "ac_hashes": ["sha256:abcd..."],
      "risk": "Medium",
      "est": { "size": "S" },
      "state": "pending",
      "depends_on_tasks": [],
      "gap_codes": [],
      "notes": [],
      "provisional": false
    }
  ]
}
```

---

## Task Decomposition Rules (Summary)

1. Minimum granularity: implementable within 1 developer-day (baseline).
2. Each task must reference at least one acceptance bullet hash; if none map, produce GAP::AC-UNMAPPED at capability stage (block earlier).
3. Split tasks when: distinct technical substrate, cross-component boundary, or risk isolation needed.
4. Avoid speculative tasks (no AC or enabling capability) → GAP::YAGNI-CANDIDATE.
5. Preserve ordering: tasks for a capability appear before tasks depending on that capability.

Detailed heuristics specified in dedicated TDA spec (not duplicated here).

---

## Lifecycle

1. Orchestrator runs → emits CG + AC Map (and state cache).
2. TDA consumes CG + AC Map (if decision READY_FOR_DECOMPOSITION) → emits VTM.
3. Task Manager ingests VTM → exposes query/filter API surfaces (future) and monitors drift by recomputing hashes.
4. TIA pulls tasks (state=pending) → executes → appends status events (optional) → updates in-memory view (no direct mutation of original VTM; new manifest generated upon recompute).
5. Any upstream change (PRD/roadmap) invalidates chain via new `inputs_hash`; orphaned task states reconciled by matching `task_id` across manifests.

---

## Idempotency & Determinism

| Aspect | Strategy |
|--------|----------|
| Re-run with unchanged inputs | Identical `inputs_hash` → skip regeneration (short-circuit). |
| Capability renames | Provisional alias mapping (future) to maintain backward compatibility for `task_id` roll-forward. |
| Hash collisions | sha256 considered sufficient; if collision hypothetically detected, prefix with incremental counter and flag GAP::HASH-COLLISION. |
| Ordering drift | Re-sort before hashing; mismatch triggers warning but not failure. |

---

## GAP Codes (Extended)

| Code | Layer | Meaning |
|------|-------|---------|
| GAP::AC-UNMAPPED | Capability | Acceptance bullet not mapped to capability |
| GAP::PHASE-MISMATCH | Capability | Phase inconsistency vs roadmap |
| GAP::RISK-MISSING | Capability | Missing mitigation reference |
| GAP::SLICE-OVERLOAD | Capability | Slice breadth > 7 capabilities |
| GAP::YAGNI-CANDIDATE | Task | Task appears speculative (no direct AC linkage) |
| GAP::HASH-COLLISION | Any | Extremely rare hash duplication detected |
| GAP::TASK-ORPHAN | Task | Task refers to capability id not in CG (after change) |

---

## Edge Cases & Handling

| Case | Handling |
|------|----------|
| Capability removed upstream | New manifest excludes tasks; implementer marks any in-progress as archived. |
| Bullet text modified | New hash → previous tasks referencing old hash remain until completion or manual prune. |
| Phase shift later | Capability phase changed → tasks inherit new phase; ordering recalculated. |
| Dependency cycle introduced | Orchestrator rejects graph; Decision=BLOCKED; produces cycle report. |
| Massive drift (>25% capabilities changed) | Force fresh decomposition; previous task state log retained for audit. |

---

## Validation Checklist

- [ ] JSON validates against implied schemas (runtime structural validation).
- [ ] All `capability_id` values unique & match regex `^[A-Z0-9\-]+$`.
- [ ] No dependency cycles (topological sort success).
- [ ] All `task_id` values unique and prefix match their capability.
- [ ] All `ac_hashes` exist in Acceptance Mapping.
- [ ] Master hashes recomputed after canonical sort.

---

## Open Items

1. Formal JSON Schema draft (machine-validated) – future tooling.
2. Confidence scoring method standardization (currently unspecified heuristic).
3. Risk taxonomy extension (align with security/privacy spec).

---
**Status:** Draft v0.1.0
