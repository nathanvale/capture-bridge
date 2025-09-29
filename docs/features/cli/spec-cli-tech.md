---
title: CLI Technical Specification
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-27
spec_type: tech
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# CLI Technical Specification

> **Scope Type:** Feature (user-facing) – CLI is a feature that uses foundation infrastructure
> **Focus:** Complete MVP CLI surface for Phase 1-4 operations (voice + email capture, staging ledger management)

## 1. Executive Summary

This specification defines the **complete CLI tool** for the ADHD Brain monorepo, consolidating command-line operations for manual capture (`capture voice`, `capture email`), system health checks (`doctor`), and staging ledger inspection (`ledger`). The CLI is the primary user interface during Phases 1-4, enabling testing, debugging, and batch operations before GUI development.

> NOTE: `capture text` is explicitly deferred to Phase 5+ per Master PRD YAGNI boundaries. See [CLI Extensibility Deferred Features Guide](../../guides/guide-cli-extensibility-deferred.md) for deferred features.

### Problem Statement

The simplified architecture (voice + email → staging → Obsidian) requires:
- **Manual capture interface**: For testing and batch processing
- **Health diagnostics**: Verify staging ledger, folder permissions, dependencies
- **Ledger inspection**: Query and inspect staged captures
- **Simple UX**: Zero configuration for local-first usage

### Solution

```bash
# Manual capture commands
adhd capture voice <file>
adhd capture email <eml-file>

# System health
adhd doctor                  # Check staging ledger, folders, dependencies
adhd doctor --fix            # Attempt auto-repair

# Staging ledger inspection
adhd ledger list             # View staged captures
adhd ledger inspect <id>     # View single capture
adhd ledger dlq              # View dead letter queue

# Batch operations
adhd inbox:process           # File all READY captures to vault
adhd hash:migrate           # Hash algorithm migration
adhd metrics:dump            # Local metrics
```

*Nerdy joke: Our CLI is like a Swiss Army knife for ADHD thoughts—simple enough to use during a hyperfocus session, powerful enough to debug at 2am when everything breaks.*

---

## 2. Guiding Principles

1. **Startup < 150ms cold** (Node 20)
2. **All commands idempotent** where feasible; retry safety per [Idempotency Pattern](../../guides/guide-resilience-patterns.md#idempotency)
3. **Fail loud** with structured error codes; never silent exit(1)
4. **Zero network dependency**; local-only side effects
5. **Thin orchestration layer**; push logic into domain modules (testable)
6. **Output defaults human-friendly**; `--json` provides stable machine contract

---

## 3. Architecture Overview

### 3.1 Package Structure

```
apps/
└── cli/
    ├── src/
    │   ├── index.ts                 # Entry point (commander setup)
    │   ├── commands/
    │   │   ├── capture-voice.ts     # Voice file ingestion
    │   │   ├── capture-email.ts     # Email file ingestion
    │   │   ├── capture-list.ts      # List staged captures
    │   │   ├── capture-show.ts      # Show single capture
    │   │   ├── capture-file.ts      # File capture to vault
    │   │   ├── inbox-process.ts     # Batch file READY captures
    │   │   ├── doctor.ts            # Health checks
    │   │   ├── ledger.ts            # Staging ledger inspection
    │   │   ├── hash-migrate.ts      # Hash migration
    │   │   └── metrics-dump.ts      # Metrics dump
    │   ├── services/
    │   │   ├── ingestion-service.ts # Wraps ingestion core API
    │   │   ├── ledger-service.ts    # SQLite access abstraction
    │   │   ├── filing-service.ts    # Outbox + atomic write orchestration
    │   │   ├── health-service.ts    # Doctor checks
    │   │   └── metrics-service.ts   # Metrics access
    │   ├── errors/
    │   │   ├── registry.ts          # Error code registry
    │   │   └── factory.ts           # Error factory
    │   ├── lib/
    │   │   ├── config.ts            # Load .adhd-brain.json
    │   │   ├── output.ts            # Styled console output
    │   │   └── spinner.ts           # Progress indicators
    │   └── utils/
    │       ├── validation.ts        # Input validation (Zod)
    │       ├── parse.ts             # Argument parsing
    │       └── env.ts               # Environment variable handling
    ├── package.json
    ├── tsconfig.json
    └── vitest.config.ts
```

**Key boundary**: Commands are pure orchestration (arg parse → invoke service → format output). No SQL or filesystem logic inside command modules.

### 3.2 Dependencies

```json
{
  "dependencies": {
    "@adhd-brain/foundation": "workspace:*",
    "@adhd-brain/core": "workspace:*",
    "@adhd-brain/storage": "workspace:*",
    "@adhd-brain/capture-service": "workspace:*",
    "commander": "^12.1.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.1",
    "enquirer": "^2.4.1",
    "zod": "^3.22.0"
  }
}
```

---

## 4. Command Specifications

### 4.1 Command Surface (MVP)

| Command | Purpose | Inputs | Output (default) | JSON Shape Key |
|---------|---------|--------|------------------|----------------|
| `capture:voice` | Register existing voice memo path(s) | file path(s) | Count + queued message | `{ id, content_hash, status }` |
| `capture:email` | Register email file | .eml file path | Parse + stage summary | `{ id, content_hash, attachments }` |
| `capture:list` | List unfiled/staged captures | filters (source, limit) | Table summary | `{ items: [...] }` |
| `capture:show` | Show one capture (raw + metadata) | id | Formatted envelope | `{ envelope, ingest_state }` |
| `capture:file` | Force file one capture to vault | id, optional path override | Path written | `{ id, vault_path }` |
| `inbox:process` | Batch file all READY using PARA suggestion | flags (dry-run, limit) | Summary counts | `{ processed, skipped }` |
| `doctor` | Health & integrity checks | flags (--verbose) | Status lines | `{ checks: [...] }` |
| `ledger:list` | List staged captures | filters | Table | `{ items: [...] }` |
| `ledger:inspect` | Show single capture details | id | Details | `{ envelope }` |
| `ledger:dlq` | View dead letter queue | none | DLQ items | `{ items: [...] }` |
| `hash:migrate` | Progress hash migration phases | phase target | Plan + results | `{ phase, updated, skipped }` |
| `metrics:dump` | Emit current counters (local) | none | Key:value list | `{ metrics: { ... } }` |

### 4.2 Capture Voice Command

```bash
adhd capture voice <file-path> [options]

Options:
  --transcribe, -t         Transcribe immediately (default: queue for later)
  --tag <tags>             Comma-separated tags
  --priority <level>       Priority: low, normal, high (default: normal)
  --dry-run               Validate without staging
  --json, -j              JSON output

Examples:
  adhd capture voice ./recording.m4a
  adhd capture voice ~/Library/GroupContainers/group.com.apple.VoiceMemos.shared/Recordings/20250927.m4a -t
  adhd capture voice *.m4a --json  # Batch capture with JSON output
```

**Exit Codes:**
- `0`: Success
- `1`: Validation error (file not found, invalid format)
- `2`: Storage error (staging ledger unavailable)
- `3`: Duplicate detected (if --no-allow-duplicates flag)

**JSON Output Schema:**
```json
{
  "id": "01HZQK...",
  "contentHash": "blake3:abc123...",
  "status": "staged",
  "duplicate": false,
  "transcribe": "queued"
}
```

### 4.3 Capture Email Command

```bash
adhd capture email <eml-file> [options]

Options:
  --preserve-attachments   Store attachments (default: links only)
  --tag <tags>             Comma-separated tags
  --json, -j              JSON output

Examples:
  adhd capture email ./inbox/message.eml
  adhd capture email - < message.eml
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid email file
- `2`: Parse error

**JSON Output Schema:**
```json
{
  "id": "01HZQK...",
  "contentHash": "blake3:ghi789...",
  "subject": "Important meeting",
  "from": "user@example.com",
  "attachments": 2
}
```

### 4.5 Doctor Command

```bash
adhd doctor [options]

Options:
  --fix                   Attempt auto-repair
  --verbose, -v           Detailed output
  --json, -j             JSON output

Checks:
  ✓ Staging ledger accessible
  ✓ Schema migrations current
  ✓ Vault path writable
  ✓ Voice memos folder readable
  ✓ Disk space adequate (>1GB)
  ✓ SQLite version >=3.35
```

**Exit Codes:**
- `0`: All checks passed
- `1`: Critical check failed
- `2`: Warning (non-critical)

**JSON Output Schema:**
```json
{
  "checks": [
    {
      "name": "staging_ledger",
      "status": "pass",
      "details": "sqlite3 version 3.42.0"
    },
    {
      "name": "vault_path",
      "status": "fail",
      "details": "Path not writable: /Users/nathan/Obsidian",
      "fix": "Run: chmod u+w /Users/nathan/Obsidian"
    }
  ],
  "summary": {
    "pass": 5,
    "fail": 1,
    "warn": 0
  }
}
```

### 4.6 Ledger Commands

```bash
# List staged captures
adhd ledger list [options]

Options:
  --source <type>          Filter by source (voice, text, email)
  --limit <n>              Limit results (default: 50)
  --status <state>         Filter by status (staged, processing, filed)
  --json, -j              JSON output

# Inspect single capture
adhd ledger inspect <id> [options]

Options:
  --json, -j              JSON output

# View dead letter queue
adhd ledger dlq [options]

Options:
  --json, -j              JSON output
```

---

## 5. Error Handling

**Note:** Error handling follows patterns from [Resilience Patterns Guide](../../guides/guide-resilience-patterns.md#error-handling) Section 5.

### 5.1 Error Registry

Central registry with stable codes (prefix `CLI_`). Mapping includes `code`, `exit_code`, and `category`.

| Code | Exit | Category | Meaning | Retry Strategy |
|------|------|----------|---------|----------------|
| `CLI_INPUT_INVALID` | 2 | user | Validation failed | Per [User Error Pattern](../../guides/guide-resilience-patterns.md#user-errors) |
| `CLI_CAPTURE_NOT_FOUND` | 3 | user | Capture id unknown | depends |
| `CLI_VOICE_FILE_MISSING` | 4 | integrity | Voice memo path missing | after-fix |
| `CLI_DB_UNAVAILABLE` | 10 | infra | SQLite open / lock error | yes |
| `CLI_HASH_MIGRATION_UNSAFE` | 20 | safety | Phase precondition unmet | after-fix |
| `CLI_VAULT_NOT_WRITABLE` | 11 | infra | Vault path not writable | after-fix |

### 5.2 Error Output Formats

**JSON Mode (stderr):**
```json
{
  "error": {
    "code": "CLI_INPUT_INVALID",
    "message": "text argument required when stdin empty",
    "hint": "Pass --text or pipe content",
    "exit": 2
  }
}
```

**Human Mode (stderr):**
```
Error (CLI_INPUT_INVALID): text argument required
Hint: Pass --text or pipe content
```

### 5.3 Global Error Handler

```typescript
// src/errors/registry.ts
export const errorRegistry = {
  CLI_INPUT_INVALID: {
    exit: 2,
    category: 'user',
    message: (details: string) => `Invalid input: ${details}`,
  },
  CLI_DB_UNAVAILABLE: {
    exit: 10,
    category: 'infra',
    message: (details: string) => `Database unavailable: ${details}`,
  },
  // ... more errors
};
```

---

## 6. Configuration

### 6.1 Environment Variables

Minimal environment variables (all optional):

- `CAPTURE_DB_PATH` (default: `./data/ledger.sqlite`)
- `CAPTURE_VAULT_PATH` (default: `~/Obsidian/Vault`)
- `CAPTURE_METRICS` (toggle metrics dumps: `0|1`)
- `CAPTURE_HASH_MIGRATION` (enum: `disabled|dual|prefer|primary`)
- `CAPTURE_DEBUG` (debug logging: `0|1`)

### 6.2 Configuration File (.adhd-brain.json)

```json
{
  "version": "1.0",
  "paths": {
    "ledger": "./data/ledger.sqlite",
    "vault": "~/Obsidian/Vault",
    "voiceMemos": "~/Library/GroupContainers/group.com.apple.VoiceMemos.shared/Recordings"
  },
  "capture": {
    "autoTranscribe": false,
    "deduplication": "strict"
  },
  "doctor": {
    "autoFix": false
  }
}
```

**Config Loading Priority:**
1. CLI flags (highest priority)
2. Environment variables
3. .adhd-brain.json
4. Defaults (lowest priority)

No interactive config wizard (deferred). `doctor` reports effective config.

---

## 7. Output Conventions

### 7.1 Human-Friendly Output

- **Tables**: Auto-detect column widths, no external deps
- **Colors**: Use chalk for status (green=success, red=error, yellow=warn)
- **Spinners**: Use ora for operations >3s per [ADHD Pattern](../../guides/guide-resilience-patterns.md#adhd-considerations)
- **Progress**: Concise status lines, avoid non-deterministic output

### 7.2 JSON Output

- **Flag**: `--json` or `-j`
- **Stable keys**: Never change schema without version bump
- **No color codes**: Strip all ANSI escape sequences
- **Never mix**: Don't mix human stdout with JSON when flag present

---

## 8. Validation Strategy

- Use **Zod schemas** for command option + payload validation
- **Fail fast** before side effects
- **Aggregate errors**: List multiple invalid flags (don't stop at first)
- **Clear hints**: Provide actionable error messages

Example:
```typescript
const voiceCaptureSchema = z.object({
  filePath: z.string().min(1).refine(
    (path) => existsSync(path),
    { message: "File not found" }
  ),
  transcribe: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});
```

---

## 9. Logging

- **Default**: warnings + errors only
- **Debug**: `CAPTURE_DEBUG=1` enables debug lines prefixed with `DBG`
- **No log files**: Console only (log file rotation deferred)
- **Privacy**: Never include raw voice content or full text; only hashes/lengths

---

## 10. Metrics Exposure

Relies on ingestion metrics file writer; CLI simply reads present counters for `metrics:dump`. No daemonization. If file absent → empty object.

**Local-only counters (when `CAPTURE_METRICS=1`):**
- `capture_sqlite_ms`, `classify_ms`, `outbox_write_ms`, `vault_write_ms`
- `dedup_hits_total`, `outbox_retries_total`, `outbox_dlq_total`

Export as newline-delimited JSON in `./.metrics/`.

---

## 11. Hash Migration Command

Executes safe transitions aligned with ADR-0002 (Dual Hash Migration):

```bash
adhd hash:migrate <phase> [options]

Phases:
  dual        Ensure legacy + blake3 present
  prefer      Verify dedup queries hit blake3 path
  primary     Transactional update of content_hash

Options:
  --dry-run              Show plan without executing
  --json, -j            JSON output
```

**Pre-flight checks**:
- Row counts
- Existing divergence audit (hash recompute sample 100 random rows)
- No ongoing captures

---

## 12. Concurrency Model

CLI executes single command then exits. **No persistent workers**. Commands using ingestion that might enqueue asynchronous tasks (e.g., voice verification) return after initial staging with note: `status:queued`.

---

## 13. Security & Privacy

- **Local-only operations**, no telemetry shipping
- **File paths redacted** in JSON unless `--verbose`
- **No sensitive data** in logs (only hashes/lengths)
- **Zero network dependency**

---

## 14. Performance Targets

| Operation | Target | Measurement |
|-----------|---------|------------|
| Cold start | < 150ms | Time to first command execution |
| `capture:text` | < 50ms | Arg parse → SQLite insert |
| `capture:voice` | < 100ms | Validation → staging |
| `capture:list` | < 50ms | Query 1000 items |
| `doctor` checks | < 500ms | All health checks |

---

## 15. TDD Applicability Decision

### Risk Classification: HIGH

CLI is the primary user interface for the system, with critical data integrity paths.

### Decision: TDD REQUIRED for P0/P1 paths

### Scope Under TDD

**Unit Tests:**
- Argument parsing and validation logic
- Command execution logic (isolated from I/O)
- Error code mapping and structured error generation
- JSON output schema validation
- Hash computation and idempotency checks

**Integration Tests:**
- Database operations (capture staging, filing)
- File system interactions (voice file access, vault writing)
- Full command execution with real SQLite
- Doctor health checks against actual database state

**Contract Tests:**
- JSON output schemas remain stable
- Exit codes match documented registry
- Help text snapshot consistency

### Priority Test Coverage

| Area | Priority | Test Requirement |
|------|----------|-----------------|
| Argument parsing | P0 | Invalid flags surface structured errors |
| Idempotent capture:text | P0 | Duplicate text returns same hash |
| Voice file missing | P0 | Returns CLI_VOICE_FILE_MISSING error |
| JSON output stability | P0 | Schema validation + snapshots |
| Hash migration guardrails | P0 | Forbid phase skipping |
| Doctor integrity check | P1 | Simulates missing tables |
| Metrics dump empty | P1 | Returns `{}` not error |
| Performance cold start | P2 | <150ms baseline (optional CI) |

### YAGNI Deferrals

- Plugin system tests (not implemented)
- REPL interaction tests (not implemented)
- Shell completion tests (deferred)
- Performance profiling tests (optional)

### Trigger to Revisit

- When extensibility features activate per criteria in guide-cli-extensibility-deferred.md
- If CLI startup exceeds 200ms consistently
- When command set grows beyond 15 commands

---

## 16. Non-Goals (YAGNI Enforcement)

Excluded until activation criteria met (tracked in guide-cli-extensibility-deferred.md):

- Plugin/module auto-discovery
- Interactive REPL / TUI beyond simple prompt confirmations
- Global event hook system
- Streaming transcription progress bars
- Performance tracing exporters
- Doc bidirectional sync
- Shell completion scripts (generate later if CLI stabilizes)
- Multi-process worker orchestration
- Web clipper commands
- Search commands
- Config editing commands

---

## 17. Implementation Examples

### 17.1 Capture Voice Command

```typescript
// src/commands/capture-voice.ts
import { Command } from 'commander';
import { CaptureService } from '@adhd-brain/capture-service';
import ora from 'ora';
import chalk from 'chalk';

export function registerCaptureVoiceCommand(program: Command) {
  program
    .command('capture voice')
    .description('Capture voice memo file')
    .argument('<file>', 'Path to voice memo file')
    .option('-t, --transcribe', 'Transcribe immediately')
    .option('--tag <tags>', 'Comma-separated tags')
    .option('--priority <level>', 'Priority level', 'normal')
    .option('--dry-run', 'Validate without staging')
    .option('-j, --json', 'JSON output')
    .action(async (file, options) => {
      const spinner = options.json ? null : ora('Capturing voice memo...').start();

      try {
        const service = new CaptureService();
        const result = await service.captureVoice({
          filePath: file,
          transcribe: options.transcribe,
          tags: options.tag?.split(','),
          priority: options.priority,
          dryRun: options.dryRun,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          spinner?.succeed(
            `Captured voice memo: ${result.id}\n` +
            `Status: ${result.status}\n` +
            `Hash: ${result.contentHash.slice(0, 12)}...`
          );

          if (result.duplicate) {
            console.warn(
              chalk.yellow(`⚠️  Duplicate detected (existing ID: ${result.duplicateId})`)
            );
          }
        }

        process.exit(0);
      } catch (error) {
        if (options.json) {
          console.error(JSON.stringify({ error: error.toJSON() }, null, 2));
        } else {
          spinner?.fail('Failed to capture voice memo');
          console.error(chalk.red(error.message));
        }
        process.exit(error.exitCode ?? 1);
      }
    });
}
```


---

## 18. Dependencies & Contracts

### Upstream Dependencies

- **Node.js 20+**: Required for startup performance (<150ms)
- **SQLite**: Ledger storage and deduplication
- **File System**: Voice file access, vault writing
- **Commander.js**: CLI framework (argument parsing)
- **Zod**: Schema validation for inputs
- **Chalk**: Terminal colors
- **Ora**: Spinners

### Downstream Consumers

- **Shell Scripts**: Using JSON output mode for automation
- **Obsidian Vault**: Expecting markdown files with specific frontmatter
- **Future GUI**: May wrap CLI commands
- **CI/CD Pipelines**: Using exit codes for flow control

### External Contracts

- **JSON Output Schemas**: Must remain backward compatible
- **Exit Codes**: Documented in error registry, must not change
- **Command Names**: Once released, cannot be renamed
- **File Formats**: Markdown with YAML frontmatter for vault

---

## 19. Open Questions

1. Should `doctor` perform optional destructive checks behind a flag (e.g., temp write to vault)?
2. Do we add `--limit` / `--since` to `capture:list` now or later?
3. Should hash migration produce a signed summary file for audit?

---

## 20. Rollout & Success Metrics

Success = All Phase 1–4 tasks runnable via CLI with:

- < 150ms cold start p95
- < 50ms `capture:text` ingestion p95 (excluding disk contention)
- Structured error coverage for 100% P0 paths
- Zero unhandled promise rejections across test suite

---

## 21. ADR References

- [ADR-0001 Voice File Sovereignty](../../adr/0001-voice-file-sovereignty.md) - Voice memo file handling
- [ADR-0002 Dual Hash Migration](../../adr/0002-dual-hash-migration.md) - Hash algorithm migration
- [ADR-0015 CLI Library Stack Selection](../../adr/0015-cli-library-stack.md) - Commander.js and Zod selection
- [ADR-0016 CLI as Feature Architecture](../../adr/0016-cli-as-feature-architecture.md) - CLI architectural placement
- [ADR-0017 JSON Output Contract Stability](../../adr/0017-json-output-contract-stability.md) - Machine-readable output contracts
- [ADR-0018 CLI Exit Code Registry Pattern](../../adr/0018-cli-exit-code-registry.md) - Structured error codes for automation

---

## 22. Related Specifications

### CLI Documentation Suite

- [CLI Extensibility Deferred Features Guide](../../guides/guide-cli-extensibility-deferred.md) - Deferred features catalog
- [CLI Testing Contracts](./spec-cli-test.md) - Contract testing strategy

### Parent Documentation

- [CLI PRD](./prd-cli.md) - CLI feature requirements
- [Capture PRD](../capture/prd-capture.md) - Parent product requirements
- [Master PRD](../../master/prd-master.md) - Overall system requirements

### Foundation Dependencies

- [Monorepo Technical Specification](../../cross-cutting/spec-foundation-monorepo-tech.md) - Turborepo + pnpm workspaces

---

## 23. Nerdy Joke

The perfect minimal CLI is like a good capture: short, atomic, and doesn't hang around waiting for a plugin system to feel important. It knows its job is to get you from thought to ledger in under 150ms, not to become the next Vim.

---

**Version:** 1.0.0
**Last Updated:** 2025-09-27
**Status:** Draft - Consolidated from core + foundation specs
**Change Log:**
- v1.0.0 (2025-09-27): Consolidated spec-cli-core-tech.md and spec-cli-foundation-tech.md
- v0.1.0 (2025-09-26): Initial core spec