import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
    ObjectPool,
    PooledObject,
    ObjectPoolOptions,
    PoolRegistry,
    poolRegistry,
    PooledArray,
    PooledMap,
    PooledResultSet,
    arrayPool,
    mapPool,
    resultSetPool,
} from '../../src/utils/ObjectPool';

// Test objects for pooling
class TestObject implements PooledObject {
    public data: string = '';
    public disposed = false;
    public resetCalled = false;
    public isValid = true;

    reset(): void {
        this.data = '';
        this.resetCalled = true;
    }

    dispose(): void {
        this.disposed = true;
    }

    setData(data: string): void {
        this.data = data;
    }
}

class InvalidTestObject implements PooledObject {
    public isValid = false;

    reset(): void {}
    dispose(): void {}
}

describe('ObjectPool', () => {
    let pool: ObjectPool<TestObject>;
    let factory: () => TestObject;
    let validator: (obj: TestObject) => boolean;
    let resetFn: (obj: TestObject) => void;

    beforeEach(() => {
        factory = () => new TestObject();
        validator = (obj: TestObject) => obj.isValid;
        resetFn = (obj: TestObject) => {
            obj.data = 'reset';
            obj.resetCalled = true;
        };
    });

    afterEach(() => {
        if (pool) {
            pool.clear();
        }
    });

    describe('Basic functionality', () => {
        test('should create pool with default options', () => {
            pool = new ObjectPool({ factory });
            expect(pool).toBeDefined();

            const stats = pool.getStats();
            expect(stats.available).toBe(0);
            expect(stats.inUse).toBe(0);
            expect(stats.created).toBe(0);
            expect(stats.borrowed).toBe(0);
            expect(stats.returned).toBe(0);
            expect(stats.hitRate).toBe(0);
        });

        test('should borrow and return objects', () => {
            pool = new ObjectPool({ factory });

            const obj1 = pool.borrow();
            expect(obj1).toBeInstanceOf(TestObject);
            expect(obj1.resetCalled).toBe(true);

            const stats = pool.getStats();
            expect(stats.inUse).toBe(1);
            expect(stats.borrowed).toBe(1);
            expect(stats.created).toBe(1);

            pool.return(obj1);
            const statsAfterReturn = pool.getStats();
            expect(statsAfterReturn.inUse).toBe(0);
            expect(statsAfterReturn.available).toBe(1);
            expect(statsAfterReturn.returned).toBe(1);
        });

        test('should reuse objects from pool', () => {
            pool = new ObjectPool({ factory });

            const obj1 = pool.borrow();
            pool.return(obj1);

            const obj2 = pool.borrow();
            expect(obj2).toBe(obj1); // Should be the same object

            const stats = pool.getStats();
            expect(stats.created).toBe(1); // Only one object created
            expect(stats.borrowed).toBe(2); // But borrowed twice
            expect(stats.hitRate).toBe(0.5); // 50% hit rate
        });

        test('should use custom reset function', () => {
            pool = new ObjectPool({ factory, reset: resetFn });

            const obj = pool.borrow();
            expect(obj.data).toBe('reset');
            expect(obj.resetCalled).toBe(true);
        });
    });

    describe('Idempotency and edge cases', () => {
        test('should ignore double returns (idempotency)', () => {
            pool = new ObjectPool({ factory });

            const obj = pool.borrow();
            const statsAfterBorrow = pool.getStats();

            pool.return(obj);
            const statsAfterFirstReturn = pool.getStats();
            expect(statsAfterFirstReturn.returned).toBe(1);
            expect(statsAfterFirstReturn.inUse).toBe(0);

            // Second return should be ignored
            pool.return(obj);
            const statsAfterSecondReturn = pool.getStats();
            expect(statsAfterSecondReturn.returned).toBe(1); // Should not increment
            expect(statsAfterSecondReturn.inUse).toBe(0);
            expect(statsAfterSecondReturn.available).toBe(1);
        });

        test('should ignore returns of objects not from this pool', () => {
            pool = new ObjectPool({ factory });
            const foreignObject = new TestObject();

            const initialStats = pool.getStats();
            pool.return(foreignObject);
            const finalStats = pool.getStats();

            expect(finalStats).toEqual(initialStats); // No change in stats
        });

        test('should handle empty pool correctly', () => {
            pool = new ObjectPool({ factory });

            // Clear should work on empty pool
            pool.clear();
            expect(pool.getStats().available).toBe(0);
        });
    });

    describe('maxAge expiry', () => {
        test('should expire objects older than maxAge', async () => {
            const shortMaxAge = 50; // 50ms
            pool = new ObjectPool({ factory, maxAge: shortMaxAge });

            const obj = pool.borrow();
            pool.return(obj);

            expect(pool.getStats().available).toBe(1);

            // Wait for expiry
            await new Promise((resolve) =>
                setTimeout(resolve, shortMaxAge + 10)
            );

            // Next borrow should clean up expired objects
            const newObj = pool.borrow();
            expect(obj.disposed).toBe(true); // Expired object should be disposed
            expect(newObj).not.toBe(obj); // Should get a new object

            const stats = pool.getStats();
            expect(stats.created).toBe(2); // Two objects created
        });

        test('should not expire objects within maxAge', async () => {
            const longMaxAge = 1000; // 1 second
            pool = new ObjectPool({ factory, maxAge: longMaxAge });

            const obj = pool.borrow();
            pool.return(obj);

            // Wait a short time (less than maxAge)
            await new Promise((resolve) => setTimeout(resolve, 20));

            const reusedObj = pool.borrow();
            expect(reusedObj).toBe(obj); // Should reuse the same object
            expect(obj.disposed).toBe(false);
        });
    });

    describe('Validator rejection', () => {
        test('should reject invalid objects during borrow', () => {
            pool = new ObjectPool({ factory, validator });

            const obj = pool.borrow();
            obj.isValid = false; // Make object invalid
            pool.return(obj);

            expect(pool.getStats().available).toBe(0); // Invalid object not stored
            expect(obj.disposed).toBe(true); // Invalid object disposed
        });

        test('should handle validator function correctly', () => {
            const customValidator = (obj: TestObject) => obj.data !== 'invalid';
            pool = new ObjectPool({ factory, validator: customValidator });

            const obj = pool.borrow();
            obj.setData('valid');
            pool.return(obj);
            expect(pool.getStats().available).toBe(1);

            const obj2 = pool.borrow(); // This will be the same object as obj
            expect(obj2).toBe(obj); // Should be reused
            obj2.setData('invalid'); // Now it's invalid
            pool.return(obj2);
            expect(pool.getStats().available).toBe(0); // Invalid object not stored
            expect(obj2.disposed).toBe(true); // Should be disposed
        });
    });

    describe('Pool size limits', () => {
        test('should respect maxSize limit', () => {
            const maxSize = 2;
            pool = new ObjectPool({ factory, maxSize });

            const obj1 = pool.borrow();
            const obj2 = pool.borrow();
            const obj3 = pool.borrow();

            pool.return(obj1);
            pool.return(obj2);
            pool.return(obj3); // This should be disposed due to maxSize

            const stats = pool.getStats();
            expect(stats.available).toBe(maxSize);
            expect(obj3.disposed).toBe(true); // Third object should be disposed
        });
    });

    describe('Statistics accuracy under parallel load', () => {
        test('should maintain accurate stats under concurrent operations', async () => {
            pool = new ObjectPool({ factory, maxSize: 10 });

            const operations: Promise<TestObject>[] = [];
            const borrowedObjects: TestObject[] = [];

            // Create multiple concurrent borrow operations
            for (let i = 0; i < 20; i++) {
                operations.push(
                    Promise.resolve().then(() => {
                        const obj = pool.borrow();
                        borrowedObjects.push(obj);
                        return obj;
                    })
                );
            }

            await Promise.all(operations);

            let stats = pool.getStats();
            expect(stats.borrowed).toBe(20);
            expect(stats.inUse).toBe(20);

            // Return all objects concurrently
            const returnOperations = borrowedObjects.map((obj) =>
                Promise.resolve().then(() => pool.return(obj))
            );

            await Promise.all(returnOperations);

            stats = pool.getStats();
            expect(stats.returned).toBe(20);
            expect(stats.inUse).toBe(0);
            expect(stats.available).toBe(10); // Limited by maxSize
        });

        test('should calculate hit rate correctly', () => {
            pool = new ObjectPool({ factory });

            // First borrow creates an object
            const obj1 = pool.borrow();
            pool.return(obj1);

            // Second borrow reuses the object
            const obj2 = pool.borrow();
            pool.return(obj2);

            const stats = pool.getStats();
            expect(stats.borrowed).toBe(2);
            expect(stats.created).toBe(1);
            expect(stats.hitRate).toBe(0.5); // (borrowed - created) / borrowed = (2 - 1) / 2 = 0.5
        });
    });

    describe('Memory management', () => {
        test('should dispose objects when clearing pool', () => {
            pool = new ObjectPool({ factory });

            const obj1 = pool.borrow();
            const obj2 = pool.borrow();

            pool.return(obj1);
            // obj2 still in use

            pool.clear();

            expect(obj1.disposed).toBe(true); // Available object disposed
            expect(pool.getStats().available).toBe(0);
            expect(pool.getStats().inUse).toBe(0); // In-use tracking cleared
        });

        test('should handle objects without dispose method', () => {
            class SimpleObject implements PooledObject {
                reset() {}
                // No dispose method
            }

            const simplePool = new ObjectPool({
                factory: () => new SimpleObject(),
            });

            const obj = simplePool.borrow();
            simplePool.return(obj);

            // Should not throw when clearing
            expect(() => simplePool.clear()).not.toThrow();
        });
    });
});

describe('PoolRegistry', () => {
    let registry: PoolRegistry;

    beforeEach(() => {
        registry = new PoolRegistry();
    });

    afterEach(() => {
        registry.clearAll();
    });

    test('should create and manage pools', () => {
        const pool = registry.getPool<TestObject>('test', {
            factory: () => new TestObject(),
        });

        expect(pool).toBeInstanceOf(ObjectPool);
        expect(registry.getPoolNames()).toContain('test');
    });

    test('should reuse existing pools', () => {
        const pool1 = registry.getPool<TestObject>('test', {
            factory: () => new TestObject(),
        });

        const pool2 = registry.getPool<TestObject>('test');
        expect(pool1).toBe(pool2);
    });

    test('should throw when getting non-existent pool without options', () => {
        expect(() => {
            registry.getPool('nonexistent');
        }).toThrow("Pool 'nonexistent' does not exist and no options provided");
    });

    test('should remove pools correctly', () => {
        const pool = registry.getPool<TestObject>('test', {
            factory: () => new TestObject(),
        });

        const obj = pool.borrow();
        pool.return(obj);

        registry.removePool('test');
        expect(registry.getPoolNames()).not.toContain('test');
    });

    test('should get statistics for all pools', () => {
        const pool1 = registry.getPool<TestObject>('pool1', {
            factory: () => new TestObject(),
        });
        const pool2 = registry.getPool<TestObject>('pool2', {
            factory: () => new TestObject(),
        });

        pool1.borrow();
        pool2.borrow();

        const allStats = registry.getAllStats();
        expect(allStats).toHaveProperty('pool1');
        expect(allStats).toHaveProperty('pool2');
        expect(allStats.pool1.borrowed).toBe(1);
        expect(allStats.pool2.borrowed).toBe(1);
    });

    test('should clear all pools', () => {
        const pool1 = registry.getPool<TestObject>('pool1', {
            factory: () => new TestObject(),
        });
        const pool2 = registry.getPool<TestObject>('pool2', {
            factory: () => new TestObject(),
        });

        const obj1 = pool1.borrow();
        const obj2 = pool2.borrow();
        pool1.return(obj1);
        pool2.return(obj2);

        registry.clearAll();
        expect(registry.getPoolNames()).toHaveLength(0);
        expect(obj1.disposed).toBe(true);
        expect(obj2.disposed).toBe(true);
    });
});

describe('Pooled wrapper classes', () => {
    describe('PooledArray', () => {
        test('should work as array wrapper', () => {
            const pooledArray = new PooledArray<number>();

            pooledArray.push(1, 2, 3);
            expect(pooledArray.length).toBe(3);
            expect(pooledArray.pop()).toBe(3);
            expect(pooledArray.length).toBe(2);

            // Test iteration
            const values = Array.from(pooledArray);
            expect(values).toEqual([1, 2]);
        });

        test('should reset correctly', () => {
            const pooledArray = new PooledArray<string>();
            pooledArray.push('a', 'b', 'c');

            pooledArray.reset();
            expect(pooledArray.length).toBe(0);
        });
    });

    describe('PooledMap', () => {
        test('should work as map wrapper', () => {
            const pooledMap = new PooledMap<string, number>();

            pooledMap.set('a', 1).set('b', 2);
            expect(pooledMap.size).toBe(2);
            expect(pooledMap.get('a')).toBe(1);
            expect(pooledMap.has('b')).toBe(true);
            expect(pooledMap.delete('a')).toBe(true);
            expect(pooledMap.size).toBe(1);

            // Test iteration
            const keys = Array.from(pooledMap.keys());
            const values = Array.from(pooledMap.values());
            const entries = Array.from(pooledMap.entries());

            expect(keys).toEqual(['b']);
            expect(values).toEqual([2]);
            expect(entries).toEqual([['b', 2]]);
        });

        test('should reset correctly', () => {
            const pooledMap = new PooledMap<string, number>();
            pooledMap.set('a', 1).set('b', 2);

            pooledMap.reset();
            expect(pooledMap.size).toBe(0);
        });
    });

    describe('PooledResultSet', () => {
        test('should manage results and metadata', () => {
            const resultSet = new PooledResultSet<string>();

            resultSet.addResult('a');
            resultSet.addResults(['b', 'c']);
            expect(resultSet.length).toBe(3);
            expect(resultSet.results).toEqual(['a', 'b', 'c']);

            resultSet.setMetadata('count', 3);
            resultSet.setMetadata('type', 'string');
            expect(resultSet.getMetadata('count')).toBe(3);
            expect(resultSet.metadata).toEqual({ count: 3, type: 'string' });
        });

        test('should reset correctly', () => {
            const resultSet = new PooledResultSet<number>();
            resultSet.addResults([1, 2, 3]);
            resultSet.setMetadata('sum', 6);

            resultSet.reset();
            expect(resultSet.length).toBe(0);
            expect(resultSet.metadata).toEqual({});
        });
    });
});

describe('Pre-configured pools', () => {
    afterEach(() => {
        // Clear pre-configured pools to avoid test interference
        arrayPool.clear();
        mapPool.clear();
        resultSetPool.clear();
    });

    test('should work with arrayPool', () => {
        const pooledArray = arrayPool.borrow();
        pooledArray.push(1, 2, 3);

        expect(pooledArray.length).toBe(3);
        arrayPool.return(pooledArray);

        const reusedArray = arrayPool.borrow();
        expect(reusedArray).toBe(pooledArray);
        expect(reusedArray.length).toBe(0); // Should be reset
    });

    test('should work with mapPool', () => {
        const pooledMap = mapPool.borrow();
        pooledMap.set('key', 'value');

        expect(pooledMap.size).toBe(1);
        mapPool.return(pooledMap);

        const reusedMap = mapPool.borrow();
        expect(reusedMap).toBe(pooledMap);
        expect(reusedMap.size).toBe(0); // Should be reset
    });

    test('should work with resultSetPool', () => {
        const resultSet = resultSetPool.borrow();
        resultSet.addResults(['a', 'b']);
        resultSet.setMetadata('type', 'test');

        expect(resultSet.length).toBe(2);
        resultSetPool.return(resultSet);

        const reusedResultSet = resultSetPool.borrow();
        expect(reusedResultSet).toBe(resultSet);
        expect(reusedResultSet.length).toBe(0); // Should be reset
        expect(Object.keys(reusedResultSet.metadata)).toHaveLength(0);
    });

    test('should respect pre-configured pool settings', async () => {
        // Test that maxAge works with pre-configured pools
        const resultSet = resultSetPool.borrow();
        resultSetPool.return(resultSet);

        // ResultSetPool has maxAge of 30 seconds, so object should still be available
        const reused = resultSetPool.borrow();
        expect(reused).toBe(resultSet);
    });
});

describe('Global poolRegistry', () => {
    afterEach(() => {
        // Clean up any pools created during tests
        const poolNames = poolRegistry.getPoolNames();
        poolNames.forEach((name) => poolRegistry.removePool(name));
    });

    test('should be accessible globally', () => {
        expect(poolRegistry).toBeDefined();
        expect(poolRegistry).toBeInstanceOf(PoolRegistry);
    });

    test('should work with global registry', () => {
        const pool = poolRegistry.getPool<TestObject>('global-test', {
            factory: () => new TestObject(),
        });

        const obj = pool.borrow();
        expect(obj).toBeInstanceOf(TestObject);

        pool.return(obj);
        const stats = pool.getStats();
        expect(stats.returned).toBe(1);
    });
});

describe('Stress testing and edge cases', () => {
    test('should handle rapid borrow/return cycles', async () => {
        const pool = new ObjectPool({
            factory: () => new TestObject(),
            maxSize: 5,
        });

        const cycles = 1000;
        const objects: TestObject[] = [];

        // Rapid borrow
        for (let i = 0; i < cycles; i++) {
            objects.push(pool.borrow());
        }

        const borrowStats = pool.getStats();
        expect(borrowStats.borrowed).toBe(cycles);
        expect(borrowStats.inUse).toBe(cycles);

        // Rapid return
        for (const obj of objects) {
            pool.return(obj);
        }

        const returnStats = pool.getStats();
        expect(returnStats.returned).toBe(cycles);
        expect(returnStats.inUse).toBe(0);
        expect(returnStats.available).toBe(5); // Limited by maxSize

        pool.clear();
    });

    test('should handle mixed valid/invalid objects', () => {
        let createValid = true;
        const pool = new ObjectPool({
            factory: () => {
                const obj = new TestObject();
                obj.isValid = createValid;
                createValid = !createValid; // Alternate
                return obj;
            },
            validator: (obj: TestObject) => obj.isValid,
        });

        const validObj = pool.borrow(); // Should be valid
        const invalidObj = pool.borrow(); // Should be invalid

        pool.return(validObj);
        pool.return(invalidObj);

        const stats = pool.getStats();
        expect(stats.available).toBe(1); // Only valid object stored
        expect(invalidObj.disposed).toBe(true);

        pool.clear();
    });

    test('should handle concurrent borrow/return with expiry', async () => {
        const pool = new ObjectPool({
            factory: () => new TestObject(),
            maxAge: 100, // 100ms
            maxSize: 3,
        });

        // Borrow objects
        const obj1 = pool.borrow();
        const obj2 = pool.borrow();

        pool.return(obj1);
        pool.return(obj2);

        // Wait for partial expiry
        await new Promise((resolve) => setTimeout(resolve, 50));

        const obj3 = pool.borrow(); // Should reuse obj1 or obj2
        pool.return(obj3);

        // Wait for full expiry
        await new Promise((resolve) => setTimeout(resolve, 100));

        const obj4 = pool.borrow(); // Should create new object
        expect(obj4).not.toBe(obj1);
        expect(obj4).not.toBe(obj2);
        expect(obj4).not.toBe(obj3);

        pool.clear();
    });
});
