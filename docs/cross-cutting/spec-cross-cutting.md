# Cross-Cutting Docs Spec — ADHD Capture Bridge

**Folder:** `/docs/cross-cutting`  
**Purpose:** Single home for system-wide decisions that apply across all feature PRDs (foundation/monorepo, security & privacy, performance targets, global testing/TDD, architecture overview, dependency and boundary rules).

---

## 1) Scope & Responsibilities

Cross-cutting docs **define platform rules** every feature must obey:

- **Foundation & Monorepo:** workspace layout, build tools, packaging, shared configs.
- **Architecture Overview:** end-to-end diagrams, boundaries, directionality (one-way).
- **Security & Privacy:** local-only constraints, data handling, logs, redaction.
- **Performance:** global budgets (stage <100ms, file <1s, inbox query <50ms for 1k).
- **Global Testing Strategy:** TDD-by-risk rubric, coverage bars, TestKit patterns.
- **Boundary Enforcement:** who can import whom; anti-coupling rules; shared types.
- **Review & Change Control:** how cross-cutting changes are proposed, reviewed, merged.

> Out of scope: feature details (live in `/docs/features/*`), product vision (lives in `/docs/master`).

---

## 2) Folder Structure (Authoritative)

/docs/cross-cutting
├─ spec-architecture-overview.md     # System map, boundaries, directionality
├─ /foundation                        # Monorepo, build, packaging, shared configs
├─ spec-security-privacy.md          # Local-only policies, pii, logs, backups
├─ spec-performance.md               # Perf budgets, load targets, test methods
├─ spec-testing-strategy.md          # TDD rubric, lanes, contract/e2e patterns
├─ spec-boundaries.md                # Import/ownership rules, ADR links
├─ adr/                              # Architecture Decision Records (small)
│  ├─ 0001-directionality-one-way.md
│  ├─ 0002-sqlite-staging-ledger.md
│  └─ 0003-conflict-sibling-policy.md
└─ checklists/
├─ review-checklist.md            # What reviewers must verify
└─ release-gates.md               # Must-pass gates before tagging “beta”

**Note:** If you prefer finer granularity, you may nest:
`/cross-cutting/foundation/` with `spec-foundation-tech.md`, `spec-foundation-test.md`, etc.

---

## 3) Document Contracts (What each file must answer)

### 3.1 `spec-architecture-overview.md`
- One diagram + 1-page narrative of **Input → Staging → Processing → Obsidian**.
- **Directionality:** MVP is one-way (ledger → vault), and why.
- Clear **module boundaries** and **ownership**.

### 3.2 `spec-foundation.md`
- **Monorepo**: pnpm workspaces, Node 20, TS strict, Turbo, tsup.
- **Shared configs**: ESLint/Prettier (Orchestr8), Vitest lanes, Storybook/Playwright stubs.
- **Packaging strategy**: CLI via Bun (later), docs tool (optional).
- **DX**: wallaby, <5s feedback loops.

### 3.3 `spec-security-privacy.md`
- **Local-only** guarantee; no telemetry; no cloud APIs.
- **Data classes** (audio, email, web snapshots) and handling rules.
- **Logs**: structured, redact sensitive fields; user-readable.
- **Backups**: frequency, retention (SQLite backup cadence).

### 3.4 `spec-performance.md`
- Global SLOs & measurement plan (budgets & test harness).
- **Regression detection**: fail build if budgets exceeded.
- Known scale assumptions (1–5k staged items, 100k vault notes later?).

### 3.5 `spec-testing-strategy.md`
- **TDD-by-risk:** Required for integrity/idempotency/atomicity; Optional for UI polish.
- **Lanes:** unit / integration / contract / e2e / crash-recovery drills.
- **TestKit** patterns: fs atomic write simulation, msw adapters, fake timers.

### 3.6 `spec-boundaries.md`
- **Dependency graph**: allowed imports (e.g., `apps/*` → `packages/*`; `packages/ui` cannot import `storage`).
- **Ownership**: who maintains which package/spec.
- **Enforcement**: lint rules, boundary tests, CI checks.

### 3.7 ADRs (`/adr/*.md`)
- One page each; context → decision → consequences → date.
- Link back to Master PRD section when relevant.

---

## 4) Versioning & Change Control

- **Minor updates** (typos, clarifications): PR with 1 reviewer (Foundation owner).
- **Policy/Boundary changes**: require an **ADR** + 2 reviewers (Foundation + affected area).
- **Breaking cross-cutting changes** (e.g., switch bundler): RFC issue → ADR → PR with OWNERs approval.
- Every feature PR **must** reference the cross-cutting version it complies with (header badge).

---

## 5) Review Gates (What must be true before merging)

- Cross-cutting change has:
  - ✅ Updated **diagram** if boundaries affected
  - ✅ **ADR** when changing directionality, storage, privacy, or budgets
  - ✅ **Checklists** updated if reviewer behavior changes
  - ✅ CI passes **boundary tests** & **perf budgets**

See `/docs/cross-cutting/checklists/review-checklist.md`.

---

## 6) TDD Applicability Decision (for Cross-Cutting Area)

- **Risk class:** Medium (platform integrity); High for: integrity, idempotency, atomic writes.
- **Decision:**  
  - **Required**: boundary tests, file atomicity contract tests, perf budget tests.  
  - **Optional**: docs linting, spelling, link checks.
- **YAGNI:** No auto-generated graphs, no live docs site, no policy engines. Keep it simple.

---

## 7) Compliance Rules (How features align to cross-cutting)

- Every **feature Tech Spec** must include:
  - “Cross-cutting compliance” subsection that lists:
    - Security/Privacy alignment (data classes handled)
    - Perf budget impact (none / updated)
    - Boundary adherence (imports, ownership)
    - TDD decision referencing global rubric
- PRs that add a new dep or cross a boundary **must** update `spec-boundaries.md` or explain why not applicable.

---

## 8) Deliverables Checklist (Maintainers)

- [ ] `spec-architecture-overview.md` up to date with single source diagram  
- [ ] `spec-foundation.md` reflects current toolchain  
- [ ] `spec-security-privacy.md` includes log redaction map  
- [ ] `spec-performance.md` has budgets + CI guardrails  
- [ ] `spec-testing-strategy.md` defines test lanes + exit criteria  
- [ ] `spec-boundaries.md` lists allowed imports + package owners  
- [ ] Latest ADRs present for directionality, SQLite staging, conflict siblings  
- [ ] Review checklists synced with current policies

---

## 9) Linked Artifacts

- **Master PRD:** `/docs/master/prd-master.md`  
- **Feature PRDs:** `/docs/features/*/prd-*.md`  
- **Tech Specs & Test Specs:** colocated under each feature folder  
- **Boundary Tests:** `/packages/_boundary-specs/` (test code), docs here.

---

## 10) One-page “How to Propose a Cross-Cutting Change”

1. Open RFC issue with: problem, options, risks, blast radius.  
2. Draft ADR in `/docs/cross-cutting/adr/` (next number).  
3. Update relevant spec(s) (`spec-*.md`).  
4. Run boundary + perf tests locally; link results in PR.  
5. Request review from **Foundation Owner** + 1 domain owner.  
6. If approved: merge ADR + specs; announce in Changelog/README.

---

## 11) Nerdy Joke Corner
These docs are the CSS of your architecture: invisible when correct, horrifying when missing. 🧩

---

## 12) Open Questions
1. Do we want **auto-generated dependency graphs** in CI (nice-to-have)?  
2. Should we enforce perf budgets with a **single JSON manifest** read by tests?  
3. Do we require an ADR for **raising** vs **lowering** perf budgets?

If you want, I can also fill in the starter files for each item above (architecture overview, security & privacy, performance, testing strategy, boundaries, and three ADRs) to make /docs/cross-cutting immediately “green”.