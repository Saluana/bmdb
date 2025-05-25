#!/usr/bin/env bun
/**
 * Debug test for indexing system
 * Provides detailed logging and introspection for troubleshooting
 */

import { TinyDB } from '../src/core/TinyDB';
import { MemoryStorage } from '../src/storage/MemoryStorage';

interface DebugUser {
  id: number;
  name: string;
  age: number;
  status: string;
}

async function runDebugTest() {
  console.log('🔍 Running Index Debug Test...\n');

  try {
    const db = new TinyDB({ storage: MemoryStorage });
    const users = db.table<DebugUser>('users');

    console.log('Step 1: Creating indexes...');
    users.createIndex('age');
    users.createIndex('status');
    console.log('✅ Indexes created for: age, status\n');

    console.log('Step 2: Inserting test data...');
    const testUsers = [
      { id: 1, name: 'Alice', age: 25, status: 'active' },
      { id: 2, name: 'Bob', age: 30, status: 'active' },
      { id: 3, name: 'Charlie', age: 25, status: 'inactive' },
      { id: 4, name: 'Diana', age: 30, status: 'active' }
    ];

    for (const user of testUsers) {
      console.log(`  Inserting: ${JSON.stringify(user)}`);
      users.insert(user);
    }
    console.log('✅ All users inserted\n');

    // Debug: Check index state after inserts
    console.log('Step 3: Index state after inserts...');
    const statsAfterInsert = users.getIndexStats();
    console.log('Index Statistics:');
    for (const [field, stat] of Object.entries(statsAfterInsert)) {
      console.log(`  ${field}: ${stat.totalEntries} entries, ${stat.totalDocIds} document IDs`);
    }
    console.log();

    // Debug: Test specific queries with detailed logging
    console.log('Step 4: Testing queries with debug info...');
    
    console.log('Query 1: age = 25');
    const age25Start = performance.now();
    const age25Results = users.where('age', '=', 25).find();
    const age25Time = performance.now() - age25Start;
    console.log(`  Results: ${age25Results.length} users found in ${age25Time.toFixed(2)}ms`);
    console.log(`  Users: ${age25Results.map(u => u.name).join(', ')}`);
    console.log();

    console.log('Query 2: status = active');
    const activeStart = performance.now();
    const activeResults = users.where('status', '=', 'active').find();
    const activeTime = performance.now() - activeStart;
    console.log(`  Results: ${activeResults.length} users found in ${activeTime.toFixed(2)}ms`);
    console.log(`  Users: ${activeResults.map(u => u.name).join(', ')}`);
    console.log();

    console.log('Query 3: Compound (age = 30 AND status = active)');
    const compoundStart = performance.now();
    const compoundResults = users.where('age', '=', 30).where('status', '=', 'active').find();
    const compoundTime = performance.now() - compoundStart;
    console.log(`  Results: ${compoundResults.length} users found in ${compoundTime.toFixed(2)}ms`);
    console.log(`  Users: ${compoundResults.map(u => u.name).join(', ')}`);
    console.log();

    // Debug: Test update behavior
    console.log('Step 5: Testing update behavior...');
    console.log('Updating Alice: age 25 -> 35');
    users.update({ id: 1 }, { age: 35 });
    
    const statsAfterUpdate = users.getIndexStats();
    console.log('Index Statistics after update:');
    for (const [field, stat] of Object.entries(statsAfterUpdate)) {
      console.log(`  ${field}: ${stat.totalEntries} entries, ${stat.totalDocIds} document IDs`);
    }
    
    console.log('Verifying age = 25 query after update:');
    const age25AfterUpdate = users.where('age', '=', 25).find();
    console.log(`  Results: ${age25AfterUpdate.length} users (should be 1)`);
    console.log(`  Users: ${age25AfterUpdate.map(u => u.name).join(', ')}`);
    
    console.log('Verifying age = 35 query after update:');
    const age35AfterUpdate = users.where('age', '=', 35).find();
    console.log(`  Results: ${age35AfterUpdate.length} users (should be 1)`);
    console.log(`  Users: ${age35AfterUpdate.map(u => u.name).join(', ')}`);
    console.log();

    // Debug: Test delete behavior
    console.log('Step 6: Testing delete behavior...');
    console.log('Deleting Bob (id: 2)');
    users.remove({ id: 2 });
    
    const statsAfterDelete = users.getIndexStats();
    console.log('Index Statistics after delete:');
    for (const [field, stat] of Object.entries(statsAfterDelete)) {
      console.log(`  ${field}: ${stat.totalEntries} entries, ${stat.totalDocIds} document IDs`);
    }
    
    console.log('Verifying status = active query after delete:');
    const activeAfterDelete = users.where('status', '=', 'active').find();
    console.log(`  Results: ${activeAfterDelete.length} users (should be 1)`);
    console.log(`  Users: ${activeAfterDelete.map(u => u.name).join(', ')}`);
    console.log();

    // Debug: Test range queries
    console.log('Step 7: Testing range queries...');
    console.log('Range query: age >= 25 AND age <= 30');
    const rangeStart = performance.now();
    const rangeResults = users.where('age', '>=', 25).where('age', '<=', 30).find();
    const rangeTime = performance.now() - rangeStart;
    console.log(`  Results: ${rangeResults.length} users found in ${rangeTime.toFixed(2)}ms`);
    console.log(`  Users: ${rangeResults.map(u => `${u.name} (${u.age})`).join(', ')}`);
    console.log();

    console.log('🎉 Debug test completed successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ Debug test failed:', error);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Helper function to log query execution details
function logQueryExecution(queryName: string, callback: () => any) {
  console.log(`Executing: ${queryName}`);
  const start = performance.now();
  try {
    const result = callback();
    const time = performance.now() - start;
    console.log(`  ✅ Success in ${time.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const time = performance.now() - start;
    console.log(`  ❌ Failed in ${time.toFixed(2)}ms:`, error.message);
    throw error;
  }
}

// Run the test
if (import.meta.main) {
  runDebugTest().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { runDebugTest, logQueryExecution };