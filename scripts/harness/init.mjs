#!/usr/bin/env node
/**
 * Agent Harness: Initializer Run
 *
 * Validates environment and prints harness snapshot for agent context.
 * Run at start of every agent session to establish baseline.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

const REQUIRED_FILES = [
  'README.md',
  'AGENTS.md',
  'CONTINUITY.md',
  'PROGRESS.md',
  'docs/tasks/task-registry.json',
  'package.json'
];

const PROGRESS_TEMPLATE = `# Progress Tracker (Session Artifact)

This file tracks per-task/per-session progress. Keep it short and focused on the current work.

## Current objective
(Describe the current task or feature being implemented)

## Current state (what is true now)
- (List facts about the current state)

## What changed in this session
- (Will be filled during the session)

## Next step (single step)
(Describe the next single actionable step)

## Commands run (copy/paste)
\`\`\`bash
# (Commands will be added as work progresses)
\`\`\`

## Session log (append-only)
- YYYY-MM-DD HH:MM: Session started
`;

function checkNodeVersion() {
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeMajor !== 20) {
    console.error(`❌ Node version check failed: expected Node 20, got Node ${nodeMajor}`);
    console.error(`   Current version: ${process.version}`);
    process.exit(1);
  }
  console.log(`✓ Node version: ${process.version} (major ${nodeMajor})`);
}

async function checkPnpm() {
  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let version = '';

    proc.stdout.on('data', (data) => {
      version += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✓ pnpm available: v${version.trim()}`);
        resolve(true);
      } else {
        console.error('❌ pnpm not found or not working');
        process.exit(1);
      }
    });

    proc.on('error', () => {
      console.error('❌ pnpm not found in PATH');
      process.exit(1);
    });
  });
}

function checkRequiredFiles() {
  console.log('\\nChecking required files...');
  let allExist = true;

  for (const file of REQUIRED_FILES) {
    const path = resolve(ROOT, file);
    const exists = existsSync(path);

    if (!exists) {
      console.error(`  ❌ Missing: ${file}`);
      allExist = false;

      // Auto-create PROGRESS.md if missing
      if (file === 'PROGRESS.md') {
        console.log(`     Creating PROGRESS.md from template...`);
        try {
          writeFileSync(path, PROGRESS_TEMPLATE, 'utf-8');
          console.log(`     ✓ Created PROGRESS.md`);
          allExist = true; // Recovery successful
        } catch (err) {
          console.error(`     Failed to create PROGRESS.md: ${err.message}`);
        }
      }
    } else {
      console.log(`  ✓ ${file}`);
    }
  }

  return allExist;
}

function readContinuity() {
  const path = resolve(ROOT, 'CONTINUITY.md');
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\\n');

    // Extract Goal
    const goalStart = lines.findIndex(l => l.startsWith('Goal (incl. success criteria):'));
    const constraintsStart = lines.findIndex(l => l.startsWith('Constraints/Assumptions:'));
    const stateStart = lines.findIndex(l => l.startsWith('State:'));
    const nowStart = lines.findIndex(l => l.startsWith('Now:'));
    const nextStart = lines.findIndex(l => l.startsWith('Next:'));
    const openStart = lines.findIndex(l => l.startsWith('Open questions'));

    const goal = goalStart >= 0 && constraintsStart >= 0
      ? lines.slice(goalStart + 1, constraintsStart).filter(l => l.trim()).join('\\n')
      : '(Not found)';

    const now = nowStart >= 0 && nextStart >= 0
      ? lines.slice(nowStart + 1, nextStart).filter(l => l.trim()).slice(0, 3).join('\\n')
      : '(Not found)';

    const next = nextStart >= 0 && openStart >= 0
      ? lines.slice(nextStart + 1, openStart).filter(l => l.trim()).slice(0, 3).join('\\n')
      : '(Not found)';

    const openQuestions = openStart >= 0
      ? lines.slice(openStart + 1).filter(l => l.trim() && l.startsWith('-')).slice(0, 3).join('\\n')
      : '(None)';

    return { goal, now, next, openQuestions };
  } catch (err) {
    console.error(`Failed to read CONTINUITY.md: ${err.message}`);
    return { goal: '(Error)', now: '(Error)', next: '(Error)', openQuestions: '(Error)' };
  }
}

function readProgress() {
  const path = resolve(ROOT, 'PROGRESS.md');
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\\n');

    const objectiveStart = lines.findIndex(l => l.startsWith('## Current objective'));
    const stateStart = lines.findIndex(l => l.startsWith('## Current state'));
    const nextStart = lines.findIndex(l => l.startsWith('## Next step'));

    const objective = objectiveStart >= 0 && stateStart >= 0
      ? lines.slice(objectiveStart + 1, stateStart).filter(l => l.trim() && !l.startsWith('#')).join(' ').trim()
      : '(Not found)';

    const nextStep = nextStart >= 0
      ? lines.slice(nextStart + 1).filter(l => l.trim() && !l.startsWith('#'))[0] || '(Not found)'
      : '(Not found)';

    return { objective, nextStep };
  } catch (err) {
    return { objective: '(Not in PROGRESS.md)', nextStep: '(Not in PROGRESS.md)' };
  }
}

function printHarnessSnapshot() {
  console.log('');
  console.log('='.repeat(70));
  console.log('HARNESS SNAPSHOT');
  console.log('='.repeat(70));

  const continuity = readContinuity();
  const progress = readProgress();

  console.log('');
  console.log('📋 Current Objective (from PROGRESS.md):');
  console.log('  ' + progress.objective);

  console.log('');
  console.log('🎯 Goal (from CONTINUITY.md):');
  continuity.goal.split('\n').forEach(line => console.log('  ' + line));

  console.log('');
  console.log('📍 Now (from CONTINUITY.md):');
  continuity.now.split('\n').forEach(line => console.log('  ' + line));

  console.log('');
  console.log('⏭️  Next (from CONTINUITY.md):');
  continuity.next.split('\n').forEach(line => console.log('  ' + line));

  console.log('');
  console.log('🔍 Next Step (from PROGRESS.md):');
  console.log('  ' + progress.nextStep);

  console.log('');
  console.log('❓ Open Questions (from CONTINUITY.md):');
  if (continuity.openQuestions === '(None)') {
    console.log('  None');
  } else {
    continuity.openQuestions.split('\n').forEach(line => console.log('  ' + line));
  }

  console.log('');
  console.log('='.repeat(70));
}

async function main() {
  console.log('Agent Harness: Initializer Run');
  console.log('='.repeat(70));

  console.log('\\nEnvironment checks:');
  checkNodeVersion();
  await checkPnpm();

  const filesOk = checkRequiredFiles();

  if (!filesOk) {
    console.error('\\n❌ Harness initialization failed: missing required files');
    process.exit(1);
  }

  printHarnessSnapshot();

  console.log('\\n✅ Harness initialization complete');
  console.log('\\nNext steps:');
  console.log('  1. Run: pnpm harness:smoke --quick');
  console.log('  2. Begin work on current objective');
  console.log('  3. Before handoff: pnpm harness:clean');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
