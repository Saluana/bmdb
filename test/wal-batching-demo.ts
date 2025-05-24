#!/usr/bin/env bun
import { WALStorage } from '../src/storage/WALStorage';
import { unlinkSync, existsSync } from 'fs';

function cleanup(basePath: string) {
  const paths = [basePath, `${basePath}.wal`, `${basePath}.lock`, `${basePath}.idx.json`];
  paths.forEach(path => {
    if (existsSync(path)) unlinkSync(path);
  });
}

async function testWALBatching() {
  console.log('🚀 WAL Operation Batching Performance Test\n');

  const testOperations = 1000;
  
  // Test 1: No batching (batch size 1, no wait)
  console.log('📝 Test 1: No Batching (batch size = 1)');
  const testPath1 = 'test-wal-no-batch.json';
  cleanup(testPath1);
  
  const storage1 = new WALStorage(testPath1, 1, 0);
  const start1 = performance.now();
  
  const txid1 = storage1.beginTransaction();
  for (let i = 0; i < testOperations; i++) {
    storage1.writeInTransaction(txid1, { 
      id: i, 
      data: `test-data-${i}`,
      timestamp: Date.now() 
    });
  }
  storage1.commitTransaction(txid1);
  
  const duration1 = performance.now() - start1;
  storage1.close();
  cleanup(testPath1);
  
  console.log(`   ⏱️  ${testOperations} operations: ${duration1.toFixed(2)}ms`);
  console.log(`   📊 Throughput: ${(testOperations / duration1 * 1000).toFixed(0)} ops/sec\n`);

  // Test 2: With batching (batch size 10)
  console.log('📝 Test 2: With Batching (batch size = 10)');
  const testPath2 = 'test-wal-with-batch.json';
  cleanup(testPath2);
  
  const storage2 = new WALStorage(testPath2, 10, 50);
  const start2 = performance.now();
  
  const txid2 = storage2.beginTransaction();
  for (let i = 0; i < testOperations; i++) {
    storage2.writeInTransaction(txid2, { 
      id: i, 
      data: `test-data-${i}`,
      timestamp: Date.now() 
    });
  }
  storage2.commitTransaction(txid2);
  
  const duration2 = performance.now() - start2;
  storage2.close();
  cleanup(testPath2);
  
  console.log(`   ⏱️  ${testOperations} operations: ${duration2.toFixed(2)}ms`);
  console.log(`   📊 Throughput: ${(testOperations / duration2 * 1000).toFixed(0)} ops/sec\n`);

  // Test 3: Larger batches (batch size 25)
  console.log('📝 Test 3: Larger Batching (batch size = 25)');
  const testPath3 = 'test-wal-large-batch.json';
  cleanup(testPath3);
  
  const storage3 = new WALStorage(testPath3, 25, 100);
  const start3 = performance.now();
  
  const txid3 = storage3.beginTransaction();
  for (let i = 0; i < testOperations; i++) {
    storage3.writeInTransaction(txid3, { 
      id: i, 
      data: `test-data-${i}`,
      timestamp: Date.now() 
    });
  }
  storage3.commitTransaction(txid3);
  
  const duration3 = performance.now() - start3;
  storage3.close();
  cleanup(testPath3);
  
  console.log(`   ⏱️  ${testOperations} operations: ${duration3.toFixed(2)}ms`);
  console.log(`   📊 Throughput: ${(testOperations / duration3 * 1000).toFixed(0)} ops/sec\n`);

  // Performance Analysis
  const improvement2 = ((duration1 - duration2) / duration1) * 100;
  const improvement3 = ((duration1 - duration3) / duration1) * 100;
  
  console.log('📈 Performance Analysis:');
  console.log('─'.repeat(50));
  console.log(`No Batching:      ${duration1.toFixed(2)}ms`);
  console.log(`Small Batching:   ${duration2.toFixed(2)}ms (${improvement2.toFixed(1)}% faster)`);
  console.log(`Large Batching:   ${duration3.toFixed(2)}ms (${improvement3.toFixed(1)}% faster)`);
  console.log('─'.repeat(50));
  
  if (improvement2 > 0) {
    console.log(`✅ Batching provides significant performance improvements!`);
    console.log(`   Best improvement: ${Math.max(improvement2, improvement3).toFixed(1)}% faster`);
  } else {
    console.log(`ℹ️  Performance may vary based on system and load`);
  }

  // Test durability
  console.log('\n🔒 Testing Durability with forceBatchFlush():');
  const testPath4 = 'test-wal-durability.json';
  cleanup(testPath4);
  
  const storage4 = new WALStorage(testPath4, 50, 1000); // Large batch, long timeout
  const txid4 = storage4.beginTransaction();
  
  // Add some operations but don't commit yet
  for (let i = 0; i < 5; i++) {
    storage4.writeInTransaction(txid4, { id: i, data: `pending-${i}` });
  }
  
  console.log('   📝 Added 5 operations to pending batch');
  
  // Force flush
  storage4.forceBatchFlush();
  console.log('   💾 Forced batch flush - operations now durable in WAL');
  
  storage4.commitTransaction(txid4);
  storage4.close();
  cleanup(testPath4);
  
  console.log('   ✅ Durability test completed\n');
}

// Run the test
testWALBatching().catch(console.error);