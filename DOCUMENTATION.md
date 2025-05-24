# BmDB Documentation

BmDB is a fast, lightweight, and type-safe embedded database for TypeScript/JavaScript applications. It supports both classic document storage and modern schema-based validation with Zod integration.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Classic API](#classic-api)
- [Schema API (V2)](#schema-api-v2)
- [Storage Options](#storage-options)
- [Advanced Features](#advanced-features)
- [Migration Guide](#migration-guide)
- [API Reference](#api-reference)

## Installation

```bash
# Using npm
npm install bmdb zod

# Using bun
bun add bmdb zod

# Using yarn
yarn add bmdb zod
```

> **Note:** Zod is required for schema-based features but optional for classic usage.

## Quick Start

### Classic Usage

```typescript
import { TinyDB } from 'bmdb';

// Create database
const db = new TinyDB('my-database.json');

// Insert documents
const userId = db.insert({ name: 'John Doe', age: 30 });
console.log('User ID:', userId); // User ID: 1

// Query documents
const users = db.search(user => user.age > 25);
console.log('Adult users:', users);

// Update documents
db.update({ age: 31 }, user => user.name === 'John Doe');

// Clean up
db.close();
```

### Schema-Based Usage (V2)

```typescript
import { z } from 'zod';
import { TinyDB, createSchema, unique, primaryKey } from 'bmdb';

// Define schema with constraints
const UserSchema = createSchema(
  z.object({
    id: primaryKey(z.number()),
    email: unique(z.string().email()),
    name: z.string().min(1),
    age: z.number().min(0).optional(),
    createdAt: z.date().default(() => new Date())
  }),
  'users'
);

// Create database and schema table
const db = new TinyDB('my-database.json');
const users = db.schemaTable(UserSchema);

// Type-safe operations with validation
const userId = users.insert({
  id: 1,
  email: 'john@example.com',
  name: 'John Doe',
  age: 30
});

// Automatic validation and constraint checking
try {
  users.insert({
    id: 2,
    email: 'john@example.com', // Duplicate email - will throw error
    name: 'Jane Doe'
  });
} catch (error) {
  console.log('Constraint violation:', error.message);
}
```

## Core Concepts

### Database

The main database class that manages tables and storage. Supports both file-based and in-memory storage.

### Tables

Collections of documents within a database. Each table operates independently and can have different schemas.

### Documents

Individual records stored in tables. Documents are JavaScript objects with an automatically assigned `docId`.

### Schemas (V2)

Type-safe definitions using Zod that enforce structure, validation, and constraints on documents.

## Classic API

### Creating a Database

```typescript
import { TinyDB } from 'bmdb';

// File-based storage
const db = new TinyDB('database.json');

// In-memory storage
const db = new TinyDB({ storage: MemoryStorage });

// Custom storage options
const db = new TinyDB('data.json', { 
  storage: JSONStorage 
});
```

### Working with Tables

```typescript
// Get or create a table
const users = db.table('users');
const posts = db.table('posts');

// Table operations are independent
users.insert({ name: 'Alice' });
posts.insert({ title: 'Hello World', author: 'Alice' });
```

### Document Operations

#### Insert

```typescript
// Insert single document
const docId = db.insert({ name: 'John', age: 30 });

// Insert multiple documents
const docIds = db.insertMultiple([
  { name: 'Alice', age: 25 },
  { name: 'Bob', age: 35 }
]);

// Insert with specific ID
import { Document } from 'bmdb';
const doc = new Document({ name: 'Custom' }, 999);
db.insert(doc);
```

#### Query

```typescript
// Get all documents
const allUsers = db.all();

// Search with conditions
const adults = db.search(user => user.age >= 18);
const johnDoe = db.search(user => user.name === 'John Doe');

// Get by ID
const user = db.get(undefined, 1);

// Get multiple by IDs
const users = db.get(undefined, undefined, [1, 2, 3]);

// Check existence
const exists = db.contains(user => user.email === 'john@example.com');

// Count documents
const adultCount = db.count(user => user.age >= 18);
```

#### Update

```typescript
// Update with object
const updatedIds = db.update(
  { age: 31 }, 
  user => user.name === 'John'
);

// Update with function
db.update(user => {
  user.lastLogin = new Date();
});

// Update specific documents by ID
db.update({ verified: true }, undefined, [1, 2, 3]);

// Update multiple with different conditions
db.updateMultiple([
  [{ role: 'admin' }, user => user.email === 'admin@example.com'],
  [{ role: 'user' }, user => user.email !== 'admin@example.com']
]);
```

#### Upsert

```typescript
// Insert or update based on condition
const docIds = db.upsert(
  { name: 'John', age: 30, email: 'john@example.com' },
  user => user.email === 'john@example.com'
);

// Upsert with Document (uses docId)
const doc = new Document({ name: 'Jane', age: 28 }, 2);
db.upsert(doc);
```

#### Delete

```typescript
// Remove with condition
const removedIds = db.remove(user => user.age < 18);

// Remove by IDs
db.remove(undefined, [1, 2, 3]);

// Clear all documents
db.truncate();
```

### Advanced Queries

```typescript
import { where } from 'bmdb';

// Using query builder
const adults = db.search(where('age').gte(18));
const johns = db.search(where('name').matches(/john/i));

// Complex conditions
const eligibleUsers = db.search(user => 
  user.age >= 18 && 
  user.verified === true && 
  user.country === 'US'
);

// Caching queries (automatic for complex queries)
const expensiveQuery = db.search(user => {
  // Complex computation
  return performExpensiveCheck(user);
});
```

## Schema API (V2)

### Defining Schemas

```typescript
import { z } from 'zod';
import { createSchema, unique, primaryKey, compoundIndex } from 'bmdb';

const UserSchema = createSchema(
  z.object({
    // Primary key (automatically unique)
    id: primaryKey(z.number().int().positive()),
    
    // Unique fields
    email: unique(z.string().email().toLowerCase()),
    username: unique(z.string().min(3).max(20)),
    
    // Regular fields with validation
    name: z.string().min(1).max(100),
    age: z.number().int().min(13).max(120).optional(),
    
    // Enums and defaults
    role: z.enum(['user', 'admin', 'moderator']).default('user'),
    
    // Complex objects
    profile: z.object({
      bio: z.string().optional(),
      avatar: z.string().url().optional(),
      preferences: z.object({
        theme: z.enum(['light', 'dark']).default('light'),
        notifications: z.boolean().default(true)
      }).default({})
    }).default({}),
    
    // Automatic timestamps
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date())
  }),
  'users' // Table name
);

// Compound indexes for future use
const LogSchema = createSchema(
  z.object({
    id: primaryKey(z.string().uuid()),
    userId: compoundIndex(z.number(), 'user_time'),
    timestamp: compoundIndex(z.date(), 'user_time'),
    action: z.string(),
    data: z.record(z.any()).optional()
  }),
  'logs'
);
```

### Schema Constraints

```typescript
import { unique, primaryKey, field } from 'bmdb';

// Available constraint helpers
const schema = z.object({
  id: primaryKey(z.number()),           // Primary key (unique + identifier)
  email: unique(z.string().email()),   // Unique constraint
  username: unique(z.string()),        // Multiple unique fields allowed
  name: z.string(),                    // Regular field
  metadata: field(z.record(z.any()), { 
    // Custom metadata (reserved for future use)
  })
});
```

### Schema Operations

```typescript
const db = new TinyDB('app.json');
const users = db.schemaTable(UserSchema);

// Type inference from schema
type User = z.infer<typeof UserSchema.zodSchema>;

// All operations are type-safe and validated
const user: User = {
  id: 1,
  email: 'user@example.com',
  username: 'user123',
  name: 'John Doe',
  age: 30
};

const userId = users.insert(user);
```

### Validation and Error Handling

```typescript
import { 
  BmDbValidationError, 
  BmDbUniqueConstraintError 
} from 'bmdb';

try {
  users.insert({
    id: 1,
    email: 'invalid-email', // Schema validation error
    username: 'usr',        // Too short
    name: ''               // Empty name
  });
} catch (error) {
  if (error instanceof BmDbValidationError) {
    console.log('Validation failed:', error.path, error.message);
    console.log('Zod error:', error.zodError);
  }
}

try {
  users.insert({
    id: 1,                    // Duplicate primary key
    email: 'new@example.com',
    username: 'newuser',
    name: 'New User'
  });
} catch (error) {
  if (error instanceof BmDbUniqueConstraintError) {
    console.log('Constraint violation:', error.field, error.value);
  }
}
```

### Schema Introspection

```typescript
// Get schema information
console.log('Primary key:', users.getPrimaryKey());        // 'id'
console.log('Unique fields:', users.getUniqueFields());    // ['id', 'email', 'username']
console.log('Field metadata:', users.getFieldMeta('email')); // { bmDbType: 'field', isUnique: true }

// Check field properties
console.log('Is primary key:', users.isPrimaryKey('id'));   // true
console.log('Is unique:', users.isUnique('email'));         // true

// Schema utilities
import { 
  validateSchemaData, 
  safeValidateSchemaData,
  validatePartialSchemaData 
} from 'bmdb';

// Validate data against schema
const validUser = validateSchemaData(UserSchema, userData);

// Safe validation (no throwing)
const result = safeValidateSchemaData(UserSchema, userData);
if (result.success) {
  console.log('Valid data:', result.data);
} else {
  console.log('Validation errors:', result.error);
}

// Validate partial data (for updates)
const partialUser = validatePartialSchemaData(UserSchema, { age: 31 });
```

## Storage Options

### JSON Storage (Default)

```typescript
import { TinyDB, JSONStorage } from 'bmdb';

const db = new TinyDB('data.json');
// or explicitly
const db = new TinyDB('data.json', { storage: JSONStorage });
```

### Memory Storage

```typescript
import { TinyDB, MemoryStorage } from 'bmdb';

// In-memory database (data lost on restart)
const db = new TinyDB(MemoryStorage);
```

### Binary Storage

```typescript
import { TinyDB, BinaryStorage } from 'bmdb';

// High-performance binary storage
const db = new TinyDB('data.bmdb', { storage: BinaryStorage });
```

### WAL (Write-Ahead Logging) Storage

```typescript
import { TinyDB, WALStorage, WALJSONStorage } from 'bmdb';

// WAL with binary format
const db = new TinyDB('data.wal', { storage: WALStorage });

// WAL with JSON format
const db = new TinyDB('data.wal.json', { storage: WALJSONStorage });

// Transaction support
const transaction = db.storage.beginTransaction();
try {
  db.insert({ name: 'User 1' });
  db.insert({ name: 'User 2' });
  transaction.commit();
} catch (error) {
  transaction.rollback();
}
```

## Advanced Features

### Caching

```typescript
// Tables automatically cache query results
const users = db.table('users', { cacheSize: 50 });

// Clear cache manually
users.clearCache();

// Custom caching middleware
import { CachingMiddleware } from 'bmdb';
const cachedDb = new TinyDB('data.json');
// Apply caching logic...
```

### Middleware

```typescript
import { Middleware } from 'bmdb';

class LoggingMiddleware extends Middleware {
  onInsert(table, document) {
    console.log(`Inserting into ${table.name}:`, document);
    return super.onInsert(table, document);
  }
  
  onUpdate(table, updates, condition) {
    console.log(`Updating ${table.name}:`, updates);
    return super.onUpdate(table, updates, condition);
  }
}

// Apply middleware (implementation depends on specific needs)
```

### Operations

```typescript
import { add, subtract, increment, decrement, set } from 'bmdb';

// Atomic operations
db.update(add('score', 10), user => user.id === 1);
db.update(increment('loginCount'), user => user.active);
db.update(set('lastLogin', new Date()), user => user.id === 1);
```

### Indexing and Performance

```typescript
// Large datasets benefit from proper querying
const users = db.table('users');

// Efficient: Use specific conditions
const targetUser = users.get(user => user.id === targetId);

// Less efficient: Full table scan
const allAdults = users.search(user => user.age >= 18);

// For better performance with large datasets, consider:
// 1. Using WAL storage for write-heavy workloads
// 2. Implementing custom indexing logic
// 3. Using binary storage for faster I/O
```

## Migration Guide

### From Classic to Schema API

```typescript
// Before (Classic)
const db = new TinyDB('data.json');
db.insert({ name: 'John', email: 'john@example.com' });

// After (Schema V2)
import { z } from 'zod';
import { createSchema, unique } from 'bmdb';

const UserSchema = createSchema(
  z.object({
    id: primaryKey(z.number()),
    name: z.string(),
    email: unique(z.string().email())
  }),
  'users'
);

const db = new TinyDB('data.json');
const users = db.schemaTable(UserSchema);
users.insert({ id: 1, name: 'John', email: 'john@example.com' });
```

### Gradual Migration

```typescript
// You can use both APIs in the same database
const db = new TinyDB('data.json');

// Classic tables
const logs = db.table('logs');
logs.insert({ message: 'System started', timestamp: new Date() });

// Schema tables
const users = db.schemaTable(UserSchema);
users.insert({ id: 1, name: 'Admin', email: 'admin@example.com' });
```

## API Reference

### TinyDB Class

#### Constructor
- `new TinyDB(path?: string, options?: { storage?: StorageCtor })`

#### Methods
- `table<T>(name: string, options?: TableOptions): Table<T>`
- `schemaTable<T>(schema: BmDbSchema<T>, name?: string, options?: TableOptions): SchemaTable<T>`
- `tables(): Set<string>`
- `dropTable(name: string): void`
- `dropTables(): void`
- `close(): void`

### Table Class

#### Methods
- `insert(document: T): number`
- `insertMultiple(documents: T[]): number[]`
- `all(): Document[]`
- `search(condition: QueryLike): Document[]`
- `get(condition?: QueryLike, docId?: number, docIds?: number[]): Document | Document[] | null`
- `contains(condition?: QueryLike, docId?: number): boolean`
- `update(fields: Partial<T> | UpdateFunction, condition?: QueryLike, docIds?: number[]): number[]`
- `updateMultiple(updates: UpdatePair[]): number[]`
- `upsert(document: T, condition?: QueryLike): number[]`
- `remove(condition?: QueryLike, docIds?: number[]): number[]`
- `truncate(): void`
- `count(condition: QueryLike): number`
- `clearCache(): void`

### SchemaTable Class

Extends `Table<T>` with additional methods:

#### Methods
- All Table methods (with validation)
- `getFieldMeta(field: keyof T): BmDbFieldMeta | undefined`
- `isPrimaryKey(field: keyof T): boolean`
- `isUnique(field: keyof T): boolean`
- `getUniqueFields(): Array<keyof T>`
- `getPrimaryKey(): keyof T | undefined`

### BmDbSchema Class

#### Methods
- `validate(data: unknown): T`
- `safeValidate(data: unknown): ValidationResult<T>`
- `validatePartial(data: unknown): Partial<T>`
- `safeValidatePartial(data: unknown): ValidationResult<Partial<T>>`
- `getFieldMeta(field: keyof T): BmDbFieldMeta | undefined`
- `getUniqueFields(): Array<keyof T>`
- `getPrimaryKey(): keyof T | undefined`
- `getCompoundIndexGroups(): Record<string, Array<keyof T>>`
- `getAllFields(): Array<keyof T>`
- `hasField(field: string): boolean`
- `clone(newTableName?: string): BmDbSchema<T>`

### Schema Helpers

#### Functions
- `createSchema<T>(zodSchema: ZodSchema<T>, tableName?: string): BmDbSchema<T>`
- `unique<T>(schema: ZodTypeAny): T`
- `primaryKey<T>(schema: ZodTypeAny): T`
- `compoundIndex<T>(schema: ZodTypeAny, groupName: string): T`
- `field<T>(schema: ZodTypeAny, meta?: Partial<BmDbFieldMeta>): T`

### Error Classes

#### BmDbValidationError
- `code: 'ERR_VALIDATION_FAILED'`
- `path: string[]`
- `zodError: ZodError`

#### BmDbUniqueConstraintError
- `code: 'ERR_UNIQUE_CONSTRAINT'`
- `field: string`
- `value: any`

### Storage Classes

- `JSONStorage` - Human-readable JSON format
- `MemoryStorage` - In-memory storage
- `BinaryStorage` - High-performance binary format
- `WALStorage` - Write-ahead logging with binary format
- `WALJSONStorage` - Write-ahead logging with JSON format

---

## Examples and Best Practices

### Schema Design

```typescript
// Good: Clear, validated schema
const UserSchema = createSchema(
  z.object({
    id: primaryKey(z.number()),
    email: unique(z.string().email().toLowerCase()),
    profile: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      birthDate: z.date().optional()
    }),
    settings: z.object({
      theme: z.enum(['light', 'dark']).default('light'),
      notifications: z.boolean().default(true)
    }).default({})
  }),
  'users'
);

// Better: Add computed fields and validation
const EnhancedUserSchema = createSchema(
  z.object({
    id: primaryKey(z.number()),
    email: unique(z.string().email().toLowerCase()),
    profile: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      birthDate: z.date().optional()
    }),
    settings: z.object({
      theme: z.enum(['light', 'dark']).default('light'),
      notifications: z.boolean().default(true)
    }).default({})
  })
  .transform(data => ({
    ...data,
    fullName: `${data.profile.firstName} ${data.profile.lastName}`,
    age: data.profile.birthDate 
      ? Math.floor((Date.now() - data.profile.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : undefined
  })),
  'users'
);
```

### Error Handling

```typescript
async function createUser(userData: unknown) {
  try {
    const userId = users.insert(userData);
    return { success: true, userId };
  } catch (error) {
    if (error instanceof BmDbValidationError) {
      return { 
        success: false, 
        error: 'validation', 
        details: error.path.join('.'),
        message: error.message 
      };
    }
    
    if (error instanceof BmDbUniqueConstraintError) {
      return { 
        success: false, 
        error: 'constraint', 
        field: error.field,
        message: `${error.field} must be unique` 
      };
    }
    
    throw error; // Re-throw unexpected errors
  }
}
```

### Performance Optimization

```typescript
// Use appropriate storage for your use case
const heavyWriteDb = new TinyDB('data.wal', { storage: WALStorage });
const readOnlyDb = new TinyDB('data.bmdb', { storage: BinaryStorage });

// Batch operations when possible
const newUsers = [
  { id: 1, name: 'User 1', email: 'user1@example.com' },
  { id: 2, name: 'User 2', email: 'user2@example.com' },
  { id: 3, name: 'User 3', email: 'user3@example.com' }
];

// Better: Single batch operation
const userIds = users.insertMultiple(newUsers);

// Avoid: Multiple individual operations
// newUsers.forEach(user => users.insert(user));
```

This documentation provides comprehensive coverage of BmDB's features. For specific use cases or advanced scenarios, refer to the examples in the repository or create an issue for additional guidance.