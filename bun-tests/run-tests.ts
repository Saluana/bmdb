/**
 * Main test runner - executes all test suites and provides summary
 */

import { spawn } from "bun";
import { join } from "path";

const testFiles = [
  "table.test.ts",
  "query.test.ts", 
  "storage.test.ts",
  "schema.test.ts",
  "indexing.test.ts",
  "integration.test.ts"
];

interface TestResult {
  file: string;
  passed: boolean;
  duration: number;
  output: string;
}

async function runTest(testFile: string): Promise<TestResult> {
  const startTime = performance.now();
  
  try {
    const proc = spawn(["bun", "test", testFile], {
      cwd: __dirname,
      stdout: "pipe",
      stderr: "pipe",
    });
    
    const output = await new Response(proc.stdout).text();
    const errorOutput = await new Response(proc.stderr).text();
    
    const exitCode = await proc.exited;
    const duration = performance.now() - startTime;
    
    return {
      file: testFile,
      passed: exitCode === 0,
      duration,
      output: output + errorOutput
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    return {
      file: testFile,
      passed: false,
      duration,
      output: `Error running test: ${error}`
    };
  }
}

async function runAllTests() {
  console.log("🚀 Starting BMDB Comprehensive Test Suite...\n");
  console.log("=" * 60);
  
  const results: TestResult[] = [];
  let totalDuration = 0;
  
  for (const testFile of testFiles) {
    console.log(`📋 Running ${testFile}...`);
    const result = await runTest(testFile);
    results.push(result);
    totalDuration += result.duration;
    
    if (result.passed) {
      console.log(`✅ ${testFile} PASSED (${result.duration.toFixed(2)}ms)`);
    } else {
      console.log(`❌ ${testFile} FAILED (${result.duration.toFixed(2)}ms)`);
      console.log("Error output:", result.output.slice(-500)); // Last 500 chars
    }
    console.log("");
  }
  
  console.log("=" * 60);
  console.log("📊 TEST SUMMARY");
  console.log("=" * 60);
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log("\n❌ FAILED TESTS:");
    results.filter(r => !r.passed).forEach(result => {
      console.log(`  - ${result.file}`);
    });
  } else {
    console.log("\n🎉 ALL TESTS PASSED!");
  }
  
  console.log("\n🔍 DETECTED ISSUES:");
  
  // Analyze results for potential issues
  const slowTests = results.filter(r => r.duration > 30000); // > 30 seconds
  if (slowTests.length > 0) {
    console.log("⚠️  Slow tests detected:");
    slowTests.forEach(test => {
      console.log(`  - ${test.file}: ${test.duration.toFixed(2)}ms`);
    });
  }
  
  const memoryIssues = results.filter(r => r.output.includes("out of memory") || r.output.includes("heap"));
  if (memoryIssues.length > 0) {
    console.log("🧠 Memory-related issues detected:");
    memoryIssues.forEach(test => {
      console.log(`  - ${test.file}`);
    });
  }
  
  const timeoutIssues = results.filter(r => r.output.includes("timeout") || r.output.includes("TIMEOUT"));
  if (timeoutIssues.length > 0) {
    console.log("⏱️  Timeout issues detected:");
    timeoutIssues.forEach(test => {
      console.log(`  - ${test.file}`);
    });
  }
  
  if (slowTests.length === 0 && memoryIssues.length === 0 && timeoutIssues.length === 0) {
    console.log("✅ No performance or memory issues detected!");
  }
  
  console.log("\n" + "=" * 60);
  console.log("🏁 Test run completed!");
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run if this is the main module
if (import.meta.main) {
  runAllTests().catch(error => {
    console.error("Fatal error running tests:", error);
    process.exit(1);
  });
}