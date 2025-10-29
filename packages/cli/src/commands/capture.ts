/**
 * Capture command registration functions
 *
 * Provides registration functions for all capture-related commands:
 * - capture voice <file>
 * - capture email <file>
 * - capture list
 * - capture show <id>
 */

import type { Command } from 'commander'

/**
 * Register the 'capture voice' subcommand
 *
 * @param captureCommand - Capture command instance
 */
export const registerCaptureVoiceCommand = (captureCommand: Command): void => {
  captureCommand
    .command('voice <file>')
    .description('Capture voice memo file into staging ledger (m4a, mp3, wav)')
    .option('-t, --transcribe', 'Transcribe immediately (default: queue for later)')
    .option('--tag <tags>', 'Comma-separated tags for categorization')
    .option('--priority <level>', 'Priority level: low, normal, high (default: normal)', 'normal')
    .option('--dry-run', 'Validate file without staging to ledger')
    .option('-j, --json', 'Output result as JSON')
    .addHelpText(
      'after',
      `
Examples:
  # Capture with immediate transcription
  $ capture voice ./recording.m4a --transcribe

  # Capture from Voice Memos library
  $ capture voice ~/Library/Application\\ Support/com.apple.voicememos/Recordings/20250927.m4a

  # Batch capture with JSON output
  $ capture voice *.m4a --json

  # Tagged high-priority capture
  $ capture voice important.m4a --tag urgent,meeting --priority high
`
    )
    .action((file: string, options: Record<string, unknown>) => {
      // Placeholder implementation
      // eslint-disable-next-line no-console -- CLI output is intentional
      console.log('Voice capture:', file, options)
    })
}

/**
 * Register the 'capture email' subcommand
 *
 * @param captureCommand - Capture command instance
 */
export const registerCaptureEmailCommand = (captureCommand: Command): void => {
  captureCommand
    .command('email <file>')
    .description('Capture email from EML file into staging ledger (or "-" for stdin)')
    .option('--tag <tags>', 'Comma-separated tags for categorization')
    .option('-j, --json', 'Output result as JSON')
    .addHelpText(
      'after',
      `
Examples:
  # Capture email from file
  $ capture email ./inbox/message.eml

  # Capture from stdin
  $ capture email - < message.eml

  # Tagged capture with JSON output
  $ capture email important.eml --tag urgent,client --json

Note: Attachments are logged but not stored in MPPP (Minimum Pivotable Product Phase).
`
    )
    .action((file: string, options: Record<string, unknown>) => {
      // Placeholder implementation
      // eslint-disable-next-line no-console -- CLI output is intentional
      console.log('Email capture:', file, options)
    })
}

/**
 * Register the 'capture list' subcommand
 *
 * @param captureCommand - Capture command instance
 */
export const registerCaptureListCommand = (captureCommand: Command): void => {
  captureCommand
    .command('list')
    .description('List unfiled/staged captures from ledger')
    .option('--source <type>', 'Filter by source type: voice, email')
    .option('--limit <n>', 'Maximum number of results to return (default: 50)', '50')
    .option('-j, --json', 'Output results as JSON array')
    .addHelpText(
      'after',
      `
Examples:
  # List all captures
  $ capture list

  # List only voice captures
  $ capture list --source voice

  # List last 10 captures as JSON
  $ capture list --limit 10 --json

  # List email captures
  $ capture list --source email --limit 20
`
    )
    .action((options: Record<string, unknown>) => {
      // Placeholder implementation
      // eslint-disable-next-line no-console -- CLI output is intentional
      console.log('Capture list:', options)
    })
}

/**
 * Register the 'capture show' subcommand
 *
 * @param captureCommand - Capture command instance
 */
export const registerCaptureShowCommand = (captureCommand: Command): void => {
  captureCommand
    .command('show <id>')
    .description(
      'Show detailed capture information including raw content and metadata (ULID format, e.g., 01HQW3P7XKZM2YJVT8YFGQSZ4M)'
    )
    .option('-j, --json', 'Output full capture as JSON object')
    .addHelpText(
      'after',
      `
Examples:
  # Show capture details
  $ capture show 01HQW3P7XKZM2YJVT8YFGQSZ4M

  # Show as JSON for scripting
  $ capture show 01HQW3P7XKZM2YJVT8YFGQSZ4M --json

Output includes:
  - Capture ID and timestamps
  - Source type (voice/email)
  - Processing status
  - Content hash
  - Raw content or transcription
  - Metadata (tags, priority, etc.)
`
    )
    .action((id: string, options: Record<string, unknown>) => {
      // Placeholder implementation
      // eslint-disable-next-line no-console -- CLI output is intentional
      console.log('Capture show:', id, options)
    })
}

/**
 * Register all capture commands
 *
 * @param program - Commander program instance
 */
export const registerCaptureCommands = (program: Command): void => {
  const captureCommand = program
    .command('capture')
    .description('Capture voice memos and emails into staging ledger')
    .addHelpText(
      'after',
      `
The capture command provides zero-friction input for voice memos and emails,
staging them in a durable SQLite ledger before processing and export.

Available subcommands:
  voice    Capture voice memo files (m4a, mp3, wav)
  email    Capture email files (.eml format)
  list     List unfiled/staged captures
  show     Show detailed capture information

Use "capture [subcommand] --help" for more information about a subcommand.
`
    )

  registerCaptureVoiceCommand(captureCommand)
  registerCaptureEmailCommand(captureCommand)
  registerCaptureListCommand(captureCommand)
  registerCaptureShowCommand(captureCommand)
}
