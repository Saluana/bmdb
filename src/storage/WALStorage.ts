import type { Storage, VectorIndexDefinition } from "./Storage";
import type { JsonObject } from "../utils/types";
import type { Vector, VectorSearchResult } from "../utils/VectorUtils";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { appendFileSync, openSync, closeSync, ftruncateSync } from "fs";

export interface WALOperation {
  type: 'write' | 'delete' | 'update' | 'begin' | 'commit' | 'abort';
  txid: number;
  timestamp: number;
  data: JsonObject;
  stable?: boolean;
}

export interface Transaction {
  txid: number;
  operations: WALOperation[];
  committed: boolean;
  aborted: boolean;
}

export class WALStorage implements Storage {
  private walPath: string;
  private dataPath: string;
  private lockPath: string;
  private indexPath: string;
  private nextTxid: number = 1;
  private lockFd: number | null = null;
  private transactions: Map<number, Transaction> = new Map();
  private stableTxid: number = 0;
  private snapshots: Map<number, JsonObject> = new Map();
  private indexes: Map<string, import('./Storage').IndexDefinition> = new Map();
  private pendingOperations: WALOperation[] = [];
  private batchSize: number = 10;
  private flushTimeout: NodeJS.Timeout | null = null;
  private maxBatchWaitMs: number = 100;

  constructor(path: string, batchSize: number = 10, maxBatchWaitMs: number = 100) {
    this.dataPath = path;
    this.walPath = `${path}.wal`;
    this.lockPath = `${path}.lock`;
    this.indexPath = `${path}.idx.json`;
    this.batchSize = batchSize;
    this.maxBatchWaitMs = maxBatchWaitMs;
    this.loadFromWAL();
    this.loadIndexes();
  }

  private loadFromWAL(): void {
    // Initialize base snapshot from main data file
    let baseSnapshot: JsonObject = {};
    if (existsSync(this.dataPath)) {
      try {
        const content = readFileSync(this.dataPath, 'utf8');
        baseSnapshot = content.trim() ? JSON.parse(content) : {};
      } catch {
        baseSnapshot = {};
      }
    }

    // Replay WAL operations if they exist
    if (existsSync(this.walPath)) {
      try {
        const walContent = readFileSync(this.walPath, 'utf8');
        const lines = walContent.trim().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const operation: WALOperation = JSON.parse(line);
          this.replayOperation(operation);
          this.nextTxid = Math.max(this.nextTxid, operation.txid + 1);
        }
      } catch (error) {
        console.warn('Failed to load WAL file:', error);
      }
    }

    // Set stable txid to highest committed transaction
    this.updateStableTxid();
    
    // Create initial snapshot at txid 0
    this.snapshots.set(0, baseSnapshot);
  }

  private replayOperation(operation: WALOperation): void {
    switch (operation.type) {
      case 'begin':
        this.transactions.set(operation.txid, {
          txid: operation.txid,
          operations: [],
          committed: false,
          aborted: false
        });
        break;
      case 'commit':
        const tx = this.transactions.get(operation.txid);
        if (tx) {
          tx.committed = true;
          this.buildSnapshot(operation.txid);
        }
        break;
      case 'abort':
        const abortTx = this.transactions.get(operation.txid);
        if (abortTx) {
          abortTx.aborted = true;
        }
        break;
      default:
        const targetTx = this.transactions.get(operation.txid);
        if (targetTx) {
          targetTx.operations.push(operation);
        }
        break;
    }
  }

  private buildSnapshot(txid: number): void {
    const tx = this.transactions.get(txid);
    if (!tx || !tx.committed) return;

    // Start with the latest stable snapshot
    let snapshot = { ...this.getSnapshot(this.stableTxid) };

    // Apply this transaction's operations
    for (const op of tx.operations) {
      switch (op.type) {
        case 'write':
          snapshot = { ...op.data };
          break;
        case 'update':
          Object.assign(snapshot, op.data);
          break;
        case 'delete':
          snapshot = {};
          break;
      }
    }

    this.snapshots.set(txid, snapshot);
  }

  private updateStableTxid(): void {
    let highestStable = 0;
    for (const [txid, tx] of this.transactions) {
      if (tx.committed && txid > highestStable) {
        highestStable = txid;
      }
    }
    this.stableTxid = highestStable;
  }

  private appendToWAL(operation: WALOperation): void {
    this.pendingOperations.push(operation);
    
    // Flush immediately if batch is full
    if (this.pendingOperations.length >= this.batchSize) {
      this.flushBatch();
    } else {
      // Schedule a flush if one isn't already scheduled
      if (this.flushTimeout === null) {
        this.flushTimeout = setTimeout(() => {
          this.flushBatch();
        }, this.maxBatchWaitMs);
      }
    }
  }

  private flushBatch(): void {
    if (this.flushTimeout !== null) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.pendingOperations.length === 0) {
      return;
    }

    try {
      const batch = this.pendingOperations.splice(0, this.pendingOperations.length);
      const batchContent = batch.map(op => JSON.stringify(op)).join('\n') + '\n';
      appendFileSync(this.walPath, batchContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write batch to WAL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private acquireLock(): void {
    if (this.lockFd !== null) return; // Already locked
    
    const maxRetries = 20;
    const baseDelay = 10; // ms
    const maxDelay = 500; // ms
    const maxWaitTime = 5000; // 5 seconds total
    const startTime = Date.now();
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to acquire lock atomically
        this.lockFd = openSync(this.lockPath, 'wx'); // 'x' flag ensures exclusive creation
        return; // Successfully acquired lock
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Check if we've exceeded maximum wait time
          if (Date.now() - startTime > maxWaitTime) {
            throw new Error(`Could not acquire write lock: timeout after ${maxWaitTime}ms`);
          }
          
          // Lock file exists, wait and retry with exponential backoff
          if (attempt < maxRetries - 1) {
            // Calculate delay with exponential backoff: baseDelay * 2^attempt, capped at maxDelay
            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            
            // Use proper sleep instead of busy wait
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
            continue;
          }
        }
        // Other errors or max retries exceeded
        throw new Error(`Could not acquire write lock after ${maxRetries} attempts: ${error.message}`);
      }
    }
  }

  private releaseLock(): void {
    if (this.lockFd !== null) {
      closeSync(this.lockFd);
      this.lockFd = null;
      if (existsSync(this.lockPath)) {
        unlinkSync(this.lockPath);
      }
    }
  }

  // MVCC Read - returns snapshot at highest stable txid
  read(): JsonObject | null {
    return this.getSnapshot(this.stableTxid);
  }

  // Get snapshot at specific txid
  getSnapshot(txid: number): JsonObject {
    // Find the highest committed txid <= requested txid
    let targetTxid = 0;
    for (const [tid, tx] of this.transactions) {
      if (tid <= txid && tx.committed && tid > targetTxid) {
        targetTxid = tid;
      }
    }

    return this.snapshots.get(targetTxid) || {};
  }

  // Transaction interface
  beginTransaction(): number {
    // Acquire lock first to prevent race conditions
    this.acquireLock();
    
    try {
      const txid = this.nextTxid++;
      
      // Check if transaction already exists (race condition check)
      if (this.transactions.has(txid)) {
        throw new Error(`Transaction ${txid} already exists`);
      }
      
      const beginOp: WALOperation = {
        type: 'begin',
        txid,
        timestamp: Date.now(),
        data: {}
      };

      // Write to WAL first, then update in-memory state
      this.appendToWAL(beginOp);
      this.transactions.set(txid, {
        txid,
        operations: [],
        committed: false,
        aborted: false
      });

      return txid;
    } catch (error) {
      // Release lock on failure
      this.releaseLock();
      throw error;
    }
  }

  commitTransaction(txid: number): void {
    const tx = this.transactions.get(txid);
    if (!tx) {
      throw new Error(`Transaction ${txid} does not exist`);
    }
    if (tx.committed) {
      throw new Error(`Transaction ${txid} is already committed`);
    }
    if (tx.aborted) {
      throw new Error(`Transaction ${txid} is already aborted`);
    }

    try {
      const commitOp: WALOperation = {
        type: 'commit',
        txid,
        timestamp: Date.now(),
        data: {},
        stable: true
      };

      // Write to WAL first, then update in-memory state atomically
      this.appendToWAL(commitOp);
      // Force flush for commit operations to ensure durability
      this.flushBatch();
      tx.committed = true;
      this.buildSnapshot(txid);
      this.updateStableTxid();
    } finally {
      // Always release lock, even if commit operations fail
      this.releaseLock();
    }
  }

  abortTransaction(txid: number): void {
    const tx = this.transactions.get(txid);
    if (!tx) {
      throw new Error(`Transaction ${txid} does not exist`);
    }
    if (tx.committed) {
      throw new Error(`Transaction ${txid} is already committed`);
    }
    if (tx.aborted) {
      throw new Error(`Transaction ${txid} is already aborted`);
    }

    try {
      const abortOp: WALOperation = {
        type: 'abort',
        txid,
        timestamp: Date.now(),
        data: {}
      };

      // Write to WAL first, then update in-memory state
      this.appendToWAL(abortOp);
      tx.aborted = true;
    } finally {
      // Always release lock, even if abort operations fail
      this.releaseLock();
    }
  }

  // Transactional writes
  writeInTransaction(txid: number, obj: JsonObject): void {
    const tx = this.transactions.get(txid);
    if (!tx || tx.committed || tx.aborted) {
      throw new Error(`Transaction ${txid} is not active`);
    }

    const operation: WALOperation = {
      type: 'write',
      txid,
      timestamp: Date.now(),
      data: obj
    };

    this.appendToWAL(operation);
    tx.operations.push(operation);
  }

  updateInTransaction(txid: number, obj: JsonObject): void {
    const tx = this.transactions.get(txid);
    if (!tx || tx.committed || tx.aborted) {
      throw new Error(`Transaction ${txid} is not active`);
    }

    const operation: WALOperation = {
      type: 'update',
      txid,
      timestamp: Date.now(),
      data: obj
    };

    this.appendToWAL(operation);
    tx.operations.push(operation);
  }

  deleteInTransaction(txid: number): void {
    const tx = this.transactions.get(txid);
    if (!tx || tx.committed || tx.aborted) {
      throw new Error(`Transaction ${txid} is not active`);
    }

    const operation: WALOperation = {
      type: 'delete',
      txid,
      timestamp: Date.now(),
      data: {}
    };

    this.appendToWAL(operation);
    tx.operations.push(operation);
  }

  // Legacy interface (auto-transaction)
  write(obj: JsonObject): void {
    const txid = this.beginTransaction();
    try {
      this.writeInTransaction(txid, obj);
      this.commitTransaction(txid);
    } catch (error) {
      try {
        this.abortTransaction(txid);
      } catch (abortError) {
        // Log abort error but still throw original error
        console.warn(`Failed to abort transaction ${txid}:`, abortError);
      }
      throw error;
    }
  }

  update(obj: JsonObject): void {
    const txid = this.beginTransaction();
    try {
      this.updateInTransaction(txid, obj);
      this.commitTransaction(txid);
    } catch (error) {
      try {
        this.abortTransaction(txid);
      } catch (abortError) {
        // Log abort error but still throw original error
        console.warn(`Failed to abort transaction ${txid}:`, abortError);
      }
      throw error;
    }
  }

  delete(): void {
    const txid = this.beginTransaction();
    try {
      this.deleteInTransaction(txid);
      this.commitTransaction(txid);
    } catch (error) {
      try {
        this.abortTransaction(txid);
      } catch (abortError) {
        // Log abort error but still throw original error
        console.warn(`Failed to abort transaction ${txid}:`, abortError);
      }
      throw error;
    }
  }

  flush(): void {
    // Flush any pending WAL operations first
    this.flushBatch();
    
    const stableSnapshot = this.getSnapshot(this.stableTxid);
    if (stableSnapshot) {
      writeFileSync(this.dataPath, JSON.stringify(stableSnapshot, null, 2), 'utf8');
    }
  }

  compact(): void {
    // Flush current stable state to main file
    this.flush();
    
    // Remove committed transactions older than stable
    const toRemove: number[] = [];
    for (const [txid, tx] of this.transactions) {
      if (txid < this.stableTxid && (tx.committed || tx.aborted)) {
        toRemove.push(txid);
      }
    }
    
    for (const txid of toRemove) {
      this.transactions.delete(txid);
      this.snapshots.delete(txid);
    }
    
    // Rewrite WAL with only active/recent transactions
    if (existsSync(this.walPath)) {
      unlinkSync(this.walPath);
    }
    
    // Write remaining transactions back to WAL
    for (const [txid, tx] of this.transactions) {
      const beginOp: WALOperation = {
        type: 'begin',
        txid,
        timestamp: Date.now(),
        data: {}
      };
      this.appendToWAL(beginOp);
      
      for (const op of tx.operations) {
        this.appendToWAL(op);
      }
      
      if (tx.committed) {
        const commitOp: WALOperation = {
          type: 'commit',
          txid,
          timestamp: Date.now(),
          data: {},
          stable: true
        };
        this.appendToWAL(commitOp);
      } else if (tx.aborted) {
        const abortOp: WALOperation = {
          type: 'abort',
          txid,
          timestamp: Date.now(),
          data: {}
        };
        this.appendToWAL(abortOp);
      }
    }
  }

  /**
   * Force immediate flush of pending WAL operations
   */
  forceBatchFlush(): void {
    this.flushBatch();
  }

  close(): void {
    this.releaseLock();
    this.flush();
    this.compact();
  }

  // Recovery method to check WAL integrity
  checkIntegrity(): boolean {
    if (!existsSync(this.walPath)) {
      return true;
    }

    try {
      const walContent = readFileSync(this.walPath, 'utf8');
      const lines = walContent.trim().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const op: WALOperation = JSON.parse(line);
        if (!op.txid || !op.type || !op.timestamp) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  // Get WAL size for monitoring
  getWALSize(): number {
    if (!existsSync(this.walPath)) return 0;
    const content = readFileSync(this.walPath, 'utf8');
    return content.trim().split('\n').filter(line => line.trim()).length;
  }

  // Get transaction info
  getTransactionInfo(): {
    nextTxid: number;
    stableTxid: number;
    activeTxCount: number;
    totalTxCount: number;
  } {
    const activeTxCount = Array.from(this.transactions.values())
      .filter(tx => !tx.committed && !tx.aborted).length;
    
    return {
      nextTxid: this.nextTxid,
      stableTxid: this.stableTxid,
      activeTxCount,
      totalTxCount: this.transactions.size
    };
  }

  // Get all available snapshots
  getAvailableSnapshots(): number[] {
    return Array.from(this.snapshots.keys()).sort((a, b) => a - b);
  }

  // Force WAL replay (useful for testing/debugging)
  replay(): void {
    this.transactions.clear();
    this.snapshots.clear();
    this.nextTxid = 1;
    this.stableTxid = 0;
    this.loadFromWAL();
  }

  // Index management for WAL storage
  async createIndex(tableName: string, field: string, options?: { unique?: boolean }): Promise<void> {
    const indexName = `${tableName}_${field}`;
    const indexDef: import('./Storage').IndexDefinition = {
      tableName,
      fields: [field],
      unique: options?.unique ?? false,
      compound: false,
      name: indexName
    };
    
    // Store index definition
    this.indexes.set(indexName, indexDef);
    this.saveIndexes();
    
    // Validate existing data if unique constraint is being added
    if (options?.unique) {
      await this.validateUniqueConstraint(tableName, [field]);
    }
  }

  async createCompoundIndex(tableName: string, fields: string[], options?: { unique?: boolean; name?: string }): Promise<void> {
    const indexName = options?.name || `${tableName}_${fields.join('_')}`;
    const indexDef: import('./Storage').IndexDefinition = {
      tableName,
      fields,
      unique: options?.unique ?? false,
      compound: true,
      name: indexName
    };
    
    // Store index definition
    this.indexes.set(indexName, indexDef);
    this.saveIndexes();
    
    // Validate existing data if unique constraint is being added
    if (options?.unique) {
      await this.validateUniqueConstraint(tableName, fields);
    }
  }

  async dropIndex(tableName: string, indexName: string): Promise<void> {
    this.indexes.delete(indexName);
    this.saveIndexes();
  }

  async listIndexes(tableName?: string): Promise<import('./Storage').IndexDefinition[]> {
    return Array.from(this.indexes.values()).filter(
      index => !tableName || index.tableName === tableName
    );
  }

  async checkUnique(tableName: string, field: string, value: any, excludeDocId?: string): Promise<boolean> {
    // Check if there's a unique index for this field
    const indexName = `${tableName}_${field}`;
    const indexDef = this.indexes.get(indexName);
    
    if (indexDef && indexDef.unique) {
      // Use index-aware checking for better performance
      return this.checkUniqueWithIndex(tableName, [field], [value], excludeDocId);
    }
    
    // Fallback to full table scan using current snapshot
    const data = this.read();
    const table = data?.[tableName];
    if (!table || typeof table !== 'object') return true;

    for (const [docId, doc] of Object.entries(table)) {
      if (excludeDocId && docId === excludeDocId) continue;
      if (typeof doc === 'object' && doc !== null && (doc as any)[field] === value) {
        return false;
      }
    }
    return true;
  }

  async checkCompoundUnique(tableName: string, fields: string[], values: any[], excludeDocId?: string): Promise<boolean> {
    // Check if there's a compound unique index for these fields
    for (const indexDef of this.indexes.values()) {
      if (indexDef.tableName === tableName && 
          indexDef.compound && 
          indexDef.unique && 
          JSON.stringify(indexDef.fields) === JSON.stringify(fields)) {
        return this.checkUniqueWithIndex(tableName, fields, values, excludeDocId);
      }
    }
    
    // Fallback to full table scan using current snapshot
    const data = this.read();
    const table = data?.[tableName];
    if (!table || typeof table !== 'object') return true;

    for (const [docId, doc] of Object.entries(table)) {
      if (excludeDocId && docId === excludeDocId) continue;
      if (typeof doc === 'object' && doc !== null) {
        const docValues = fields.map(field => (doc as any)[field]);
        if (JSON.stringify(docValues) === JSON.stringify(values)) {
          return false;
        }
      }
    }
    return true;
  }

  private checkUniqueWithIndex(tableName: string, fields: string[], values: any[], excludeDocId?: string): boolean {
    // Transaction-aware uniqueness checking
    // First check the stable snapshot
    const data = this.read();
    const table = data?.[tableName];
    
    if (table && typeof table === 'object') {
      for (const [docId, doc] of Object.entries(table)) {
        if (excludeDocId && docId === excludeDocId) continue;
        if (typeof doc === 'object' && doc !== null) {
          const docValues = fields.map(field => (doc as any)[field]);
          if (JSON.stringify(docValues) === JSON.stringify(values)) {
            return false;
          }
        }
      }
    }
    
    // Also check uncommitted transactions for potential conflicts
    for (const transaction of this.transactions.values()) {
      if (!transaction.committed && !transaction.aborted) {
        for (const operation of transaction.operations) {
          if (operation.type === 'write' || operation.type === 'update') {
            const opTable = operation.data[tableName];
            if (opTable && typeof opTable === 'object') {
              for (const [docId, doc] of Object.entries(opTable)) {
                if (excludeDocId && docId === excludeDocId) continue;
                if (typeof doc === 'object' && doc !== null) {
                  const docValues = fields.map(field => (doc as any)[field]);
                  if (JSON.stringify(docValues) === JSON.stringify(values)) {
                    return false;
                  }
                }
              }
            }
          }
        }
      }
    }
    
    return true;
  }

  // Vector operations (not supported by WAL storage)
  async createVectorIndex(): Promise<void> {
    throw new Error('Vector operations not supported by this storage type');
  }

  async dropVectorIndex(): Promise<void> {
    throw new Error('Vector operations not supported by this storage type');
  }

  async listVectorIndexes(): Promise<VectorIndexDefinition[]> {
    throw new Error('Vector operations not supported by this storage type');
  }

  async vectorSearch(): Promise<VectorSearchResult[]> {
    throw new Error('Vector operations not supported by this storage type');
  }

  supportsFeature(feature: 'compoundIndex' | 'batch' | 'tx' | 'async' | 'fileLocking' | 'vectorSearch'): boolean {
    if (feature === 'vectorSearch') return false;
    return ['tx', 'async', 'compoundIndex'].includes(feature);
  }

  private loadIndexes(): void {
    try {
      if (existsSync(this.indexPath)) {
        const raw = readFileSync(this.indexPath, 'utf-8');
        const indexData = JSON.parse(raw) || {};
        
        for (const [name, def] of Object.entries(indexData)) {
          this.indexes.set(name, def as import('./Storage').IndexDefinition);
        }
      }
    } catch (error) {
      console.warn('Failed to load indexes:', error);
      this.indexes.clear();
    }
  }

  private saveIndexes(): void {
    try {
      const indexData: Record<string, import('./Storage').IndexDefinition> = {};
      for (const [name, def] of this.indexes.entries()) {
        indexData[name] = def;
      }
      writeFileSync(this.indexPath, JSON.stringify(indexData, null, 2));
    } catch (error) {
      console.warn('Failed to save indexes:', error);
    }
  }

  private async validateUniqueConstraint(tableName: string, fields: string[]): Promise<void> {
    const data = this.read();
    const table = data?.[tableName];
    if (!table || typeof table !== 'object') return;

    const seen = new Set<string>();
    
    for (const [docId, doc] of Object.entries(table)) {
      if (typeof doc === 'object' && doc !== null) {
        const values = fields.map(field => (doc as any)[field]);
        
        // Skip if any field is null/undefined
        if (values.some(v => v === undefined || v === null)) continue;
        
        const key = JSON.stringify(values);
        if (seen.has(key)) {
          throw new Error(`Unique constraint violation: Duplicate values found for fields [${fields.join(', ')}] in table ${tableName}`);
        }
        seen.add(key);
      }
    }
  }
}