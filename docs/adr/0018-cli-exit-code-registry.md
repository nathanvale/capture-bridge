---
adr: 0018
title: CLI Exit Code Registry Pattern for Automation
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

## Status

Accepted

## Context

The ADHD Brain CLI serves as a critical automation interface for shell scripts, CI/CD pipelines, and integration tools. These consumers rely on **exit codes** for flow control and error handling.

Standard practice allows exit codes 0-255, where:
- `0` = success
- `1-255` = various error conditions

However, without a structured approach, exit codes become:
- **Inconsistent**: Same error type returns different codes from different commands
- **Undocumented**: Scripts must guess what codes mean
- **Unstable**: Code meanings change between releases, breaking automation
- **Overlapping**: Multiple error types accidentally use the same code

The CLI requires a **registry pattern** that ensures:
- **Deterministic mapping**: Same error type always produces same exit code
- **Documentation**: All codes are explicitly documented
- **Stability**: Once released, exit codes cannot change
- **Categorization**: Logical grouping of error types

Referenced in:
- [CLI PRD](../features/cli/prd-cli.md) §6 Decisions (Locked) - Exit Codes Registry
- [CLI Technical Specification](../features/cli/spec-cli-tech.md) §5 Error Handling
- [CLI Testing Specification](../features/cli/spec-cli-test.md) §6 Exit Code Matrix

## Decision

**Implement a centralized exit code registry with stable, categorized error codes that map consistently across all CLI commands.**

### Registry Structure

```typescript
// src/errors/registry.ts
export const CLI_ERROR_REGISTRY = {
  // Success
  SUCCESS: { code: 0, category: 'success', description: 'Command completed successfully' },

  // User Input Errors (1-19)
  INPUT_INVALID: { code: 2, category: 'user', description: 'Invalid arguments or options' },
  CAPTURE_NOT_FOUND: { code: 3, category: 'user', description: 'Specified capture ID not found' },
  VOICE_FILE_MISSING: { code: 4, category: 'user', description: 'Voice memo file not found' },

  // Infrastructure Errors (20-39)
  DB_UNAVAILABLE: { code: 20, category: 'infra', description: 'SQLite database unavailable' },
  VAULT_NOT_WRITABLE: { code: 21, category: 'infra', description: 'Obsidian vault not writable' },
  DISK_SPACE_LOW: { code: 22, category: 'infra', description: 'Insufficient disk space' },

  // Operation Errors (40-59)
  HASH_MIGRATION_UNSAFE: { code: 40, category: 'operation', description: 'Hash migration preconditions not met' },
  CAPTURE_PROCESSING_FAILED: { code: 41, category: 'operation', description: 'Capture processing failed' },

  // System Errors (60-79)
  UNEXPECTED_ERROR: { code: 1, category: 'system', description: 'Unexpected error occurred' },
  TIMEOUT: { code: 60, category: 'system', description: 'Operation timed out' },
} as const;
```

### Code Assignment Rules

| Range | Category | Description | Examples |
|-------|----------|-------------|----------|
| 0 | Success | Command completed successfully | All success cases |
| 1 | System | Unexpected/unhandled errors | Unhandled exceptions |
| 2-19 | User | Input validation, missing files | Invalid arguments, file not found |
| 20-39 | Infrastructure | System dependency failures | Database locked, vault unavailable |
| 40-59 | Operation | Business logic failures | Migration blocked, processing failed |
| 60-79 | System | Timeouts, resource exhaustion | Operation timeout, memory limit |
| 80-99 | Reserved | Future expansion | - |

### Implementation Pattern

```typescript
// src/commands/capture-voice.ts
import { CLI_ERROR_REGISTRY } from '../errors/registry';

export async function captureVoiceCommand(file: string, options: any) {
  try {
    if (!existsSync(file)) {
      throw new CLIError('VOICE_FILE_MISSING', `File not found: ${file}`);
    }

    const result = await captureService.processVoice(file);
    console.log(`Captured: ${result.id}`);
    process.exit(CLI_ERROR_REGISTRY.SUCCESS.code);

  } catch (error) {
    if (error instanceof CLIError) {
      const registry = CLI_ERROR_REGISTRY[error.code];
      console.error(`Error (${error.code}): ${error.message}`);
      process.exit(registry.code);
    } else {
      console.error('Unexpected error:', error.message);
      process.exit(CLI_ERROR_REGISTRY.UNEXPECTED_ERROR.code);
    }
  }
}
```

## Rationale

### 1. Automation Reliability
Shell scripts depend on predictable exit codes:
```bash
#!/bin/bash
adhd capture voice recording.m4a
case $? in
  0) echo "Success: capture staged" ;;
  4) echo "Error: voice file missing" ;;
  20) echo "Error: database unavailable, retry later" ;;
  *) echo "Unexpected error: $?" ;;
esac
```

### 2. Debugging Support
- Clear mapping between error conditions and exit codes
- Documentation enables rapid troubleshooting
- Categorization helps identify error source (user vs system)

### 3. Contract Stability
- Exit codes become part of CLI's public API
- Cannot change once released without breaking automation
- Registry prevents accidental code collisions

### 4. Testing Coverage
- Deterministic error scenarios can be tested
- Contract tests verify exit code stability
- Integration tests validate error handling paths

## Alternatives Considered

### 1. Standard Unix Exit Codes Only
- **Pros**: Familiar to Unix users (0=success, 1=error, 2=usage)
- **Cons**: Insufficient granularity for automation, no error type distinction
- **Rejected**: Doesn't meet automation requirements

### 2. HTTP-Style Status Codes
- **Pros**: Familiar pattern, well-categorized (4xx client, 5xx server)
- **Cons**: Outside 0-255 range, unfamiliar in CLI context
- **Rejected**: Violates Unix exit code constraints

### 3. Random Code Assignment
- **Pros**: Simple implementation, no category planning needed
- **Cons**: No logical organization, hard to remember, poor debugging
- **Rejected**: Poor developer experience

### 4. Per-Command Code Spaces
- **Pros**: Commands own their error codes independently
- **Cons**: Code overlap, inconsistent meanings across commands
- **Rejected**: Breaks cross-command automation patterns

## Consequences

### Positive
- **Reliable automation**: Scripts can handle specific error conditions appropriately
- **Improved debugging**: Clear error categories and descriptions
- **Contract stability**: Exit codes become part of stable API
- **Comprehensive testing**: All error paths can be systematically tested
- **Documentation**: Self-documenting error registry

### Negative
- **Code maintenance**: Registry must be updated for new error types
- **Backward compatibility burden**: Cannot change codes once released
- **Planning overhead**: Must assign codes thoughtfully before release
- **Testing complexity**: All error paths require exit code validation

### Mitigation Strategies
- Reserve code ranges for future expansion
- Implement comprehensive contract tests for exit codes
- Document deprecation process for future major version changes
- Use descriptive constant names to prevent accidental reuse

## Implementation Requirements

### Error Registry Module
```typescript
// src/errors/registry.ts
export const CLI_ERROR_REGISTRY = {
  // ... registry definitions
} as const;

export type CLIErrorCode = keyof typeof CLI_ERROR_REGISTRY;

export class CLIError extends Error {
  constructor(
    public readonly code: CLIErrorCode,
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'CLIError';
  }

  toJSON() {
    const registry = CLI_ERROR_REGISTRY[this.code];
    return {
      code: this.code,
      message: this.message,
      category: registry.category,
      exit: registry.code,
      details: this.details
    };
  }
}
```

### Contract Testing
```typescript
// tests/contracts/exit-codes.spec.ts
describe('Exit Code Contracts', () => {
  it('maps CLI_VOICE_FILE_MISSING to exit code 4', async () => {
    const result = await execCLI(['capture', 'voice', 'nonexistent.m4a']);
    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain('VOICE_FILE_MISSING');
  });

  it('maintains exit code stability', () => {
    // Snapshot test of current registry
    expect(CLI_ERROR_REGISTRY).toMatchSnapshot();
  });
});
```

### Documentation Generation
- Auto-generate exit code documentation from registry
- Include in CLI help text and external documentation
- Maintain changelog of registry changes

## Success Metrics

- Zero exit code conflicts across all CLI commands
- 100% coverage of P0/P1 error paths with defined exit codes
- Contract tests prevent exit code regressions
- Automation scripts successfully handle specific error conditions

## References

- [CLI PRD](../features/cli/prd-cli.md) - Product requirements and exit code decision
- [CLI Technical Specification](../features/cli/spec-cli-tech.md) - Error handling implementation
- [CLI Testing Specification](../features/cli/spec-cli-test.md) - Exit code contract testing
- [JSON Output Contract Stability ADR](0017-json-output-contract-stability.md) - Related contract stability decision
- Unix exit code conventions: https://tldp.org/LDP/abs/html/exitcodes.html

## Revision History

- 2025-09-28: Initial decision documentation