# BMDB Documentation

Welcome to the comprehensive documentation for **BMDB** - a high-performance, ACID-compliant embedded database with WAL optimization, MVCC, and vector search capabilities.

## 📚 Documentation Structure

### 🏗️ Architecture
- [**Architecture Overview**](./architecture/overview.md) - High-level system architecture
- [**Core Components**](./architecture/core-components.md) - Database engine components
- [**Storage Layer**](./architecture/storage-layer.md) - Storage implementations and design
- [**Query Engine**](./architecture/query-engine.md) - Query processing and optimization

### 📖 API Reference
- [**TinyDB Class**](./api/tinydb.md) - Main database class
- [**Table Class**](./api/table.md) - Table operations and methods
- [**SchemaTable Class**](./api/schema-table.md) - Schema-validated tables
- [**Storage Interfaces**](./api/storage.md) - Storage layer APIs
- [**Query System**](./api/queries.md) - Query building and execution
- [**Utilities**](./api/utilities.md) - Helper classes and functions

### 🚀 Guides
- [**Getting Started**](./guides/getting-started.md) - Quick start guide
- [**Storage Engines**](./guides/storage-engines.md) - Choosing and configuring storage
- [**Schema Validation**](./guides/schema-validation.md) - Working with schemas
- [**Performance Optimization**](./guides/performance.md) - Performance tuning
- [**Vector Search**](./guides/vector-search.md) - Vector similarity search
- [**Transactions**](./guides/transactions.md) - ACID transactions and MVCC

### 📝 Examples
- [**Basic Usage**](./examples/basic-usage.md) - Simple database operations
- [**Advanced Queries**](./examples/advanced-queries.md) - Complex query patterns
- [**High-Performance Scenarios**](./examples/high-performance.md) - Optimized configurations
- [**Vector Search Examples**](./examples/vector-search-examples.md) - Vector operations
- [**Migration Examples**](./examples/migrations.md) - Data migration patterns

## 🔍 Quick Navigation

### For New Users
1. Start with [Getting Started](./guides/getting-started.md)
2. Review [Basic Usage Examples](./examples/basic-usage.md)
3. Explore [Storage Engines](./guides/storage-engines.md)

### For Advanced Users
1. Check [Architecture Overview](./architecture/overview.md)
2. Dive into [Performance Optimization](./guides/performance.md)
3. Explore [Advanced Examples](./examples/high-performance.md)

### For API Reference
- [TinyDB API](./api/tinydb.md) - Main database interface
- [Table API](./api/table.md) - Table operations
- [Storage API](./api/storage.md) - Storage layer

## 🏷️ Key Features

- **High Performance**: WAL optimization with 100-200x improvement on write-heavy workloads
- **ACID Compliance**: Full MVCC support with snapshot isolation
- **Multiple Storage Engines**: JSON, Binary (MessagePack), Memory, WAL-optimized
- **Vector Search**: Built-in similarity search with LSH indexing
- **Schema Validation**: Zod-powered validation with unique constraints
- **TypeScript First**: Complete type safety and IntelliSense support

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.

## 🤝 Contributing

See the main [README](../README.md) for contribution guidelines.