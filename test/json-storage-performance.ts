import { JSONStorage } from '../src/storage/JSONStorage';
import { existsSync, unlinkSync } from 'fs';
import { performance } from 'perf_hooks';

interface PerformanceResult {
  operation: string;
  totalTime: number;
  avgTime: number;
  opsPerSecond: number;
  iterations: number;
  memoryUsed?: number;
}

interface TestDocument {
  id: string;
  name: string;
  email: string;
  age: number;
  data: any;
  timestamp: number;
}

class JSONStoragePerformanceTester {
  private storage: JSONStorage;
  private testDbPath: string;
  private results: PerformanceResult[] = [];

  constructor(testDbPath: string = 'test-perf.json', useMsgPack: boolean = false) {
    this.testDbPath = testDbPath;
    this.cleanup();
    this.storage = new JSONStorage(testDbPath, { useMsgPack });
  }

  private cleanup(): void {
    const files = [
      this.testDbPath,
      this.testDbPath.replace('.json', '.idx.json'),
      this.testDbPath + '.write.lock',
      this.testDbPath.replace('.json', '.msgpack'),
      this.testDbPath.replace('.json', '.idx.msgpack')
    ];
    
    files.forEach(file => {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  }

  private generateTestDocument(id: string): TestDocument {
    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      age: Math.floor(Math.random() * 80) + 18,
      data: {
        preferences: {
          theme: Math.random() > 0.5 ? 'dark' : 'light',
          notifications: Math.random() > 0.3,
          language: ['en', 'es', 'fr', 'de'][Math.floor(Math.random() * 4)]
        },
        metadata: {
          created: new Date().toISOString(),
          version: '1.0.0',
          tags: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, 
            (_, i) => `tag${i}`)
        },
        // Add some bulk to simulate realistic document sizes
        content: 'x'.repeat(Math.floor(Math.random() * 1000) + 100)
      },
      timestamp: Date.now()
    };
  }

  private measureMemory(): number {
    if (global.gc) {
      global.gc();
    }
    return process.memoryUsage().heapUsed;
  }

  private async measureOperation(
    operation: string,
    iterations: number,
    operation_fn: () => void | Promise<void>
  ): Promise<PerformanceResult> {
    console.log(`\nTesting ${operation} (${iterations} iterations)...`);
    
    const startMemory = this.measureMemory();
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      await operation_fn();
      
      // Progress indicator for long operations
      if (iterations > 100 && i % Math.floor(iterations / 10) === 0) {
        console.log(`  Progress: ${Math.round((i / iterations) * 100)}%`);
      }
    }
    
    const endTime = performance.now();
    const endMemory = this.measureMemory();
    
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    const opsPerSecond = 1000 / avgTime;
    const memoryUsed = endMemory - startMemory;
    
    const result: PerformanceResult = {
      operation,
      totalTime,
      avgTime,
      opsPerSecond,
      iterations,
      memoryUsed
    };
    
    this.results.push(result);
    console.log(`  ${operation}: ${opsPerSecond.toFixed(2)} ops/sec, ${avgTime.toFixed(3)}ms avg`);
    
    return result;
  }

  async testBasicOperations(): Promise<void> {
    console.log('=== Basic Operations Performance ===');
    
    // Test empty database read
    await this.measureOperation('Empty Read', 1000, () => {
      this.storage.read();
    });

    // Test single document write
    let docCounter = 0;
    await this.measureOperation('Single Write', 500, () => {
      const doc = this.generateTestDocument(`doc${docCounter++}`);
      const data = this.storage.read() || {};
      data[`users`] = data[`users`] || {};
      (data[`users`] as any)[doc.id] = doc;
      this.storage.write(data);
    });

    // Test read with data
    await this.measureOperation('Read with Data', 1000, () => {
      this.storage.read();
    });

    // Test incremental writes (simulating real usage)
    await this.measureOperation('Incremental Write', 200, () => {
      const doc = this.generateTestDocument(`inc${docCounter++}`);
      const data = this.storage.read() || {};
      data[`users`] = data[`users`] || {};
      (data[`users`] as any)[doc.id] = doc;
      this.storage.write(data);
    });
  }

  async testScalingBehavior(): Promise<void> {
    console.log('\n=== Scaling Behavior ===');
    
    // Test write performance as database grows
    const sizes = [10, 50, 100, 500, 1000];
    
    for (const size of sizes) {
      this.cleanup();
      this.storage = new JSONStorage(this.testDbPath);
      
      // Pre-populate database
      const data: any = { users: {} };
      for (let i = 0; i < size; i++) {
        const doc = this.generateTestDocument(`user${i}`);
        data.users[doc.id] = doc;
      }
      this.storage.write(data);
      
      // Measure write performance at this size
      let counter = size;
      await this.measureOperation(`Write (${size} docs)`, 50, () => {
        const doc = this.generateTestDocument(`new${counter++}`);
        const currentData = this.storage.read() || {};
        currentData[`users`] = currentData[`users`] || {};
        (currentData[`users`] as any)[doc.id] = doc;
        this.storage.write(currentData);
      });

      // Measure read performance at this size
      await this.measureOperation(`Read (${size} docs)`, 100, () => {
        this.storage.read();
      });
    }
  }

  async testConcurrencyBottlenecks(): Promise<void> {
    console.log('\n=== Concurrency Bottlenecks ===');
    
    // Test read lock contention
    const readPromises: Promise<any>[] = [];
    const concurrentReads = 20;
    
    const startTime = performance.now();
    for (let i = 0; i < concurrentReads; i++) {
      readPromises.push(
        this.storage.acquireReadLock().then(() => {
          this.storage.read();
          return this.storage.releaseReadLock();
        })
      );
    }
    await Promise.all(readPromises);
    const readTime = performance.now() - startTime;
    
    console.log(`  Concurrent reads (${concurrentReads}): ${readTime.toFixed(2)}ms total`);

    // Test write lock contention
    const writePromises: Promise<any>[] = [];
    const concurrentWrites = 10;
    
    const writeStartTime = performance.now();
    for (let i = 0; i < concurrentWrites; i++) {
      writePromises.push(
        (async () => {
          await this.storage.acquireWriteLock();
          const data = this.storage.read() || {};
          data[`test${i}`] = { value: i };
          this.storage.write(data);
          await this.storage.releaseWriteLock();
        })()
      );
    }
    await Promise.all(writePromises);
    const writeTime = performance.now() - writeStartTime;
    
    console.log(`  Sequential writes (${concurrentWrites}): ${writeTime.toFixed(2)}ms total`);
  }

  async testMessagePackComparison(): Promise<void> {
    console.log('\n=== MessagePack vs JSON Comparison ===');
    
    // Test JSON storage
    this.cleanup();
    this.storage = new JSONStorage(this.testDbPath, { useMsgPack: false });
    
    const testData: any = { users: {} };
    for (let i = 0; i < 100; i++) {
      const doc = this.generateTestDocument(`user${i}`);
      testData.users[doc.id] = doc;
    }
    
    await this.measureOperation('JSON Write (100 docs)', 100, () => {
      this.storage.write(testData);
    });
    
    await this.measureOperation('JSON Read (100 docs)', 200, () => {
      this.storage.read();
    });
    
    // Test MessagePack storage
    this.cleanup();
    this.storage = new JSONStorage(this.testDbPath, { useMsgPack: true });
    
    await this.measureOperation('MessagePack Write (100 docs)', 100, () => {
      this.storage.write(testData);
    });
    
    await this.measureOperation('MessagePack Read (100 docs)', 200, () => {
      this.storage.read();
    });
  }

  async testVectorOperations(): Promise<void> {
    console.log('\n=== Vector Operations Performance ===');
    
    this.cleanup();
    this.storage = new JSONStorage(this.testDbPath);
    
    // Create vector index
    await this.measureOperation('Create Vector Index', 1, async () => {
      await this.storage.createVectorIndex('embeddings', 'vector', 128, 'cosine');
    });
    
    // Add documents with vectors
    const vectorData: any = { embeddings: {} };
    for (let i = 0; i < 50; i++) {
      vectorData.embeddings[`doc${i}`] = {
        id: `doc${i}`,
        vector: Array.from({ length: 128 }, () => Math.random()),
        content: `Document ${i} content`
      };
    }
    this.storage.write(vectorData);
    
    // Test vector search
    const queryVector = Array.from({ length: 128 }, () => Math.random());
    await this.measureOperation('Vector Search', 100, async () => {
      await this.storage.vectorSearch('embeddings', 'vector', queryVector, { limit: 10 });
    });
  }

  printResults(): void {
    console.log('\n' + '='.repeat(80));
    console.log('PERFORMANCE ANALYSIS SUMMARY');
    console.log('='.repeat(80));
    
    // Group results by operation type
    const basicOps = this.results.filter(r => 
      ['Empty Read', 'Single Write', 'Read with Data', 'Incremental Write'].includes(r.operation)
    );
    
    const scalingOps = this.results.filter(r => 
      r.operation.includes('(') && (r.operation.includes('docs'))
    );
    
    const formatOps = this.results.filter(r => 
      r.operation.includes('JSON') || r.operation.includes('MessagePack')
    );
    
    if (basicOps.length > 0) {
      console.log('\nBASIC OPERATIONS:');
      basicOps.forEach(result => {
        console.log(`  ${result.operation.padEnd(20)}: ${result.opsPerSecond.toFixed(1).padStart(8)} ops/sec`);
      });
    }
    
    if (scalingOps.length > 0) {
      console.log('\nSCALING PERFORMANCE:');
      scalingOps.forEach(result => {
        console.log(`  ${result.operation.padEnd(25)}: ${result.opsPerSecond.toFixed(1).padStart(8)} ops/sec`);
      });
    }
    
    if (formatOps.length > 0) {
      console.log('\nFORMAT COMPARISON:');
      formatOps.forEach(result => {
        console.log(`  ${result.operation.padEnd(25)}: ${result.opsPerSecond.toFixed(1).padStart(8)} ops/sec`);
      });
    }
    
    // Identify bottlenecks
    console.log('\nBOTTLENECK ANALYSIS:');
    const writeOps = this.results.filter(r => r.operation.toLowerCase().includes('write'));
    const readOps = this.results.filter(r => r.operation.toLowerCase().includes('read'));
    
    if (writeOps.length > 0) {
      const avgWritePerf = writeOps.reduce((sum, r) => sum + r.opsPerSecond, 0) / writeOps.length;
      console.log(`  Average Write Performance: ${avgWritePerf.toFixed(1)} ops/sec`);
    }
    
    if (readOps.length > 0) {
      const avgReadPerf = readOps.reduce((sum, r) => sum + r.opsPerSecond, 0) / readOps.length;
      console.log(`  Average Read Performance: ${avgReadPerf.toFixed(1)} ops/sec`);
    }
    
    // Memory analysis
    const memoryOps = this.results.filter(r => r.memoryUsed !== undefined);
    if (memoryOps.length > 0) {
      console.log('\nMEMORY USAGE:');
      memoryOps.forEach(result => {
        const memoryMB = (result.memoryUsed! / 1024 / 1024).toFixed(2);
        console.log(`  ${result.operation.padEnd(25)}: ${memoryMB.padStart(8)} MB`);
      });
    }
    
    console.log('\nOPTIMIZATION RECOMMENDATIONS:');
    console.log('  1. Implement append-only change log to avoid full DB rewrites');
    console.log('  2. Add worker thread pool for JSON parsing/stringifying');
    console.log('  3. Use compression (zstd) to reduce I/O overhead');
    console.log('  4. Implement buffered writes with configurable flush intervals');
    console.log('  5. Cache parsed data to avoid repeated JSON.parse calls');
  }

  async runFullSuite(): Promise<void> {
    console.log('Starting comprehensive JSONStorage performance analysis...\n');
    
    try {
      await this.testBasicOperations();
      await this.testScalingBehavior();
      await this.testConcurrencyBottlenecks();
      await this.testMessagePackComparison();
      await this.testVectorOperations();
      
      this.printResults();
    } finally {
      this.cleanup();
      this.storage.close();
    }
  }
}

// Run the performance tests
async function main() {
  console.log('JSONStorage Performance Test Suite');
  console.log('==================================\n');
  
  const tester = new JSONStoragePerformanceTester();
  await tester.runFullSuite();
}

// Auto-run if this is the main module
main().catch(console.error);

export { JSONStoragePerformanceTester };