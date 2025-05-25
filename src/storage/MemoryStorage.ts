import type {
    Storage,
    IndexDefinition,
    VectorIndexDefinition,
} from './Storage';
import type { JsonObject } from '../utils/types';
import {
    VectorUtils,
    type Vector,
    type VectorSearchResult,
    type VectorIndex,
} from '../utils/VectorUtils';
import { ObjectPool } from '../utils/ObjectPool';

export class MemoryStorage implements Storage {
    private data: JsonObject = {};
    private indexes: Map<string, IndexDefinition> = new Map();
    private indexedData: Map<string, Map<string, Set<string>>> = new Map(); // indexName -> value -> docIds
    private vectorIndexes: Map<string, VectorIndexDefinition> = new Map();
    private vectorData: Map<string, VectorIndex> = new Map(); // indexName -> vector index

    // Delta log for in-place updates
    private deltaLog: Map<string, Map<string, any>> = new Map(); // tableName -> docId -> changes
    private batchPending = false;
    private batchFlushTimeout: NodeJS.Timeout | null = null;
    private readonly BATCH_FLUSH_DELAY = 50; // ms - increased for better batching
    private readonly MAX_BATCH_SIZE = 1000; // Force flush at size limit
    private currentBatchSize = 0;

    // Object pools for memory efficiency
    private docPool = new ObjectPool<Record<string, any>>({
        maxSize: 100,
        factory: () => ({}),
        reset: (obj) => {
            for (const key in obj) {
                delete obj[key];
            }
        },
    });

    private changesPool = new ObjectPool<Record<string, any>>({
        maxSize: 100,
        factory: () => ({}),
        reset: (obj) => {
            for (const key in obj) {
                delete obj[key];
            }
        },
    });

    constructor() {
        // Initialize with empty data
        this.data = {};
        this.deltaLog = new Map();
    }

    write(obj: JsonObject): void {
        this.data = obj;
        this.flushDeltas(); // Ensure deltas are applied
        // Rebuild indexes after write
        this.rebuildIndexes();
        this.rebuildVectorIndexes();
    }

    async createIndex(
        tableName: string,
        field: string,
        options?: { unique?: boolean }
    ): Promise<void> {
        const indexName = `${tableName}_${field}`;
        const indexDef: IndexDefinition = {
            tableName,
            fields: [field],
            unique: options?.unique ?? false,
            compound: false,
            name: indexName,
        };

        this.indexes.set(indexName, indexDef);
        this.buildSingleIndex(indexDef);
    }

    async createCompoundIndex(
        tableName: string,
        fields: string[],
        options?: { unique?: boolean; name?: string }
    ): Promise<void> {
        const indexName = options?.name || `${tableName}_${fields.join('_')}`;
        const indexDef: IndexDefinition = {
            tableName,
            fields,
            unique: options?.unique ?? false,
            compound: true,
            name: indexName,
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
            (index) => !tableName || index.tableName === tableName
        );
    }

    async checkUnique(
        tableName: string,
        field: string,
        value: any,
        excludeDocId?: string
    ): Promise<boolean> {
        const table = this.data[tableName];
        if (!table || typeof table !== 'object') return true;

        for (const [docId, doc] of Object.entries(table)) {
            if (excludeDocId && docId === excludeDocId) continue;
            if (
                typeof doc === 'object' &&
                doc !== null &&
                (doc as any)[field] === value
            ) {
                return false;
            }
        }
        return true;
    }

    async checkCompoundUnique(
        tableName: string,
        fields: string[],
        values: any[],
        excludeDocId?: string
    ): Promise<boolean> {
        const table = this.data[tableName];
        if (!table || typeof table !== 'object') return true;

        for (const [docId, doc] of Object.entries(table)) {
            if (excludeDocId && docId === excludeDocId) continue;
            if (typeof doc === 'object' && doc !== null) {
                const docValues = fields.map((field) => (doc as any)[field]);
                if (JSON.stringify(docValues) === JSON.stringify(values)) {
                    return false;
                }
            }
        }
        return true;
    }

    async createVectorIndex(
        tableName: string,
        field: string,
        dimensions: number,
        algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine'
    ): Promise<void> {
        const indexName = `${tableName}_${field}_vector`;
        const indexDef: VectorIndexDefinition = {
            tableName,
            field,
            dimensions,
            algorithm,
            name: indexName,
        };

        this.vectorIndexes.set(indexName, indexDef);
        this.buildVectorIndex(indexDef);
    }

    async dropVectorIndex(tableName: string, indexName: string): Promise<void> {
        this.vectorIndexes.delete(indexName);
        this.vectorData.delete(indexName);
    }

    async listVectorIndexes(
        tableName?: string
    ): Promise<VectorIndexDefinition[]> {
        return Array.from(this.vectorIndexes.values()).filter(
            (index) => !tableName || index.tableName === tableName
        );
    }

    async vectorSearch(
        tableName: string,
        field: string,
        queryVector: Vector,
        options?: { limit?: number; threshold?: number }
    ): Promise<VectorSearchResult[]> {
        const indexName = `${tableName}_${field}_vector`;
        const vectorIndex = this.vectorData.get(indexName);

        if (!vectorIndex) {
            throw new Error(
                `Vector index not found for table '${tableName}', field '${field}'`
            );
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

        return searchResults.map((result) => ({
            docId: result.docId,
            score: result.score,
            document: (table as any)[result.docId],
        }));
    }

    supportsFeature(
        feature:
            | 'compoundIndex'
            | 'batch'
            | 'tx'
            | 'async'
            | 'fileLocking'
            | 'vectorSearch'
    ): boolean {
        return ['compoundIndex', 'async', 'vectorSearch'].includes(feature);
    }

    private buildSingleIndex(indexDef: IndexDefinition): void {
        const indexData = new Map<string, Set<string>>();
        const table = this.data[indexDef.tableName];

        if (table && typeof table === 'object') {
            for (const [docId, doc] of Object.entries(table)) {
                if (typeof doc === 'object' && doc !== null) {
                    const indexKey = this.getIndexKey(
                        doc as any,
                        indexDef.fields
                    );
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
        const values = fields.map((field) => doc[field]);
        if (values.some((v) => v === undefined || v === null)) return null;
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
                            VectorUtils.addToIndex(
                                vectorIndex,
                                docId,
                                vectorValue
                            );
                        } catch (error) {
                            console.warn(
                                `Skipping invalid vector for doc ${docId}: ${error}`
                            );
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

    // Delta log methods for in-place updates
    private addToDelta(tableName: string, docId: string, changes: any): void {
        if (!this.deltaLog.has(tableName)) {
            this.deltaLog.set(tableName, new Map());
        }

        const tableDeltas = this.deltaLog.get(tableName)!;
        if (tableDeltas.has(docId)) {
            if (changes === null) {
                // Mark for deletion - override any existing changes
                tableDeltas.set(docId, null);
            } else {
                // Merge with existing changes
                Object.assign(tableDeltas.get(docId)!, changes);
            }
        } else {
            if (changes === null) {
                // Mark for deletion
                tableDeltas.set(docId, null);
            } else {
                // Use pooled object for changes - hand-rolled copy
                const pooledChanges = this.changesPool.borrow();
                for (const k in changes) {
                    pooledChanges[k] = changes[k];
                }
                tableDeltas.set(docId, pooledChanges);
            }
            this.currentBatchSize++;
        }

        // Force flush if batch size limit reached
        if (this.currentBatchSize >= this.MAX_BATCH_SIZE) {
            this.flushDeltas();
            return;
        }

        // Schedule flush if not already pending
        if (!this.batchPending) {
            this.batchPending = true;
            this.batchFlushTimeout = setTimeout(
                () => this.flushDeltas(),
                this.BATCH_FLUSH_DELAY
            );
        }
    }

    private flushDeltas(): void {
        if (this.batchFlushTimeout) {
            clearTimeout(this.batchFlushTimeout);
            this.batchFlushTimeout = null;
        }

        if (this.deltaLog.size === 0) {
            this.batchPending = false;
            this.currentBatchSize = 0;
            return;
        }

        // Track which indexes need updating
        const indexesToUpdate = new Set<string>();

        // Apply all deltas to the main data structure
        for (const [tableName, tableDeltas] of this.deltaLog) {
            if (!this.data[tableName]) {
                this.data[tableName] = {};
            }

            const table = this.data[tableName] as JsonObject;
            for (const [docId, changes] of tableDeltas) {
                const oldDoc = table[docId];

                if (changes === null) {
                    // Deletion
                    delete table[docId];
                } else {
                    // Update/Insert - hand-rolled loop for performance
                    if (!table[docId]) {
                        table[docId] = {};
                    }
                    const doc = table[docId] as any;
                    for (const k in changes) {
                        doc[k] = changes[k];
                    }
                }

                // Update indexes immediately for write-through
                this.updateIndexesForDocument(
                    tableName,
                    docId,
                    oldDoc,
                    table[docId]
                );
            }
        }

        // Return pooled objects and clear deltas
        for (const [tableName, tableDeltas] of this.deltaLog) {
            for (const [docId, changes] of tableDeltas) {
                if (changes !== null && typeof changes === 'object') {
                    this.changesPool.return(changes);
                }
            }
        }

        this.deltaLog.clear();
        this.batchPending = false;
        this.currentBatchSize = 0;
    }

    // Override write operations to use delta log
    updateDocument(tableName: string, docId: string, changes: any): void {
        this.addToDelta(tableName, docId, changes);
    }

    deleteDocument(tableName: string, docId: string): void {
        this.addToDelta(tableName, docId, null);
    }

    insertDocument(tableName: string, docId: string, document: any): void {
        this.addToDelta(tableName, docId, document);
    }

    // Override read to include deltas
    read(): JsonObject | null {
        // Flush any pending deltas before read
        this.flushDeltas();
        return this.data;
    }

    close(): void {
        // Flush any pending deltas before closing
        this.flushDeltas();
        if (this.batchFlushTimeout) {
            clearTimeout(this.batchFlushTimeout);
        }

        // Clear object pools
        this.docPool.clear();
        this.changesPool.clear();
    }

    // Write-through index update method - optimized hot path
    private updateIndexesForDocument(
        tableName: string,
        docId: string,
        oldDoc: any,
        newDoc: any
    ): void {
        for (const indexDef of this.indexes.values()) {
            if (indexDef.tableName !== tableName) continue;

            const indexName = indexDef.name!;
            const idx = this.indexedData.get(indexName); // Hoist Map lookup
            if (!idx) continue;

            // Inline single-field index key generation for common case
            let oldKey: string | null = null;
            let newKey: string | null = null;

            if (indexDef.fields.length === 1) {
                // Fast path for single field indexes
                const field = indexDef.fields[0];
                const oldValue = oldDoc?.[field];
                const newValue = newDoc?.[field];

                oldKey =
                    oldValue !== undefined && oldValue !== null
                        ? JSON.stringify([oldValue])
                        : null;
                newKey =
                    newValue !== undefined && newValue !== null
                        ? JSON.stringify([newValue])
                        : null;
            } else {
                // Fallback to general case
                oldKey = oldDoc
                    ? this.getIndexKey(oldDoc, indexDef.fields)
                    : null;
                newKey = newDoc
                    ? this.getIndexKey(newDoc, indexDef.fields)
                    : null;
            }

            // Remove from old key
            if (oldKey !== null && idx.has(oldKey)) {
                const docIds = idx.get(oldKey)!;
                docIds.delete(docId);
                if (docIds.size === 0) {
                    idx.delete(oldKey);
                }
            }

            // Add to new key
            if (newKey !== null) {
                if (!idx.has(newKey)) {
                    idx.set(newKey, new Set());
                }
                idx.get(newKey)!.add(docId);
            }
        }
    }
}
