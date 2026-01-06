#!/usr/bin/env node
/**
 * Agent Harness: Smoke Check
 *
 * Runs a fast deterministic set of tests to verify repo health.
 * Supports --quick and --ui flags for targeted testing.
 */

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const isQuick = args.includes('--quick');
const isUI = args.includes('--ui');

const SMOKE_TESTS = {
  quick: [
    { name: 'Schemas', filter: '@sim-corp/schemas' },
    { name: 'Company Kernel', filter: '@sim-corp/company-kernel' }
  ],
  full: [
    { name: 'Schemas', filter: '@sim-corp/schemas' },
    { name: 'Company Kernel', filter: '@sim-corp/company-kernel' },
    { name: 'Ingestion', filter: '@sim-corp/ingestion' },
    { name: 'Roaster Desktop', filter: '@sim-corp/roaster-desktop' }
  ],
  ui: [
    { name: 'Roaster Desktop', filter: '@sim-corp/roaster-desktop' }
  ]
};

function getTestSuite() {
  if (isUI) return SMOKE_TESTS.ui;
  if (isQuick) return SMOKE_TESTS.quick;
  return SMOKE_TESTS.full;
}

function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\\n${'='.repeat(70)}`);
    console.log(`🧪 Testing: ${test.name}`);
    console.log(`   Command: pnpm --filter ${test.filter} test`);
    console.log('='.repeat(70));

    const proc = spawn('pnpm', ['--filter', test.filter, 'test'], {
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${test.name} PASSED`);
        resolve({ name: test.name, passed: true });
      } else {
        console.error(`❌ ${test.name} FAILED (exit code: ${code})`);
        resolve({ name: test.name, passed: false, code });
      }
    });

    proc.on('error', (err) => {
      console.error(`❌ ${test.name} ERROR: ${err.message}`);
      resolve({ name: test.name, passed: false, error: err.message });
    });
  });
}

async function main() {
  const mode = isUI ? 'UI' : isQuick ? 'QUICK' : 'FULL';
  console.log('Agent Harness: Smoke Check');
  console.log('='.repeat(70));
  console.log(`Mode: ${mode}`);
  console.log(`Node: ${process.version}`);

  const suite = getTestSuite();
  console.log(`\\nRunning ${suite.length} test suite(s)...\\n`);

  const results = [];
  for (const test of suite) {
    const result = await runTest(test);
    results.push(result);
  }

  // Print summary
  console.log('\\n' + '='.repeat(70));
  console.log('SMOKE CHECK SUMMARY');
  console.log('='.repeat(70));

  let passCount = 0;
  let failCount = 0;

  results.forEach(r => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} - ${r.name}`);
    if (r.passed) passCount++;
    else failCount++;
  });

  console.log('');
  console.log(`Total: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('='.repeat(70));

  if (failCount > 0) {
    console.error('\\n❌ Smoke check FAILED');
    console.error(`\\n${failCount} test suite(s) failed. Fix failing tests before proceeding.`);
    process.exit(1);
  }

  console.log('\\n✅ Smoke check PASSED');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
