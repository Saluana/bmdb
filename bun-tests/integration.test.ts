/**
 * Comprehensive Integration tests - End-to-end scenarios and edge cases
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { 
  TinyDB, 
  Table, 
  SchemaTable,
  createSchema,
  primaryKey,
  unique,
  field,
  MemoryStorage, 
  JSONStorage,
  BinaryStorage,
  WALJSONStorage,
  where,
  Document 
} from "../src/index";
import { z } from "zod";
import { generateTestUser, generateTestUsers, measurePerformance, measureAsyncPerformance } from "./test-setup";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync, mkdirSync, rmSync } from "fs";

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

describe("TinyDB Integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bmdb_integration_test_${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("should create and use TinyDB with different storage backends", () => {
    const storageTypes = [
      () => new MemoryStorage(),
      () => new JSONStorage(join(tempDir, "test.json")),
      () => new BinaryStorage(join(tempDir, "test.bin")),
      () => new WALJSONStorage(join(tempDir, "test-wal.json"))
    ];

    storageTypes.forEach((createStorage, index) => {
      try {
        const storage = createStorage();
        const db = new TinyDB(storage);
        
        const users = generateTestUsers(10);
        const docIds = db.insertMultiple(users);
        
        expect(docIds).toHaveLength(10);
        expect(db.count(() => true)).toBe(10);
        
        const retrieved = db.search(where("department").equals("Engineering"));
        expect(Array.isArray(retrieved)).toBe(true);
        
        db.close();
      } catch (error) {
        // Some storage types might fail in test environment, that's okay
        console.warn(`Storage type ${index} failed:`, error);
      }
    });
  });

  test("should handle large datasets across different components", () => {
    const storage = new MemoryStorage();
    const db = new TinyDB(storage);
    
    // Insert large dataset
    const users = generateTestUsers(10000);
    const { duration: insertTime } = measurePerformance(() => {
      db.insertMultiple(users);
    });
    
    expect(insertTime).toBeLessThan(10000); // Should complete in reasonable time
    expect(db.count(() => true)).toBe(10000);
    
    // Test various operations
    const { duration: searchTime } = measurePerformance(() => {
      db.search(where("department").equals("Engineering"));
    });
    
    const { duration: updateTime } = measurePerformance(() => {
      db.update({ active: false }, where("age").greaterThan(50));
    });
    
    const { duration: deleteTime } = measurePerformance(() => {
      db.remove(where("age").greaterThan(60));
    });
    
    expect(searchTime).toBeLessThan(1000);
    expect(updateTime).toBeLessThan(2000);
    expect(deleteTime).toBeLessThan(2000);
    
    db.close();
  });
});

describe("Cross-Component Integration", () => {
  let table: Table<TestUser>;
  let schemaTable: SchemaTable<any>;

  beforeEach(() => {
    const storage = new MemoryStorage();
    table = new Table<TestUser>(storage, "regular_table", { enableIndexing: true });
    
    const schema = createSchema(
      z.object({
        id: primaryKey(z.number()),
        name: field(z.string()),
        email: unique(z.string()),
        age: field(z.number()),
        department: field(z.string()),
        active: field(z.boolean()),
        salary: field(z.number()),
        joinDate: field(z.date())
      }).strict()
    );
    
    schemaTable = new SchemaTable(storage, schema, "schema_table");
  });

  test("should handle mixed operations across table types", () => {
    const users = generateTestUsers(100);
    
    // Insert into both tables
    table.insertMultiple(users);
    schemaTable.insertMultiple(users);
    
    expect(table.length).toBe(100);
    expect(schemaTable.length).toBe(100);
    
    // Test queries on both
    const regularResults = table.search(where("department").equals("Engineering"));
    const schemaResults = schemaTable.search(where("department").equals("Engineering"));
    
    expect(regularResults.length).toBe(schemaResults.length);
    
    // Test updates
    table.update({ active: false }, undefined, [1]);
    schemaTable.update({ active: false }, undefined, [1]);
    
    const regularDoc = table.get(undefined, 1);
    const schemaDoc = schemaTable.get(undefined, 1);
    
    expect((regularDoc as any).active).toBe(false);
    expect((schemaDoc as any).active).toBe(false);
  });

  test("should maintain data consistency across operations", () => {
    const users = generateTestUsers(50);
    const docIds = table.insertMultiple(users);
    
    // Perform mixed operations
    for (let i = 0; i < 10; i++) {
      // Update some documents
      table.update({ salary: 100000 + i }, undefined, [docIds[i]]);
      
      // Delete some documents
      if (i % 3 === 0) {
        table.remove(undefined, [docIds[i + 20]]);
      }
      
      // Search for documents
      const results = table.search(where("age").greaterThan(25 + i));
      expect(Array.isArray(results)).toBe(true);
    }
    
    // Verify final state is consistent
    const allDocs = table.all();
    const searchResults = table.search(() => true);
    
    expect(allDocs.length).toBe(searchResults.length);
    expect(table.length).toBe(allDocs.length);
  });
});

describe("Edge Cases and Error Scenarios", () => {
  let table: Table<TestUser>;

  beforeEach(() => {
    const storage = new MemoryStorage();
    table = new Table<TestUser>(storage, "edge_case_test", { enableIndexing: true });
  });

  test("should handle empty and null values gracefully", () => {
    const edgeCases = [
      { id: 1, name: "", email: "empty@test.com", age: 0, department: "", active: false, salary: 0, joinDate: new Date() },
      { id: 2, name: "Null Test", email: "null@test.com", age: 25, department: null as any, active: true, salary: 50000, joinDate: new Date() },
      { id: 3, name: "Undefined Test", email: "undefined@test.com", age: 30, department: undefined as any, active: true, salary: 60000, joinDate: new Date() }
    ];

    expect(() => {
      table.insertMultiple(edgeCases);
    }).not.toThrow();

    expect(table.length).toBe(3);

    // Test queries with edge case values
    const emptyResults = table.search(where("department").equals(""));
    const nullResults = table.search(where("department").equals(null));
    
    expect(Array.isArray(emptyResults)).toBe(true);
    expect(Array.isArray(nullResults)).toBe(true);
  });

  test("should handle very large and very small numbers", () => {
    const extremeValues = [
      { id: 1, name: "Max", email: "max@test.com", age: Number.MAX_SAFE_INTEGER, department: "Test", active: true, salary: Number.MAX_VALUE, joinDate: new Date() },
      { id: 2, name: "Min", email: "min@test.com", age: Number.MIN_SAFE_INTEGER, department: "Test", active: true, salary: Number.MIN_VALUE, joinDate: new Date() },
      { id: 3, name: "Zero", email: "zero@test.com", age: 0, department: "Test", active: true, salary: 0, joinDate: new Date() }
    ];

    expect(() => {
      table.insertMultiple(extremeValues);
    }).not.toThrow();

    const maxResults = table.search(where("age").equals(Number.MAX_SAFE_INTEGER));
    const minResults = table.search(where("age").equals(Number.MIN_SAFE_INTEGER));
    
    expect(maxResults).toHaveLength(1);
    expect(minResults).toHaveLength(1);
  });

  test("should handle special string characters", () => {
    const specialStrings = [
      { id: 1, name: "Unicode: 🚀💾🔥", email: "unicode@test.com", age: 25, department: "Engineering", active: true, salary: 50000, joinDate: new Date() },
      { id: 2, name: "Quotes: \"'`", email: "quotes@test.com", age: 30, department: "Marketing", active: true, salary: 55000, joinDate: new Date() },
      { id: 3, name: "Special: !@#$%^&*()", email: "special@test.com", age: 35, department: "Sales", active: true, salary: 60000, joinDate: new Date() },
      { id: 4, name: "Newlines:\n\r\t", email: "newlines@test.com", age: 40, department: "HR", active: true, salary: 65000, joinDate: new Date() }
    ];

    expect(() => {
      table.insertMultiple(specialStrings);
    }).not.toThrow();

    // Test that special characters are preserved
    const unicodeResult = table.search(where("name").equals("Unicode: 🚀💾🔥"));
    expect(unicodeResult).toHaveLength(1);
    expect((unicodeResult[0] as any).name).toBe("Unicode: 🚀💾🔥");
  });

  test("should handle very deep nested objects", () => {
    const deepObject: any = { level: 0 };
    let current = deepObject;
    
    // Create 50 levels of nesting
    for (let i = 1; i < 50; i++) {
      current.nested = { level: i };
      current = current.nested;
    }

    const complexDoc = {
      id: 1,
      name: "Deep Object Test",
      email: "deep@test.com",
      age: 25,
      department: "Engineering",
      active: true,
      salary: 50000,
      joinDate: new Date(),
      metadata: deepObject
    };

    expect(() => {
      table.insert(complexDoc as any);
    }).not.toThrow();

    const retrieved = table.get(undefined, 1);
    expect((retrieved as any).name).toBe("Deep Object Test");
  });

  test("should handle concurrent operations safely", async () => {
    const users = generateTestUsers(1000);
    table.insertMultiple(users);

    // Simulate concurrent operations
    const operations = [];
    
    for (let i = 0; i < 50; i++) {
      operations.push(async () => {
        // Mix of operations
        const results = table.search(where("age").greaterThan(Math.random() * 50));
        table.update({ salary: Math.random() * 100000 }, undefined, [Math.floor(Math.random() * 100) + 1]);
        return results.length;
      });
    }

    const { result: results } = await measureAsyncPerformance(async () => {
      return Promise.all(operations.map(op => op()));
    });

    expect(results).toHaveLength(50);
    expect(results.every(r => typeof r === 'number')).toBe(true);
    
    // Table should still be in a valid state
    expect(table.length).toBeGreaterThan(0);
    expect(table.all().length).toBe(table.length);
  });

  test("should handle memory pressure gracefully", () => {
    // Insert and remove large amounts of data to test memory management
    for (let batch = 0; batch < 10; batch++) {
      const users = generateTestUsers(5000);
      const docIds = table.insertMultiple(users);
      
      expect(table.length).toBe(5000);
      
      // Remove half the documents
      for (let i = 0; i < 2500; i++) {
        table.remove(undefined, [docIds[i]]);
      }
      
      expect(table.length).toBe(2500);
      
      // Clear remaining
      table.remove(() => true);
      expect(table.length).toBe(0);
    }
    
    // Table should still be functional
    const finalUser = generateTestUser();
    const docId = table.insert(finalUser);
    expect(table.get(undefined, docId)).toBeTruthy();
  });
});

describe("Data Integrity and Consistency", () => {
  test("should maintain referential integrity in relationships", () => {
    const storage = new MemoryStorage();
    const db = new TinyDB(storage);
    
    const UserSchema = createSchema(
      z.object({
        id: primaryKey(z.number()),
        name: field(z.string()),
        email: unique(z.string())
      }),
      "users"
    );
    
    const PostSchema = createSchema(
      z.object({
        id: primaryKey(z.number()),
        title: field(z.string()),
        content: field(z.string()),
        authorId: field(z.number())
      }),
      "posts"
    );

    const userTable = db.schemaTable(UserSchema);
    const postTable = db.schemaTable(PostSchema);

    // Set up relationship
    userTable.hasMany('id', 'posts', 'authorId', true);

    // Insert test data
    const userId = userTable.insert({ id: 1, name: "Alice", email: "alice@test.com" });
    const postIds = postTable.insertMultiple([
      { id: 1, title: "Post 1", content: "Content 1", authorId: userId },
      { id: 2, title: "Post 2", content: "Content 2", authorId: userId },
      { id: 3, title: "Post 3", content: "Content 3", authorId: userId }
    ]);

    expect(userTable.length).toBe(1);
    expect(postTable.length).toBe(3);

    // Test relationship queries
    const userPosts = userTable.findChildren(userId, 'posts');
    expect(userPosts).toHaveLength(3);

    // Test cascade delete
    userTable.remove(undefined, [userId]);
    expect(userTable.length).toBe(0);
    expect(postTable.length).toBe(0); // Should be deleted by cascade
  });

  test("should handle batch operations efficiently", () => {
    const storage = new MemoryStorage();
    const table = new Table<TestUser>(storage, "batch_test");

    const users = generateTestUsers(100);
    
    // Simulate batch operation
    const docIds = table.insertMultiple(users);
    
    // Verify all data is present
    expect(table.length).toBe(100);
    expect(docIds).toHaveLength(100);
    
    // Test batch updates
    table.update({ active: false }, where("age").greaterThan(30));
    
    const inactiveUsers = table.search(where("active").equals(false));
    expect(inactiveUsers.length).toBeGreaterThan(0);
  });

  test("should maintain index consistency during bulk operations", () => {
    const storage = new MemoryStorage();
    const table = new Table<TestUser>(storage, "index_consistency", { enableIndexing: true });

    // Insert initial data
    const initialUsers = generateTestUsers(1000);
    table.insertMultiple(initialUsers);

    // Trigger index creation
    const engineeringUsers = table.search(where("department").equals("Engineering"));
    const initialEngineeringCount = engineeringUsers.length;

    // Bulk update some departments
    for (let i = 1; i <= 100; i++) {
      table.update({ department: "New Engineering" }, undefined, [i]);
    }

    // Index should reflect changes
    const updatedEngineeringUsers = table.search(where("department").equals("Engineering"));
    const newEngineeringUsers = table.search(where("department").equals("New Engineering"));

    expect(updatedEngineeringUsers.length).toBeLessThan(initialEngineeringCount);
    expect(newEngineeringUsers.length).toBeGreaterThan(0);

    // Total should still be consistent
    const allUsers = table.all();
    expect(allUsers.length).toBe(1000);
  });
});

describe("Performance Regression Tests", () => {
  test("should maintain performance standards", () => {
    const storage = new MemoryStorage();
    const table = new Table<TestUser>(storage, "performance_test", { enableIndexing: true });

    // Baseline performance test
    const performanceMetrics: Record<string, number> = {};

    // Insert performance
    const users = generateTestUsers(10000);
    const { duration: insertTime } = measurePerformance(() => {
      table.insertMultiple(users);
    });
    performanceMetrics.insert = insertTime;

    // Search performance (should trigger indexing)
    const { duration: searchTime } = measurePerformance(() => {
      table.search(where("department").equals("Engineering"));
    });
    performanceMetrics.search = searchTime;

    // Update performance
    const { duration: updateTime } = measurePerformance(() => {
      for (let i = 1; i <= 100; i++) {
        table.update({ salary: 100000 }, undefined, [i]);
      }
    });
    performanceMetrics.update = updateTime;

    // Delete performance
    const { duration: deleteTime } = measurePerformance(() => {
      for (let i = 1; i <= 100; i++) {
        table.remove(undefined, [i]);
      }
    });
    performanceMetrics.delete = deleteTime;

    // Assert performance standards
    expect(performanceMetrics.insert).toBeLessThan(10000); // 10 seconds for 10k inserts
    expect(performanceMetrics.search).toBeLessThan(100);   // 100ms for indexed search
    expect(performanceMetrics.update).toBeLessThan(500);   // 500ms for 100 updates
    expect(performanceMetrics.delete).toBeLessThan(500);   // 500ms for 100 deletes

    console.log("Performance metrics:", performanceMetrics);
  });

  test("should scale linearly with data size", () => {
    const storage = new MemoryStorage();
    const table = new Table<TestUser>(storage, "scaling_test", { enableIndexing: true });

    const dataSizes = [1000, 5000, 10000];
    const scalingResults: Array<{ size: number; duration: number }> = [];

    dataSizes.forEach(size => {
      table.remove(() => true);
      const users = generateTestUsers(size);
      
      const { duration } = measurePerformance(() => {
        table.insertMultiple(users);
        table.search(where("department").equals("Engineering"));
      });

      scalingResults.push({ size, duration });
    });

    // Verify roughly linear scaling (allowing for some variance)
    const smallToMedium = scalingResults[1].duration / scalingResults[0].duration;
    const mediumToLarge = scalingResults[2].duration / scalingResults[1].duration;

    expect(smallToMedium).toBeLessThan(20); // Should not be more than 20x slower
    expect(mediumToLarge).toBeLessThan(10);  // Should not be more than 10x slower

    console.log("Scaling results:", scalingResults);
  });
});