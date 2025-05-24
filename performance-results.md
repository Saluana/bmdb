# BMDB Quick Performance Evaluation

Generated: 2025-05-24T21:07:02.477Z

## Memory Storage
- Insert 1000 docs (individual): 126.1ms (7927 ops/sec)
- Insert 1000 docs (batch): 2.7ms (376648 ops/sec)
- Read 100 docs: 42.9ms (2331 ops/sec)
- Update 100 docs: 61.3ms (1631 ops/sec)

## JSON Storage
- Insert 1000 docs: 529.9ms (1887 ops/sec)
- Read 100 docs: 60.6ms (1649 ops/sec)
- Update 100 docs: 56.9ms (1756 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 8098.4ms (123 ops/sec)
- Insert 1000 docs (batch): 54.6ms (18308 ops/sec)
- Read 100 docs: 90.9ms (1100 ops/sec)
- Update 100 docs: 1780.9ms (56 ops/sec)

## WAL Transaction Features
- 100 transactions: 31.3ms (3193 tx/sec)
- 1000 concurrent reads: 3.9ms (259003 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance