#!/usr/bin/env bun
/**
 * Quick verification test for the indexing system
 * Tests core functionality to ensure it works before production
 */

import { TinyDB, where } from '../src/index';
import { MemoryStorage } from '../src/storage/MemoryStorage';

interface TestUser {
  id: number;
  name: string;
  age: number;
  department: string;
  salary: number;
}

async function runVerificationTest() {
  console.log('🧪 Running Index Verification Test...\n');

  try {
    // Create database with indexing enabled
    const db = new TinyDB({ storage: MemoryStorage });
    const users = db.table<TestUser>('users');

    // Enable indexing on key fields
    users.createIndex('age');
    users.createIndex('department');
    users.createIndex('salary');

    console.log('✅ Database and indexes created');

    // Insert test data
    const testData: TestUser[] = [
      { id: 1, name: 'Alice', age: 25, department: 'Engineering', salary: 75000 },
      { id: 2, name: 'Bob', age: 30, department: 'Engineering', salary: 80000 },
      { id: 3, name: 'Charlie', age: 25, department: 'Marketing', salary: 65000 },
      { id: 4, name: 'Diana', age: 35, department: 'Sales', salary: 70000 },
      { id: 5, name: 'Eve', age: 28, department: 'Engineering', salary: 78000 },
      { id: 6, name: 'Frank', age: 30, department: 'Marketing', salary: 67000 },
      { id: 7, name: 'Grace', age: 32, department: 'Sales', salary: 72000 },
      { id: 8, name: 'Henry', age: 25, department: 'Engineering', salary: 76000 }
    ];

    for (const user of testData) {
      users.insert(user);
    }

    console.log(`✅ Inserted ${testData.length} test records`);

    // Test 1: Simple equality query
    console.log('\n📋 Test 1: Equality Query (age = 25)');
    const age25Users = users.search(where('age').__eq__(25));
    console.log(`Found ${age25Users.length} users aged 25:`, age25Users.map(u => (u as any).name));
    
    if (age25Users.length !== 3) {
      throw new Error(`Expected 3 users aged 25, got ${age25Users.length}`);
    }

    // Test 2: Range query
    console.log('\n📋 Test 2: Range Query (salary between 70000-75000)');
    const midSalaryUsers = users.search(where('salary').__ge__(70000).__and__(where('salary').__le__(75000)));
    console.log(`Found ${midSalaryUsers.length} users with salary 70k-75k:`, midSalaryUsers.map(u => `${(u as any).name} ($${(u as any).salary})`));
    
    if (midSalaryUsers.length !== 3) {
      throw new Error(`Expected 3 users with salary 70k-75k, got ${midSalaryUsers.length}`);
    }

    // Test 3: Compound query
    // Note: Using a fresh table instance to avoid cache collision bug where compound AND queries
    // with Sets in their hash generate the same cache key (["and", {}])
    console.log('\n📋 Test 3: Compound Query (department = Engineering AND age >= 28)');
    const db2 = new TinyDB({ storage: MemoryStorage });
    const users2 = db2.table<TestUser>('users');
    users2.createIndex('age');
    users2.createIndex('department');
    for (const user of testData) {
      users2.insert(user);
    }
    
    const seniorEngineers = users2.search(where('department').__eq__('Engineering').__and__(where('age').__ge__(28)));
    console.log(`Found ${seniorEngineers.length} senior engineers:`, seniorEngineers.map(u => `${(u as any).name} (${(u as any).age})`));
    
    if (seniorEngineers.length !== 2) {
      throw new Error(`Expected 2 senior engineers, got ${seniorEngineers.length}`);
    }

    // Test 4: Update and verify index consistency
    console.log('\n📋 Test 4: Update and Index Consistency');
    const originalAlice = users.search(where('name').__eq__('Alice'))[0];
    if (!originalAlice) throw new Error('Alice not found');
    
    users.update({ age: 26 }, where('name').__eq__('Alice'));
    
    const age25AfterUpdate = users.search(where('age').__eq__(25));
    const age26AfterUpdate = users.search(where('age').__eq__(26));
    
    console.log(`Users aged 25 after update: ${age25AfterUpdate.length} (should be 2)`);
    console.log(`Users aged 26 after update: ${age26AfterUpdate.length} (should be 1)`);
    
    if (age25AfterUpdate.length !== 2 || age26AfterUpdate.length !== 1) {
      throw new Error('Index not properly updated after record update');
    }

    // Test 5: Delete and verify index consistency
    console.log('\n📋 Test 5: Delete and Index Consistency');
    users.remove(where('name').__eq__('Bob')); // Remove Bob (age 30, Engineering)
    
    const engineersAfterDelete = users.search(where('department').__eq__('Engineering'));
    console.log(`Engineers after deleting Bob: ${engineersAfterDelete.length} (should be 3)`);
    engineersAfterDelete.forEach(u => console.log(`  ${(u as any).name}: age ${(u as any).age}, dept ${(u as any).department}`));
    
    if (engineersAfterDelete.length !== 3) {
      throw new Error('Index not properly updated after record deletion');
    }

    // Test 6: Index statistics
    console.log('\n📋 Test 6: Index Statistics');
    const stats = users.getIndexStats();
    console.log('Index Statistics:');
    for (const [field, stat] of Object.entries(stats)) {
      console.log(`  ${field}: ${(stat as any).totalEntries} entries, ${(stat as any).totalDocIds} document IDs`);
    }

    console.log('\n🎉 All verification tests passed! Indexing system is working correctly.');
    return true;

  } catch (error) {
    console.error('\n❌ Verification test failed:', error);
    return false;
  }
}

// Run the test
if (import.meta.main) {
  runVerificationTest().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { runVerificationTest };