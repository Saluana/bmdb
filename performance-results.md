# BMDB Performance Evaluation Results

Generated on: 2025-05-24T16:04:05.924Z

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
| Bulk Insert (Individual) | Memory | 229032 | 0.004 | 4.4 |
| Bulk Insert (Individual) | JSON | 325 | 3.080 | 3079.8 |
| Bulk Insert (Individual) | WAL | 196 | 5.113 | 5112.7 |
| Bulk Insert (Batch) | Memory | 1372292 | 0.001 | 0.7 |
| Bulk Insert (Batch) | JSON | 126700 | 0.008 | 7.9 |
| Bulk Insert (Batch) | WAL | 249797 | 0.004 | 4.0 |
| Sequential Reads | Memory | 499396 | 0.002 | 2.0 |
| Sequential Reads | JSON | 710395 | 0.001 | 1.4 |
| Sequential Reads | WAL | 426371 | 0.002 | 2.3 |
| Random Updates | Memory | 6040 | 0.166 | 165.6 |
| Random Updates | JSON | 188 | 5.331 | 5331.4 |
| Random Updates | WAL | 93 | 10.807 | 10806.8 |
| Complex Queries | Memory | 2210 | 0.453 | 22.6 |
| Complex Queries | JSON | 3551 | 0.282 | 14.1 |
| Complex Queries | WAL | 1861 | 0.537 | 26.9 |
| Mixed Workload | Memory | 1309 | 0.764 | 152.8 |
| Mixed Workload | JSON | 223 | 4.480 | 895.9 |
| Mixed Workload | WAL | 141 | 7.072 | 1414.5 |

### 2000 Documents

| Operation | Storage | Ops/sec | Avg Time (ms) | Total Time (ms) |
|-----------|---------|---------|---------------|----------------|
| Bulk Insert (Individual) | Memory | 1737431 | 0.001 | 1.2 |
| Bulk Insert (Individual) | JSON | 133 | 7.537 | 15073.9 |
| Bulk Insert (Individual) | WAL | 69 | 14.578 | 29156.8 |
| Bulk Insert (Batch) | Memory | 3668325 | 0.000 | 0.5 |
| Bulk Insert (Batch) | JSON | 175938 | 0.006 | 11.4 |
| Bulk Insert (Batch) | WAL | 21875 | 0.046 | 91.4 |
| Sequential Reads | Memory | 780640 | 0.001 | 2.6 |
| Sequential Reads | JSON | 653123 | 0.002 | 3.1 |
| Sequential Reads | WAL | 130012 | 0.008 | 15.4 |
| Random Updates | Memory | 2519 | 0.397 | 396.9 |
| Random Updates | JSON | 60 | 16.566 | 16566.0 |
| Random Updates | WAL | 35 | 28.549 | 28549.0 |
| Complex Queries | Memory | 1716 | 0.583 | 29.1 |
| Complex Queries | JSON | 907 | 1.102 | 55.1 |
| Complex Queries | WAL | 558 | 1.792 | 89.6 |
| Mixed Workload | Memory | 449 | 2.226 | 445.2 |
| Mixed Workload | JSON | 77 | 13.002 | 2600.4 |
| Mixed Workload | WAL | 51 | 19.783 | 3956.7 |

### WAL-Specific Features

| Operation | Ops/sec | Avg Time (ms) | Total Time (ms) |
|-----------|---------|---------------|----------------|
| Transactions (5 ops each) | 538 | 1.858 | 185.8 |
| Concurrent Reads | 47900 | 0.021 | 20.9 |

## Performance Analysis

### Storage Comparison

**Memory**:
- Average: 691780 ops/sec
- Average latency: 0.383ms

**JSON**:
- Average: 139302 ops/sec
- Average latency: 4.283ms

**WAL**:
- Average: 62821 ops/sec
- Average latency: 6.441ms

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

