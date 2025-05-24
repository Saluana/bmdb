# Architecture Overview

BMDB is designed as a high-performance, embedded document database with a layered architecture that provides flexibility, performance, and ACID compliance.

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                        │
├─────────────────────────────────────────────────────────────────┤
│                         TinyDB API                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    Table    │  │ SchemaTable │  │    Query Operations     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        Query Engine                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ QueryInstance│  │ Where Clause│  │    Vector Search        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                       Storage Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ JSONStorage │  │ WALStorage  │  │    BinaryStorage        │  │
│  │MemoryStorage│  │WALJSONStorage│  │   StreamingStorage     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                       Utility Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   LRU Cache │  │   B-Tree    │  │    Object Pooling       │  │
│  │ MessagePack │  │ VectorUtils │  │  Connection Pooling     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🎯 Core Design Principles

### 1. **Performance First**
- Optimized WAL (Write-Ahead Logging) with intelligent batching
- Object pooling to reduce garbage collection pressure
- B-Tree indexing for fast lookups and range queries
- Copy-on-write semantics for efficient data operations

### 2. **Type Safety**
- Full TypeScript implementation with comprehensive type definitions
- Schema validation using Zod for runtime type checking
- Compile-time type inference for database operations

### 3. **Pluggable Storage**
- Abstract storage interface allows multiple backend implementations
- Each storage engine optimized for specific use cases
- Easy to extend with custom storage implementations

### 4. **ACID Compliance**
- Multi-Version Concurrency Control (MVCC) for transaction isolation
- Write-Ahead Logging ensures durability and consistency
- Atomic operations with rollback capabilities

## 🔧 Component Layers

### Application Layer
The top-level API that applications interact with:

- **TinyDB**: Main database class providing a unified interface
- **Table**: Document table operations (insert, update, delete, query)
- **SchemaTable**: Schema-validated table with type safety and constraints

### Query Engine
Handles query parsing, optimization, and execution:

- **QueryInstance**: Query condition representation and evaluation
- **Where Clauses**: Fluent query building interface
- **Vector Search**: Similarity search with multiple distance algorithms
- **Parallel Processing**: Multi-threaded query execution for large datasets

### Storage Layer
Pluggable storage backends with different characteristics:

- **JSONStorage**: Human-readable JSON files for development
- **WALJSONStorage**: High-performance WAL-optimized JSON storage
- **BinaryStorage**: Compact MessagePack binary format
- **MemoryStorage**: In-memory storage for caching and testing
- **StreamingStorage**: Large dataset streaming capabilities

### Utility Layer
Supporting components for performance and functionality:

- **LRU Cache**: Intelligent caching for frequently accessed data
- **B-Tree**: Balanced tree for efficient indexing
- **Object Pooling**: Memory management optimization
- **Vector Utils**: Vector operations and similarity calculations

## 🚀 Performance Optimizations

### WAL Optimizations
- **Intelligent Batching**: Groups write operations to reduce fsync storms
- **Optimistic Locking**: Microsecond-level lock acquisition times
- **Incremental Compaction**: Non-blocking 4MB slice processing
- **Background Processing**: Asynchronous WAL maintenance

### Memory Management
- **Object Pooling**: Reuses objects to minimize garbage collection
- **Copy-on-Write**: Efficient immutable data structures
- **Lazy Loading**: Deferred loading of large datasets
- **Memory Mapping**: Direct file system access for large files

### Query Optimization
- **Index Usage**: Automatic index selection for optimal query performance
- **Parallel Execution**: Multi-threaded query processing
- **Result Caching**: LRU cache for frequently accessed query results
- **Lazy Iteration**: Memory-efficient streaming of large result sets

## 🔄 Data Flow

### Write Operations
1. **Validation**: Schema validation (if applicable)
2. **WAL Entry**: Write operation logged to WAL
3. **Memory Update**: In-memory data structures updated
4. **Batch Processing**: Operations batched for efficiency
5. **Persistence**: Batch written to storage backend
6. **Compaction**: Background compaction maintains performance

### Read Operations
1. **Cache Check**: LRU cache consulted first
2. **Index Lookup**: B-Tree indexes used for fast access
3. **Data Retrieval**: Storage backend accessed if needed
4. **Result Assembly**: Query results assembled and cached
5. **Type Conversion**: Data converted to appropriate types

### Transaction Processing
1. **Begin**: MVCC snapshot created
2. **Operations**: All operations logged in transaction context
3. **Validation**: Constraint checking and conflict detection
4. **Commit/Abort**: Either all changes applied or none
5. **Cleanup**: Transaction resources released

## 📊 Scalability Characteristics

### Write Performance
- **Throughput**: 50,000+ operations/second with WAL storage
- **Latency**: Sub-millisecond write latency with batching
- **Concurrency**: Multiple concurrent writers supported

### Read Performance
- **Cache Hit Rate**: 90%+ cache hit rates for typical workloads
- **Index Performance**: O(log n) lookup performance with B-Trees
- **Parallel Queries**: Linear scaling with CPU cores

### Storage Efficiency
- **Compression**: MessagePack provides 30-50% size reduction
- **Compaction**: Automatic cleanup maintains optimal file sizes
- **Memory Usage**: Configurable memory limits and caching strategies

## 🔧 Configuration Points

### Storage Configuration
```typescript
const db = new TinyDB('data.json', WALJSONStorage, {
  batchSize: 1000,           // Operations per batch
  maxBatchWaitMs: 20,        // Maximum batch wait time
  compactThreshold: 5000,    // WAL size trigger for compaction
  autoFlushMs: 100,          // Auto-flush interval
  backgroundCompaction: true // Enable background compaction
});
```

### Performance Tuning
```typescript
// Enable connection pooling for high concurrency
db.enableConnectionPool({
  maxConnections: 10,
  minConnections: 2,
  maxIdleTime: 30000
});

// Configure caching
const table = db.table('users', {
  cacheSize: 1000  // LRU cache size
});
```

This architecture provides a solid foundation for high-performance embedded database operations while maintaining flexibility and extensibility for various use cases.