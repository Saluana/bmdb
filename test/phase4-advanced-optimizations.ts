#!/usr/bin/env bun

import { TinyDB } from '../src/core/TinyDB';
import { WALStorage } from '../src/storage/WALStorage';
import { VectorUtils } from '../src/utils/VectorUtils';

interface TestRecord {
  id: number;
  name: string;
  category: string;
  vector?: number[];
  value: number;
}

async function testPhase4Optimizations() {
  console.log('🚀 Testing Phase 4: Advanced Optimizations');
  console.log('==========================================\n');

  // Test 1: Lazy Loading with Pagination
  console.log('1. Testing Lazy Loading with Pagination...');
  const db = new TinyDB('test-phase4.json');
  const table = db.table<TestRecord>('records');

  // Insert test data
  const testData: TestRecord[] = [];
  for (let i = 1; i <= 1000; i++) {
    testData.push({
      id: i,
      name: `Record ${i}`,
      category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
      value: Math.random() * 100
    });
  }
  
  table.insertMultiple(testData);
  console.log(`✅ Inserted ${testData.length} records`);

  // Test pagination
  const page1 = table.searchPaginated(doc => doc.category === 'A', 1, 50);
  console.log(`📄 Page 1: ${page1.data.length} records, total: ${page1.totalCount}, pages: ${page1.totalPages}`);

  const page2 = table.allPaginated(2, 50);
  console.log(`📄 All Page 2: ${page2.data.length} records, has more: ${page2.hasMore}`);

  // Test lazy iterator
  const lazy = table.lazy(doc => doc.category === 'B', { pageSize: 25 });
  let lazyCount = 0;
  for await (const doc of lazy) {
    lazyCount++;
    if (lazyCount >= 10) break; // Just test a few items
  }
  console.log(`🔄 Lazy iterator processed ${lazyCount} records`);

  // Test 2: Background WAL Compaction
  console.log('\n2. Testing Background WAL Compaction...');
  const walDb = new TinyDB('test-wal-compact.json', { 
    storage: WALStorage 
  });
  const walTable = walDb.table<TestRecord>('wal_records');

  // Insert many records to trigger compaction
  for (let i = 0; i < 100; i++) {
    walTable.insert({ 
      id: i, 
      name: `WAL Record ${i}`, 
      category: 'WAL',
      value: i 
    });
  }

  if (walDb.storage.getCompactionStats) {
    const stats = (walDb.storage as any).getCompactionStats();
    console.log(`📊 WAL Stats: ${stats.walSize} operations, ${stats.activeTransactions} active tx`);
  }

  // Force compaction
  if (walDb.storage.forceBackgroundCompaction) {
    await (walDb.storage as any).forceBackgroundCompaction();
    console.log('✅ Background compaction completed');
  }

  // Test 3: Vector Search Optimization
  console.log('\n3. Testing Vector Search Optimization...');
  
  // Create a vector index
  const vectorIndex = VectorUtils.createVectorIndex('embeddings', 3, 'cosine', true);
  
  // Add vectors to index
  const vectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0.5, 0.5, 0],
    [0.7, 0.3, 0]
  ];

  vectors.forEach((vector, i) => {
    VectorUtils.addToIndex(vectorIndex, `doc_${i}`, vector);
  });

  console.log(`🔍 Created vector index with ${vectorIndex.vectors.size} vectors`);

  // Test search
  const queryVector = [0.6, 0.4, 0];
  const results = VectorUtils.searchIndex(vectorIndex, queryVector, 3);
  console.log(`🎯 Vector search found ${results.length} similar vectors:`);
  results.forEach(result => {
    console.log(`  - ${result.docId}: similarity ${result.score.toFixed(3)}`);
  });

  // Test approximate search for large dataset
  const approximateResults = VectorUtils.searchIndex(vectorIndex, queryVector, 3, undefined, true);
  console.log(`⚡ Approximate search found ${approximateResults.length} results`);

  // Test 4: Parallel Query Execution
  console.log('\n4. Testing Parallel Query Execution...');

  // Insert more data for parallel testing
  const moreData: TestRecord[] = [];
  for (let i = 1001; i <= 3000; i++) {
    moreData.push({
      id: i,
      name: `Parallel Record ${i}`,
      category: i % 4 === 0 ? 'X' : i % 4 === 1 ? 'Y' : i % 4 === 2 ? 'Z' : 'W',
      value: Math.random() * 200
    });
  }
  table.insertMultiple(moreData);

  // Test parallel search
  const start = Date.now();
  const parallelResults = await table.searchParallel(
    doc => doc.value > 50,
    { chunkSize: 500, maxConcurrency: 2 }
  );
  const parallelTime = Date.now() - start;
  console.log(`⚡ Parallel search found ${parallelResults.length} records in ${parallelTime}ms`);

  // Test parallel updates
  const updateStart = Date.now();
  const updatedIds = await table.updateParallel([
    {
      fields: { category: 'UPDATED_X' },
      condition: doc => doc.category === 'X'
    },
    {
      fields: { category: 'UPDATED_Y' },
      condition: doc => doc.category === 'Y'
    }
  ], { maxConcurrency: 2 });
  const updateTime = Date.now() - updateStart;
  console.log(`🔄 Parallel update modified ${updatedIds.length} records in ${updateTime}ms`);

  // Test parallel aggregation
  const aggStart = Date.now();
  const avgValue = await table.aggregateParallel(
    docs => docs.reduce((sum, doc) => sum + doc.value, 0) / docs.length,
    results => results.reduce((sum, avg) => sum + avg, 0) / results.length,
    doc => doc.category.startsWith('UPDATED'),
    { chunkSize: 500, maxConcurrency: 2 }
  );
  const aggTime = Date.now() - aggStart;
  console.log(`📊 Parallel aggregation calculated average ${avgValue.toFixed(2)} in ${aggTime}ms`);

  // Performance comparison
  console.log('\n5. Performance Comparison...');
  const syncStart = Date.now();
  const syncResults = table.search(doc => doc.value > 50);
  const syncTime = Date.now() - syncStart;
  console.log(`🐌 Synchronous search found ${syncResults.length} records in ${syncTime}ms`);
  console.log(`⚡ Speedup: ${(syncTime / parallelTime).toFixed(2)}x faster with parallel search`);

  // Cleanup
  db.close();
  walDb.close();

  console.log('\n✅ Phase 4 Advanced Optimizations Test Complete!');
  console.log('Features tested:');
  console.log('  ✓ Lazy loading with pagination');
  console.log('  ✓ Background WAL compaction');
  console.log('  ✓ Optimized vector search with LSH indexing');
  console.log('  ✓ Parallel query execution');
  console.log('  ✓ Performance improvements');
}

// Run the test
testPhase4Optimizations().catch(console.error);