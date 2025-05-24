#!/usr/bin/env bun

/**
 * Test runner for all BmDB tests
 * Runs all test files and reports results
 */

import { spawn } from 'child_process';
import { join } from 'path';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  output?: string;
  error?: string;
}

const tests = [
  { name: 'Basic Functionality', file: 'test.ts' },
  { name: 'V2 Schema API', file: 'example-v2.ts' },
  { name: 'Binary Storage Demo', file: 'demo-binary-storage.ts' },
  { name: 'Quick Performance', file: 'quick-perf.ts' },
  { name: 'Performance Comparison', file: 'performance-comparison.ts' },
  { name: 'Detailed Performance', file: 'perf-test.ts' }
];

async function runTest(testFile: string): Promise<TestResult> {
  const startTime = Date.now();
  const testPath = join(__dirname, testFile);
  
  return new Promise((resolve) => {
    const child = spawn('bun', ['run', testPath], {
      stdio: 'pipe',
      cwd: join(__dirname, '..')
    });
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        name: testFile,
        status: code === 0 ? 'pass' : 'fail',
        duration,
        output: output.trim(),
        error: error.trim()
      });
    });
    
    child.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({
        name: testFile,
        status: 'fail',
        duration,
        error: err.message
      });
    });
  });
}

async function runAllTests() {
  console.log('🧪 Running BmDB Test Suite\n');
  console.log('='.repeat(50));
  
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n📋 Running: ${test.name}`);
    console.log('-'.repeat(30));
    
    const result = await runTest(test.file);
    results.push(result);
    
    if (result.status === 'pass') {
      console.log(`✅ ${test.name} - PASSED (${result.duration}ms)`);
      passed++;
    } else {
      console.log(`❌ ${test.name} - FAILED (${result.duration}ms)`);
      if (result.error) {
        console.log(`   Error: ${result.error.split('\\n')[0]}`);
      }
      failed++;
    }
  }
  
  // Summary
  console.log('\\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`Total tests: ${tests.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\\n🎉 All tests passed!');
  } else {
    console.log('\\n⚠️  Some tests failed. See details above.');
    
    // Show failed test details
    const failedTests = results.filter(r => r.status === 'fail');
    if (failedTests.length > 0) {
      console.log('\\n📋 Failed Test Details:');
      for (const test of failedTests) {
        console.log(`\\n❌ ${test.name}:`);
        if (test.error) {
          console.log(`   Error: ${test.error}`);
        }
        if (test.output) {
          console.log(`   Output: ${test.output.slice(0, 200)}...`);
        }
      }
    }
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run if this file is executed directly
if (import.meta.main) {
  runAllTests().catch(console.error);
}