---
title: Documentation Audit Checklist
status: draft
owner: spec-librarian
version: 0.1.0
---

# 📋 Documentation Audit Checklist

Use this checklist during **spec reviews**, **PRD integrations**, and **periodic audits** (e.g. monthly or after N new docs).  
The goal: enforce structure, catch drift, and keep the docs tree navigable.

---

## 1. File Location & Naming
- [ ] Document is in the **correct folder**:
  - `docs/cross-cutting/`  
  - `docs/features/<feature>/`  
  - `docs/master/`  
  - `docs/adr/`  
  - `docs/templates/`  
- [ ] File name follows pattern:
  - `prd-<feature>.md`  
  - `spec-<feature>-arch.md`  
  - `spec-<feature>-tech.md`  
  - `spec-<feature>-test.md`  
  - `adr-<number>-<title>.md`  

---

## 2. Front Matter Compliance
- [ ] `title` present, descriptive, consistent  
- [ ] `status` valid (`draft|review|approved|deprecated`)  
- [ ] `owner` present and resolvable  
- [ ] `version` present and bumped if major edits  

---

## 3. Template Sections
- [ ] All required template sections present:
  - Executive Summary  
  - Success Criteria  
  - TDD Applicability Decision  
  - YAGNI Considerations  
  - Risks & Mitigations  
- [ ] Cross-cutting specs aligned with latest `/docs/templates/` versions  
- [ ] Drift flagged or auto-fixed  

---

## 4. Cross-Link Hygiene
- [ ] PRD links to all related specs  
- [ ] Specs reference parent PRD  
- [ ] ADRs linked from at least one PRD or spec  
- [ ] Relative paths resolve correctly (`../features/...` not hardcoded `/docs/...`)  
- [ ] No orphaned documents  

---

## 5. Indices & Knowledge Maps
- [ ] `docs/master/index.md` updated with new/removed docs  
- [ ] `docs/master/roadmap.md` reflects logical groupings  
- [ ] ADR index lists all ADRs in chronological order  
- [ ] Cross-cutting index updated if relevant  

---

## 6. Immediate Issues
- [ ] Broken links resolved  
- [ ] Missing required sections flagged  
- [ ] Misplaced or duplicate files corrected  
- [ ] Template drift corrected  

---

## 7. Deliverables
At the end of each audit, produce:
- **Immediate Issues Report** (blockers, broken links, missing sections)  
- **Compliance Report** (per-file adherence)  
- **Updated Indices** (regenerated where necessary)  
- **Drift Analysis** (files deviating from templates)  

---

*Nerdy aside: Think of this as the “pre-flight checklist” for our doc library — no spec takes off without clearance from the librarian tower.* 🛫📚