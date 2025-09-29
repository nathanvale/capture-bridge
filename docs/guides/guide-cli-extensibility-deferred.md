---
title: CLI Extensibility Deferred Features Guide
status: approved
owner: Nathan
version: 0.1.0
date: 2025-09-26
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# CLI Extensibility — Deferred Features Guide

> **Guide Type:** Deferred features catalog (YAGNI reference)
> **Status:** Features documented here are intentionally NOT IMPLEMENTED
> **Audience:** Product/engineering teams evaluating future CLI enhancements
> **Companion To:** [CLI Technical Specification](../features/cli/spec-cli-tech.md)

## 1. Purpose

Provide a controlled backlog of higher-complexity CLI capabilities explicitly **excluded** from the minimal core, each with measurable activation criteria and guardrails to prevent premature platformization.

## 2. Guiding Constraint

No extensibility feature may ship unless it directly increases one of:

1. Capture durability (loss prevention)
2. Operator observability required for reliability decisions
3. Throughput in inbox processing proven bottleneck (>30% time saved)

Otherwise: YAGNI.

## 3. Deferred Feature Catalog

| Feature                    | Description                                   | Activation Criteria                                  | Complexity (S/M/L) | Risk if Early                    |
| -------------------------- | --------------------------------------------- | ---------------------------------------------------- | ------------------ | -------------------------------- |
| Plugin Loader              | Load external JS modules for new commands     | 3+ requests AND stable API for 30 days               | L                  | API churn, security surface      |
| Event Hooks                | Lifecycle events (after-ingest, before-file)  | Need for side-car automation (>=2 use cases)         | M                  | Hidden coupling                  |
| Interactive REPL           | Stateful command shell                        | >5 sequential commands per session median            | M                  | Encourages long-lived state bugs |
| TUI Inbox                  | ncurses-like triage UI                        | CLI inbox processing adoption > 50% daily use        | L                  | Scope sprawl, input edge cases   |
| Doc Sync (bi-directional)  | Auto regenerate command docs & error registry | Manual drift corrections > 5/month                   | M                  | Build/tooling overhead           |
| Shell Completion           | Auto-complete generation                      | Command set stable (no rename) for 2 versions        | S                  | Maintenance overhead             |
| Performance Profiling Mode | `--profile` capturing CPU/time JSON           | Perf regressions > 10% quarter-over-quarter          | M                  | Premature optimization           |
| Telemetry Exporter         | Structured metrics to external sink           | Local metrics insufficient for reliability decisions | M                  | Privacy / scope creep            |
| Batch Voice Transcribe     | Multi-file parallel transcription command     | Single-shot voice batch usage > 20 files often       | M                  | CPU contention                   |
| Config Wizard              | Interactive setup                             | Support burden from misconfig > 5 open issues        | S                  | Added code paths                 |

## 4. Plugin Loader (Future Design Sketch)

If activated:

- Discover plugins in `./plugins/*.mjs` or `node_modules/@adhdbrain-plugin-*`.
- Strict sandbox: only pass limited API object (ingest, list, file, logger).
- Manifest validation via Zod; version negotiation.
- Hard timeout (config) for plugin command execution.
- Disallow dynamic `eval` or network by default.

Security Consideration: local-only usage reduces exfiltration risk, but plugin sources may be untrusted; introduce `--allow-plugin` confirmation on first run.

## 5. Event Hooks (Future Design Sketch)

Hook points (proposed):

- `capture:ingested`
- `capture:ready`
- `vault:written`

Delivery Mechanism: simple synchronous in-process invocation with try/catch isolation. If hook throws → log warning, do not fail main path.

## 6. Documentation Sync

Potential Flow:

1. Parse Commander program.
2. Emit structured JSON spec.
3. Generate Markdown reference under `docs/cli/commands/*.md`.
4. Validate during CI: fail if drift vs committed files.

Bidirectional (editing MD → regenerate code) explicitly out-of-scope (high churn risk).

## 7. Telemetry Exporter (Deferred)

Would push metrics JSON to a local endpoint or file for later inspection. Activation only if manual triage of reliability issues becomes time-consuming (≥ 2 incidents/month requiring historical timing distributions).

## 8. Performance Profiling Mode

`--profile` flag could wrap command execution & emit timing spans (ingest, db open, serialization). Not enabled until cold start or ingest latency misses targets for two consecutive releases.

## 9. Risk Matrix

| Risk                           | Category        | Impact           | Mitigation if Activated                           |
| ------------------------------ | --------------- | ---------------- | ------------------------------------------------- |
| API churn across plugins       | Maintainability | Breakage         | Semantic versioned plugin API, deprecation window |
| Excessive hook latency         | Performance     | Slower ingestion | Enforce per-hook timeout & metrics                |
| Security of arbitrary code     | Integrity       | Data leakage     | Sandbox object; optional permissions manifest     |
| Documentation drift automation | Process         | False confidence | Keep generation one-way; review diffs             |

## 10. Activation Governance

Each candidate requires a short RFC (< 1 page) referencing this doc and demonstrating metrics for activation criteria. Accept via lightweight ADR (status: accepted) before coding.

## 11. Sunset / De-scope Policy

If a feature remains unused (<5% command executions) for two consecutive minor versions, mark Deprecated → remove next major.

## 12. Open Questions

1. Should plugin sandbox enforce CPU time (worker threads)?
2. Do we sign plugin manifests with local key for tamper detection?
3. Is there a minimal safe subset worth pre-activating (e.g., shell completion) sooner?

## 13. Nerdy Metaphor

Extensibility features are like optional ADHD gadgets—fun, but you lock them in a drawer until the basic notebook habit (durable capture) is bulletproof.

## Related Documentation

**PRDs (Product Requirements):**

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - System-wide YAGNI principles
- [CLI Feature PRD](../features/cli/prd-cli.md) - Core CLI requirements

**Cross-Cutting Specifications:**

- [CLI Technical Spec](../features/cli/spec-cli-tech.md) - Current CLI implementation
- [CLI Architecture Spec](../features/cli/spec-cli-arch.md) - CLI design patterns

**Guides (How-To):**

- [Monorepo MPPP Guide](./guide-monorepo-mppp.md) - Package extensibility patterns
- [Test Strategy Guide](./guide-test-strategy.md) - Testing deferred features
- [TDD Applicability Guide](./guide-tdd-applicability.md) - When to test extensions

**ADRs (Architecture Decisions):**

- [ADR-0004: CLI as Feature Architecture](../adr/0004-cli-as-feature-architecture.md) - CLI architectural decisions
- [ADR-0009: CLI Exit Code Registry](../adr/0009-cli-exit-code-registry.md) - CLI conventions

**External Resources:**

- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Plugin Architecture Patterns](https://www.patterns.dev/posts/plugin-pattern)

## Maintenance Notes

**When to Update:**

- Feature activation criteria are met (see Section 3 table)
- New deferred feature candidates identified
- YAGNI boundaries evolve (Master PRD changes)
- Risk assessment changes for existing features

**Known Limitations:**

- Activation criteria are subjective and require judgment calls
- No automated tracking of criteria thresholds
- Plugin security model not fully specified

---

Version: 0.1.0
Last Updated: 2025-09-26
Author: Copilot (pairing with Nathan)
Change Log: initial draft
