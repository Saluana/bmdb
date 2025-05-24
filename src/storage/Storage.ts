import type { JsonObject } from "../utils/types";
import type { Vector, VectorSearchResult } from "../utils/VectorUtils";

export interface IndexDefinition {
  tableName: string;
  fields: string[];
  unique: boolean;
  compound?: boolean;
  name?: string;
}

export interface VectorIndexDefinition {
  tableName: string;
  field: string;
  dimensions: number;
  algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan';
  name?: string;
}

export interface Storage {
  read(): JsonObject | null;
  write(obj: JsonObject): void;
  close(): void;
  
  // Index management
  createIndex(tableName: string, field: string, options?: { unique?: boolean }): Promise<void>;
  createCompoundIndex(tableName: string, fields: string[], options?: { unique?: boolean; name?: string }): Promise<void>;
  dropIndex(tableName: string, indexName: string): Promise<void>;
  listIndexes(tableName?: string): Promise<IndexDefinition[]>;
  
  // Uniqueness checking
  checkUnique(tableName: string, field: string, value: any, excludeDocId?: string): Promise<boolean>;
  checkCompoundUnique(tableName: string, fields: string[], values: any[], excludeDocId?: string): Promise<boolean>;
  
  // Vector operations
  createVectorIndex(tableName: string, field: string, dimensions: number, algorithm?: 'cosine' | 'euclidean' | 'dot' | 'manhattan'): Promise<void>;
  dropVectorIndex(tableName: string, indexName: string): Promise<void>;
  listVectorIndexes(tableName?: string): Promise<VectorIndexDefinition[]>;
  vectorSearch(tableName: string, field: string, queryVector: Vector, options?: { limit?: number; threshold?: number }): Promise<VectorSearchResult[]>;
  
  // Feature support
  supportsFeature(feature: 'compoundIndex' | 'batch' | 'tx' | 'async' | 'fileLocking' | 'vectorSearch'): boolean;
  
  // File locking for concurrent access
  acquireWriteLock?(): Promise<void>;
  releaseWriteLock?(): Promise<void>;
  acquireReadLock?(): Promise<void>;
  releaseReadLock?(): Promise<void>;
}

export type StorageCtor = new (pathOrOpts?: any) => Storage;