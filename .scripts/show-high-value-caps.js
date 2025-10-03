#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'backlog', 'virtual-task-manifest.json'), 'utf8'));

// Find interesting capabilities
const interesting = [
  'SQLITE_SCHEMA',
  'VOICE_POLLING_ICLOUD',
  'WHISPER_TRANSCRIPTION',
  'DIRECT_EXPORT_VOICE'
];

console.log('=== HIGH-VALUE CAPABILITY BREAKDOWN ===\n');

interesting.forEach(capId => {
  const tasks = manifest.tasks.filter(t => t.capability_id === capId);
  console.log(`${capId}: ${tasks.length} task(s)`);

  tasks.forEach(task => {
    console.log(`  [${task.task_id}] ${task.title}`);
    console.log(`    AC: ${task.acceptance_criteria.length} criteria`);
    console.log(`    Risk: ${task.risk} | Size: ${task.est.size}`);
    console.log(`    Parallel: ${task.parallel}`);
    task.acceptance_criteria.forEach(ac => {
      console.log(`      - [${ac.id}] ${ac.text.substring(0, 70)}${ac.text.length > 70 ? '...' : ''}`);
    });
    console.log('');
  });
  console.log('');
});
