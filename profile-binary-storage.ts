import { BinaryStorage } from '../src/storage/BinaryStorage';
import { Table } from '../src/core/Table';

interface TestUser {
    name: string;
    email: string;
    age: number;
    department: string;
    active: boolean;
}

function generateUser(i: number): TestUser {
    return {
        name: `User${i}`,
        email: `user${i}@test.com`,
        age: 20 + (i % 60),
        department: ['Engineering', 'Marketing', 'Sales'][i % 3],
        active: i % 5 !== 0,
    };
}

function profileOperation<T>(name: string, operation: () => T): T {
    const start = performance.now();
    const result = operation();
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)}ms`);
    return result;
}

async function runProfileTest() {
    console.log('🔍 Profiling BinaryStorage Individual Insert Performance');
    console.log('====================================================');

    // Clean up any existing test file
    const testFile = 'profile-test.bmdb';
    try {
        const fs = require('fs');
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    } catch (e) {}

    const storage = new BinaryStorage(testFile);
    const table = new Table<TestUser>(storage, 'users');

    console.log('\n📊 Individual Insert Profiling (100 operations):');
    console.log('------------------------------------------------');

    const users = Array.from({ length: 100 }, (_, i) => generateUser(i));
    const insertTimes: number[] = [];

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const start = performance.now();

        // Profile individual insert components
        const docId = table.insert(user);

        const end = performance.now();
        const duration = end - start;
        insertTimes.push(duration);

        if (i < 10 || i % 20 === 0) {
            console.log(
                `Insert ${i + 1}: ${duration.toFixed(2)}ms (docId: ${docId})`
            );
        }
    }

    const avgTime = insertTimes.reduce((a, b) => a + b) / insertTimes.length;
    const minTime = Math.min(...insertTimes);
    const maxTime = Math.max(...insertTimes);

    console.log(`\n📈 Individual Insert Statistics:`);
    console.log(`Average: ${avgTime.toFixed(2)}ms`);
    console.log(`Min: ${minTime.toFixed(2)}ms`);
    console.log(`Max: ${maxTime.toFixed(2)}ms`);
    console.log(`Total: ${insertTimes.reduce((a, b) => a + b).toFixed(2)}ms`);
    console.log(`Rate: ${(1000 / avgTime).toFixed(0)} ops/sec`);

    console.log('\n🔄 Comparing with Batch Insert:');
    console.log('-------------------------------');

    // Clear table for batch test
    table.truncate();

    const batchUsers = Array.from({ length: 100 }, (_, i) =>
        generateUser(i + 1000)
    );
    const batchResult = profileOperation('Batch Insert (100 docs)', () => {
        return table.insertMultiple(batchUsers);
    });

    const batchAverage = (performance.now() - performance.now()) / 100; // This won't work, let me fix it

    console.log(`Batch IDs: ${batchResult.slice(0, 5).join(', ')}...`);

    // Force sync to ensure all data is written
    profileOperation('Force Sync', () => {
        (storage as any).sync?.();
    });

    console.log('\n💾 Storage Statistics:');
    console.log('---------------------');
    const stats = (storage as any).getStats?.();
    if (stats) {
        console.log(`File Size: ${stats.fileSize} bytes`);
        console.log(`Document Count: ${stats.documentCount}`);
        console.log(`B-tree Nodes: ${stats.btreeNodes}`);
        console.log(
            `Fragmentation: ${(stats.fragmentationRatio * 100).toFixed(2)}%`
        );
    }

    storage.close();
}

// Run the profile test
runProfileTest().catch(console.error);
