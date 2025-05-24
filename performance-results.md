# BMDB Quick Performance Evaluation

Generated: 2025-05-24T18:33:43.301Z

## Memory Storage
- Insert 1000 docs (individual): 136.6ms (7321 ops/sec)
- Insert 1000 docs (batch): 2.8ms (360268 ops/sec)
- Read 100 docs: 1.7ms (60238 ops/sec)
- Update 100 docs: 15.1ms (6618 ops/sec)

## JSON Storage
- Insert 1000 docs: 2205.2ms (453 ops/sec)
- Read 100 docs: 0.8ms (127884 ops/sec)
- Update 100 docs: 337.1ms (297 ops/sec)

## WAL Storage
- Insert 1000 docs: 3845.3ms (260 ops/sec)
- Read 100 docs: 1.3ms (77205 ops/sec)
- Update 100 docs: 595.3ms (168 ops/sec)

## WAL Transaction Features
- 100 transactions: 36.4ms (2744 tx/sec)
- 1000 concurrent reads: 4.8ms (206825 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance