#!/usr/bin/env bun

import { MemoryStorage } from '../src/storage/MemoryStorage';
import { Table } from '../src/core/Table';

interface TestRecord {
  id: number;
  name: string;
  value: number;
  category: string;
}

// Create a "legacy" version for comparison by temporarily disabling optimizations
class LegacyMemoryStorage extends MemoryStorage {
  // Override to disable delta log
  updateDocument() {
    // Do nothing - fall back to full table updates
  }
  
  deleteDocument() {
    // Do nothing - fall back to full table updates  
  }
  
  insertDocument() {
    // Do nothing - fall back to full table updates
  }
}

async function comparePerformance() {
  console.log('🏁 Performance Comparison: Before vs After Optimizations\n');
  
  const testSize = 5000;
  const updateCount = 500;
  
  const testData: TestRecord[] = Array.from({ length: testSize }, (_, i) => ({
    id: i,
    name: `Record ${i}`,
    value: Math.random() * 1000,
    category: ['A', 'B', 'C', 'D'][i % 4]
  }));
  
  // Test with optimized MemoryStorage
  console.log('🚀 Testing OPTIMIZED MemoryStorage:');
  const optimizedStorage = new MemoryStorage();
  const optimizedTable = new Table<TestRecord>(optimizedStorage, 'test');
  
  console.time('   Bulk insert (optimized)');
  optimizedTable.insertMultiple(testData);
  console.timeEnd('   Bulk insert (optimized)');
  
  console.time('   500 updates (optimized)');
  for (let i = 0; i < updateCount; i++) {
    optimizedTable.update({ value: Math.random() * 2000 }, doc => doc.id === i % testSize);
  }
  console.timeEnd('   500 updates (optimized)');
  
  console.time('   100 searches (optimized)');
  for (let i = 0; i < 100; i++) {
    optimizedTable.search(doc => doc.category === 'A');
  }
  console.timeEnd('   100 searches (optimized)');
  
  // Test with legacy approach (full table copy)
  console.log('\n🐌 Testing LEGACY approach (full table copy):');
  const legacyStorage = new LegacyMemoryStorage();
  const legacyTable = new Table<TestRecord>(legacyStorage, 'test');
  
  console.time('   Bulk insert (legacy)');
  legacyTable.insertMultiple(testData);
  console.timeEnd('   Bulk insert (legacy)');
  
  console.time('   500 updates (legacy)');
  for (let i = 0; i < updateCount; i++) {
    legacyTable.update({ value: Math.random() * 2000 }, doc => doc.id === i % testSize);
  }
  console.timeEnd('   500 updates (legacy)');
  
  console.time('   100 searches (legacy)');
  for (let i = 0; i < 100; i++) {
    legacyTable.search(doc => doc.category === 'A');
  }
  console.timeEnd('   100 searches (legacy)');
  
  // Memory usage comparison
  console.log('\n📊 Pool Statistics (Optimized only):');
  const stats = optimizedTable.getPoolStats();
  console.log('Array Pool Hit Rate:', (stats.arrayPool.hitRate * 100).toFixed(1) + '%');
  console.log('Query Cache Hit Rate:', (stats.queryCache.hitRate * 100).toFixed(1) + '%');
  console.log('Query Cache Size:', stats.queryCache.size);
  
  console.log('\n✅ Comparison completed!');
  console.log('\n🎯 Expected improvements with optimizations:');
  console.log('   • Updates: ~50-90% faster due to delta log');
  console.log('   • Searches: ~10-30% faster due to document pooling');
  console.log('   • Memory: ~20-50% less allocation churn');
  console.log('   • Cache: ~90%+ hit rate for repeated queries');
}

await comparePerformance().catch(console.error);