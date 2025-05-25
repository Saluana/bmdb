/**
 * Comprehensive Schema tests - SchemaTable, validation, relationships
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import {
    SchemaTable,
    BmDbSchema,
    createSchema,
    MemoryStorage,
    unique,
    primaryKey,
    field,
    BmDbValidationError,
    BmDbUniqueConstraintError,
} from '../src/index';
import { generateRandomString, generateRandomNumber } from './test-setup';
import { z } from 'zod';

describe('Schema Definition', () => {
    test('should create basic schema', () => {
        const UserSchema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                email: unique(z.string().email()),
                age: field(z.number().min(0)),
            })
        );

        expect(UserSchema).toBeTruthy();
        expect(typeof UserSchema).toBe('object');
    });

    test('should validate schema field types', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                email: unique(z.string().email()),
                age: field(z.number().min(0)),
                active: field(z.boolean()),
            })
        );

        const validData = {
            id: 1,
            name: 'Alice',
            email: 'alice@test.com',
            age: 25,
            active: true,
        };

        expect(() => schema.validate(validData)).not.toThrow();
    });

    test('should reject invalid schema data', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                email: unique(z.string().email()),
            })
        );

        expect(() => {
            schema.validate({
                id: 1,
                name: 'Alice',
                // Missing required email field
            });
        }).toThrow(BmDbValidationError);
    });

    test('should handle nested schema validation', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                profile: field(
                    z.object({
                        name: z.string(),
                        bio: z.string(),
                    })
                ),
                settings: field(
                    z.object({
                        theme: z.string(),
                        notifications: z.boolean(),
                    })
                ),
            })
        );

        const validData = {
            id: 1,
            profile: {
                name: 'Alice',
                bio: 'Software Engineer',
            },
            settings: {
                theme: 'dark',
                notifications: true,
            },
        };

        expect(() => schema.validate(validData)).not.toThrow();
    });

    test('should support optional fields', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                bio: field(z.string().optional()),
            })
        );

        const dataWithoutBio = {
            id: 1,
            name: 'Alice',
        };

        const dataWithBio = {
            id: 1,
            name: 'Alice',
            bio: 'Software Engineer',
        };

        expect(() => schema.validate(dataWithoutBio)).not.toThrow();
        expect(() => schema.validate(dataWithBio)).not.toThrow();
    });
});

describe('SchemaTable - Basic Operations', () => {
    interface User {
        id: number;
        name: string;
        email: string;
        age: number;
        department: string;
        active: boolean;
    }

    let table: SchemaTable<User>;
    let UserSchema: BmDbSchema<User>;

    beforeEach(() => {
        UserSchema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                email: unique(z.string().email()),
                age: field(z.number().min(0)),
                department: field(z.string()),
                active: field(z.boolean()),
            })
        );

        const storage = new MemoryStorage();
        table = new SchemaTable<User>(storage, UserSchema);
    });

    describe('Insert Operations', () => {
        test('should insert valid documents', () => {
            const user: User = {
                id: 1,
                name: 'Alice',
                email: 'alice@test.com',
                age: 25,
                department: 'Engineering',
                active: true,
            };

            const docId = table.insert(user);
            expect(docId).toBe(1);
            expect(table.length).toBe(1);
        });

        test('should reject invalid documents', () => {
            const invalidUser = {
                id: 1,
                name: 'Alice',
                // Missing required fields
            };

            expect(() => {
                table.insert(invalidUser as any);
            }).toThrow(BmDbValidationError);
        });

        test('should enforce unique constraints', () => {
            const user1: User = {
                id: 1,
                name: 'Alice',
                email: 'alice@test.com',
                age: 25,
                department: 'Engineering',
                active: true,
            };

            const user2: User = {
                id: 2,
                name: 'Bob',
                email: 'alice@test.com', // Duplicate email
                age: 30,
                department: 'Marketing',
                active: true,
            };

            table.insert(user1);

            expect(() => {
                table.insert(user2);
            }).toThrow(BmDbUniqueConstraintError);
        });

        test('should enforce primary key constraints', () => {
            const user1: User = {
                id: 1,
                name: 'Alice',
                email: 'alice@test.com',
                age: 25,
                department: 'Engineering',
                active: true,
            };

            const user2: User = {
                id: 1, // Duplicate primary key
                name: 'Bob',
                email: 'bob@test.com',
                age: 30,
                department: 'Marketing',
                active: true,
            };

            table.insert(user1);

            expect(() => {
                table.insert(user2);
            }).toThrow(BmDbUniqueConstraintError);
        });

        test('should insert multiple valid documents', () => {
            const users: User[] = [
                {
                    id: 1,
                    name: 'Alice',
                    email: 'alice@test.com',
                    age: 25,
                    department: 'Engineering',
                    active: true,
                },
                {
                    id: 2,
                    name: 'Bob',
                    email: 'bob@test.com',
                    age: 30,
                    department: 'Marketing',
                    active: true,
                },
                {
                    id: 3,
                    name: 'Charlie',
                    email: 'charlie@test.com',
                    age: 35,
                    department: 'Sales',
                    active: false,
                },
            ];

            const docIds = table.insertMultiple(users);
            expect(docIds).toEqual([1, 2, 3]);
            expect(table.length).toBe(3);
        });

        test('should reject batch insert if any document is invalid', () => {
            const users = [
                {
                    id: 1,
                    name: 'Alice',
                    email: 'alice@test.com',
                    age: 25,
                    department: 'Engineering',
                    active: true,
                },
                {
                    id: 2,
                    name: 'Bob',
                    email: 'bob@test.com',
                    age: 30,
                    department: 'Marketing',
                    active: true,
                },
                {
                    id: 3,
                    email: 'charlie@test.com',
                    age: 35,
                    department: 'Sales',
                    active: false,
                }, // Missing name
            ];

            expect(() => {
                table.insertMultiple(users as any);
            }).toThrow(BmDbValidationError);

            expect(table.length).toBe(0); // No documents should be inserted
        });
    });

    describe('Update Operations', () => {
        beforeEach(() => {
            const users: User[] = [
                {
                    id: 1,
                    name: 'Alice',
                    email: 'alice@test.com',
                    age: 25,
                    department: 'Engineering',
                    active: true,
                },
                {
                    id: 2,
                    name: 'Bob',
                    email: 'bob@test.com',
                    age: 30,
                    department: 'Marketing',
                    active: true,
                },
            ];
            table.insertMultiple(users);
        });

        test('should update valid documents', () => {
            table.update(
                { age: 26, department: 'Senior Engineering' },
                undefined,
                [1]
            );

            const updated = table.get(undefined, 1) as any;
            expect(updated.age).toBe(26);
            expect(updated.department).toBe('Senior Engineering');
            expect(updated.name).toBe('Alice'); // Unchanged
        });

        test('should validate updates', () => {
            expect(() => {
                table.update({ age: 'not a number' } as any, undefined, [1]);
            }).toThrow(BmDbValidationError);
        });

        test('should enforce unique constraints on updates', () => {
            expect(() => {
                table.update({ email: 'bob@test.com' }, undefined, [1]); // Trying to use Bob's email
            }).toThrow(BmDbUniqueConstraintError);
        });

        test('should allow valid unique value updates', () => {
            table.update({ email: 'alice.updated@test.com' }, undefined, [1]);

            const updated = table.get(undefined, 1) as any;
            expect(updated.email).toBe('alice.updated@test.com');
        });

        test('should handle partial updates', () => {
            table.update({ age: 26 }, undefined, [1]);

            const updated = table.get(undefined, 1) as any;
            expect(updated.age).toBe(26);
            expect(updated.name).toBe('Alice');
            expect(updated.email).toBe('alice@test.com');
        });
    });

    describe('Validation Edge Cases', () => {
        test('should handle null and undefined values', () => {
            const schema = createSchema(
                z.object({
                    id: primaryKey(z.number()),
                    name: field(z.string()),
                    optional: field(z.any().optional()),
                })
            );

            const table = new SchemaTable(new MemoryStorage(), schema, 'test');

            expect(() => {
                table.insert({ id: 1, name: 'Alice', optional: null });
            }).not.toThrow();

            expect(() => {
                table.insert({ id: 2, name: 'Bob', optional: undefined });
            }).not.toThrow();
        });

        test('should handle complex data types', () => {
            const schema = createSchema(
                z.object({
                    id: primaryKey(z.number()),
                    data: field(z.any()),
                    tags: field(z.array(z.string())),
                    metadata: field(z.any()),
                })
            );

            const table = new SchemaTable(
                new MemoryStorage(),
                schema,
                'complex'
            );

            const complexDoc = {
                id: 1,
                data: { nested: { deeply: { value: 'test' } } },
                tags: ['tag1', 'tag2', 'tag3'],
                metadata: {
                    created: new Date(),
                    numbers: [1, 2, 3, 4, 5],
                    config: { enabled: true, settings: { theme: 'dark' } },
                },
            };

            expect(() => {
                table.insert(complexDoc);
            }).not.toThrow();

            const retrieved = table.get(undefined, 1);
            expect((retrieved as any).data).toEqual(complexDoc.data);
            expect((retrieved as any).tags).toEqual(complexDoc.tags);
        });

        test('should handle very large documents', () => {
            const schema = createSchema(
                z.object({
                    id: primaryKey(z.number()),
                    largeData: field(z.any()),
                })
            );

            const table = new SchemaTable(new MemoryStorage(), schema, 'large');

            const largeArray = Array.from({ length: 10000 }, (_, i) => ({
                id: i,
                value: generateRandomString(100),
            }));

            const largeDoc = {
                id: 1,
                largeData: largeArray,
            };

            expect(() => {
                table.insert(largeDoc);
            }).not.toThrow();

            const retrieved = table.get(undefined, 1);
            expect((retrieved as any).largeData).toHaveLength(10000);
        });
    });
});

describe('Schema Relationships', () => {
    interface User {
        id: number;
        name: string;
        email: string;
    }

    interface Post {
        id: number;
        title: string;
        content: string;
        authorId: number;
    }

    interface Comment {
        id: number;
        content: string;
        postId: number;
        authorId: number;
    }

    let db: any;
    let userTable: SchemaTable<User>;
    let postTable: SchemaTable<Post>;
    let commentTable: SchemaTable<Comment>;

    beforeEach(() => {
        // Import TinyDB dynamically to avoid circular dependency issues
        const { TinyDB } = require('../src/index');

        const storage = new MemoryStorage();
        db = new TinyDB(storage);

        const UserSchema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                email: unique(z.string().email()),
            }),
            'users'
        );

        const PostSchema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                title: field(z.string()),
                content: field(z.string()),
                authorId: field(z.number()),
            }),
            'posts'
        );

        const CommentSchema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                content: field(z.string()),
                postId: field(z.number()),
                authorId: field(z.number()),
            }),
            'comments'
        );

        userTable = db.schemaTable(UserSchema);
        postTable = db.schemaTable(PostSchema);
        commentTable = db.schemaTable(CommentSchema);

        // Set up relationships
        userTable.hasMany('id', 'posts', 'authorId', true);
        userTable.hasMany('id', 'comments', 'authorId', true);
        postTable.hasMany('id', 'comments', 'postId', true);
    });

    test('should establish relationships between tables', () => {
        // Insert test data
        const userId = userTable.insert({
            id: 1,
            name: 'Alice',
            email: 'alice@test.com',
        });
        const postId = postTable.insert({
            id: 1,
            title: 'Hello World',
            content: 'First post',
            authorId: userId,
        });
        const commentId = commentTable.insert({
            id: 1,
            content: 'Great post!',
            postId: postId,
            authorId: userId,
        });

        expect(userId).toBe(1);
        expect(postId).toBe(1);
        expect(commentId).toBe(1);
    });

    test('should find related documents', () => {
        // Insert test data
        const userId = userTable.insert({
            id: 1,
            name: 'Alice',
            email: 'alice@test.com',
        });
        const postId1 = postTable.insert({
            id: 1,
            title: 'Post 1',
            content: 'Content 1',
            authorId: userId,
        });
        const postId2 = postTable.insert({
            id: 2,
            title: 'Post 2',
            content: 'Content 2',
            authorId: userId,
        });

        const userPosts = userTable.findChildren(userId, 'posts');
        expect(userPosts).toHaveLength(2);
        expect(userPosts.map((p) => p.title)).toEqual(['Post 1', 'Post 2']);
    });

    test('should handle cascade deletes', () => {
        // Insert test data
        const userId = userTable.insert({
            id: 1,
            name: 'Alice',
            email: 'alice@test.com',
        });
        const postId = postTable.insert({
            id: 1,
            title: 'Post 1',
            content: 'Content 1',
            authorId: userId,
        });
        const commentId = commentTable.insert({
            id: 1,
            content: 'Comment 1',
            postId: postId,
            authorId: userId,
        });

        expect(userTable.length).toBe(1);
        expect(postTable.length).toBe(1);
        expect(commentTable.length).toBe(1);

        // Delete user should cascade to posts and comments
        userTable.remove(undefined, [userId]);

        expect(userTable.length).toBe(0);
        expect(postTable.length).toBe(0); // Should be deleted by cascade
        expect(commentTable.length).toBe(0); // Should be deleted by cascade
    });

    test('should validate relationships', () => {
        const userId = userTable.insert({
            id: 1,
            name: 'Alice',
            email: 'alice@test.com',
        });

        // This should work - valid relationship
        expect(() => {
            postTable.insert({
                id: 1,
                title: 'Post 1',
                content: 'Content 1',
                authorId: userId,
            });
        }).not.toThrow();

        // This should fail - invalid relationship
        expect(() => {
            postTable.insert({
                id: 2,
                title: 'Post 2',
                content: 'Content 2',
                authorId: 999,
            });
        }).toThrow(); // Non-existent user ID
    });

    test('should handle complex relationship chains', () => {
        // Create a chain: User -> Post -> Comment
        const userId = userTable.insert({
            id: 1,
            name: 'Alice',
            email: 'alice@test.com',
        });
        const postId = postTable.insert({
            id: 1,
            title: 'Post 1',
            content: 'Content 1',
            authorId: userId,
        });

        // Multiple comments on the same post
        commentTable.insert({
            id: 1,
            content: 'Comment 1',
            postId: postId,
            authorId: userId,
        });
        commentTable.insert({
            id: 2,
            content: 'Comment 2',
            postId: postId,
            authorId: userId,
        });
        commentTable.insert({
            id: 3,
            content: 'Comment 3',
            postId: postId,
            authorId: userId,
        });

        const postComments = postTable.findChildren(postId, 'comments');
        expect(postComments).toHaveLength(3);

        // Delete post should cascade to comments
        postTable.remove(undefined, [postId]);
        expect(commentTable.length).toBe(0);
    });
});

describe('Schema Performance', () => {
    interface TestDoc {
        id: number;
        name: string;
        email: string;
        data?: any; // Make data optional to match the schema
    }

    let table: SchemaTable<TestDoc>;

    beforeEach(() => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                email: unique(z.string().email()),
                data: field(z.any().optional()),
            })
        );

        const storage = new MemoryStorage();
        table = new SchemaTable<TestDoc>(storage, schema);
    });

    test('should handle large batch inserts efficiently', () => {
        const docs: TestDoc[] = [];
        for (let i = 0; i < 5000; i++) {
            docs.push({
                id: i,
                name: `User ${i}`,
                email: `user${i}@test.com`,
                data: { index: i, random: generateRandomString(20) },
            });
        }

        const start = performance.now();
        table.insertMultiple(docs);
        const duration = performance.now() - start;

        expect(table.length).toBe(5000);
        expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds
    });

    test('should maintain validation performance', () => {
        // Pre-populate with data
        const docs: TestDoc[] = [];
        for (let i = 0; i < 1000; i++) {
            docs.push({
                id: i,
                name: `User ${i}`,
                email: `user${i}@test.com`,
                data: { index: i },
            });
        }
        table.insertMultiple(docs);

        // Test validation performance on updates
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            table.update({ name: `Updated User ${i}` }, i);
        }
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(1000); // Should be fast
    });

    test('should handle unique constraint checking efficiently', () => {
        // Pre-populate with data
        const docs: TestDoc[] = [];
        for (let i = 0; i < 2000; i++) {
            docs.push({
                id: i,
                name: `User ${i}`,
                email: `user${i}@test.com`,
                data: { index: i },
            });
        }
        table.insertMultiple(docs);

        // Test unique constraint performance
        const start = performance.now();

        let violations = 0;
        for (let i = 0; i < 100; i++) {
            try {
                table.insert({
                    id: 10000 + i,
                    name: `New User ${i}`,
                    email: `user${i}@test.com`, // Duplicate email
                    data: { new: true },
                });
            } catch (error) {
                if (error instanceof BmDbUniqueConstraintError) {
                    violations++;
                }
            }
        }

        const duration = performance.now() - start;

        expect(violations).toBe(100); // All should violate
        expect(duration).toBeLessThan(2000); // Should be reasonably fast
    });
});

describe('Schema Edge Cases', () => {
    test('should handle empty string values correctly', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string().min(1)), // Requires non-empty
                optionalName: field(z.string().optional()),
                emptyAllowed: field(z.string().min(0)), // Allows empty strings
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'empty_test'
        );

        // Should allow empty strings when schema permits
        expect(() => {
            table.insert({
                id: 1,
                name: 'Valid Name',
                optionalName: '',
                emptyAllowed: '',
            });
        }).not.toThrow();

        // Should reject empty strings when not allowed
        expect(() => {
            table.insert({
                id: 2,
                name: '', // Required and not explicitly allowing empty
                emptyAllowed: 'valid',
            });
        }).toThrow();
    });

    test('should handle very large string values', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                largeText: field(z.string()),
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'large_text'
        );
        const largeString = 'x'.repeat(1000000); // 1MB string

        expect(() => {
            table.insert({
                id: 1,
                largeText: largeString,
            });
        }).not.toThrow();

        const retrieved = table.get(undefined, 1);
        expect((retrieved as any).largeText).toHaveLength(1000000);
    });

    test('should handle special characters in strings', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                specialText: field(z.string()),
                unicodeText: field(z.string()),
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'special_chars'
        );

        const specialChars = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./`~';
        const unicodeText = '🚀 Hello 世界 🌍 مرحبا 你好 здравствуй';

        expect(() => {
            table.insert({
                id: 1,
                specialText: specialChars,
                unicodeText: unicodeText,
            });
        }).not.toThrow();

        const retrieved = table.get(undefined, 1);
        expect((retrieved as any).specialText).toBe(specialChars);
        expect((retrieved as any).unicodeText).toBe(unicodeText);
    });

    test('should handle numeric edge cases', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                integer: field(z.number().int()),
                positive: field(z.number().positive()),
                float: field(z.number()),
                optional: field(z.number().optional()),
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'numeric_edge'
        );

        // Valid cases
        expect(() => {
            table.insert({
                id: 1,
                integer: 42,
                positive: 1,
                float: 3.14159,
                optional: undefined,
            });
        }).not.toThrow();

        // Large numbers
        expect(() => {
            table.insert({
                id: 2,
                integer: Number.MAX_SAFE_INTEGER,
                positive: Number.MAX_VALUE,
                float: -Number.MAX_VALUE,
            });
        }).not.toThrow();

        // Edge cases that should fail
        expect(() => {
            table.insert({
                id: 3,
                integer: 3.14, // Not an integer
                positive: 1,
                float: 1,
            });
        }).toThrow();

        expect(() => {
            table.insert({
                id: 4,
                integer: 1,
                positive: -1, // Not positive
                float: 1,
            });
        }).toThrow();
    });

    test('should handle date edge cases', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                date: field(z.date()),
                optionalDate: field(z.date().optional()),
            })
        );

        const table = new SchemaTable(new MemoryStorage(), schema, 'date_edge');

        const now = new Date();
        const veryOldDate = new Date('1900-01-01');
        const veryNewDate = new Date('2100-12-31');

        expect(() => {
            table.insert({
                id: 1,
                date: now,
                optionalDate: undefined,
            });
        }).not.toThrow();

        expect(() => {
            table.insert({
                id: 2,
                date: veryOldDate,
                optionalDate: veryNewDate,
            });
        }).not.toThrow();

        // Invalid date should fail
        expect(() => {
            table.insert({
                id: 3,
                date: 'not-a-date' as any,
            });
        }).toThrow();
    });

    test('should handle array edge cases', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                numbers: field(z.array(z.number())),
                optionalArray: field(z.array(z.string()).optional()),
                emptyArray: field(z.array(z.number())),
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'array_edge'
        );

        // Valid arrays
        expect(() => {
            table.insert({
                id: 1,
                numbers: [1, 2, 3, 4, 5],
                optionalArray: ['a', 'b', 'c'],
                emptyArray: [],
            });
        }).not.toThrow();

        // Large array
        const largeArray = Array.from({ length: 10000 }, (_, i) => i);
        expect(() => {
            table.insert({
                id: 2,
                numbers: largeArray,
                emptyArray: [],
            });
        }).not.toThrow();

        // Invalid array elements
        expect(() => {
            table.insert({
                id: 3,
                numbers: [1, 'not-a-number', 3] as any,
                emptyArray: [],
            });
        }).toThrow();
    });

    test('should handle object nesting edge cases', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                nested: field(
                    z.object({
                        level1: z.object({
                            level2: z.object({
                                level3: z.string(),
                            }),
                        }),
                    })
                ),
                circularRef: field(z.any()), // For circular reference simulation
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'nested_edge'
        );

        // Deep nesting
        expect(() => {
            table.insert({
                id: 1,
                nested: {
                    level1: {
                        level2: {
                            level3: 'deep value',
                        },
                    },
                },
                circularRef: { self: 'reference' },
            });
        }).not.toThrow();

        const retrieved = table.get(undefined, 1);
        expect((retrieved as any).nested.level1.level2.level3).toBe(
            'deep value'
        );
    });
});

describe('Schema Relationship Edge Cases', () => {
    interface User {
        id: number;
        name: string;
        email: string;
        managerId?: number; // Self-referencing relationship
    }

    interface Post {
        id: number;
        title: string;
        authorId: number;
        categoryId?: number; // Optional foreign key
    }

    interface Category {
        id: number;
        name: string;
        parentId?: number; // Self-referencing relationship
    }

    let db: any;
    let userTable: SchemaTable<User>;
    let postTable: SchemaTable<Post>;
    let categoryTable: SchemaTable<Category>;

    beforeEach(() => {
        const { TinyDB } = require('../src/index');
        const storage = new MemoryStorage();
        db = new TinyDB(storage);

        const UserSchema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                email: unique(z.string().email()),
                managerId: field(z.number().optional()),
            }),
            'users'
        );

        const PostSchema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                title: field(z.string()),
                authorId: field(z.number()),
                categoryId: field(z.number().optional().nullable()),
            }),
            'posts'
        );

        const CategorySchema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                name: field(z.string()),
                parentId: field(z.number().optional()),
            }),
            'categories'
        );

        userTable = db.schemaTable(UserSchema);
        postTable = db.schemaTable(PostSchema);
        categoryTable = db.schemaTable(CategorySchema);

        // Set up relationships
        userTable.hasMany('id', 'posts', 'authorId', true);
        userTable.hasMany('id', 'users', 'managerId', false); // Self-referencing
        categoryTable.hasMany('id', 'posts', 'categoryId', false);
        categoryTable.hasMany('id', 'categories', 'parentId', false); // Self-referencing
    });

    test('should handle self-referencing relationships', () => {
        // Create manager
        const managerId = userTable.insert({
            id: 1,
            name: 'Manager',
            email: 'manager@test.com',
        });

        // Create employee with manager reference
        expect(() => {
            userTable.insert({
                id: 2,
                name: 'Employee',
                email: 'employee@test.com',
                managerId: managerId,
            });
        }).not.toThrow();

        // Should fail with non-existent manager
        expect(() => {
            userTable.insert({
                id: 3,
                name: 'Orphan',
                email: 'orphan@test.com',
                managerId: 999,
            });
        }).toThrow();
    });

    test('should handle optional foreign keys', () => {
        const userId = userTable.insert({
            id: 1,
            name: 'Author',
            email: 'author@test.com',
        });

        // Should work without optional category
        expect(() => {
            postTable.insert({
                id: 1,
                title: 'Post without category',
                authorId: userId,
                categoryId: undefined,
            });
        }).not.toThrow();

        // Should work with null category
        expect(() => {
            postTable.insert({
                id: 2,
                title: 'Post with null category',
                authorId: userId,
                categoryId: null as any,
            });
        }).not.toThrow();

        // Should fail with invalid category
        expect(() => {
            postTable.insert({
                id: 3,
                title: 'Post with invalid category',
                authorId: userId,
                categoryId: 999,
            });
        }).toThrow();
    });

    test('should handle cascade delete with complex hierarchies', () => {
        // Create category hierarchy
        const parentCatId = categoryTable.insert({
            id: 1,
            name: 'Parent Category',
        });

        const childCatId = categoryTable.insert({
            id: 2,
            name: 'Child Category',
            parentId: parentCatId,
        });

        // Create user and posts
        const userId = userTable.insert({
            id: 1,
            name: 'Author',
            email: 'author@test.com',
        });

        const postId = postTable.insert({
            id: 1,
            title: 'Test Post',
            authorId: userId,
            categoryId: childCatId,
        });

        expect(userTable.length).toBe(1);
        expect(postTable.length).toBe(1);
        expect(categoryTable.length).toBe(2);

        // Delete user should cascade to posts but not categories
        userTable.remove(undefined, [userId]);

        expect(userTable.length).toBe(0);
        expect(postTable.length).toBe(0); // Should be deleted
        expect(categoryTable.length).toBe(2); // Should remain
    });

    test('should handle relationship validation during updates', () => {
        const userId = userTable.insert({
            id: 1,
            name: 'Author',
            email: 'author@test.com',
        });

        const postId = postTable.insert({
            id: 1,
            title: 'Test Post',
            authorId: userId,
        });

        // Should allow valid update
        expect(() => {
            postTable.update({ title: 'Updated Title' }, postId);
        }).not.toThrow();

        // Should prevent invalid foreign key update
        expect(() => {
            postTable.update({ authorId: 999 }, postId);
        }).toThrow();
    });

    test('should handle multiple foreign keys in same record', () => {
        const userId1 = userTable.insert({
            id: 1,
            name: 'User 1',
            email: 'user1@test.com',
        });

        const userId2 = userTable.insert({
            id: 2,
            name: 'User 2',
            email: 'user2@test.com',
            managerId: userId1, // References another user
        });

        const categoryId = categoryTable.insert({
            id: 1,
            name: 'Test Category',
        });

        // Should work with valid foreign keys
        expect(() => {
            postTable.insert({
                id: 1,
                title: 'Test Post',
                authorId: userId2,
                categoryId: categoryId,
            });
        }).not.toThrow();

        // Should fail if any foreign key is invalid
        expect(() => {
            postTable.insert({
                id: 2,
                title: 'Invalid Post',
                authorId: 999, // Invalid
                categoryId: categoryId, // Valid
            });
        }).toThrow();
    });
});

describe('Schema Stress Tests', () => {
    test('should handle concurrent-like operations', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                value: field(z.string()),
                counter: field(z.number()),
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'concurrent'
        );

        // Simulate rapid insertions
        const operations = [];
        for (let i = 0; i < 1000; i++) {
            // @ts-ignore
            operations.push(() => {
                table.insert({
                    id: i,
                    value: `value-${i}`,
                    counter: i,
                });
            });
        }

        // Execute all operations
        expect(() => {
            // @ts-ignore
            operations.forEach((op) => op());
        }).not.toThrow();

        expect(table.length).toBe(1000);

        // Verify data integrity
        const allRecords = table.all();
        expect(allRecords).toHaveLength(1000);

        // Check that all expected values are present
        const expectedValues = new Set();
        for (let i = 0; i < 1000; i++) {
            expectedValues.add(`value-${i}`);
        }

        const actualValues = new Set(allRecords.map((r: any) => r.value));
        expect(actualValues.size).toBe(1000);
        expect([...expectedValues].every((v) => actualValues.has(v))).toBe(
            true
        );
    });

    test('should handle memory pressure with large documents', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                largeData: field(z.any()),
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'memory_test'
        );

        // Create documents with substantial data
        const docs = [];
        for (let i = 0; i < 100; i++) {
            // @ts-ignore
            docs.push({
                id: i,
                largeData: {
                    array: Array.from({ length: 1000 }, (_, j) => ({
                        index: j,
                        data: generateRandomString(100),
                    })),
                    metadata: {
                        created: new Date(),
                        tags: Array.from({ length: 50 }, (_, k) => `tag-${k}`),
                    },
                },
            });
        }

        const start = performance.now();
        table.insertMultiple(docs);
        const duration = performance.now() - start;

        expect(table.length).toBe(100);
        expect(duration).toBeLessThan(5000); // Should complete reasonably fast

        // Verify data integrity
        const retrieved = table.get(undefined, 50);
        expect((retrieved as any).largeData.array).toHaveLength(1000);
        expect((retrieved as any).largeData.metadata.tags).toHaveLength(50);
    });

    test('should handle schema validation under load', () => {
        const schema = createSchema(
            z.object({
                id: primaryKey(z.number()),
                email: unique(z.string().email()),
                age: field(z.number().min(0).max(120)),
                name: field(z.string().min(1).max(100)),
            })
        );

        const table = new SchemaTable(
            new MemoryStorage(),
            schema,
            'validation_load'
        );

        let validCount = 0;
        let errorCount = 0;

        // Mix of valid and invalid data
        for (let i = 0; i < 1000; i++) {
            try {
                const age = i % 10 === 0 ? -1 : Math.floor(Math.random() * 100); // 10% invalid age
                const email =
                    i % 15 === 0 ? 'invalid-email' : `user${i}@test.com`; // ~6.7% invalid email

                table.insert({
                    id: i,
                    email: email,
                    age: age,
                    name: `User ${i}`,
                });
                validCount++;
            } catch (error) {
                errorCount++;
            }
        }

        expect(validCount + errorCount).toBe(1000);
        expect(errorCount).toBeGreaterThan(0); // Some should fail validation
        expect(table.length).toBe(validCount);
    });
});
