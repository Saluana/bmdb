# BMDB Quick Performance Evaluation

Generated: 2025-05-27T00:43:53.578Z

## Memory Storage
- Insert 1000 docs (individual): 177.5ms (5633 ops/sec)
- Insert 1000 docs (batch): 6.8ms (147606 ops/sec)
- Read 100 docs: 13.6ms (7357 ops/sec)
- Update 100 docs: 29.5ms (3390 ops/sec)

## JSON Storage
- Insert 1000 docs: 1612.2ms (620 ops/sec)
- Read 100 docs: 68.7ms (1455 ops/sec)
- Update 100 docs: 304.0ms (329 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 8235.1ms (121 ops/sec)
- Insert 1000 docs (batch): 22.5ms (44349 ops/sec)
- Read 100 docs: 216.7ms (461 ops/sec)
- Update 100 docs: 1816.4ms (55 ops/sec)

## Binary Storage
- Insert 1000 docs (individual): 180.9ms (5529 ops/sec)
- Insert 1000 docs (batch): 20.8ms (48168 ops/sec)
- Read 100 docs: 1717.6ms (58 ops/sec)
- Update 100 docs: 2362.5ms (42 ops/sec)

## WAL Transaction Features
- 100 transactions: 33.6ms (2980 tx/sec)
- 1000 concurrent reads: 14.2ms (70285 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance