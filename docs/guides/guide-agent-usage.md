---
title: "Agent Usage Guide - Specs & ADRs"
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-27
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Agent Usage Guide — Specs & ADRs

## Purpose

This guide explains how to **use the ADHD Brain agents** when writing new specs or maintaining existing ones. Think of agents as specialized roles that keep your documentation ecosystem healthy and ADHD-proof.

**Target Audience:** Developers and documentation authors working on PRDs, technical specs, architecture specs, and ADRs.

## When to Use This Guide

Use this guide when:
- Creating a new PRD or technical specification
- Updating an existing spec
- Running documentation audits
- Ensuring ADR compliance and cross-referencing
- Maintaining documentation quality and consistency

## Prerequisites

- Familiarity with the [Master PRD](../master/prd-master.md) system architecture (v2.3.0-MPPP)
- Understanding of the [Roadmap](../master/roadmap.md) feature delivery schedule
- Knowledge of [TDD Applicability Guide](./tdd-applicability.md) framework
- Access to [ADR Index](../adr/_index.md) for architecture decisions

## Quick Reference

**Agent Roles at a Glance:**

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| [Spec Architect](../agents/spec-architect.md) | Structure, TDD section, YAGNI checks | Creating/reviewing specs |
| [ADR Curator](../agents/adr-curator.md) | Decision capture and freezing | Identifying architectural decisions |
| [Spec Librarian](../agents/spec-librarian.md) | Formatting, indexing, cross-linking | Ensuring navigation and links |
| [Documentation Steward](../agents/documentation-steward.md) | Clarity, readability, style | Final polish and consistency |

**Pre-Merge Checklist:**
- [ ] TDD Applicability Decision included
- [ ] New decisions captured as ADRs
- [ ] Bidirectional ADR links (spec ↔ ADR)
- [ ] Documentation Steward sign-off on clarity/style

## Step-by-Step Instructions

### Step 1: When Creating a New Spec (PRD or Tech Spec)

1. **Pick the relevant agents**
   - **[Spec Architect](../agents/spec-architect.md)** → ensures the structure, TDD section, YAGNI checks
   - **[ADR Curator](../agents/adr-curator.md)** → captures decisions that should be frozen
   - **[Spec Librarian](../agents/spec-librarian.md)** → ensures formatting, indexing, and cross-linking
   - **[Documentation Steward](../agents/documentation-steward.md)** → ensures clarity, readability, and style

2. **Flow**
   - Draft your spec → run it through **[Spec Architect](../agents/spec-architect.md)** for structure and completeness
   - Ask **[ADR Curator](../agents/adr-curator.md)**: *"Are there decisions here that need to be an ADR?"*
   - Cross-check with **[Spec Librarian](../agents/spec-librarian.md)**: *"Does this link to existing ADRs, storage spec, etc.?"*
   - Final pass with **[Documentation Steward](../agents/documentation-steward.md)** for polish

3. **Outputs**
   - Spec with:
     - Executive Summary  
     - Success Metrics  
     - TDD Applicability Decision  
     - YAGNI boundaries  
     - Cross-links to ADRs  
   - ADR file(s) in `/docs/adr` if needed.

---

### Step 2: When Updating an Existing Spec

1. **Check for Drift**
   - Use **ADR Curator**: *“Does this change overturn a decision in an ADR?”*
   - If yes, update ADR status (e.g., `superseded`) and add successor ADR.

2. **Audit Links**
   - Use **Spec Librarian** to confirm:
     - Spec still links to all relevant ADRs.
     - No broken or missing cross-references.

3. **Review for Clarity**
   - Use **Documentation Steward**: is the updated section readable, consistent, and in house style?

---

### Step 3: Running an ADR Audit

Every month (or before a milestone):

- **ADR Curator** runs through `/docs/adr` vs. `/docs/specs`:
  - Flags specs with undocumented decisions.
  - Flags ADRs with no references.
- Outcome: Patch notes or new ADRs.

---

## Common Patterns

**Agent Workflow Sequence for New Specs:**
1. Draft initial spec
2. Run through **Spec Architect** for structure and completeness
3. Consult **ADR Curator** to identify decisions requiring ADRs
4. Cross-check with **Spec Librarian** for links and formatting
5. Final pass with **Documentation Steward** for polish

**Agent Workflow for Spec Updates:**
1. Check for drift with **ADR Curator**
2. Audit links with **Spec Librarian**
3. Review clarity with **Documentation Steward**

**Best Practices:**
- Treat agents as part of the PR template (mention which agents were consulted in each PR)
- Run ADR audits monthly or before major milestones
- Ensure bidirectional links between specs and ADRs
- Always include TDD Applicability Decision in new specs

**Anti-Patterns to Avoid:**
- Skipping agent consultation before merging specs
- Creating specs without ADR review
- Breaking cross-reference links during updates
- Missing YAGNI boundaries in technical specs

## Troubleshooting

**Problem:** Spec rejected due to missing TDD section
**Solution:** Review [TDD Applicability Guide](./tdd-applicability.md) and add the decision framework to your spec

**Problem:** ADR links broken after reorganization
**Solution:** Run **Spec Librarian** audit to identify and fix all broken references

**Problem:** Unclear which agent to consult first
**Solution:** Follow the workflow sequence: Architect → Curator → Librarian → Steward

**Problem:** ADRs not referenced in any spec
**Solution:** Run periodic ADR audit with **ADR Curator** to identify orphaned decisions

## Examples

**Quick Analogy:**
Specs are the *playbooks*.
ADRs are the *laws*.
Agents are the *parliament staff* making sure every law is filed, every playbook is consistent, and nothing gets lost in the chaos of ADHD thought. 🧑‍⚖️📚

**Author Checklist Before Merging:**
- [ ] Does it include a **TDD Applicability Decision**?
- [ ] Have all **new decisions** been captured as ADRs?
- [ ] Do ADR links point both ways (spec ↔ ADR)?
- [ ] Did the **Documentation Steward** sign off on clarity/style?

## Related Documentation

**Core Documentation:**
- [Master PRD](../master/prd-master.md) - System-wide vision and architecture (v2.3.0-MPPP)
- [Roadmap](../master/roadmap.md) - Feature delivery schedule aligned with MPPP
- [TDD Applicability Guide](./tdd-applicability.md) - Framework for TDD decisions
- [ADR Index](../adr/_index.md) - All architecture decision records

**Agent Documentation:**
- [Spec Architect](../agents/spec-architect.md) - Structure and completeness enforcement
- [ADR Curator](../agents/adr-curator.md) - Decision capture and management
- [Spec Librarian](../agents/spec-librarian.md) - Formatting and cross-linking
- [Documentation Steward](../agents/documentation-steward.md) - Clarity and style

**Templates:**
- [PRD Template](../templates/prd-template.md)
- [Architecture Spec Template](../templates/arch-spec-template.md)
- [Technical Spec Template](../templates/tech-spec-template.md)
- [Test Spec Template](../templates/test-spec-template.md)

## Maintenance Notes

**When to Update This Guide:**
- When new agents are added to the system
- When agent workflows change significantly
- When new documentation patterns emerge
- After quarterly documentation audits

**Next Steps for Adoption:**

- **New specs** → run the agent workflow in sequence.
- **Existing specs** → review with Curator + Librarian before editing.
- **Team adoption** → treat agents as part of the PR template (each PR should mention which agents were "consulted").  
