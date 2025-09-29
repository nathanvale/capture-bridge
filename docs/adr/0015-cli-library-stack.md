---
adr: 0015
title: CLI Library Stack Selection (Commander.js + Zod)
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

## Status

Accepted

## Context

The ADHD Brain CLI requires robust argument parsing, command organization, and input validation capabilities. The CLI serves as the primary user interface for Phases 1-4, handling:

- Multiple commands (`capture voice`, `doctor`, `ledger list`, etc.)
- Complex argument validation (file paths, enums, optional flags)
- Structured error reporting for both human and machine consumption
- JSON output mode for automation scripts

Key requirements:

- TypeScript support for type safety
- Industry-standard patterns for maintainability
- Startup time < 150ms (performance constraint)
- Structured validation with clear error messages
- Minimal dependency footprint

Referenced in:

- [CLI PRD](../features/cli/prd-cli.md) §6 Decisions (Locked)
- [CLI Technical Specification](../features/cli/spec-cli-tech.md) §3.2 Dependencies

## Decision

**Use Commander.js v12+ as the CLI framework and Zod v3+ for input validation.**

### CLI Framework: Commander.js

- Handles command parsing, help generation, and option management
- Provides fluent API for command registration
- Built-in TypeScript definitions
- Mature ecosystem with proven performance

### Validation: Zod

- Schema-first validation with TypeScript inference
- Excellent error messages for user feedback
- Composable validation rules
- Direct integration with JSON schema generation (for contract testing)

## Alternatives Considered

### 1. Custom Argument Parser

- **Pros**: Zero dependencies, full control over behavior
- **Cons**: 1000+ lines of code to implement, testing burden, edge case handling
- **Rejected**: Reinventing well-solved problem

### 2. Yargs + Joi

- **Pros**: Familiar to some developers, extensive feature set
- **Cons**: Larger bundle size, more complex API, no TypeScript-first design
- **Rejected**: Performance and complexity concerns

### 3. Oclif Framework

- **Pros**: Plugin system, rich CLI features
- **Cons**: Over-engineered for our needs, larger footprint, ties to Salesforce patterns
- **Rejected**: YAGNI violation - we explicitly defer plugin system to Phase 5+

## Consequences

### Positive

- **Reduced implementation time**: ~90% less code than custom solution
- **Type safety**: Zod provides runtime validation with TypeScript inference
- **Clear error messages**: Zod's error formatting directly usable for user feedback
- **Performance**: Commander.js startup overhead measured at <20ms
- **Maintainability**: Industry-standard patterns reduce onboarding friction
- **Contract testing**: Zod schemas convert to JSON Schema for automation

### Negative

- **Dependency risk**: Two external dependencies to maintain
- **Bundle size**: ~50KB combined (acceptable given 150ms startup target)
- **API surface**: Must learn Commander.js patterns vs custom implementation
- **Version constraints**: Must coordinate updates across TypeScript/Node.js compatibility

### Mitigation Strategies

- Pin major versions to avoid breaking changes
- Include both libraries in performance benchmarks
- Document critical usage patterns to ease future transitions if needed

## Implementation Notes

```typescript
// Command registration pattern
program
  .command("capture voice")
  .argument("<file>", "Voice memo file path")
  .option("-t, --transcribe", "Transcribe immediately")
  .action(async (file, options) => {
    // Zod validation
    const schema = z.object({
      file: z.string().min(1).refine(existsSync, "File not found"),
      transcribe: z.boolean().optional(),
    })

    const validated = schema.parse({ file, ...options })
    // ... rest of command logic
  })
```

## Success Metrics

- CLI startup time remains < 150ms p95
- Zero argument parsing bugs in Phase 1-2 testing
- Structured error coverage for 100% P0 error paths
- JSON schema generation works for contract testing

## References

- [CLI PRD](../features/cli/prd-cli.md) - Product requirements and decisions
- [CLI Technical Specification](../features/cli/spec-cli-tech.md) - Implementation details
- [CLI Testing Specification](../features/cli/spec-cli-test.md) - Contract testing strategy
- Commander.js documentation: https://github.com/tj/commander.js
- Zod documentation: https://zod.dev

## Revision History

- 2025-09-28: Initial decision documentation
