import type { Doc, JsonObject } from "../utils/types";
import { LRUCache } from "../utils/LRUCache";
import { CopyOnWriteObject } from "../utils/CopyOnWrite";
import { arrayPool, resultSetPool, PooledArray, PooledResultSet } from "../utils/ObjectPool";
import type { QueryInstance } from "../query/QueryInstance";
import type { Storage } from "../storage/Storage";
import { IndexManager } from "../query/IndexManager";
import { BitmapUtils } from "../utils/IndexedBTree";

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
  nextPage?: number;
  previousPage?: number;
}

export interface LazyIteratorOptions {
  pageSize?: number;
  prefetchNext?: boolean;
  cachePages?: boolean;
}

export interface ParallelQueryOptions {
  chunkSize?: number;
  maxConcurrency?: number;
  useWorkerThreads?: boolean;
}

export interface QueryJob<T> {
  id: string;
  condition: QueryLike<T>;
  chunk: Array<[string, Record<string, any>]>;
  resolve: (results: Document[]) => void;
  reject: (error: Error) => void;
}

export class LazyIterator<T> implements AsyncIterable<T> {
  private table: Table<any>;
  private condition?: QueryLike<any>;
  private pageSize: number;
  private prefetchNext: boolean;
  private cachePages: boolean;
  private pageCache = new Map<number, T[]>();
  private totalCount?: number;

  constructor(
    table: Table<any>,
    condition?: QueryLike<any>,
    options: LazyIteratorOptions = {}
  ) {
    this.table = table;
    this.condition = condition;
    this.pageSize = options.pageSize ?? 50;
    this.prefetchNext = options.prefetchNext ?? true;
    this.cachePages = options.cachePages ?? true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getPage(page);
      
      for (const item of result.data) {
        yield item;
      }

      hasMore = result.hasMore;
      page++;

      if (this.prefetchNext && hasMore) {
        setImmediate(() => this.getPage(page));
      }
    }
  }

  async getPage(page: number): Promise<PaginatedResult<T>> {
    if (this.cachePages && this.pageCache.has(page)) {
      const data = this.pageCache.get(page)!;
      return this.buildPaginatedResult(data, page);
    }

    const offset = (page - 1) * this.pageSize;
    const data = this.condition
      ? this.table.search(this.condition)
      : this.table.all();

    const pageData = data.slice(offset, offset + this.pageSize) as T[];
    
    if (this.cachePages) {
      this.pageCache.set(page, pageData);
    }

    this.totalCount = data.length;
    return this.buildPaginatedResult(pageData, page);
  }

  private buildPaginatedResult(data: T[], page: number): PaginatedResult<T> {
    const totalCount = this.totalCount ?? 0;
    const totalPages = Math.ceil(totalCount / this.pageSize);
    
    return {
      data,
      page,
      pageSize: this.pageSize,
      totalCount,
      totalPages,
      hasMore: page < totalPages,
      nextPage: page < totalPages ? page + 1 : undefined,
      previousPage: page > 1 ? page - 1 : undefined
    };
  }

  clearCache(): void {
    this.pageCache.clear();
    this.totalCount = undefined;
  }

  getStats(): {
    cachedPages: number;
    pageSize: number;
    totalCount?: number;
  } {
    return {
      cachedPages: this.pageCache.size,
      pageSize: this.pageSize,
      totalCount: this.totalCount
    };
  }
}

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
  private _documentPool: Map<number, Document> = new Map(); // Reuse Document instances
  private _cacheInvalidationGate = new Set<string>(); // Track what needs cache invalidation
  private _indexManager: IndexManager;

  constructor(
    storage: Storage, 
    name: string, 
    options: { cacheSize?: number; persistEmpty?: boolean; enableIndexing?: boolean } = {}
  ) {
    this._storage = storage;
    this._name = name;
    this._queryCache = new LRUCache(options.cacheSize ?? Table.defaultQueryCacheCapacity);
    this._indexManager = new IndexManager();

    if (options.persistEmpty) {
      this._updateTable(() => {});
    }

    // Build indexes from existing data if indexing is enabled
    if (options.enableIndexing !== false) {
      this._rebuildIndexes();
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

    const docData = document instanceof Document ? 
      document.toJSON() : 
      { ...document };

    this._updateTable((table) => {
      if (String(docId) in table) {
        throw new Error(`Document with ID ${docId} already exists`);
      }
      
      table[String(docId)] = docData;
    });

    // Update indexes
    this._indexManager.addDocument(docId, docData);

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

  // Paginated search for large result sets
  searchPaginated(
    cond: QueryLike<T>,
    page: number = 1,
    pageSize: number = 50
  ): PaginatedResult<Document> {
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 50;
    if (pageSize > 1000) pageSize = 1000; // Prevent excessive memory usage

    const allResults = this.search(cond);
    const totalCount = allResults.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const offset = (page - 1) * pageSize;
    const data = allResults.slice(offset, offset + pageSize);

    return {
      data,
      page,
      pageSize,
      totalCount,
      totalPages,
      hasMore: page < totalPages,
      nextPage: page < totalPages ? page + 1 : undefined,
      previousPage: page > 1 ? page - 1 : undefined
    };
  }

  // Get paginated results for all documents
  allPaginated(
    page: number = 1,
    pageSize: number = 50
  ): PaginatedResult<Document> {
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 50;
    if (pageSize > 1000) pageSize = 1000;

    const table = this._readTable();
    const entries = Object.entries(table);
    const totalCount = entries.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const offset = (page - 1) * pageSize;
    
    const data: Document[] = [];
    const pageEntries = entries.slice(offset, offset + pageSize);
    
    for (const [docIdStr, doc] of pageEntries) {
      const docId = Table.documentIdClass(docIdStr);
      data.push(this._getDocument(doc, docId));
    }

    return {
      data,
      page,
      pageSize,
      totalCount,
      totalPages,
      hasMore: page < totalPages,
      nextPage: page < totalPages ? page + 1 : undefined,
      previousPage: page > 1 ? page - 1 : undefined
    };
  }

  // Create a lazy iterator for efficient large dataset traversal
  lazy(
    condition?: QueryLike<T>,
    options: LazyIteratorOptions = {}
  ): LazyIterator<Document> {
    return new LazyIterator<Document>(this as any, condition, options);
  }

  // Parallel search for large datasets
  async searchParallel(
    cond: QueryLike<T>,
    options: ParallelQueryOptions = {}
  ): Promise<Document[]> {
    const chunkSize = options.chunkSize ?? 1000;
    const maxConcurrency = options.maxConcurrency ?? Math.min(4, Math.max(1, Math.floor(require('os').cpus().length / 2)));
    
    const table = this._readTable();
    const entries = Object.entries(table);
    
    if (entries.length <= chunkSize) {
      // Not worth parallelizing for small datasets
      return this.search(cond);
    }

    // Split data into chunks
    const chunks: Array<Array<[string, Record<string, any>]>> = [];
    for (let i = 0; i < entries.length; i += chunkSize) {
      chunks.push(entries.slice(i, i + chunkSize));
    }

    // Process chunks in parallel with concurrency limit
    const results: Document[] = [];
    const semaphore = new Semaphore(maxConcurrency);
    
    const processChunk = async (chunk: Array<[string, Record<string, any>]>): Promise<Document[]> => {
      await semaphore.acquire();
      try {
        const chunkResults: Document[] = [];
        
        for (const [docIdStr, doc] of chunk) {
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
            chunkResults.push(new Table.documentClass(doc, docId) as Document);
          }
        }
        
        return chunkResults;
      } finally {
        semaphore.release();
      }
    };

    // Execute all chunks in parallel
    const chunkPromises = chunks.map(processChunk);
    const chunkResults = await Promise.all(chunkPromises);
    
    // Flatten results
    for (const chunkResult of chunkResults) {
      results.push(...chunkResult);
    }

    return results;
  }

  // Parallel batch operations
  async updateParallel(
    updates: Array<{
      fields: Partial<T> | ((doc: Record<string, any>) => void);
      condition: QueryLike<T>;
    }>,
    options: ParallelQueryOptions = {}
  ): Promise<number[]> {
    const maxConcurrency = options.maxConcurrency ?? Math.min(4, Math.max(1, Math.floor(require('os').cpus().length / 2)));
    const semaphore = new Semaphore(maxConcurrency);
    const allUpdatedIds: number[] = [];

    const processUpdate = async (update: {
      fields: Partial<T> | ((doc: Record<string, any>) => void);
      condition: QueryLike<T>;
    }): Promise<number[]> => {
      await semaphore.acquire();
      try {
        return this.update(update.fields, update.condition);
      } finally {
        semaphore.release();
      }
    };

    // Execute updates in parallel
    const updatePromises = updates.map(processUpdate);
    const updateResults = await Promise.all(updatePromises);
    
    // Flatten results
    for (const result of updateResults) {
      allUpdatedIds.push(...result);
    }

    return allUpdatedIds;
  }

  // Parallel aggregation operations
  async aggregateParallel<R>(
    aggregator: (docs: Document[]) => R,
    combiner: (results: R[]) => R,
    condition?: QueryLike<T>,
    options: ParallelQueryOptions = {}
  ): Promise<R> {
    const chunkSize = options.chunkSize ?? 1000;
    const maxConcurrency = options.maxConcurrency ?? Math.min(4, Math.max(1, Math.floor(require('os').cpus().length / 2)));
    
    const table = this._readTable();
    const entries = Object.entries(table);
    
    if (entries.length <= chunkSize) {
      // Not worth parallelizing for small datasets
      const docs = condition ? this.search(condition) : this.all();
      return aggregator(docs);
    }

    // Split data into chunks
    const chunks: Array<Array<[string, Record<string, any>]>> = [];
    for (let i = 0; i < entries.length; i += chunkSize) {
      chunks.push(entries.slice(i, i + chunkSize));
    }

    const semaphore = new Semaphore(maxConcurrency);
    
    const processChunk = async (chunk: Array<[string, Record<string, any>]>): Promise<R> => {
      await semaphore.acquire();
      try {
        const chunkDocs: Document[] = [];
        
        for (const [docIdStr, doc] of chunk) {
          let include = true;
          
          if (condition) {
            try {
              if (typeof condition === 'function') {
                include = condition(doc);
              } else if (condition && typeof condition === 'object' && 'test' in condition) {
                include = (condition as any).test(doc);
              }
            } catch (error) {
              include = false;
            }
          }
          
          if (include) {
            const docId = Table.documentIdClass(docIdStr);
            chunkDocs.push(new Table.documentClass(doc, docId) as Document);
          }
        }
        
        return aggregator(chunkDocs);
      } finally {
        semaphore.release();
      }
    };

    // Execute all chunks in parallel
    const chunkPromises = chunks.map(processChunk);
    const chunkResults = await Promise.all(chunkPromises);
    
    // Combine results
    return combiner(chunkResults);
  }

  // Search for documents with index-aware optimization
  search(cond: QueryLike<T>): Document[] {
    // Check cache first
    const cacheKey = this._getCacheKey(cond);
    if (cacheKey) {
      const cached = this._queryCache.get(cacheKey);
      if (cached) {
        return cached.map(doc => this._cloneDocument(doc));
      }
    }

    // Try index-aware execution for QueryInstance objects
    if (cond && typeof cond === 'object' && 'test' in cond && typeof (cond as any)._hash !== 'undefined') {
      const queryInstance = cond as QueryInstance<T>;
      const results = this._executeIndexAwareQuery(queryInstance);
      
      // Cache results if cacheable and we got results from index
      if (results && cacheKey) {
        this._queryCache.set(cacheKey, results.map(doc => this._cloneDocument(doc)));
      }
      
      if (results) {
        return results;
      }
    }

    // Fallback to full table scan
    return this._executeFullScan(cond, cacheKey);
  }

  // Execute query using indexes when possible
  private _executeIndexAwareQuery(query: QueryInstance<T>): Document[] | null {
    try {
      const plan = this._indexManager.analyzeQuery(query);
      
      // Only use index if it's significantly more selective than full scan
      if (!plan.useIndex || plan.estimatedSelectivity > 0.5) {
        return null; // Fall back to full scan
      }

      const bitmap = this._indexManager.executeIndexQuery(plan);
      if (!bitmap || BitmapUtils.isEmpty(bitmap)) {
        return [];
      }

      // Convert bitmap to document results
      const docIds = BitmapUtils.toSet(bitmap);
      const table = this._readTable();
      const results: Document[] = [];

      for (const docId of docIds) {
        const doc = table[String(docId)];
        if (doc) {
          // Still need to verify the document matches the full query
          // since indexes might not cover all conditions
          try {
            if (query.test(doc)) {
              results.push(this._getDocument(doc, docId));
            }
          } catch (error) {
            // Skip documents that cause test errors
          }
        }
      }

      return results;
    } catch (error) {
      // If index execution fails, fall back to full scan
      return null;
    }
  }

  // Execute full table scan (original implementation)
  private _executeFullScan(cond: QueryLike<T>, cacheKey: string | null): Document[] {
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
          pooledArray.push(this._getDocument(doc, docId));
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
      return doc ? this._getDocument(doc, docId) : null;
    }

    if (docIds !== undefined) {
      const results: Document[] = [];
      const docIdSet = new Set(docIds.map(String));
      
      for (const [docIdStr, doc] of Object.entries(table)) {
        if (docIdSet.has(docIdStr)) {
          results.push(this._getDocument(doc, Table.documentIdClass(docIdStr)));
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
          return this._getDocument(doc, Table.documentIdClass(docIdStr));
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
    const oldDocuments = new Map<number, Record<string, any>>();

    // First pass: collect old documents for index updates
    const table = this._readTable();
    if (docIds !== undefined) {
      for (const docId of docIds) {
        const doc = table[String(docId)];
        if (doc) {
          oldDocuments.set(docId, { ...doc });
        }
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
          oldDocuments.set(docId, { ...doc });
        }
      }
    } else {
      // Update all documents
      for (const [docIdStr, doc] of Object.entries(table)) {
        const docId = Table.documentIdClass(docIdStr);
        oldDocuments.set(docId, { ...doc });
      }
    }

    const performUpdate = typeof fields === 'function' ? 
      (doc: Record<string, any>) => fields(doc) :
      (doc: Record<string, any>) => Object.assign(doc, fields);

    // Second pass: perform updates
    this._updateTable((table) => {
      for (const [docId, oldDoc] of oldDocuments) {
        const doc = table[String(docId)];
        if (doc) {
          performUpdate(doc);
          updatedIds.push(docId);
          
          // Update indexes
          this._indexManager.updateDocument(docId, oldDoc, doc);
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
    const removedDocs = new Map<number, Record<string, any>>();

    // First collect documents to remove for index updates
    const table = this._readTable();
    
    if (docIds !== undefined) {
      for (const docId of docIds) {
        const doc = table[String(docId)];
        if (doc) {
          removedDocs.set(docId, doc);
        }
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
          removedDocs.set(docId, doc);
        }
      }
    } else {
      throw new Error('Use truncate() to remove all documents');
    }

    // Remove from table and indexes
    this._updateTable((table) => {
      for (const [docId, doc] of removedDocs) {
        delete table[String(docId)];
        removedIds.push(docId);
        
        // Update indexes
        this._indexManager.removeDocument(docId, doc);
      }
    });

    return removedIds;
  }

  // Clear all documents
  truncate(): void {
    this._updateTable((table) => {
      for (const key of Object.keys(table)) {
        delete table[key];
      }
    });
    this._nextId = null;
    
    // Clear all indexes
    this._indexManager.clearAllIndexes();
  }

  // Count documents
  count(cond: QueryLike<T>): number {
    return this.search(cond).length;
  }

  // Clear query cache
  clearCache(): void {
    this._queryCache.clear();
  }

  // Selective cache clearing for better performance with gating
  private _selectiveClearCache(cacheKey?: string): void {
    if (cacheKey && !this._cacheInvalidationGate.has(cacheKey)) {
      // Skip cache invalidation if this condition hasn't changed
      return;
    }
    
    if (cacheKey) {
      // Only clear specific cache entry
      this._queryCache.delete(cacheKey);
      this._cacheInvalidationGate.delete(cacheKey);
    } else {
      // Clear all cache - happens on structural changes
      this._queryCache.clear();
      this._cacheInvalidationGate.clear();
    }
  }

  // Mark condition for cache invalidation
  private _markForInvalidation(condition: QueryLike<T>): void {
    const cacheKey = this._getCacheKey(condition);
    if (cacheKey) {
      this._cacheInvalidationGate.add(cacheKey);
    }
  }

  // Optimized document creation with pooling
  private _getDocument(docData: Record<string, any>, docId: number): Document {
    // Check if we have a pooled document for this docId
    let doc = this._documentPool.get(docId);
    if (doc) {
      // Update the existing document properties
      Object.assign(doc, docData);
      return doc;
    }
    
    // Create new document and pool it
    doc = new Table.documentClass(docData, docId) as Document;
    this._documentPool.set(docId, doc);
    return doc;
  }

  // Clean up document pool periodically
  private _cleanDocumentPool(): void {
    if (this._documentPool.size > 1000) { // Limit pool size
      const table = this._readTable();
      const validIds = new Set(Object.keys(table).map(Number));
      
      for (const [docId] of this._documentPool) {
        if (!validIds.has(docId)) {
          this._documentPool.delete(docId);
        }
      }
    }
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
      yield this._getDocument(doc, docId);
    }
    
    // Periodic cleanup of document pool
    this._cleanDocumentPool();
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
    // Check if MemoryStorage supports delta operations
    if (this._storage.constructor.name === 'MemoryStorage' && (this._storage as any).updateDocument) {
      this._performDeltaUpdate(updater);
    } else if ((this._storage as any).writeBatch && (this._storage as any).supportsFeature && (this._storage as any).supportsFeature('batch')) {
      this._performBatchUpdate(updater);
    } else if ((this._storage as any).supportsFeature && (this._storage as any).supportsFeature('batch')) {
      this._performSelectiveUpdate(updater);
    } else {
      this._performFullUpdate(updater);
    }
    
    // Clear cache selectively for better performance - no specific key means clear all
    this._selectiveClearCache();
  }

  private _performBatchUpdate(updater: (table: Record<string, Record<string, any>>) => void): void {
    const tables = this._storage.read() || {};
    const originalTable = (tables[this._name] as Record<string, Record<string, any>>) || {};
    const table = { ...originalTable }; // Create a copy for batching
    
    updater(table);
    
    // Use batch write for WAL storage
    tables[this._name] = table;
    (this._storage as any).writeBatch([{ type: 'write', data: tables }]);
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

  private _performDeltaUpdate(updater: (table: Record<string, Record<string, any>>) => void): void {
    // Create a proxy table that captures changes
    const tables = this._storage.read() || {};
    const originalTable = (tables[this._name] as Record<string, Record<string, any>>) || {};
    const changes = new Map<string, any>();
    
    // Create proxy to track changes
    const proxyTable = new Proxy(originalTable, {
      set: (target, prop, value) => {
        if (typeof prop === 'string') {
          changes.set(prop, value);
        }
        return Reflect.set(target, prop, value);
      },
      deleteProperty: (target, prop) => {
        if (typeof prop === 'string') {
          changes.set(prop, null); // Mark for deletion
        }
        return Reflect.deleteProperty(target, prop);
      }
    });
    
    // Apply the updater
    updater(proxyTable);
    
    // Apply changes through MemoryStorage delta system
    const memStorage = this._storage as any;
    for (const [docId, value] of changes) {
      if (value === null) {
        memStorage.deleteDocument(this._name, docId);
      } else {
        memStorage.updateDocument(this._name, docId, value);
      }
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

  // Rebuild all indexes from current data
  private _rebuildIndexes(): void {
    const table = this._readTable();
    const documents: Array<{ docId: number; doc: Record<string, any> }> = [];
    
    for (const [docIdStr, doc] of Object.entries(table)) {
      const docId = Table.documentIdClass(docIdStr);
      documents.push({ docId, doc });
    }

    // Get all unique field names
    const fieldNames = new Set<string>();
    for (const { doc } of documents) {
      for (const field of Object.keys(doc)) {
        fieldNames.add(field);
      }
    }

    // Rebuild index for each field
    for (const fieldName of fieldNames) {
      this._indexManager.rebuildIndex(fieldName, documents);
    }
  }

  // Public method to rebuild indexes for specific field
  rebuildIndex(fieldName: string): void {
    const table = this._readTable();
    const documents: Array<{ docId: number; doc: Record<string, any> }> = [];
    
    for (const [docIdStr, doc] of Object.entries(table)) {
      const docId = Table.documentIdClass(docIdStr);
      documents.push({ docId, doc });
    }

    this._indexManager.rebuildIndex(fieldName, documents);
  }

  // Get available indexes
  getAvailableIndexes(): string[] {
    return this._indexManager.getAvailableIndexes();
  }

  // Get index statistics
  getIndexStats(fieldName?: string): any {
    if (fieldName) {
      return this._indexManager.getIndexStats(fieldName);
    }
    
    const stats: Record<string, any> = {};
    for (const field of this._indexManager.getAvailableIndexes()) {
      stats[field] = this._indexManager.getIndexStats(field);
    }
    return stats;
  }

  // Enable/disable indexing for new documents
  setIndexingEnabled(enabled: boolean): void {
    if (!enabled) {
      this._indexManager.clearAllIndexes();
    } else {
      this._rebuildIndexes();
    }
  }

  // Create index for specific field (explicit index creation)
  createIndex(fieldName: string): void {
    this.rebuildIndex(fieldName);
  }

  // Drop index for specific field
  dropIndex(fieldName: string): void {
    // Note: IndexManager doesn't expose a dropIndex method yet
    // This would need to be implemented in IndexManager
    console.warn(`Drop index not implemented for field: ${fieldName}`);
  }

  // String representation
  toString(): string {
    return `<Table name='${this._name}', total=${this.length}, storage=${this._storage}>`;
  }
}

// Semaphore for controlling concurrency
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const next = this.waitQueue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }

  getAvailable(): number {
    return this.permits;
  }

  getWaiting(): number {
    return this.waitQueue.length;
  }
}