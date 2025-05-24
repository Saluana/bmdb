# Core Components

This document details the core components of BMDB and their responsibilities within the database system.

## 🏛️ TinyDB Class

**Location**: `src/core/TinyDB.ts`

The main database class that serves as the entry point for all database operations.

### Key Responsibilities
- Database lifecycle management (open, close)
- Table creation and management
- Storage backend coordination
- Connection pooling for high-concurrency scenarios
- Default table operations forwarding

### Core Features
```typescript
class TinyDB {
  // Table management
  table<T>(name: string): Table<T>
  schemaTable<T>(schema: BmDbSchema<T>, name?: string): SchemaTable<T>
  tables(): Set<string>
  dropTable(name: string): void
  dropTables(): void

  // Connection pooling
  enableConnectionPool(options): void
  withConnection<T>(operation: (table: Table) => T): Promise<T>
  batchOperation<T>(operations: Array<Function>): Promise<T[]>

  // Forwarded operations (to default table)
  insert(document): number
  search(condition): any[]
  update(fields, condition): number[]
  // ... all Table methods
}
```

### Constructor Patterns
```typescript
// Simple file path
const db = new TinyDB('data.json');

// With storage class
const db = new TinyDB('data.json', { storage: WALJSONStorage });

// Storage-only (no file)
const db = new TinyDB({ storage: MemoryStorage });
```

## 📊 Table Class

**Location**: `src/core/Table.ts`

Manages document collections with CRUD operations, querying, and indexing.

### Key Features

#### Document Operations
```typescript
class Table<T> {
  // Basic CRUD
  insert(document: T): number
  insertMultiple(documents: T[]): number[]
  get(docId: number): T | null
  update(fields: Partial<T>, condition?): number[]
  remove(condition?): number[]
  
  // Querying
  search(condition): T[]
  searchPaginated(condition, page, pageSize): PaginatedResult<T>
  count(condition): number
  contains(condition): boolean
  
  // Advanced operations
  upsert(document: T, condition?): number[]
  updateMultiple(updates: Array<[Partial<T>, condition]>): number[]
  
  // Iteration
  all(): T[]
  lazy(condition?, options?): LazyIterator<T>
  [Symbol.iterator](): Iterator<T>
}
```

#### Performance Features
- **LRU Caching**: Configurable cache for frequently accessed documents
- **Lazy Iteration**: Memory-efficient streaming for large datasets
- **Parallel Queries**: Multi-threaded query execution
- **Object Pooling**: Reduced garbage collection pressure

#### Pagination Support
```typescript
interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
  nextPage?: number;
  previousPage?: number;
}
```

## 📋 SchemaTable Class

**Location**: `src/core/SchemaTable.ts`

Extends Table with schema validation, type safety, and constraint enforcement.

### Schema-Driven Features
```typescript
class SchemaTable<T> extends Table<T> {
  // Type-safe operations
  insert(document: T): number        // Validates against schema
  update(fields: Partial<T>): number[] // Partial validation
  
  // Constraint enforcement
  checkUniqueConstraint(field: string, value: any): boolean
  checkPrimaryKey(value: any): boolean
  
  // Schema utilities
  getSchema(): BmDbSchema<T>
  validateDocument(document: T): ValidationResult
}
```

### Constraint Types
- **Primary Keys**: Single-field unique identifiers
- **Unique Fields**: Unique constraint on individual fields
- **Compound Indexes**: Multi-field indexes for complex queries
- **Vector Fields**: Fields containing vector data for similarity search

## 🔍 Query System

### QueryInstance Class

**Location**: `src/query/QueryInstance.ts`

Represents and evaluates query conditions against documents.

```typescript
class QueryInstance {
  // Condition evaluation
  test(document: any): boolean
  
  // Query optimization
  getOptimizedCondition(): OptimizedCondition
  isIndexable(): boolean
  getIndexableFields(): string[]
}
```

### Where Clause Builder

**Location**: `src/query/where.ts`

Fluent interface for building complex queries.

```typescript
// Example usage
where('age').gte(18).and(where('status').equals('active'))
where('name').matches(/^John/)
where('tags').contains('premium')
where('nested.field').exists()
```

### Supported Query Operators
- **Comparison**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- **Logical**: `$and`, `$or`, `$not`
- **Array**: `$in`, `$nin`, `$contains`, `$size`
- **String**: `$regex`, `$startsWith`, `$endsWith`
- **Existence**: `$exists`, `$type`
- **Nested**: Dot notation for nested object queries

## 🎯 Vector Search

**Location**: `src/utils/VectorUtils.ts`

Provides vector similarity search capabilities with multiple distance algorithms.

### Features
```typescript
class VectorUtils {
  // Distance calculations
  static cosineDistance(a: Vector, b: Vector): number
  static euclideanDistance(a: Vector, b: Vector): number
  static dotProduct(a: Vector, b: Vector): number
  static manhattanDistance(a: Vector, b: Vector): number
  
  // Search operations
  static findSimilar(
    vectors: Vector[], 
    query: Vector, 
    limit: number, 
    algorithm: 'cosine' | 'euclidean'
  ): VectorSearchResult[]
  
  // Indexing (LSH - Locality Sensitive Hashing)
  static createLSHIndex(vectors: Vector[], numBands: number): LSHIndex
  static searchLSH(index: LSHIndex, query: Vector): number[]
}
```

### Vector Search Integration
```typescript
// In Table class
vectorSearch(
  field: string, 
  queryVector: Vector, 
  options?: {
    limit?: number;
    threshold?: number;
    algorithm?: 'cosine' | 'euclidean' | 'dot' | 'manhattan';
  }
): VectorSearchResult[]
```

## 🔄 Middleware System

**Location**: `src/middlewares.ts`

Provides hooks for extending database functionality.

### Middleware Interface
```typescript
interface Middleware {
  beforeInsert?(table: string, document: any): any;
  afterInsert?(table: string, document: any, docId: number): void;
  beforeUpdate?(table: string, fields: any, condition: any): any;
  afterUpdate?(table: string, fields: any, updatedIds: number[]): void;
  beforeRemove?(table: string, condition: any): any;
  afterRemove?(table: string, removedIds: number[]): void;
  beforeSearch?(table: string, condition: any): any;
  afterSearch?(table: string, condition: any, results: any[]): any[];
}
```

### Built-in Middleware
```typescript
class CachingMiddleware implements Middleware {
  // Automatic result caching
  // Cache invalidation on updates
  // Configurable cache size and TTL
}
```

## 🔧 Operations Module

**Location**: `src/operations.ts`

Provides atomic update operations for modifying documents.

### Available Operations
```typescript
// Arithmetic operations
add(field: string, value: number)
subtract(field: string, value: number)
increment(field: string)
decrement(field: string)

// Field operations
set(field: string, value: any)
deleteOp(field: string)  // Named deleteOp to avoid conflict with delete keyword

// Array operations
push(field: string, value: any)
pop(field: string)
pull(field: string, value: any)
```

### Usage Example
```typescript
// Using operations in updates
table.update(
  [
    add('score', 10),
    set('lastUpdated', new Date()),
    increment('viewCount')
  ],
  where('id').equals(userId)
);
```

## 📊 Performance Components

### LRU Cache

**Location**: `src/utils/LRUCache.ts`

Least Recently Used cache implementation for frequently accessed data.

```typescript
class LRUCache<K, V> {
  constructor(maxSize: number)
  
  get(key: K): V | undefined
  set(key: K, value: V): void
  delete(key: K): boolean
  clear(): void
  
  // Statistics
  getStats(): { hits: number; misses: number; hitRate: number }
}
```

### Object Pool

**Location**: `src/utils/ObjectPool.ts`

Manages reusable objects to reduce garbage collection pressure.

```typescript
class ObjectPool<T> {
  constructor(factory: () => T, reset?: (obj: T) => void)
  
  acquire(): T
  release(obj: T): void
  clear(): void
  
  getStats(): { size: number; acquired: number; created: number }
}

// Pre-configured pools
export const arrayPool: ObjectPool<any[]>
export const resultSetPool: ObjectPool<Set<any>>
```

### B-Tree Index

**Location**: `src/utils/BTree.ts`

Balanced tree structure for efficient indexing and range queries.

```typescript
class BTree<K, V> {
  constructor(degree: number = 4)
  
  insert(key: K, value: V): void
  search(key: K): V | undefined
  delete(key: K): boolean
  
  // Range operations
  range(start: K, end: K): Array<[K, V]>
  
  // Statistics
  getHeight(): number
  getSize(): number
}
```

### Copy-on-Write

**Location**: `src/utils/CopyOnWrite.ts`

Efficient immutable data structures for safe concurrent access.

```typescript
class CopyOnWriteObject<T> {
  constructor(data: T)
  
  read(): T
  write(updater: (data: T) => T): void
  
  // Lazy copying - only copies when modified
  // Shared reads for memory efficiency
}
```

## 🔗 Component Interactions

### Data Flow
1. **TinyDB** receives operation request
2. **Table** validates and processes the operation
3. **QueryInstance** evaluates conditions (if applicable)
4. **Storage** backend persists changes
5. **Cache** and **Indexes** updated for performance

### Error Handling
- Validation errors bubble up from schema layer
- Storage errors wrapped with context
- Query errors provide detailed condition information
- Transaction errors trigger automatic rollback

### Event Propagation
1. Middleware `before*` hooks called
2. Core operation executed
3. Indexes and caches updated
4. Middleware `after*` hooks called
5. Results returned to caller

This modular architecture provides flexibility, performance, and maintainability while keeping the API simple and intuitive.