---
adr: 0002
title: Dual Hash Migration (SHA-256 → BLAKE3)
status: proposed
context-date: 2025-09-26
owner: Nathan
---

## Status

Superseded by ADR-0004 (SHA-256 Only Hashing Strategy for MPPP)

## Context

Current and near-term capture ingestion needs:

- Fast, reliable content-addressable identity for deduplication.
- Forward flexibility for partial hashing (voice snippets, large payloads) and potential future hierarchical chunking.
- Reduced CPU cost relative to SHA-256 while maintaining collision resistance adequate for local knowledge store integrity.

SHA-256 is widely deployed and already used in early prototypes. BLAKE3 offers:

- Significantly higher throughput (SIMD-friendly, incremental).
- Built-in tree hashing enabling future chunk/partial strategies without redesign.
- Strong cryptographic properties sufficient for non-adversarial local environment.

Constraints:

- Must not invalidate or orphan previously captured items addressed only by SHA-256.
- Transition must be incremental, observable, reversible (if early issues arise).
- User experience must remain seamless (no manual re-hash intervention unless explicit command invoked).

## Decision

Adopt a phased dual-hash migration storing both SHA-256 (legacy) and BLAKE3 (new primary) until confidence and coverage criteria are met, then retire SHA-256 persistence.

### Phase Breakdown

| Phase | Name                     | Write Behavior                          | Dedup Order                   | Read / Listing             | Exit Criteria                                                    |
| ----- | ------------------------ | --------------------------------------- | ----------------------------- | -------------------------- | ---------------------------------------------------------------- |
| 0     | Legacy                   | SHA-256 only                            | SHA-256                       | SHA-256                    | Existing baseline (historical)                                   |
| 1     | Dual-Record Introduction | Compute + store both                    | BLAKE3 → SHA-256 fallback     | Prefer BLAKE3 when present | 100% new rows have both hashes 7 days; no divergence >0 observed |
| 2     | Prefer New               | Both stored                             | BLAKE3 → SHA-256 fallback     | Display BLAKE3 first       | Dedup hit ratio stable (<2% change) & no integrity anomalies     |
| 3     | Primary New              | Both stored                             | BLAKE3 only (no SHA fallback) | BLAKE3 only                | Zero SHA-256-only captures created in last 14 days               |
| 4     | Sunset Legacy            | Backfill audit; stop populating SHA-256 | BLAKE3 only                   | BLAKE3 only                | Manual confirmation; archive SHA index                           |
| 5     | Remove Legacy            | Drop SHA-256 column                     | BLAKE3 only                   | BLAKE3 only                | Backup + irreversible migration applied                          |

## Rationale

- Dual storage avoids blocking ingestion while verifying BLAKE3 integrity.
- Dedup precedence ensures we converge on BLAKE3 identities early while still honoring existing SHA-256 anchored items.
- Staged elimination lowers risk of silent corruption or hash implementation defects.
- Enables proactive metrics (hash divergence, performance) before full commitment.

## Metrics / Observability

| Metric                | Description                                     | Alert Threshold                         |
| --------------------- | ----------------------------------------------- | --------------------------------------- |
| hash_divergence_total | Count of mismatched recomputed vs stored hashes | >0 immediate investigate                |
| hash_compute_ms       | Histogram BLAKE3 vs SHA compute latency         | p95 BLAKE3 > 50% SHA p95                |
| dual_hash_rows_ratio  | Fraction of rows with both hashes               | < 1.0 in phases ≥1                      |
| sha256_only_rows      | Rows lacking BLAKE3                             | >0 in phases ≥1 (after backfill window) |

## Risks & Mitigations

| Risk                                 | Vector                    | Mitigation                                   |
| ------------------------------------ | ------------------------- | -------------------------------------------- |
| Implementation bug in BLAKE3 wrapper | Incorrect hash persisted  | Dual verification (recompute-on-read sample) |
| Silent partial file reads for voice  | Truncated hash surface    | Size + partial fingerprint length validation |
| Premature SHA column drop            | Data still relying on SHA | Phase gate + doctor command hard check       |
| Performance regression               | Unexpected CPU spikes     | Benchmark before advancing phase             |

## Alternatives Considered

1. Immediate cutover (no dual phase) – Higher risk; rejected.
2. Keep SHA-256 indefinitely – Extra storage + unnecessary CPU; rejected.
3. Use non-cryptographic hash (xxHash) for dedup – Higher collision risk for semantic identity; rejected.

## Operational Procedures

- Phase advancement via explicit CLI: `hash:migrate --to <phase>`.
- Doctor command surfaces current phase + blocking conditions.
- Rollback limited: can revert from phases 2→1 or 3→2 before schema changes (phase 5 irreversible).

## Open Questions

1. Backfill strategy for legacy SHA-256-only rows if any exist when adopting (batch vs on-demand)?
2. Do we materialize a rolling integrity audit table or rely solely on sampled recomputation?
3. Should we gate phase advancement on minimum row volume to establish statistical confidence?

## Decision Outcome

Pending prototype validation. Upon acceptance, status becomes accepted and implementation tasks (migration script, CLI command, metrics hooks) are created.

## References

- Capture PRD `docs/features/capture/prd-capture.md`
- Capture Technology Spec `docs/features/capture/spec-capture-tech.md`
- Architecture Spec `docs/features/capture/spec-capture-arch.md`
