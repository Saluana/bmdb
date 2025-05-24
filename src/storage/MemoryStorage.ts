import type { Storage, IndexDefinition, VectorIndexDefinition } from "./Storage";
import type { JsonObject } from "../utils/types";
import { VectorUtils, type Vector, type VectorSearchResult, type VectorIndex } from "../utils/VectorUtils";

export class MemoryStorage implements Storage {
  private data: JsonObject = {};
  private indexes: Map<string, IndexDefinition> = new Map();
  private indexedData: Map<string, Map<string, Set<string>>> = new Map(); // indexName -> value -> docIds
  private vectorIndexes: Map<string, VectorIndexDefinition> = new Map();
  private vectorData: Map<string, VectorIndex> = new Map(); // indexName -> vector index
  
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
    this.rebuildVectorIndexes();
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

  async createVectorIndex(tableName: string, field: string, dimensions: number, algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine'): Promise<void> {
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
  }

  async dropVectorIndex(tableName: string, indexName: string): Promise<void> {
    this.vectorIndexes.delete(indexName);
    this.vectorData.delete(indexName);
  }

  async listVectorIndexes(tableName?: string): Promise<VectorIndexDefinition[]> {
    return Array.from(this.vectorIndexes.values()).filter(
      index => !tableName || index.tableName === tableName
    );
  }

  async vectorSearch(tableName: string, field: string, queryVector: Vector, options?: { limit?: number; threshold?: number }): Promise<VectorSearchResult[]> {
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

    const table = this.data[tableName];
    if (!table || typeof table !== 'object') {
      return [];
    }

    return searchResults.map(result => ({
      docId: result.docId,
      score: result.score,
      document: (table as any)[result.docId]
    }));
  }

  supportsFeature(feature: 'compoundIndex' | 'batch' | 'tx' | 'async' | 'fileLocking' | 'vectorSearch'): boolean {
    return ['compoundIndex', 'async', 'vectorSearch'].includes(feature);
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

  private buildVectorIndex(indexDef: VectorIndexDefinition): void {
    const vectorIndex = VectorUtils.createVectorIndex(
      indexDef.field,
      indexDef.dimensions,
      indexDef.algorithm
    );
    
    const table = this.data[indexDef.tableName];
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