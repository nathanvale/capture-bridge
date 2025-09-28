---
title: Task Manager Agent
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: agent-spec
---

# Agent: Task Manager (Virtual Backlog Layer)

**Purpose**
Mediates the Virtual Task Manifest (VTM) lifecycle produced by the Task Decomposition Agent (TDA); provides validation, drift detection, querying, and state transition governance WITHOUT generating or mutating per‑task markdown files. Acts as the stable API surface for downstream tooling (CLI/UI) and the Task Implementer (TIA).

---

## Scope Shift (Context)

This spec supersedes the legacy file‑oriented "Roadmap Task Manager" agent. All responsibilities tied to physical task files, indices, and slice snapshots are removed. Canonical planning artifacts are ephemeral JSON documents defined in `virtual-backlog-contract.md`.

Out of scope: capability extraction (Orchestrator) and task decomposition heuristics (TDA). Task execution details belong to TIA.

---

## Core Responsibilities

1. Manifest Ingestion
   - Accept a freshly generated Virtual Task Manifest (VTM) + related `graph_hash` & `inputs_hash`.
   - Validate structural integrity against contract rules (IDs, ordering, hash linkage, AC references).
2. Drift Detection
   - Recompute canonical ordering & master `manifest_hash`; compare to provided hash.
   - Detect changes between successive manifests (added/removed/modified tasks, capability phase shifts) and emit a delta summary.
3. State Governance
   - Maintain an in‑memory or lightweight persisted state map keyed by `task_id` with lifecycle fields: `state`, `started_at`, `completed_at`, `attempts`, `latest_outcome`.
   - Apply allowed transitions: `pending -> in-progress -> completed|blocked`; `blocked -> in-progress`; `in-progress -> blocked|completed`.
   - Reject transitions if upstream manifest version (`manifest_hash`) no longer matches active.
4. GAP Propagation
   - Surface unresolved GAP codes from tasks/capabilities; block transition to `completed` if blocking GAP present (e.g., `GAP::YAGNI-CANDIDATE`, `GAP::TASK-ORPHAN`).
5. Query & Filtering API (Conceptual)
   - Provide logical query operations: list tasks by phase/slice/state/risk or by capability cluster.
   - Support diff queries (e.g., "show tasks changed since previous manifest").
6. Audit & Telemetry
   - Append structured events (JSON lines) for state transitions to optional `impl-state.jsonl` (delegated emission).
   - Summarize velocity metrics (tasks completed per capability, mean cycle time) without persisting derived metrics (computed on demand).
7. Idempotent No‑Op Guarantee
   - If new manifest is byte‑identical (hash match) → skip processing & return cached summary.

---

## Inputs

| Type | Source | Notes |
|------|--------|-------|
| Virtual Task Manifest | TDA output | Must include `manifest_hash` & `graph_hash` |
| Orchestrator State | Orchestrator | Supplies `inputs_hash` & decision status |
| Acceptance Mapping (read-only) | Orchestrator | For validation of `ac_hashes` presence |
| Existing Task State Snapshot | Internal cache | Optional persisted JSON lines -> rebuild map |

---

## Outputs

| Artifact | Form | Purpose |
|----------|------|---------|
| Validation Report | JSON | Lists structural errors / warnings / blocking gaps |
| Drift Delta | JSON | Changes vs previous manifest (added/removed/modified tasks) |
| State Events | JSON lines | Transition audit trail (optional) |
| Query Responses | JSON | Filtered task lists / diff sets |
| Reconciliation Summary | Markdown/JSON | Human-friendly rollup for logs/CLI |

---

## Validation Phases

1. Structural Schema: required keys, type checks, ID regex.
2. Referential Integrity: each `capability_id` appears in capability graph; each `ac_hash` in acceptance map.
3. Ordering: verify tasks already sorted by (phase, capability order, task_id).
4. Hash Integrity: recompute `manifest_hash` from canonical form; compare.
5. GAP Evaluation: elevate blocking gaps to manifest-level error list.

Failure in phases 1–4 → reject manifest (no state updates). Phase 5 → accept manifest but mark `status=DEGRADED` until resolved.

---

## State Model

| Field | Meaning |
|-------|---------|
| task_id | Stable composite ID |
| state | `pending\|in-progress\|blocked\|completed` |
| attempts | Integer increment per transition to `in-progress` |
| started_at | ISO timestamp first entered `in-progress` |
| completed_at | ISO timestamp on completion |
| latest_outcome | Freeform summary or reference id (e.g., test run) |
| blocking_gaps | Snapshot of any blocking GAP codes at transition attempt |
| manifest_hash | Hash of manifest this state entry aligned with |

Task Manager should remain stateless for derivable properties (e.g., duration = completed_at - started_at).

---

## Transition Rules

| Current | Allowed Next | Notes |
|---------|--------------|-------|
| pending | in-progress | Acquire active manifest hash lock |
| in-progress | completed, blocked | Completed requires zero blocking gaps |
| blocked | in-progress | Clear reason required |
| completed | (none) | Immutable terminal |

Illegal transitions produce a validation error event; state unchanged.

---

## Drift Delta Semantics

| Change Type | Definition |
|-------------|------------|
| ADDED | Task appears in new manifest only |
| REMOVED | Task absent in new manifest but present previously |
| MODIFIED | Same `task_id` with changed fields (title, description, ac_hashes, risk, slice, phase) |
| MOVED | Phase or slice changed (also counts as MODIFIED) |
| UNCHANGED | Byte-identical task entry |

Delta algorithm processes tasks in sorted order; complexity O(n).

---

## Idempotency & Caching

| Aspect | Strategy |
|--------|----------|
| Manifest Re-run | Compare `manifest_hash`; if equal → return cached validation + delta |
| Partial State Loss | Rehydrate from JSON lines events (fold transitions) |
| Concurrency | Single-writer (transitions) with optimistic check on `manifest_hash` |
| Hash Drift | Recanonicalize & warn; never mutate original payload |

---

## GAP Handling Policy

| GAP Code | Blocking? | Action |
|----------|-----------|--------|
| GAP::YAGNI-CANDIDATE | Yes (for completion) | Require justification tag or manifest regeneration removing task |
| GAP::TASK-ORPHAN | Yes | Invalidate manifest (structural) |
| GAP::AC-UNMAPPED | Upstream | Should never reach Task Manager (blocked earlier) |
| GAP::PHASE-MISMATCH | Upstream | Propagate as warning only (should be zero) |
| GAP::RISK-MISSING | Conditional | Warn; block completion for High risk tasks |
| GAP::HASH-COLLISION | Yes | Block until collision resolved upstream |

---

## Query API (Conceptual Contract)

```ts
listTasks(filter: { phase?, slice?, state?, risk?, capabilityId? }) -> Task[]
getTask(id) -> Task | null
diffManifest(previousHash, currentHash) -> DriftDelta
taskMetrics(range?) -> { velocityPerCapability, meanCycleTime, wipCount }
```

All responses deterministic with identical inputs + state event log.

---

## Success Criteria

- Deterministic validation & diff with stable hashing.
- Zero false negatives on structural or referential integrity errors.
- O(1) task lookup by `task_id`; O(n) diff scaling with manifest size.
- No residual filesystem side-effects (no per-task files created).

---

## Non-Goals

- Editing or mutating manifest task definitions in place.
- Performing task decomposition heuristics.
- Executing implementation steps (delegated to TIA).

---

## Future Enhancements

- Pluggable persistence (SQLite or KV) for state map (optional).
- Event sourcing export for analytics pipeline.
- Webhook / callback emission on state transitions.
- Cached secondary indexes (by risk, by capability) for faster queries.

---

**Status:** Draft v0.1.0 (supersedes legacy file-based Task Manager spec)

*Analogy:* Formerly a librarian filing paper cards; now an API steward validating and serving an always-current digital catalog—no dusty shelves required.
