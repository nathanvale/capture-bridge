#!/usr/bin/env node

import { Command } from 'commander'

import { registerAllCommands } from './lib/command-registry.js'

/**
 * Main CLI entry point for Capture Bridge
 *
 * This file sets up the Commander.js program and registers all available commands.
 *
 * Architecture:
 * - Commander.js v12+ for CLI framework
 * - Commands organized in src/commands/ directory
 * - Command registry in src/lib/command-registry.ts
 * - Shared services in src/services/
 * - Error handling in src/errors/
 */

// Create main program
const program = new Command()

program
  .name('capture')
  .description(
    'ADHD Digital Second Brain - Zero-friction capture layer with durable staging ledger'
  )
  .usage('[command] [options]')
  .version('0.1.0', '-v, --version', 'Display version information')
  .addHelpText(
    'after',
    `
Examples:
  $ capture voice ~/recording.m4a --transcribe
  $ capture email ./inbox/message.eml
  $ capture list --source voice --limit 20
  $ capture doctor --verbose
  $ capture ledger inspect 01HQW3P7XKZM2YJVT8YFGQSZ4M

Commands:
  capture    Capture voice memos and emails into staging ledger
  ledger     Query and inspect staging ledger entries
  doctor     Run health checks on system configuration

For help on a specific command:
  $ capture [command] --help
`
  )

// Version command (explicit command for consistency)
program
  .command('version')
  .description('Display version information')
  .action(() => {
    // eslint-disable-next-line no-console -- CLI output is intentional
    console.log('0.1.0')
  })

// Register all commands via the command registry
registerAllCommands(program)

// Export program for testing
export { program }

// Only parse if this is the main module (not imported for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv)
}
