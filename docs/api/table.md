# Table API Reference

The `Table` class provides the core document operations for BMDB tables.

## Constructor

Tables are created through the `TinyDB.table()` method:

```typescript
const users = db.table<User>('users', {
  cacheSize: 1000,      // Optional: LRU cache size
  persistEmpty: true    // Optional: persist empty tables
});
```

## Properties

### `length: number`

Number of documents in the table.

```typescript
console.log(`Table has ${users.length} documents`);
```

## Document Operations

### `insert(document: T): number`

Inserts a single document into the table.

**Parameters:**
- `document` (T): Document to insert

**Returns:** Document ID (number)

**Example:**
```typescript
const userId = users.insert({
  name: 'Alice Johnson',
  email: 'alice@example.com',
  age: 30
});
```

### `insertMultiple(documents: T[]): number[]`

Inserts multiple documents in a single operation.

**Parameters:**
- `documents` (T[]): Array of documents to insert

**Returns:** Array of document IDs

**Example:**
```typescript
const userIds = users.insertMultiple([
  { name: 'Alice', email: 'alice@example.com', age: 30 },
  { name: 'Bob', email: 'bob@example.com', age: 25 }
]);
```

### `get(cond?, docId?, docIds?): T | T[] | null`

Retrieves documents from the table.

**Parameters:**
- `cond` (QueryLike<T>, optional): Query condition
- `docId` (number, optional): Specific document ID
- `docIds` (number[], optional): Array of document IDs

**Returns:** Document, array of documents, or null

**Examples:**
```typescript
// Get by ID
const user = users.get(undefined, 123);

// Get multiple by IDs
const someUsers = users.get(undefined, undefined, [1, 2, 3]);

// Get first matching condition
const admin = users.get({ role: 'admin' });
```

### `update(fields: Partial<T>, cond?, docIds?): number[]`

Updates documents in the table.

**Parameters:**
- `fields` (Partial<T> | Operation[]): Fields to update or array of operations
- `cond` (QueryLike<T>, optional): Query condition
- `docIds` (number[], optional): Specific document IDs

**Returns:** Array of updated document IDs

**Examples:**
```typescript
// Update by condition
const updated = users.update(
  { lastLogin: new Date() },
  where('email').equals('alice@example.com')
);

// Update with operations
import { increment, set } from 'bmdb';
users.update([
  increment('loginCount'),
  set('lastSeen', new Date())
], where('id').equals(123));

// Update specific documents
users.update({ status: 'inactive' }, undefined, [1, 2, 3]);
```

### `updateMultiple(updates: Array<[Partial<T>, QueryLike<T>]>): number[]`

Performs multiple update operations with different conditions.

**Parameters:**
- `updates` (Array): Array of [fields, condition] tuples

**Returns:** Array of all updated document IDs

**Example:**
```typescript
const updated = users.updateMultiple([
  [{ status: 'premium' }, where('role').equals('admin')],
  [{ lastNotified: new Date() }, where('email').endsWith('@company.com')]
]);
```

### `upsert(document: T, cond?: QueryLike<T>): number[]`

Updates existing documents or inserts a new one if none match.

**Parameters:**
- `document` (T): Document to upsert
- `cond` (QueryLike<T>, optional): Condition to find existing documents

**Returns:** Array of affected document IDs

**Example:**
```typescript
const ids = users.upsert(
  { email: 'user@example.com', name: 'Updated Name', role: 'user' },
  where('email').equals('user@example.com')
);
```

### `remove(cond?, docIds?): number[]`

Removes documents from the table.

**Parameters:**
- `cond` (QueryLike<T>, optional): Query condition
- `docIds` (number[], optional): Specific document IDs

**Returns:** Array of removed document IDs

**Examples:**
```typescript
// Remove by condition
const removed = users.remove(where('status').equals('inactive'));

// Remove specific documents
const removed = users.remove(undefined, [1, 2, 3]);

// Remove all documents
const removed = users.remove({});
```

### `truncate(): void`

Removes all documents from the table.

**Example:**
```typescript
users.truncate(); // Clear all documents
```

## Query Operations

### `all(): T[]`

Returns all documents in the table.

**Example:**
```typescript
const allUsers = users.all();
```

### `search(condition: QueryLike<T>): T[]`

Searches for documents matching a condition.

**Parameters:**
- `condition` (QueryLike<T>): Query condition

**Returns:** Array of matching documents

**Examples:**
```typescript
// Simple conditions
const adults = users.search({ age: { $gte: 18 } });

// Using where clauses
const active = users.search(where('status').equals('active'));

// Complex conditions
const results = users.search({
  $and: [
    { age: { $gte: 18 } },
    { role: { $in: ['admin', 'moderator'] } }
  ]
});
```

### `count(condition: QueryLike<T>): number`

Counts documents matching a condition.

**Parameters:**
- `condition` (QueryLike<T>): Query condition

**Returns:** Number of matching documents

**Example:**
```typescript
const totalUsers = users.count({});
const activeUsers = users.count(where('status').equals('active'));
```

### `contains(cond?, docId?): boolean`

Checks if documents exist matching criteria.

**Parameters:**
- `cond` (QueryLike<T>, optional): Query condition
- `docId` (number, optional): Specific document ID

**Returns:** True if documents exist

**Examples:**
```typescript
// Check by condition
const hasActive = users.contains(where('status').equals('active'));

// Check by ID
const exists = users.contains(undefined, 123);
```

## Pagination

### `searchPaginated(condition: QueryLike<T>, page = 1, pageSize = 50): PaginatedResult<T>`

Searches with pagination support.

**Parameters:**
- `condition` (QueryLike<T>): Query condition
- `page` (number): Page number (1-based)
- `pageSize` (number): Items per page

**Returns:** PaginatedResult object

**Example:**
```typescript
const result = users.searchPaginated(
  where('age').gte(18),
  1,  // page
  20  // page size
);

console.log('Data:', result.data);
console.log('Page:', result.page, 'of', result.totalPages);
console.log('Total:', result.totalCount);
```

### `allPaginated(page = 1, pageSize = 50): PaginatedResult<T>`

Returns all documents with pagination.

**Parameters:**
- `page` (number): Page number (1-based)
- `pageSize` (number): Items per page

**Returns:** PaginatedResult object

**Example:**
```typescript
const page1 = users.allPaginated(1, 50);
```

## Lazy Iteration

### `lazy(condition?, options?): LazyIterator<T>`

Creates a lazy iterator for memory-efficient processing.

**Parameters:**
- `condition` (QueryLike<T>, optional): Query condition
- `options` (LazyIteratorOptions, optional): Iterator options

**Options:**
- `pageSize` (number): Items per chunk (default: 100)
- `prefetchNext` (boolean): Prefetch next chunk (default: true)
- `cachePages` (boolean): Cache previous chunks (default: false)

**Returns:** LazyIterator instance

**Examples:**
```typescript
// Basic lazy iteration
for await (const user of users.lazy(where('active').equals(true))) {
  console.log('Processing:', user.name);
}

// Configured lazy iteration
const iterator = users.lazy(
  where('department').equals('engineering'),
  {
    pageSize: 50,
    prefetchNext: true,
    cachePages: false
  }
);

for await (const user of iterator) {
  await processUser(user);
}
```

## Parallel Operations

### `searchParallel(condition: QueryLike<T>, options?): Promise<T[]>`

Performs parallel search across multiple threads.

**Parameters:**
- `condition` (QueryLike<T>): Query condition
- `options` (ParallelQueryOptions, optional): Parallel options

**Options:**
- `chunkSize` (number): Documents per chunk (default: 1000)
- `maxConcurrency` (number): Maximum parallel workers (default: CPU cores)
- `useWorkerThreads` (boolean): Use worker threads (default: false)

**Returns:** Promise resolving to array of results

**Example:**
```typescript
const results = await users.searchParallel(
  where('category').equals('premium'),
  {
    chunkSize: 1000,
    maxConcurrency: 4
  }
);
```

### `updateParallel(updates: Array<{fields, condition}>, options?): Promise<number[]>`

Performs parallel updates.

**Parameters:**
- `updates` (array): Array of update operations
- `options` (ParallelQueryOptions, optional): Parallel options

**Returns:** Promise resolving to array of updated IDs

**Example:**
```typescript
const updated = await users.updateParallel([
  { 
    fields: { status: 'active' }, 
    condition: where('role').equals('premium') 
  },
  { 
    fields: { lastNotified: new Date() }, 
    condition: where('email').endsWith('@company.com') 
  }
], { maxConcurrency: 2 });
```

### `aggregateParallel<R>(aggregator, combiner, condition?, options?): Promise<R>`

Performs parallel aggregation operations.

**Parameters:**
- `aggregator` (function): Function to process each chunk
- `combiner` (function): Function to combine chunk results
- `condition` (QueryLike<T>, optional): Query condition
- `options` (ParallelQueryOptions, optional): Parallel options

**Returns:** Promise resolving to aggregated result

**Example:**
```typescript
// Calculate total age of all users
const totalAge = await users.aggregateParallel(
  (chunk) => chunk.reduce((sum, user) => sum + user.age, 0),
  (results) => results.reduce((sum, partial) => sum + partial, 0)
);

// Count by category
const categoryCounts = await users.aggregateParallel(
  (chunk) => {
    const counts = {};
    chunk.forEach(user => {
      counts[user.category] = (counts[user.category] || 0) + 1;
    });
    return counts;
  },
  (results) => {
    const combined = {};
    results.forEach(result => {
      Object.entries(result).forEach(([key, value]) => {
        combined[key] = (combined[key] || 0) + value;
      });
    });
    return combined;
  },
  where('status').equals('active')
);
```

## Vector Operations

### `vectorSearch(field: string, queryVector: Vector, options?): VectorSearchResult[]`

Performs vector similarity search.

**Parameters:**
- `field` (string): Field containing vector data
- `queryVector` (Vector): Query vector to find similar documents
- `options` (object, optional): Search options

**Options:**
- `limit` (number): Maximum results (default: 10)
- `threshold` (number): Similarity threshold 0-1 (default: 0)
- `algorithm` ('cosine' | 'euclidean' | 'dot' | 'manhattan'): Distance algorithm (default: 'cosine')

**Returns:** Array of VectorSearchResult objects

**Example:**
```typescript
const embeddings = db.table('embeddings');

// Insert documents with vectors
embeddings.insert({
  text: 'Machine learning basics',
  vector: [0.1, 0.2, 0.3, 0.4, 0.5]
});

// Search for similar vectors
const queryVector = [0.15, 0.25, 0.35, 0.45, 0.55];
const similar = embeddings.vectorSearch('vector', queryVector, {
  limit: 5,
  algorithm: 'cosine',
  threshold: 0.7
});

console.log('Similar documents:', similar);
```

## Index Operations

### `createIndex(field: string, options?): Promise<void>`

Creates an index on a field for faster queries.

**Parameters:**
- `field` (string): Field name to index
- `options` (object, optional): Index options

**Options:**
- `unique` (boolean): Enforce uniqueness (default: false)

**Example:**
```typescript
// Create regular index
await users.createIndex('email');

// Create unique index
await users.createIndex('userId', { unique: true });
```

### `createCompoundIndex(fields: string[], options?): Promise<void>`

Creates a compound index on multiple fields.

**Parameters:**
- `fields` (string[]): Array of field names
- `options` (object, optional): Index options

**Options:**
- `unique` (boolean): Enforce uniqueness on combination (default: false)
- `name` (string): Custom index name

**Example:**
```typescript
// Create compound index
await users.createCompoundIndex(['lastName', 'firstName']);

// Create unique compound index
await users.createCompoundIndex(['email', 'domain'], { 
  unique: true,
  name: 'email_domain_unique'
});
```

### `dropIndex(indexName: string): Promise<void>`

Removes an index.

**Parameters:**
- `indexName` (string): Name of index to remove

**Example:**
```typescript
await users.dropIndex('email_index');
```

### `listIndexes(): Promise<IndexDefinition[]>`

Lists all indexes on the table.

**Returns:** Array of index definitions

**Example:**
```typescript
const indexes = await users.listIndexes();
console.log('Table indexes:', indexes);
```

## Cache Management

### `clearCache(): void`

Clears the LRU cache for this table.

**Example:**
```typescript
users.clearCache();
```

## Iteration Support

### `[Symbol.iterator](): Iterator<T>`

Makes the table iterable with for...of loops.

**Example:**
```typescript
// Iterate over all documents
for (const user of users) {
  console.log('User:', user.name);
}

// Convert to array
const userArray = [...users];
```

## Error Handling

All Table methods may throw errors for:

- **Validation errors**: Invalid document structure
- **Storage errors**: File system or network issues
- **Query errors**: Invalid query conditions
- **Index errors**: Index creation or usage failures

**Example:**
```typescript
try {
  const users = db.table('users');
  const userId = users.insert({ name: 'Alice', email: 'invalid-email' });
} catch (error) {
  console.error('Table operation failed:', error.message);
}
```

## Type Safety

Tables provide full TypeScript support when used with type parameters:

```typescript
interface User {
  id?: number;
  name: string;
  email: string;
  age: number;
  role: 'user' | 'admin' | 'moderator';
}

const users = db.table<User>('users');

// TypeScript ensures type safety
const user: User = {
  name: 'Alice',
  email: 'alice@example.com',
  age: 30,
  role: 'admin'
};

const userId = users.insert(user); // Type-checked
const foundUser: User | null = users.get(undefined, userId); // Type-safe return
```