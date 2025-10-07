import vtm from './docs/backlog/virtual-task-manifest.json' assert { type: 'json' };
import state from './docs/backlog/task-state.json' assert { type: 'json' };

// Find completed task IDs
const completed = new Set(Object.keys(state.tasks).filter(id => state.tasks[id].status === 'completed'));

console.log('COMPLETED TASKS:', Array.from(completed).join(', '));
console.log('\nELIGIBLE TASKS (dependencies satisfied, not yet started):');

const eligible = [];

for (const task of vtm.tasks) {
  const isCompleted = completed.has(task.task_id);
  const isStarted = state.tasks[task.task_id]?.status;
  const dependenciesMet = task.depends_on_tasks.every(dep => completed.has(dep));

  if (!isCompleted && !isStarted && dependenciesMet) {
    eligible.push(task);
    console.log(`- ${task.task_id} (risk=${task.risk}, depends_on=[${task.depends_on_tasks.join(', ') || 'none'}])`);
  }
}

console.log(`\nTOTAL ELIGIBLE: ${eligible.length}`);

// Group by risk
const byRisk = { High: [], Medium: [], Low: [] };
for (const t of eligible) {
  byRisk[t.risk].push(t.task_id);
}

console.log('\nBY RISK LEVEL:');
console.log(`  High: ${byRisk.High.length} tasks`);
for (const id of byRisk.High) {
  console.log(`    - ${id}`);
}
console.log(`  Medium: ${byRisk.Medium.length} tasks`);
for (const id of byRisk.Medium) {
  console.log(`    - ${id}`);
}
console.log(`  Low: ${byRisk.Low.length} tasks`);
for (const id of byRisk.Low) {
  console.log(`    - ${id}`);
}
