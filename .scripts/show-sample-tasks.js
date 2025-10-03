#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'backlog', 'virtual-task-manifest.json'), 'utf8'));

// Show first few tasks with full details
console.log('=== SAMPLE TASKS (First 3) ===\n');

manifest.tasks.slice(0, 3).forEach((task, idx) => {
  console.log(`Task ${idx + 1}: ${task.task_id}`);
  console.log(`  Title: ${task.title}`);
  console.log(`  Capability: ${task.capability_id}`);
  console.log(`  Phase/Slice: ${task.phase} / ${task.slice}`);
  console.log(`  Risk: ${task.risk} | Size: ${task.est.size}`);
  console.log(`  Parallel: ${task.parallel} | Group: ${task.parallelism_group || 'none'}`);
  console.log(`  Dependencies: ${task.depends_on_tasks.join(', ') || 'none'}`);
  console.log(`  Conflicts: ${task.conflicts_with.length} tasks`);
  console.log(`  File Scope: ${task.file_scope.join(', ')}`);
  console.log(`  Acceptance Criteria:`);
  task.acceptance_criteria.forEach(ac => {
    console.log(`    - [${ac.id}] ${ac.text}`);
  });
  console.log(`  Related Specs: ${task.related_specs.join(', ')}`);
  console.log(`  Related ADRs: ${task.related_adrs.join(', ')}`);
  console.log(`  Related Guides: ${task.related_guides.join(', ')}`);
  console.log('');
});

// Show a Phase 2 task
const phase2Task = manifest.tasks.find(t => t.phase === 'Phase 2');
console.log('=== SAMPLE PHASE 2 TASK ===\n');
console.log(`Task: ${phase2Task.task_id}`);
console.log(`  Title: ${phase2Task.title}`);
console.log(`  Capability: ${phase2Task.capability_id}`);
console.log(`  Risk: ${phase2Task.risk} | Size: ${phase2Task.est.size}`);
console.log(`  Dependencies: ${phase2Task.depends_on_tasks.join(', ')}`);
console.log(`  Acceptance Criteria:`);
phase2Task.acceptance_criteria.forEach(ac => {
  console.log(`    - [${ac.id}] ${ac.text}`);
});
console.log(`  File Scope: ${phase2Task.file_scope.join(', ')}`);
console.log(`  Parallelism Group: ${phase2Task.parallelism_group || 'none'}`);
