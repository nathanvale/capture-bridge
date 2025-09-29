---
adr: 00XX
title: <Descriptive Decision Title>
status: proposed
context-date: <YYYY-MM-DD>
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 00XX: <Descriptive Decision Title>

## Status

**Proposed** | Accepted | Deprecated | Superseded

*If superseded, reference the superseding ADR number and link*

## Context

*What situation, problem, or requirement prompted this architectural decision? Include:*
- Business or technical drivers
- Constraints and requirements
- Current state that needs to change
- Stakeholder concerns or user needs
- Timeline pressures or scope limitations

*Reference relevant PRDs, specs, or other ADRs that provide additional context.*

## Decision

*The specific architectural choice being made. Be concrete and actionable:*
- What exactly are we choosing to do?
- What technology, pattern, or approach will be used?
- What are the key implementation details?
- What are the non-negotiable requirements?

*Use bullet points or numbered lists for clarity when describing multi-part decisions.*

## Alternatives Considered

*Document the other options that were evaluated and why they were rejected:*

1. **Alternative 1**: Brief description
   - Pros: Benefits of this approach
   - Cons: Why it was rejected
   - Impact: What would have been different

2. **Alternative 2**: Brief description
   - Pros: Benefits of this approach
   - Cons: Why it was rejected
   - Impact: What would have been different

3. **Alternative 3**: Brief description
   - Pros: Benefits of this approach
   - Cons: Why it was rejected
   - Impact: What would have been different

## Consequences

### Positive
- *Benefits and advantages of this decision*
- *Problems it solves*
- *Capabilities it enables*
- *Quality attributes it improves (performance, reliability, maintainability, etc.)*

### Negative
- *Drawbacks and limitations*
- *New complexities introduced*
- *Future flexibility constrained*
- *Technical debt created*
- *Ongoing maintenance overhead*

### Quality Assurance
*If applicable, describe testing strategy, monitoring, or validation approaches:*
- P0 Tests: Critical functionality that must be verified
- P1 Tests: Important operational requirements
- P2 Tests: Nice-to-have coverage for edge cases
- Monitoring: What metrics or observability is needed

## Implementation Notes

*Optional section for implementation-specific details:*
- Rollout strategy or migration plan
- Feature flags or phased deployment
- Performance characteristics or SLAs
- Security considerations
- Backwards compatibility requirements

## References

*Links to related documentation:*
- [Related PRD](../master/prd-master.md)
- [Technical Specification](../features/<feature>/spec-<feature>-tech.md)
- [Architecture Notes](../features/<feature>/spec-<feature>-arch.md)
- [Test Specification](../features/<feature>/spec-<feature>-test.md)
- [Related ADRs](./00XX-related-decision.md)
- [External Documentation](https://example.com/docs)

---

## Template Usage Instructions

1. **File Naming**: Use format `00XX-descriptive-title.md` where XX is the next sequential number
2. **YAML Front Matter**: Update adr number, title, context-date, and status
3. **Cross-References**: Add bidirectional links to related PRDs, specs, and ADRs
4. **Index Update**: Add entry to `/docs/adr/_index.md` immediately after creation
5. **Status Management**: Update status from "proposed" to "accepted" when finalized

### Status Definitions
- **Proposed**: Under review and discussion
- **Accepted**: Approved and being implemented
- **Deprecated**: No longer recommended but not replaced
- **Superseded**: Replaced by a newer ADR (include reference)

### Quality Checklist
- [ ] Decision is specific and actionable, not vague
- [ ] Context explains the "why" behind the decision
- [ ] Alternatives section shows other options were considered
- [ ] Consequences include both benefits and drawbacks
- [ ] All referenced documents exist and are correctly linked
- [ ] ADR follows the project's architectural principles
- [ ] Cross-references are bidirectional (source docs link back to this ADR)