# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-05-24

### Added
- Initial release of BMDB
- High-performance WAL storage with optimized batching
- ACID transactions with MVCC support
- Multiple storage engines (JSON, Binary, Memory, WAL)
- Vector search capabilities with LSH indexing
- Schema validation with Zod integration
- TypeScript-first design with comprehensive type definitions
- Object pooling and memory optimizations
- B-Tree indexing for fast lookups
- Copy-on-write data structures
- LRU caching system

### Performance
- WAL optimizations: 100-200x improvement on write-heavy workloads
- Intelligent batching (1000 operations, 20ms coalescing)
- Optimistic locking with microsecond-level acquisition
- Incremental compaction with 4MB slice processing
- Non-blocking background operations

### Features
- CRUD operations with flexible querying
- Compound indexes and unique constraints
- Middleware support for custom operations
- Comprehensive error handling
- Transaction isolation levels
- Vector similarity search
- Binary storage with MessagePack
- In-memory storage for caching