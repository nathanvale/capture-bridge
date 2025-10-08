#!/usr/bin/env node
/**
 * VTM Status Analyzer
 *
 * Reads virtual-task-manifest.json and task-state.json
 * Provides various views of task status, eligibility, and progress
 *
 * Usage:
 *   node vtm-status.mjs --dashboard    # Quick overview
 *   node vtm-status.mjs --next         # Next eligible task
 *   node vtm-status.mjs --status       # Detailed breakdown
 *   node vtm-status.mjs --blocked      # Blocked tasks
 *
 * Output: JSON to stdout
 * Errors: JSON with "error" field to stdout, exit code 1
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get script directory to resolve relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Configuration
const VTM_PATH = join(projectRoot, 'docs/backlog/virtual-task-manifest.json');
const STATE_PATH = join(projectRoot, 'docs/backlog/task-state.json');

// Load data with error handling
let vtm, state;
try {
  vtm = JSON.parse(readFileSync(VTM_PATH, 'utf-8'));
  state = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
} catch (error) {
  console.log(JSON.stringify({
    error: `Failed to load VTM or state files: ${error.message}`,
    vtm_path: VTM_PATH,
    state_path: STATE_PATH
  }, null, 2));
  process.exit(1);
}

// Parse command
const command = process.argv[2] || '--dashboard';

// Analyze tasks
const completed = new Set(
  Object.keys(state.tasks || {}).filter(id => state.tasks[id]?.status === 'completed')
);

const inProgress = new Set(
  Object.keys(state.tasks || {}).filter(id => state.tasks[id]?.status === 'in-progress')
);

const blocked = new Set(
  Object.keys(state.tasks || {}).filter(id => state.tasks[id]?.status === 'blocked')
);

const eligible = (vtm.tasks || []).filter(task => {
  const taskState = state.tasks?.[task.task_id];
  const isNotStarted = !taskState || taskState.status === 'pending';
  const dependenciesMet = (task.depends_on_tasks || []).every(dep => completed.has(dep));
  return isNotStarted && dependenciesMet;
});

// Command handlers
const handlers = {
  '--dashboard': showDashboard,
  '--next': showNext,
  '--status': showStatus,
  '--blocked': showBlocked,
};

const handler = handlers[command];
if (!handler) {
  console.log(JSON.stringify({
    error: `Unknown command: ${command}`,
    available: Object.keys(handlers)
  }, null, 2));
  process.exit(1);
}

handler();

// --- Handler Functions ---

function showDashboard() {
  const total = vtm.tasks?.length || 0;
  const completedCount = completed.size;
  const percentage = total > 0 ? ((completedCount / total) * 100).toFixed(1) : '0.0';
  const nextTask = selectNextTask(eligible);

  const output = {
    progress: {
      completed: completedCount,
      total: total,
      percentage: parseFloat(percentage)
    },
    next_task: nextTask ? {
      task_id: nextTask.task_id,
      title: nextTask.title,
      risk: nextTask.risk
    } : null,
    in_progress: inProgress.size,
    blocked: blocked.size,
    eligible: eligible.length
  };

  console.log(JSON.stringify(output, null, 2));
}

function showNext() {
  const nextTask = selectNextTask(eligible);

  if (!nextTask) {
    console.log(JSON.stringify({
      error: 'No eligible tasks',
      reason: 'All tasks are either completed, in-progress, blocked, or waiting on dependencies'
    }, null, 2));
    process.exit(1);
  }

  const output = {
    task_id: nextTask.task_id,
    title: nextTask.title,
    description: nextTask.description || '',
    risk: nextTask.risk,
    phase: nextTask.phase,
    slice: nextTask.slice,
    size: nextTask.est?.size || 'M',
    acceptance_criteria: nextTask.acceptance_criteria || [],
    depends_on_tasks: nextTask.depends_on_tasks || [],
    related_specs: nextTask.related_specs || [],
    related_adrs: nextTask.related_adrs || [],
    related_guides: nextTask.related_guides || [],
    test_verification: nextTask.test_verification || []
  };

  console.log(JSON.stringify(output, null, 2));
}

function showStatus() {
  // Group by phase, slice, risk
  const byPhase = {};
  const bySlice = {};
  const byRisk = { High: 0, Medium: 0, Low: 0 };

  for (const task of vtm.tasks || []) {
    const taskState = state.tasks?.[task.task_id];
    const status = taskState?.status || 'pending';

    // By phase
    if (!byPhase[task.phase]) {
      byPhase[task.phase] = { completed: 0, total: 0 };
    }
    byPhase[task.phase].total++;
    if (status === 'completed') byPhase[task.phase].completed++;

    // By slice
    if (!bySlice[task.slice]) {
      bySlice[task.slice] = { completed: 0, total: 0 };
    }
    bySlice[task.slice].total++;
    if (status === 'completed') bySlice[task.slice].completed++;

    // By risk (only count pending/in-progress)
    if (status !== 'completed' && status !== 'abandoned') {
      byRisk[task.risk] = (byRisk[task.risk] || 0) + 1;
    }
  }

  // Recent completed (last 5)
  const recentCompleted = Object.entries(state.tasks || {})
    .filter(([_, s]) => s.status === 'completed' && s.completed_at)
    .sort((a, b) => new Date(b[1].completed_at) - new Date(a[1].completed_at))
    .slice(0, 5)
    .map(([id, s]) => ({
      task_id: id,
      completed_at: s.completed_at
    }));

  const output = {
    by_phase: byPhase,
    by_slice: bySlice,
    by_risk: byRisk,
    recent_completed: recentCompleted,
    in_progress_tasks: Array.from(inProgress)
  };

  console.log(JSON.stringify(output, null, 2));
}

function showBlocked() {
  const blockedTasks = (vtm.tasks || []).filter(task => {
    const taskState = state.tasks?.[task.task_id];
    if (taskState?.status === 'blocked') return true;

    // Also show tasks waiting on dependencies
    const isNotStarted = !taskState || taskState.status === 'pending';
    const hasDependencies = (task.depends_on_tasks || []).length > 0;
    const dependenciesMet = (task.depends_on_tasks || []).every(dep => completed.has(dep));

    return isNotStarted && hasDependencies && !dependenciesMet;
  });

  const output = blockedTasks.map(task => {
    const taskState = state.tasks?.[task.task_id];
    const missingDeps = (task.depends_on_tasks || []).filter(dep => !completed.has(dep));

    return {
      task_id: task.task_id,
      title: task.title,
      risk: task.risk,
      blocked_reason: taskState?.blocked_reason || 'Waiting on dependencies',
      missing_dependencies: missingDeps,
      status: taskState?.status || 'pending'
    };
  });

  console.log(JSON.stringify(output, null, 2));
}

// --- Helper Functions ---

function selectNextTask(eligibleTasks) {
  if (eligibleTasks.length === 0) return null;

  // Priority: High > Medium > Low
  // Within same risk, prefer earlier in VTM order (first occurrence)
  const high = eligibleTasks.find(t => t.risk === 'High');
  if (high) return high;

  const medium = eligibleTasks.find(t => t.risk === 'Medium');
  if (medium) return medium;

  const low = eligibleTasks.find(t => t.risk === 'Low');
  if (low) return low;

  // Fallback: first eligible task
  return eligibleTasks[0];
}
