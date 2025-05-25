import { test, expect, describe, beforeEach } from 'bun:test';
import { BTree, BTreeNode, BTreeEntry } from '../../src/utils/BTree';

describe('BTree', () => {
    let storage: Map<number, Uint8Array>;
    let btree: BTree;

    beforeEach(() => {
        storage = new Map();
        btree = new BTree(
            (offset: number) => {
                const data = storage.get(offset);
                if (!data) {
                    throw new Error(`No data at offset ${offset}`);
                }
                return data;
            },
            (offset: number, data: Uint8Array) => {
                storage.set(offset, data);
            }
        );
    });

    describe('BTreeNode', () => {
        describe('Basic Operations', () => {
            test('should create leaf node', () => {
                const node = new BTreeNode(true);
                expect(node.isLeaf).toBe(true);
                expect(node.keys).toEqual([]);
                expect(node.entries).toEqual([]);
                expect(node.children).toEqual([]);
            });

            test('should create internal node', () => {
                const node = new BTreeNode(false);
                expect(node.isLeaf).toBe(false);
                expect(node.keys).toEqual([]);
                expect(node.entries).toEqual([]);
                expect(node.children).toEqual([]);
            });

            test('should insert entry into leaf node', () => {
                const node = new BTreeNode(true);
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };

                const result = node.insertEntry(entry);
                expect(result).toBe(true);
                expect(node.keys).toEqual(['test']);
                expect(node.entries).toEqual([entry]);
            });

            test('should insert entries in sorted order', () => {
                const node = new BTreeNode(true);
                const entries: BTreeEntry[] = [
                    { key: 'c', offset: 300, length: 50 },
                    { key: 'a', offset: 100, length: 50 },
                    { key: 'b', offset: 200, length: 50 },
                ];

                for (const entry of entries) {
                    node.insertEntry(entry);
                }

                expect(node.keys).toEqual(['a', 'b', 'c']);
                expect(node.entries[0].key).toBe('a');
                expect(node.entries[1].key).toBe('b');
                expect(node.entries[2].key).toBe('c');
            });

            test('should reject insertion when node is full', () => {
                const node = new BTreeNode(true);

                // Fill node to capacity
                for (let i = 0; i < BTreeNode.MAX_KEYS; i++) {
                    const entry: BTreeEntry = {
                        key: `key${i}`,
                        offset: i * 100,
                        length: 50,
                    };
                    expect(node.insertEntry(entry)).toBe(true);
                }

                // Try to insert one more
                const extraEntry: BTreeEntry = {
                    key: 'extra',
                    offset: 9999,
                    length: 50,
                };
                expect(node.insertEntry(extraEntry)).toBe(false);
            });

            test('should reject insertion in internal node', () => {
                const node = new BTreeNode(false);
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };

                expect(node.insertEntry(entry)).toBe(false);
            });
        });

        describe('Search Operations', () => {
            test('should find entry in leaf node', () => {
                const node = new BTreeNode(true);
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };
                node.insertEntry(entry);

                const found = node.findEntry('test');
                expect(found).toEqual(entry);
            });

            test('should return null for non-existent entry', () => {
                const node = new BTreeNode(true);
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };
                node.insertEntry(entry);

                const found = node.findEntry('nonexistent');
                expect(found).toBe(null);
            });

            test('should return null when searching internal node', () => {
                const node = new BTreeNode(false);
                const found = node.findEntry('test');
                expect(found).toBe(null);
            });

            test('should find correct child index', () => {
                const node = new BTreeNode(false);
                node.keys = ['b', 'd', 'f'];
                node.children = [100, 200, 300, 400];

                expect(node.findChildIndex('a')).toBe(0);
                expect(node.findChildIndex('b')).toBe(1);
                expect(node.findChildIndex('c')).toBe(1);
                expect(node.findChildIndex('d')).toBe(2);
                expect(node.findChildIndex('e')).toBe(2);
                expect(node.findChildIndex('f')).toBe(3);
                expect(node.findChildIndex('g')).toBe(3);
            });
        });

        describe('Split Operations', () => {
            test('should split leaf node correctly', () => {
                const node = new BTreeNode(true);
                node.nextLeafOffset = 999;

                // Fill with sorted entries
                for (let i = 0; i < BTreeNode.MAX_KEYS; i++) {
                    const key = String.fromCharCode(97 + i); // 'a', 'b', 'c', ...
                    node.insertEntry({ key, offset: i * 100, length: 50 });
                }

                const { leftNode, rightNode, middleKey } = node.split();
                const midIndex = Math.floor(BTreeNode.MAX_KEYS / 2);

                expect(leftNode.keys).toHaveLength(midIndex);
                expect(rightNode.keys).toHaveLength(
                    BTreeNode.MAX_KEYS - midIndex
                );
                expect(leftNode.isLeaf).toBe(true);
                expect(rightNode.isLeaf).toBe(true);
                expect(middleKey).toBe(String.fromCharCode(97 + midIndex));
                expect(rightNode.nextLeafOffset).toBe(999);
            });

            test('should split internal node correctly', () => {
                const node = new BTreeNode(false);

                // Simulate a full internal node
                for (let i = 0; i < BTreeNode.MAX_KEYS; i++) {
                    const key = String.fromCharCode(97 + i);
                    node.keys.push(key);
                    node.children.push(i * 100);
                }
                node.children.push(BTreeNode.MAX_KEYS * 100); // Last child

                const { leftNode, rightNode, middleKey } = node.split();
                const midIndex = Math.floor(BTreeNode.MAX_KEYS / 2);

                expect(leftNode.keys).toHaveLength(midIndex);
                expect(rightNode.keys).toHaveLength(
                    BTreeNode.MAX_KEYS - midIndex - 1
                );
                expect(leftNode.children).toHaveLength(midIndex + 1);
                expect(rightNode.children).toHaveLength(
                    BTreeNode.MAX_KEYS - midIndex
                );
                expect(middleKey).toBe(String.fromCharCode(97 + midIndex));
            });
        });

        describe('Remove Operations', () => {
            test('should remove entry from leaf node', () => {
                const node = new BTreeNode(true);
                const entries: BTreeEntry[] = [
                    { key: 'a', offset: 100, length: 50 },
                    { key: 'b', offset: 200, length: 50 },
                    { key: 'c', offset: 300, length: 50 },
                ];

                for (const entry of entries) {
                    node.insertEntry(entry);
                }

                expect(node.removeEntry('b')).toBe(true);
                expect(node.keys).toEqual(['a', 'c']);
                expect(node.entries).toHaveLength(2);
                expect(node.entries[0].key).toBe('a');
                expect(node.entries[1].key).toBe('c');
            });

            test('should return false for non-existent key removal', () => {
                const node = new BTreeNode(true);
                node.insertEntry({ key: 'test', offset: 100, length: 50 });

                expect(node.removeEntry('nonexistent')).toBe(false);
                expect(node.keys).toEqual(['test']);
            });

            test('should return false when removing from internal node', () => {
                const node = new BTreeNode(false);
                expect(node.removeEntry('test')).toBe(false);
            });

            test('should detect when rebalancing is needed', () => {
                const node = new BTreeNode(true);

                // Add minimum required keys
                for (let i = 0; i < BTreeNode.MIN_KEYS; i++) {
                    node.insertEntry({
                        key: `key${i}`,
                        offset: i * 100,
                        length: 50,
                    });
                }

                expect(node.needsRebalancing()).toBe(false);

                // Remove one key to go below minimum
                node.removeEntry('key0');
                expect(node.needsRebalancing()).toBe(true);
            });
        });

        describe('Merge Operations', () => {
            test('should merge leaf nodes', () => {
                const leftNode = new BTreeNode(true);
                const rightNode = new BTreeNode(true);

                leftNode.insertEntry({ key: 'a', offset: 100, length: 50 });
                leftNode.insertEntry({ key: 'b', offset: 200, length: 50 });
                rightNode.insertEntry({ key: 'c', offset: 300, length: 50 });
                rightNode.insertEntry({ key: 'd', offset: 400, length: 50 });
                rightNode.nextLeafOffset = 999;

                leftNode.mergeWith(rightNode);

                expect(leftNode.keys).toEqual(['a', 'b', 'c', 'd']);
                expect(leftNode.entries).toHaveLength(4);
                expect(leftNode.nextLeafOffset).toBe(999);
            });

            test('should merge internal nodes with separator', () => {
                const leftNode = new BTreeNode(false);
                const rightNode = new BTreeNode(false);

                leftNode.keys = ['a', 'b'];
                leftNode.children = [100, 200, 300];
                rightNode.keys = ['d', 'e'];
                rightNode.children = [400, 500, 600];

                leftNode.mergeWith(rightNode, 'c');

                expect(leftNode.keys).toEqual(['a', 'b', 'c', 'd', 'e']);
                expect(leftNode.children).toEqual([
                    100, 200, 300, 400, 500, 600,
                ]);
            });
        });

        describe('Serialization', () => {
            test('should serialize and deserialize leaf node', () => {
                const original = new BTreeNode(true);
                original.parentOffset = 1024;
                original.nextLeafOffset = 2048;
                original.offset = 512;

                const entries: BTreeEntry[] = [
                    { key: 'test1', offset: 100, length: 50 },
                    { key: 'test2', offset: 200, length: 75 },
                ];

                for (const entry of entries) {
                    original.insertEntry(entry);
                }

                const serialized = original.serialize();
                const deserialized = BTreeNode.deserialize(serialized, 512);

                expect(deserialized.isLeaf).toBe(true);
                expect(deserialized.keys).toEqual(['test1', 'test2']);
                expect(deserialized.entries).toEqual(entries);
                expect(deserialized.parentOffset).toBe(1024);
                expect(deserialized.nextLeafOffset).toBe(2048);
                expect(deserialized.offset).toBe(512);
            });

            test('should serialize and deserialize internal node', () => {
                const original = new BTreeNode(false);
                original.parentOffset = 1024;
                original.offset = 512;
                original.keys = ['b', 'd'];
                original.children = [100, 200, 300];

                const serialized = original.serialize();
                const deserialized = BTreeNode.deserialize(serialized, 512);

                expect(deserialized.isLeaf).toBe(false);
                expect(deserialized.keys).toEqual(['b', 'd']);
                expect(deserialized.children).toEqual([100, 200, 300]);
                expect(deserialized.parentOffset).toBe(1024);
                expect(deserialized.offset).toBe(512);
            });

            test('should handle empty node serialization', () => {
                const original = new BTreeNode(true);
                original.offset = 1024;

                const serialized = original.serialize();
                const deserialized = BTreeNode.deserialize(serialized, 1024);

                expect(deserialized.isLeaf).toBe(true);
                expect(deserialized.keys).toEqual([]);
                expect(deserialized.entries).toEqual([]);
                expect(deserialized.offset).toBe(1024);
            });

            test('should throw error on invalid serialization data', () => {
                const invalidData = new Uint8Array(5); // Too small

                expect(() => BTreeNode.deserialize(invalidData, 0)).toThrow();
            });

            test('should throw error on B-tree invariant violation during serialization', () => {
                const node = new BTreeNode(false);
                node.keys = ['a', 'b'];
                node.children = [100]; // Incorrect number of children

                expect(() => node.serialize()).toThrow();
            });

            test('should handle large keys without exceeding node size', () => {
                const node = new BTreeNode(true);
                const largeKey = 'x'.repeat(50);

                // Fill with entries that have reasonable key sizes
                for (let i = 0; i < 10; i++) {
                    node.insertEntry({
                        key: `${largeKey}_${i}`,
                        offset: i * 100,
                        length: 50,
                    });
                }

                expect(() => node.serialize()).not.toThrow();
            });
        });
    });

    describe('BTree High-Level Operations', () => {
        describe('Basic Insert and Find', () => {
            test('should insert and find single entry', () => {
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };

                btree.insert(entry);
                const found = btree.find('test');

                expect(found).toEqual(entry);
            });

            test('should return null for non-existent key', () => {
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };
                btree.insert(entry);

                const found = btree.find('nonexistent');
                expect(found).toBe(null);
            });

            test('should insert multiple entries', () => {
                const entries: BTreeEntry[] = [
                    { key: 'apple', offset: 100, length: 50 },
                    { key: 'banana', offset: 200, length: 60 },
                    { key: 'cherry', offset: 300, length: 70 },
                ];

                for (const entry of entries) {
                    btree.insert(entry);
                }

                for (const entry of entries) {
                    const found = btree.find(entry.key);
                    expect(found).toEqual(entry);
                }
            });

            test('should handle duplicate key insertion', () => {
                const entry1: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };
                const entry2: BTreeEntry = {
                    key: 'test',
                    offset: 200,
                    length: 60,
                };

                btree.insert(entry1);
                btree.insert(entry2);

                // Should find the first entry (BTree doesn't typically handle duplicates)
                const found = btree.find('test');
                expect(found?.key).toBe('test');
            });
        });

        describe('Tree Splitting and Growth', () => {
            test('should split root when it becomes full', () => {
                const entries: BTreeEntry[] = [];

                // Create more entries than can fit in a single node
                for (let i = 0; i < BTreeNode.MAX_KEYS + 5; i++) {
                    const key = String.fromCharCode(97 + i); // 'a', 'b', 'c', ...
                    entries.push({ key, offset: i * 100, length: 50 });
                }

                for (const entry of entries) {
                    btree.insert(entry);
                }

                // Verify all entries can still be found
                for (const entry of entries) {
                    const found = btree.find(entry.key);
                    expect(found).toEqual(entry);
                }
            });

            test('should handle deep tree creation', () => {
                const entries: BTreeEntry[] = [];

                // Create enough entries to force multiple levels
                for (let i = 0; i < 100; i++) {
                    const key = i.toString().padStart(3, '0');
                    entries.push({ key, offset: i * 100, length: 50 });
                }

                for (const entry of entries) {
                    btree.insert(entry);
                }

                // Verify all entries can still be found
                for (const entry of entries) {
                    const found = btree.find(entry.key);
                    expect(found).toEqual(entry);
                }
            });
        });

        describe('Bulk Operations', () => {
            test('should handle bulk insert', () => {
                const entries: BTreeEntry[] = [];

                for (let i = 0; i < 50; i++) {
                    const key = Math.random().toString(36).substring(7);
                    entries.push({ key, offset: i * 100, length: 50 });
                }

                btree.bulkInsert(entries);

                // Verify all entries can be found
                for (const entry of entries) {
                    const found = btree.find(entry.key);
                    expect(found).toEqual(entry);
                }
            });

            test('should handle empty bulk insert', () => {
                expect(() => btree.bulkInsert([])).not.toThrow();
                expect(btree.find('test')).toBe(null);
            });

            test('should handle single entry bulk insert', () => {
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };
                btree.bulkInsert([entry]);

                const found = btree.find('test');
                expect(found).toEqual(entry);
            });

            test('should sort entries during bulk insert', () => {
                const entries: BTreeEntry[] = [
                    { key: 'z', offset: 300, length: 50 },
                    { key: 'a', offset: 100, length: 50 },
                    { key: 'm', offset: 200, length: 50 },
                ];

                btree.bulkInsert(entries);

                const allEntries = btree.getAllEntries();
                expect(allEntries.map((e) => e.key)).toEqual(['a', 'm', 'z']);
            });
        });

        describe('Remove Operations', () => {
            test('should remove single entry', () => {
                const entries: BTreeEntry[] = [
                    { key: 'a', offset: 100, length: 50 },
                    { key: 'b', offset: 200, length: 50 },
                    { key: 'c', offset: 300, length: 50 },
                ];

                for (const entry of entries) {
                    btree.insert(entry);
                }

                expect(btree.remove('b')).toBe(true);
                expect(btree.find('b')).toBe(null);
                expect(btree.find('a')).not.toBe(null);
                expect(btree.find('c')).not.toBe(null);
            });

            test('should return false for non-existent key removal', () => {
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };
                btree.insert(entry);

                expect(btree.remove('nonexistent')).toBe(false);
                expect(btree.find('test')).toEqual(entry);
            });

            test('should handle bulk remove', () => {
                const entries: BTreeEntry[] = [];

                for (let i = 0; i < 20; i++) {
                    const key = i.toString().padStart(2, '0');
                    entries.push({ key, offset: i * 100, length: 50 });
                }

                for (const entry of entries) {
                    btree.insert(entry);
                }

                const keysToRemove = ['05', '10', '15'];
                const removedCount = btree.bulkRemove(keysToRemove);

                expect(removedCount).toBe(3);
                for (const key of keysToRemove) {
                    expect(btree.find(key)).toBe(null);
                }
            });

            test('should remove from empty tree', () => {
                expect(btree.remove('test')).toBe(false);
            });
        });

        describe('Get All Entries', () => {
            test('should return empty array for empty tree', () => {
                const entries = btree.getAllEntries();
                expect(entries).toEqual([]);
            });

            test('should return all entries in sorted order', () => {
                const entries: BTreeEntry[] = [
                    { key: 'c', offset: 300, length: 50 },
                    { key: 'a', offset: 100, length: 50 },
                    { key: 'b', offset: 200, length: 50 },
                ];

                for (const entry of entries) {
                    btree.insert(entry);
                }

                const allEntries = btree.getAllEntries();
                expect(allEntries).toHaveLength(3);
                expect(allEntries.map((e) => e.key)).toEqual(['a', 'b', 'c']);
            });

            test('should handle moderate number of entries', () => {
                const entries: BTreeEntry[] = [];

                for (let i = 0; i < 15; i++) {
                    // Reduced to stay below debug threshold
                    const key = i.toString().padStart(3, '0');
                    entries.push({ key, offset: i * 100, length: 50 });
                }

                btree.bulkInsert(entries);
                const allEntries = btree.getAllEntries();

                expect(allEntries).toHaveLength(15);
                // Should be in sorted order
                for (let i = 0; i < 14; i++) {
                    expect(
                        allEntries[i].key.localeCompare(allEntries[i + 1].key)
                    ).toBeLessThan(0);
                }
            });
        });

        describe('Cache Management', () => {
            test('should provide cache statistics', () => {
                const stats = btree.getCacheStats();

                expect(stats).toHaveProperty('cacheSize');
                expect(stats).toHaveProperty('maxCacheSize');
                expect(stats).toHaveProperty('freeNodeOffsetsCount');
                expect(typeof stats.cacheSize).toBe('number');
                expect(typeof stats.maxCacheSize).toBe('number');
                expect(typeof stats.freeNodeOffsetsCount).toBe('number');
            });

            test('should clear cache', () => {
                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };
                btree.insert(entry);

                btree.clearCache();
                const stats = btree.getCacheStats();
                expect(stats.cacheSize).toBe(0);

                // Should still be able to find entry after cache clear
                const found = btree.find('test');
                expect(found).toEqual(entry);
            });
        });

        describe('Offset Management', () => {
            test('should manage root offset', () => {
                expect(btree.getRootOffset()).toBe(-1);

                const entry: BTreeEntry = {
                    key: 'test',
                    offset: 100,
                    length: 50,
                };
                btree.insert(entry);

                expect(btree.getRootOffset()).not.toBe(-1);
            });

            test('should set and get next node offset', () => {
                const offset = 2048;
                btree.setNextNodeOffset(offset);
                expect(btree.getNextNodeOffset()).toBe(offset);
            });

            test('should set root offset', () => {
                const rootOffset = 1024;
                btree.setRootOffset(rootOffset);
                expect(btree.getRootOffset()).toBe(rootOffset);
            });
        });

        describe('Edge Cases and Error Handling', () => {
            test('should handle very long keys', () => {
                const longKey = 'x'.repeat(100);
                const entry: BTreeEntry = {
                    key: longKey,
                    offset: 100,
                    length: 50,
                };

                expect(() => btree.insert(entry)).not.toThrow();
                const found = btree.find(longKey);
                expect(found).toEqual(entry);
            });

            test('should handle keys with special characters', () => {
                const specialKeys = [
                    'key with spaces',
                    'key-with-dashes',
                    'key_with_underscores',
                    'key.with.dots',
                    'key/with/slashes',
                    '=�<�(',
                ];

                for (const key of specialKeys) {
                    const entry: BTreeEntry = { key, offset: 100, length: 50 };
                    btree.insert(entry);

                    const found = btree.find(key);
                    expect(found).toEqual(entry);
                }
            });

            test('should handle empty string key', () => {
                const entry: BTreeEntry = { key: '', offset: 100, length: 50 };
                btree.insert(entry);

                const found = btree.find('');
                expect(found).toEqual(entry);
            });

            test('should handle numeric string keys in order', () => {
                const keys = ['1', '10', '2', '20', '3'];
                const entries = keys.map((key, i) => ({
                    key,
                    offset: i * 100,
                    length: 50,
                }));

                for (const entry of entries) {
                    btree.insert(entry);
                }

                const allEntries = btree.getAllEntries();
                // Should be lexicographically sorted, not numerically
                expect(allEntries.map((e) => e.key)).toEqual([
                    '1',
                    '10',
                    '2',
                    '20',
                    '3',
                ]);
            });
        });

        describe('Persistence and State', () => {
            test('should persist data across tree operations', () => {
                const entries: BTreeEntry[] = [];

                for (let i = 0; i < 30; i++) {
                    const key = `key_${i.toString().padStart(3, '0')}`;
                    entries.push({ key, offset: i * 100, length: 50 });
                }

                // Insert all entries
                for (const entry of entries) {
                    btree.insert(entry);
                }

                // Remove some entries
                const removeKeys = ['key_005', 'key_015', 'key_025'];
                for (const key of removeKeys) {
                    btree.remove(key);
                }

                // Verify remaining entries
                for (const entry of entries) {
                    const found = btree.find(entry.key);
                    if (removeKeys.includes(entry.key)) {
                        expect(found).toBe(null);
                    } else {
                        expect(found).toEqual(entry);
                    }
                }
            });

            test('should handle tree rebuild with bulk load', () => {
                const entries: BTreeEntry[] = [];

                for (let i = 0; i < 30; i++) {
                    // Further reduced to avoid debug log spam
                    const key = `key_${i.toString().padStart(4, '0')}`;
                    entries.push({ key, offset: i * 100, length: 50 });
                }

                btree.bulkInsert(entries);

                // Verify a sample of entries after bulk load
                const sampleEntries = entries.filter((_, i) => i % 5 === 0); // Every 5th entry
                for (const entry of sampleEntries) {
                    const found = btree.find(entry.key);
                    expect(found).toEqual(entry);
                }
            });
        });

        describe('Performance and Stress Tests', () => {
            test('should handle many insertions efficiently', () => {
                const entries: BTreeEntry[] = [];

                for (let i = 0; i < 500; i++) {
                    const key = Math.random().toString(36).substring(2, 15);
                    entries.push({ key, offset: i * 100, length: 50 });
                }

                const start = performance.now();
                for (const entry of entries) {
                    btree.insert(entry);
                }
                const insertTime = performance.now() - start;

                // Verify all entries
                for (const entry of entries) {
                    const found = btree.find(entry.key);
                    expect(found).toEqual(entry);
                }

                // Basic performance assertion (should complete in reasonable time)
                expect(insertTime).toBeLessThan(5000); // 5 seconds
            });

            test('should handle mixed operations efficiently', () => {
                const entries: BTreeEntry[] = [];

                // Insert initial data
                for (let i = 0; i < 200; i++) {
                    const key = `initial_${i.toString().padStart(3, '0')}`;
                    entries.push({ key, offset: i * 100, length: 50 });
                    btree.insert(entries[entries.length - 1]);
                }

                // Mix of operations
                for (let i = 0; i < 100; i++) {
                    // Insert new entry
                    const newKey = `mixed_${i.toString().padStart(3, '0')}`;
                    const newEntry: BTreeEntry = {
                        key: newKey,
                        offset: (200 + i) * 100,
                        length: 50,
                    };
                    btree.insert(newEntry);
                    entries.push(newEntry);

                    // Remove an old entry
                    if (i < entries.length - 100) {
                        const keyToRemove = entries[i].key;
                        btree.remove(keyToRemove);
                        entries[i] = { key: 'REMOVED', offset: -1, length: -1 }; // Mark as removed
                    }

                    // Search for entries
                    const searchKey = `initial_${Math.floor(Math.random() * 200)
                        .toString()
                        .padStart(3, '0')}`;
                    btree.find(searchKey);
                }

                // Verify tree is still functional
                const allEntries = btree.getAllEntries();
                expect(allEntries.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Error Conditions', () => {
        test('should handle corrupted storage gracefully', () => {
            const entry: BTreeEntry = { key: 'test', offset: 100, length: 50 };
            btree.insert(entry);

            // Clear cache first to force reload from storage
            btree.clearCache();

            // Corrupt the storage
            storage.clear();

            expect(() => btree.find('test')).toThrow();
        });

        test('should handle invalid node data', () => {
            // Create a node and save it
            const entry: BTreeEntry = { key: 'test', offset: 100, length: 50 };
            btree.insert(entry);
            const rootOffset = btree.getRootOffset();

            // Clear cache first to force reload from storage
            btree.clearCache();

            // Corrupt the node data
            storage.set(rootOffset, new Uint8Array(10)); // Too small

            expect(() => btree.find('test')).toThrow();
        });

        test('should validate node alignment', () => {
            // This test ensures the BTree handles alignment correctly
            const entry: BTreeEntry = { key: 'test', offset: 100, length: 50 };
            btree.insert(entry);

            const rootOffset = btree.getRootOffset();
            expect(rootOffset % BTreeNode.NODE_SIZE).toBe(0);
        });
    });
});
