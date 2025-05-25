/**
 * Comprehensive LRUCache tests - Core functionality, performance, and edge cases
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { LRUCache } from '../../src/utils/LRUCache';
import { measurePerformance, generateRandomString } from '../test-setup';

describe('LRUCache - Core Functionality', () => {
    let cache: LRUCache<string, number>;

    beforeEach(() => {
        cache = new LRUCache<string, number>(3);
    });

    describe('Basic Operations', () => {
        test('should initialize with correct capacity', () => {
            expect(cache.maxSize).toBe(3);
            expect(cache.size).toBe(0);
            expect(cache.hits).toBe(0);
            expect(cache.misses).toBe(0);
        });

        test('should set and get values', () => {
            cache.set('key1', 100);
            expect(cache.get('key1')).toBe(100);
            expect(cache.size).toBe(1);
        });

        test('should return undefined for non-existent keys', () => {
            expect(cache.get('nonexistent')).toBeUndefined();
            expect(cache.misses).toBe(1);
        });

        test('should check key existence without affecting LRU order', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);

            expect(cache.has('key1')).toBe(true);
            expect(cache.has('key2')).toBe(true);
            expect(cache.has('nonexistent')).toBe(false);

            // LRU order should remain: key2 (most recent), key1
            const keys = cache.keys();
            expect(keys).toEqual(['key2', 'key1']);
        });

        test('should delete specific keys', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);

            expect(cache.delete('key1')).toBe(true);
            expect(cache.delete('nonexistent')).toBe(false);

            expect(cache.has('key1')).toBe(false);
            expect(cache.has('key2')).toBe(true);
            expect(cache.size).toBe(1);
        });

        test('should clear all data and reset statistics', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);
            cache.get('key1'); // Generate some hits
            cache.get('nonexistent'); // Generate some misses

            cache.clear();

            expect(cache.size).toBe(0);
            expect(cache.hits).toBe(0);
            expect(cache.misses).toBe(0);
            expect(cache.get('key1')).toBeUndefined();
        });
    });

    describe('LRU Behavior', () => {
        test('should maintain LRU order on access', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);
            cache.set('key3', 300);

            // Access key1 to make it most recently used
            cache.get('key1');

            // Order should now be: key1, key3, key2
            const keys = cache.keys();
            expect(keys).toEqual(['key1', 'key3', 'key2']);
        });

        test('should evict least recently used item when capacity exceeded', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);
            cache.set('key3', 300);

            // Cache is at capacity, adding one more should evict key1
            cache.set('key4', 400);

            expect(cache.size).toBe(3);
            expect(cache.has('key1')).toBe(false); // Evicted
            expect(cache.has('key2')).toBe(true);
            expect(cache.has('key3')).toBe(true);
            expect(cache.has('key4')).toBe(true);
        });

        test('should move accessed items to front', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);
            cache.set('key3', 300);

            // Access key1 to move it to front
            cache.get('key1');

            // Now add key4, key2 should be evicted (it's now least recently used)
            cache.set('key4', 400);

            expect(cache.has('key1')).toBe(true); // Should still exist
            expect(cache.has('key2')).toBe(false); // Should be evicted
            expect(cache.has('key3')).toBe(true);
            expect(cache.has('key4')).toBe(true);
        });

        test('should update existing keys without changing capacity', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);
            cache.set('key3', 300);

            // Update existing key
            cache.set('key2', 250);

            expect(cache.size).toBe(3);
            expect(cache.get('key2')).toBe(250);

            // key2 should now be most recently used
            const keys = cache.keys();
            expect(keys[0]).toBe('key2');
        });
    });

    describe('Statistics Tracking', () => {
        test('should track cache hits and misses', () => {
            cache.set('key1', 100);

            // Generate hits
            cache.get('key1');
            cache.get('key1');

            // Generate misses
            cache.get('nonexistent1');
            cache.get('nonexistent2');
            cache.get('nonexistent3');

            expect(cache.hits).toBe(2);
            expect(cache.misses).toBe(3);
            expect(cache.hitRate).toBeCloseTo(0.4, 2); // 2/(2+3) = 0.4
        });

        test('should calculate hit rate correctly', () => {
            expect(cache.hitRate).toBe(0); // No operations yet

            cache.set('key1', 100);
            cache.get('key1'); // Hit
            expect(cache.hitRate).toBe(1); // 100% hit rate

            cache.get('nonexistent'); // Miss
            expect(cache.hitRate).toBe(0.5); // 50% hit rate
        });

        test('should provide comprehensive statistics', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);
            cache.get('key1');
            cache.get('nonexistent');

            const stats = cache.getStats();
            expect(stats).toEqual({
                hits: 1,
                misses: 1,
                hitRate: 0.5,
                size: 2,
                maxSize: 3,
            });
        });

        test('should provide memory usage estimation', () => {
            cache.set('key1', 100);
            cache.set('key2', 200);

            const memUsage = cache.getMemoryUsage();
            expect(memUsage.nodeCount).toBe(2);
            expect(memUsage.estimatedBytes).toBe(300); // 2 * 150
        });
    });

    describe('Key Ordering and Iteration', () => {
        test('should return keys in LRU order (most recent first)', () => {
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);

            expect(cache.keys()).toEqual(['c', 'b', 'a']);

            // Access 'a' to make it most recent
            cache.get('a');
            expect(cache.keys()).toEqual(['a', 'c', 'b']);
        });

        test('should handle empty cache keys', () => {
            expect(cache.keys()).toEqual([]);
        });

        test('should maintain correct order after deletions', () => {
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);

            cache.delete('b');
            expect(cache.keys()).toEqual(['c', 'a']);
        });
    });
});

describe('LRUCache - Advanced Features', () => {
    let cache: LRUCache<string, string>;

    beforeEach(() => {
        cache = new LRUCache<string, string>(5);
    });

    describe('Selective Invalidation', () => {
        beforeEach(() => {
            cache.set('user:1', 'Alice');
            cache.set('user:2', 'Bob');
            cache.set('post:1', 'Hello World');
            cache.set('post:2', 'Goodbye World');
            cache.set('setting:theme', 'dark');
        });

        test('should invalidate by string pattern', () => {
            const removed = cache.invalidate('user:');

            expect(removed).toBe(2);
            expect(cache.has('user:1')).toBe(false);
            expect(cache.has('user:2')).toBe(false);
            expect(cache.has('post:1')).toBe(true);
            expect(cache.has('post:2')).toBe(true);
            expect(cache.has('setting:theme')).toBe(true);
        });

        test('should invalidate by regex pattern', () => {
            const removed = cache.invalidate(/^post:/);

            expect(removed).toBe(2);
            expect(cache.has('post:1')).toBe(false);
            expect(cache.has('post:2')).toBe(false);
            expect(cache.has('user:1')).toBe(true);
            expect(cache.has('user:2')).toBe(true);
            expect(cache.has('setting:theme')).toBe(true);
        });

        test('should invalidate by function predicate', () => {
            const removed = cache.invalidate((key: string) =>
                key.includes('1')
            );

            expect(removed).toBe(2); // user:1 and post:1
            expect(cache.has('user:1')).toBe(false);
            expect(cache.has('post:1')).toBe(false);
            expect(cache.has('user:2')).toBe(true);
            expect(cache.has('post:2')).toBe(true);
            expect(cache.has('setting:theme')).toBe(true);
        });

        test('should return zero when no keys match pattern', () => {
            const removed = cache.invalidate('nonexistent');
            expect(removed).toBe(0);
            expect(cache.size).toBe(5); // All items should remain
        });

        test('should handle empty cache invalidation', () => {
            cache.clear();
            const removed = cache.invalidate('anything');
            expect(removed).toBe(0);
        });
    });
});

describe('LRUCache - Type Safety and Flexibility', () => {
    test('should work with different key and value types', () => {
        // Number keys, object values
        const numberCache = new LRUCache<number, { name: string; age: number }>(
            2
        );

        numberCache.set(1, { name: 'Alice', age: 25 });
        numberCache.set(2, { name: 'Bob', age: 30 });

        expect(numberCache.get(1)?.name).toBe('Alice');
        expect(numberCache.get(2)?.age).toBe(30);
    });

    test('should work with object keys', () => {
        const objectCache = new LRUCache<{ id: number }, string>(2);

        const key1 = { id: 1 };
        const key2 = { id: 2 };

        objectCache.set(key1, 'value1');
        objectCache.set(key2, 'value2');

        expect(objectCache.get(key1)).toBe('value1');
        expect(objectCache.get(key2)).toBe('value2');
    });

    test('should handle null and undefined values', () => {
        const cache = new LRUCache<string, string | null | undefined>(3);

        cache.set('null', null);
        cache.set('undefined', undefined);
        cache.set('empty', '');

        expect(cache.get('null')).toBeNull();
        expect(cache.get('undefined')).toBeUndefined();
        expect(cache.get('empty')).toBe('');

        expect(cache.has('null')).toBe(true);
        expect(cache.has('undefined')).toBe(true);
        expect(cache.has('empty')).toBe(true);
    });
});

describe('LRUCache - Edge Cases and Error Handling', () => {
    test('should handle zero capacity', () => {
        const cache = new LRUCache<string, number>(0);

        cache.set('key1', 100);
        // With zero capacity, the cache accepts items but they get evicted when the next item is added
        expect(cache.size).toBe(1);
        expect(cache.get('key1')).toBe(100);

        // Adding another item should evict the first one
        cache.set('key2', 200);
        expect(cache.size).toBe(1);
        expect(cache.get('key1')).toBeUndefined(); // First item was evicted
        expect(cache.get('key2')).toBe(200); // Second item is present
    });

    test('should handle single item capacity', () => {
        const cache = new LRUCache<string, number>(1);

        cache.set('key1', 100);
        expect(cache.get('key1')).toBe(100);

        cache.set('key2', 200);
        expect(cache.get('key1')).toBeUndefined(); // Evicted
        expect(cache.get('key2')).toBe(200);
        expect(cache.size).toBe(1);
    });

    test('should handle rapid consecutive operations', () => {
        const cache = new LRUCache<string, number>(3);

        // Rapid set operations
        for (let i = 0; i < 10; i++) {
            cache.set(`key${i}`, i);
        }

        expect(cache.size).toBe(3);
        expect(cache.has('key7')).toBe(true);
        expect(cache.has('key8')).toBe(true);
        expect(cache.has('key9')).toBe(true);
    });

    test('should handle mixed operation patterns', () => {
        const cache = new LRUCache<string, number>(3);

        cache.set('a', 1);
        cache.set('b', 2);
        cache.get('a'); // Make 'a' most recent
        cache.set('c', 3);
        cache.delete('b');
        cache.set('d', 4);

        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(false); // Deleted
        expect(cache.has('c')).toBe(true);
        expect(cache.has('d')).toBe(true);
        expect(cache.size).toBe(3);
    });

    test('should handle special string keys', () => {
        const cache = new LRUCache<string, string>(8); // Increased capacity to fit all keys

        const specialKeys = [
            '', // Empty string
            ' ', // Space
            '\n\t', // Whitespace
            '🚀💾🔥', // Unicode
            'key:with:colons',
            'key.with.dots',
            'key-with-dashes',
            'key_with_underscores',
        ];

        specialKeys.forEach((key, index) => {
            cache.set(key, `value${index}`);
        });

        specialKeys.forEach((key, index) => {
            expect(cache.get(key)).toBe(`value${index}`);
        });
    });

    test('should maintain consistency after many operations', () => {
        const cache = new LRUCache<string, number>(5);

        // Perform many mixed operations
        for (let i = 0; i < 100; i++) {
            const key = `key${i % 10}`;

            if (i % 3 === 0) {
                cache.set(key, i);
            } else if (i % 3 === 1) {
                cache.get(key);
            } else {
                if (Math.random() > 0.5) {
                    cache.delete(key);
                }
            }
        }

        // Cache should still be in valid state
        expect(cache.size).toBeLessThanOrEqual(5);
        expect(cache.keys().length).toBe(cache.size);

        // All keys returned by keys() should exist in cache
        cache.keys().forEach((key) => {
            expect(cache.has(key)).toBe(true);
        });
    });
});

describe('LRUCache - Performance Tests', () => {
    test('should handle large capacity efficiently', () => {
        const cache = new LRUCache<string, number>(10000);

        const { duration: insertTime } = measurePerformance(() => {
            for (let i = 0; i < 10000; i++) {
                cache.set(`key${i}`, i);
            }
        });

        expect(insertTime).toBeLessThan(500); // Should be fast
        expect(cache.size).toBe(10000);
    });

    test('should maintain performance with frequent access', () => {
        const cache = new LRUCache<string, number>(1000);

        // Fill cache
        for (let i = 0; i < 1000; i++) {
            cache.set(`key${i}`, i);
        }

        const { duration: accessTime } = measurePerformance(() => {
            for (let i = 0; i < 10000; i++) {
                const key = `key${i % 1000}`;
                cache.get(key);
            }
        });

        expect(accessTime).toBeLessThan(100); // Should be very fast
        expect(cache.hits).toBe(10000);
    });

    test('should handle eviction performance', () => {
        const cache = new LRUCache<string, number>(100);

        const { duration: evictionTime } = measurePerformance(() => {
            for (let i = 0; i < 1000; i++) {
                cache.set(`key${i}`, i);
            }
        });

        expect(evictionTime).toBeLessThan(200); // Should handle evictions efficiently
        expect(cache.size).toBe(100);
    });

    test('should handle large invalidation operations efficiently', () => {
        const cache = new LRUCache<string, string>(5000);

        // Fill with different prefixes
        for (let i = 0; i < 5000; i++) {
            const prefix = ['user', 'post', 'comment', 'setting'][i % 4];
            cache.set(`${prefix}:${i}`, `value${i}`);
        }

        const { duration: invalidationTime } = measurePerformance(() => {
            cache.invalidate(/^user:/);
        });

        expect(invalidationTime).toBeLessThan(100); // Should be reasonably fast
        expect(cache.size).toBeLessThan(5000); // Some items should be removed
    });

    test('should maintain memory efficiency', () => {
        const cache = new LRUCache<string, string>(1000);

        // Fill cache with larger values
        for (let i = 0; i < 1000; i++) {
            cache.set(`key${i}`, generateRandomString(100));
        }

        const memUsage = cache.getMemoryUsage();
        expect(memUsage.nodeCount).toBe(1000);
        expect(memUsage.estimatedBytes).toBe(150000); // 1000 * 150
    });
});

describe('LRUCache - Integration Scenarios', () => {
    test('should work as a component cache in larger system', () => {
        // Simulate usage in a component caching scenario
        interface CachedComponent {
            id: string;
            content: string;
            timestamp: number;
        }

        const componentCache = new LRUCache<string, CachedComponent>(50);

        // Simulate component creation and caching
        for (let i = 0; i < 100; i++) {
            const component: CachedComponent = {
                id: `comp_${i}`,
                content: `Component content ${i}`,
                timestamp: Date.now(),
            };
            componentCache.set(component.id, component);
        }

        expect(componentCache.size).toBe(50);

        // Simulate cache hits for recently used components
        const recentComponent = componentCache.get('comp_99');
        expect(recentComponent?.content).toBe('Component content 99');

        // Verify LRU behavior
        expect(componentCache.keys()[0]).toBe('comp_99');
    });

    test('should handle database query result caching', () => {
        interface QueryResult {
            query: string;
            results: any[];
            executionTime: number;
        }

        const queryCache = new LRUCache<string, QueryResult>(20);

        // Simulate query execution and caching
        const queries = [
            'SELECT * FROM users WHERE age > 25',
            'SELECT * FROM posts WHERE author_id = 1',
            'SELECT COUNT(*) FROM comments',
            'SELECT * FROM users WHERE department = "Engineering"',
        ];

        queries.forEach((query, index) => {
            const result: QueryResult = {
                query,
                results: Array.from({ length: index + 1 }, (_, i) => ({
                    id: i,
                })),
                executionTime: Math.random() * 100,
            };
            queryCache.set(query, result);
        });

        // Simulate cache hit
        const cachedResult = queryCache.get(
            'SELECT * FROM users WHERE age > 25'
        );
        expect(cachedResult?.query).toBe('SELECT * FROM users WHERE age > 25');
        expect(cachedResult?.results).toHaveLength(1);

        // Verify statistics tracking
        expect(queryCache.hits).toBeGreaterThan(0);
    });

    test('should support cache warming and preloading', () => {
        const cache = new LRUCache<string, number>(10);

        // Simulate cache warming with frequently accessed data
        const frequentKeys = [
            'user:1',
            'user:2',
            'settings:theme',
            'config:app',
        ];
        frequentKeys.forEach((key, index) => {
            cache.set(key, index * 100);
        });

        // Simulate normal operation with occasional cache misses
        let totalOperations = 0;
        for (let i = 0; i < 100; i++) {
            totalOperations++;
            if (i % 4 === 0) {
                // Access preloaded data (cache hit)
                cache.get(frequentKeys[i % frequentKeys.length]);
            } else {
                // Access new data (cache miss, then becomes hit)
                cache.get(`dynamic:${i}`);
            }
        }

        // Hit rate should be reasonable due to preloading
        expect(cache.hitRate).toBeGreaterThan(0.2);
    });
});
