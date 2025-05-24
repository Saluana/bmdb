# BMDB Quick Performance Evaluation

Generated: 2025-05-24T19:49:29.351Z

## Memory Storage
- Insert 1000 docs (individual): 115.6ms (8650 ops/sec)
- Insert 1000 docs (batch): 3.1ms (327016 ops/sec)
- Read 100 docs: 18.3ms (5452 ops/sec)
- Update 100 docs: 21.4ms (4669 ops/sec)

## JSON Storage
- Insert 1000 docs: 1474.8ms (678 ops/sec)
- Read 100 docs: 75.4ms (1326 ops/sec)
- Update 100 docs: 208.0ms (481 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 8279.2ms (121 ops/sec)
- Insert 1000 docs (batch): 55.4ms (18043 ops/sec)
- Read 100 docs: 138.4ms (722 ops/sec)
- Update 100 docs: 2536.3ms (39 ops/sec)

## WAL Transaction Features
- 100 transactions: 30.1ms (3318 tx/sec)
- 1000 concurrent reads: 9.8ms (101814 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance