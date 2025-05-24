#!/usr/bin/env bun

/**
 * Comprehensive demo of the Binary Storage implementation
 * 
 * Features demonstrated:
 * - MessagePack binary serialization for compact storage
 * - Memory-mapped B-tree index for fast lookups
 * - Efficient document-level reads (no full file deserialization)
 * - Persistence across database reopens
 * - File format with separate B-tree and document areas
 */

import { TinyDB, BinaryStorage, where } from "./src/index";
import { unlinkSync, existsSync, statSync } from "fs";

console.log("🚀 Binary Storage Demo - TinyDB with Custom Binary Format");
console.log("================================================================");

const dbPath = "demo.bmdb";

// Clean up any existing demo file
if (existsSync(dbPath)) {
  unlinkSync(dbPath);
}

// Create database with binary storage
console.log("\n📁 Creating database with BinaryStorage...");
const db = new TinyDB(dbPath, { storage: BinaryStorage });

// Insert sample data
console.log("\n📝 Inserting sample data...");
const products = [
  { name: "iPhone 15", category: "electronics", price: 999, inStock: true },
  { name: "MacBook Pro", category: "electronics", price: 2499, inStock: false },
  { name: "AirPods", category: "electronics", price: 249, inStock: true },
  { name: "Office Chair", category: "furniture", price: 299, inStock: true },
  { name: "Standing Desk", category: "furniture", price: 599, inStock: false },
];

const productIds = [];
for (const product of products) {
  const id = db.insert(product);
  productIds.push(id);
  console.log(`  ✓ Inserted ${product.name} (ID: ${id})`);
}

// Create a separate table for orders
console.log("\n🛒 Creating orders table...");
const ordersTable = db.table('orders');
const orders = [
  { productId: 1, quantity: 2, customerEmail: "john@example.com", date: "2024-01-15" },
  { productId: 3, quantity: 1, customerEmail: "jane@example.com", date: "2024-01-16" },
  { productId: 4, quantity: 1, customerEmail: "bob@example.com", date: "2024-01-17" },
];

for (const order of orders) {
  const id = ordersTable.insert(order);
  console.log(`  ✓ Inserted order for product ${order.productId} (Order ID: ${id})`);
}

// Demonstrate efficient queries
console.log("\n🔍 Performing efficient queries...");

// Query 1: Find electronics in stock
const electronicsInStock = db.search(
  where('category').__eq__('electronics')
    .and(where('inStock').__eq__(true))
);
console.log(`  📱 Electronics in stock: ${electronicsInStock.length} items`);
electronicsInStock.forEach(item => {
  const doc = item.toJSON();
  console.log(`    - ${doc.name}: $${doc.price}`);
});

// Query 2: Find expensive items
const expensiveItems = db.search(where('price').__gt__(500));
console.log(`  💰 Items over $500: ${expensiveItems.length} items`);
expensiveItems.forEach(item => {
  const doc = item.toJSON();
  console.log(`    - ${doc.name}: $${doc.price}`);
});

// Query 3: Find recent orders
const recentOrders = ordersTable.search(where('date').__ge__('2024-01-16'));
console.log(`  📦 Recent orders: ${recentOrders.length} orders`);
recentOrders.forEach(order => {
  const doc = order.toJSON();
  console.log(`    - Order ${doc.productId} for ${doc.customerEmail}`);
});

// Show file statistics
console.log("\n📊 Binary storage statistics:");
if ('getStats' in db.storage) {
  const stats = (db.storage as any).getStats();
  console.log(`  File size: ${(stats.fileSize / 1024).toFixed(1)} KB`);
  console.log(`  Documents: ${stats.documentCount}`);
  console.log(`  B-tree nodes: ${stats.btreeNodes}`);
  console.log(`  Document area starts at: ${(stats.freeSpaceOffset / 1024).toFixed(1)} KB`);
}

// Update some data
console.log("\n✏️  Updating data...");
const updatedCount = db.update(
  { inStock: true },
  where('name').__eq__('MacBook Pro')
);
console.log(`  ✓ Updated ${updatedCount} items (MacBook Pro now in stock)`);

// Close and reopen database to test persistence
console.log("\n💾 Testing persistence...");
db.close();
console.log("  ✓ Database closed");

const db2 = new TinyDB(dbPath, { storage: BinaryStorage });
console.log("  ✓ Database reopened");

// Verify data persisted
const allProducts = db2.all();
const allOrders = db2.table('orders').all();
console.log(`  📊 Persisted: ${allProducts.length} products, ${allOrders.length} orders`);

// Show that MacBook Pro is now in stock
const macbook = db2.search(where('name').__eq__('MacBook Pro'))[0];
if (macbook) {
  const doc = macbook.toJSON();
  console.log(`  ✓ MacBook Pro in stock: ${doc.inStock}`);
}

// Demonstrate performance - reading specific documents without full deserialization
console.log("\n⚡ Performance demo - reading single documents:");
console.time("Read single product");
const singleProduct = db2.search(where('name').__eq__('iPhone 15'))[0];
console.timeEnd("Read single product");
if (singleProduct) {
  const doc = singleProduct.toJSON();
  console.log(`  Found: ${doc.name} - $${doc.price}`);
}

// Clean up
db2.close();

// Show final file size
if (existsSync(dbPath)) {
  const finalSize = statSync(dbPath).size;
  console.log(`\n📁 Final database file size: ${(finalSize / 1024).toFixed(1)} KB`);
  
  // Clean up demo file
  unlinkSync(dbPath);
  console.log("  ✓ Demo file cleaned up");
}

console.log("\n🎉 Binary Storage Demo completed!");
console.log("\nKey features demonstrated:");
console.log("  ✓ MessagePack binary serialization (compact storage)");
console.log("  ✓ B-tree index for fast document lookups");
console.log("  ✓ Memory-mapped header for efficient reads");
console.log("  ✓ Document-level access (no full file deserialization)");
console.log("  ✓ Persistence across database sessions");
console.log("  ✓ Multiple tables in single binary file");
console.log("  ✓ Complex queries with binary storage backend");