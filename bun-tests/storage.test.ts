/**
 * Comprehensive Storage tests - Memory, JSON, Binary, WAL storage
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { 
  MemoryStorage, 
  JSONStorage, 
  BinaryStorage, 
  WALStorage, 
  WALJSONStorage,
  Table 
} from "../src/index";
import { generateTestUser, generateTestUsers, measurePerformance } from "./test-setup";
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

describe("MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  test("should initialize as empty", () => {
    expect(storage.read("test")).toEqual({});
  });

  test("should store and retrieve data", () => {
    const data = { "1": { name: "Alice", age: 25 } };
    storage.write("test", data);
    
    expect(storage.read("test")).toEqual(data);
  });

  test("should handle multiple tables", () => {
    const users = { "1": { name: "Alice" } };
    const products = { "1": { name: "Product A" } };
    
    storage.write("users", users);
    storage.write("products", products);
    
    expect(storage.read("users")).toEqual(users);
    expect(storage.read("products")).toEqual(products);
  });

  test("should overwrite existing data", () => {
    storage.write("test", { "1": { name: "Alice" } });
    storage.write("test", { "2": { name: "Bob" } });
    
    expect(storage.read("test")).toEqual({ "2": { name: "Bob" } });
  });

  test("should handle large datasets", () => {
    const largeData: Record<string, any> = {};
    for (let i = 0; i < 10000; i++) {
      largeData[i.toString()] = generateTestUser(i);
    }
    
    const { duration } = measurePerformance(() => {
      storage.write("large", largeData);
    });
    
    expect(duration).toBeLessThan(1000);
    expect(Object.keys(storage.read("large"))).toHaveLength(10000);
  });

  test("should handle concurrent access", () => {
    const operations = [];
    
    for (let i = 0; i < 100; i++) {
      operations.push(() => {
        storage.write(`table${i}`, { [`${i}`]: { value: i } });
        return storage.read(`table${i}`);
      });
    }
    
    expect(() => {
      operations.forEach(op => op());
    }).not.toThrow();
  });
});

describe("JSONStorage", () => {
  let storage: JSONStorage;
  let tempFile: string;

  beforeEach(() => {
    tempFile = join(tmpdir(), `bmdb_json_test_${Date.now()}.json`);
    storage = new JSONStorage(tempFile);
  });

  afterEach(() => {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  });

  test("should create file on first write", () => {
    expect(existsSync(tempFile)).toBe(false);
    
    storage.write("test", { "1": { name: "Alice" } });
    
    expect(existsSync(tempFile)).toBe(true);
  });

  test("should persist data across instances", () => {
    const data = { "1": { name: "Alice", age: 25 } };
    storage.write("test", data);
    
    // Create new storage instance with same file
    const storage2 = new JSONStorage(tempFile);
    expect(storage2.read("test")).toEqual(data);
  });

  test("should handle file corruption gracefully", () => {
    // Write invalid JSON to file
    require('fs').writeFileSync(tempFile, "invalid json {{{");
    
    expect(() => {
      const corruptedStorage = new JSONStorage(tempFile);
      corruptedStorage.read("test");
    }).not.toThrow();
  });

  test("should handle concurrent writes", () => {
    const data1 = { "1": { name: "Alice" } };
    const data2 = { "2": { name: "Bob" } };
    
    storage.write("users", data1);
    storage.write("products", data2);
    
    expect(storage.read("users")).toEqual(data1);
    expect(storage.read("products")).toEqual(data2);
  });

  test("should preserve data types", () => {
    const complexData = {
      "1": {
        string: "text",
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { nested: "value" },
        date: new Date().toISOString(),
        null: null
      }
    };
    
    storage.write("complex", complexData);
    const retrieved = storage.read("complex");
    
    expect(retrieved).toEqual(complexData);
  });

  test("should handle large files efficiently", () => {
    const largeData: Record<string, any> = {};
    for (let i = 0; i < 5000; i++) {
      largeData[i.toString()] = generateTestUser(i);
    }
    
    const { duration: writeTime } = measurePerformance(() => {
      storage.write("large", largeData);
    });
    
    const { duration: readTime } = measurePerformance(() => {
      storage.read("large");
    });
    
    expect(writeTime).toBeLessThan(5000);
    expect(readTime).toBeLessThan(2000);
  });

  test("should handle special characters and unicode", () => {
    const unicodeData = {
      "1": {
        emoji: "🚀💾🔥",
        chinese: "你好世界",
        special: "!@#$%^&*()[]{}",
        quotes: '"single\' and "double" quotes'
      }
    };
    
    storage.write("unicode", unicodeData);
    expect(storage.read("unicode")).toEqual(unicodeData);
  });
});

describe("BinaryStorage", () => {
  let storage: BinaryStorage;
  let tempFile: string;

  beforeEach(() => {
    tempFile = join(tmpdir(), `bmdb_binary_test_${Date.now()}.bin`);
    storage = new BinaryStorage(tempFile);
  });

  afterEach(() => {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  });

  test("should store and retrieve binary data", () => {
    const data = { "1": { name: "Alice", age: 25, active: true } };
    storage.write("test", data);
    
    expect(storage.read("test")).toEqual(data);
  });

  test("should handle complex nested objects", () => {
    const complexData = {
      "1": {
        user: { name: "Alice", details: { age: 25, location: "NYC" } },
        metadata: { created: new Date().toISOString(), tags: ["tag1", "tag2"] }
      }
    };
    
    storage.write("complex", complexData);
    expect(storage.read("complex")).toEqual(complexData);
  });

  test("should be more efficient than JSON for large datasets", () => {
    const largeData: Record<string, any> = {};
    for (let i = 0; i < 1000; i++) {
      largeData[i.toString()] = generateTestUser(i);
    }
    
    const jsonStorage = new JSONStorage(tempFile + ".json");
    
    const { duration: binaryWriteTime } = measurePerformance(() => {
      storage.write("large", largeData);
    });
    
    const { duration: jsonWriteTime } = measurePerformance(() => {
      jsonStorage.write("large", largeData);
    });
    
    // Binary should be competitive or faster
    expect(binaryWriteTime).toBeLessThan(jsonWriteTime * 2);
    
    // Cleanup
    if (existsSync(tempFile + ".json")) {
      unlinkSync(tempFile + ".json");
    }
  });

  test("should handle file corruption gracefully", () => {
    // Write invalid binary data
    require('fs').writeFileSync(tempFile, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
    
    expect(() => {
      const corruptedStorage = new BinaryStorage(tempFile);
      corruptedStorage.read("test");
    }).not.toThrow();
  });

  test("should preserve data integrity", () => {
    const originalData = {
      "1": generateTestUser(1),
      "2": generateTestUser(2),
      "3": generateTestUser(3)
    };
    
    storage.write("integrity", originalData);
    const retrieved = storage.read("integrity");
    
    expect(retrieved).toEqual(originalData);
  });
});

describe("WAL Storage Systems", () => {
  let tempDir: string;
  let walStorage: WALStorage;
  let walJSONStorage: WALJSONStorage;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bmdb_wal_test_${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    walStorage = new WALStorage(join(tempDir, "data.bin"));
    walJSONStorage = new WALJSONStorage(join(tempDir, "data.json"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("WALStorage", () => {
    test("should log operations before applying them", () => {
      const data = { "1": { name: "Alice" } };
      
      walStorage.write("test", data);
      expect(walStorage.read("test")).toEqual(data);
    });

    test("should handle transactions", () => {
      const transaction = walStorage.beginTransaction();
      
      transaction.write("users", { "1": { name: "Alice" } });
      transaction.write("products", { "1": { name: "Product A" } });
      
      transaction.commit();
      
      expect(walStorage.read("users")).toEqual({ "1": { name: "Alice" } });
      expect(walStorage.read("products")).toEqual({ "1": { name: "Product A" } });
    });

    test("should rollback failed transactions", () => {
      const initialData = { "1": { name: "Initial" } };
      walStorage.write("test", initialData);
      
      const transaction = walStorage.beginTransaction();
      transaction.write("test", { "2": { name: "Modified" } });
      transaction.rollback();
      
      expect(walStorage.read("test")).toEqual(initialData);
    });

    test("should recover from crashes", () => {
      // Simulate writes with potential crash
      walStorage.write("test1", { "1": { name: "Alice" } });
      walStorage.write("test2", { "1": { name: "Bob" } });
      
      // Create new instance (simulating restart)
      const recoveredStorage = new WALStorage(join(tempDir, "data.bin"));
      
      expect(recoveredStorage.read("test1")).toEqual({ "1": { name: "Alice" } });
      expect(recoveredStorage.read("test2")).toEqual({ "1": { name: "Bob" } });
    });

    test("should handle concurrent transactions", () => {
      const tx1 = walStorage.beginTransaction();
      const tx2 = walStorage.beginTransaction();
      
      tx1.write("test", { "1": { name: "Transaction 1" } });
      tx2.write("test", { "2": { name: "Transaction 2" } });
      
      tx1.commit();
      tx2.commit();
      
      // One of the transactions should win
      const result = walStorage.read("test");
      expect(Object.keys(result)).toHaveLength(1);
    });

    test("should maintain performance under load", () => {
      const operations = [];
      
      for (let i = 0; i < 100; i++) {
        operations.push(() => {
          walStorage.write(`table${i}`, { [`${i}`]: generateTestUser(i) });
        });
      }
      
      const { duration } = measurePerformance(() => {
        operations.forEach(op => op());
      });
      
      expect(duration).toBeLessThan(5000);
    });
  });

  describe("WALJSONStorage", () => {
    test("should provide WAL capabilities with JSON persistence", () => {
      const data = { "1": { name: "Alice", age: 25 } };
      
      walJSONStorage.write("test", data);
      expect(walJSONStorage.read("test")).toEqual(data);
    });

    test("should handle complex JSON data in transactions", () => {
      const transaction = walJSONStorage.beginTransaction();
      
      const complexData = {
        "1": {
          user: generateTestUser(1),
          metadata: {
            created: new Date().toISOString(),
            tags: ["important", "user-data"],
            settings: { theme: "dark", notifications: true }
          }
        }
      };
      
      transaction.write("complex", complexData);
      transaction.commit();
      
      expect(walJSONStorage.read("complex")).toEqual(complexData);
    });

    test("should maintain data consistency across crashes", () => {
      const users = generateTestUsers(10);
      const userData: Record<string, any> = {};
      
      users.forEach((user, index) => {
        userData[index.toString()] = user;
      });
      
      walJSONStorage.write("users", userData);
      
      // Simulate restart
      const recoveredStorage = new WALJSONStorage(join(tempDir, "data.json"));
      
      expect(recoveredStorage.read("users")).toEqual(userData);
    });
  });
});

describe("Storage Integration with Table", () => {
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

  test("should work with different storage backends", () => {
    const storageTypes = [
      () => new MemoryStorage(),
      () => new JSONStorage(join(tempDir, "json.json")),
      () => new BinaryStorage(join(tempDir, "binary.bin")),
      () => new WALJSONStorage(join(tempDir, "wal.json"))
    ];

    storageTypes.forEach((createStorage, index) => {
      const storage = createStorage();
      const table = new Table<TestUser>(storage, `test_${index}`);
      
      const users = generateTestUsers(10);
      const docIds = table.insertMultiple(users);
      
      expect(table.length).toBe(10);
      expect(docIds).toHaveLength(10);
      
      // Test retrieval
      const retrieved = table.get(undefined, docIds[0]);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.name).toBe(users[0].name);
    });
  });

  test("should maintain data integrity across storage types", () => {
    const testData = generateTestUsers(100);
    const storageConfigs = [
      { name: "Memory", storage: () => new MemoryStorage() },
      { name: "JSON", storage: () => new JSONStorage(join(tempDir, "test.json")) },
      { name: "Binary", storage: () => new BinaryStorage(join(tempDir, "test.bin")) },
    ];

    storageConfigs.forEach(({ name, storage: createStorage }) => {
      const storage = createStorage();
      const table = new Table<TestUser>(storage, "integrity_test");
      
      table.insertMultiple(testData);
      
      // Verify all data is present and correct
      expect(table.length).toBe(100);
      
      const allDocs = table.all();
      expect(allDocs).toHaveLength(100);
      
      // Verify data integrity
      allDocs.forEach((doc, index) => {
        expect(doc.name).toBe(testData[index].name);
        expect(doc.email).toBe(testData[index].email);
        expect(doc.age).toBe(testData[index].age);
      });
    });
  });

  test("should handle storage errors gracefully", () => {
    // Test with invalid file path
    const invalidStorage = new JSONStorage("/root/invalid/path/file.json");
    
    expect(() => {
      const table = new Table<TestUser>(invalidStorage, "error_test");
      table.insert(generateTestUser());
    }).not.toThrow();
  });

  test("should perform consistently across storage types", () => {
    const testData = generateTestUsers(1000);
    const performanceResults: Record<string, number> = {};

    [
      { name: "Memory", storage: () => new MemoryStorage() },
      { name: "JSON", storage: () => new JSONStorage(join(tempDir, "perf.json")) },
      { name: "Binary", storage: () => new BinaryStorage(join(tempDir, "perf.bin")) },
    ].forEach(({ name, storage: createStorage }) => {
      const storage = createStorage();
      const table = new Table<TestUser>(storage, "perf_test");
      
      const { duration } = measurePerformance(() => {
        table.insertMultiple(testData);
      });
      
      performanceResults[name] = duration;
      
      expect(table.length).toBe(1000);
    });

    // Memory should be fastest
    expect(performanceResults.Memory).toBeLessThan(performanceResults.JSON);
    
    // All should complete in reasonable time
    Object.values(performanceResults).forEach(duration => {
      expect(duration).toBeLessThan(10000);
    });
  });
});