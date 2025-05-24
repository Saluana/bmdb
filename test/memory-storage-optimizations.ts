#!/usr/bin/env bun

import { MemoryStorage } from '../src/storage/MemoryStorage';
import { Table } from '../src/core/Table';

interface TestRecord {
  id: number;
  name: string;
  value: number;
  category: string;
}

async function testMemoryStorageOptimizations() {
  console.log('🧪 Testing MemoryStorage Optimizations\n');
  
  const storage = new MemoryStorage();
  const table = new Table<TestRecord>(storage, 'test_records');
  
  // Test 1: Delta Log Performance
  console.log('📊 Test 1: Delta Log vs Full Copy Performance');
  
  const recordCount = 10000;
  const testData: TestRecord[] = Array.from({ length: recordCount }, (_, i) => ({
    id: i,
    name: `Record ${i}`,
    value: Math.random() * 1000,
    category: ['A', 'B', 'C', 'D'][i % 4]
  }));
  
  // Bulk insert test data
  console.time('⏱️  Bulk insert 10k records');
  const insertedIds = table.insertMultiple(testData);
  console.timeEnd('⏱️  Bulk insert 10k records');
  
  // Test rapid updates (should use delta log)
  console.time('⏱️  1000 rapid updates (delta log)');
  for (let i = 0; i < 1000; i++) {
    table.update({ value: Math.random() * 2000 }, doc => doc.id === i % recordCount);
  }
  console.timeEnd('⏱️  1000 rapid updates (delta log)');
  
  // Test 2: Document Pool Performance
  console.log('\n📊 Test 2: Document Pool Performance');
  
  const searchIterations = 1000;
  console.time('⏱️  1000 searches (with document pooling)');
  for (let i = 0; i < searchIterations; i++) {
    const results = table.search(doc => doc.category === 'A');
    // Force iteration to ensure documents are created
    results.forEach(doc => doc.name);
  }
  console.timeEnd('⏱️  1000 searches (with document pooling)');
  
  // Test 3: Cache Invalidation Gating
  console.log('\n📊 Test 3: Cache Invalidation Gating');
  
  // Create a cacheable condition
  const categoryACondition = {
    test: (doc: any) => doc.category === 'A',
    __hash: () => 'category_A_search',
    isCacheable: () => true
  };
  
  console.time('⏱️  100 identical cached searches');
  for (let i = 0; i < 100; i++) {
    table.search(categoryACondition);
  }
  console.timeEnd('⏱️  100 identical cached searches');
  
  // Test 4: Memory Usage and Pool Stats
  console.log('\n📊 Test 4: Memory and Pool Statistics');
  
  const poolStats = table.getPoolStats();
  console.log('📈 Pool Statistics:');
  console.log('   Array Pool:', {
    available: poolStats.arrayPool.available,
    inUse: poolStats.arrayPool.inUse,
    hitRate: (poolStats.arrayPool.hitRate * 100).toFixed(1) + '%'
  });
  
  console.log('   Query Cache:', {
    size: poolStats.queryCache.size,
    hits: poolStats.queryCache.hits,
    misses: poolStats.queryCache.misses,
    hitRate: (poolStats.queryCache.hitRate * 100).toFixed(1) + '%'
  });
  
  // Test 5: Delta Flush Behavior
  console.log('\n📊 Test 5: Delta Flush Behavior');
  
  console.time('⏱️  Batch updates with delta accumulation');
  for (let i = 0; i < 100; i++) {
    // These should accumulate in delta log
    (storage as any).updateDocument('test_records', String(i), { lastModified: Date.now() });
  }
  
  // Force flush and measure
  const beforeFlush = Date.now();
  storage.read(); // This should trigger flush
  const afterFlush = Date.now();
  console.timeEnd('⏱️  Batch updates with delta accumulation');
  console.log(`   Delta flush took: ${afterFlush - beforeFlush}ms`);
  
  // Test 6: Large Dataset Performance
  console.log('\n📊 Test 6: Large Dataset Performance');
  
  const largeStorage = new MemoryStorage();
  const largeTable = new Table<TestRecord>(largeStorage, 'large_test');
  
  const largeDataset = Array.from({ length: 50000 }, (_, i) => ({
    id: i,
    name: `Large Record ${i}`,
    value: Math.random() * 10000,
    category: ['X', 'Y', 'Z'][i % 3]
  }));
  
  console.time('⏱️  Insert 50k records');
  largeTable.insertMultiple(largeDataset);
  console.timeEnd('⏱️  Insert 50k records');
  
  console.time('⏱️  Search in 50k records');
  const results = largeTable.search(doc => doc.value > 9000);
  console.timeEnd('⏱️  Search in 50k records');
  console.log(`   Found ${results.length} high-value records`);
  
  console.time('⏱️  Update 1000 records in 50k dataset');
  largeTable.update({ updated: true }, doc => doc.id % 50 === 0);
  console.timeEnd('⏱️  Update 1000 records in 50k dataset');
  
  // Test 7: Verify Delta Log Functionality
  console.log('\n📊 Test 7: Delta Log Functionality Verification');
  
  const deltaStorage = new MemoryStorage();
  const deltaTable = new Table<TestRecord>(deltaStorage, 'delta_test');
  
  // Insert initial data
  deltaTable.insert({ id: 1, name: 'Original', value: 100, category: 'Test' });
  
  // Use delta operations directly
  (deltaStorage as any).updateDocument('delta_test', '1', { name: 'Updated via Delta' });
  (deltaStorage as any).insertDocument('delta_test', '2', { id: 2, name: 'Delta Insert', value: 200, category: 'Test' });
  
  // Read should trigger flush
  const data = deltaStorage.read();
  console.log('✅ Delta operations verified:', {
    record1: data?.delta_test?.['1']?.name,
    record2: data?.delta_test?.['2']?.name
  });
  
  console.log('\n✅ MemoryStorage optimization tests completed!');
  console.log('\n📋 Summary of Optimizations Tested:');
  console.log('   ✓ Delta log for in-place updates');
  console.log('   ✓ Document pooling for reduced allocation');
  console.log('   ✓ Cache invalidation gating');
  console.log('   ✓ Batch flush mechanism');
  console.log('   ✓ Large dataset performance');
}

// Run the tests
await testMemoryStorageOptimizations().catch(console.error);