# BMDB Quick Performance Evaluation

Generated: 2025-05-24T19:56:12.748Z

## Memory Storage
- Insert 1000 docs (individual): 115.0ms (8697 ops/sec)
- Insert 1000 docs (batch): 2.2ms (444931 ops/sec)
- Read 100 docs: 10.7ms (9367 ops/sec)
- Update 100 docs: 16.6ms (6022 ops/sec)

## JSON Storage
- Insert 1000 docs: 1546.8ms (647 ops/sec)
- Read 100 docs: 66.8ms (1497 ops/sec)
- Update 100 docs: 202.6ms (493 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 7673.4ms (130 ops/sec)
- Insert 1000 docs (batch): 45.1ms (22197 ops/sec)
- Read 100 docs: 177.8ms (562 ops/sec)
- Update 100 docs: 2045.4ms (49 ops/sec)

## WAL Transaction Features
- 100 transactions: 25.4ms (3938 tx/sec)
- 1000 concurrent reads: 12.6ms (79498 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance