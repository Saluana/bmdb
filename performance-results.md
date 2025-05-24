# BMDB Quick Performance Evaluation

Generated: 2025-05-24T19:35:20.187Z

## Memory Storage
- Insert 1000 docs (individual): 122.0ms (8199 ops/sec)
- Insert 1000 docs (batch): 2.1ms (470801 ops/sec)
- Read 100 docs: 14.7ms (6814 ops/sec)
- Update 100 docs: 21.4ms (4683 ops/sec)

## JSON Storage
- Insert 1000 docs: 1450.0ms (690 ops/sec)
- Read 100 docs: 73.2ms (1366 ops/sec)
- Update 100 docs: 233.7ms (428 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 7326.5ms (136 ops/sec)
- Insert 1000 docs (batch): 46.3ms (21578 ops/sec)
- Read 100 docs: 103.2ms (969 ops/sec)
- Update 100 docs: 2908.1ms (34 ops/sec)

## WAL Transaction Features
- 100 transactions: 33.4ms (2996 tx/sec)
- 1000 concurrent reads: 13.6ms (73563 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance