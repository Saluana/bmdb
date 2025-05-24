# BMDB Quick Performance Evaluation

Generated: 2025-05-24T20:46:36.667Z

## Memory Storage
- Insert 1000 docs (individual): 129.6ms (7714 ops/sec)
- Insert 1000 docs (batch): 4.8ms (209249 ops/sec)
- Read 100 docs: 41.1ms (2436 ops/sec)
- Update 100 docs: 41.1ms (2432 ops/sec)

## JSON Storage
- Insert 1000 docs: 1129.1ms (886 ops/sec)
- Read 100 docs: 140.9ms (710 ops/sec)
- Update 100 docs: 112.1ms (892 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 7947.3ms (126 ops/sec)
- Insert 1000 docs (batch): 36.2ms (27616 ops/sec)
- Read 100 docs: 130.2ms (768 ops/sec)
- Update 100 docs: 1744.7ms (57 ops/sec)

## WAL Transaction Features
- 100 transactions: 24.0ms (4161 tx/sec)
- 1000 concurrent reads: 9.4ms (106567 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance