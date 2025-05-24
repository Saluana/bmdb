# BMDB Quick Performance Evaluation

Generated: 2025-05-24T18:23:40.057Z

## Memory Storage
- Insert 1000 docs (individual): 112.6ms (8880 ops/sec)
- Insert 1000 docs (batch): 2.2ms (447327 ops/sec)
- Read 100 docs: 0.9ms (116805 ops/sec)
- Update 100 docs: 9.9ms (10117 ops/sec)

## JSON Storage
- Insert 1000 docs: 1871.5ms (534 ops/sec)
- Read 100 docs: 1.0ms (95246 ops/sec)
- Update 100 docs: 305.7ms (327 ops/sec)

## WAL Storage
- Insert 1000 docs: 3804.4ms (263 ops/sec)
- Read 100 docs: 1.4ms (72683 ops/sec)
- Update 100 docs: 552.3ms (181 ops/sec)

## WAL Transaction Features
- 100 transactions: 40.6ms (2465 tx/sec)
- 1000 concurrent reads: 8.2ms (122574 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance