# BMDB Quick Performance Evaluation

Generated: 2025-05-24T18:46:47.211Z

## Memory Storage
- Insert 1000 docs (individual): 118.8ms (8418 ops/sec)
- Insert 1000 docs (batch): 2.4ms (416247 ops/sec)
- Read 100 docs: 1.7ms (58592 ops/sec)
- Update 100 docs: 16.0ms (6246 ops/sec)

## JSON Storage
- Insert 1000 docs: 2040.4ms (490 ops/sec)
- Read 100 docs: 0.8ms (127213 ops/sec)
- Update 100 docs: 303.8ms (329 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 4154.6ms (241 ops/sec)
- Insert 1000 docs (batch): 34.1ms (29333 ops/sec)
- Read 100 docs: 2.4ms (41617 ops/sec)
- Update 100 docs: 578.6ms (173 ops/sec)

## WAL Transaction Features
- 100 transactions: 24.5ms (4075 tx/sec)
- 1000 concurrent reads: 7.2ms (139082 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance