#!/usr/bin/env node
/**
 * Agent Harness: Clean State Guard
 *
 * Verifies the repo is in a clean, handoff-ready state.
 * Run at end of session before committing or handing off.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

const REQUIRED_FILES = ['CONTINUITY.md', 'PROGRESS.md', 'docs/tasks/task-registry.json'];

function checkGitStatus() {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['status', '--porcelain'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git status failed: ${stderr}`));
        return;
      }

      const lines = stdout.trim().split('\\n').filter(l => l.trim());
      resolve({
        clean: lines.length === 0,
        files: lines.map(l => l.substring(3)) // Remove status prefix
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function checkProgressUpdated() {
  const path = resolve(ROOT, 'PROGRESS.md');

  if (!existsSync(path)) {
    return { updated: false, reason: 'PROGRESS.md does not exist' };
  }

  const content = readFileSync(path, 'utf-8');

  // Check if "What changed in this session" has content
  const lines = content.split('\n');
  const changedIdx = lines.findIndex(l => l.startsWith('## What changed in this session'));

  if (changedIdx === -1) {
    return { updated: false, reason: 'PROGRESS.md missing "What changed in this session" section' };
  }

  const nextSectionIdx = lines.findIndex((l, i) => i > changedIdx && l.startsWith('##'));
  const changedContent = lines.slice(changedIdx + 1, nextSectionIdx === -1 ? undefined : nextSectionIdx)
    .filter(l => l.trim() && !l.startsWith('#'))
    .join('\n');

  if (!changedContent || changedContent.includes('(work in progress)') || changedContent.includes('(will be filled')) {
    return { updated: false, reason: '"What changed in this session" section is empty or has placeholder text' };
  }

  return { updated: true };
}

function checkContinuityUpdated() {
  const path = resolve(ROOT, 'CONTINUITY.md');

  if (!existsSync(path)) {
    return { warning: true, reason: 'CONTINUITY.md does not exist' };
  }

  // Best-effort: warn if CONTINUITY.md is older than 1 hour
  // This is heuristic; we can't definitively know if it needs updating
  const stats = statSync(path);
  const ageMs = Date.now() - stats.mtimeMs;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > 1) {
    return { warning: true, reason: 'CONTINUITY.md not modified in last hour - verify it reflects current state' };
  }

  return { warning: false };
}

function checkTaskRegistryUpdated() {
  const path = resolve(ROOT, 'docs/tasks/task-registry.json');

  if (!existsSync(path)) {
    return { warning: true, reason: 'task-registry.json does not exist' };
  }

  // Best-effort: warn if task-registry.json is older than 1 hour
  const stats = statSync(path);
  const ageMs = Date.now() - stats.mtimeMs;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > 1) {
    return { warning: true, reason: 'task-registry.json not modified in last hour - verify task status is up-to-date' };
  }

  return { warning: false };
}

async function main() {
  console.log('Agent Harness: Clean State Guard');
  console.log('='.repeat(70));
  console.log('\\nVerifying handoff-ready state...\\n');

  const checks = {
    gitStatus: null,
    progressUpdated: null,
    continuityUpdated: null,
    taskRegistryUpdated: null
  };

  let hasErrors = false;
  const warnings = [];

  // Check 1: Git status
  console.log('1️⃣  Checking git status...');
  try {
    checks.gitStatus = await checkGitStatus();
    if (checks.gitStatus.clean) {
      console.log('   ✅ Git status is clean');
    } else {
      console.log('   ⚠️  Git status is NOT clean:');
      checks.gitStatus.files.forEach(f => console.log(`      - ${f}`));
      console.log('   ℹ️  Commit changes or verify they are expected before handoff');
      warnings.push('Git has uncommitted changes');
    }
  } catch (err) {
    console.error(`   ❌ Failed to check git status: ${err.message}`);
    hasErrors = true;
  }

  // Check 2: PROGRESS.md updated
  console.log('\\n2️⃣  Checking PROGRESS.md updated...');
  checks.progressUpdated = checkProgressUpdated();
  if (checks.progressUpdated.updated) {
    console.log('   ✅ PROGRESS.md has been updated');
  } else {
    console.error(`   ❌ ${checks.progressUpdated.reason}`);
    hasErrors = true;
  }

  // Check 3: CONTINUITY.md updated (best-effort warning)
  console.log('\\n3️⃣  Checking CONTINUITY.md updated...');
  checks.continuityUpdated = checkContinuityUpdated();
  if (!checks.continuityUpdated.warning) {
    console.log('   ✅ CONTINUITY.md recently modified');
  } else {
    console.log(`   ⚠️  ${checks.continuityUpdated.reason}`);
    warnings.push(checks.continuityUpdated.reason);
  }

  // Check 4: task-registry.json updated (best-effort warning)
  console.log('\\n4️⃣  Checking task-registry.json updated...');
  checks.taskRegistryUpdated = checkTaskRegistryUpdated();
  if (!checks.taskRegistryUpdated.warning) {
    console.log('   ✅ task-registry.json recently modified');
  } else {
    console.log(`   ⚠️  ${checks.taskRegistryUpdated.reason}`);
    warnings.push(checks.taskRegistryUpdated.reason);
  }

  // Summary
  console.log('\\n' + '='.repeat(70));

  if (hasErrors) {
    console.error('❌ NOT READY TO HANDOFF');
    console.error('\\nActionable items:');
    if (checks.progressUpdated && !checks.progressUpdated.updated) {
      console.error('  - Update PROGRESS.md "What changed in this session" section');
    }
    console.log('');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('⚠️  READY WITH WARNINGS');
    console.log('\\nWarnings:');
    warnings.forEach(w => console.log(`  - ${w}`));
    console.log('\\nReview warnings before handoff.');
  } else {
    console.log('✅ READY TO HANDOFF');
    console.log('\\nAll checks passed. Repo is in clean state.');
  }

  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
