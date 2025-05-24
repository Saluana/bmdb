# BMDB Performance Evaluation Results

Generated on: 2025-05-24T18:55:07.864Z

## Test Environment
- Runtime: Bun
- Platform: darwin
- Node Version: v22.6.0

## Summary

This performance evaluation compares different storage implementations in BMDB:

- **Memory Storage**: In-memory only, fastest but not persistent
- **JSON Storage**: Traditional JSON file storage
- **WAL Storage**: Write-Ahead Log with MVCC and transactions

## Test Operations

1. **Bulk Insert**: Insert all test documents sequentially
2. **Sequential Reads**: Read documents by ID in order
3. **Random Updates**: Update random documents
4. **Complex Queries**: Age range + boolean field queries
5. **Mixed Workload**: 25% each of insert/read/update/query operations
6. **Transactions**: WAL-specific transactional operations
7. **Concurrent Reads**: Read performance during transactions

## Results by Dataset Size


### 1000 Documents

| Operation | Storage | Ops/sec | Avg Time (ms) | Total Time (ms) |
|-----------|---------|---------|---------------|----------------|
| Bulk Insert (Individual) | Memory | 7624 | 0.131 | 131.2 |
| Bulk Insert (Individual) | JSON | 268 | 3.731 | 3731.3 |
| Bulk Insert (Individual) | WAL | 148 | 6.756 | 6756.0 |
| Bulk Insert (Batch) | Memory | 391543 | 0.003 | 2.6 |
| Bulk Insert (Batch) | JSON | 57227 | 0.017 | 17.5 |
| Bulk Insert (Batch) | WAL | 21576 | 0.046 | 46.3 |
| Sequential Reads | Memory | 12457 | 0.080 | 80.3 |
| Sequential Reads | JSON | 893 | 1.120 | 1120.3 |
| Sequential Reads | WAL | 370 | 2.701 | 2700.8 |
| Random Updates | Memory | 12845 | 0.078 | 77.8 |
| Random Updates | JSON | 191 | 5.235 | 5234.5 |
| Random Updates | WAL | 91 | 10.939 | 10939.4 |
| Complex Queries | Memory | 7718 | 0.130 | 6.5 |
| Complex Queries | JSON | 7110 | 0.141 | 7.0 |
| Complex Queries | WAL | 1967 | 0.508 | 25.4 |
| Mixed Workload | Memory | 3691 | 0.271 | 54.2 |
| Mixed Workload | JSON | 174 | 5.744 | 1148.8 |
| Mixed Workload | WAL | 121 | 8.231 | 1646.3 |

### 2000 Documents

| Operation | Storage | Ops/sec | Avg Time (ms) | Total Time (ms) |
|-----------|---------|---------|---------------|----------------|
| Bulk Insert (Individual) | Memory | 3117 | 0.321 | 641.7 |
| Bulk Insert (Individual) | JSON | 140 | 7.145 | 14289.3 |
| Bulk Insert (Individual) | WAL | 71 | 14.163 | 28325.8 |
| Bulk Insert (Batch) | Memory | 1079501 | 0.001 | 1.9 |
| Bulk Insert (Batch) | JSON | 64699 | 0.015 | 30.9 |
| Bulk Insert (Batch) | WAL | 9878 | 0.101 | 202.5 |
| Sequential Reads | Memory | 4666 | 0.214 | 428.7 |
| Sequential Reads | JSON | 490 | 2.041 | 4082.2 |
| Sequential Reads | WAL | 181 | 5.516 | 11031.5 |
| Random Updates | Memory | 5396 | 0.185 | 185.3 |
| Random Updates | JSON | 106 | 9.465 | 9465.5 |
| Random Updates | WAL | 39 | 25.647 | 25646.7 |
| Complex Queries | Memory | 7785 | 0.128 | 6.4 |
| Complex Queries | JSON | 5641 | 0.177 | 8.9 |
| Complex Queries | WAL | 1626 | 0.615 | 30.7 |
| Mixed Workload | Memory | 2162 | 0.463 | 92.5 |
| Mixed Workload | JSON | 147 | 6.786 | 1357.3 |
| Mixed Workload | WAL | 62 | 16.101 | 3220.2 |

### WAL-Specific Features

| Operation | Ops/sec | Avg Time (ms) | Total Time (ms) |
|-----------|---------|---------------|----------------|
| Transactions (5 ops each) | 1070 | 0.934 | 93.4 |
| Concurrent Reads | 51353 | 0.019 | 19.5 |

## Performance Analysis

### Storage Comparison

**Memory**:
- Average: 128209 ops/sec
- Average latency: 0.167ms

**JSON**:
- Average: 11424 ops/sec
- Average latency: 3.468ms

**WAL**:
- Average: 6325 ops/sec
- Average latency: 6.591ms

### Key Findings

1. **Memory Storage** provides the highest performance as expected, with no I/O overhead
2. **WAL Storage** trades some performance for ACID guarantees and crash safety
3. **JSON Storage** has the simplest implementation but limited concurrency
4. **Transaction overhead** in WAL is minimal for batch operations
5. **Concurrent reads** during transactions maintain good performance due to MVCC

### WAL Benefits

- **Crash Safety**: All operations are logged before being applied
- **ACID Transactions**: Full transaction support with rollback capability  
- **MVCC**: Readers never block writers, consistent snapshots
- **Point-in-time Recovery**: Historical snapshots available
- **Minimal Overhead**: Transaction costs are reasonable for the safety provided

### Recommendations

- Use **Memory Storage** for temporary/cache-like workloads
- Use **JSON Storage** for simple applications with low concurrency
- Use **WAL Storage** for production applications requiring:
  - Data integrity and crash safety
  - Transaction support
  - High read concurrency
  - Point-in-time snapshots

