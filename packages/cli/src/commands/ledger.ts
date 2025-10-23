/**
 * Ledger command registration functions
 *
 * Provides registration functions for all ledger-related commands:
 * - ledger list
 * - ledger inspect <id>
 * - ledger dlq
 */

import type { Command } from 'commander'

/**
 * Register the 'ledger list' subcommand
 *
 * @param ledgerCommand - Ledger command instance
 */
export const registerLedgerListCommand = (ledgerCommand: Command): void => {
  ledgerCommand
    .command('list')
    .description('List staged captures from the durable ledger')
    .option('--source <type>', 'Filter by source type: voice, email')
    .option(
      '--status <status>',
      'Filter by status: staged, processing, transcribed, exported, failed'
    )
    .option('--limit <n>', 'Maximum number of results to return (default: 50)', '50')
    .option('-j, --json', 'Output results as JSON array')
    .addHelpText(
      'after',
      `
Examples:
  # List all captures
  $ capture ledger list

  # List only voice captures
  $ capture ledger list --source voice

  # List failed captures
  $ capture ledger list --status failed

  # List last 10 captures as JSON
  $ capture ledger list --limit 10 --json

  # List exported email captures
  $ capture ledger list --source email --status exported

Output includes:
  - Capture ID (ULID)
  - Source type
  - Processing status
  - Created timestamp
  - Content hash (if computed)
`
    )
    .action((options: Record<string, unknown>) => {
      // Placeholder implementation
      // eslint-disable-next-line no-console -- CLI output is intentional
      console.log('Ledger list:', options)
    })
}

/**
 * Register the 'ledger inspect' subcommand
 *
 * @param ledgerCommand - Ledger command instance
 */
export const registerLedgerInspectCommand = (ledgerCommand: Command): void => {
  ledgerCommand
    .command('inspect <id>')
    .description('Show detailed information for a single capture')
    .argument('<id>', 'Capture ID (ULID format, e.g., 01HQW3P7XKZM2YJVT8YFGQSZ4M)')
    .option('-j, --json', 'Output full capture as JSON object')
    .addHelpText(
      'after',
      `
Examples:
  # Inspect a capture
  $ capture ledger inspect 01HQW3P7XKZM2YJVT8YFGQSZ4M

  # Inspect as JSON for scripting
  $ capture ledger inspect 01HQW3P7XKZM2YJVT8YFGQSZ4M --json

Output includes:
  - Capture ID and timestamps (created, updated)
  - Source type (voice/email)
  - Processing status and status transitions
  - Content hash
  - Raw content or transcription
  - Metadata (tags, priority, file path, etc.)
  - Export history (if exported)
  - Error details (if failed)
`
    )
    .action((id: string, options: Record<string, unknown>) => {
      // Placeholder implementation
      // eslint-disable-next-line no-console -- CLI output is intentional
      console.log('Ledger inspect:', id, options)
    })
}

/**
 * Register the 'ledger dlq' subcommand
 *
 * @param ledgerCommand - Ledger command instance
 */
export const registerLedgerDlqCommand = (ledgerCommand: Command): void => {
  ledgerCommand
    .command('dlq')
    .description('View dead letter queue (permanently failed captures)')
    .option('--limit <n>', 'Maximum number of results to return (default: 50)', '50')
    .option('-j, --json', 'Output results as JSON array')
    .addHelpText(
      'after',
      `
The dead letter queue contains captures that have permanently failed processing
after all retry attempts. These require manual intervention.

Examples:
  # View all failed captures
  $ capture ledger dlq

  # View last 10 failures
  $ capture ledger dlq --limit 10

  # Export failures as JSON for analysis
  $ capture ledger dlq --json

Output includes:
  - Capture ID (ULID)
  - Source type
  - Failure reason and error details
  - Number of retry attempts
  - First and last failure timestamps
  - Original capture metadata

Next steps:
  - Use "capture ledger inspect <id>" for full details
  - Fix underlying issues (permissions, disk space, etc.)
  - Use "capture doctor" to validate system health
`
    )
    .action((options: Record<string, unknown>) => {
      // Placeholder implementation
      // eslint-disable-next-line no-console -- CLI output is intentional
      console.log('Ledger dlq:', options)
    })
}

/**
 * Register all ledger commands
 *
 * @param program - Commander program instance
 */
export const registerLedgerCommands = (program: Command): void => {
  const ledgerCommand = program
    .command('ledger')
    .description('Query and inspect the durable staging ledger')
    .addHelpText(
      'after',
      `
The ledger is the durable SQLite staging layer that provides 100% capture
retention and durability guarantees. All captures are atomically written to
the ledger before any processing occurs.

Available subcommands:
  list      List staged captures with optional filtering
  inspect   Show detailed information for a single capture
  dlq       View dead letter queue (permanently failed captures)

Use "ledger [subcommand] --help" for more information about a subcommand.

Architecture:
  - SQLite with WAL mode for durability
  - Content hash deduplication (SHA-256)
  - Atomic inserts before async work
  - 90-day retention for exported captures
  - Forever retention for errors_log and exports_audit
`
    )

  registerLedgerListCommand(ledgerCommand)
  registerLedgerInspectCommand(ledgerCommand)
  registerLedgerDlqCommand(ledgerCommand)
}
