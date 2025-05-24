# BMDB Quick Performance Evaluation

Generated: 2025-05-24T19:21:50.223Z

## Memory Storage
- Insert 1000 docs (individual): 136.8ms (7309 ops/sec)
- Insert 1000 docs (batch): 2.5ms (404238 ops/sec)
- Read 100 docs: 14.9ms (6733 ops/sec)
- Update 100 docs: 13.6ms (7335 ops/sec)

## JSON Storage
- Insert 1000 docs: 1574.6ms (635 ops/sec)
- Read 100 docs: 76.1ms (1314 ops/sec)
- Update 100 docs: 256.9ms (389 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 2861.9ms (349 ops/sec)
- Insert 1000 docs (batch): 35.5ms (28189 ops/sec)
- Read 100 docs: 122.4ms (817 ops/sec)
- Update 100 docs: 304.1ms (329 ops/sec)

## WAL Transaction Features
- 100 transactions: 27.8ms (3599 tx/sec)
- 1000 concurrent reads: 6.5ms (153177 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance