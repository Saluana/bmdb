# BMDB Relationships Guide

This guide covers how to use relationships in BMDB to create linked documents with cascade delete functionality.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

BMDB relationships allow you to:
- **Link documents** between schema tables using foreign key relationships
- **Cascade delete** child records when parent records are deleted
- **Query relationships** efficiently with built-in helper methods
- **Persist relationships** automatically across database restarts

### Key Features

✅ **Schema tables only** - Relationships work exclusively with schema tables  
✅ **Fluent API** - Chainable method calls for defining multiple relationships  
✅ **Automatic persistence** - Relationships are saved and restored automatically  
✅ **Safe cascade deletes** - Self-referencing relationships are protected from infinite loops  
✅ **Query helpers** - Built-in methods for finding, counting, and checking child records  

## Quick Start

```typescript
import { TinyDB, JSONStorage, createSchema, primaryKey, unique } from 'bmdb';
import { z } from 'zod';

// Define schemas
const userSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  name: z.string(),
  email: z.string().email(),
}), 'users');

const postSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  title: z.string(),
  content: z.string(),
  user_id: z.string(), // Foreign key to users.id
}), 'posts');

// Create database and tables
const db = new TinyDB('./myapp.bmdb', { storage: JSONStorage });
const users = db.schemaTable(userSchema);
const posts = db.schemaTable(postSchema);

// Define relationship with cascade delete
users.hasMany('id', 'posts', 'user_id', true);

// Insert data
const userId = users.insert({ 
  id: 'user-1', 
  name: 'Alice', 
  email: 'alice@example.com' 
});

posts.insert({ 
  id: 'post-1', 
  title: 'Hello World', 
  content: 'My first post', 
  user_id: 'user-1' 
});

// Query relationships
const userPosts = users.findChildren('user-1', 'posts');
console.log(userPosts); // [{ id: 'post-1', title: 'Hello World', ... }]

// Delete user - automatically deletes related posts
users.remove(where('id').equals('user-1'));
console.log(posts.all()); // [] - post was cascade deleted
```

## API Reference

### Defining Relationships

#### `hasMany(parentField, childTable, childField, cascadeDelete?)`

Defines a one-to-many relationship from this table to a child table.

**Parameters:**
- `parentField` (string): Field in the parent table (this table)
- `childTable` (string): Name of the child table
- `childField` (string): Field in the child table that references the parent
- `cascadeDelete` (boolean, optional): Whether to delete children when parent is deleted. Default: `true`

**Returns:** `this` (for method chaining)

**Example:**
```typescript
// User has many posts (with cascade delete)
users.hasMany('id', 'posts', 'user_id', true);

// User has many comments (without cascade delete)
users.hasMany('id', 'comments', 'user_id', false);

// Method chaining
users
  .hasMany('id', 'posts', 'user_id', true)
  .hasMany('id', 'comments', 'user_id', false)
  .hasMany('id', 'likes', 'user_id', false);
```

### Querying Relationships

#### `findChildren(parentId, childTable?)`

Finds all child records for a given parent ID.

**Parameters:**
- `parentId` (any): The ID of the parent record
- `childTable` (string, optional): Specific child table to search. If omitted, searches all related tables

**Returns:** Array of child records

**Example:**
```typescript
// Find all posts by user-1
const userPosts = users.findChildren('user-1', 'posts');

// Find all children across all relationships
const allChildren = users.findChildren('user-1');
```

#### `countChildren(parentId, childTable?)`

Counts child records for a given parent ID.

**Parameters:**
- `parentId` (any): The ID of the parent record  
- `childTable` (string, optional): Specific child table to count

**Returns:** Number of child records

**Example:**
```typescript
// Count posts by user-1
const postCount = users.countChildren('user-1', 'posts');

// Count all children
const totalChildren = users.countChildren('user-1');
```

#### `hasChildren(parentId, childTable?)`

Checks if a parent record has any children.

**Parameters:**
- `parentId` (any): The ID of the parent record
- `childTable` (string, optional): Specific child table to check

**Returns:** `true` if parent has children, `false` otherwise

**Example:**
```typescript
// Check if user has posts
const hasPosts = users.hasChildren('user-1', 'posts');

// Check if user has any children
const hasAnyChildren = users.hasChildren('user-1');
```

### Managing Relationships

#### `getRelationships()`

Gets all relationships defined for this table.

**Returns:** Array of `RelationshipConfig` objects

**Example:**
```typescript
const relationships = users.getRelationships();
console.log(relationships);
// [
//   {
//     parentField: 'id',
//     childTable: 'posts', 
//     childField: 'user_id',
//     cascadeDelete: true
//   }
// ]
```

#### `removeRelationship(parentField, childTable, childField)`

Removes a specific relationship.

**Parameters:**
- `parentField` (string): Parent field name
- `childTable` (string): Child table name  
- `childField` (string): Child field name

**Returns:** `this` (for method chaining)

**Example:**
```typescript
users.removeRelationship('id', 'posts', 'user_id');
```

#### `clearRelationships()`

Removes all relationships from this table.

**Returns:** `this` (for method chaining)

**Example:**
```typescript
users.clearRelationships();
```

### Cascade Delete Relationships

#### `getCascadeDeleteRelationships()`

Gets only relationships that have cascade delete enabled.

**Returns:** Array of `RelationshipConfig` objects with `cascadeDelete: true`

**Example:**
```typescript
const cascadeRels = users.getCascadeDeleteRelationships();
```

## Examples

### Basic Blog System

```typescript
import { TinyDB, JSONStorage, createSchema, primaryKey, unique, where } from 'bmdb';
import { z } from 'zod';

// Define schemas
const userSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  username: z.string(),
  email: z.string().email(),
  created_at: z.date().default(() => new Date()),
}), 'users');

const postSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  title: z.string(),
  content: z.string(),
  user_id: z.string(),
  created_at: z.date().default(() => new Date()),
}), 'posts');

const commentSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  content: z.string(),
  post_id: z.string(),
  user_id: z.string(),
  created_at: z.date().default(() => new Date()),
}), 'comments');

// Create database
const db = new TinyDB('./blog.bmdb', { storage: JSONStorage });
const users = db.schemaTable(userSchema);
const posts = db.schemaTable(postSchema);
const comments = db.schemaTable(commentSchema);

// Define relationships
users.hasMany('id', 'posts', 'user_id', true);      // User has many posts
users.hasMany('id', 'comments', 'user_id', false);  // User has many comments (keep comments if user deleted)
posts.hasMany('id', 'comments', 'post_id', true);   // Post has many comments

// Create test data
const alice = users.insert({
  id: 'user-1',
  username: 'alice',
  email: 'alice@example.com'
});

const bob = users.insert({
  id: 'user-2', 
  username: 'bob',
  email: 'bob@example.com'
});

const post1 = posts.insert({
  id: 'post-1',
  title: 'Getting Started with BMDB',
  content: 'BMDB is a lightweight database...',
  user_id: 'user-1'
});

const post2 = posts.insert({
  id: 'post-2',
  title: 'Advanced BMDB Features',
  content: 'In this post we explore...',
  user_id: 'user-1'
});

comments.insert({
  id: 'comment-1',
  content: 'Great post!',
  post_id: 'post-1',
  user_id: 'user-2'
});

comments.insert({
  id: 'comment-2', 
  content: 'Thanks for sharing',
  post_id: 'post-1',
  user_id: 'user-2'
});

// Query relationships
console.log('Alice has', users.countChildren('user-1', 'posts'), 'posts');
console.log('Post 1 has', posts.countChildren('post-1', 'comments'), 'comments');

// Get all posts by Alice
const alicePosts = users.findChildren('user-1', 'posts');
console.log('Alice posts:', alicePosts.map(p => p.title));

// Get all comments on post 1
const post1Comments = posts.findChildren('post-1', 'comments');
console.log('Post 1 comments:', post1Comments.map(c => c.content));

// Delete a post - cascades to comments
posts.remove(where('id').equals('post-1'));
console.log('Comments after deleting post 1:', comments.all().length); // 0

// Delete Alice - cascades to her posts, but not her comments
users.remove(where('id').equals('user-1'));
console.log('Posts after deleting Alice:', posts.all().length); // 0  
console.log('Comments after deleting Alice:', comments.all().length); // 0 (were deleted when posts were deleted)
```

### E-commerce System

```typescript
// Define schemas for an e-commerce system
const customerSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  name: z.string(),
  email: z.string().email(),
}), 'customers');

const orderSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  customer_id: z.string(),
  total: z.number(),
  status: z.enum(['pending', 'shipped', 'delivered']),
  created_at: z.date().default(() => new Date()),
}), 'orders');

const orderItemSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  order_id: z.string(),
  product_name: z.string(),
  quantity: z.number(),
  price: z.number(),
}), 'order_items');

// Create tables
const customers = db.schemaTable(customerSchema);
const orders = db.schemaTable(orderSchema);
const orderItems = db.schemaTable(orderItemSchema);

// Define relationships
customers
  .hasMany('id', 'orders', 'customer_id', false); // Keep orders when customer deleted for audit

orders
  .hasMany('id', 'order_items', 'order_id', true); // Delete items when order deleted

// Usage
const customer = customers.insert({
  id: 'cust-1',
  name: 'John Doe',
  email: 'john@example.com'
});

const order = orders.insert({
  id: 'order-1',
  customer_id: 'cust-1',
  total: 99.99,
  status: 'pending'
});

orderItems.insert({
  id: 'item-1',
  order_id: 'order-1',
  product_name: 'Widget',
  quantity: 2,
  price: 49.99
});

// Query customer's orders
const customerOrders = customers.findChildren('cust-1', 'orders');
console.log(`Customer has ${customerOrders.length} orders`);

// Query order items
const items = orders.findChildren('order-1', 'order_items');
console.log(`Order has ${items.length} items`);
```

### Self-Referencing Relationships (Categories)

```typescript
const categorySchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  name: z.string(),
  parent_id: z.string().optional(),
}), 'categories');

const categories = db.schemaTable(categorySchema);

// Define self-referencing relationship 
// Note: Cascade delete is automatically disabled for self-referencing relationships
categories.hasMany('id', 'categories', 'parent_id', true);

// Create hierarchical categories
categories.insert({ id: 'cat-1', name: 'Electronics' });
categories.insert({ id: 'cat-2', name: 'Computers', parent_id: 'cat-1' });
categories.insert({ id: 'cat-3', name: 'Laptops', parent_id: 'cat-2' });
categories.insert({ id: 'cat-4', name: 'Gaming Laptops', parent_id: 'cat-3' });

// Find subcategories
const subcategories = categories.findChildren('cat-1'); // All descendants
const directChildren = categories.findChildren('cat-2'); // Direct children only

// Note: Deleting a parent category will NOT cascade delete children
// to prevent infinite loops. Handle manually if needed.
```

### Multi-level Cascade Delete

```typescript
// University system with multi-level relationships
const universitySchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  name: z.string(),
}), 'universities');

const departmentSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  name: z.string(),
  university_id: z.string(),
}), 'departments');

const courseSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  name: z.string(),
  department_id: z.string(),
}), 'courses');

const enrollmentSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  student_name: z.string(),
  course_id: z.string(),
}), 'enrollments');

// Create tables
const universities = db.schemaTable(universitySchema);
const departments = db.schemaTable(departmentSchema);
const courses = db.schemaTable(courseSchema);
const enrollments = db.schemaTable(enrollmentSchema);

// Define cascading relationships
universities.hasMany('id', 'departments', 'university_id', true);
departments.hasMany('id', 'courses', 'department_id', true);
courses.hasMany('id', 'enrollments', 'course_id', true);

// Create test data
universities.insert({ id: 'uni-1', name: 'Tech University' });
departments.insert({ id: 'dept-1', name: 'Computer Science', university_id: 'uni-1' });
courses.insert({ id: 'course-1', name: 'Database Systems', department_id: 'dept-1' });
enrollments.insert({ id: 'enroll-1', student_name: 'Alice', course_id: 'course-1' });

// Deleting university cascades through all levels
universities.remove(where('id').equals('uni-1'));
// This will cascade delete:
// 1. University -> Departments
// 2. Departments -> Courses  
// 3. Courses -> Enrollments
```

## Best Practices

### 1. Use Descriptive Relationship Names

```typescript
// Good: Clear parent->child relationship
users.hasMany('id', 'posts', 'author_id', true);
posts.hasMany('id', 'comments', 'post_id', true);

// Avoid: Ambiguous field names
users.hasMany('id', 'posts', 'ref', true);
```

### 2. Consider Cascade Delete Carefully

```typescript
// Enable cascade delete for dependent data
users.hasMany('id', 'posts', 'user_id', true);        // Posts depend on users
posts.hasMany('id', 'comments', 'post_id', true);     // Comments depend on posts

// Disable cascade delete for audit/historical data
users.hasMany('id', 'orders', 'customer_id', false);  // Keep orders for audit
orders.hasMany('id', 'payments', 'order_id', false);  // Keep payment records
```

### 3. Handle Self-Referencing Relationships Carefully

```typescript
// Self-referencing relationships automatically disable cascade delete
categories.hasMany('id', 'categories', 'parent_id', true);

// Handle deletion manually if needed
function deleteCategory(categoryId) {
  // Find and handle children first
  const children = categories.findChildren(categoryId);
  for (const child of children) {
    // Either move to new parent or delete recursively
    categories.update({ parent_id: null }, where('id').equals(child.id));
  }
  
  // Then delete the category
  categories.remove(where('id').equals(categoryId));
}
```

### 4. Validate Foreign Keys

```typescript
// Use Zod validation to ensure foreign key integrity
const postSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  title: z.string(),
  content: z.string(),
  user_id: z.string().refine(async (userId) => {
    // Validate that user exists
    const user = users.search(where('id').equals(userId));
    return user.length > 0;
  }, 'User must exist'),
}), 'posts');
```

### 5. Use Query Helpers Efficiently

```typescript
// Check existence before expensive operations
if (users.hasChildren(userId, 'posts')) {
  const posts = users.findChildren(userId, 'posts');
  // Process posts...
}

// Use counting for pagination
const totalPosts = users.countChildren(userId, 'posts');
const postsPerPage = 10;
const totalPages = Math.ceil(totalPosts / postsPerPage);
```

## Troubleshooting

### Common Issues

#### 1. Relationships Not Persisting

**Problem:** Relationships disappear after database restart.

**Solution:** Ensure tables have data before closing the database. Empty tables may not be persisted.

```typescript
// Add some data to ensure persistence
users.insert({ id: 'temp', name: 'temp', email: 'temp@example.com' });
posts.insert({ title: 'temp', content: 'temp', user_id: 'temp' });

// Define relationships
users.hasMany('id', 'posts', 'user_id', true);

// Remove temp data if needed
users.remove(where('id').equals('temp'));
posts.remove(where('title').equals('temp'));
```

#### 2. Cascade Delete Not Working

**Problem:** Child records aren't deleted when parent is deleted.

**Solution:** Verify cascade delete is enabled and relationship is correctly defined.

```typescript
// Check relationships
console.log(users.getRelationships());
console.log(users.getCascadeDeleteRelationships());

// Ensure cascade delete is enabled
users.hasMany('id', 'posts', 'user_id', true); // true = cascade delete enabled
```

#### 3. Self-Referencing Infinite Loops

**Problem:** Stack overflow when deleting self-referencing records.

**Solution:** BMDB automatically prevents this, but handle manually if needed.

```typescript
// Self-referencing cascade delete is automatically disabled
categories.hasMany('id', 'categories', 'parent_id', true);

// Warning will be shown: "Self-referencing relationship detected"
// Cascade delete will be skipped automatically
```

#### 4. Query Helpers Return Wrong Results

**Problem:** findChildren/hasChildren return incorrect data.

**Solution:** Ensure field names match exactly and data types are consistent.

```typescript
// Ensure field names match exactly
users.hasMany('id', 'posts', 'user_id', true);
//           ^^^^         ^^^^^^^^
//       parent field   child field

// Check data types match
const user = users.insert({ id: 'user-1', ... });    // string ID
const post = posts.insert({ user_id: 'user-1', ... }); // string foreign key
```

### Performance Tips

1. **Use specific table queries** when possible:
   ```typescript
   // Faster - searches only posts table
   const posts = users.findChildren(userId, 'posts');
   
   // Slower - searches all related tables
   const allChildren = users.findChildren(userId);
   ```

2. **Check existence before counting**:
   ```typescript
   // Faster for checking existence
   if (users.hasChildren(userId)) {
     // User has children
   }
   
   // Slower if you only need to check existence
   if (users.countChildren(userId) > 0) {
     // User has children
   }
   ```

3. **Batch relationship definitions**:
   ```typescript
   // Efficient - chains relationship definitions
   users
     .hasMany('id', 'posts', 'user_id', true)
     .hasMany('id', 'comments', 'user_id', false)
     .hasMany('id', 'likes', 'user_id', false);
   ```

## Schema Integration

Relationships work seamlessly with BMDB schema features:

```typescript
// Combine with schema validation
const userSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).default('user'),
  created_at: z.date().default(() => new Date()),
}), 'users');

const postSchema = createSchema(z.object({
  id: unique(primaryKey(z.string())),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  user_id: z.string(), // Foreign key
  published: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  created_at: z.date().default(() => new Date()),
}), 'posts');

// Use with indexes for better performance
const users = db.schemaTable(userSchema);
const posts = db.schemaTable(postSchema);

// Create index on foreign key for better query performance
posts.createIndex('user_id');

// Define relationship
users.hasMany('id', 'posts', 'user_id', true);
```

---

*This guide covers the complete relationships API in BMDB. For more information about schemas, queries, and other features, see the [Schema Guide](./SCHEMA_GUIDE.md) and [Query Guide](./QUERY_GUIDE.md).*