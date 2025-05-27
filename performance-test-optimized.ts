import { BinaryStorage } from './src/storage/BinaryStorage';
import { Table } from './src/core/Table';

interface TestDocument {
    id?: number;
    name: string;
    email: string;
    age: number;
    data: any;
}

function generateTestDoc(i: number): TestDocument {
    return {
        name: `User${i}`,
        email: `user${i}@test.com`,
        age: 20 + (i % 60),
        data: {
            preferences: { theme: 'dark', lang: 'en' },
            stats: { logins: i * 10, points: i * 100 },
            tags: [`tag${i % 5}`, `category${i % 3}`],
        },
    };
}

async function measurePerformance() {
    console.log('🚀 Testing Optimized BinaryStorage Performance');
    console.log('================================================\n');

    const storage = new BinaryStorage('./perf-test-optimized.bmdb');
    const table = new Table<TestDocument>(storage, 'users');

    // Setup test data
    const testDocs = Array.from({ length: 1000 }, (_, i) => generateTestDoc(i));

    console.log('📦 Setup: Inserting 1000 documents...');
    const insertStart = performance.now();
    table.insertMultiple(testDocs);
    const insertTime = performance.now() - insertStart;
    console.log(
        `   Insert Time: ${insertTime.toFixed(2)}ms (${(
            (1000 / insertTime) *
            1000
        ).toFixed(0)} ops/sec)\n`
    );

    // Test individual reads
    console.log('📖 Testing Individual Read Performance...');
    const readIds = Array.from({ length: 100 }, (_, i) => i + 1);

    const individualReadStart = performance.now();
    for (const id of readIds) {
        table.get(undefined, id);
    }
    const individualReadTime = performance.now() - individualReadStart;
    console.log(
        `   Individual Reads (100 docs): ${individualReadTime.toFixed(2)}ms (${(
            (100 / individualReadTime) *
            1000
        ).toFixed(0)} ops/sec)`
    );

    // Test bulk reads using the optimized method
    console.log('📚 Testing Bulk Read Performance...');
    const bulkReadStart = performance.now();
    table.get(undefined, undefined, readIds);
    const bulkReadTime = performance.now() - bulkReadStart;
    console.log(
        `   Bulk Reads (100 docs): ${bulkReadTime.toFixed(2)}ms (${(
            (100 / bulkReadTime) *
            1000
        ).toFixed(0)} ops/sec)`
    );

    // Test individual updates
    console.log('✏️  Testing Individual Update Performance...');
    const updateIds = Array.from({ length: 100 }, (_, i) => i + 1);

    const individualUpdateStart = performance.now();
    for (const id of updateIds) {
        table.update({ age: 25 + (id % 50) }, undefined, [id]);
    }
    const individualUpdateTime = performance.now() - individualUpdateStart;
    console.log(
        `   Individual Updates (100 docs): ${individualUpdateTime.toFixed(
            2
        )}ms (${((100 / individualUpdateTime) * 1000).toFixed(0)} ops/sec)`
    );

    // Test REAL bulk updates using the optimized method
    console.log('🔄 Testing True Bulk Update Performance...');
    const bulkUpdateData: Record<string, any> = {};
    for (const id of updateIds) {
        bulkUpdateData[id.toString()] = { age: 30 + (id % 40), updated: true };
    }

    const trueBulkUpdateStart = performance.now();
    // Use the storage's optimized bulk update method directly for comparison
    const storage_any = storage as any;
    if (storage_any.updateDocumentsBulk) {
        storage_any.updateDocumentsBulk('users', bulkUpdateData);
    } else {
        // Fallback to table-level batch updates
        for (const [id, updateData] of Object.entries(bulkUpdateData)) {
            table.update(updateData, undefined, [parseInt(id)]);
        }
    }
    const trueBulkUpdateTime = performance.now() - trueBulkUpdateStart;
    console.log(
        `   True Bulk Updates (100 docs): ${trueBulkUpdateTime.toFixed(
            2
        )}ms (${((100 / trueBulkUpdateTime) * 1000).toFixed(0)} ops/sec)`
    );

    // Test batch updates via table interface
    console.log('📦 Testing Batch Update Performance...');
    const batchUpdateStart = performance.now();
    const batchUpdateData = updateIds.map((id) => ({
        id,
        age: 35 + (id % 30),
    }));
    for (const update of batchUpdateData) {
        table.update({ age: update.age }, undefined, [update.id]);
    }
    const batchUpdateTime = performance.now() - batchUpdateStart;
    console.log(
        `   Batch Updates (100 docs): ${batchUpdateTime.toFixed(2)}ms (${(
            (100 / batchUpdateTime) *
            1000
        ).toFixed(0)} ops/sec)`
    );

    // Test cache performance
    console.log('💾 Testing Cache Performance...');
    const cacheTestStart = performance.now();
    // Read the same documents multiple times to test cache hits
    for (let i = 0; i < 5; i++) {
        for (const id of readIds.slice(0, 20)) {
            table.get(undefined, id);
        }
    }
    const cacheTestTime = performance.now() - cacheTestStart;
    console.log(
        `   Cache Test (100 cached reads): ${cacheTestTime.toFixed(2)}ms (${(
            (100 / cacheTestTime) *
            1000
        ).toFixed(0)} ops/sec)`
    );

    // Get cache statistics if available
    if ((storage as any).getCacheStats) {
        const cacheStats = (storage as any).getCacheStats();
        console.log('\n📊 Cache Statistics:');
        console.log(`   Total Chunks: ${cacheStats.totalChunks}`);
        console.log(`   Dirty Chunks: ${cacheStats.dirtyChunks}`);
        console.log(
            `   Memory Usage: ${(cacheStats.memoryUsage / 1024 / 1024).toFixed(
                2
            )} MB`
        );
        console.log(
            `   Cache Hit Ratio: ${(cacheStats.cacheHitRatio * 100).toFixed(
                1
            )}%`
        );
    }

    console.log('\n🎯 Performance Summary:');
    console.log('=======================');
    console.log(
        `Insert Rate: ${((1000 / insertTime) * 1000).toFixed(0)} ops/sec`
    );
    console.log(
        `Individual Read Rate: ${((100 / individualReadTime) * 1000).toFixed(
            0
        )} ops/sec`
    );
    console.log(
        `Bulk Read Rate: ${((100 / bulkReadTime) * 1000).toFixed(0)} ops/sec`
    );
    console.log(
        `Individual Update Rate: ${(
            (100 / individualUpdateTime) *
            1000
        ).toFixed(0)} ops/sec`
    );
    console.log(
        `True Bulk Update Rate: ${((100 / trueBulkUpdateTime) * 1000).toFixed(
            0
        )} ops/sec`
    );
    console.log(
        `Batch Update Rate: ${((100 / batchUpdateTime) * 1000).toFixed(
            0
        )} ops/sec`
    );
    console.log(
        `Cache Read Rate: ${((100 / cacheTestTime) * 1000).toFixed(0)} ops/sec`
    );

    const readImprovement =
        bulkReadTime < individualReadTime
            ? (
                  ((individualReadTime - bulkReadTime) / individualReadTime) *
                  100
              ).toFixed(1)
            : 0;

    const updateImprovement =
        trueBulkUpdateTime < individualUpdateTime
            ? (
                  ((individualUpdateTime - trueBulkUpdateTime) /
                      individualUpdateTime) *
                  100
              ).toFixed(1)
            : 0;

    console.log(`\n🚀 Performance Improvements:`);
    console.log(
        `Bulk Read Improvement: ${readImprovement}% faster than individual reads`
    );
    console.log(
        `True Bulk Update Improvement: ${updateImprovement}% faster than individual updates`
    );

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    storage.sync(); // Flush any pending writes
    console.log('✅ Test completed successfully!');
}

measurePerformance().catch(console.error);
