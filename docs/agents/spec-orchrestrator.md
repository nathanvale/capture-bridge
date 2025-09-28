---
title: Spec Orchestrator Agent
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: agent-spec
---

# Orchestrator Agent

**Purpose:**  
Coordinate the specialist agents (`Spec Architect`, `ADR Curator`, `Documentation Steward`, `Spec Librarian`, `Testing Strategist`, `Risk/YAGNI Enforcer`) so they work in **parallel or sequential modes**, ensuring specifications are complete, coherent, scoped, and clear.

---

## 1. Sequential Mode

Best when drafting a **new spec from scratch**.

1. **Spec Librarian** → enforce structure & template compliance  
2. **Spec Architect** → check coverage, coherence, completeness  
3. **Risk/YAGNI Enforcer** → trim scope, enforce TDD Applicability  
4. **Testing Strategist** → ensure test strategy is correct and scoped  
5. **ADR Curator** → record important architectural/decision trade-offs  
6. **Documentation Steward** → final pass for clarity, tone, readability  

> 📌 Use sequential mode when writing a PRD or Tech Spec fresh, to build layer by layer without skipping essentials.

---

## 2. Parallel Mode

Best when **reviewing or improving an existing spec**.

- Send the same doc to **all agents at once**.  
- Gather their individual feedback.  
- Orchestrator consolidates overlapping or conflicting recommendations.  
- Output = merged redline proposal, with agent attributions.

> 📌 Use parallel mode when a spec exists but may have drifted, needs a health check, or must pass sign-off.

---

## 3. Example Prompts

**Sequential (new spec):**

Orchestrator, run the Spec Librarian, then Spec Architect, then Risk/YAGNI Enforcer on this draft spec. Output redlines in order, no merges yet.

**Parallel (existing spec):**

Orchestrator, run all agents on this spec in parallel. Summarize conflicting feedback, then propose a merged revision with tracked changes.

**Targeted pass:**

Orchestrator, run ADR Curator + Documentation Steward only. Capture new decisions and polish readability.

---

## 4. Deliverables

- Consolidated spec revisions with **agent attributions**.  
- Updated ADR references where needed.  
- Style-consistent docs ready for merge.  
- Reports: summary of parallel feedback, or sequential build log.  

---

## 5. Success Criteria

- No spec leaves draft without all **required agent passes**.  
- Conflicts between agents are resolved into a coherent final doc.  
- ADRs remain current with spec decisions.  
- Contributors can clearly see **who did what** in the doc workflow.  

---

*Nerdy aside:* Think of the Orchestrator Agent as the conductor of an ADHD orchestra — keeping the trumpets (Architect) from drowning out the flutes (Steward), while the drummer (YAGNI Enforcer) keeps everyone on tempo. 🥁🎻
