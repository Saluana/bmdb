# BMDB Quick Performance Evaluation

Generated: 2025-05-24T19:12:32.614Z

## Memory Storage
- Insert 1000 docs (individual): 127.4ms (7852 ops/sec)
- Insert 1000 docs (batch): 2.2ms (452429 ops/sec)
- Read 100 docs: 11.5ms (8662 ops/sec)
- Update 100 docs: 14.7ms (6784 ops/sec)

## JSON Storage
- Insert 1000 docs: 1496.0ms (668 ops/sec)
- Read 100 docs: 69.3ms (1443 ops/sec)
- Update 100 docs: 220.5ms (453 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 3149.5ms (318 ops/sec)
- Insert 1000 docs (batch): 103.9ms (9626 ops/sec)
- Read 100 docs: 135.6ms (737 ops/sec)
- Update 100 docs: 431.1ms (232 ops/sec)

## WAL Transaction Features
- 100 transactions: 21.6ms (4625 tx/sec)
- 1000 concurrent reads: 5.8ms (172143 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance