#!/usr/bin/env bun

import { TinyDB } from './src/core/TinyDB';
import { MemoryStorage } from './src/storage/MemoryStorage';
import { JSONStorage } from './src/storage/JSONStorage';
import { WALJSONStorage } from './src/storage/WALJSONStorage';

// Create a new MemoryStorage class with the old structuredClone behavior for comparison
class OldMemoryStorage {
  private data: any = {};
  
  constructor() {
    this.data = {};
  }

  read(): any | null {
    return this.data ? structuredClone(this.data) : null;
  }
  
  write(obj: any): void {
    this.data = structuredClone(obj);
  }
  
  close(): void {
    // Nothing to close
  }
}

async function comparePerformance() {
  console.log('# BMDB Performance Comparison: Before vs After Optimization\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);
  
  const testData = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    email: `user${i + 1}@test.com`,
    age: 20 + (i % 50),
    active: i % 3 !== 0,
    metadata: {
      created: new Date().toISOString(),
      tags: [`tag${i % 10}`, `category${i % 5}`]
    }
  }));
  
  console.log('## Memory Storage Comparison\n');
  
  // Test old implementation (with structuredClone)
  console.log('### OLD Implementation (with structuredClone)');
  const oldDb = new TinyDB('old', { storage: OldMemoryStorage as any });
  
  let start = performance.now();
  for (const doc of testData) {
    oldDb.insert(doc);
  }
  const oldIndividualTime = performance.now() - start;
  
  oldDb.truncate();
  
  start = performance.now();
  oldDb.insertMultiple(testData);
  const oldBatchTime = performance.now() - start;
  
  start = performance.now();
  for (let i = 1; i <= 100; i++) {
    oldDb.search({ id: i });
  }
  const oldReadTime = performance.now() - start;
  
  console.log(`- Individual inserts: ${oldIndividualTime.toFixed(1)}ms (${(1000/oldIndividualTime*1000).toFixed(0)} ops/sec)`);
  console.log(`- Batch insert: ${oldBatchTime.toFixed(1)}ms (${(1000/oldBatchTime*1000).toFixed(0)} ops/sec)`);
  console.log(`- 100 reads: ${oldReadTime.toFixed(1)}ms (${(100/oldReadTime*1000).toFixed(0)} ops/sec)\n`);
  
  oldDb.close();
  
  // Test new implementation (optimized)
  console.log('### NEW Implementation (optimized)');
  const newDb = new TinyDB('new', { storage: MemoryStorage });
  
  start = performance.now();
  for (const doc of testData) {
    newDb.insert(doc);
  }
  const newIndividualTime = performance.now() - start;
  
  newDb.truncate();
  
  start = performance.now();
  newDb.insertMultiple(testData);
  const newBatchTime = performance.now() - start;
  
  start = performance.now();
  for (let i = 1; i <= 100; i++) {
    newDb.search({ id: i });
  }
  const newReadTime = performance.now() - start;
  
  console.log(`- Individual inserts: ${newIndividualTime.toFixed(1)}ms (${(1000/newIndividualTime*1000).toFixed(0)} ops/sec)`);
  console.log(`- Batch insert: ${newBatchTime.toFixed(1)}ms (${(1000/newBatchTime*1000).toFixed(0)} ops/sec)`);
  console.log(`- 100 reads: ${newReadTime.toFixed(1)}ms (${(100/newReadTime*1000).toFixed(0)} ops/sec)\n`);
  
  newDb.close();
  
  // Calculate improvements
  console.log('## Performance Improvements\n');
  const individualImprovement = (newIndividualTime > 0) ? (oldIndividualTime / newIndividualTime) : 0;
  const batchImprovement = (newBatchTime > 0) ? (oldBatchTime / newBatchTime) : 0;
  const readImprovement = (newReadTime > 0) ? (oldReadTime / newReadTime) : 0;
  
  console.log(`**Individual Insert Performance:**`);
  console.log(`- Before: ${(1000/oldIndividualTime*1000).toFixed(0)} ops/sec`);
  console.log(`- After: ${(1000/newIndividualTime*1000).toFixed(0)} ops/sec`);
  console.log(`- **${individualImprovement.toFixed(1)}x faster**\n`);
  
  console.log(`**Batch Insert Performance:**`);
  console.log(`- Before: ${(1000/oldBatchTime*1000).toFixed(0)} ops/sec`);
  console.log(`- After: ${(1000/newBatchTime*1000).toFixed(0)} ops/sec`);
  console.log(`- **${batchImprovement.toFixed(1)}x faster**\n`);
  
  console.log(`**Read Performance:**`);
  console.log(`- Before: ${(100/oldReadTime*1000).toFixed(0)} ops/sec`);
  console.log(`- After: ${(100/newReadTime*1000).toFixed(0)} ops/sec`);
  console.log(`- **${readImprovement.toFixed(1)}x faster**\n`);
  
  console.log('## Key Optimizations Applied\n');
  console.log('1. **Removed structuredClone() in MemoryStorage**');
  console.log('   - Eliminated deep copying overhead on every read/write');
  console.log('   - Reduced memory allocation pressure');
  console.log('');
  console.log('2. **Batch Operations**');
  console.log('   - Single read-modify-write cycle for multiple documents');
  console.log('   - Amortized storage and cache overhead');
  console.log('');
  console.log('3. **Direct Object References**');
  console.log('   - Memory storage now uses direct references');
  console.log('   - Trade-off: Less isolation but much better performance');
  console.log('');
  console.log('## Recommendations\n');
  console.log('- **Use batch operations** (insertMultiple, updateMultiple) when possible');
  console.log('- **Memory storage** is now suitable for high-performance scenarios');
  console.log('- **Consider data isolation needs** when choosing storage type');
  console.log('- **WAL storage** still recommended for production systems requiring ACID guarantees');
}

comparePerformance().catch(console.error);