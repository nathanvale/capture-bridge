/**
 * Command Registry
 *
 * Central registry for all CLI commands. This module registers all commands
 * with the Commander program instance.
 */


import { registerCaptureCommands } from '../commands/capture.js'
import { registerDoctorCommand } from '../commands/doctor.js'
import { registerLedgerCommands } from '../commands/ledger.js'

import type { Command } from 'commander'

/**
 * Register all CLI commands with the program
 *
 * @param program - Commander program instance
 */
export const registerAllCommands = (program: Command): void => {
  // Capture commands (voice, email, list, show)
  registerCaptureCommands(program)

  // Doctor command
  registerDoctorCommand(program)

  // Ledger commands (list, inspect, dlq)
  registerLedgerCommands(program)
}
