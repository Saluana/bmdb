# BmDB Tests

This directory contains all tests, examples, and benchmarks for BmDB.

## Test Files

### Core Tests
- `test.ts` - Basic functionality tests for classic API
- `example-v2.ts` - Comprehensive V2 schema API example and tests

### Performance Tests
- `perf-test.ts` - Detailed performance benchmarks across storage types
- `performance-comparison.ts` - Comparison between old and new implementations
- `quick-perf.ts` - Quick performance test with immediate results

### Demos
- `demo-binary-storage.ts` - Binary storage implementation demonstration

### Test Data
- `test-json-2000.json` - Large JSON dataset for performance testing

## Running Tests

```bash
# Run basic functionality tests
bun run test/test.ts

# Run V2 schema example
bun run test/example-v2.ts

# Run performance tests
bun run test/perf-test.ts
bun run test/quick-perf.ts

# Run binary storage demo
bun run test/demo-binary-storage.ts
```

## Test Organization

- **Unit Tests**: Core functionality validation
- **Integration Tests**: Full workflow testing
- **Performance Tests**: Benchmarking and optimization
- **Examples**: Usage demonstrations and tutorials