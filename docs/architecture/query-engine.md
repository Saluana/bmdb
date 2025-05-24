# Query Engine Architecture

The query engine provides a flexible and efficient system for querying documents with support for complex conditions, indexing, and parallel processing.

## 🎯 Query System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Query Pipeline                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Query Building (where clauses, conditions)                 │
│  2. Query Optimization (index selection, condition reordering) │
│  3. Execution Planning (parallel vs sequential, chunking)      │
│  4. Data Access (storage backend, caching)                     │
│  5. Result Processing (filtering, sorting, pagination)         │
│  6. Result Caching (LRU cache for frequent queries)           │
└─────────────────────────────────────────────────────────────────┘
```

## 🔍 QueryInstance Class

**Location**: `src/query/QueryInstance.ts`

The core query representation and evaluation engine.

### Key Features
```typescript
class QueryInstance {
  // Query evaluation
  test(document: any): boolean
  
  // Query optimization
  getOptimizedCondition(): OptimizedCondition
  isIndexable(): boolean
  getIndexableFields(): string[]
  
  // Query analysis
  getComplexity(): number
  requiresFullScan(): boolean
  canUseIndex(indexName: string): boolean
}
```

### Query Condition Types
```typescript
type QueryLike<T> = 
  | Partial<T>                    // Simple field matching
  | QueryInstance                 // Complex query instance
  | QueryCondition                // Raw condition object
  | ((doc: T) => boolean)         // Function predicate
```

### Condition Operators
```typescript
interface QueryCondition {
  // Comparison operators
  $eq?: any;          // Equal to
  $ne?: any;          // Not equal to
  $gt?: any;          // Greater than
  $gte?: any;         // Greater than or equal
  $lt?: any;          // Less than
  $lte?: any;         // Less than or equal
  
  // Array operators
  $in?: any[];        // Value in array
  $nin?: any[];       // Value not in array
  $contains?: any;    // Array contains value
  $size?: number;     // Array size equals
  
  // String operators
  $regex?: RegExp;    // Regular expression match
  $startsWith?: string; // String starts with
  $endsWith?: string;   // String ends with
  
  // Logical operators
  $and?: QueryCondition[]; // All conditions true
  $or?: QueryCondition[];  // Any condition true
  $not?: QueryCondition;   // Condition false
  
  // Existence operators
  $exists?: boolean;  // Field exists
  $type?: string;     // Field type check
}
```

## 🔗 Where Clause Builder

**Location**: `src/query/where.ts`

Fluent interface for building complex queries with type safety.

### Fluent API
```typescript
// Basic usage
where('age').gte(18)
where('name').equals('John')
where('email').matches(/.*@company\.com/)

// Chaining conditions
where('age').gte(18).and(where('status').equals('active'))
where('score').gt(80).or(where('premium').equals(true))

// Nested conditions
where('age').gte(18)
  .and(
    where('status').equals('active')
      .or(where('role').equals('admin'))
  )

// Array operations
where('tags').contains('premium')
where('permissions').size(3)
where('categories').in(['tech', 'science'])

// String operations
where('name').startsWith('John')
where('email').endsWith('@company.com')
where('description').matches(/urgent/i)

// Existence checks
where('optionalField').exists()
where('metadata.version').type('string')
```

### Method Chaining
```typescript
class QueryBuilder<T> {
  // Comparison methods
  equals(value: any): QueryBuilder<T>
  notEquals(value: any): QueryBuilder<T>
  gt(value: any): QueryBuilder<T>
  gte(value: any): QueryBuilder<T>
  lt(value: any): QueryBuilder<T>
  lte(value: any): QueryBuilder<T>
  
  // Array methods
  in(values: any[]): QueryBuilder<T>
  notIn(values: any[]): QueryBuilder<T>
  contains(value: any): QueryBuilder<T>
  size(value: number): QueryBuilder<T>
  
  // String methods
  matches(regex: RegExp): QueryBuilder<T>
  startsWith(prefix: string): QueryBuilder<T>
  endsWith(suffix: string): QueryBuilder<T>
  
  // Logical methods
  and(condition: QueryBuilder<T>): QueryBuilder<T>
  or(condition: QueryBuilder<T>): QueryBuilder<T>
  not(): QueryBuilder<T>
  
  // Existence methods
  exists(exists: boolean = true): QueryBuilder<T>
  type(typeName: string): QueryBuilder<T>
}
```

## 🚀 Query Optimization

### Index-Based Optimization
```typescript
interface QueryOptimizer {
  // Index selection
  selectBestIndex(condition: QueryCondition, availableIndexes: Index[]): Index | null
  
  // Condition reordering
  reorderConditions(conditions: QueryCondition[]): QueryCondition[]
  
  // Query simplification
  simplifyCondition(condition: QueryCondition): QueryCondition
  
  // Cost estimation
  estimateQueryCost(condition: QueryCondition, tableSize: number): number
}
```

### Optimization Strategies
1. **Index Selection**: Choose the most selective index
2. **Condition Reordering**: Evaluate cheapest conditions first
3. **Short-Circuit Evaluation**: Stop early when possible
4. **Range Optimization**: Combine multiple range conditions
5. **Composite Index Usage**: Leverage multi-field indexes

### Query Planning
```typescript
interface QueryPlan {
  strategy: 'full-scan' | 'index-scan' | 'key-lookup';
  estimatedCost: number;
  expectedResults: number;
  indexesToUse: string[];
  parallelizable: boolean;
}
```

## ⚡ Parallel Query Processing

### Parallel Query Options
```typescript
interface ParallelQueryOptions {
  chunkSize?: number;        // Documents per chunk (default: 1000)
  maxConcurrency?: number;   // Max parallel workers (default: CPU cores)
  useWorkerThreads?: boolean; // Use worker threads vs async (default: false)
}
```

### Parallel Execution Strategies
```typescript
class ParallelQueryProcessor {
  // Chunk-based processing
  async searchParallel<T>(
    documents: T[],
    condition: QueryLike<T>,
    options: ParallelQueryOptions
  ): Promise<T[]>
  
  // Map-reduce aggregation
  async aggregateParallel<T, R>(
    documents: T[],
    mapper: (chunk: T[]) => R,
    reducer: (results: R[]) => R,
    options: ParallelQueryOptions
  ): Promise<R>
  
  // Parallel updates
  async updateParallel<T>(
    documents: T[],
    updates: Array<{ condition: QueryLike<T>; fields: Partial<T> }>,
    options: ParallelQueryOptions
  ): Promise<number[]>
}
```

### Work Distribution
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Main         │    │    Worker       │    │    Worker       │
│    Thread       │    │    Thread 1     │    │    Thread 2     │
│                 │    │                 │    │                 │
│  ┌───────────┐  │    │  ┌───────────┐  │    │  ┌───────────┐  │
│  │  Chunk 1  │──┼────┼─▶│  Process  │  │    │  │           │  │
│  │  Chunk 2  │──┼────┼──┼─────────────────────▶│  Process  │  │
│  │  Chunk 3  │──┼────┼─▶│  Results  │  │    │  │  Results  │  │
│  │    ...    │  │    │  └───────────┘  │    │  └───────────┘  │
│  └───────────┘  │    │                 │    │                 │
│                 │    │  ┌───────────┐  │    │  ┌───────────┐  │
│  ┌───────────┐  │    │  │   Return  │  │    │  │   Return  │  │
│  │  Combine  │◀─┼────┼──│  Results  │  │    │  │  Results  │  │
│  │  Results  │  │    │  └───────────┘  │    │  └───────────┘  │
│  └───────────┘  │    └─────────────────┘    └─────────────────┘
└─────────────────┘
```

## 🎯 Vector Search Engine

### Vector Query Interface
```typescript
interface VectorSearchOptions {
  limit?: number;           // Maximum results (default: 10)
  threshold?: number;       // Similarity threshold (0-1)
  algorithm?: 'cosine' | 'euclidean' | 'dot' | 'manhattan';
  includeScore?: boolean;   // Include similarity scores
  filter?: QueryLike<any>;  // Pre-filter documents
}

interface VectorSearchResult {
  document: any;
  score: number;
  docId: number;
}
```

### Distance Algorithms
```typescript
class VectorDistanceCalculator {
  // Cosine similarity (normalized dot product)
  static cosineDistance(a: Vector, b: Vector): number
  
  // Euclidean distance (L2 norm)
  static euclideanDistance(a: Vector, b: Vector): number
  
  // Dot product similarity
  static dotProduct(a: Vector, b: Vector): number
  
  // Manhattan distance (L1 norm)
  static manhattanDistance(a: Vector, b: Vector): number
}
```

### LSH Indexing
```typescript
interface LSHIndex {
  // Locality Sensitive Hashing for approximate nearest neighbors
  numBands: number;
  numRows: number;
  hashTables: Map<string, Set<number>>[];
  
  // Query interface
  search(queryVector: Vector, candidates: number): number[]
  insert(docId: number, vector: Vector): void
  remove(docId: number): void
}
```

## 📊 Query Performance

### Lazy Iteration
```typescript
class LazyIterator<T> implements AsyncIterable<T> {
  constructor(
    table: Table<any>,
    condition?: QueryLike<any>,
    options: LazyIteratorOptions = {}
  )
  
  // Async iteration support
  async *[Symbol.asyncIterator](): AsyncIterator<T>
  
  // Pagination support
  async nextPage(): Promise<T[]>
  hasMore(): boolean
  
  // Caching options
  setCacheSize(size: number): void
  enablePrefetch(enable: boolean): void
}

interface LazyIteratorOptions {
  pageSize?: number;      // Items per page (default: 100)
  prefetchNext?: boolean; // Prefetch next page (default: true)
  cachePages?: boolean;   // Cache previous pages (default: false)
}
```

### Pagination Support
```typescript
interface PaginatedResult<T> {
  data: T[];              // Current page results
  page: number;           // Current page number (1-based)
  pageSize: number;       // Items per page
  totalCount: number;     // Total matching documents
  totalPages: number;     // Total number of pages
  hasMore: boolean;       // Has more pages
  nextPage?: number;      // Next page number
  previousPage?: number;  // Previous page number
}

// Usage
const result = table.searchPaginated(
  where('age').gte(18),
  1,    // page
  50    // pageSize
);
```

## 🔧 Query Execution Modes

### Sequential Execution
```typescript
// Traditional single-threaded execution
const results = table.search(where('status').equals('active'));
```

### Parallel Execution
```typescript
// Multi-threaded execution for large datasets
const results = await table.searchParallel(
  where('status').equals('active'),
  {
    chunkSize: 1000,
    maxConcurrency: 4
  }
);
```

### Streaming Execution
```typescript
// Memory-efficient streaming for very large result sets
for await (const document of table.lazy(where('status').equals('active'))) {
  // Process one document at a time
  processDocument(document);
}
```

## 📈 Performance Optimization

### Query Caching
```typescript
interface QueryCache {
  // Cache query results
  get(queryHash: string): any[] | undefined
  set(queryHash: string, results: any[], ttl?: number): void
  
  // Cache statistics
  getStats(): { hits: number; misses: number; hitRate: number }
  
  // Cache management
  clear(): void
  evict(pattern: string): void
}
```

### Index Utilization
```typescript
// Automatic index creation for frequently queried fields
table.createIndex('email', { unique: true });
table.createCompoundIndex(['lastName', 'firstName']);

// Query optimization automatically uses appropriate indexes
const users = table.search(where('email').equals('user@example.com'));
// ^ Uses unique index for O(1) lookup

const sorted = table.search(where('lastName').equals('Smith'));
// ^ Uses compound index for efficient filtering
```

### Query Statistics
```typescript
interface QueryStats {
  executionTime: number;      // Query execution time in ms
  documentsScanned: number;   // Total documents examined
  documentsReturned: number;  // Documents matching condition
  indexesUsed: string[];      // Indexes utilized
  optimizationApplied: string[]; // Optimizations used
}

// Enable query profiling
table.enableProfiling(true);
const results = table.search(condition);
const stats = table.getLastQueryStats();
```

This query engine architecture provides powerful querying capabilities while maintaining high performance through intelligent optimization, parallel processing, and efficient indexing strategies.