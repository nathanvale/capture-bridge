import { Command } from 'commander'
import { beforeEach, describe, expect, it } from 'vitest'

import { registerCaptureCommands } from '../commands/capture.js'
import { registerDoctorCommand } from '../commands/doctor.js'
import { registerLedgerCommands } from '../commands/ledger.js'
import { registerAllCommands } from '../lib/command-registry.js'

describe('Command Registration', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
  })

  describe('Capture Commands', () => {
    it('should register capture parent command', () => {
      registerCaptureCommands(program)
      const { commands } = program
      const captureCommand = commands.find((cmd) => cmd.name() === 'capture')
      expect(captureCommand).toBeDefined()
      expect(captureCommand?.description()).toContain('Capture')
    })

    it('should register capture voice subcommand', () => {
      registerCaptureCommands(program)
      const { commands } = program
      const captureCommand = commands.find((cmd) => cmd.name() === 'capture')
      expect(captureCommand).toBeDefined()

      const subcommands = captureCommand?.commands
      const voiceCommand = subcommands?.find((cmd) => cmd.name() === 'voice')
      expect(voiceCommand).toBeDefined()
      expect(voiceCommand?.description()).toContain('voice')
    })

    it('should register capture email subcommand', () => {
      registerCaptureCommands(program)
      const { commands } = program
      const captureCommand = commands.find((cmd) => cmd.name() === 'capture')

      const subcommands = captureCommand?.commands
      const emailCommand = subcommands?.find((cmd) => cmd.name() === 'email')
      expect(emailCommand).toBeDefined()
      expect(emailCommand?.description()).toContain('email')
    })

    it('should register capture list subcommand', () => {
      registerCaptureCommands(program)
      const { commands } = program
      const captureCommand = commands.find((cmd) => cmd.name() === 'capture')

      const subcommands = captureCommand?.commands
      const listCommand = subcommands?.find((cmd) => cmd.name() === 'list')
      expect(listCommand).toBeDefined()
      expect(listCommand?.description()).toContain('List')
    })

    it('should register capture show subcommand', () => {
      registerCaptureCommands(program)
      const { commands } = program
      const captureCommand = commands.find((cmd) => cmd.name() === 'capture')

      const subcommands = captureCommand?.commands
      const showCommand = subcommands?.find((cmd) => cmd.name() === 'show')
      expect(showCommand).toBeDefined()
      expect(showCommand?.description()).toContain('Show')
    })

    it('should parse voice command arguments', () => {
      registerCaptureCommands(program)
      const { commands } = program
      const captureCommand = commands.find((cmd) => cmd.name() === 'capture')

      const subcommands = captureCommand?.commands
      const voiceCommand = subcommands?.find((cmd) => cmd.name() === 'voice')
      expect(voiceCommand).toBeDefined()

      // Check for required file argument
      const args = voiceCommand?.registeredArguments
      expect(args).toBeDefined()
      expect(args?.length).toBeGreaterThan(0)
    })

    it('should have voice command options', () => {
      registerCaptureCommands(program)
      const { commands } = program
      const captureCommand = commands.find((cmd) => cmd.name() === 'capture')

      const subcommands = captureCommand?.commands
      const voiceCommand = subcommands?.find((cmd) => cmd.name() === 'voice')

      const options = voiceCommand?.options
      expect(options).toBeDefined()

      // Should have transcribe option
      const transcribeOpt = options?.find((opt) => opt.long === '--transcribe')
      expect(transcribeOpt).toBeDefined()

      // Should have tag option
      const tagOpt = options?.find((opt) => opt.long === '--tag')
      expect(tagOpt).toBeDefined()

      // Should have priority option with default
      const priorityOpt = options?.find((opt) => opt.long === '--priority')
      expect(priorityOpt).toBeDefined()
      expect(priorityOpt?.defaultValue).toBe('normal')

      // Should have dry-run option
      const dryRunOpt = options?.find((opt) => opt.long === '--dry-run')
      expect(dryRunOpt).toBeDefined()

      // Should have json option
      const jsonOpt = options?.find((opt) => opt.long === '--json')
      expect(jsonOpt).toBeDefined()
    })
  })

  describe('Doctor Command', () => {
    it('should register doctor command', () => {
      registerDoctorCommand(program)
      const { commands } = program
      const doctorCommand = commands.find((cmd) => cmd.name() === 'doctor')
      expect(doctorCommand).toBeDefined()
      expect(doctorCommand?.description()).toContain('health')
    })

    it('should have verbose option', () => {
      registerDoctorCommand(program)
      const { commands } = program
      const doctorCommand = commands.find((cmd) => cmd.name() === 'doctor')

      const options = doctorCommand?.options
      const verboseOpt = options?.find((opt) => opt.long === '--verbose')
      expect(verboseOpt).toBeDefined()
    })
  })

  describe('Ledger Commands', () => {
    it('should register ledger parent command', () => {
      registerLedgerCommands(program)
      const { commands } = program
      const ledgerCommand = commands.find((cmd) => cmd.name() === 'ledger')
      expect(ledgerCommand).toBeDefined()
      expect(ledgerCommand?.description()).toContain('ledger')
    })

    it('should register ledger list subcommand', () => {
      registerLedgerCommands(program)
      const { commands } = program
      const ledgerCommand = commands.find((cmd) => cmd.name() === 'ledger')

      const subcommands = ledgerCommand?.commands
      const listCommand = subcommands?.find((cmd) => cmd.name() === 'list')
      expect(listCommand).toBeDefined()
      expect(listCommand?.description()).toContain('List')
    })

    it('should register ledger inspect subcommand', () => {
      registerLedgerCommands(program)
      const { commands } = program
      const ledgerCommand = commands.find((cmd) => cmd.name() === 'ledger')

      const subcommands = ledgerCommand?.commands
      const inspectCommand = subcommands?.find((cmd) => cmd.name() === 'inspect')
      expect(inspectCommand).toBeDefined()
      expect(inspectCommand?.description()).toContain('capture')
    })

    it('should register ledger dlq subcommand', () => {
      registerLedgerCommands(program)
      const { commands } = program
      const ledgerCommand = commands.find((cmd) => cmd.name() === 'ledger')

      const subcommands = ledgerCommand?.commands
      const dlqCommand = subcommands?.find((cmd) => cmd.name() === 'dlq')
      expect(dlqCommand).toBeDefined()
      expect(dlqCommand?.description()).toContain('dead letter')
    })

    it('should have inspect command with required id argument', () => {
      registerLedgerCommands(program)
      const { commands } = program
      const ledgerCommand = commands.find((cmd) => cmd.name() === 'ledger')

      const subcommands = ledgerCommand?.commands
      const inspectCommand = subcommands?.find((cmd) => cmd.name() === 'inspect')

      const args = inspectCommand?.registeredArguments
      expect(args).toBeDefined()
      expect(args).toHaveLength(1)

      // Assert first element exists before checking required property
      const firstArg = args?.[0]
      expect(firstArg).toBeDefined()
      expect(firstArg?.required).toBe(true)
    })
  })

  describe('Command Registry', () => {
    it('should register all commands', () => {
      registerAllCommands(program)
      const { commands } = program

      // Should have capture commands
      const captureCommand = commands.find((cmd) => cmd.name() === 'capture')
      expect(captureCommand).toBeDefined()

      // Should have doctor command
      const doctorCommand = commands.find((cmd) => cmd.name() === 'doctor')
      expect(doctorCommand).toBeDefined()

      // Should have ledger commands
      const ledgerCommand = commands.find((cmd) => cmd.name() === 'ledger')
      expect(ledgerCommand).toBeDefined()
    })

    it('should have at least 3 top-level commands', () => {
      registerAllCommands(program)
      const { commands } = program
      expect(commands.length).toBeGreaterThanOrEqual(3)
    })
  })
})
