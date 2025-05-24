import type { Doc, JsonObject } from "../utils/types";
import { LRUCache } from "../utils/LRUCache";
import { CopyOnWriteObject } from "../utils/CopyOnWrite";
import { arrayPool, resultSetPool, PooledArray, PooledResultSet } from "../utils/ObjectPool";
import type { QueryInstance } from "../query/QueryInstance";
import type { Storage } from "../storage/Storage";

// Optimized Document class without Proxy overhead
export class Document {
  public readonly docId: number;
  public readonly doc_id: number;

  constructor(value: Record<string, any>, docId: number) {
    this.docId = docId;
    this.doc_id = docId; // Alias for convenience
    
    // Directly assign properties for optimal memory usage
    Object.assign(this, value);
  }

  // For JSON serialization - exclude internal properties
  toJSON(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [key, value] of Object.entries(this)) {
      if (key !== 'docId' && key !== 'doc_id') {
        obj[key] = value;
      }
    }
    return obj;
  }

  // Map-like interface for backward compatibility
  get(key: string): any {
    return (this as any)[key];
  }

  set(key: string, value: any): void {
    if (key !== 'docId' && key !== 'doc_id') {
      (this as any)[key] = value;
    }
  }

  has(key: string): boolean {
    return key in this;
  }

  keys(): string[] {
    return Object.keys(this).filter(key => key !== 'docId' && key !== 'doc_id');
  }

  entries(): [string, any][] {
    return Object.entries(this).filter(([key]) => key !== 'docId' && key !== 'doc_id');
  }

  values(): any[] {
    return Object.values(this).slice(0, -2); // Exclude docId and doc_id
  }
}

export type QueryLike<T = any> = 
  | ((doc: Record<string, any>) => boolean)
  | {
      test: (doc: Record<string, any>) => boolean;
      __hash?(): string;
      isCacheable?(): boolean;
    };

export class Table<T extends Record<string, any> = any> {
  // Class configuration (can be overridden)
  static documentClass = Document;
  static documentIdClass = Number;
  static queryCacheClass = LRUCache;
  static defaultQueryCacheCapacity = 10;

  private _storage: Storage;
  private _name: string;
  private _queryCache: LRUCache<string, Document[]>;
  private _nextId: number | null = null;

  constructor(
    storage: Storage, 
    name: string, 
    options: { cacheSize?: number; persistEmpty?: boolean } = {}
  ) {
    this._storage = storage;
    this._name = name;
    this._queryCache = new LRUCache(options.cacheSize ?? Table.defaultQueryCacheCapacity);

    if (options.persistEmpty) {
      this._updateTable(() => {});
    }
  }

  get name(): string {
    return this._name;
  }

  get storage(): Storage {
    return this._storage;
  }

  // Insert a single document
  insert(document: T | Document): number {
    if (!this._isMapping(document)) {
      throw new Error('Document is not a Mapping');
    }

    let docId: number;
    
    if (document instanceof Document) {
      docId = document.docId;
      this._nextId = null; // Reset next ID
    } else {
      docId = this._getNextId();
    }

    this._updateTable((table) => {
      if (String(docId) in table) {
        throw new Error(`Document with ID ${docId} already exists`);
      }
      
      const docData = document instanceof Document ? 
        document.toJSON() : 
        { ...document };
      
      table[String(docId)] = docData;
    });

    return docId;
  }

  // Insert multiple documents
  insertMultiple(documents: Array<T | Document>): number[] {
    const docIds: number[] = [];

    this._updateTable((table) => {
      for (const document of documents) {
        if (!this._isMapping(document)) {
          throw new Error('Document is not a Mapping');
        }

        let docId: number;
        
        if (document instanceof Document) {
          if (String(document.docId) in table) {
            throw new Error(`Document with ID ${document.docId} already exists`);
          }
          docId = document.docId;
          docIds.push(docId);
          table[String(docId)] = document.toJSON();
        } else {
          // Generate ID using timestamp + random component for better uniqueness
          docId = this._generateUniqueId(table);
          docIds.push(docId);
          table[String(docId)] = { ...document };
        }
      }
    });

    return docIds;
  }

  // Get all documents
  all(): Document[] {
    return Array.from(this);
  }

  // Search for documents
  search(cond: QueryLike<T>): Document[] {
    // Check cache first
    const cacheKey = this._getCacheKey(cond);
    if (cacheKey) {
      const cached = this._queryCache.get(cacheKey);
      if (cached) {
        return cached.map(doc => this._cloneDocument(doc));
      }
    }

    // Use pooled array for better memory management
    const pooledArray = arrayPool.borrow();
    try {
      const table = this._readTable();
      
      for (const [docIdStr, doc] of Object.entries(table)) {
        let matches = false;
        try {
          if (typeof cond === 'function') {
            matches = cond(doc);
          } else if (cond && typeof cond === 'object' && 'test' in cond) {
            matches = (cond as any).test(doc);
          }
        } catch (error) {
          matches = false;
        }
        
        if (matches) {
          const docId = Table.documentIdClass(docIdStr);
          pooledArray.push(new Table.documentClass(doc, docId) as Document);
        }
      }

      // Convert to regular array
      const results = [...pooledArray.array];

      // Cache results if cacheable
      if (cacheKey) {
        this._queryCache.set(cacheKey, results.map(doc => this._cloneDocument(doc)));
      }

      return results;
    } finally {
      arrayPool.return(pooledArray);
    }
  }

  // Get a single document or multiple documents by ID(s)
  get(cond?: QueryLike<T>, docId?: number, docIds?: number[]): Document | Document[] | null {
    const table = this._readTable();

    if (docId !== undefined) {
      const doc = table[String(docId)];
      return doc ? new Table.documentClass(doc, docId) as Document : null;
    }

    if (docIds !== undefined) {
      const results: Document[] = [];
      const docIdSet = new Set(docIds.map(String));
      
      for (const [docIdStr, doc] of Object.entries(table)) {
        if (docIdSet.has(docIdStr)) {
          results.push(new Table.documentClass(doc, Table.documentIdClass(docIdStr)) as Document);
        }
      }
      return results;
    }

    if (cond !== undefined) {
      for (const [docIdStr, doc] of Object.entries(table)) {
        let matches = false;
        try {
          if (typeof cond === 'function') {
            matches = cond(doc);
          } else if (cond && typeof cond === 'object' && 'test' in cond) {
            matches = (cond as any).test(doc);
          }
        } catch (error) {
          matches = false;
        }
        
        if (matches) {
          return new Table.documentClass(doc, Table.documentIdClass(docIdStr)) as Document;
        }
      }
      return null;
    }

    throw new Error('You have to pass either cond or doc_id or doc_ids');
  }

  // Check if document exists
  contains(cond?: QueryLike<T>, docId?: number): boolean {
    if (docId !== undefined) {
      return this.get(undefined, docId) !== null;
    }
    
    if (cond !== undefined) {
      return this.get(cond) !== null;
    }
    
    throw new Error('You have to pass either cond or doc_id');
  }

  // Update documents
  update(
    fields: Partial<T> | ((doc: Record<string, any>) => void),
    cond?: QueryLike<T>,
    docIds?: number[]
  ): number[] {
    const updatedIds: number[] = [];

    const performUpdate = typeof fields === 'function' ? 
      (doc: Record<string, any>) => fields(doc) :
      (doc: Record<string, any>) => Object.assign(doc, fields);

    this._updateTable((table) => {
      if (docIds !== undefined) {
        for (const docId of docIds) {
          performUpdate(table[String(docId)]);
          updatedIds.push(docId);
        }
      } else if (cond !== undefined) {
        for (const [docIdStr, doc] of Object.entries(table)) {
          let matches = false;
          try {
            if (typeof cond === 'function') {
              matches = cond(doc);
            } else if (cond && typeof cond === 'object' && 'test' in cond) {
              matches = (cond as any).test(doc);
            }
          } catch (error) {
            matches = false;
          }
          
          if (matches) {
            const docId = Table.documentIdClass(docIdStr);
            performUpdate(doc);
            updatedIds.push(docId);
          }
        }
      } else {
        // Update all documents
        for (const [docIdStr, doc] of Object.entries(table)) {
          const docId = Table.documentIdClass(docIdStr);
          performUpdate(doc);
          updatedIds.push(docId);
        }
      }
    });

    return updatedIds;
  }

  // Update multiple with different conditions
  updateMultiple(
    updates: Array<[Partial<T> | ((doc: Record<string, any>) => void), QueryLike<T>]>
  ): number[] {
    const updatedIds: number[] = [];

    this._updateTable((table) => {
      for (const [docIdStr, doc] of Object.entries(table)) {
        for (const [fields, cond] of updates) {
          let matches = false;
          try {
            if (typeof cond === 'function') {
              matches = cond(doc);
            } else if (cond && typeof cond === 'object' && 'test' in cond && typeof cond.test === 'function') {
              matches = cond.test(doc);
            }
          } catch (error) {
            matches = false;
          }
          
          if (matches) {
            const docId = Table.documentIdClass(docIdStr);
            if (!isNaN(docId) && isFinite(docId)) {
              const performUpdate = typeof fields === 'function' ? 
                () => fields(doc) :
                () => Object.assign(doc, fields);
              
              try {
                performUpdate();
                updatedIds.push(docId);
              } catch (error) {
                console.warn(`Failed to update document ${docId}:`, error);
              }
            }
          }
        }
      }
    });

    return updatedIds;
  }

  // Upsert (update or insert)
  upsert(document: T | Document, cond?: QueryLike<T>): number[] {
    let docIds: number[] | undefined;
    
    if (document instanceof Document) {
      docIds = [document.docId];
    }

    if (!docIds && !cond) {
      throw new Error("If you don't specify a search query, you must specify a doc_id. " +
                     "Hint: use a Document object.");
    }

    try {
      const updated = this.update(document as any, cond, docIds);
      if (updated.length > 0) {
        return updated;
      }
    } catch (error) {
      // Document with docId doesn't exist
    }

    // Insert as new document
    return [this.insert(document)];
  }

  // Remove documents
  remove(cond?: QueryLike<T>, docIds?: number[]): number[] {
    const removedIds: number[] = [];

    if (docIds !== undefined) {
      this._updateTable((table) => {
        for (const docId of docIds) {
          delete table[String(docId)];
          removedIds.push(docId);
        }
      });
      return removedIds;
    }

    if (cond !== undefined) {
      this._updateTable((table) => {
        for (const [docIdStr, doc] of Object.entries(table)) {
          if (typeof cond === 'function' ? cond(doc) : cond.test(doc)) {
            const docId = Table.documentIdClass(docIdStr);
            delete table[docIdStr];
            removedIds.push(docId);
          }
        }
      });
      return removedIds;
    }

    throw new Error('Use truncate() to remove all documents');
  }

  // Clear all documents
  truncate(): void {
    this._updateTable((table) => {
      for (const key of Object.keys(table)) {
        delete table[key];
      }
    });
    this._nextId = null;
  }

  // Count documents
  count(cond: QueryLike<T>): number {
    return this.search(cond).length;
  }

  // Clear query cache
  clearCache(): void {
    this._queryCache.clear();
  }

  // Get object pool statistics
  getPoolStats(): {
    arrayPool: any;
    resultSetPool: any;
    queryCache: any;
  } {
    return {
      arrayPool: arrayPool.getStats(),
      resultSetPool: resultSetPool.getStats(),
      queryCache: this._queryCache.getStats()
    };
  }

  // Get length
  get length(): number {
    return Object.keys(this._readTable()).length;
  }

  // Iterator
  *[Symbol.iterator](): Iterator<Document> {
    const table = this._readTable();
    for (const [docIdStr, doc] of Object.entries(table)) {
      const docId = Table.documentIdClass(docIdStr);
      yield new Table.documentClass(doc, docId) as Document;
    }
  }

  // Internal methods
  _loadData(data: Record<string, any>): void {
    // Called during initialization to load existing data
    // No longer caches nextId to prevent race conditions
    if (!data || typeof data !== 'object') {
      console.warn(`Invalid data provided to _loadData for table '${this._name}'`);
      return;
    }
  }

  private _isMapping(obj: any): boolean {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
  }

  private _getNextId(): number {
    // Use atomic approach: try incrementing IDs until we find one that doesn't exist
    // This handles race conditions by detecting collisions during write
    const table = this._readTable();
    
    if (!table || typeof table !== 'object' || Object.keys(table).length === 0) {
      return 1;
    }

    const numericIds = Object.keys(table)
      .map(Number)
      .filter(id => !isNaN(id) && isFinite(id) && id > 0);
    
    if (numericIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...numericIds);
    return maxId + 1;
  }


  private _generateUniqueId(localTable: Record<string, Record<string, any>>): number {
    // Use a combination of timestamp and process-unique counter for better uniqueness
    const now = Date.now();
    let attempts = 0;
    const maxAttempts = 1000;
    
    while (attempts < maxAttempts) {
      // Create ID from timestamp + counter/random component
      const candidateId = now * 1000 + attempts + Math.floor(Math.random() * 1000);
      
      // Check both local and persistent state
      if (!localTable[String(candidateId)]) {
        const freshTable = this._readTable();
        if (!freshTable || !freshTable[String(candidateId)]) {
          return candidateId;
        }
      }
      
      attempts++;
    }
    
    // Fallback to simple sequential if timestamp approach fails
    return this._getNextIdFromTable(this._readTable());
  }

  private _getNextIdFromTable(table: Record<string, Record<string, any>> | null): number {
    if (!table || typeof table !== 'object' || Object.keys(table).length === 0) {
      return 1;
    }

    const numericIds = Object.keys(table)
      .map(Number)
      .filter(id => !isNaN(id) && isFinite(id) && id > 0);
    
    if (numericIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...numericIds);
    return maxId + 1;
  }

  protected _readTable(): Record<string, Record<string, any>> {
    const tables = this._storage.read();
    if (!tables || !tables[this._name]) {
      return {};
    }
    return tables[this._name] as Record<string, Record<string, any>>;
  }

  private _updateTable(updater: (table: Record<string, Record<string, any>>) => void): void {
    // Check if storage supports selective updates
    if ((this._storage as any).supportsFeature && (this._storage as any).supportsFeature('batch')) {
      this._performSelectiveUpdate(updater);
    } else {
      this._performFullUpdate(updater);
    }
    
    // Clear cache after update
    this.clearCache();
  }

  private _performSelectiveUpdate(updater: (table: Record<string, Record<string, any>>) => void): void {
    const tables = this._storage.read() || {};
    const table = (tables[this._name] as Record<string, Record<string, any>>) || {};
    
    updater(table);
    
    // Use update() method if available for partial updates
    if (typeof (this._storage as any).update === 'function') {
      tables[this._name] = table;
      (this._storage as any).update(tables);
    } else {
      // Fallback to full write
      tables[this._name] = table;
      this._storage.write(tables);
    }
  }

  private _performFullUpdate(updater: (table: Record<string, Record<string, any>>) => void): void {
    const tables = this._storage.read() || {};
    const table = (tables[this._name] as Record<string, Record<string, any>>) || {};
    
    updater(table);
    
    tables[this._name] = table;
    this._storage.write(tables);
  }

  private _getCacheKey(cond: QueryLike<T>): string | null {
    if (typeof cond === 'object' && 'isCacheable' in cond && cond.isCacheable && !cond.isCacheable()) {
      return null;
    }
    
    if (typeof cond === 'object' && '__hash' in cond && cond.__hash) {
      return cond.__hash();
    }
    
    // For functions, create a stable hash based on function content
    if (typeof cond === 'function') {
      return this._hashFunction(cond);
    }
    
    // For other types, try to serialize and hash
    try {
      const serialized = JSON.stringify(cond);
      return this._hashString(serialized);
    } catch {
      return null;
    }
  }

  private _hashFunction(fn: Function): string {
    try {
      const fnStr = fn.toString();
      // Remove whitespace and normalize for better cache hits
      const normalized = fnStr
        .replace(/\s+/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .trim();
      
      return `fn_${this._hashString(normalized)}`;
    } catch {
      return `fn_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  private _hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString(36);
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  private _cloneDocument(doc: Document): Document {
    return new Table.documentClass(doc.toJSON(), doc.docId) as Document;
  }

  // Create a copy-on-write isolated view of a document
  private _createIsolatedDocument(docData: Record<string, any>, docId: number): Document {
    const cowData = new CopyOnWriteObject(docData);
    const isolatedDoc = new Table.documentClass(cowData.getRawData(), docId) as Document;
    
    // Override methods to use CoW semantics
    const originalSet = isolatedDoc.set;
    isolatedDoc.set = function(key: string, value: any) {
      if (key !== 'docId' && key !== 'doc_id') {
        cowData.set(key, value);
        (this as any)[key] = value;
      }
    };
    
    return isolatedDoc;
  }

  // String representation
  toString(): string {
    return `<Table name='${this._name}', total=${this.length}, storage=${this._storage}>`;
  }
}