# TinyDB API Reference

The `TinyDB` class is the main entry point for all database operations.

## Constructor

### `new TinyDB(pathOrOptions?, options?)`

Creates a new database instance.

**Parameters:**
- `pathOrOptions` (string | object): Database file path or options object
- `options` (object, optional): Configuration options

**Examples:**
```typescript
// Simple file path
const db = new TinyDB('data.json');

// With storage class
const db = new TinyDB('data.json', { storage: WALJSONStorage });

// Storage-only (no file)
const db = new TinyDB({ storage: MemoryStorage });
```

**Storage Options:**
```typescript
const db = new TinyDB('data.json', WALJSONStorage, {
  batchSize: 1000,
  maxBatchWaitMs: 20,
  compactThreshold: 5000
});
```

## Properties

### `storage: Storage`

Read-only access to the underlying storage instance.

```typescript
const storageType = db.storage.constructor.name;
const isWAL = db.storage.supportsFeature('tx');
```

### `length: number`

Number of documents in the default table.

```typescript
console.log(`Default table has ${db.length} documents`);
```

## Table Management

### `table<T>(name: string, options?): Table<T>`

Gets or creates a table with the specified name.

**Parameters:**
- `name` (string): Table name
- `options` (object, optional): Table configuration

**Options:**
- `cacheSize` (number): LRU cache size for the table
- `persistEmpty` (boolean): Whether to persist empty tables

**Returns:** Table instance

**Example:**
```typescript
const users = db.table<User>('users', { cacheSize: 1000 });
const products = db.table('products');
```

### `schemaTable<T>(schema: BmDbSchema<T>, name?, options?): SchemaTable<T>`

Creates a schema-validated table.

**Parameters:**
- `schema` (BmDbSchema): Schema definition
- `name` (string, optional): Table name (defaults to schema.tableName)
- `options` (object, optional): Table configuration

**Returns:** SchemaTable instance

**Example:**
```typescript
const userSchema = createSchema({
  name: field(z.string()),
  email: field(z.string().email()).unique(),
  age: field(z.number().int().min(0))
});

const users = db.schemaTable(userSchema, 'users');
```

### `tables(): Set<string>`

Returns a set of all table names in the database.

**Example:**
```typescript
const tableNames = db.tables();
console.log('Tables:', Array.from(tableNames));
```

### `dropTable(name: string): void`

Removes a table and all its data.

**Parameters:**
- `name` (string): Table name to drop

**Example:**
```typescript
db.dropTable('old_table');
```

### `dropTables(): void`

Removes all tables and data from the database.

**Example:**
```typescript
db.dropTables(); // Clear entire database
```

## Document Operations (Default Table)

The following methods operate on the default table (`_default`):

### `insert(document: Record<string, any>): number`

Inserts a document into the default table.

**Parameters:**
- `document` (object): Document to insert

**Returns:** Document ID

**Example:**
```typescript
const userId = db.insert({ name: 'Alice', age: 30 });
```

### `insertMultiple(documents: Record<string, any>[]): number[]`

Inserts multiple documents into the default table.

**Parameters:**
- `documents` (array): Array of documents to insert

**Returns:** Array of document IDs

**Example:**
```typescript
const ids = db.insertMultiple([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 }
]);
```

### `get(cond?, docId?, docIds?): any`

Retrieves documents from the default table.

**Parameters:**
- `cond` (any, optional): Query condition
- `docId` (number, optional): Specific document ID
- `docIds` (number[], optional): Array of document IDs

**Returns:** Document, array of documents, or null

**Examples:**
```typescript
// Get by ID
const user = db.get(undefined, 1);

// Get multiple by IDs
const users = db.get(undefined, undefined, [1, 2, 3]);

// Get first matching condition
const admin = db.get({ role: 'admin' });
```

### `search(condition: any): any[]`

Searches for documents matching a condition.

**Parameters:**
- `condition` (any): Query condition

**Returns:** Array of matching documents

**Examples:**
```typescript
// Simple field matching
const adults = db.search({ age: { $gte: 18 } });

// Using where clauses
const active = db.search(where('status').equals('active'));

// Complex conditions
const results = db.search({
  $and: [
    { age: { $gte: 18 } },
    { status: 'active' }
  ]
});
```

### `update(fields: Record<string, any>, cond?, docIds?): number[]`

Updates documents in the default table.

**Parameters:**
- `fields` (object): Fields to update
- `cond` (any, optional): Query condition
- `docIds` (number[], optional): Specific document IDs

**Returns:** Array of updated document IDs

**Examples:**
```typescript
// Update by condition
const updated = db.update(
  { lastLogin: new Date() },
  where('email').equals('user@example.com')
);

// Update specific documents
const updated = db.update({ status: 'inactive' }, undefined, [1, 2, 3]);
```

### `remove(cond?, docIds?): number[]`

Removes documents from the default table.

**Parameters:**
- `cond` (any, optional): Query condition
- `docIds` (number[], optional): Specific document IDs

**Returns:** Array of removed document IDs

**Examples:**
```typescript
// Remove by condition
const removed = db.remove(where('status').equals('inactive'));

// Remove specific documents
const removed = db.remove(undefined, [1, 2, 3]);
```

### `upsert(document: Record<string, any>, cond?): number[]`

Updates existing documents or inserts a new one.

**Parameters:**
- `document` (object): Document to upsert
- `cond` (any, optional): Query condition for existing documents

**Returns:** Array of affected document IDs

**Example:**
```typescript
const ids = db.upsert(
  { email: 'user@example.com', name: 'Updated Name' },
  where('email').equals('user@example.com')
);
```

## Query Operations (Default Table)

### `all(): any[]`

Returns all documents from the default table.

**Example:**
```typescript
const allDocs = db.all();
```

### `count(condition: any): number`

Counts documents matching a condition.

**Parameters:**
- `condition` (any): Query condition

**Returns:** Number of matching documents

**Example:**
```typescript
const activeCount = db.count(where('status').equals('active'));
```

### `contains(cond?, docId?): boolean`

Checks if documents exist matching criteria.

**Parameters:**
- `cond` (any, optional): Query condition
- `docId` (number, optional): Specific document ID

**Returns:** True if documents exist

**Examples:**
```typescript
// Check by condition
const hasActive = db.contains(where('status').equals('active'));

// Check by ID
const exists = db.contains(undefined, 123);
```

## Pagination

### `searchPaginated(cond: any, page = 1, pageSize = 50): PaginatedResult<any>`

Searches with pagination support.

**Parameters:**
- `cond` (any): Query condition
- `page` (number): Page number (1-based)
- `pageSize` (number): Items per page

**Returns:** PaginatedResult object

**Example:**
```typescript
const result = db.searchPaginated(where('age').gte(18), 1, 20);
console.log(`Page ${result.page} of ${result.totalPages}`);
console.log(`${result.data.length} items, ${result.totalCount} total`);
```

### `allPaginated(page = 1, pageSize = 50): PaginatedResult<any>`

Returns all documents with pagination.

**Parameters:**
- `page` (number): Page number (1-based)
- `pageSize` (number): Items per page

**Returns:** PaginatedResult object

## Lazy Iteration

### `lazy(condition?, options?): LazyIterator<any>`

Creates a lazy iterator for memory-efficient processing.

**Parameters:**
- `condition` (any, optional): Query condition
- `options` (object, optional): Iterator options

**Options:**
- `pageSize` (number): Items per chunk
- `prefetchNext` (boolean): Prefetch next chunk
- `cachePages` (boolean): Cache previous chunks

**Returns:** LazyIterator instance

**Example:**
```typescript
// Process large dataset efficiently
for await (const doc of db.lazy(where('processed').equals(false))) {
  await processDocument(doc);
}
```

## Parallel Operations

### `searchParallel(cond: any, options?): Promise<any[]>`

Performs parallel search across multiple threads.

**Parameters:**
- `cond` (any): Query condition
- `options` (object, optional): Parallel options

**Options:**
- `chunkSize` (number): Documents per chunk
- `maxConcurrency` (number): Maximum parallel workers
- `useWorkerThreads` (boolean): Use worker threads

**Returns:** Promise resolving to array of results

**Example:**
```typescript
const results = await db.searchParallel(
  where('category').equals('electronics'),
  { chunkSize: 1000, maxConcurrency: 4 }
);
```

### `updateParallel(updates: Array<{fields, condition}>, options?): Promise<number[]>`

Performs parallel updates.

**Parameters:**
- `updates` (array): Array of update operations
- `options` (object, optional): Parallel options

**Returns:** Promise resolving to array of updated IDs

**Example:**
```typescript
const updated = await db.updateParallel([
  { fields: { status: 'active' }, condition: where('type').equals('premium') },
  { fields: { status: 'inactive' }, condition: where('expired').equals(true) }
]);
```

### `aggregateParallel<R>(aggregator, combiner, condition?, options?): Promise<R>`

Performs parallel aggregation operations.

**Parameters:**
- `aggregator` (function): Function to process each chunk
- `combiner` (function): Function to combine chunk results
- `condition` (any, optional): Query condition
- `options` (object, optional): Parallel options

**Returns:** Promise resolving to aggregated result

**Example:**
```typescript
const totalRevenue = await db.aggregateParallel(
  (docs) => docs.reduce((sum, doc) => sum + doc.revenue, 0),
  (results) => results.reduce((sum, partial) => sum + partial, 0),
  where('status').equals('completed')
);
```

## Connection Pooling

### `enableConnectionPool(options?): void`

Enables connection pooling for high-concurrency scenarios.

**Parameters:**
- `options` (object, optional): Pool configuration

**Options:**
- `maxConnections` (number): Maximum pool size
- `minConnections` (number): Minimum pool size
- `maxIdleTime` (number): Connection idle timeout

**Example:**
```typescript
db.enableConnectionPool({
  maxConnections: 10,
  minConnections: 2,
  maxIdleTime: 30000
});
```

### `withConnection<T>(operation: (table) => T): Promise<T>`

Executes an operation using a pooled connection.

**Parameters:**
- `operation` (function): Function to execute with table connection

**Returns:** Promise resolving to operation result

**Example:**
```typescript
const result = await db.withConnection(async (table) => {
  const users = table.search(where('active').equals(true));
  return users.length;
});
```

### `batchOperation<T>(operations: Array<Function>): Promise<T[]>`

Executes multiple operations concurrently using connection pool.

**Parameters:**
- `operations` (array): Array of operation functions

**Returns:** Promise resolving to array of results

**Example:**
```typescript
const results = await db.batchOperation([
  (table) => table.count(where('status').equals('active')),
  (table) => table.count(where('status').equals('inactive')),
  (table) => table.search(where('role').equals('admin'))
]);
```

### `getPoolStats(): object`

Returns connection pool statistics.

**Returns:** Object with pool statistics

**Example:**
```typescript
const stats = db.getPoolStats();
console.log('Pool enabled:', stats.poolingEnabled);
console.log('Active connections:', stats.activeConnections);
```

## Lifecycle Management

### `close(): void`

Closes the database and releases resources.

**Example:**
```typescript
// Always close when done
db.close();

// Or use with try-finally
try {
  // Database operations
} finally {
  db.close();
}
```

### `clearCache(): void`

Clears the query result cache.

**Example:**
```typescript
db.clearCache(); // Clear default table cache
```

## Utility Methods

### `truncate(): void`

Removes all documents from the default table.

**Example:**
```typescript
db.truncate(); // Clear all documents
```

### `toString(): string`

Returns a string representation of the database.

**Returns:** Descriptive string

**Example:**
```typescript
console.log(db.toString());
// <TinyDB tables=['users', 'products'], tables_count=2, ...>
```

## Error Handling

All methods may throw errors for:
- Invalid parameters
- Storage failures
- Schema validation failures (for SchemaTable)
- Transaction conflicts

**Example:**
```typescript
try {
  const id = db.insert({ name: 'Alice' });
} catch (error) {
  if (error instanceof BmDbValidationError) {
    console.error('Validation failed:', error.message);
  } else {
    console.error('Database error:', error.message);
  }
}
```

## Type Safety

TinyDB provides full TypeScript support:

```typescript
interface User {
  id?: number;
  name: string;
  email: string;
  age: number;
}

const db = new TinyDB('users.json');
const users = db.table<User>('users');

// Type-safe operations
const userId = users.insert({ name: 'Alice', email: 'alice@example.com', age: 30 });
const user: User | null = users.get(undefined, userId);
```