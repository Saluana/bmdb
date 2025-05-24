/**
 * Comprehensive B-Tree test suite
 * Tests all B-Tree operations including million record inserts/deletes
 */

import { BTree, BTreeNode, type BTreeEntry } from '../src/utils/BTree';
import { randomBytes } from 'crypto';
import { performance } from 'perf_hooks';

class MockStorage {
    private data = new Map<number, Uint8Array>();
    
    readNode = (offset: number): Uint8Array => {
        const data = this.data.get(offset);
        if (!data) {
            throw new Error(`No data at offset ${offset}`);
        }
        return data;
    };
    
    writeNode = (offset: number, data: Uint8Array): void => {
        this.data.set(offset, new Uint8Array(data));
    };
    
    clear(): void {
        this.data.clear();
    }
    
    getSize(): number {
        return this.data.size;
    }
}

interface TestResults {
    passed: number;
    failed: number;
    errors: string[];
}

class BTreeTester {
    private results: TestResults = { passed: 0, failed: 0, errors: [] };
    
    test(name: string, fn: () => void | Promise<void>): void {
        try {
            const result = fn();
            if (result instanceof Promise) {
                result.then(() => {
                    this.results.passed++;
                    console.log(`✅ ${name}`);
                }).catch((error) => {
                    this.results.failed++;
                    this.results.errors.push(`${name}: ${error.message}`);
                    console.log(`❌ ${name}: ${error.message}`);
                });
            } else {
                this.results.passed++;
                console.log(`✅ ${name}`);
            }
        } catch (error) {
            this.results.failed++;
            const message = error instanceof Error ? error.message : String(error);
            this.results.errors.push(`${name}: ${message}`);
            console.log(`❌ ${name}: ${message}`);
        }
    }
    
    assert(condition: boolean, message: string): void {
        if (!condition) {
            throw new Error(message);
        }
    }
    
    assertEqual<T>(actual: T, expected: T, message?: string): void {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, got ${actual}`);
        }
    }
    
    assertNotNull<T>(value: T | null, message?: string): void {
        if (value === null) {
            throw new Error(message || 'Expected non-null value');
        }
    }
    
    getResults(): TestResults {
        return { ...this.results };
    }
}

function generateRandomString(length: number = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function validateBTreeStructure(btree: BTree, storage: MockStorage, tester: BTreeTester): void {
    const rootOffset = btree.getRootOffset();
    if (rootOffset === -1) return; // Empty tree is valid
    
    const visited = new Set<number>();
    const validateNode = (offset: number, minKey?: string, maxKey?: string, expectedParent?: number): { height: number; keyCount: number } => {
        if (visited.has(offset)) {
            throw new Error(`Circular reference detected at offset ${offset}`);
        }
        visited.add(offset);
        
        const nodeData = storage.readNode(offset);
        const node = BTreeNode.deserialize(nodeData, offset);
        
        // Check parent pointer
        if (expectedParent !== undefined) {
            tester.assertEqual(node.parentOffset, expectedParent, `Node at ${offset} has wrong parent`);
        }
        
        // Check key count constraints
        if (offset !== rootOffset) {
            tester.assert(node.keys.length >= BTreeNode.MIN_KEYS, 
                `Node at ${offset} has too few keys: ${node.keys.length}`);
        }
        tester.assert(node.keys.length <= BTreeNode.MAX_KEYS, 
            `Node at ${offset} has too many keys: ${node.keys.length}`);
        
        // Check key ordering
        for (let i = 1; i < node.keys.length; i++) {
            tester.assert(node.keys[i-1].localeCompare(node.keys[i]) < 0, 
                `Keys not in order at node ${offset}: ${node.keys[i-1]} >= ${node.keys[i]}`);
        }
        
        // Check key bounds
        if (minKey !== undefined) {
            tester.assert(node.keys[0].localeCompare(minKey) >= 0, 
                `First key ${node.keys[0]} violates min bound ${minKey}`);
        }
        if (maxKey !== undefined) {
            tester.assert(node.keys[node.keys.length - 1].localeCompare(maxKey) <= 0, 
                `Last key ${node.keys[node.keys.length - 1]} violates max bound ${maxKey}`);
        }
        
        if (node.isLeaf) {
            // Leaf node validation
            tester.assertEqual(node.entries.length, node.keys.length, 
                `Leaf node at ${offset} has mismatched keys/entries count`);
            tester.assertEqual(node.children.length, 0, 
                `Leaf node at ${offset} should not have children`);
            
            return { height: 1, keyCount: node.keys.length };
        } else {
            // Internal node validation
            tester.assertEqual(node.children.length, node.keys.length + 1, 
                `Internal node at ${offset} has wrong number of children`);
            tester.assertEqual(node.entries.length, 0, 
                `Internal node at ${offset} should not have entries`);
            
            // Validate children
            let totalKeys = node.keys.length;
            let height = 0;
            
            for (let i = 0; i < node.children.length; i++) {
                const childOffset = node.children[i];
                const childMinKey = i === 0 ? minKey : node.keys[i - 1];
                const childMaxKey = i === node.keys.length ? maxKey : node.keys[i];
                
                const childResult = validateNode(childOffset, childMinKey, childMaxKey, offset);
                totalKeys += childResult.keyCount;
                
                if (height === 0) {
                    height = childResult.height + 1;
                } else {
                    tester.assertEqual(childResult.height + 1, height, 
                        `B-Tree not balanced: height mismatch at node ${offset}`);
                }
            }
            
            return { height, keyCount: totalKeys };
        }
    };
    
    validateNode(rootOffset);
}

async function runBasicTests(): Promise<TestResults> {
    console.log('\n🧪 Running Basic B-Tree Tests...\n');
    
    const tester = new BTreeTester();
    const storage = new MockStorage();
    
    tester.test('BTreeNode creation', () => {
        const node = new BTreeNode(true);
        tester.assertEqual(node.isLeaf, true);
        tester.assertEqual(node.keys.length, 0);
        tester.assertEqual(node.entries.length, 0);
        tester.assertEqual(node.children.length, 0);
    });
    
    tester.test('BTreeNode serialization/deserialization', () => {
        const node = new BTreeNode(true);
        node.keys = ['key1', 'key2', 'key3'];
        node.entries = [
            { key: 'key1', offset: 100, length: 20 },
            { key: 'key2', offset: 120, length: 30 },
            { key: 'key3', offset: 150, length: 25 }
        ];
        node.offset = 1024;
        node.parentOffset = 512;
        node.nextLeafOffset = 2048;
        
        const serialized = node.serialize();
        const deserialized = BTreeNode.deserialize(serialized, 1024);
        
        tester.assertEqual(deserialized.isLeaf, true);
        tester.assertEqual(deserialized.keys.length, 3);
        tester.assertEqual(deserialized.keys[0], 'key1');
        tester.assertEqual(deserialized.entries[0].offset, 100);
        tester.assertEqual(deserialized.parentOffset, 512);
        tester.assertEqual(deserialized.nextLeafOffset, 2048);
    });
    
    tester.test('BTree single insert', () => {
        storage.clear();
        const btree = new BTree(storage.readNode, storage.writeNode);
        
        const entry: BTreeEntry = { key: 'test1', offset: 100, length: 20 };
        btree.insert(entry);
        
        const found = btree.find('test1');
        tester.assertNotNull(found);
        tester.assertEqual(found!.offset, 100);
        tester.assertEqual(found!.length, 20);
    });
    
    tester.test('BTree multiple inserts (sequential)', () => {
        storage.clear();
        const btree = new BTree(storage.readNode, storage.writeNode);
        
        for (let i = 1; i <= 20; i++) {
            const key = `key${i.toString().padStart(3, '0')}`;
            btree.insert({ key, offset: i * 100, length: 20 });
        }
        
        // Verify all entries can be found
        for (let i = 1; i <= 20; i++) {
            const key = `key${i.toString().padStart(3, '0')}`;
            const found = btree.find(key);
            tester.assertNotNull(found, `Failed to find ${key}`);
            tester.assertEqual(found!.offset, i * 100);
        }
        
        validateBTreeStructure(btree, storage, tester);
    });
    
    tester.test('BTree multiple inserts (random order)', () => {
        storage.clear();
        const btree = new BTree(storage.readNode, storage.writeNode);
        
        const keys = [];
        for (let i = 1; i <= 50; i++) {
            keys.push(`key${i.toString().padStart(3, '0')}`);
        }
        
        // Shuffle keys
        for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        
        // Insert in random order
        keys.forEach((key, index) => {
            btree.insert({ key, offset: index * 100, length: 20 });
        });
        
        // Verify all entries can be found
        keys.forEach(key => {
            const found = btree.find(key);
            tester.assertNotNull(found, `Failed to find ${key}`);
        });
        
        validateBTreeStructure(btree, storage, tester);
    });
    
    tester.test('BTree deletions', () => {
        storage.clear();
        const btree = new BTree(storage.readNode, storage.writeNode);
        
        // Insert many entries to trigger splits
        for (let i = 1; i <= 100; i++) {
            const key = `key${i.toString().padStart(3, '0')}`;
            btree.insert({ key, offset: i * 100, length: 20 });
        }
        
        // Delete every other entry
        for (let i = 2; i <= 100; i += 2) {
            const key = `key${i.toString().padStart(3, '0')}`;
            const removed = btree.remove(key);
            tester.assertEqual(removed, true, `Failed to remove ${key}`);
        }
        
        // Verify remaining entries
        for (let i = 1; i <= 100; i++) {
            const key = `key${i.toString().padStart(3, '0')}`;
            const found = btree.find(key);
            
            if (i % 2 === 0) {
                tester.assertEqual(found, null, `${key} should have been deleted`);
            } else {
                tester.assertNotNull(found, `${key} should still exist`);
            }
        }
        
        validateBTreeStructure(btree, storage, tester);
    });
    
    tester.test('BTree getAllEntries ordering', () => {
        storage.clear();
        const btree = new BTree(storage.readNode, storage.writeNode);
        
        const keys = ['zebra', 'apple', 'banana', 'cat', 'dog'];
        keys.forEach((key, index) => {
            btree.insert({ key, offset: index * 100, length: 20 });
        });
        
        const allEntries = btree.getAllEntries();
        tester.assertEqual(allEntries.length, 5);
        
        // Should be in sorted order
        for (let i = 1; i < allEntries.length; i++) {
            tester.assert(allEntries[i-1].key.localeCompare(allEntries[i].key) <= 0, 
                `Entries not in sorted order: ${allEntries[i-1].key} > ${allEntries[i].key}`);
        }
    });
    
    return tester.getResults();
}

async function runStressTests(): Promise<TestResults> {
    console.log('\n💪 Running Stress Tests...\n');
    
    const tester = new BTreeTester();
    const storage = new MockStorage();
    
    tester.test('BTree stress test: 10K inserts', () => {
        storage.clear();
        const btree = new BTree(storage.readNode, storage.writeNode);
        
        const startTime = performance.now();
        const keys: string[] = [];
        
        // Insert 10K random entries
        for (let i = 0; i < 10000; i++) {
            const key = generateRandomString(12);
            keys.push(key);
            btree.insert({ key, offset: i * 100, length: 50 });
        }
        
        const insertTime = performance.now() - startTime;
        console.log(`  📊 Insert time for 10K entries: ${insertTime.toFixed(2)}ms`);
        
        // Verify all entries
        const verifyStart = performance.now();
        keys.forEach(key => {
            const found = btree.find(key);
            tester.assertNotNull(found, `Failed to find ${key}`);
        });
        
        const verifyTime = performance.now() - verifyStart;
        console.log(`  📊 Lookup time for 10K entries: ${verifyTime.toFixed(2)}ms`);
        
        validateBTreeStructure(btree, storage, tester);
        console.log(`  📊 B-Tree nodes created: ${storage.getSize()}`);
    });
    
    tester.test('BTree stress test: Random deletions', () => {
        storage.clear();
        const btree = new BTree(storage.readNode, storage.writeNode);
        
        const keys: string[] = [];
        
        // Insert 1K entries
        for (let i = 0; i < 1000; i++) {
            const key = `key${i.toString().padStart(4, '0')}`;
            keys.push(key);
            btree.insert({ key, offset: i * 100, length: 30 });
        }
        
        // Randomly delete half of them
        const toDelete = keys.slice(0, 500);
        const toKeep = keys.slice(500);
        
        // Shuffle deletion order
        for (let i = toDelete.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [toDelete[i], toDelete[j]] = [toDelete[j], toDelete[i]];
        }
        
        const deleteStart = performance.now();
        toDelete.forEach(key => {
            const removed = btree.remove(key);
            tester.assertEqual(removed, true, `Failed to remove ${key}`);
        });
        
        const deleteTime = performance.now() - deleteStart;
        console.log(`  📊 Delete time for 500 entries: ${deleteTime.toFixed(2)}ms`);
        
        // Verify remaining entries exist and deleted ones don't
        toKeep.forEach(key => {
            const found = btree.find(key);
            tester.assertNotNull(found, `${key} should still exist`);
        });
        
        toDelete.forEach(key => {
            const found = btree.find(key);
            tester.assertEqual(found, null, `${key} should have been deleted`);
        });
        
        validateBTreeStructure(btree, storage, tester);
    });
    
    return tester.getResults();
}

async function runMillionRecordTest(): Promise<TestResults> {
    console.log('\n🚀 Running Million Record Test...\n');
    
    const tester = new BTreeTester();
    const storage = new MockStorage();
    
    tester.test('Million record insert/delete test', () => {
        storage.clear();
        const btree = new BTree(storage.readNode, storage.writeNode);
        
        console.log('  📝 Generating 1M unique keys...');
        const keys = new Set<string>();
        while (keys.size < 1000000) {
            keys.add(generateRandomString(16));
        }
        const keyArray = Array.from(keys);
        
        console.log('  📈 Inserting 1M records...');
        const insertStart = performance.now();
        
        keyArray.forEach((key, index) => {
            btree.insert({ key, offset: index * 100, length: 64 });
            
            if ((index + 1) % 100000 === 0) {
                console.log(`    Inserted ${index + 1}/1M records`);
            }
        });
        
        const insertTime = performance.now() - insertStart;
        console.log(`  📊 Total insert time: ${(insertTime / 1000).toFixed(2)}s`);
        console.log(`  📊 Insert rate: ${(1000000 / (insertTime / 1000)).toFixed(0)} ops/sec`);
        console.log(`  📊 B-Tree nodes created: ${storage.getSize()}`);
        
        // Sample verification (check every 10000th key)
        console.log('  🔍 Verifying sample of records...');
        const verifyStart = performance.now();
        let verifyCount = 0;
        
        for (let i = 0; i < keyArray.length; i += 10000) {
            const key = keyArray[i];
            const found = btree.find(key);
            tester.assertNotNull(found, `Failed to find sample key ${key}`);
            verifyCount++;
        }
        
        const verifyTime = performance.now() - verifyStart;
        console.log(`  📊 Verified ${verifyCount} sample records in ${verifyTime.toFixed(2)}ms`);
        
        // Random deletion test
        console.log('  🗑️ Deleting 100K random records...');
        const deleteStart = performance.now();
        const deleteKeys = keyArray.slice(0, 100000);
        
        // Shuffle delete order
        for (let i = deleteKeys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deleteKeys[i], deleteKeys[j]] = [deleteKeys[j], deleteKeys[i]];
        }
        
        deleteKeys.forEach((key, index) => {
            const removed = btree.remove(key);
            tester.assertEqual(removed, true, `Failed to remove ${key}`);
            
            if ((index + 1) % 10000 === 0) {
                console.log(`    Deleted ${index + 1}/100K records`);
            }
        });
        
        const deleteTime = performance.now() - deleteStart;
        console.log(`  📊 Delete time: ${(deleteTime / 1000).toFixed(2)}s`);
        console.log(`  📊 Delete rate: ${(100000 / (deleteTime / 1000)).toFixed(0)} ops/sec`);
        
        // Verify deletions
        console.log('  ✅ Verifying deletions...');
        const remainingKeys = keyArray.slice(100000);
        
        // Sample check deleted keys
        for (let i = 0; i < 1000; i++) {
            const key = deleteKeys[i];
            const found = btree.find(key);
            tester.assertEqual(found, null, `${key} should have been deleted`);
        }
        
        // Sample check remaining keys
        for (let i = 0; i < 1000; i++) {
            const key = remainingKeys[i];
            const found = btree.find(key);
            tester.assertNotNull(found, `${key} should still exist`);
        }
        
        console.log('  🏁 Million record test completed successfully!');
    });
    
    return tester.getResults();
}

async function runBinaryStorageIntegrationTest(): Promise<TestResults> {
    console.log('\n🔗 Running Binary Storage Integration Test...\n');
    
    const tester = new BTreeTester();
    
    tester.test('BinaryStorage with B-Tree integration', async () => {
        const { BinaryStorage } = await import('../src/storage/BinaryStorage');
        const testPath = './test-btree-integration.bmdb';
        
        // Clean up any existing test file
        try {
            const fs = await import('fs');
            if (fs.existsSync(testPath)) {
                fs.unlinkSync(testPath);
            }
        } catch (e) {
            // Ignore
        }
        
        const storage = new BinaryStorage(testPath);
        
        try {
            // Test document operations
            await storage.writeDocument('users', 'user1', { name: 'Alice', age: 30 });
            await storage.writeDocument('users', 'user2', { name: 'Bob', age: 25 });
            await storage.writeDocument('posts', 'post1', { title: 'Hello World', content: 'First post!' });
            
            // Test retrieval
            const user1 = await storage.readDocument('users', 'user1');
            tester.assertNotNull(user1);
            tester.assertEqual(user1.name, 'Alice');
            
            const post1 = await storage.readDocument('posts', 'post1');
            tester.assertNotNull(post1);
            tester.assertEqual(post1.title, 'Hello World');
            
            // Test removal
            const removed = await storage.removeDocument('users', 'user1');
            tester.assertEqual(removed, true);
            
            const user1After = await storage.readDocument('users', 'user1');
            tester.assertEqual(user1After, null);
            
            // Test full read
            const allData = storage.read();
            tester.assertNotNull(allData);
            tester.assertNotNull(allData!.users);
            tester.assertNotNull(allData!.posts);
            
            console.log('  📊 Storage stats:', storage.getStats());
            
        } finally {
            storage.close();
            
            // Clean up test file
            try {
                const fs = await import('fs');
                if (fs.existsSync(testPath)) {
                    fs.unlinkSync(testPath);
                }
            } catch (e) {
                // Ignore
            }
        }
    });
    
    return tester.getResults();
}

async function main(): Promise<void> {
    console.log('🌟 B-Tree Comprehensive Test Suite\n');
    
    const results: TestResults[] = [];
    
    try {
        results.push(await runBasicTests());
        results.push(await runStressTests());
        results.push(await runMillionRecordTest());
        results.push(await runBinaryStorageIntegrationTest());
        
        // Calculate totals
        const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
        const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
        const allErrors = results.flatMap(r => r.errors);
        
        console.log('\n📊 Test Summary:');
        console.log(`✅ Passed: ${totalPassed}`);
        console.log(`❌ Failed: ${totalFailed}`);
        console.log(`📈 Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);
        
        if (allErrors.length > 0) {
            console.log('\n❌ Errors:');
            allErrors.forEach(error => console.log(`  ${error}`));
        }
        
        if (totalFailed === 0) {
            console.log('\n🎉 All tests passed! B-Tree implementation is working correctly.');
        } else {
            console.log('\n⚠️ Some tests failed. Check the errors above.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('💥 Test suite crashed:', error);
        process.exit(1);
    }
}

// Auto-run tests
main();

export { runBasicTests, runStressTests, runMillionRecordTest, runBinaryStorageIntegrationTest };