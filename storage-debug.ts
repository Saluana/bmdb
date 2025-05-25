/**
 * Simple Debug Script for Storage Comparison
 * Tests MemoryStorage vs BinaryStorage with bulk inserts
 */

import { Table, MemoryStorage, BinaryStorage } from './dist/index.js';

interface TestUser {
    id?: number;
    name: string;
    email: string;
    department: string;
    salary: number;
}

function generateUsers(count: number): TestUser[] {
    const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
    const users: TestUser[] = [];

    for (let i = 0; i < count; i++) {
        users.push({
            name: `User ${i}`,
            email: `user${i}@company.com`,
            department: departments[i % departments.length],
            salary: 50000 + (i % 100000),
        });
    }

    return users;
}

async function testMemoryStorage() {
    console.log('\n🧪 Testing MemoryStorage (Performance Optimized)');
    console.log('================================================');

    const storage = new MemoryStorage();
    const table = new Table<TestUser>(storage, 'test_table');

    try {
        // Test small dataset
        console.log('📊 Small dataset (1,000 users)...');
        const smallUsers = generateUsers(1000);

        let start = performance.now();
        const smallIds = table.insertMultiple(smallUsers);
        let duration = performance.now() - start;

        console.log(
            `✅ Inserted ${smallIds.length} users in ${duration.toFixed(2)}ms`
        );
        console.log(
            `📈 Rate: ${((smallIds.length / duration) * 1000).toFixed(
                0
            )} users/second`
        );

        // Test large dataset
        console.log('\n📊 Large dataset (25,000 users)...');
        table.truncate();
        const largeUsers = generateUsers(25000);

        start = performance.now();
        const largeIds = table.insertMultiple(largeUsers);
        duration = performance.now() - start;

        console.log(
            `✅ Inserted ${largeIds.length} users in ${duration.toFixed(2)}ms`
        );
        console.log(
            `📈 Rate: ${((largeIds.length / duration) * 1000).toFixed(
                0
            )} users/second`
        );

        return true;
    } catch (error) {
        console.error('❌ MemoryStorage test failed:', error);
        return false;
    }
}

async function testBinaryStorage() {
    console.log('\n🧪 Testing BinaryStorage (B-tree Implementation)');
    console.log('================================================');

    try {
        const storage = new BinaryStorage('debug-test.bmdb');
        const table = new Table<TestUser>(storage, 'test_table');

        // Test very small dataset first
        console.log('📊 Very small dataset (100 users)...');
        const verySmallUsers = generateUsers(100);

        let start = performance.now();
        const verySmallIds = table.insertMultiple(verySmallUsers);
        let duration = performance.now() - start;

        console.log(
            `✅ Inserted ${verySmallIds.length} users in ${duration.toFixed(
                2
            )}ms`
        );

        // Test small dataset
        console.log('\n📊 Small dataset (1,000 users)...');
        table.truncate();
        const smallUsers = generateUsers(1000);

        start = performance.now();
        const smallIds = table.insertMultiple(smallUsers);
        duration = performance.now() - start;

        console.log(
            `✅ Inserted ${smallIds.length} users in ${duration.toFixed(2)}ms`
        );
        console.log(
            `📈 Rate: ${((smallIds.length / duration) * 1000).toFixed(
                0
            )} users/second`
        );

        // Test progressively larger datasets to find breaking point
        const testSizes = [2000, 5000, 10000];

        for (const size of testSizes) {
            console.log(`\n📊 Testing ${size.toLocaleString()} users...`);
            table.truncate();
            const users = generateUsers(size);

            try {
                start = performance.now();
                const ids = table.insertMultiple(users);
                duration = performance.now() - start;

                console.log(
                    `✅ Inserted ${ids.length} users in ${duration.toFixed(
                        2
                    )}ms`
                );
                console.log(
                    `📈 Rate: ${((ids.length / duration) * 1000).toFixed(
                        0
                    )} users/second`
                );
            } catch (error) {
                console.error(
                    `❌ BinaryStorage failed at ${size} users:`,
                    error
                );
                if (
                    error.message &&
                    error.message.includes('Failed to find leaf node')
                ) {
                    console.log('🔍 This is the B-tree corruption issue!');
                }
                break;
            }
        }

        storage.close();
        return true;
    } catch (error) {
        console.error('❌ BinaryStorage test failed:', error);
        return false;
    }
}

async function main() {
    console.log('🚀 Storage Performance & Stability Test');
    console.log('=======================================');

    const memorySuccess = await testMemoryStorage();
    const binarySuccess = await testBinaryStorage();

    console.log('\n📊 Test Summary:');
    console.log('================');
    console.log(`MemoryStorage: ${memorySuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`BinaryStorage: ${binarySuccess ? '✅ PASS' : '❌ FAIL'}`);

    if (memorySuccess && !binarySuccess) {
        console.log(
            '\n🔍 Analysis: MemoryStorage works fine with performance optimizations.'
        );
        console.log(
            '    BinaryStorage has a B-tree corruption issue at scale.'
        );
        console.log(
            '    The hanging issue in tests was likely related to BinaryStorage, not MemoryStorage.'
        );
    }
}

if (import.meta.main) {
    main().catch(console.error);
}
