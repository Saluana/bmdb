import type { Doc, JsonObject } from "../utils/types";
import { LRUCache } from "../utils/LRUCache";
import type { QueryInstance } from "../query/QueryInstance";
import type { Storage } from "../storage/Storage";

// Document class that matches Python's Document
export class Document extends Map<string, any> {
  public readonly docId: number;
  private _originalMap: Map<string, any>;

  constructor(value: Record<string, any>, docId: number) {
    super(Object.entries(value));
    this.docId = docId;
    this._originalMap = this;
    
    // Make it behave like a regular object
    return new Proxy(this, {
      get(target, prop) {
        if (prop === 'docId' || prop === 'doc_id') return docId;
        if (prop === '_originalMap') return target._originalMap;
        if (typeof prop === 'string' && target.has(prop)) {
          return target.get(prop);
        }
        return Reflect.get(target, prop);
      },
      set(target, prop, value) {
        if (typeof prop === 'string' && prop !== 'docId' && prop !== 'doc_id') {
          target.set(prop, value);
          return true;
        }
        return Reflect.set(target, prop, value);
      },
      has(target, prop) {
        if (prop === 'docId' || prop === 'doc_id') return true;
        if (typeof prop === 'string') return target.has(prop);
        return Reflect.has(target, prop);
      },
      ownKeys(target) {
        return [...target.keys(), 'docId'];
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop === 'docId' || prop === 'doc_id') {
          return { value: docId, writable: false, enumerable: true, configurable: false };
        }
        if (typeof prop === 'string' && target.has(prop)) {
          return { value: target.get(prop), writable: true, enumerable: true, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    }) as any;
  }

  // For JSON serialization
  toJSON(): Record<string, any> {
    const obj: Record<string, any> = {};
    // Access the original Map methods directly
    const entries = this._originalMap ? this._originalMap.entries() : super.entries();
    for (const [key, value] of entries) {
      obj[key] = value;
    }
    return obj;
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
          docId = this._getNextId();
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

    // Perform search
    const results: Document[] = [];
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
        results.push(new Table.documentClass(doc, docId) as Document);
      }
    }

    // Cache results if cacheable
    if (cacheKey) {
      this._queryCache.set(cacheKey, results.map(doc => this._cloneDocument(doc)));
    }

    return results;
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
          if (typeof cond === 'function' ? cond(doc) : cond.test(doc)) {
            const docId = Table.documentIdClass(docIdStr);
            const performUpdate = typeof fields === 'function' ? 
              () => fields(doc) :
              () => Object.assign(doc, fields);
            
            performUpdate();
            updatedIds.push(docId);
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
    if (Object.keys(data).length > 0) {
      const maxId = Math.max(...Object.keys(data).map(Number));
      this._nextId = maxId + 1;
    }
  }

  private _isMapping(obj: any): boolean {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
  }

  private _getNextId(): number {
    if (this._nextId !== null) {
      const nextId = this._nextId;
      this._nextId = nextId + 1;
      return nextId;
    }

    const table = this._readTable();
    if (Object.keys(table).length === 0) {
      this._nextId = 2;
      return 1;
    }

    const maxId = Math.max(...Object.keys(table).map(Number));
    this._nextId = maxId + 2;
    return maxId + 1;
  }

  private _readTable(): Record<string, Record<string, any>> {
    const tables = this._storage.read();
    if (!tables || !tables[this._name]) {
      return {};
    }
    return tables[this._name] as Record<string, Record<string, any>>;
  }

  private _updateTable(updater: (table: Record<string, Record<string, any>>) => void): void {
    const tables = this._storage.read() || {};
    const table = (tables[this._name] as Record<string, Record<string, any>>) || {};
    
    updater(table);
    
    tables[this._name] = table;
    this._storage.write(tables);
    
    // Clear cache after update
    this.clearCache();
  }

  private _getCacheKey(cond: QueryLike<T>): string | null {
    if (typeof cond === 'object' && 'isCacheable' in cond && cond.isCacheable && !cond.isCacheable()) {
      return null;
    }
    
    if (typeof cond === 'object' && '__hash' in cond && cond.__hash) {
      return cond.__hash();
    }
    
    // For simple functions, try to create a basic hash
    try {
      return `fn_${cond.toString().slice(0, 100)}`;
    } catch {
      return null;
    }
  }

  private _cloneDocument(doc: Document): Document {
    return new Table.documentClass(doc.toJSON(), doc.docId) as Document;
  }

  // String representation
  toString(): string {
    return `<Table name='${this._name}', total=${this.length}, storage=${this._storage}>`;
  }
}