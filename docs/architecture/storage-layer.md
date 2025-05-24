# Storage Layer Architecture

The storage layer provides pluggable backends for persisting data with different performance characteristics and use cases.

## 🏗️ Storage Interface

**Location**: `src/storage/Storage.ts`

All storage implementations conform to a unified interface:

```typescript
interface Storage {
  // Core operations
  read(): JsonObject | null;
  write(obj: JsonObject): void;
  close(): void;
  
  // Index management
  createIndex(tableName: string, field: string, options?: { unique?: boolean }): Promise<void>;
  createCompoundIndex(tableName: string, fields: string[], options?: { unique?: boolean; name?: string }): Promise<void>;
  dropIndex(tableName: string, indexName: string): Promise<void>;
  listIndexes(tableName?: string): Promise<IndexDefinition[]>;
  
  // Uniqueness checking
  checkUnique(tableName: string, field: string, value: any, excludeDocId?: string): Promise<boolean>;
  checkCompoundUnique(tableName: string, fields: string[], values: any[], excludeDocId?: string): Promise<boolean>;
  
  // Vector operations
  createVectorIndex(tableName: string, field: string, dimensions: number, algorithm?: 'cosine' | 'euclidean' | 'dot' | 'manhattan'): Promise<void>;
  dropVectorIndex(tableName: string, indexName: string): Promise<void>;
  listVectorIndexes(tableName?: string): Promise<VectorIndexDefinition[]>;
  vectorSearch(tableName: string, field: string, queryVector: Vector, options?: { limit?: number; threshold?: number }): Promise<VectorSearchResult[]>;
  
  // Feature support
  supportsFeature(feature: 'compoundIndex' | 'batch' | 'tx' | 'async' | 'fileLocking' | 'vectorSearch'): boolean;
}
```

## 📄 JSONStorage

**Location**: `src/storage/JSONStorage.ts`

Simple JSON file-based storage for development and small datasets.

### Characteristics
- **Format**: Human-readable JSON files
- **Performance**: Good for small to medium datasets (< 10MB)
- **Durability**: Atomic writes with temporary files
- **Concurrency**: Basic file locking support

### Use Cases
```typescript
import { TinyDB, JSONStorage } from 'bmdb';

// Development and prototyping
const db = new TinyDB('data.json', JSONStorage);

// Small configuration stores
const config = new TinyDB('config.json', JSONStorage);

// Testing scenarios
const testDb = new TinyDB('test-data.json', JSONStorage);
```

### Implementation Details
- Synchronous file I/O for simplicity
- Pretty-printed JSON for readability
- Backup files created during writes
- Basic corruption detection and recovery

## 🚀 WALJSONStorage (Recommended)

**Location**: `src/storage/WALJSONStorage.ts`

High-performance Write-Ahead Logging implementation optimized for production workloads.

### Key Features
- **100-200x performance improvement** on write-heavy workloads
- ACID transaction support with MVCC
- Intelligent batching reduces fsync storms
- Background compaction maintains performance
- Optimistic locking for high concurrency

### Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │       WAL       │    │   Data File     │
│   Operations    │───▶│   Operations    │───▶│   Compacted     │
│                 │    │   (Batched)     │    │     Data        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Background    │
                       │   Compaction    │
                       └─────────────────┘
```

### Configuration Options
```typescript
const db = new TinyDB('data.json', WALJSONStorage, {
  batchSize: 1000,              // Operations per batch
  maxBatchWaitMs: 20,           // Maximum batch wait time
  compactThreshold: 5000,       // WAL size trigger for compaction
  autoFlushMs: 100,             // Auto-flush interval
  backgroundCompaction: true,   // Enable background compaction
  useMsgPack: false            // Use MessagePack for WAL entries
});
```

### WAL Operations
```typescript
interface WALOperation {
  type: 'write' | 'delete' | 'update' | 'begin' | 'commit' | 'abort';
  txid: number;
  timestamp: number;
  data: JsonObject;
  stable?: boolean;
}
```

### Performance Optimizations
1. **Intelligent Batching**: Groups operations to reduce disk I/O
2. **Optimistic Locking**: Microsecond-level lock acquisition
3. **Incremental Compaction**: Non-blocking 4MB slice processing
4. **MVCC Snapshots**: Consistent reads without blocking writes
5. **Background Processing**: Asynchronous maintenance operations

## 💾 BinaryStorage

**Location**: `src/storage/BinaryStorage.ts`

Compact binary format using MessagePack with memory-mapped B-tree indexing.

### File Format
```
[Header 32 bytes] [B-tree nodes] [Document data blocks]

Header structure:
- Magic number (4 bytes): "BMDB"
- Version (4 bytes): Format version
- Root node offset (4 bytes): Offset to B-tree root
- Next node offset (4 bytes): Next available B-tree node offset
- Document count (4 bytes): Total number of documents
- Free space offset (4 bytes): Start of free space for documents
- Reserved (8 bytes): For future use
```

### Key Features
- **30-50% smaller file sizes** compared to JSON
- **Memory-mapped file access** for large datasets
- **B-tree indexing** for O(log n) lookups
- **Corruption detection** with checksums

### Use Cases
```typescript
import { TinyDB, BinaryStorage } from 'bmdb';

// Large datasets requiring storage efficiency
const db = new TinyDB('data.msgpack', BinaryStorage);

// High-performance read-heavy workloads
const analytics = new TinyDB('analytics.bmdb', BinaryStorage);
```

### Memory Management
- 64KB memory-mapped chunks
- LRU eviction of unused chunks
- Lazy loading of document data
- Efficient space reclamation

## 🧠 MemoryStorage

**Location**: `src/storage/MemoryStorage.ts`

In-memory storage for caching, testing, and temporary data.

### Characteristics
- **Fastest access**: No disk I/O overhead
- **No persistence**: Data lost when process exits
- **Memory efficient**: Direct object references
- **Testing friendly**: Clean state for each test

### Use Cases
```typescript
import { TinyDB, MemoryStorage } from 'bmdb';

// Caching layer
const cache = new TinyDB(MemoryStorage);

// Testing
const testDb = new TinyDB(MemoryStorage);

// Session storage
const session = new TinyDB(MemoryStorage);
```

### Implementation
- Simple Map-based storage
- Copy-on-write for safety
- Optional data cloning for isolation
- Memory usage monitoring

## 🌊 StreamingStorage

**Location**: `src/storage/StreamingStorage.ts`

Specialized storage for handling large datasets that don't fit in memory.

### Features
- **Streaming reads**: Process large datasets incrementally
- **Append-only writes**: Optimized for log-like data
- **Configurable buffering**: Balance memory usage and performance
- **Compression support**: Optional data compression

### Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │   Stream        │    │   File          │
│   Read/Write    │◄──►│   Buffer        │◄──►│   System        │
│                 │    │   (Chunked)     │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Configuration
```typescript
const db = new TinyDB('stream.data', StreamingStorage, {
  bufferSize: 64 * 1024,      // 64KB buffer
  compressionLevel: 6,         // gzip compression
  maxMemoryUsage: 100 * 1024 * 1024  // 100MB memory limit
});
```

## 🔄 WALStorage (Base Class)

**Location**: `src/storage/WALStorage.ts`

Base implementation for Write-Ahead Logging with transaction support.

### Transaction Model
```typescript
interface Transaction {
  txid: number;
  operations: WALOperation[];
  committed: boolean;
  aborted: boolean;
}
```

### MVCC Implementation
- **Snapshot isolation**: Each transaction sees consistent data
- **Optimistic concurrency**: Conflicts detected at commit time
- **Version vectors**: Track data versions for conflict resolution
- **Garbage collection**: Clean up old versions automatically

### Recovery Process
1. **WAL Replay**: Reconstruct state from WAL on startup
2. **Consistency Check**: Verify data integrity
3. **Transaction Recovery**: Complete or abort incomplete transactions
4. **Compaction**: Optimize file layout after recovery

## 📊 Performance Comparison

| Storage Engine | Read Latency | Write Throughput | Storage Efficiency | Memory Usage |
|----------------|--------------|------------------|-------------------|--------------|
| MemoryStorage  | <0.1ms       | 100,000+ ops/s   | N/A (memory)      | High         |
| WALJSONStorage | <1ms         | 50,000+ ops/s    | Good              | Low          |
| BinaryStorage  | <2ms         | 15,000 ops/s     | Excellent (50% reduction) | Low |
| JSONStorage    | 5-20ms       | 500 ops/s        | Poor              | Medium       |
| StreamingStorage| Variable    | 10,000+ ops/s    | Good (with compression) | Configurable |

## 🔧 Storage Selection Guide

### Choose **MemoryStorage** when:
- Building caches or temporary data stores
- Running tests that need clean state
- Working with small datasets that fit in memory
- Maximum performance is critical

### Choose **WALJSONStorage** when:
- Building production applications
- High write throughput is required
- ACID transactions are needed
- Data durability is important

### Choose **BinaryStorage** when:
- Storage space is limited
- Working with large datasets
- Read performance is more important than write performance
- Binary format is acceptable

### Choose **JSONStorage** when:
- Developing or prototyping
- Human-readable storage is important
- Dataset is small (< 10MB)
- Simplicity is preferred over performance

### Choose **StreamingStorage** when:
- Processing very large datasets
- Memory usage must be controlled
- Append-heavy workloads
- Data compression is beneficial

## 🔒 Concurrency and Locking

### File Locking
```typescript
// Optional file locking for concurrent access
interface Storage {
  acquireWriteLock?(): Promise<void>;
  releaseWriteLock?(): Promise<void>;
  acquireReadLock?(): Promise<void>;
  releaseReadLock?(): Promise<void>;
}
```

### Lock Strategies
- **Exclusive writes**: Only one writer at a time
- **Shared reads**: Multiple readers allowed
- **Lock timeouts**: Prevent deadlocks
- **Lock queuing**: Fair ordering of lock requests

### Conflict Resolution
- **Optimistic locking**: Check for conflicts at commit time
- **Pessimistic locking**: Acquire locks before operations
- **Retry mechanisms**: Automatic retry on conflicts
- **Deadlock detection**: Prevent circular lock dependencies

This storage architecture provides flexibility to choose the right backend for specific use cases while maintaining a consistent API across all implementations.