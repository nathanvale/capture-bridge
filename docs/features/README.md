# Feature Documentation

This directory contains Product Requirements Documents (PRDs) and technical specifications for all features in the ADHD Brain project.

## Feature Organization

Each feature has its own subdirectory containing:
- `prd-{feature}.md` - Product Requirements Document
- `spec-{feature}-arch.md` - Architecture Specification
- `spec-{feature}-tech.md` - Technical Implementation Specification
- `spec-{feature}-test.md` - Test Specification

## Active Features (MPPP Scope)

### [Capture](./capture/)
Zero-friction capture layer for voice memos and email forwarding. Provides durable entry into the system with deduplication and crash recovery.

**Key Documents:**
- [PRD: Capture Feature](./capture/prd-capture.md)
- [Architecture Spec](./capture/spec-capture-arch.md)
- [Technical Spec](./capture/spec-capture-tech.md)
- [Test Spec](./capture/spec-capture-test.md)

### [Staging Ledger](./staging-ledger/)
SQLite-based durability layer that stages all captured content before export. Provides crash recovery, deduplication, and audit trail.

**Key Documents:**
- [PRD: Staging Ledger](./staging-ledger/prd-staging.md)
- [Architecture Spec](./staging-ledger/spec-staging-arch.md)
- [Technical Spec](./staging-ledger/spec-staging-tech.md)
- [Test Spec](./staging-ledger/spec-staging-test.md)

### [Obsidian Bridge](./obsidian-bridge/)
Export layer that transforms staged content into markdown notes in the Obsidian vault using the Direct Export Pattern.

**Key Documents:**
- [PRD: Obsidian Bridge](./obsidian-bridge/prd-obsidian.md)
- [Architecture Spec](./obsidian-bridge/spec-obsidian-arch.md)
- [Technical Spec](./obsidian-bridge/spec-obsidian-tech.md)
- [Test Spec](./obsidian-bridge/spec-obsidian-test.md)

### [CLI](./cli/)
Command-line interface providing automation-friendly commands with JSON output contracts and stable exit codes.

**Key Documents:**
- [PRD: CLI Feature](./cli/prd-cli.md)
- [Architecture Spec](./cli/spec-cli-arch.md)
- [Technical Spec](./cli/spec-cli-tech.md)
- [Test Spec](./cli/spec-cli-test.md)

## Deferred Features (Post-MPPP)

### [Inbox](./inbox/)
Currently deferred. Placeholder directory for future inbox triage functionality.

### [Intelligence](./intelligence/)
Currently deferred. Placeholder directory for future RAG/semantic features.

## Related Documentation

- [Master PRD](../master/prd-master.md) - Overall project requirements
- [Roadmap](../master/roadmap.md) - Feature prioritization and phases
- [Cross-Cutting Concerns](../cross-cutting/) - Foundation and shared patterns
- [ADRs](../adr/) - Architectural decisions affecting features
- [Guides](../guides/) - Implementation guides and patterns

## Documentation Standards

All feature documentation follows templates from [`docs/templates/`](../templates/):
- [PRD Template](../templates/prd-template.md)
- [Architecture Spec Template](../templates/arch-spec-template.md)
- [Technical Spec Template](../templates/tech-spec-template.md)
- [Test Spec Template](../templates/test-spec-template.md)

## Quick Reference

| Feature | Status | Risk Level | P0 Components |
|---------|--------|------------|---------------|
| Capture | Active | HIGH | Voice file handling, deduplication |
| Staging Ledger | Active | HIGH | Write operations, state transitions |
| Obsidian Bridge | Active | HIGH | Export atomicity, hash integrity |
| CLI | Active | MEDIUM | Exit codes, JSON contracts |
| Inbox | Deferred | - | - |
| Intelligence | Deferred | - | - |