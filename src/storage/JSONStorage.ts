import type { Storage, IndexDefinition, VectorIndexDefinition } from "./Storage";
import { deepFreeze } from "../utils/freeze";
import type { JsonObject } from "../utils/types";
import { VectorUtils, type Vector, type VectorSearchResult, type VectorIndex } from "../utils/VectorUtils";
import { existsSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync, statSync } from "fs";
import { promisify } from "util";

export class JSONStorage implements Storage {
  private path: string;
  private indent = 0;
  private indexPath: string;
  private lockFd: number | null = null;
  private readLockCount = 0;
  private writeLocked = false;
  private vectorIndexes: Map<string, VectorIndexDefinition> = new Map();
  private vectorData: Map<string, VectorIndex> = new Map(); // indexName -> vector index
  
  constructor(path: string = "db.json", opts: { indent?: number } = {}) {
    this.path = path;
    this.indexPath = path.replace(/\.json$/, '.idx.json');
    this.indent = opts.indent ?? 0;
    if (!existsSync(this.path)) {
      writeFileSync(this.path, "{}\n");
    }
    if (!existsSync(this.indexPath)) {
      writeFileSync(this.indexPath, "{}");
    }
  }

  read(): JsonObject | null {
    const raw = readFileSync(this.path, 'utf-8');
    if (!raw || raw.trim() === "") {
      return null;
    }
    try {
      return JSON.parse(raw) as JsonObject;
    } catch {
      return null;
    }
  }

  write(obj: JsonObject): void {
    const frozen = deepFreeze(structuredClone(obj));
    writeFileSync(this.path, JSON.stringify(frozen, null, this.indent));
    // Rebuild vector indexes after write
    this.rebuildVectorIndexes();
  }

  close(): void {
    if (this.lockFd !== null) {
      closeSync(this.lockFd);
      this.lockFd = null;
    }
  }

  async createIndex(tableName: string, field: string, options?: { unique?: boolean }): Promise<void> {
    await this.acquireWriteLock();
    try {
      const indexes = this.readIndexes();
      const indexName = `${tableName}_${field}`;
      
      indexes[indexName] = {
        tableName,
        fields: [field],
        unique: options?.unique ?? false,
        compound: false,
        name: indexName
      };
      
      this.writeIndexes(indexes);
    } finally {
      await this.releaseWriteLock();
    }
  }

  async createCompoundIndex(tableName: string, fields: string[], options?: { unique?: boolean; name?: string }): Promise<void> {
    await this.acquireWriteLock();
    try {
      const indexes = this.readIndexes();
      const indexName = options?.name || `${tableName}_${fields.join('_')}`;
      
      indexes[indexName] = {
        tableName,
        fields,
        unique: options?.unique ?? false,
        compound: true,
        name: indexName
      };
      
      this.writeIndexes(indexes);
    } finally {
      await this.releaseWriteLock();
    }
  }

  async dropIndex(tableName: string, indexName: string): Promise<void> {
    await this.acquireWriteLock();
    try {
      const indexes = this.readIndexes();
      delete indexes[indexName];
      this.writeIndexes(indexes);
    } finally {
      await this.releaseWriteLock();
    }
  }

  async listIndexes(tableName?: string): Promise<IndexDefinition[]> {
    await this.acquireReadLock();
    try {
      const indexes = this.readIndexes();
      return Object.values(indexes).filter(
        index => !tableName || index.tableName === tableName
      );
    } finally {
      await this.releaseReadLock();
    }
  }

  async checkUnique(tableName: string, field: string, value: any, excludeDocId?: string): Promise<boolean> {
    await this.acquireReadLock();
    try {
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
    } finally {
      await this.releaseReadLock();
    }
  }

  async checkCompoundUnique(tableName: string, fields: string[], values: any[], excludeDocId?: string): Promise<boolean> {
    await this.acquireReadLock();
    try {
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
    } finally {
      await this.releaseReadLock();
    }
  }

  async createVectorIndex(tableName: string, field: string, dimensions: number, algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine'): Promise<void> {
    await this.acquireWriteLock();
    try {
      const indexName = `${tableName}_${field}_vector`;
      const indexDef: VectorIndexDefinition = {
        tableName,
        field,
        dimensions,
        algorithm,
        name: indexName
      };
      
      this.vectorIndexes.set(indexName, indexDef);
      this.buildVectorIndex(indexDef);
    } finally {
      await this.releaseWriteLock();
    }
  }

  async dropVectorIndex(tableName: string, indexName: string): Promise<void> {
    await this.acquireWriteLock();
    try {
      this.vectorIndexes.delete(indexName);
      this.vectorData.delete(indexName);
    } finally {
      await this.releaseWriteLock();
    }
  }

  async listVectorIndexes(tableName?: string): Promise<VectorIndexDefinition[]> {
    await this.acquireReadLock();
    try {
      return Array.from(this.vectorIndexes.values()).filter(
        index => !tableName || index.tableName === tableName
      );
    } finally {
      await this.releaseReadLock();
    }
  }

  async vectorSearch(tableName: string, field: string, queryVector: Vector, options?: { limit?: number; threshold?: number }): Promise<VectorSearchResult[]> {
    await this.acquireReadLock();
    try {
      const indexName = `${tableName}_${field}_vector`;
      const vectorIndex = this.vectorData.get(indexName);
      
      if (!vectorIndex) {
        throw new Error(`Vector index not found for table '${tableName}', field '${field}'`);
      }

      VectorUtils.validateVector(queryVector, vectorIndex.dimensions);
      
      const searchResults = VectorUtils.searchVectors(
        queryVector,
        vectorIndex.vectors,
        vectorIndex.algorithm,
        options?.limit,
        options?.threshold
      );

      const data = this.read();
      const table = data?.[tableName];
      if (!table || typeof table !== 'object') {
        return [];
      }

      return searchResults.map(result => ({
        docId: result.docId,
        score: result.score,
        document: (table as any)[result.docId]
      }));
    } finally {
      await this.releaseReadLock();
    }
  }

  supportsFeature(feature: 'compoundIndex' | 'batch' | 'tx' | 'async' | 'fileLocking' | 'vectorSearch'): boolean {
    return ['compoundIndex', 'async', 'fileLocking', 'vectorSearch'].includes(feature);
  }

  async acquireWriteLock(): Promise<void> {
    if (this.writeLocked) return;
    
    // Wait for any read locks to release (with timeout)
    let waitTime = 0;
    while (this.readLockCount > 0 && waitTime < 1000) {
      await new Promise(resolve => setTimeout(resolve, 10));
      waitTime += 10;
    }
    
    if (this.readLockCount > 0) {
      throw new Error('Timeout waiting for read locks to release');
    }
    
    // Simple file-based locking with timeout and stale lock detection
    const lockFile = this.path + '.write.lock';
    let attempts = 0;
    const maxAttempts = 100; // 1 second timeout
    
    while (existsSync(lockFile) && attempts < maxAttempts) {
      // Check if lock is stale (older than 5 seconds)
      try {
        const lockContent = readFileSync(lockFile, 'utf-8');
        const lockPid = parseInt(lockContent);
        
        // If it's our own process, we can safely remove it
        if (lockPid === process.pid) {
          unlinkSync(lockFile);
          break;
        }
        
        // Check if process is still running (this is platform specific, so we'll use timeout)
        const stats = statSync(lockFile);
        const lockAge = Date.now() - stats.mtime.getTime();
        if (lockAge > 5000) { // 5 seconds
          console.warn('Removing stale lock file');
          unlinkSync(lockFile);
          break;
        }
      } catch {
        // Lock file was removed or is corrupted, continue
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      throw new Error('Timeout waiting for write lock');
    }
    
    try {
      writeFileSync(lockFile, process.pid.toString());
      this.writeLocked = true;
    } catch (error) {
      throw new Error(`Failed to acquire write lock: ${error}`);
    }
  }

  async releaseWriteLock(): Promise<void> {
    if (!this.writeLocked) return;
    
    try {
      const lockFile = this.path + '.write.lock';
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    } catch (error) {
      console.warn('Failed to remove write lock file:', error);
    }
    this.writeLocked = false;
  }

  async acquireReadLock(): Promise<void> {
    // If we already have a write lock, we can proceed (same process)
    if (this.writeLocked) {
      this.readLockCount++;
      return;
    }
    
    // Wait for write lock to release (with timeout)
    const lockFile = this.path + '.write.lock';
    let attempts = 0;
    const maxAttempts = 100; // 1 second timeout
    
    while (existsSync(lockFile) && attempts < maxAttempts) {
      // Check if it's our own lock
      try {
        const lockContent = readFileSync(lockFile, 'utf-8');
        const lockPid = parseInt(lockContent);
        if (lockPid === process.pid) {
          // It's our own lock, we can proceed
          break;
        }
      } catch {
        // Lock file issue, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      throw new Error('Timeout waiting for write lock to release');
    }
    
    this.readLockCount++;
  }

  async releaseReadLock(): Promise<void> {
    if (this.readLockCount <= 0) return;
    this.readLockCount--;
  }

  private readIndexes(): Record<string, IndexDefinition> {
    try {
      const raw = readFileSync(this.indexPath, 'utf-8');
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  private writeIndexes(indexes: Record<string, IndexDefinition>): void {
    writeFileSync(this.indexPath, JSON.stringify(indexes, null, this.indent));
  }

  private buildVectorIndex(indexDef: VectorIndexDefinition): void {
    const vectorIndex = VectorUtils.createVectorIndex(
      indexDef.field,
      indexDef.dimensions,
      indexDef.algorithm
    );
    
    const data = this.read();
    const table = data?.[indexDef.tableName];
    if (table && typeof table === 'object') {
      for (const [docId, doc] of Object.entries(table)) {
        if (typeof doc === 'object' && doc !== null) {
          const vectorValue = (doc as any)[indexDef.field];
          if (Array.isArray(vectorValue)) {
            try {
              VectorUtils.addToIndex(vectorIndex, docId, vectorValue);
            } catch (error) {
              console.warn(`Skipping invalid vector for doc ${docId}: ${error}`);
            }
          }
        }
      }
    }
    
    this.vectorData.set(indexDef.name!, vectorIndex);
  }

  private rebuildVectorIndexes(): void {
    for (const indexDef of this.vectorIndexes.values()) {
      this.buildVectorIndex(indexDef);
    }
  }
}