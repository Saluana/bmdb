import type { Storage } from "./Storage";
import type { JsonObject } from "../utils/types";
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
  private nextTxid: number = 1;
  private lockFd: number | null = null;
  private transactions: Map<number, Transaction> = new Map();
  private stableTxid: number = 0;
  private snapshots: Map<number, JsonObject> = new Map();

  constructor(path: string) {
    this.dataPath = path;
    this.walPath = `${path}.wal`;
    this.lockPath = `${path}.lock`;
    this.loadFromWAL();
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
    let snapshot = structuredClone(this.getSnapshot(this.stableTxid));

    // Apply this transaction's operations
    for (const op of tx.operations) {
      switch (op.type) {
        case 'write':
          snapshot = op.data;
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
    const operationLine = JSON.stringify(operation) + '\n';
    appendFileSync(this.walPath, operationLine, 'utf8');
  }

  private acquireLock(): void {
    if (this.lockFd !== null) return; // Already locked
    
    try {
      this.lockFd = openSync(this.lockPath, 'w');
    } catch (error) {
      throw new Error('Could not acquire write lock');
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
    this.acquireLock();
    const txid = this.nextTxid++;
    
    const beginOp: WALOperation = {
      type: 'begin',
      txid,
      timestamp: Date.now(),
      data: {}
    };

    this.appendToWAL(beginOp);
    this.transactions.set(txid, {
      txid,
      operations: [],
      committed: false,
      aborted: false
    });

    return txid;
  }

  commitTransaction(txid: number): void {
    const tx = this.transactions.get(txid);
    if (!tx || tx.committed || tx.aborted) {
      throw new Error(`Transaction ${txid} cannot be committed`);
    }

    const commitOp: WALOperation = {
      type: 'commit',
      txid,
      timestamp: Date.now(),
      data: {},
      stable: true
    };

    this.appendToWAL(commitOp);
    tx.committed = true;
    this.buildSnapshot(txid);
    this.updateStableTxid();
    this.releaseLock();
  }

  abortTransaction(txid: number): void {
    const tx = this.transactions.get(txid);
    if (!tx || tx.committed || tx.aborted) {
      throw new Error(`Transaction ${txid} cannot be aborted`);
    }

    const abortOp: WALOperation = {
      type: 'abort',
      txid,
      timestamp: Date.now(),
      data: {}
    };

    this.appendToWAL(abortOp);
    tx.aborted = true;
    this.releaseLock();
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
      this.abortTransaction(txid);
      throw error;
    }
  }

  update(obj: JsonObject): void {
    const txid = this.beginTransaction();
    try {
      this.updateInTransaction(txid, obj);
      this.commitTransaction(txid);
    } catch (error) {
      this.abortTransaction(txid);
      throw error;
    }
  }

  delete(): void {
    const txid = this.beginTransaction();
    try {
      this.deleteInTransaction(txid);
      this.commitTransaction(txid);
    } catch (error) {
      this.abortTransaction(txid);
      throw error;
    }
  }

  flush(): void {
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
}