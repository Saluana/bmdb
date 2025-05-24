import type { JsonObject } from "../utils/types";

export interface IndexDefinition {
  tableName: string;
  fields: string[];
  unique: boolean;
  compound?: boolean;
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
  
  // Feature support
  supportsFeature(feature: 'compoundIndex' | 'batch' | 'tx' | 'async' | 'fileLocking'): boolean;
  
  // File locking for concurrent access
  acquireWriteLock?(): Promise<void>;
  releaseWriteLock?(): Promise<void>;
  acquireReadLock?(): Promise<void>;
  releaseReadLock?(): Promise<void>;
}

export type StorageCtor = new (pathOrOpts?: any) => Storage;