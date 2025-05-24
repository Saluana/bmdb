#!/usr/bin/env bun

import { TinyDB, Query, where, MemoryStorage } from "./src/index";

console.log("Testing TinyDB TypeScript implementation...");

// Create a database with in-memory storage for testing
const db = new TinyDB(undefined, { storage: MemoryStorage });

console.log("\n1. Testing basic insertion:");
const id1 = db.insert({ type: 'apple', count: 7 });
const id2 = db.insert({ type: 'peach', count: 3 });
console.log(`Inserted documents with IDs: ${id1}, ${id2}`);

console.log("\n2. Testing db.all():");
console.log("All documents:", db.all());

console.log("\n3. Testing iteration:");
console.log("Iterating over documents:");
for (const item of db) {
  console.log(item);
}

console.log("\n4. Testing Query system:");
const Fruit = new Query();

try {
  // Create a proxy for the Query to handle property access
  const FruitProxy = new Proxy(new Query(), {
    get(target, prop) {
      if (typeof prop === 'string' && !(prop in target)) {
        return (target as any).__getattr__(prop);
      }
      return Reflect.get(target, prop);
    }
  });

  console.log("\n5. Testing search with Query:");
  const peachQuery = where('type').__eq__('peach');
  const peaches = db.search(peachQuery);
  console.log("Peaches:", peaches);

  const countQuery = where('count').__gt__(5);
  const highCount = db.search(countQuery);
  console.log("High count fruits:", highCount);

} catch (error) {
  console.error("Query error:", error);
}

console.log("\n6. Testing updates:");
const updateQuery = where('type').__eq__('apple');
const updated = db.update({ count: 10 }, updateQuery);
console.log("Updated documents:", updated);
console.log("All documents after update:", db.all());

console.log("\n7. Testing removal:");
const removeQuery = where('count').__lt__(5);
const removed = db.remove(removeQuery);
console.log("Removed documents:", removed);
console.log("All documents after removal:", db.all());

console.log("\n8. Testing table operations:");
const fruitTable = db.table('fruits');
fruitTable.insert({ name: 'banana', color: 'yellow' });
fruitTable.insert({ name: 'grape', color: 'purple' });

console.log("Fruit table documents:", fruitTable.all());
console.log("All tables:", Array.from(db.tables()));

console.log("\nTinyDB TypeScript implementation test completed!");