/**
 * Comprehensive Query tests - Where clauses, indexing, and optimization
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { Table, MemoryStorage, where, QueryPlan } from "../src/index";
import { generateTestUser, generateTestUsers, measurePerformance } from "./test-setup";

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

describe("Query System - Where Clauses", () => {
  let table: Table<TestUser>;
  let testData: TestUser[];

  beforeEach(() => {
    const storage = new MemoryStorage();
    table = new Table<TestUser>(storage, "query_test", { enableIndexing: true });
    
    // Create diverse test data
    testData = [
      { id: 1, name: "Alice", email: "alice@test.com", age: 25, department: "Engineering", active: true, salary: 75000, joinDate: new Date("2023-01-15") },
      { id: 2, name: "Bob", email: "bob@test.com", age: 30, department: "Engineering", active: true, salary: 85000, joinDate: new Date("2022-06-10") },
      { id: 3, name: "Charlie", email: "charlie@test.com", age: 35, department: "Marketing", active: false, salary: 65000, joinDate: new Date("2021-03-20") },
      { id: 4, name: "Diana", email: "diana@test.com", age: 28, department: "Sales", active: true, salary: 70000, joinDate: new Date("2023-08-05") },
      { id: 5, name: "Eve", email: "eve@test.com", age: 25, department: "Engineering", active: true, salary: 72000, joinDate: new Date("2023-02-14") },
      { id: 6, name: "Frank", email: "frank@test.com", age: 40, department: "HR", active: false, salary: 80000, joinDate: new Date("2020-11-30") },
      { id: 7, name: "Grace", email: "grace@test.com", age: 32, department: "Engineering", active: true, salary: 90000, joinDate: new Date("2022-01-12") },
      { id: 8, name: "Henry", email: "henry@test.com", age: 29, department: "Marketing", active: true, salary: 68000, joinDate: new Date("2023-04-18") },
    ];
    
    table.insertMultiple(testData);
  });

  describe("Equality Queries", () => {
    test("should find documents by string equality", () => {
      const results = table.search(where("name").equals("Alice"));
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Alice");
      expect(results[0].id).toBe(1);
    });

    test("should find documents by number equality", () => {
      const results = table.search(where("age").equals(25));
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(["Alice", "Eve"]);
    });

    test("should find documents by boolean equality", () => {
      const activeUsers = table.search(where("active").equals(true));
      const inactiveUsers = table.search(where("active").equals(false));
      
      expect(activeUsers).toHaveLength(6);
      expect(inactiveUsers).toHaveLength(2);
      expect(inactiveUsers.map(u => u.name).sort()).toEqual(["Charlie", "Frank"]);
    });

    test("should handle case-sensitive string comparisons", () => {
      const results1 = table.search(where("name").equals("alice"));
      const results2 = table.search(where("name").equals("Alice"));
      
      expect(results1).toHaveLength(0);
      expect(results2).toHaveLength(1);
    });

    test("should return empty array for non-existent values", () => {
      const results = table.search(where("name").equals("NonExistent"));
      expect(results).toHaveLength(0);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Comparison Queries", () => {
    test("should find documents with greater than", () => {
      const results = table.search(where("age").greaterThan(30));
      expect(results).toHaveLength(3);
      expect(results.every(r => r.age > 30)).toBe(true);
    });

    test("should find documents with greater than or equal", () => {
      const results = table.search(where("age").greaterThanOrEqual(30));
      expect(results).toHaveLength(4);
      expect(results.every(r => r.age >= 30)).toBe(true);
    });

    test("should find documents with less than", () => {
      const results = table.search(where("salary").lessThan(70000));
      expect(results).toHaveLength(2);
      expect(results.every(r => r.salary < 70000)).toBe(true);
    });

    test("should find documents with less than or equal", () => {
      const results = table.search(where("salary").lessThanOrEqual(70000));
      expect(results).toHaveLength(3);
      expect(results.every(r => r.salary <= 70000)).toBe(true);
    });

    test("should handle edge cases in comparisons", () => {
      const minAge = Math.min(...testData.map(u => u.age));
      const maxAge = Math.max(...testData.map(u => u.age));
      
      const belowMin = table.search(where("age").lessThan(minAge));
      const aboveMax = table.search(where("age").greaterThan(maxAge));
      
      expect(belowMin).toHaveLength(0);
      expect(aboveMax).toHaveLength(0);
    });
  });

  describe("Range Queries", () => {
    test("should find documents within range", () => {
      const results = table.search(where("age").between(25, 30));
      expect(results).toHaveLength(4);
      expect(results.every(r => r.age >= 25 && r.age <= 30)).toBe(true);
    });

    test("should handle inclusive range boundaries", () => {
      const results = table.search(where("age").between(25, 25));
      expect(results).toHaveLength(2);
      expect(results.every(r => r.age === 25)).toBe(true);
    });

    test("should handle salary ranges", () => {
      const midRange = table.search(where("salary").between(70000, 80000));
      expect(midRange).toHaveLength(4);
      expect(midRange.every(r => r.salary >= 70000 && r.salary <= 80000)).toBe(true);
    });

    test("should return empty for invalid ranges", () => {
      const results = table.search(where("age").between(50, 60));
      expect(results).toHaveLength(0);
    });
  });

  describe("Collection Queries", () => {
    test("should find documents with values in array", () => {
      const results = table.search(where("department").oneOf(["Engineering", "Marketing"]));
      expect(results).toHaveLength(6);
      expect(results.every(r => ["Engineering", "Marketing"].includes(r.department))).toBe(true);
    });

    test("should handle single value in array", () => {
      const results = table.search(where("department").oneOf(["HR"]));
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Frank");
    });

    test("should handle empty array", () => {
      const results = table.search(where("department").oneOf([]));
      expect(results).toHaveLength(0);
    });

    test("should handle non-existent values in array", () => {
      const results = table.search(where("department").oneOf(["NonExistent", "AlsoNonExistent"]));
      expect(results).toHaveLength(0);
    });
  });

  describe("Pattern Matching", () => {
    test("should match string patterns with contains", () => {
      const results = table.search(where("email").matches(/test\.com$/));
      expect(results).toHaveLength(8); // All test emails end with test.com
    });

    test("should match name patterns", () => {
      const results = table.search(where("name").matches(/^[A-C]/));
      expect(results).toHaveLength(3); // Alice, Bob, Charlie
      expect(results.map(r => r.name).sort()).toEqual(["Alice", "Bob", "Charlie"]);
    });

    test("should handle case-insensitive patterns", () => {
      const results = table.search(where("name").matches(/alice/i));
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Alice");
    });
  });

  describe("Logical Operators", () => {
    test("should combine queries with AND", () => {
      const results = table.search(
        where("department").equals("Engineering")
        .and(where("age").greaterThan(25))
      );
      expect(results).toHaveLength(2); // Bob and Grace
      expect(results.every(r => r.department === "Engineering" && r.age > 25)).toBe(true);
    });

    test("should combine queries with OR", () => {
      const results = table.search(
        where("age").equals(25)
        .or(where("department").equals("HR"))
      );
      expect(results).toHaveLength(3); // Alice, Eve, Frank
    });

    test("should handle complex logical combinations", () => {
      const results = table.search(
        where("department").equals("Engineering")
        .and(where("active").equals(true))
        .and(where("salary").greaterThan(70000))
      );
      expect(results).toHaveLength(3); // Bob, Eve, Grace
    });

    test("should handle nested logical operations", () => {
      const results = table.search(
        where("age").greaterThan(30)
        .or(
          where("department").equals("Engineering")
          .and(where("salary").lessThan(80000))
        )
      );
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("Custom Function Queries", () => {
    test("should filter with custom functions", () => {
      const results = table.search((user: TestUser) => {
        return user.name.length > 5;
      });
      expect(results).toHaveLength(2); // Charlie, Diana
    });

    test("should handle complex custom logic", () => {
      const results = table.search((user: TestUser) => {
        const joinYear = user.joinDate.getFullYear();
        return joinYear === 2023 && user.salary > 70000;
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.joinDate.getFullYear() === 2023 && r.salary > 70000)).toBe(true);
    });

    test("should handle function errors gracefully", () => {
      const results = table.search((user: TestUser) => {
        // Potentially problematic function
        return (user as any).nonExistentProperty?.someMethod?.();
      });
      expect(results).toHaveLength(0); // Should not throw, return empty
    });
  });
});

describe("Query System - Performance and Optimization", () => {
  let table: Table<TestUser>;

  beforeEach(() => {
    const storage = new MemoryStorage();
    table = new Table<TestUser>(storage, "perf_test", { enableIndexing: true });
    
    // Insert large dataset for performance testing
    const users = generateTestUsers(10000);
    table.insertMultiple(users);
  });

  describe("Query Performance", () => {
    test("should execute simple equality queries efficiently", () => {
      const { duration } = measurePerformance(() => {
        table.search(where("department").equals("Engineering"));
      });
      
      expect(duration).toBeLessThan(100); // Should be fast with indexing
    });

    test("should handle range queries efficiently", () => {
      const { duration } = measurePerformance(() => {
        table.search(where("age").between(25, 35));
      });
      
      expect(duration).toBeLessThan(200);
    });

    test("should maintain performance with complex queries", () => {
      const { duration } = measurePerformance(() => {
        table.search(
          where("department").equals("Engineering")
          .and(where("active").equals(true))
          .and(where("salary").greaterThan(50000))
        );
      });
      
      expect(duration).toBeLessThan(300);
    });

    test("should handle multiple simultaneous queries", () => {
      const queries = [
        () => table.search(where("department").equals("Engineering")),
        () => table.search(where("age").greaterThan(30)),
        () => table.search(where("active").equals(true)),
        () => table.search(where("salary").between(50000, 100000)),
      ];

      const { duration } = measurePerformance(() => {
        queries.forEach(query => query());
      });
      
      expect(duration).toBeLessThan(500);
    });
  });

  describe("Query Planner", () => {
    test("should provide query execution plans", () => {
      const plan = table.explainQuery(where("department").equals("Engineering"));
      
      expect(plan).toBeTruthy();
      expect(plan!.executionStrategy).toMatch(/^(index_scan|full_scan|hybrid)$/);
      expect(typeof plan!.estimatedCost).toBe('number');
      expect(typeof plan!.estimatedSelectivity).toBe('number');
      expect(typeof plan!.confidence).toBe('number');
    });

    test("should choose appropriate strategies for different query types", () => {
      const equalityPlan = table.explainQuery(where("department").equals("Engineering"));
      const rangePlan = table.explainQuery(where("age").between(25, 35));
      const complexPlan = table.explainQuery(
        where("department").equals("Engineering")
        .and(where("age").greaterThan(25))
      );

      expect(equalityPlan).toBeTruthy();
      expect(rangePlan).toBeTruthy();
      expect(complexPlan).toBeTruthy();

      // Plans should have different characteristics
      expect([equalityPlan!.executionStrategy, rangePlan!.executionStrategy, complexPlan!.executionStrategy])
        .toContain("index_scan");
    });

    test("should estimate costs accurately", () => {
      const simplePlan = table.explainQuery(where("id").equals(1));
      const complexPlan = table.explainQuery(where("age").greaterThan(0)); // Should match many

      expect(simplePlan!.estimatedCost).toBeLessThan(complexPlan!.estimatedCost);
      expect(simplePlan!.estimatedSelectivity).toBeLessThan(complexPlan!.estimatedSelectivity);
    });
  });

  describe("Index Management", () => {
    test("should create and use indexes automatically", () => {
      // Query should trigger index creation
      const results1 = table.search(where("department").equals("Engineering"));
      const results2 = table.search(where("department").equals("Marketing"));
      
      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);
      
      // Subsequent queries should be faster (using index)
      const { duration } = measurePerformance(() => {
        table.search(where("department").equals("Sales"));
      });
      
      expect(duration).toBeLessThan(50);
    });

    test("should provide index statistics", () => {
      // Trigger index creation
      table.search(where("department").equals("Engineering"));
      
      const stats = table.getIndexStats("department");
      expect(stats).toBeTruthy();
      expect(typeof stats.totalEntries).toBe('number');
    });

    test("should handle index creation and deletion", () => {
      table.createIndex("salary");
      const stats = table.getIndexStats("salary");
      expect(stats).toBeTruthy();
      
      // Test index usage
      const { duration } = measurePerformance(() => {
        table.search(where("salary").greaterThan(75000));
      });
      
      expect(duration).toBeLessThan(100);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle empty query results", () => {
      const results = table.search(where("age").equals(999));
      expect(results).toHaveLength(0);
      expect(Array.isArray(results)).toBe(true);
    });

    test("should handle invalid query construction", () => {
      expect(() => {
        table.search(where("").equals(""));
      }).not.toThrow(); // Should handle gracefully
    });

    test("should handle queries on non-existent fields", () => {
      const results = table.search(where("nonExistentField" as any).equals("value"));
      expect(results).toHaveLength(0);
    });

    test("should handle type mismatches in queries", () => {
      const results = table.search(where("age").equals("not a number" as any));
      expect(results).toHaveLength(0);
    });

    test("should handle null and undefined values", () => {
      // Add document with null values
      table.insert({ ...generateTestUser(), department: null as any });
      
      const nullResults = table.search(where("department").equals(null));
      const undefinedResults = table.search(where("department").equals(undefined));
      
      expect(Array.isArray(nullResults)).toBe(true);
      expect(Array.isArray(undefinedResults)).toBe(true);
    });
  });
});