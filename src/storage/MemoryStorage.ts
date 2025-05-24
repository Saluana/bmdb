import type { Storage, IndexDefinition } from "./Storage";
import type { JsonObject } from "../utils/types";

export class MemoryStorage implements Storage {
  private data: JsonObject = {};
  private indexes: Map<string, IndexDefinition> = new Map();
  private indexedData: Map<string, Map<string, Set<string>>> = new Map(); // indexName -> value -> docIds
  
  constructor() {
    // Initialize with empty data
    this.data = {};
  }

  read(): JsonObject | null {
    return this.data;
  }
  
  write(obj: JsonObject): void {
    this.data = obj;
    // Rebuild indexes after write
    this.rebuildIndexes();
  }
  
  close(): void {
    // Nothing to close for memory storage
  }

  async createIndex(tableName: string, field: string, options?: { unique?: boolean }): Promise<void> {
    const indexName = `${tableName}_${field}`;
    const indexDef: IndexDefinition = {
      tableName,
      fields: [field],
      unique: options?.unique ?? false,
      compound: false,
      name: indexName
    };
    
    this.indexes.set(indexName, indexDef);
    this.buildSingleIndex(indexDef);
  }

  async createCompoundIndex(tableName: string, fields: string[], options?: { unique?: boolean; name?: string }): Promise<void> {
    const indexName = options?.name || `${tableName}_${fields.join('_')}`;
    const indexDef: IndexDefinition = {
      tableName,
      fields,
      unique: options?.unique ?? false,
      compound: true,
      name: indexName
    };
    
    this.indexes.set(indexName, indexDef);
    this.buildSingleIndex(indexDef);
  }

  async dropIndex(tableName: string, indexName: string): Promise<void> {
    this.indexes.delete(indexName);
    this.indexedData.delete(indexName);
  }

  async listIndexes(tableName?: string): Promise<IndexDefinition[]> {
    return Array.from(this.indexes.values()).filter(
      index => !tableName || index.tableName === tableName
    );
  }

  async checkUnique(tableName: string, field: string, value: any, excludeDocId?: string): Promise<boolean> {
    const table = this.data[tableName];
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
    const table = this.data[tableName];
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

  supportsFeature(feature: 'compoundIndex' | 'batch' | 'tx' | 'async' | 'fileLocking'): boolean {
    return ['compoundIndex', 'async'].includes(feature);
  }

  private buildSingleIndex(indexDef: IndexDefinition): void {
    const indexData = new Map<string, Set<string>>();
    const table = this.data[indexDef.tableName];
    
    if (table && typeof table === 'object') {
      for (const [docId, doc] of Object.entries(table)) {
        if (typeof doc === 'object' && doc !== null) {
          const indexKey = this.getIndexKey(doc as any, indexDef.fields);
          if (indexKey !== null) {
            if (!indexData.has(indexKey)) {
              indexData.set(indexKey, new Set());
            }
            indexData.get(indexKey)!.add(docId);
          }
        }
      }
    }
    
    this.indexedData.set(indexDef.name!, indexData);
  }

  private rebuildIndexes(): void {
    for (const indexDef of this.indexes.values()) {
      this.buildSingleIndex(indexDef);
    }
  }

  private getIndexKey(doc: any, fields: string[]): string | null {
    const values = fields.map(field => doc[field]);
    if (values.some(v => v === undefined || v === null)) return null;
    return JSON.stringify(values);
  }
}