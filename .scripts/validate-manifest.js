#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'backlog', 'virtual-task-manifest.json'),
    'utf8'
  )
)

console.log('=== MANIFEST VALIDATION ===')
console.log('Status:', manifest.status)
console.log('Total tasks:', manifest.metadata.total_tasks)
console.log('Acceptance criteria:', manifest.metadata.total_acceptance_criteria)
console.log('Parallel tasks:', manifest.metadata.total_parallel_tasks)
console.log('Serial tasks:', manifest.metadata.total_serial_tasks)
console.log('')

// Check Phase distribution
const phases = {}
manifest.tasks.forEach((t) => {
  phases[t.phase] = (phases[t.phase] || 0) + 1
})
console.log('Phase distribution:')
Object.entries(phases)
  .sort()
  .forEach(([p, count]) => {
    console.log('  ' + p + ':', count, 'tasks')
  })
console.log('')

// Risk distribution
const risks = {}
manifest.tasks.forEach((t) => {
  risks[t.risk] = (risks[t.risk] || 0) + 1
})
console.log('Risk distribution:')
Object.entries(risks)
  .sort()
  .forEach(([r, count]) => {
    console.log('  ' + r + ':', count, 'tasks')
  })
console.log('')

// Check dependency integrity
console.log('Dependency validation:')
let invalidDeps = 0
const taskIds = new Set(manifest.tasks.map((t) => t.task_id))

manifest.tasks.forEach((task) => {
  task.depends_on_tasks.forEach((dep) => {
    if (!taskIds.has(dep)) {
      console.log('  ERROR: Task', task.task_id, 'depends on missing task', dep)
      invalidDeps++
    }
  })
})
console.log('  Invalid dependencies:', invalidDeps)
console.log('')

// Check for cycles (simple check)
function hasCycle() {
  const visited = new Set()
  const recursionStack = new Set()

  const taskMap = new Map(manifest.tasks.map((t) => [t.task_id, t]))

  function dfs(taskId) {
    visited.add(taskId)
    recursionStack.add(taskId)

    const task = taskMap.get(taskId)
    if (!task) return false

    for (const dep of task.depends_on_tasks) {
      if (!visited.has(dep)) {
        if (dfs(dep)) return true
      } else if (recursionStack.has(dep)) {
        return true
      }
    }

    recursionStack.delete(taskId)
    return false
  }

  for (const task of manifest.tasks) {
    if (!visited.has(task.task_id)) {
      if (dfs(task.task_id)) return true
    }
  }

  return false
}

console.log('Cycle detection:', hasCycle() ? 'CYCLE DETECTED!' : 'No cycles')
console.log('')

// Sample Phase 2 task
const phase2Task = manifest.tasks.find((t) => t.phase === 'Phase 2')
if (phase2Task) {
  console.log('Sample Phase 2 task:')
  console.log('  ID:', phase2Task.task_id)
  console.log('  Title:', phase2Task.title)
  console.log('  Risk:', phase2Task.risk)
  console.log('  Parallel:', phase2Task.parallel)
  console.log('  Dependencies:', phase2Task.depends_on_tasks.length)
  console.log('  Conflicts:', phase2Task.conflicts_with.length)
  console.log('  AC count:', phase2Task.acceptance_criteria.length)
}

// Check all tasks have required fields
console.log('\nField completeness check:')
let missingFields = 0
const requiredFields = [
  'task_id',
  'capability_id',
  'phase',
  'slice',
  'title',
  'description',
  'acceptance_criteria',
  'risk',
  'est',
  'depends_on_tasks',
  'gap_codes',
  'provisional',
  'related_specs',
  'related_adrs',
  'related_guides',
  'parallel',
  'conflicts_with',
  'file_scope',
  'parallelism_group',
]

manifest.tasks.forEach((task) => {
  requiredFields.forEach((field) => {
    if (!(field in task)) {
      console.log(`  ERROR: Task ${task.task_id} missing field: ${field}`)
      missingFields++
    }
  })

  // Check AC structure
  task.acceptance_criteria.forEach((ac, idx) => {
    if (!ac.id || !ac.text) {
      console.log(`  ERROR: Task ${task.task_id} AC ${idx} missing id or text`)
      missingFields++
    }
  })
})

console.log('  Missing/invalid fields:', missingFields)

// Check symmetry of conflicts
console.log('\nConflict symmetry check:')
let asymmetric = 0
const taskMap = new Map(manifest.tasks.map((t) => [t.task_id, t]))

manifest.tasks.forEach((task) => {
  task.conflicts_with.forEach((conflictId) => {
    const conflictTask = taskMap.get(conflictId)
    if (conflictTask && !conflictTask.conflicts_with.includes(task.task_id)) {
      console.log(`  WARN: ${task.task_id} conflicts with ${conflictId}, but not vice versa`)
      asymmetric++
    }
  })
})
console.log('  Asymmetric conflicts:', asymmetric)

console.log('\n✓ Validation complete')
