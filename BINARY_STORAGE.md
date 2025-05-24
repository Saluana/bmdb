# Binary Storage Implementation

This implementation adds a custom binary storage format to TinyDB with the following features:

## Key Features

### 1. MessagePack Serialization
- **Compact binary format**: Documents are serialized using MessagePack, which is more space-efficient than JSON
- **Type preservation**: Maintains JavaScript types (numbers, strings, booleans, objects, arrays, null)
- **Fast encoding/decoding**: Efficient binary serialization/deserialization

### 2. Memory-Mapped B-Tree Index
- **Fast lookups**: O(log n) document location lookup without deserializing the entire file
- **Persistent index**: B-tree structure is stored in the file and memory-mapped for quick access
- **Scalable**: Handles large numbers of documents efficiently

### 3. Single-File Binary Format
- **Structured layout**: File is organized with header, B-tree nodes, and document data areas
- **Persistent**: All data survives database restarts
- **Compact**: No wasted space, efficient storage format

## File Format

```
[Header: 32 bytes] [B-tree Area: 1MB] [Document Data: Variable]
```

### Header Structure (32 bytes)
- Magic number (4 bytes): "BMDB"
- Version (4 bytes): Format version
- Root node offset (4 bytes): B-tree root location
- Next node offset (4 bytes): Next available B-tree node offset
- Document count (4 bytes): Total documents
- Free space offset (4 bytes): Start of free document area
- Reserved (8 bytes): Future use

### B-Tree Area
- Fixed-size nodes (1024 bytes each)
- Leaf nodes contain document location mappings
- Internal nodes for tree navigation
- Memory-mapped for fast access

### Document Data Area
- Variable-size MessagePack-encoded documents
- Documents stored consecutively
- Efficient space utilization

## Usage

```typescript
import { TinyDB, BinaryStorage } from './src/index';

// Create database with binary storage
const db = new TinyDB('mydata.bmdb', { storage: BinaryStorage });

// Use normally - all operations work with binary storage
db.insert({ name: 'John', age: 30 });
const users = db.search(where('age').__gt__(25));
```

## Performance Benefits

### 1. Selective Reading
- Only requested documents are deserialized
- No need to load entire database into memory
- Fast queries on large datasets

### 2. Efficient Updates
- Documents can be updated in-place when size doesn't change
- B-tree index provides fast location lookup
- Minimal file I/O for single document operations

### 3. Compact Storage
- MessagePack is ~30% more compact than JSON
- No redundant whitespace or formatting
- Efficient use of disk space

## Implementation Files

### Core Components
- `src/storage/BinaryStorage.ts` - Main storage implementation
- `src/utils/BTree.ts` - B-tree index implementation  
- `src/utils/MessagePackUtil.ts` - MessagePack serialization

### Key Classes
- `BinaryStorage` - Implements Storage interface with binary format
- `BTree` - Persistent B-tree for document indexing
- `MessagePackUtil` - Binary serialization utilities

## Advantages over JSON Storage

1. **Space Efficiency**: ~30% smaller files
2. **Read Performance**: O(log n) document lookup vs O(n) full scan
3. **Memory Usage**: Only loads requested documents
4. **Type Safety**: Preserves JavaScript types natively
5. **Scalability**: Handles large datasets efficiently

## Use Cases

- **Large datasets**: When you have thousands of documents
- **Memory constraints**: When you can't load entire database
- **Performance critical**: When query speed matters
- **Space efficiency**: When disk space is limited
- **Frequent reads**: When you query more than you write

## Future Enhancements

- File compaction to remove fragmented space
- Index compression for even better performance
- Background indexing for write-heavy workloads
- Multi-threaded access with proper locking
- Backup and recovery utilities

The binary storage implementation provides a significant upgrade over JSON storage for production use cases while maintaining full compatibility with the existing TinyDB API.