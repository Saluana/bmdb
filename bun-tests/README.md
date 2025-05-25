# BMDB Comprehensive Test Suite

This directory contains comprehensive tests for BMDB using Bun's test framework. The test suite is designed to find bugs, verify functionality, and ensure performance standards across all database components.

## Test Structure

### Core Test Files

- **`table.test.ts`** - Core Table operations, CRUD, document management, ID handling
- **`query.test.ts`** - Where clauses, query optimization, complex logical operations  
- **`storage.test.ts`** - Memory, JSON, Binary, WAL storage backends
- **`schema.test.ts`** - Schema validation, relationships, constraints
- **`indexing.test.ts`** - Index management, query optimization, cost-based planning
- **`integration.test.ts`** - End-to-end scenarios, edge cases, performance regression

### Support Files

- **`test-setup.ts`** - Global test utilities and helper functions
- **`run-tests.ts`** - Comprehensive test runner with summary reporting
- **`bunfig.toml`** - Bun test configuration

## Running Tests

### Quick Commands

```bash
# Run all tests with Bun's default runner
npm run test:bun

# Run comprehensive test suite with detailed reporting
npm run test:comprehensive

# Run individual test suites
npm run test:table
npm run test:query
npm run test:storage
npm run test:schema
npm run test:indexing
npm run test:integration
```

### Manual Test Execution

```bash
# Run from project root
cd bun-tests

# Run all tests
bun test

# Run specific test file
bun test table.test.ts

# Run with verbose output
bun test --verbose

# Run comprehensive test runner
bun run run-tests.ts
```

## Test Categories

### 🔧 **Core Functionality Tests**
- Document creation and ID management
- CRUD operations (Create, Read, Update, Delete)
- Data type handling and serialization
- Table properties and metadata

### 🔍 **Query System Tests**
- Equality, comparison, and range queries
- Logical operators (AND, OR)
- Pattern matching and regex
- Custom function queries
- Query performance and optimization

### 💾 **Storage Backend Tests**
- MemoryStorage operations
- JSONStorage file persistence
- BinaryStorage efficiency
- WAL (Write-Ahead Logging) systems
- Cross-storage compatibility

### 📋 **Schema System Tests**
- Schema definition and validation
- Primary key and unique constraints
- Relationship management
- Cascade delete operations
- Complex data type validation

### ⚡ **Indexing and Optimization Tests**
- Automatic index creation
- Query plan generation
- Cost-based optimization
- Index maintenance during updates
- Performance scaling tests

### 🧪 **Integration and Edge Cases**
- Cross-component interactions
- Large dataset handling
- Memory pressure scenarios
- Special character and unicode support
- Concurrent operation safety
- Data integrity and consistency

## Performance Benchmarks

The test suite includes performance benchmarks that verify:

- **Insert Performance**: 10,000 documents in <10 seconds
- **Search Performance**: Indexed queries in <100ms
- **Update Performance**: 100 updates in <500ms
- **Delete Performance**: 100 deletions in <500ms
- **Memory Efficiency**: Graceful handling of large datasets
- **Scaling**: Linear performance scaling with data size

## Test Data Generation

Test utilities provide realistic data generation:

```typescript
// Generate single test user
const user = generateTestUser();

// Generate multiple users
const users = generateTestUsers(100);

// Generate random strings and numbers
const randomString = generateRandomString(10);
const randomNumber = generateRandomNumber(1, 1000);
```

## Bug Detection Focus Areas

The test suite specifically targets potential bugs in:

### **Document ID Management**
- Duplicate ID prevention
- ID consistency across operations
- Proper filtering of conflicting ID fields

### **Query Optimization**
- Cost-based planning accuracy
- Index usage decisions
- Performance degradation detection

### **Data Integrity**
- Schema constraint enforcement
- Relationship consistency
- Transaction atomicity

### **Memory Management**
- Memory leak detection
- Large dataset handling
- Index memory usage

### **Edge Cases**
- Empty and null value handling
- Special character support
- Extreme numeric values
- Deep object nesting

## Error Scenarios Tested

- Invalid document types
- Constraint violations
- Storage failures
- Index corruption
- Memory pressure
- Concurrent modifications
- File system errors

## Interpreting Test Results

### Success Indicators
- ✅ All tests pass
- 🚀 Performance within benchmarks
- 💾 No memory leaks detected
- 🔧 Data integrity maintained

### Warning Signs
- ⚠️ Slow test execution (>30 seconds)
- 🧠 Memory-related errors
- ⏱️ Timeout issues
- 📉 Performance degradation

## Contributing

When adding new features or fixing bugs:

1. Add corresponding tests to relevant test files
2. Include edge cases and error scenarios
3. Add performance benchmarks for new features
4. Update this README if adding new test categories

## Test Environment

- **Runtime**: Bun test framework
- **TypeScript**: Full type checking enabled
- **Timeout**: 30 seconds per test (configurable)
- **Concurrency**: Tests run in parallel where safe
- **Cleanup**: Automatic temp file cleanup after tests

## Debugging Failed Tests

For detailed debugging:

```bash
# Run with verbose output
bun test --verbose table.test.ts

# Run single test with debugging
bun test --grep "should handle document ID duplication"

# Run comprehensive suite for full analysis
bun run test:comprehensive
```

The comprehensive test runner provides detailed failure analysis, performance metrics, and potential issue detection to help identify and resolve problems quickly.