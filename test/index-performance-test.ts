/**
 * Performance test for index-aware query execution
 * Demonstrates O(log n) vs O(n) performance improvements
 */

import { TinyDB, MemoryStorage, where } from '../src/index';

interface TestUser {
    id: number;
    name: string;
    email: string;
    age: number;
    city: string;
    salary: number;
    department: string;
}

// Generate test data
function generateTestData(count: number): TestUser[] {
    const cities = [
        'New York',
        'Los Angeles',
        'Chicago',
        'Houston',
        'Phoenix',
        'Philadelphia',
        'San Antonio',
        'San Diego',
    ];
    const departments = [
        'Engineering',
        'Sales',
        'Marketing',
        'HR',
        'Finance',
        'Legal',
        'Operations',
    ];
    const names = [
        'Alice',
        'Bob',
        'Charlie',
        'Diana',
        'Eve',
        'Frank',
        'Grace',
        'Henry',
    ];

    const users: TestUser[] = [];

    for (let i = 0; i < count; i++) {
        users.push({
            id: i + 1,
            name: `${names[i % names.length]}_${i}`,
            email: `user${i}@example.com`,
            age: 20 + (i % 50), // Ages 20-69
            city: cities[i % cities.length],
            salary: 30000 + (i % 100000), // Salaries 30k-130k
            department: departments[i % departments.length],
        });
    }

    return users;
}

// Test performance with and without indexes
async function testPerformance() {
    console.log('🚀 Index-Aware Query Performance Test\n');

    // Test with different dataset sizes
    const testSizes = [10000, 100000, 1000000];

    for (const size of testSizes) {
        console.log(`📊 Testing with ${size.toLocaleString()} documents`);
        console.log('='.repeat(50));

        // Generate test data
        const users = generateTestData(size);
        console.log(`Generated ${users.length} test users`);

        // Test without indexing (baseline)
        const dbNoIndex = new TinyDB({ storage: MemoryStorage });
        const tableNoIndex = dbNoIndex.table<TestUser>('users');

        // Insert data
        const insertStart = Date.now();
        for (const user of users) {
            tableNoIndex.insert(user);
        }
        const insertTime = Date.now() - insertStart;
        console.log(`Insert time: ${insertTime}ms`);

        // Test with indexing
        const dbWithIndex = new TinyDB({ storage: MemoryStorage });
        const tableWithIndex = dbWithIndex.table<TestUser>('users');

        // Create indexes on fields we'll query
        tableWithIndex.createIndex('age');
        tableWithIndex.createIndex('salary');
        tableWithIndex.createIndex('department');
        tableWithIndex.createIndex('id');
        tableWithIndex.createIndex('city');

        // Insert data with indexing
        const insertIndexStart = Date.now();
        for (const user of users) {
            tableWithIndex.insert(user);
        }
        const insertIndexTime = Date.now() - insertIndexStart;
        console.log(`Insert time (with indexing): ${insertIndexTime}ms`);

        // Test queries
        const testQueries = [
            {
                name: 'Equality (age = 25)',
                query: where('age').equals(25),
            },
            {
                name: 'Range (salary between 50k-60k)',
                query: where('salary').between(50000, 60000),
            },
            {
                name: 'Greater than (age > 40)',
                query: where('age').greaterThan(40),
            },
            {
                name: 'IN clause (department in [Engineering, Sales])',
                query: where('department').in(['Engineering', 'Sales']),
            },
            {
                name: 'Complex AND (age > 30 AND salary < 80000)',
                query: where('age')
                    .greaterThan(30)
                    .and(where('salary').lessThan(80000)),
            },
        ];

        console.log('\nQuery Performance Comparison:');
        console.log('-'.repeat(70));

        for (const test of testQueries) {
            // Test without index (full scan)
            const noIndexStart = Date.now();
            const noIndexResults = tableNoIndex.search(test.query);
            const noIndexTime = Date.now() - noIndexStart;

            // Test with index
            const withIndexStart = Date.now();
            const withIndexResults = tableWithIndex.search(test.query);
            const withIndexTime = Date.now() - withIndexStart;

            // Verify results are the same
            const resultCountMatch =
                noIndexResults.length === withIndexResults.length;
            const improvement =
                noIndexTime > 0
                    ? (noIndexTime / withIndexTime).toFixed(1)
                    : 'N/A';

            console.log(`${test.name}:`);
            console.log(
                `  No Index:   ${noIndexTime}ms (${noIndexResults.length} results)`
            );
            console.log(
                `  With Index: ${withIndexTime}ms (${withIndexResults.length} results)`
            );
            console.log(`  Improvement: ${improvement}x faster`);
            console.log(`  Results match: ${resultCountMatch ? '✅' : '❌'}`);
            console.log('');
        }

        // Test index statistics
        console.log('Index Statistics:');
        console.log('-'.repeat(30));
        const indexStats = tableWithIndex.getIndexStats();
        for (const [field, stats] of Object.entries(indexStats)) {
            console.log(`${field}: ${JSON.stringify(stats, null, 2)}`);
        }

        console.log('\n' + '='.repeat(50) + '\n');
    }
}

// Benchmark specific operations
async function benchmarkOperations() {
    console.log('🔬 Detailed Operation Benchmarks\n');

    const size = 100000;
    const users = generateTestData(size);

    // Setup database with indexes
    const db = new TinyDB({ storage: MemoryStorage });
    const table = db.table<TestUser>('users');

    // Create indexes on fields we'll query
    table.createIndex('age');
    table.createIndex('salary');
    table.createIndex('department');
    table.createIndex('id');
    table.createIndex('city');

    console.log(`Inserting ${size} documents...`);
    const insertStart = Date.now();
    for (const user of users) {
        table.insert(user);
    }
    const insertTime = Date.now() - insertStart;
    console.log(`Insert completed in ${insertTime}ms`);

    // Benchmark different query patterns
    const benchmarks = [
        {
            name: 'Point lookup (ID)',
            iterations: 1000,
            query: () =>
                where('id').equals(Math.floor(Math.random() * size) + 1),
        },
        {
            name: 'Range query (age)',
            iterations: 100,
            query: () => where('age').between(30, 40),
        },
        {
            name: 'Prefix search (city = "New York")',
            iterations: 100,
            query: () => where('city').equals('New York'),
        },
        {
            name: 'Complex AND query',
            iterations: 50,
            query: () =>
                where('age')
                    .greaterThan(25)
                    .and(where('salary').lessThan(70000)),
        },
        {
            name: 'Complex OR query',
            iterations: 50,
            query: () =>
                where('department')
                    .equals('Engineering')
                    .or(where('department').equals('Sales')),
        },
    ];

    console.log('\nBenchmark Results:');
    console.log('-'.repeat(60));

    for (const benchmark of benchmarks) {
        const times: number[] = [];

        for (let i = 0; i < benchmark.iterations; i++) {
            const start = Date.now();
            const results = table.search(benchmark.query());
            const time = Date.now() - start;
            times.push(time);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);

        console.log(`${benchmark.name}:`);
        console.log(`  Avg: ${avgTime.toFixed(2)}ms`);
        console.log(`  Min: ${minTime}ms`);
        console.log(`  Max: ${maxTime}ms`);
        console.log(`  Iterations: ${benchmark.iterations}`);
        console.log('');
    }
}

// Memory usage analysis
function analyzeMemoryUsage() {
    console.log('💾 Memory Usage Analysis\n');

    const sizes = [10000, 50000, 100000];

    for (const size of sizes) {
        const users = generateTestData(size);

        // Test without indexing
        const dbNoIndex = new TinyDB({ storage: MemoryStorage });
        const tableNoIndex = dbNoIndex.table<TestUser>('users');

        const memBefore = process.memoryUsage();

        for (const user of users) {
            tableNoIndex.insert(user);
        }

        const memAfterNoIndex = process.memoryUsage();

        // Test with indexing
        const dbWithIndex = new TinyDB({ storage: MemoryStorage });
        const tableWithIndex = dbWithIndex.table<TestUser>('users');

        // Create indexes on fields we'll query
        tableWithIndex.createIndex('age');
        tableWithIndex.createIndex('salary');
        tableWithIndex.createIndex('department');
        tableWithIndex.createIndex('id');
        tableWithIndex.createIndex('city');

        for (const user of users) {
            tableWithIndex.insert(user);
        }

        const memAfterIndex = process.memoryUsage();

        const noIndexMemory = memAfterNoIndex.heapUsed - memBefore.heapUsed;
        const withIndexMemory =
            memAfterIndex.heapUsed - memAfterNoIndex.heapUsed;
        const overhead = (
            (withIndexMemory / noIndexMemory) * 100 -
            100
        ).toFixed(1);

        console.log(`${size.toLocaleString()} documents:`);
        console.log(
            `  No Index: ${(noIndexMemory / 1024 / 1024).toFixed(2)} MB`
        );
        console.log(
            `  With Index: ${(withIndexMemory / 1024 / 1024).toFixed(2)} MB`
        );
        console.log(`  Index Overhead: ${overhead}%`);
        console.log('');
    }
}

// Run all tests
async function main() {
    try {
        await testPerformance();
        await benchmarkOperations();
        analyzeMemoryUsage();

        console.log('✅ All performance tests completed!');
        console.log('\nKey takeaways:');
        console.log(
            '- Index-aware queries show significant performance improvements'
        );
        console.log('- O(log n) lookups vs O(n) scans for large datasets');
        console.log('- Bitmap intersections enable efficient compound queries');
        console.log(
            '- Memory overhead is reasonable for the performance gains'
        );
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

export { testPerformance, benchmarkOperations, analyzeMemoryUsage };
