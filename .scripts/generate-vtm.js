#!/usr/bin/env node

import fs from 'fs'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Virtual Task Manifest Generator
 * Implements the Task Decomposition Architecture specification
 */

// Load capability graph
const capGraph = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '.generated', 'capabilities.json'), 'utf8')
)

// Compute decomposition input hash
function computeInputHash() {
  const sortedCapabilities = [...capGraph.capabilities].sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase
    if (a.slice !== b.slice) return a.slice - b.slice
    return a.id.localeCompare(b.id)
  })

  const hashInput = JSON.stringify({
    version: capGraph.version,
    capabilities: sortedCapabilities.map((c) => ({
      id: c.id,
      phase: c.phase,
      slice: c.slice,
      depends_on: c.depends_on,
      spec_refs: c.spec_refs,
      adr_refs: c.adr_refs,
      guides: c.guides,
    })),
  })

  return crypto.createHash('sha256').update(hashInput).digest('hex')
}

const decompositionInputHash = computeInputHash()
console.log('Decomposition input hash:', decompositionInputHash)

// Risk propagation rules
function propagateRisk(capabilityRisk, taskContext) {
  let risk = capabilityRisk

  // Escalation rules
  if (capabilityRisk === 'Low' && taskContext.introducesPersistence) {
    risk = 'Medium'
  }
  if (capabilityRisk === 'Medium' && taskContext.handlesSecurityData) {
    risk = 'High'
  }

  return risk
}

// Sizing heuristics
function determineSize(taskContext) {
  if (taskContext.multiComponent && taskContext.schemaChange && taskContext.errorSurface) {
    return 'L'
  }
  if (taskContext.schemaChange || taskContext.integrates2Components) {
    return 'M'
  }
  return 'S'
}

// Parallel execution analysis
function analyzeParallelSafety(task, capability) {
  const fileScope = []
  const parallelismGroup = null

  // File scope detection
  const categoryToPackage = {
    foundation: 'packages/foundation/**',
    storage: 'packages/storage/**',
    capture: 'packages/capture/**',
    cli: 'packages/cli/**',
    output: 'packages/obsidian-bridge/**',
    process: 'packages/capture/**',
  }

  const pkg = categoryToPackage[capability.category]
  if (pkg) {
    fileScope.push(pkg)
    fileScope.push(pkg.replace('/**', '/tests/**'))
  }

  // Root-level configs affect all
  if (
    task.title.toLowerCase().includes('monorepo') ||
    task.title.toLowerCase().includes('pipeline')
  ) {
    fileScope.push('package.json', 'turbo.json', 'pnpm-workspace.yaml')
  }

  // Parallel safety determination
  const parallel =
    capability.risk !== 'High' &&
    !task.title.toLowerCase().includes('schema') &&
    !task.title.toLowerCase().includes('monorepo')

  return {
    parallel,
    file_scope: fileScope,
    parallelism_group: parallel ? `${capability.category}-tasks` : null,
    conflicts_with: [],
  }
}

// Main decomposition logic
function decomposeCapability(capability) {
  const tasks = []

  // Extract acceptance criteria from roadmap
  const acList = extractAcceptanceCriteria(capability)

  // For this implementation, we'll use a simplified clustering approach
  // Each capability gets 1-3 tasks based on complexity
  const taskCount = determineTaskCount(capability)

  for (let i = 0; i < taskCount; i++) {
    const taskId = `${capability.id}--T${String(i + 1).padStart(2, '0')}`
    const taskNum = i + 1

    // Determine task title based on split
    let title = capability.title
    if (taskCount > 1) {
      const suffixes = ['Schema & Structure', 'Core Logic', 'Error Handling', 'Integration']
      title = `${capability.title} - ${suffixes[i] || 'Implementation'}`
    } else {
      title = `${capability.title} - Core Implementation`
    }

    // Get acceptance criteria for this task
    const taskAC = getTaskAcceptanceCriteria(acList, i, taskCount)

    // Determine task context for sizing and risk
    const taskContext = {
      introducesPersistence:
        capability.category === 'storage' || capability.category === 'foundation',
      handlesSecurityData: capability.id.includes('OAUTH') || capability.id.includes('GMAIL'),
      schemaChange: capability.id.includes('SCHEMA') || capability.id.includes('SQLITE'),
      multiComponent: taskCount > 2,
      integrates2Components: taskCount === 2,
      errorSurface: i === taskCount - 1,
    }

    const risk = propagateRisk(capability.risk, taskContext)
    const size = determineSize(taskContext)

    // Build spec references
    const relatedSpecs = capability.spec_refs.map((ref) => ref.source_file)
    const relatedAdrs = capability.adr_refs || []
    const relatedGuides = (capability.guides || []).map((g) => `docs/guides/${g}`)

    // Parallel execution metadata
    const parallelMeta = analyzeParallelSafety({ title, taskId }, capability)

    const task = {
      task_id: taskId,
      capability_id: capability.id,
      phase: `Phase ${capability.phase}`,
      slice: `Slice ${capability.phase}.${capability.slice}`,
      title,
      description: `Implements ${capability.title} with TDD=${capability.tdd}`,
      acceptance_criteria: taskAC,
      risk,
      est: { size },
      depends_on_tasks: [],
      gap_codes: [],
      provisional: capability.defer || false,
      related_specs: relatedSpecs,
      related_adrs: relatedAdrs,
      related_guides: relatedGuides,
      parallel: parallelMeta.parallel,
      conflicts_with: parallelMeta.conflicts_with,
      file_scope: parallelMeta.file_scope,
      parallelism_group: parallelMeta.parallelism_group,
    }

    tasks.push(task)
  }

  return tasks
}

function determineTaskCount(capability) {
  // High-risk or complex capabilities get split more
  if (capability.risk === 'High') {
    if (capability.id.includes('SCHEMA') || capability.id.includes('STATE_MACHINE')) {
      return 3
    }
    return 2
  }

  if (capability.risk === 'Medium' && capability.tdd === 'Required') {
    return 2
  }

  return 1
}

function extractAcceptanceCriteria(capability) {
  // Parse acceptance criteria from roadmap
  const roadmapPath = path.join(__dirname, '..', 'docs', 'master', 'roadmap.md')

  if (!fs.existsSync(roadmapPath)) {
    console.warn(`Roadmap not found, using default AC for ${capability.id}`)
    return getDefaultAC(capability)
  }

  const roadmapContent = fs.readFileSync(roadmapPath, 'utf8')

  // Find the capability section
  const capRegex = new RegExp(`####\\s+${capability.id}\\s*$`, 'm')
  const match = roadmapContent.match(capRegex)

  if (!match) {
    console.warn(`Capability ${capability.id} not found in roadmap, using defaults`)
    return getDefaultAC(capability)
  }

  const startIndex = match.index

  // Find the end of this capability (next #### or end of file)
  const nextCapMatch = roadmapContent.slice(startIndex + 1).match(/^####\s+/m)
  const endIndex = nextCapMatch ? startIndex + 1 + nextCapMatch.index : roadmapContent.length

  const capSection = roadmapContent.slice(startIndex, endIndex)

  // Extract Acceptance Criteria section
  const acMatch = capSection.match(/\*\*Acceptance Criteria\*\*:\s*([\s\S]*?)(?=\*\*|$)/)

  if (!acMatch) {
    console.warn(`No AC section found for ${capability.id}, using defaults`)
    return getDefaultAC(capability)
  }

  const acText = acMatch[1]

  // Parse bullet points
  const bullets = acText.match(/- \[ \] (.+)/g)

  if (!bullets || bullets.length === 0) {
    return getDefaultAC(capability)
  }

  return bullets.map((bullet, idx) => {
    const text = bullet.replace(/^- \[ \] /, '').trim()
    return {
      id: `${capability.id}-AC${String(idx + 1).padStart(2, '0')}`,
      text,
    }
  })
}

function getDefaultAC(capability) {
  // Fallback when no AC found in roadmap
  return [
    {
      id: `${capability.id}-AC01`,
      text: `${capability.title} is implemented with ${capability.tdd} TDD approach`,
    },
    {
      id: `${capability.id}-AC02`,
      text: `All tests pass with adequate coverage for critical paths`,
    },
  ]
}

function getTaskAcceptanceCriteria(allAC, taskIndex, totalTasks) {
  // Distribute AC across tasks
  const perTask = Math.ceil(allAC.length / totalTasks)
  const start = taskIndex * perTask
  const end = Math.min(start + perTask, allAC.length)

  return allAC.slice(start, end)
}

// Build dependency graph
function buildDependencies(allTasks, capGraph) {
  const tasksByCapability = new Map()

  // Group tasks by capability
  for (const task of allTasks) {
    if (!tasksByCapability.has(task.capability_id)) {
      tasksByCapability.set(task.capability_id, [])
    }
    tasksByCapability.get(task.capability_id).push(task)
  }

  // Add intra-capability dependencies (linear chain)
  for (const [capId, tasks] of tasksByCapability) {
    for (let i = 1; i < tasks.length; i++) {
      tasks[i].depends_on_tasks.push(tasks[i - 1].task_id)
    }
  }

  // Add inter-capability dependencies
  for (const capability of capGraph.capabilities) {
    const dependsOn = capability.depends_on || []
    const capTasks = tasksByCapability.get(capability.id) || []

    if (capTasks.length === 0) continue

    for (const depCapId of dependsOn) {
      const depTasks = tasksByCapability.get(depCapId) || []
      if (depTasks.length > 0) {
        // First task of current cap depends on last task of dependency cap
        const lastDepTask = depTasks[depTasks.length - 1]
        if (!capTasks[0].depends_on_tasks.includes(lastDepTask.task_id)) {
          capTasks[0].depends_on_tasks.push(lastDepTask.task_id)
        }
      }
    }
  }
}

// Build conflict graph
function buildConflicts(allTasks) {
  for (let i = 0; i < allTasks.length; i++) {
    for (let j = i + 1; j < allTasks.length; j++) {
      const taskA = allTasks[i]
      const taskB = allTasks[j]

      // Same capability tasks conflict
      if (taskA.capability_id === taskB.capability_id) {
        taskA.conflicts_with.push(taskB.task_id)
        taskB.conflicts_with.push(taskA.task_id)
        continue
      }

      // Check file scope overlap
      const hasOverlap = taskA.file_scope.some((fileA) =>
        taskB.file_scope.some((fileB) => {
          // Check for overlap
          if (fileA === fileB) return true
          if (fileA.includes('**') && fileB.startsWith(fileA.replace('/**', ''))) return true
          if (fileB.includes('**') && fileA.startsWith(fileB.replace('/**', ''))) return true
          return false
        })
      )

      if (hasOverlap) {
        taskA.conflicts_with.push(taskB.task_id)
        taskB.conflicts_with.push(taskA.task_id)
      }
    }
  }
}

// Main execution
console.log('Starting Virtual Task Manifest generation...')

// Process all capabilities
const allTasks = []
for (const capability of capGraph.capabilities) {
  const tasks = decomposeCapability(capability)
  allTasks.push(...tasks)
}

console.log(`Generated ${allTasks.length} tasks from ${capGraph.capabilities.length} capabilities`)

// Build dependencies
buildDependencies(allTasks, capGraph)

// Build conflicts
buildConflicts(allTasks)

// Sort tasks canonically
allTasks.sort((a, b) => {
  const phaseA = parseInt(a.phase.replace('Phase ', ''))
  const phaseB = parseInt(b.phase.replace('Phase ', ''))
  if (phaseA !== phaseB) return phaseA - phaseB

  const sliceA = parseFloat(a.slice.replace('Slice ', ''))
  const sliceB = parseFloat(b.slice.replace('Slice ', ''))
  if (sliceA !== sliceB) return sliceA - sliceB

  return a.task_id.localeCompare(b.task_id)
})

// Compute manifest hash
const manifestContent = JSON.stringify(allTasks, null, 2)
const manifestHash =
  'sha256:' + crypto.createHash('sha256').update(manifestContent).digest('hex').substring(0, 11)

// Count parallel vs serial
const parallelTasks = allTasks.filter((t) => t.parallel).length
const serialTasks = allTasks.filter((t) => !t.parallel).length
const parallelismGroups = new Set(allTasks.map((t) => t.parallelism_group).filter(Boolean)).size

// Build final manifest
const manifest = {
  status: 'OK',
  manifest_hash: manifestHash,
  decomposition_input_hash: decompositionInputHash,
  timestamp: new Date().toISOString(),
  metadata: {
    total_capabilities: capGraph.total_capabilities,
    total_tasks: allTasks.length,
    total_acceptance_criteria: allTasks.reduce((sum, t) => sum + t.acceptance_criteria.length, 0),
    parallel_execution_metadata_version: '1.0.0',
    total_parallel_tasks: parallelTasks,
    total_serial_tasks: serialTasks,
    parallelism_groups: parallelismGroups,
  },
  tasks: allTasks,
}

// Write to output file
const outputPath = path.join(__dirname, '..', 'docs', 'backlog', 'virtual-task-manifest.json')
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n')

console.log('✓ Virtual Task Manifest generated successfully')
console.log(`  Location: ${outputPath}`)
console.log(`  Tasks: ${allTasks.length}`)
console.log(`  Parallel-safe: ${parallelTasks}`)
console.log(`  Serial: ${serialTasks}`)
console.log(`  Manifest hash: ${manifestHash}`)
console.log(`  Input hash: ${decompositionInputHash}`)
