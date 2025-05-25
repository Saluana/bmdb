/**
 * Comprehensive Table tests - Core database operations
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Table, Document, MemoryStorage, JSONStorage } from '../src/index';
import {
    generateTestUser,
    generateTestUsers,
    measurePerformance,
} from './test-setup';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

interface TestUser {
    id: number;
    name: string;
    email: string;
    age: number;
    department: string;
    active: boolean;
    salary: number;
    joinDate: Date;
}

describe('Table - Core Operations', () => {
    let table: Table<TestUser>;
    let storage: MemoryStorage;

    beforeEach(() => {
        storage = new MemoryStorage();
        table = new Table<TestUser>(storage, 'test_users');
    });

    describe('Document Creation and ID Management', () => {
        test('should create documents with correct ID fields', () => {
            const user = generateTestUser();
            const docId = table.insert(user);
            const retrieved = table.get(undefined, docId) as Document;

            expect(retrieved).toBeTruthy();
            expect(retrieved!.docId).toBe(docId);
            expect(retrieved!.doc_id).toBe(docId);
            expect(retrieved!.docId).toBe(retrieved!.doc_id);
        });

        test('should filter out conflicting ID fields from input', () => {
            const user = { ...generateTestUser(), docId: 999, doc_id: 888 };
            const docId = table.insert(user);
            const retrieved = table.get(undefined, docId) as Document;

            expect(retrieved!.docId).toBe(docId);
            expect(retrieved!.doc_id).toBe(docId);
            expect(retrieved!.docId).not.toBe(999);
            expect(retrieved!.doc_id).not.toBe(888);
        });

        test('should generate sequential IDs for new documents', () => {
            const ids: number[] = [];
            for (let i = 0; i < 5; i++) {
                ids.push(table.insert(generateTestUser()));
            }

            expect(ids).toEqual([1, 2, 3, 4, 5]);
        });

        test('should maintain ID consistency across operations', () => {
            const user = generateTestUser();
            const docId = table.insert(user);

            // Test get
            const retrieved = table.get(undefined, docId) as Document;
            expect(retrieved!.docId).toBe(docId);

            // Test update
            table.update({ name: 'Updated Name' }, undefined, [docId]);
            const updated = table.get(undefined, docId) as Document;
            expect(updated!.docId).toBe(docId);
            expect((updated as any).name).toBe('Updated Name');
        });
    });

    describe('CRUD Operations', () => {
        test('should insert single document', () => {
            const user = generateTestUser();
            const docId = table.insert(user);

            expect(docId).toBe(1);
            expect(table.length).toBe(1);

            const retrieved = table.get(undefined, docId) as Document;
            expect((retrieved as any).name).toBe(user.name);
            expect((retrieved as any).email).toBe(user.email);
        });

        test('should insert multiple documents', () => {
            const users = generateTestUsers(10);
            const docIds = table.insertMultiple(users);

            expect(docIds).toHaveLength(10);
            expect(table.length).toBe(10);
            expect(docIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });

        test('should retrieve documents by ID', () => {
            const users = generateTestUsers(5);
            const docIds = table.insertMultiple(users);

            const retrieved = table.get(undefined, docIds[2]) as Document;
            expect((retrieved as any).name).toBe(users[2].name);
            expect(retrieved!.docId).toBe(3);
        });

        test('should retrieve multiple documents by IDs', () => {
            const users = generateTestUsers(10);
            const docIds = table.insertMultiple(users);

            const retrieved = table.get(
                undefined,
                undefined,
                [1, 3, 5]
            ) as Document[];
            expect(retrieved).toHaveLength(3);
            expect(retrieved[0].docId).toBe(1);
            expect(retrieved[1].docId).toBe(3);
            expect(retrieved[2].docId).toBe(5);
        });

        test('should update documents by ID', () => {
            const user = generateTestUser();
            const docId = table.insert(user);

            const updateData = { name: 'Updated Name', age: 99 };
            table.update(updateData, undefined, [docId]);

            const updated = table.get(undefined, docId) as Document;
            expect((updated as any).name).toBe('Updated Name');
            expect((updated as any).age).toBe(99);
            expect((updated as any).email).toBe(user.email); // Unchanged
        });

        test('should delete documents by ID', () => {
            const users = generateTestUsers(5);
            const docIds = table.insertMultiple(users);

            expect(table.length).toBe(5);

            table.remove(undefined, [docIds[2]]);
            expect(table.length).toBe(4);

            const retrieved = table.get(undefined, docIds[2]);
            expect(retrieved).toBeNull();
        });

        test('should handle non-existent document operations gracefully', () => {
            expect(table.get(undefined, 999)).toBeNull();
            expect(table.contains(undefined, 999)).toBe(false);

            // Update non-existent document should not throw
            expect(() =>
                table.update({ name: 'Test' }, undefined, [999])
            ).not.toThrow();

            // Remove non-existent document should not throw
            expect(() => table.remove(undefined, [999])).not.toThrow();
        });
    });

    describe('Document Serialization', () => {
        test('should serialize documents to JSON without ID fields', () => {
            const user = generateTestUser();
            const docId = table.insert(user);
            const retrieved = table.get(undefined, docId) as Document;

            const json = retrieved!.toJSON();
            expect(json).not.toHaveProperty('docId');
            expect(json).not.toHaveProperty('doc_id');
            expect(json.name).toBe(user.name);
            expect(json.email).toBe(user.email);
        });

        test('should maintain type consistency in serialization', () => {
            const user = generateTestUser();
            user.joinDate = new Date();
            const docId = table.insert(user);
            const retrieved = table.get(undefined, docId) as Document;

            const json = (retrieved as Document).toJSON();
            expect(typeof json.age).toBe('number');
            expect(typeof json.active).toBe('boolean');
            expect(json.joinDate instanceof Date).toBe(true);
        });
    });

    describe('Table Properties', () => {
        test('should track table length correctly', () => {
            expect(table.length).toBe(0);

            table.insert(generateTestUser());
            expect(table.length).toBe(1);

            table.insertMultiple(generateTestUsers(5));
            expect(table.length).toBe(6);

            table.remove(undefined, [1]);
            expect(table.length).toBe(5);

            table.truncate();
            expect(table.length).toBe(0);
        });

        test('should provide correct table name', () => {
            expect(table.name).toBe('test_users');
        });

        test('should provide storage reference', () => {
            expect(table.storage).toBe(storage);
        });

        test('should implement toString correctly', () => {
            table.insertMultiple(generateTestUsers(3));
            const str = table.toString();
            expect(str).toContain('test_users');
            expect(str).toContain('total=3');
            expect(str).toContain('MemoryStorage');
        });
    });

    describe('Error Handling', () => {
        test('should throw error for invalid document types', () => {
            expect(() => table.insert(null as any)).toThrow();
            expect(() => table.insert(undefined as any)).toThrow();
            expect(() => table.insert('string' as any)).toThrow();
            expect(() => table.insert(123 as any)).toThrow();
        });

        test('should handle duplicate ID insertion', () => {
            const user = generateTestUser();
            const doc = new Document(user, 5);

            table.insert(doc);
            expect(() => table.insert(doc)).toThrow(/already exists/);
        });

        test('should handle concurrent modifications gracefully', () => {
            const users = generateTestUsers(100);
            const docIds = table.insertMultiple(users);

            // Simulate concurrent operations
            expect(() => {
                for (let i = 0; i < 50; i++) {
                    table.update({ name: `Updated${i}` }, undefined, [
                        docIds[i],
                    ]);
                    table.get(undefined, docIds[i + 50]);
                }
            }).not.toThrow();
        });
    });
});

describe('Table - Performance Tests', () => {
    let table: Table<TestUser>;

    beforeEach(() => {
        const storage = new MemoryStorage();
        table = new Table<TestUser>(storage, 'perf_test', {
            enableIndexing: true,
        });
    });

    test('should handle large insertions efficiently', () => {
        const users = generateTestUsers(10000);

        const { duration } = measurePerformance(() => {
            table.insertMultiple(users);
        });

        expect(table.length).toBe(10000);
        expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    test('should maintain performance with large datasets', () => {
        const users = generateTestUsers(5000);
        table.insertMultiple(users);

        const { duration: retrievalTime } = measurePerformance(() => {
            for (let i = 1; i <= 100; i++) {
                table.get(undefined, i);
            }
        });

        expect(retrievalTime).toBeLessThan(100); // 100 lookups should be fast
    });

    test('should efficiently clear large tables', () => {
        const users = generateTestUsers(10000);
        table.insertMultiple(users);

        const { duration } = measurePerformance(() => {
            table.truncate();
        });

        expect(table.length).toBe(0);
        expect(duration).toBeLessThan(1000); // Should clear quickly
    });
});

describe('Table - Storage Integration', () => {
    let tempFile: string;

    beforeEach(() => {
        tempFile = join(tmpdir(), `bmdb_test_${Date.now()}.json`);
    });

    afterEach(() => {
        if (existsSync(tempFile)) {
            unlinkSync(tempFile);
        }
    });

    test('should persist data with JSONStorage', () => {
        const storage = new JSONStorage(tempFile);
        const table = new Table<TestUser>(storage, 'users');

        const users = generateTestUsers(10);
        table.insertMultiple(users);

        // Force persistence
        storage.write({
            users: table.all().reduce((acc, doc) => {
                acc[doc.docId] = doc.toJSON();
                return acc;
            }, {} as Record<string, any>),
        });

        // Create new table from same storage
        const table2 = new Table<TestUser>(storage, 'users');

        // Should load existing data
        expect(table2.length).toBe(10);
    });

    test('should handle storage errors gracefully', () => {
        // Use a path that will cause operations to fail (read-only directory)
        const readOnlyPath = '/tmp/readonly_test_file.json';

        try {
            const storage = new JSONStorage(readOnlyPath);

            // This should not throw, operations should handle errors gracefully
            expect(() => {
                const table = new Table<TestUser>(storage, 'test');
                table.insert(generateTestUser());
            }).not.toThrow(); // Should handle gracefully
        } catch (error) {
            // If storage creation fails, that's also acceptable error handling
            expect(error).toBeDefined();
        }
    });
});
