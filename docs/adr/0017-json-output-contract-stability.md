---
adr: 0005
title: JSON Output Contract Stability for CLI Automation
status: accepted
context-date: 2025-09-28
owner: Nathan
---

## Status

Accepted

## Context

The ADHD Brain CLI serves dual purposes:
1. **Human interaction**: Readable tables, colors, progress indicators
2. **Automation**: Shell scripts, CI/CD pipelines, integration tools

Automation consumers require:
- **Stable interfaces**: JSON schemas that don't break on updates
- **Reliable parsing**: Consistent field names, types, and structure
- **Backward compatibility**: Existing scripts continue working after CLI updates
- **Machine readability**: No ANSI escape codes or formatting artifacts

The CLI provides a `--json` flag for all commands that enables machine-readable output. This creates a **contract** with automation consumers that must be maintained over time.

Key challenges:
- Human output can change freely (formatting, colors, wording)
- JSON output changes can break downstream scripts
- Need flexibility to add new fields without breaking existing parsers
- Performance and startup time constraints (< 150ms)

Referenced in:
- [CLI PRD](../features/cli/prd-cli.md) §6 Decisions (Locked)
- [CLI Technical Specification](../features/cli/spec-cli-tech.md) §7 Output Conventions
- [CLI Testing Specification](../features/cli/spec-cli-test.md) §4 JSON Output Schema Strategy

## Decision

**Implement strict backward compatibility for JSON output schemas with explicit versioning and contract testing.**

### JSON Output Requirements

1. **Backward Compatibility**: Never remove fields or change types in released schemas
2. **Additive Changes Only**: New optional fields are allowed and expected
3. **Schema Versioning**: Include schema version in output for major changes
4. **Contract Testing**: Automated tests prevent accidental breaking changes
5. **Clean Output**: No ANSI codes, no mixed human/JSON content

### Schema Evolution Rules

| Change Type | Allowed | Example | Impact |
|-------------|---------|---------|---------|
| Add optional field | ✅ Yes | `"newField": "value"` | Non-breaking |
| Add nested object | ✅ Yes | `"metadata": { "created": "..." }` | Non-breaking |
| Remove field | ❌ Never | ~~`"oldField"`~~ | Breaking |
| Change field type | ❌ Never | `"count"` string → number | Breaking |
| Rename field | ❌ Never | `"id"` → `"identifier"` | Breaking |
| Change array structure | ❌ Never | `[string]` → `[{id, name}]` | Breaking |

### Implementation Pattern

```typescript
// JSON schema definition with Zod
const captureVoiceSchema = z.object({
  id: z.string(),
  contentHash: z.string(),
  status: z.enum(['staged', 'processing', 'filed']),
  duplicate: z.boolean(),
  // New fields must be optional
  transcribe: z.string().optional(),
  // Nested objects allowed
  metadata: z.object({
    created: z.string(),
    tags: z.array(z.string())
  }).optional()
});

// Output with explicit schema reference
if (options.json) {
  const output = {
    schema_version: "1.0",
    ...result
  };
  console.log(JSON.stringify(output, null, 0)); // No pretty printing for machines
}
```

## Rationale

### 1. Automation Reliability
Shell scripts and CI/CD pipelines depend on predictable interfaces. Breaking changes force consumers to:
- Update parsing logic
- Handle version detection
- Maintain compatibility shims
- Risk production failures during upgrades

### 2. Developer Experience
Stable contracts reduce friction for:
- Integration development
- Script maintenance
- CLI adoption in larger teams
- Third-party tool development

### 3. Version Management
Schema versions provide:
- Clear communication about compatibility
- Opt-in migration path for major changes
- Debugging support for integration issues

### 4. Performance Benefits
- No pretty-printing saves output time
- Schema validation catches issues early
- Contract tests prevent performance regressions

## Alternatives Considered

### 1. No JSON Mode (Human Output Only)
- **Pros**: Simpler implementation, no compatibility burden
- **Cons**: Blocks automation, forces screen scraping
- **Rejected**: Automation is core requirement for shell integration

### 2. Best-Effort Compatibility
- **Pros**: Flexibility to improve output format
- **Cons**: Unpredictable breaking changes, poor automation experience
- **Rejected**: Undermines primary automation use case

### 3. GraphQL-Style Field Selection
- **Pros**: Consumers request only needed fields
- **Cons**: Complex implementation, over-engineering for CLI use case
- **Rejected**: YAGNI - current approach simpler and sufficient

### 4. Separate Machine API
- **Pros**: Complete separation of concerns
- **Cons**: Duplicate implementation, different behavior between interfaces
- **Rejected**: Maintenance overhead not justified

## Consequences

### Positive
- **Reliable automation**: Scripts continue working across CLI updates
- **Clear contracts**: Explicit schemas document expected output
- **Reduced support**: Fewer integration bugs and breaking change incidents
- **Testing coverage**: Contract tests prevent accidental API changes
- **Performance**: Clean JSON output optimized for parsing

### Negative
- **Technical debt**: Old field names must be maintained indefinitely
- **Implementation complexity**: Schema validation and testing overhead
- **Flexibility constraints**: Can't easily refactor output structures
- **Documentation burden**: Must document schema evolution carefully

### Mitigation Strategies
- Use optional fields liberally to minimize future compatibility issues
- Implement comprehensive contract test suite
- Document deprecation process for future major version changes
- Plan schema design carefully before initial release

## Implementation Requirements

### Contract Test Suite
```typescript
// tests/contracts/json-schemas.spec.ts
describe('JSON Output Contracts', () => {
  it('capture voice output matches schema v1.0', async () => {
    const result = await execCLI(['capture', 'voice', 'test.m4a', '--json']);
    const output = JSON.parse(result.stdout);

    expect(output).toMatchSchema(captureVoiceSchemaV1);
    expect(output.schema_version).toBe('1.0');
  });

  it('maintains backward compatibility', async () => {
    // Test against snapshot of previous version output
    const result = await execCLI(['capture', 'voice', 'test.m4a', '--json']);
    const output = JSON.parse(result.stdout);

    // Must contain all fields from v1.0
    expect(output).toHaveProperty('id');
    expect(output).toHaveProperty('contentHash');
    expect(output).toHaveProperty('status');
    expect(output).toHaveProperty('duplicate');
  });
});
```

### Schema Documentation
- Store JSON schemas in `docs/schemas/cli-*.json`
- Generate documentation from schemas
- Include example outputs in CLI help text

### Deprecation Process (Future)
When major schema changes are needed:
1. Add new schema version alongside existing
2. Support both versions for ≥2 major releases
3. Warn users about deprecated version
4. Remove old version only after adoption metrics support it

## Success Metrics

- Zero CLI JSON output breaking changes in Phase 1-4
- Contract test suite prevents >95% of potential breaking changes
- CLI automation scripts require ≤1 update per quarter
- JSON parsing errors <0.1% in production automation

## References

- [CLI PRD](../features/cli/prd-cli.md) - Product requirements and JSON output decision
- [CLI Technical Specification](../features/cli/spec-cli-tech.md) - Implementation details
- [CLI Testing Specification](../features/cli/spec-cli-test.md) - Contract testing strategy
- JSON Schema specification: https://json-schema.org/
- Semantic Versioning: https://semver.org/

## Revision History

- 2025-09-28: Initial decision documentation