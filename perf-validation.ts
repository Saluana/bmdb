#!/usr/bin/env bun

/**
 * Performance Validation Script
 * Tests the performance improvements for bulk insert operations
 */

import { Table } from './src/core/Table';
import { MemoryStorage } from './src/storage/MemoryStorage';

interface TestUser {
    id?: number;
    name: string;
    email: string;
    department: string;
    salary: number;
    joinDate: Date;
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
            joinDate: new Date(2020 + (i % 5), i % 12, (i % 28) + 1),
        });
    }

    return users;
}

async function measurePerformance(userCount: number): Promise<number> {
    const storage = new MemoryStorage();
    const table = new Table<TestUser>(storage, 'performance_test');

    const users = generateUsers(userCount);

    console.log(`\n🧪 Testing with ${userCount.toLocaleString()} users...`);

    const startTime = performance.now();
    const docIds = table.insertMultiple(users);
    const endTime = performance.now();

    const duration = endTime - startTime;
    console.log(
        `✅ Inserted ${docIds.length.toLocaleString()} users in ${duration.toFixed(
            2
        )}ms`
    );
    console.log(
        `📈 Rate: ${((userCount / duration) * 1000).toFixed(0)} users/second`
    );

    // Verify data integrity
    const retrievedCount = table.length;
    if (retrievedCount !== userCount) {
        throw new Error(
            `Data integrity check failed: expected ${userCount}, got ${retrievedCount}`
        );
    }

    return duration;
}

async function runPerformanceValidation() {
    console.log('🚀 BMDB Performance Validation');
    console.log('==============================');

    const testSizes = [5000, 15000, 25000, 35000, 50000];
    const results: Array<{ size: number; duration: number; rate: number }> = [];

    for (const size of testSizes) {
        try {
            const duration = await measurePerformance(size);
            const rate = (size / duration) * 1000;
            results.push({ size, duration, rate });

            // Check if we're maintaining reasonable performance (linear scaling)
            if (results.length > 1) {
                const prev = results[results.length - 2];
                const current = results[results.length - 1];
                const scaleFactor = current.size / prev.size;
                const timeScaleFactor = current.duration / prev.duration;

                console.log(
                    `📊 Scale factor: ${scaleFactor.toFixed(
                        1
                    )}x data → ${timeScaleFactor.toFixed(1)}x time`
                );

                if (timeScaleFactor > scaleFactor * 2) {
                    console.warn(
                        `⚠️  Performance degradation detected at ${size} users`
                    );
                } else {
                    console.log(`✅ Performance scaling looks good`);
                }
            }
        } catch (error) {
            console.error(`❌ Failed at ${size} users:`, error);
            break;
        }
    }

    console.log('\n📈 Performance Summary:');
    console.log('========================');
    results.forEach(({ size, duration, rate }) => {
        console.log(
            `${size.toLocaleString()} users: ${duration.toFixed(
                2
            )}ms (${rate.toFixed(0)} users/sec)`
        );
    });

    // Check if we solved the quadratic scaling issue
    if (results.length >= 3) {
        const first = results[0];
        const last = results[results.length - 1];
        const dataSizeIncrease = last.size / first.size;
        const timeIncrease = last.duration / first.duration;

        console.log(`\n🔍 Scaling Analysis:`);
        console.log(`Data increased by: ${dataSizeIncrease.toFixed(1)}x`);
        console.log(`Time increased by: ${timeIncrease.toFixed(1)}x`);

        if (timeIncrease <= dataSizeIncrease * 1.5) {
            console.log(`🎉 SUCCESS: Linear scaling achieved!`);
        } else if (timeIncrease <= dataSizeIncrease * 3) {
            console.log(`⚠️  ACCEPTABLE: Near-linear scaling`);
        } else {
            console.log(`❌ POOR: Quadratic scaling still present`);
        }
    }
}

if (import.meta.main) {
    runPerformanceValidation().catch(console.error);
}
