# @capture-bridge/obsidian-bridge

Atomic file writer for Obsidian vault exports using temp-then-rename pattern.

## Features

- **Atomic Writes**: Guarantees all-or-nothing writes via POSIX rename semantics
- **ULID Filenames**: Deterministic, time-ordered filenames based on capture IDs
- **Collision Detection**: Prevents data loss from ULID collisions
- **Duplicate Detection**: Skips writes for already-exported content
- **fsync Durability**: Ensures content on disk before file becomes visible

## Architecture

The Obsidian Bridge sits between the Staging Ledger (SQLite) and the Obsidian Vault (filesystem), ensuring zero partial writes and zero vault corruption through temp-then-rename semantics.

### Write Flow

1. Write to temp file: `{vault}/.trash/{ulid}.tmp`
2. Call `fsync()` to flush OS cache to disk
3. Atomic rename to: `{vault}/inbox/{ulid}.md`
4. Record export in audit log

### Error Handling

- **EACCES** (Permission denied): Retry with exponential backoff
- **ENOSPC** (Disk full): Halt export worker, alert via `doctor` command
- **EEXIST** (Collision): Check content hash, handle per collision policy
- **EROFS** (Read-only filesystem): Halt export worker
- **ENETDOWN** (Network mount): Retry with backoff

## Usage

```typescript
import { ObsidianAtomicWriter } from '@capture-bridge/obsidian-bridge'

const writer = new ObsidianAtomicWriter('/path/to/vault')

const result = await writer.writeAtomic(
  '01HZVM8YWRQT5J3M3K7YPTX9RZ', // ULID capture ID
  '---\nid: 01HZVM8Y...\n---\n\n# Content', // Formatted markdown
  '/path/to/vault' // Vault root path
)

if (result.success) {
  console.log(`Exported to: ${result.export_path}`)
} else {
  console.error(`Export failed: ${result.error?.message}`)
}
```

## Related Documents

- **Architecture Spec**: `docs/features/obsidian-bridge/spec-obsidian-arch.md`
- **Tech Spec**: `docs/features/obsidian-bridge/spec-obsidian-tech.md`
- **Test Spec**: `docs/features/obsidian-bridge/spec-obsidian-test.md`
- **ADR-0009**: Atomic Write via Temp-Then-Rename Pattern
- **ADR-0010**: ULID-Based Deterministic Filenames
- **ADR-0011**: Inbox-Only Export Pattern

## Testing

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
```

## License

Private - Internal use only
