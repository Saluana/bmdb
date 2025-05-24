# BMDB Quick Performance Evaluation

Generated: 2025-05-24T14:54:57.529Z

## Memory Storage
- Insert 1000 docs (individual): 9.5ms (105747 ops/sec)
- Insert 1000 docs (batch): 0.5ms (2048307 ops/sec)
- Read 100 docs: 2.2ms (45736 ops/sec)
- Update 100 docs: 59.7ms (1676 ops/sec)

## JSON Storage
- Insert 1000 docs: 1811.3ms (552 ops/sec)
- Read 100 docs: 0.9ms (106345 ops/sec)
- Update 100 docs: 364.1ms (275 ops/sec)

## WAL Storage
- Insert 1000 docs: 3421.8ms (292 ops/sec)
- Read 100 docs: 1.3ms (74941 ops/sec)
- Update 100 docs: 658.4ms (152 ops/sec)

## WAL Transaction Features
- 100 transactions: 37.0ms (2705 tx/sec)
- 1000 concurrent reads: 12.0ms (83373 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance