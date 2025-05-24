# Basic Usage Examples

This document provides practical examples of common BMDB operations.

## 📚 Table of Contents

- [Database Setup](#database-setup)
- [CRUD Operations](#crud-operations)
- [Querying Data](#querying-data)
- [Working with Tables](#working-with-tables)
- [Pagination](#pagination)
- [Error Handling](#error-handling)

## 🏗️ Database Setup

### Simple Database Creation

```typescript
import { TinyDB } from 'bmdb';

// Create a database with default JSONStorage
const db = new TinyDB('my-app.json');

// Always remember to close when done
process.on('exit', () => db.close());
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
```

### Database with Different Storage Engines

```typescript
import { TinyDB, WALJSONStorage, MemoryStorage, BinaryStorage } from 'bmdb';

// High-performance WAL storage for production
const prodDb = new TinyDB('production.json', WALJSONStorage, {
  batchSize: 1000,
  maxBatchWaitMs: 20
});

// In-memory storage for testing
const testDb = new TinyDB(MemoryStorage);

// Binary storage for large datasets
const dataDb = new TinyDB('data.bmdb', BinaryStorage);
```

## 🔄 CRUD Operations

### Create (Insert) Documents

```typescript
const users = db.table('users');

// Insert single document
const userId = users.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  role: 'developer'
});

console.log('Created user with ID:', userId);

// Insert multiple documents
const userIds = users.insertMultiple([
  { name: 'Alice Smith', email: 'alice@example.com', age: 28, role: 'designer' },
  { name: 'Bob Johnson', email: 'bob@example.com', age: 35, role: 'manager' },
  { name: 'Carol White', email: 'carol@example.com', age: 32, role: 'developer' }
]);

console.log('Created users with IDs:', userIds);

// Insert with default table (shorthand)
const docId = db.insert({ message: 'Hello, World!', timestamp: new Date() });
```

### Read Documents

```typescript
const users = db.table('users');

// Get all documents
const allUsers = users.all();
console.log('All users:', allUsers);

// Get by document ID
const user = users.get(undefined, userId);
console.log('User by ID:', user);

// Get multiple by IDs
const someUsers = users.get(undefined, undefined, [1, 2, 3]);
console.log('Multiple users:', someUsers);

// Get first matching condition
const developer = users.get({ role: 'developer' });
console.log('First developer:', developer);

// Check if document exists
const exists = users.contains(undefined, userId);
console.log('User exists:', exists);

// Count documents
const totalUsers = users.count({});
const developers = users.count({ role: 'developer' });
console.log(`Total users: ${totalUsers}, Developers: ${developers}`);
```

### Update Documents

```typescript
const users = db.table('users');

// Update by condition
const updatedIds = users.update(
  { lastLogin: new Date(), status: 'active' },
  { email: 'john@example.com' }
);
console.log('Updated user IDs:', updatedIds);

// Update specific documents by ID
const specificUpdates = users.update(
  { role: 'senior developer' },
  undefined,
  [1, 3, 5]  // Document IDs
);

// Update with operators
import { increment, set, add } from 'bmdb';

users.update(
  [
    increment('loginCount'),
    set('lastSeen', new Date()),
    add('score', 10)
  ],
  { id: 'user_123' }
);

// Update multiple with different conditions
const multipleUpdates = users.updateMultiple([
  [{ status: 'premium' }, { role: 'manager' }],
  [{ lastNotified: new Date() }, { email: { $endsWith: '@company.com' } }]
]);
```

### Delete Documents

```typescript
const users = db.table('users');

// Remove by condition
const removedIds = users.remove({ status: 'inactive' });
console.log('Removed inactive users:', removedIds);

// Remove specific documents
const specificRemovals = users.remove(undefined, [2, 4, 6]);

// Remove all documents from table
users.truncate();
console.log('All users removed');
```

### Upsert (Update or Insert)

```typescript
const users = db.table('users');

// Update if exists, insert if not
const upsertIds = users.upsert(
  { 
    email: 'new@example.com',
    name: 'New User',
    role: 'user'
  },
  { email: 'new@example.com' }  // condition to check for existing
);

console.log('Upserted document IDs:', upsertIds);
```

## 🔍 Querying Data

### Simple Queries

```typescript
const users = db.table('users');

// Exact field matching
const admins = users.search({ role: 'admin' });
const activeUsers = users.search({ status: 'active' });

// Multiple conditions (AND by default)
const activeAdmins = users.search({
  role: 'admin',
  status: 'active'
});

// Age range
const adults = users.search({
  age: { $gte: 18 }
});

const middleAged = users.search({
  age: { $gte: 30, $lte: 50 }
});
```

### Complex Queries

```typescript
import { where } from 'bmdb';

const users = db.table('users');

// Using where clause builder
const seniorDevelopers = users.search(
  where('role').equals('developer').and(where('age').gte(35))
);

// String operations
const companyEmails = users.search(
  where('email').endsWith('@company.com')
);

const johnUsers = users.search(
  where('name').startsWith('John')
);

// Regular expressions
const phonePattern = users.search(
  where('phone').matches(/^\+1-\d{3}-\d{3}-\d{4}$/)
);

// Array operations
const premiumUsers = users.search(
  where('tags').contains('premium')
);

const skillfulUsers = users.search(
  where('skills').size(3)  // Users with exactly 3 skills
);

// Nested object queries
const notificationUsers = users.search(
  where('preferences.notifications').equals(true)
);
```

### Logical Operators

```typescript
const users = db.table('users');

// OR conditions
const powerUsers = users.search({
  $or: [
    { role: 'admin' },
    { role: 'moderator' },
    { permissions: { $contains: 'admin' } }
  ]
});

// Complex AND/OR combinations
const eligibleUsers = users.search({
  $and: [
    { age: { $gte: 18 } },
    {
      $or: [
        { verified: true },
        { accountType: 'premium' }
      ]
    }
  ]
});

// NOT conditions
const nonAdmins = users.search({
  $not: { role: 'admin' }
});

// Existence checks
const usersWithProfiles = users.search({
  profile: { $exists: true }
});

const stringFields = users.search({
  bio: { $type: 'string' }
});
```

### Array and Collection Queries

```typescript
const users = db.table('users');

// Array contains specific value
const jsUsers = users.search({
  skills: { $contains: 'javascript' }
});

// Array contains any of these values
const webDevs = users.search({
  skills: { $in: ['html', 'css', 'javascript'] }
});

// Array doesn't contain value
const nonPythonUsers = users.search({
  skills: { $nin: ['python'] }
});

// Array with specific size
const tripleSkilled = users.search({
  skills: { $size: 3 }
});

// Multiple array conditions
const frontendExperts = users.search({
  $and: [
    { skills: { $contains: 'react' } },
    { skills: { $contains: 'typescript' } },
    { experience: { $gte: 3 } }
  ]
});
```

## 🗂️ Working with Tables

### Multiple Tables

```typescript
// Create different tables for different data types
const users = db.table('users');
const posts = db.table('posts');
const comments = db.table('comments');

// Insert related data
const userId = users.insert({
  name: 'Alice',
  email: 'alice@example.com'
});

const postId = posts.insert({
  title: 'My First Post',
  content: 'This is my first blog post!',
  authorId: userId,
  createdAt: new Date()
});

const commentId = comments.insert({
  content: 'Great post!',
  postId: postId,
  authorId: userId,
  createdAt: new Date()
});

// Query across tables (manual joins)
const post = posts.get(undefined, postId);
const author = users.get(undefined, post?.authorId);
const postComments = comments.search({ postId: postId });

console.log('Post:', post);
console.log('Author:', author);
console.log('Comments:', postComments);
```

### Table Management

```typescript
// List all tables
const tableNames = db.tables();
console.log('Available tables:', Array.from(tableNames));

// Get table statistics
const users = db.table('users');
console.log('Users table size:', users.length);

// Drop a table
db.dropTable('old_table');

// Drop all tables
db.dropTables();  // Use with caution!

// Table with options
const cachedUsers = db.table('users', {
  cacheSize: 1000,      // LRU cache size
  persistEmpty: true    // Keep empty table in storage
});
```

## 📄 Pagination

### Basic Pagination

```typescript
const users = db.table('users');

// First page
const page1 = users.searchPaginated(
  { status: 'active' },
  1,    // page number (1-based)
  10    // page size
);

console.log('Page 1 data:', page1.data);
console.log('Total pages:', page1.totalPages);
console.log('Total items:', page1.totalCount);
console.log('Has more:', page1.hasMore);

// Navigate pages
if (page1.hasMore) {
  const page2 = users.searchPaginated(
    { status: 'active' },
    page1.nextPage!,
    10
  );
  
  console.log('Page 2 data:', page2.data);
}

// All documents paginated
const allPage1 = users.allPaginated(1, 20);
```

### Lazy Loading for Large Datasets

```typescript
const users = db.table('users');

// Basic lazy iteration
console.log('Processing users lazily...');
for await (const user of users.lazy({ status: 'active' })) {
  console.log('Processing user:', user.name);
  // Process one user at a time without loading all into memory
}

// Configured lazy iteration
const iterator = users.lazy(
  { department: 'engineering' },
  {
    pageSize: 50,         // Load 50 users at a time
    prefetchNext: true,   // Prefetch next batch
    cachePages: false     // Don't cache previous batches
  }
);

for await (const user of iterator) {
  console.log('Engineering user:', user.name);
}
```

## ⚠️ Error Handling

### Basic Error Handling

```typescript
const users = db.table('users');

try {
  // This might fail if document is invalid
  const userId = users.insert({
    name: 'Test User',
    email: 'invalid-email'  // Invalid email format
  });
  
  console.log('User created:', userId);
} catch (error) {
  console.error('Failed to create user:', error.message);
}

try {
  // This might fail if table doesn't exist or is corrupted
  const allUsers = users.all();
  console.log('Users loaded:', allUsers.length);
} catch (error) {
  console.error('Failed to load users:', error.message);
}
```

### Schema Validation Errors

```typescript
import { createSchema, field, BmDbValidationError } from 'bmdb';
import { z } from 'zod';

const userSchema = createSchema({
  name: field(z.string().min(1)),
  email: field(z.string().email()),
  age: field(z.number().int().min(0))
});

const users = db.schemaTable(userSchema, 'users');

try {
  users.insert({
    name: '',  // Too short
    email: 'not-an-email',  // Invalid format
    age: -5    // Negative age
  });
} catch (error) {
  if (error instanceof BmDbValidationError) {
    console.error('Validation failed:', error.message);
    console.error('Field errors:', error.fieldErrors);
  } else {
    console.error('Other error:', error.message);
  }
}
```

### Storage Errors

```typescript
import { TinyDB, JSONStorage } from 'bmdb';

try {
  // This might fail if file is locked or corrupted
  const db = new TinyDB('/readonly/path/db.json', JSONStorage);
  
  const users = db.table('users');
  users.insert({ name: 'Test' });
  
} catch (error) {
  console.error('Storage error:', error.message);
  
  // Handle specific error types
  if (error.message.includes('EACCES')) {
    console.error('Permission denied - check file permissions');
  } else if (error.message.includes('ENOENT')) {
    console.error('Directory does not exist');
  } else if (error.message.includes('corrupted')) {
    console.error('Database file is corrupted');
  }
}
```

### Graceful Shutdown

```typescript
const db = new TinyDB('app.json');

// Graceful shutdown handling
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  
  try {
    // Close database connections
    db.close();
    console.log('Database closed successfully');
  } catch (error) {
    console.error('Error closing database:', error.message);
  }
  
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('exit', () => {
  console.log('Application exiting...');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});
```

## 🎯 Complete Example: Todo Application

```typescript
import { TinyDB, createSchema, field, where } from 'bmdb';
import { z } from 'zod';

// Define todo schema
const todoSchema = createSchema({
  id: field(z.string()).primaryKey(),
  title: field(z.string().min(1).max(200)),
  description: field(z.string()).optional(),
  completed: field(z.boolean()).default(false),
  priority: field(z.enum(['low', 'medium', 'high'])).default('medium'),
  dueDate: field(z.date()).optional(),
  tags: field(z.array(z.string())).default([]),
  createdAt: field(z.date()).default(() => new Date()),
  updatedAt: field(z.date()).default(() => new Date())
});

class TodoApp {
  private db: TinyDB;
  private todos: any;
  
  constructor() {
    this.db = new TinyDB('todos.json');
    this.todos = this.db.schemaTable(todoSchema, 'todos');
  }
  
  // Create a new todo
  createTodo(title: string, description?: string, priority: 'low' | 'medium' | 'high' = 'medium') {
    const id = `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.todos.insert({
      id,
      title,
      description,
      priority,
      completed: false,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  
  // Get all todos
  getAllTodos() {
    return this.todos.all();
  }
  
  // Get pending todos
  getPendingTodos() {
    return this.todos.search(where('completed').equals(false));
  }
  
  // Get completed todos
  getCompletedTodos() {
    return this.todos.search(where('completed').equals(true));
  }
  
  // Get todos by priority
  getTodosByPriority(priority: 'low' | 'medium' | 'high') {
    return this.todos.search(where('priority').equals(priority));
  }
  
  // Mark todo as completed
  completeTodo(id: string) {
    return this.todos.update(
      { completed: true, updatedAt: new Date() },
      where('id').equals(id)
    );
  }
  
  // Update todo
  updateTodo(id: string, updates: Partial<any>) {
    return this.todos.update(
      { ...updates, updatedAt: new Date() },
      where('id').equals(id)
    );
  }
  
  // Delete todo
  deleteTodo(id: string) {
    return this.todos.remove(where('id').equals(id));
  }
  
  // Search todos
  searchTodos(query: string) {
    return this.todos.search(
      where('title').matches(new RegExp(query, 'i'))
        .or(where('description').matches(new RegExp(query, 'i')))
    );
  }
  
  // Get overdue todos
  getOverdueTodos() {
    const now = new Date();
    return this.todos.search(
      where('dueDate').lt(now).and(where('completed').equals(false))
    );
  }
  
  // Get statistics
  getStats() {
    const total = this.todos.count({});
    const completed = this.todos.count(where('completed').equals(true));
    const pending = total - completed;
    const overdue = this.getOverdueTodos().length;
    
    return { total, completed, pending, overdue };
  }
  
  // Close database
  close() {
    this.db.close();
  }
}

// Usage example
async function runTodoExample() {
  const app = new TodoApp();
  
  try {
    // Create some todos
    app.createTodo('Learn BMDB', 'Study the documentation', 'high');
    app.createTodo('Build todo app', 'Create a simple todo application', 'medium');
    app.createTodo('Write tests', 'Add unit tests for the application', 'low');
    
    // Get all todos
    console.log('All todos:', app.getAllTodos());
    
    // Complete a todo
    const todos = app.getAllTodos();
    if (todos.length > 0) {
      app.completeTodo(todos[0].id);
      console.log('Completed first todo');
    }
    
    // Get statistics
    console.log('Todo stats:', app.getStats());
    
    // Search todos
    const bmdbTodos = app.searchTodos('BMDB');
    console.log('BMDB-related todos:', bmdbTodos);
    
  } finally {
    app.close();
  }
}

// Run the example
runTodoExample().catch(console.error);
```

This completes the basic usage examples. These patterns should cover most common use cases when getting started with BMDB!