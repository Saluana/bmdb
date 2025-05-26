# BMDB Quick Performance Evaluation

Generated: 2025-05-26T23:58:11.098Z

## Memory Storage
- Insert 1000 docs (individual): 213.3ms (4688 ops/sec)
- Insert 1000 docs (batch): 10.1ms (98766 ops/sec)
- Read 100 docs: 18.3ms (5461 ops/sec)
- Update 100 docs: 29.9ms (3349 ops/sec)

## JSON Storage
- Insert 1000 docs: 1682.6ms (594 ops/sec)
- Read 100 docs: 55.5ms (1802 ops/sec)
- Update 100 docs: 245.5ms (407 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 6614.4ms (151 ops/sec)
- Insert 1000 docs (batch): 45.6ms (21931 ops/sec)
- Read 100 docs: 195.5ms (512 ops/sec)
- Update 100 docs: 1801.5ms (56 ops/sec)

## Binary Storage
- Insert 1000 docs (individual): 12901.3ms (78 ops/sec)
- Insert 1000 docs (batch): 19.5ms (51299 ops/sec)
- Read 100 docs: 1196.9ms (84 ops/sec)
- Update 100 docs: 2437.0ms (41 ops/sec)

## WAL Transaction Features
- 100 transactions: 29.7ms (3371 tx/sec)
- 1000 concurrent reads: 7.4ms (134375 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance