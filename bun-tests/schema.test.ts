/**
 * Comprehensive Schema tests - SchemaTable, validation, relationships
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { 
  SchemaTable, 
  BmDbSchema, 
  createSchema, 
  MemoryStorage,
  unique,
  primaryKey,
  field,
  BmDbValidationError,
  BmDbUniqueConstraintError
} from "../src/index";
import { generateRandomString, generateRandomNumber } from "./test-setup";

describe("Schema Definition", () => {
  test("should create basic schema", () => {
    const UserSchema = createSchema({
      id: primaryKey(),
      name: field(),
      email: unique(),
      age: field()
    });

    expect(UserSchema).toBeTruthy();
    expect(typeof UserSchema).toBe('function');
  });

  test("should validate schema field types", () => {
    const schema = createSchema({
      id: primaryKey(),
      name: field(),
      email: unique(),
      age: field(),
      active: field()
    });

    const validData = {
      id: 1,
      name: "Alice",
      email: "alice@test.com",
      age: 25,
      active: true
    };

    expect(() => schema.validate(validData)).not.toThrow();
  });

  test("should reject invalid schema data", () => {
    const schema = createSchema({
      id: primaryKey(),
      name: field(),
      email: unique()
    });

    expect(() => {
      schema.validate({
        id: 1,
        name: "Alice"
        // Missing required email field
      });
    }).toThrow(BmDbValidationError);
  });

  test("should handle nested schema validation", () => {
    const schema = createSchema({
      id: primaryKey(),
      profile: field(),
      settings: field()
    });

    const validData = {
      id: 1,
      profile: {
        name: "Alice",
        bio: "Software Engineer"
      },
      settings: {
        theme: "dark",
        notifications: true
      }
    };

    expect(() => schema.validate(validData)).not.toThrow();
  });

  test("should support optional fields", () => {
    const schema = createSchema({
      id: primaryKey(),
      name: field(),
      bio: field() // Optional
    });

    const dataWithoutBio = {
      id: 1,
      name: "Alice"
    };

    const dataWithBio = {
      id: 1,
      name: "Alice",
      bio: "Software Engineer"
    };

    expect(() => schema.validate(dataWithoutBio)).not.toThrow();
    expect(() => schema.validate(dataWithBio)).not.toThrow();
  });
});

describe("SchemaTable - Basic Operations", () => {
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
    UserSchema = createSchema({
      id: primaryKey(),
      name: field(),
      email: unique(),
      age: field(),
      department: field(),
      active: field()
    });

    const storage = new MemoryStorage();
    table = new SchemaTable<User>(storage, "users", UserSchema);
  });

  describe("Insert Operations", () => {
    test("should insert valid documents", () => {
      const user: User = {
        id: 1,
        name: "Alice",
        email: "alice@test.com",
        age: 25,
        department: "Engineering",
        active: true
      };

      const docId = table.insert(user);
      expect(docId).toBe(1);
      expect(table.length).toBe(1);
    });

    test("should reject invalid documents", () => {
      const invalidUser = {
        id: 1,
        name: "Alice",
        // Missing required fields
      };

      expect(() => {
        table.insert(invalidUser as any);
      }).toThrow(BmDbValidationError);
    });

    test("should enforce unique constraints", () => {
      const user1: User = {
        id: 1,
        name: "Alice",
        email: "alice@test.com",
        age: 25,
        department: "Engineering",
        active: true
      };

      const user2: User = {
        id: 2,
        name: "Bob",
        email: "alice@test.com", // Duplicate email
        age: 30,
        department: "Marketing",
        active: true
      };

      table.insert(user1);
      
      expect(() => {
        table.insert(user2);
      }).toThrow(BmDbUniqueConstraintError);
    });

    test("should enforce primary key constraints", () => {
      const user1: User = {
        id: 1,
        name: "Alice",
        email: "alice@test.com",
        age: 25,
        department: "Engineering",
        active: true
      };

      const user2: User = {
        id: 1, // Duplicate primary key
        name: "Bob",
        email: "bob@test.com",
        age: 30,
        department: "Marketing",
        active: true
      };

      table.insert(user1);
      
      expect(() => {
        table.insert(user2);
      }).toThrow(BmDbUniqueConstraintError);
    });

    test("should insert multiple valid documents", () => {
      const users: User[] = [
        { id: 1, name: "Alice", email: "alice@test.com", age: 25, department: "Engineering", active: true },
        { id: 2, name: "Bob", email: "bob@test.com", age: 30, department: "Marketing", active: true },
        { id: 3, name: "Charlie", email: "charlie@test.com", age: 35, department: "Sales", active: false }
      ];

      const docIds = table.insertMultiple(users);
      expect(docIds).toEqual([1, 2, 3]);
      expect(table.length).toBe(3);
    });

    test("should reject batch insert if any document is invalid", () => {
      const users = [
        { id: 1, name: "Alice", email: "alice@test.com", age: 25, department: "Engineering", active: true },
        { id: 2, name: "Bob", email: "bob@test.com", age: 30, department: "Marketing", active: true },
        { id: 3, email: "charlie@test.com", age: 35, department: "Sales", active: false } // Missing name
      ];

      expect(() => {
        table.insertMultiple(users as any);
      }).toThrow(BmDbValidationError);

      expect(table.length).toBe(0); // No documents should be inserted
    });
  });

  describe("Update Operations", () => {
    beforeEach(() => {
      const users: User[] = [
        { id: 1, name: "Alice", email: "alice@test.com", age: 25, department: "Engineering", active: true },
        { id: 2, name: "Bob", email: "bob@test.com", age: 30, department: "Marketing", active: true }
      ];
      table.insertMultiple(users);
    });

    test("should update valid documents", () => {
      table.update({ age: 26, department: "Senior Engineering" }, 1);
      
      const updated = table.get(undefined, 1);
      expect(updated!.age).toBe(26);
      expect(updated!.department).toBe("Senior Engineering");
      expect(updated!.name).toBe("Alice"); // Unchanged
    });

    test("should validate updates", () => {
      expect(() => {
        table.update({ age: "not a number" } as any, 1);
      }).toThrow(BmDbValidationError);
    });

    test("should enforce unique constraints on updates", () => {
      expect(() => {
        table.update({ email: "bob@test.com" }, 1); // Trying to use Bob's email
      }).toThrow(BmDbUniqueConstraintError);
    });

    test("should allow valid unique value updates", () => {
      table.update({ email: "alice.updated@test.com" }, 1);
      
      const updated = table.get(undefined, 1);
      expect(updated!.email).toBe("alice.updated@test.com");
    });

    test("should handle partial updates", () => {
      table.update({ age: 26 }, 1);
      
      const updated = table.get(undefined, 1);
      expect(updated!.age).toBe(26);
      expect(updated!.name).toBe("Alice");
      expect(updated!.email).toBe("alice@test.com");
    });
  });

  describe("Validation Edge Cases", () => {
    test("should handle null and undefined values", () => {
      const schema = createSchema({
        id: primaryKey(),
        name: field(),
        optional: field()
      });

      const table = new SchemaTable(new MemoryStorage(), "test", schema);

      expect(() => {
        table.insert({ id: 1, name: "Alice", optional: null });
      }).not.toThrow();

      expect(() => {
        table.insert({ id: 2, name: "Bob", optional: undefined });
      }).not.toThrow();
    });

    test("should handle complex data types", () => {
      const schema = createSchema({
        id: primaryKey(),
        data: field(),
        tags: field(),
        metadata: field()
      });

      const table = new SchemaTable(new MemoryStorage(), "complex", schema);

      const complexDoc = {
        id: 1,
        data: { nested: { deeply: { value: "test" } } },
        tags: ["tag1", "tag2", "tag3"],
        metadata: {
          created: new Date(),
          numbers: [1, 2, 3, 4, 5],
          config: { enabled: true, settings: { theme: "dark" } }
        }
      };

      expect(() => {
        table.insert(complexDoc);
      }).not.toThrow();

      const retrieved = table.get(undefined, 1);
      expect(retrieved!.data).toEqual(complexDoc.data);
      expect(retrieved!.tags).toEqual(complexDoc.tags);
    });

    test("should handle very large documents", () => {
      const schema = createSchema({
        id: primaryKey(),
        largeData: field()
      });

      const table = new SchemaTable(new MemoryStorage(), "large", schema);

      const largeArray = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        value: generateRandomString(100)
      }));

      const largeDoc = {
        id: 1,
        largeData: largeArray
      };

      expect(() => {
        table.insert(largeDoc);
      }).not.toThrow();

      const retrieved = table.get(undefined, 1);
      expect(retrieved!.largeData).toHaveLength(10000);
    });
  });
});

describe("Schema Relationships", () => {
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

  let userTable: SchemaTable<User>;
  let postTable: SchemaTable<Post>;
  let commentTable: SchemaTable<Comment>;

  beforeEach(() => {
    const storage = new MemoryStorage();

    const UserSchema = createSchema({
      id: primaryKey(),
      name: field(),
      email: unique()
    });

    const PostSchema = createSchema({
      id: primaryKey(),
      title: field(),
      content: field(),
      authorId: field()
    });

    const CommentSchema = createSchema({
      id: primaryKey(),
      content: field(),
      postId: field(),
      authorId: field()
    });

    userTable = new SchemaTable<User>(storage, "users", UserSchema);
    postTable = new SchemaTable<Post>(storage, "posts", PostSchema);
    commentTable = new SchemaTable<Comment>(storage, "comments", CommentSchema);

    // Set up relationships
    userTable.addRelationship({
      type: 'hasMany',
      targetTable: 'posts',
      foreignKey: 'authorId',
      cascadeDelete: true
    });

    userTable.addRelationship({
      type: 'hasMany',
      targetTable: 'comments',
      foreignKey: 'authorId',
      cascadeDelete: true
    });

    postTable.addRelationship({
      type: 'belongsTo',
      targetTable: 'users',
      foreignKey: 'authorId'
    });

    postTable.addRelationship({
      type: 'hasMany',
      targetTable: 'comments',
      foreignKey: 'postId',
      cascadeDelete: true
    });

    commentTable.addRelationship({
      type: 'belongsTo',
      targetTable: 'users',
      foreignKey: 'authorId'
    });

    commentTable.addRelationship({
      type: 'belongsTo',
      targetTable: 'posts',
      foreignKey: 'postId'
    });
  });

  test("should establish relationships between tables", () => {
    // Insert test data
    const userId = userTable.insert({ id: 1, name: "Alice", email: "alice@test.com" });
    const postId = postTable.insert({ id: 1, title: "Hello World", content: "First post", authorId: userId });
    const commentId = commentTable.insert({ id: 1, content: "Great post!", postId: postId, authorId: userId });

    expect(userId).toBe(1);
    expect(postId).toBe(1);
    expect(commentId).toBe(1);
  });

  test("should find related documents", () => {
    // Insert test data
    const userId = userTable.insert({ id: 1, name: "Alice", email: "alice@test.com" });
    const postId1 = postTable.insert({ id: 1, title: "Post 1", content: "Content 1", authorId: userId });
    const postId2 = postTable.insert({ id: 2, title: "Post 2", content: "Content 2", authorId: userId });

    const userPosts = userTable.findRelated(userId, 'posts');
    expect(userPosts).toHaveLength(2);
    expect(userPosts.map(p => p.title)).toEqual(["Post 1", "Post 2"]);
  });

  test("should handle cascade deletes", () => {
    // Insert test data
    const userId = userTable.insert({ id: 1, name: "Alice", email: "alice@test.com" });
    const postId = postTable.insert({ id: 1, title: "Post 1", content: "Content 1", authorId: userId });
    const commentId = commentTable.insert({ id: 1, content: "Comment 1", postId: postId, authorId: userId });

    expect(userTable.length).toBe(1);
    expect(postTable.length).toBe(1);
    expect(commentTable.length).toBe(1);

    // Delete user should cascade to posts and comments
    userTable.remove(undefined, userId);

    expect(userTable.length).toBe(0);
    expect(postTable.length).toBe(0); // Should be deleted by cascade
    expect(commentTable.length).toBe(0); // Should be deleted by cascade
  });

  test("should validate relationships", () => {
    const userId = userTable.insert({ id: 1, name: "Alice", email: "alice@test.com" });

    // This should work - valid relationship
    expect(() => {
      postTable.insert({ id: 1, title: "Post 1", content: "Content 1", authorId: userId });
    }).not.toThrow();

    // This should fail - invalid relationship
    expect(() => {
      postTable.insert({ id: 2, title: "Post 2", content: "Content 2", authorId: 999 });
    }).toThrow(); // Non-existent user ID
  });

  test("should handle complex relationship chains", () => {
    // Create a chain: User -> Post -> Comment
    const userId = userTable.insert({ id: 1, name: "Alice", email: "alice@test.com" });
    const postId = postTable.insert({ id: 1, title: "Post 1", content: "Content 1", authorId: userId });
    
    // Multiple comments on the same post
    commentTable.insert({ id: 1, content: "Comment 1", postId: postId, authorId: userId });
    commentTable.insert({ id: 2, content: "Comment 2", postId: postId, authorId: userId });
    commentTable.insert({ id: 3, content: "Comment 3", postId: postId, authorId: userId });

    const postComments = postTable.findRelated(postId, 'comments');
    expect(postComments).toHaveLength(3);

    // Delete post should cascade to comments
    postTable.remove(undefined, postId);
    expect(commentTable.length).toBe(0);
  });
});

describe("Schema Performance", () => {
  interface TestDoc {
    id: number;
    name: string;
    email: string;
    data: any;
  }

  let table: SchemaTable<TestDoc>;

  beforeEach(() => {
    const schema = createSchema({
      id: primaryKey(),
      name: field(),
      email: unique(),
      data: field()
    });

    const storage = new MemoryStorage();
    table = new SchemaTable<TestDoc>(storage, "perf_test", schema);
  });

  test("should handle large batch inserts efficiently", () => {
    const docs: TestDoc[] = [];
    for (let i = 0; i < 5000; i++) {
      docs.push({
        id: i,
        name: `User ${i}`,
        email: `user${i}@test.com`,
        data: { index: i, random: generateRandomString(20) }
      });
    }

    const start = performance.now();
    table.insertMultiple(docs);
    const duration = performance.now() - start;

    expect(table.length).toBe(5000);
    expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds
  });

  test("should maintain validation performance", () => {
    // Pre-populate with data
    const docs: TestDoc[] = [];
    for (let i = 0; i < 1000; i++) {
      docs.push({
        id: i,
        name: `User ${i}`,
        email: `user${i}@test.com`,
        data: { index: i }
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

  test("should handle unique constraint checking efficiently", () => {
    // Pre-populate with data
    const docs: TestDoc[] = [];
    for (let i = 0; i < 2000; i++) {
      docs.push({
        id: i,
        name: `User ${i}`,
        email: `user${i}@test.com`,
        data: { index: i }
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
          data: { new: true }
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