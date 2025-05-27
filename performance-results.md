# BMDB Quick Performance Evaluation

Generated: 2025-05-27T00:09:00.506Z

## Memory Storage
- Insert 1000 docs (individual): 194.0ms (5156 ops/sec)
- Insert 1000 docs (batch): 11.5ms (87178 ops/sec)
- Read 100 docs: 19.1ms (5236 ops/sec)
- Update 100 docs: 37.6ms (2659 ops/sec)

## JSON Storage
- Insert 1000 docs: 1800.0ms (556 ops/sec)
- Read 100 docs: 66.1ms (1512 ops/sec)
- Update 100 docs: 243.7ms (410 ops/sec)

## WAL Storage
- Insert 1000 docs (individual): 6714.7ms (149 ops/sec)
- Insert 1000 docs (batch): 22.2ms (45064 ops/sec)
- Read 100 docs: 278.4ms (359 ops/sec)
- Update 100 docs: 2067.5ms (48 ops/sec)

## Binary Storage
- Insert 1000 docs (individual): 13716.3ms (73 ops/sec)
- Insert 1000 docs (batch): 18.3ms (54660 ops/sec)
- Read 100 docs: 1435.0ms (70 ops/sec)
- Update 100 docs: 2880.7ms (35 ops/sec)

## WAL Transaction Features
- 100 transactions: 38.2ms (2618 tx/sec)
- 1000 concurrent reads: 11.2ms (89552 reads/sec)
- Current txid: 102, Stable: 101
- WAL size: 303 entries

## Summary

**Key Findings:**
- Memory storage provides baseline performance
- JSON storage has filesystem I/O overhead
- WAL storage trades some performance for ACID guarantees
- Transaction overhead is minimal
- MVCC enables high concurrent read performance